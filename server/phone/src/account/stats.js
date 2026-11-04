// [accounts] 칭호용 기록 — 보상과 무관한 통계만. 서버가 웹소켓 위치로 직접 잰다(클라이언트가 보낸 거리를 믿지 않음).
// 수단별 속도 상한 (m/s). plan.html §2 의 실측 표 기준: 걷기 4.62, 따릉이 9.5, 로드 55km/h, 슈퍼 297km/h, 트럭 275km/h.
// 슈퍼·트럭은 실제 최고속도까지 다 세면 기록이 튀므로 상한을 별도로 둔다(칭호 기록용, 보상 아님).
// 이 파일은 cloudflare:workers 를 가져오지 않는다.
import { kstDate } from "./flags.js";

export const MODE_CAP_MPS = Object.freeze({
  walk: 4.62,
  bike: 9.5,
  roadbike: 15.3, // 55 km/h
  superbike: 82.5, // 297 km/h
  truck: 76.4, // 275 km/h
  bus: 20,
  taxi: 25,
});
export const MODES = Object.keys(MODE_CAP_MPS);
const GAP_SEC = 5; // 이보다 오래 소식이 없으면 그 구간은 버림
const TELEPORT_M = 50; // 한 번에 이만큼 넘게 + 상한 1.5배 넘게 움직이면 순간이동으로 보고 버림
const IDLE_M = 0.05;
const ADMIN_VEH = new Set([900, 901]);

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

/** 웹소켓 하나의 이동 누적기. 메모리는 수단당 숫자 두 개. */
export class MoveStats {
  constructor() {
    this.last = null; // { x, z, t, mode }
    this.acc = new Map(); // `${date}|${mode}` → { m, s }
    this.dropped = { teleport: 0, gap: 0 };
  }

  /** @returns {number} 이번에 센 거리(m) */
  push({ x, z, mode, now = Date.now() }) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const prev = this.last;
    this.last = { x, z, t: now, mode };
    if (!prev || !mode || prev.mode !== mode) return 0;
    const dt = (now - prev.t) / 1000;
    if (!(dt > 0)) return 0;
    if (dt > GAP_SEC) { this.dropped.gap++; return 0; }
    const d = Math.hypot(x - prev.x, z - prev.z);
    if (d < IDLE_M) return 0;
    const cap = MODE_CAP_MPS[mode] || 0;
    if (!cap) return 0;
    if (d > Math.max(TELEPORT_M, cap * dt * 1.5)) { this.dropped.teleport++; return 0; }
    const counted = Math.min(d, cap * dt);
    const key = `${kstDate(now)}|${mode}`;
    const cur = this.acc.get(key) || { m: 0, s: 0 };
    cur.m += counted;
    cur.s += dt;
    this.acc.set(key, cur);
    return counted;
  }

  /** 정수 m·초만 떼어 내고 소수점 나머지는 다음 번으로 남긴다. */
  drain() {
    const rows = [];
    for (const [key, v] of this.acc) {
      const m = Math.floor(v.m);
      const s = Math.floor(v.s);
      if (m <= 0 && s <= 0) continue;
      const [date, mode] = key.split("|");
      rows.push({ date, mode, m, s });
      v.m -= m;
      v.s -= s;
    }
    for (const [key, v] of this.acc) if (v.m < 1 && v.s < 1 && !key.startsWith(kstDate())) this.acc.delete(key);
    return rows;
  }

  toJSON() {
    return { acc: [...this.acc.entries()] };
  }

  static from(json) {
    const ms = new MoveStats();
    if (Array.isArray(json?.acc)) for (const [k, v] of json.acc.slice(0, 32)) ms.acc.set(String(k), { m: +v?.m || 0, s: +v?.s || 0 });
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
