// [accounts] 칭호용 기록 — 보상과 무관한 통계만. 서버가 웹소켓 위치로 직접 잰다(클라이언트가 보낸 거리를 믿지 않음).
// 수단별 속도 상한 (m/s).
//   MODE_CAP_MPS     — MOVE_CREDIT_V2="0" 롤백용. plan.html §2 실측: 걷기 4.62, 따릉이 9.5, 로드 55km/h, 슈퍼 297km/h, 트럭 275km/h.
//   MODE_CAP_V2_MPS  — 기본. 게임 최고속에 맞춘 인정 상한(src/game.js · 선물 탈것). 이 값 근처의 평활 속도를 넘으면 그 초는 인정하지 않는다.
//     걷기/쉬프트 9 m/s, 공유 자전거 부스트 13.5, CR·1 50 km/h, 슈퍼바이크 303 km/h, 트럭 부스트 280 km/h, 택시 100 km/h.
//     여유는 수신 시각이 ±15ms 흔들려도 정상 주행이 과속으로 잘리지 않게 한 것이다. 걷기 30 m/s 처럼 이어지는 과속은 0초.
// 이 파일은 cloudflare:workers 를 가져오지 않는다.
import { kstDate } from "./flags.js";
import { MOVE } from "./econ.js"; // [economy] 인정 이동 시간(보상용) 조건

export const MODE_CAP_MPS = Object.freeze({
  walk: 4.62,
  bike: 9.5,
  roadbike: 15.3, // 55 km/h
  superbike: 82.5, // 297 km/h
  truck: 76.4, // 275 km/h
  bus: 20,
  taxi: 25,
});
/** v2 인정 속도 상한 (m/s). 평활 속도가 이 값의 1.06배를 넘으면 그 초는 버린다. */
export const MODE_CAP_V2_MPS = Object.freeze({
  walk: 10.2, // 쉬프트 달리기 9
  bike: 15.1, // 공유 자전거 부스트 13.5
  roadbike: 15.5, // CR·1 50 km/h = 13.9
  superbike: 89, // 303 km/h = 84.2
  truck: 82, // 부스트 280 km/h = 77.8
  bus: 20,
  taxi: 29.5, // 호출 택시 100 km/h
});
export const MODES = Object.keys(MODE_CAP_MPS);
const GAP_SEC = 5; // 이보다 오래 소식이 없으면 그 공백 구간만 버림 (v2는 이미 검증된 초를 남긴다)
export const TELEPORT_M = 50; // 한 번에 이만큼 넘게 + 상한 1.5배 넘게 움직이면 순간이동으로 보고 버림
const IDLE_M = 0.05;
const ADMIN_VEH = new Set([900, 901]);
// v2: 시작점(또는 직전 인정 지점)에서 이만큼 벗어나야 그 사이 초를 인정한다. 3m 제자리 왕복은 여기 못 닿는다.
const CREDIT_LEG_M = 12;
// 공백·자리비움·연결 끝에서, 효율이 좋은 짧은 꼬리(직선에 가까운 이동)만 남긴다.
const CREDIT_TAIL_M = 4;
const CREDIT_EFF = 0.5;

/**
 * room.js 의 state 메시지에서 이동 수단을 고른다. null = 세지 않음.
 * @param {object} s  { riding, sit, afk, veh, zone }
 * @param {(veh:number)=>string|null} vehMode  선물 탈것 id → 'roadbike' | 'superbike' | null
 */
export function classifyMode(s, vehMode = () => null) {
  if (!s || s.afk) return null;
  if (s.zone) return null; // 지하철 구간(빨리감기) — 아직 안 셈
  const sit = typeof s.sit === "string" ? s.sit : "";
  if (sit.startsWith("bus:")) return "bus";
  if (sit.startsWith("taxi:")) return "taxi";
  if (sit) return null; // 벤치 등에 앉음
  const veh = Number(s.veh);
  if (Number.isFinite(veh) && veh > 0) {
    if (ADMIN_VEH.has(veh)) return null;
    return vehMode(veh) || "truck";
  }
  if (s.riding) return "bike";
  return "walk";
}

/** 웹소켓 하나의 이동 누적기. 메모리는 수단당 숫자 몇 개. */
export class MoveStats {
  /**
   * @param {{ v2?: boolean }} [opts]  v2 기본 true. false 면 60초 순변위 창(MOVE_CREDIT_V2=0).
   */
  constructor(opts = {}) {
    this.v2 = opts.v2 !== false;
    this.last = null; // { x, z, t, mode }
    this.acc = new Map(); // `${date}|${mode}` → { m, s, cs }  (cs = [economy] 인정 초, 보상용)
    this.dropped = { teleport: 0, gap: 0, fast: 0, idleWin: 0 };
    this.win = null; // 레거시 { x, z, t, pend } — 60초 창의 순변위
    this.cred = null; // v2 { x, z, key, pending, path, span }
    this.speedRing = []; // v2 최근 ~1초 { d, dt } — 한 틱 지터로 과속을 내지 않음
  }

  #capOf(mode) {
    return (this.v2 ? MODE_CAP_V2_MPS : MODE_CAP_MPS)[mode] || 0;
  }

  #addCs(key, sec) {
    if (!(sec > 0) || !key) return;
    const cur = this.acc.get(key) || { m: 0, s: 0, cs: 0 };
    cur.cs = (cur.cs || 0) + sec;
    this.acc.set(key, cur);
  }

  // ── 레거시: 60초 창. 순변위가 부족하면 보류한 초를 통째로 버린다. ──
  #closeWindow(x, z, now, force = false) {
    const w = this.win;
    if (!w) return;
    if (!force && now - w.t < MOVE.windowSec * 1000) return;
    if (Math.hypot(x - w.x, z - w.z) >= MOVE.windowMinNetM) {
      for (const [key, sec] of w.pend) this.#addCs(key, sec);
    } else if (w.pend.size) this.dropped.idleWin++;
    this.win = { x, z, t: now, pend: new Map() };
  }

  #resetWindow(x, z, now) {
    this.win = Number.isFinite(x) ? { x, z, t: now, pend: new Map() } : null;
  }

  /**
   * v2: 직전 인정 지점에서 CREDIT_LEG_M 이상 벗어나고, 그 사이 길이의 절반 이상이 순변위일 때만 초를 확정한다.
   * 이미 acc 에 넣은 초는 건드리지 않는다. 공백·자리비움은 효율 좋은 꼬리만 남기고 공백 자체는 더하지 않는다.
   */
  #commitCreditTail() {
    const c = this.cred;
    if (!c || !(c.pending > 0)) return;
    if (c.span >= CREDIT_TAIL_M && c.path > 0 && c.span >= c.path * CREDIT_EFF) {
      this.#addCs(c.key, c.pending);
      c.pending = 0;
      c.path = 0;
      c.span = 0;
      if (this.last) { c.x = this.last.x; c.z = this.last.z; }
    }
  }

  #resetCredit(x, z) {
    this.speedRing = [];
    this.cred = Number.isFinite(x) ? { x, z, key: null, pending: 0, path: 0, span: 0 } : null;
  }

  /** 최근 약 1초의 속도로 판정한다. 창이 차기 전에는 한 틱에만 조금 더 여유를 준다. */
  #speedOk(d, dt, cap) {
    this.speedRing.push({ d, dt });
    let sumT = 0;
    for (const s of this.speedRing) sumT += s.dt;
    while (this.speedRing.length > 3 && sumT > 1.15) sumT -= this.speedRing.shift().dt;
    let sumD = 0;
    sumT = 0;
    for (const s of this.speedRing) { sumD += s.d; sumT += s.dt; }
    const inst = dt > 0 ? d / dt : Infinity;
    if (sumT >= 0.5) return sumD / sumT <= cap * 1.06;
    return inst <= cap * 1.22;
  }

  #noteCredit(key, d, dt, x, z, ok) {
    if (!ok) { this.dropped.fast++; return; }
    if (!this.cred) this.cred = { x, z, key, pending: 0, path: 0, span: 0 };
    const c = this.cred;
    c.pending += dt;
    c.path += d;
    c.span = Math.hypot(x - c.x, z - c.z);
    c.key = key;
    if (c.span >= CREDIT_LEG_M && c.path > 0 && c.span >= c.path * CREDIT_EFF) {
      this.#addCs(key, c.pending);
      c.pending = 0;
      c.path = 0;
      c.span = 0;
      c.x = x;
      c.z = z;
    }
  }

  /** @returns {number} 이번에 센 거리(m). v2 가 아니면 예전 60초 창. */
  push(sample) {
    if (!this.v2) return this.#pushLegacy(sample);
    return this.#pushV2(sample);
  }

  #pushLegacy({ x, z, mode, now = Date.now() }) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const prev = this.last;
    if (prev && now - prev.t < MOVE.minSampleMs) return 0;
    this.last = { x, z, t: now, mode };
    if (!prev || !mode || prev.mode !== mode) { this.#resetWindow(x, z, now); return 0; }
    const dt = (now - prev.t) / 1000;
    if (!(dt > 0)) return 0;
    if (dt > GAP_SEC) { this.dropped.gap++; this.#resetWindow(x, z, now); return 0; }
    const d = Math.hypot(x - prev.x, z - prev.z);
    if (d < IDLE_M) { this.#closeWindow(x, z, now); return 0; }
    const cap = MODE_CAP_MPS[mode] || 0;
    if (!cap) return 0;
    if (d > Math.max(TELEPORT_M, cap * dt * 1.5)) { this.dropped.teleport++; this.#resetWindow(x, z, now); return 0; }
    const counted = Math.min(d, cap * dt);
    const key = `${kstDate(now)}|${mode}`;
    const cur = this.acc.get(key) || { m: 0, s: 0, cs: 0 };
    cur.m += counted;
    cur.s += dt;
    this.acc.set(key, cur);
    if (!this.win) this.#resetWindow(prev.x, prev.z, prev.t);
    if (d <= cap * dt * 1.02) this.win.pend.set(key, (this.win.pend.get(key) || 0) + dt);
    else this.dropped.fast++;
    this.#closeWindow(x, z, now);
    return counted;
  }

  #pushV2({ x, z, mode, now = Date.now() }) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const prev = this.last;
    // 표본 간격 하한. 너무 촘촘한 표본은 통째로 무시(직전 표본 유지) — 연결이 여러 개여도 한 소켓 안에서는 여기서 걸린다.
    if (prev && now - prev.t < MOVE.minSampleMs) return 0;
    this.last = { x, z, t: now, mode };
    if (!prev || !mode || prev.mode !== mode) {
      this.#commitCreditTail();
      this.#resetCredit(mode ? x : NaN, mode ? z : NaN);
      return 0;
    }
    const dt = (now - prev.t) / 1000;
    if (!(dt > 0)) return 0;
    if (dt > GAP_SEC) {
      this.dropped.gap++;
      this.#commitCreditTail();
      this.#resetCredit(x, z);
      return 0;
    }
    const d = Math.hypot(x - prev.x, z - prev.z);
    if (d < IDLE_M) return 0; // 서 있음. 이미 인정된 초는 그대로 두고, 이 초만 빼 둔다.
    const cap = this.#capOf(mode);
    if (!cap) return 0;
    if (d > Math.max(TELEPORT_M, cap * dt * 1.5)) {
      this.dropped.teleport++;
      this.#commitCreditTail();
      this.#resetCredit(x, z);
      return 0;
    }
    const counted = Math.min(d, cap * 1.06 * dt);
    const key = `${kstDate(now)}|${mode}`;
    const cur = this.acc.get(key) || { m: 0, s: 0, cs: 0 };
    cur.m += counted;
    cur.s += dt;
    this.acc.set(key, cur);
    this.#noteCredit(key, d, dt, x, z, this.#speedOk(d, dt, cap));
    return counted;
  }

  /** 정수 m·초만 떼어 내고 소수점 나머지는 다음 번으로 남긴다. cs = 인정 초(보상용). */
  drain() {
    if (this.v2) this.#commitCreditTail();
    const rows = [];
    for (const [key, v] of this.acc) {
      const m = Math.floor(v.m);
      const s = Math.floor(v.s);
      const cs = Math.floor(v.cs || 0);
      if (m <= 0 && s <= 0 && cs <= 0) continue;
      const [date, mode] = key.split("|");
      rows.push({ date, mode, m, s, cs });
      v.m -= m;
      v.s -= s;
      v.cs = (v.cs || 0) - cs;
    }
    for (const [key, v] of this.acc) if (v.m < 1 && v.s < 1 && (v.cs || 0) < 1 && !key.startsWith(kstDate())) this.acc.delete(key);
    return rows;
  }

  /** 연결이 끝날 때. v2 는 효율 좋은 꼬리만 인정하고, 레거시는 순변위 조건으로 창을 닫는다. */
  finish() {
    if (this.v2) { this.#commitCreditTail(); return; }
    if (this.last && this.win) this.#closeWindow(this.last.x, this.last.z, this.last.t, true);
  }

  toJSON() {
    return { acc: [...this.acc.entries()] };
  }

  static from(json) {
    const ms = new MoveStats();
    if (Array.isArray(json?.acc)) for (const [k, v] of json.acc.slice(0, 32)) ms.acc.set(String(k), { m: +v?.m || 0, s: +v?.s || 0, cs: +v?.cs || 0 });
    return ms;
  }
}

export async function flushMoves(db, accountId, rows, now = Date.now()) {
  if (!db || !accountId || !rows?.length) return 0;
  const stmts = [];
  for (const r of rows) {
    if (!MODE_CAP_MPS[r.mode]) continue;
    stmts.push(
      db.prepare(
        `INSERT INTO stat_mode_totals (account_id, mode, distance_m, seconds, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(account_id, mode) DO UPDATE SET
           distance_m = stat_mode_totals.distance_m + excluded.distance_m,
           seconds = stat_mode_totals.seconds + excluded.seconds,
           updated_at = excluded.updated_at`,
      ).bind(accountId, r.mode, r.m | 0, r.s | 0, now),
      db.prepare(
        `INSERT INTO stat_mode_daily (account_id, kst_date, mode, distance_m, seconds) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(account_id, kst_date, mode) DO UPDATE SET
           distance_m = stat_mode_daily.distance_m + excluded.distance_m,
           seconds = stat_mode_daily.seconds + excluded.seconds`,
      ).bind(accountId, r.date, r.mode, r.m | 0, r.s | 0),
    );
  }
  if (stmts.length) await db.batch(stmts);
  // [economy] 인정 초는 0002 마이그레이션의 별도 표에 따로 쓴다(표가 아직 없어도 위 통계는 이미 들어감).
  const credit = rows.filter((r) => MODE_CAP_MPS[r.mode] && (r.cs | 0) > 0);
  if (credit.length) {
    try {
      await db.batch(credit.map((r) =>
        db.prepare(
          `INSERT INTO stat_credit_daily (account_id, kst_date, mode, credited_sec) VALUES (?, ?, ?, ?)
           ON CONFLICT(account_id, kst_date, mode) DO UPDATE SET credited_sec = stat_credit_daily.credited_sec + excluded.credited_sec`,
        ).bind(accountId, r.date, r.mode, r.cs | 0)));
    } catch { /* 0002 미적용 — 보상용 인정 초만 빠짐 */ }
  }
  return stmts.length / 2;
}

export async function logLoginDay(db, accountId, now = Date.now()) {
  if (!db || !accountId) return;
  await db
    .prepare("INSERT INTO login_days (account_id, kst_date, first_at) VALUES (?, ?, ?) ON CONFLICT(account_id, kst_date) DO NOTHING")
    .bind(accountId, kstDate(now), now)
    .run();
}

/** 사진이 새로 저장됐을 때 (중복 저장 제외). point_id 는 포토 포인트가 정해지면 채운다. */
export async function logPhoto(db, accountId, photo, now = Date.now()) {
  if (!db || !accountId || !photo?.id) return;
  const ix = Number.isFinite(+photo.x) ? Math.round(+photo.x) : null;
  const iz = Number.isFinite(+photo.z) ? Math.round(+photo.z) : null;
  await db
    .prepare(
      `INSERT INTO photo_point_log (account_id, photo_id, point_id, region, x, z, kst_date, created_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?) ON CONFLICT(account_id, photo_id) DO NOTHING`,
    )
    .bind(accountId, String(photo.id).slice(0, 80), photo.region ? String(photo.region).slice(0, 32) : null, ix, iz, kstDate(now), now)
    .run();
}

export async function statsSummary(db, accountId) {
  const [modes, days, photos] = await db.batch([
    db.prepare("SELECT mode, distance_m, seconds FROM stat_mode_totals WHERE account_id = ? ORDER BY mode").bind(accountId),
    db.prepare("SELECT COUNT(*) AS n FROM login_days WHERE account_id = ?").bind(accountId),
    db.prepare("SELECT COUNT(*) AS n FROM photo_point_log WHERE account_id = ?").bind(accountId),
  ]);
  return {
    modes: (modes?.results || []).map((r) => ({ mode: r.mode, m: r.distance_m, s: r.seconds })),
    loginDays: Number(days?.results?.[0]?.n || 0),
    photos: Number(photos?.results?.[0]?.n || 0),
  };
}
