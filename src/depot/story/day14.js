// [depot-story] 14일차: E23 동네 장보기 대결(versus) + E24 재감사(B 경로) — 라이벌 경로·시간표·판정(순수). 그리기는 8일차 보라 카트(InstancedMesh)·팀장 NPC 재사용.
//   길: 통로 가운데(x 47.6 · 53.9 · 59.4 · 64.2)를 따라 z 로, 앞쪽 띠(z 13) 또는 교차 통로(z 44)로 x 이동 — 랙을 뚫지 않음.
//   팀장: 정해진 경로(물→계란→라면→쌀→휴지→계산), 계산 끝 230초 고정(속도 = 남는 시간에 맞춤, 0.6–1.25 m/s · 남으면 담기 시간을 늘림).
import { convoyPath } from './day8.js';

export const E23 = Object.freeze({ timeLimitSec: 300, countdown: 3, bossFinishSec: 230, bossSpeed: 1.25, bossPick: 4, bossCheckout: 20, squadSpeed: 1.4, squadPick: 3, squadCheckout: 10, allyMinAff: 3, allyHoldSec: 30, listN: 6 });
export const COLS = [47.6, 53.9, 59.4, 64.2], BANDS = [13.0, 44.0];
/** 장보기 목록 6칸(범란 2판 = 2칸) */
export const LIST = Object.freeze([['egg', 2], ['water', 1], ['rice', 1], ['ramen', 1], ['tissue', 1]]);
export const listSlots = (has) => LIST.reduce((n, [id, k]) => n + Math.min(k, has(id) || 0), 0);

/** 대결용 멈춤 자리: 목표(targets) → 통로 가운데 · 계산 = NPC 계산대 앞 띠 */
export function stopPoint(id, tg, lane = null) {
  if (id === 'checkout') return { x: lane, z: 12.6, co: true };
  if (id === 'timesale-endcap') return { x: 47.8, z: 44 };
  const t = tg[id]; if (!t) return null;
  const c = colOf(t); return c != null ? { x: c, z: t.z } : { x: t.x, z: t.z };
}
/** 점이 있는 통로(x) — 랙 사이(z 13.9–41.1) 또는 동쪽 빈 바닥(x > 63.3)이면 그 통로, 띠 위면 null */
export function colOf(p) {
  if (p.x > 63.3 && p.z > 13.9) return 64.2;
  if (p.z <= 13.9 || p.z >= 41.1) return null;
  return COLS.reduce((b, c) => (Math.abs(c - p.x) < Math.abs(b - p.x) ? c : b), COLS[0]);
}
/** a → b 꺾은선 (a 는 빼고 b 포함) */
export function pathBetween(a, b) {
  const ca = colOf(a), cb = colOf(b), out = [];
  const ax = ca ?? a.x, bx = cb ?? b.x;
  if (ca != null && ca === cb) { if (Math.abs(a.x - ca) > 0.05) out.push({ x: ca, z: a.z }); out.push({ x: ca, z: b.z }); if (Math.abs(b.x - ca) > 0.05) out.push({ x: b.x, z: b.z }); return out; }
  const cost = (zb) => Math.abs(a.z - zb) + Math.abs(b.z - zb);
  const zb = ca == null && cb == null ? (Math.abs(a.z - b.z) < 1 ? a.z : BANDS.reduce((m, z) => (cost(z) < cost(m) ? z : m))) : BANDS.reduce((m, z) => (cost(z) < cost(m) ? z : m));
  if (ca != null && Math.abs(a.x - ca) > 0.05) out.push({ x: ca, z: a.z });
  if (Math.abs(a.z - zb) > 0.05) out.push({ x: ax, z: zb });
  if (Math.abs(ax - bx) > 0.05) out.push({ x: bx, z: zb });
  if (Math.abs(b.z - zb) > 0.05) out.push({ x: bx, z: b.z });
  if (Math.abs(b.x - bx) > 0.05) out.push({ x: b.x, z: b.z });
  if (!out.length) out.push({ x: b.x, z: b.z });
  return out;
}
const segLen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return s; };
/**
 * 라이벌 시간표. stops: [{x,z,co?,list?,hold?}] (co = 계산) · 반환 { legs:[{pts,len,t0,t1}], waits:[{t0,t1,kind,list}], doneT, speed }
 *   loop: 경로 중간에 'convoy-loop' 이면 고리를 한 바퀴(멈춤 없이)
 */
export function planRival({ start, stops, speed, pick, checkout, finishAt = null, tg = {} }) {
  const legs = [], seq = []; let cur = start;
  for (const s of stops) {
    if (s.loop) { const P = convoyPath(tg).path; const pts = [...pathBetween(cur, P[0]), ...P.slice(1)]; seq.push({ pts, stop: null }); cur = P[P.length - 1]; continue; }
    seq.push({ pts: pathBetween(cur, s), stop: s }); cur = s;
  }
  let dist = 0; const starts = [start]; for (const q of seq) { dist += segLen([starts[starts.length - 1], ...q.pts]); starts.push(q.pts[q.pts.length - 1]); }
  const nPick = seq.filter((q) => q.stop && !q.stop.co).length;
  let v = speed, pk = pick;
  if (finishAt) { v = Math.min(speed, Math.max(0.6, dist / Math.max(1, finishAt - checkout - nPick * pick))); pk = Math.max(pick, (finishAt - checkout - dist / v) / Math.max(1, nPick)); }
  let t = 0; const waits = []; let list = 0;
  seq.forEach((q, i) => {
    const pts = [starts[i], ...q.pts], len = segLen(pts); legs.push({ pts, len, t0: t, t1: t + len / v }); t += len / v;
    if (q.stop) { const w = q.stop.co ? checkout : pk + (q.stop.hold || 0); list += q.stop.list || 0; waits.push({ t0: t, t1: t + w, kind: q.stop.co ? 'checkout' : 'pick', list, at: q.pts[q.pts.length - 1] }); t += w; legs.push({ pts: [q.pts[q.pts.length - 1]], len: 0, t0: t - w, t1: t, wait: true }); }
  });
  return { legs, waits, doneT: t, speed: v, pick: pk, dist };
}
/** 시각 t 의 위치·방향·상태 · list = 지금까지 담은 칸 */
export function rivalAt(plan, t) {
  let last = plan.legs[0]?.pts[0] || { x: 0, z: 0 }, dir = { x: 0, z: -1 };
  for (const L of plan.legs) {
    if (L.wait) { if (t < L.t1) { const w = plan.waits.find((x) => x.t1 === L.t1); return { x: L.pts[0].x, z: L.pts[0].z, dx: dir.x, dz: dir.z, yaw: Math.atan2(dir.x, dir.z), phase: w?.kind || 'pick', moving: false, list: listAt(plan, t) }; } continue; }
    const k = t <= L.t0 ? 0 : t >= L.t1 ? 1 : (t - L.t0) / Math.max(1e-6, L.t1 - L.t0);
    let s = k * L.len, acc = 0;
    for (let i = 1; i < L.pts.length; i++) {
      const a = L.pts[i - 1], b = L.pts[i], d = Math.hypot(b.x - a.x, b.z - a.z); if (d < 1e-6) continue;
      dir = { x: (b.x - a.x) / d, z: (b.z - a.z) / d };
      if (acc + d >= s) { const u = (s - acc) / d; last = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u }; if (t < L.t1) return { ...last, dx: dir.x, dz: dir.z, yaw: Math.atan2(dir.x, dir.z), phase: 'move', moving: true, list: listAt(plan, t) }; break; }
      acc += d; last = b;
    }
    if (t < L.t1) return { ...last, dx: dir.x, dz: dir.z, yaw: Math.atan2(dir.x, dir.z), phase: 'move', moving: true, list: listAt(plan, t) };
  }
  return { ...last, dx: dir.x, dz: dir.z, yaw: Math.atan2(dir.x, dir.z), phase: 'done', moving: false, list: listAt(plan, t) };
}
const listAt = (plan, t) => plan.waits.reduce((n, w) => (w.kind === 'pick' && t >= w.t1 ? w.list : n), 0);

/** 대결 설정(대본 versus.rivals) → 세 라이벌 시간표. lanes = NPC 계산대 앞 x (boss, pv-1, pv-2) */
export const LIST_OF = { 'aisle-01-water': 1, 'aisle-01-eggs': 2, 'timesale-endcap': 1, 'aisle-02-rice': 1, 'aisle-02-household': 1 };
export const RIVAL_START = Object.freeze({ boss: { x: 67.0, z: 20.6 }, 'pv-1': { x: 74.3, z: 20.6 }, 'pv-2': { x: 75.6, z: 20.6 } }); // 무대 북쪽(팀장) · 동쪽 주차(보라 카트 2대)
export function versusPlans({ rivals = [], tg = {}, lanes = [38.6, 31.4, 53.0], ally = false, t = E23 }) {
  const out = {};
  rivals.forEach((R, i) => {
    const boss = R.id === 'boss', st = RIVAL_START[R.id] || RIVAL_START['pv-1'];
    const stops = (R.route || []).map((id) => (id === 'convoy-loop' ? { loop: true } : { ...stopPoint(id, tg, lanes[i] ?? lanes[0]), list: LIST_OF[id] || 0, hold: ally && R.id === 'pv-2' && id === 'aisle-01-eggs' ? t.allyHoldSec : 0 })).filter(Boolean);
    out[R.id] = planRival({ start: st, stops, tg, speed: R.speedMps || (boss ? t.bossSpeed : t.squadSpeed), pick: R.pickSec || (boss ? t.bossPick : t.squadPick), checkout: R.checkoutSec || (boss ? t.bossCheckout : t.squadCheckout), finishAt: boss ? t.bossFinishSec : null });
  });
  return out;
}
/** E23 판정 (events.json judge) — slots = 계산 때 목록 칸 · first = 팀장보다 먼저 계산 · eggs = 대결 뒤 깨진 알 */
export function evalE23({ slots = 0, first = false, eggs = 0, timeUp = false, checkedOut = true } = {}, t = E23) {
  if (slots === 0 && (timeUp || checkedOut)) return 'missed';
  if (timeUp && !checkedOut) return 'fail';
  if (slots < t.listN) return 'fail';
  return first && eggs === 0 ? 'success' : 'partial';
}
/** E24 재감사: c1 깨진 알 0 · c2 보라 카트 충돌 0 · c3 9일차 2호 시식대(E17) · c4 300초 안 계산 · c5 반기철 봉투 */
export const E24_LABELS = Object.freeze({ c1: '깨진 알 0개', c2: '보라 카트 충돌 0', c3: '2호 시식대 줄', c4: '300초 안에 계산', c5: '반기철에게 봉투' });
export function e24Checks({ eggs = 0, rivalHits = 0, e17 = null, coSec = 999, bag = false } = {}, t = E23) {
  return { c1: eggs === 0, c2: rivalHits === 0, c3: e17 === 'success' || e17 === 'partial', c4: coSec <= t.timeLimitSec, c5: !!bag };
}
export function evalE24(checks) { const n = Object.values(checks || {}).filter(Boolean).length; return n >= 4 ? 'success' : n >= 2 ? 'partial' : 'fail'; }

// ---------------------------------------------------------------- DOM (브라우저) ----------------------------------------------------------------
/** 대결 바: 내 목록 6칸 · 팀장 목록 6칸 · 팀장 계산까지 남은 예상 시간 · 남은 시간 (화면 위 가운데, 모바일 가로는 작게) */
export function createVersusHud({ isMobile = false } = {}) {
  let el = null, css = null;
  const dots = (n, N, cls) => Array.from({ length: N }, (_, i) => `<i class="${i < n ? cls : ''}"></i>`).join('');
  const mm = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
  return {
    show(o) {
      if (typeof document === 'undefined') return;
      if (!o) { el?.remove(); el = null; css?.remove(); css = null; return; }
      if (!css) { css = document.createElement('style'); css.id = 'dp-vs-css'; css.textContent = `#dp-vs{position:fixed;left:50%;top:${isMobile ? 6 : 14}px;transform:translateX(-50%);z-index:30;display:flex;gap:${isMobile ? 8 : 14}px;align-items:center;padding:${isMobile ? '4px 10px' : '8px 16px'};border-radius:14px;background:rgba(18,32,28,.86);color:#f3eada;font:700 ${isMobile ? 11 : 14}px Pretendard,system-ui,sans-serif;box-shadow:0 4px 0 rgba(0,0,0,.25);pointer-events:none;white-space:nowrap}
#dp-vs .sd{display:flex;align-items:center;gap:6px}#dp-vs i{display:inline-block;width:${isMobile ? 8 : 11}px;height:${isMobile ? 8 : 11}px;border-radius:3px;background:rgba(255,255,255,.18);margin-right:2px}
#dp-vs i.me{background:#35e07a}#dp-vs i.rv{background:#a675e8}#dp-vs .vs{color:#f2d21e;font-weight:900}#dp-vs .t{opacity:.85;font-variant-numeric:tabular-nums}#dp-vs .go{color:#35e07a}`; document.head.appendChild(css); }
      if (!el) { el = document.createElement('div'); el.id = 'dp-vs'; document.body.appendChild(el); }
      el.innerHTML = o.count > 0 ? `<span class="vs">${o.count}</span>` : `<span class="sd">나 ${dots(o.me, 6, 'me')}</span><span class="vs">VS</span><span class="sd">${o.rivalName || '팀장'} ${dots(o.rival, 6, 'rv')}</span><span class="t">${o.rivalDone ? '팀장 계산 끝!' : `팀장 계산까지 ~${mm(o.rivalLeft)}`} · 남은 ${mm(o.left)}</span>`;
    },
    get on() { return !!el; },
    dispose() { el?.remove(); el = null; css?.remove(); css = null; },
  };
}
