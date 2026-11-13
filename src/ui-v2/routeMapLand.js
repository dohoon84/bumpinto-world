// [route-map landscape] 폰 가로(짧은 높이) 전용 노선도 — 데스크톱 모달을 줄인 게 아니라 가로로 눕힌 별도 배치.
//   노선이 고리 모양이라는 점을 그대로 쓴다: 왼쪽 미금–정자 → 위 신분당(판교…강남) → 2호선 → 오른쪽 위 잠실
//   → 오른쪽 세로 8호선(석촌…장지) → 오른쪽 아래 복정 → 아래 수인분당(가천대…수내) → 다시 정자.
//   이름표는 큰 터치 칩(한국어/영어 한 언어)이고, 위·아래 줄은 바깥쪽 우선, 이웃과 부딪히면 고리 안쪽으로 보낸다(지그재그).
//   결과 모양은 routeMap.js buildRouteMap 과 같아서 auditRouteMap(겹침 검사)을 그대로 쓴다. 순수 함수(DOM 없음).
import { RM_LINES } from './routeMap.js';

// 영문 모드 가로 폰: 좁은 칸에 맞춰 긴 이름 줄임(전체 이름은 aria-label·선택 바)
export const RM_LAND_SHORT_EN = { gachon: 'Gachon', garak: 'Garak', yangjaeforest: 'Yangjae Forest' };
export const RM_LAND_MODE = { dotR: 6, lw: 6, minHit: 44, gapDot: 10, offY: 27, chipH: 32, margin: 6 };

const order = (key, has) => (RM_LINES.find((l) => l.key === key)?.ids || []).filter((id) => has.has(id));

/**
 * @param {Array<{id:string, ko:string, en:string, pass?:boolean, lines?:string[]}>} stations  (정자 id = 'jeongja')
 * @param {{ W:number, H:number }} box  지도 칸 크기(CSS px)
 * @param {(id:string)=>{w:number,h:number}} size  실측 칩 크기(선택 상태 포함 최대)
 */
export function buildLandMap(stations, { W, H }, size) {
  const M = { ...RM_LAND_MODE };
  const byId = new Map(stations.map((s) => [s.id, s]));
  const has = new Set(byId.keys());
  // 위 줄: 판교 … 강남 (신분당 역순, 정자·미금 제외). 그 오른쪽 끝 칸이 2호선 건너 잠실
  const sb = order('신분당선', has).filter((id) => id !== 'jeongja' && id !== 'migeum').reverse();
  const top = [...sb];
  // 오른쪽 세로: 잠실 → 석촌 … 장지 → 복정 (8호선 순서 그대로)
  const right = order('8호선', has);
  // 아래 줄: 복정 → 가천대 … 수내 (수인분당 순서 그대로, 정자·미금·복정 제외)
  const su = order('수인분당선', has).filter((id) => !['jeongja', 'migeum', 'bokjeong'].includes(id));
  const jam = right[0] || 'jamsil', bok = right[right.length - 1] || 'bokjeong';
  const sz = (id) => size(id) || { w: 60, h: M.chipH };
  const maxRightW = Math.max(...right.map((id) => sz(id).w), 40);
  const yT = M.chipH + M.offY - 8, yB = H - (M.chipH + M.offY - 8), yMid = (yT + yB) / 2;
  const xR = W - maxRightW - M.gapDot - M.margin;
  const xM = Math.max(M.margin + sz('migeum').w / 2, 24);
  const xJ = xM + Math.max(56, sz('migeum').w / 2 + 34);
  const bend = 30; // 정자에서 위·아래 줄로 꺾이는 x 폭
  const xB = xJ + bend;
  const pos = new Map();
  if (has.has('migeum')) pos.set('migeum', [xM, yMid]);
  pos.set('jeongja', [xJ, yMid]);
  const topN = top.length + 1; // 마지막 칸 = 잠실
  top.forEach((id, i) => pos.set(id, [xB + (xR - xB) * (i + 1) / topN, yT]));
  right.forEach((id, i) => pos.set(id, [xR, yT + (yB - yT) * i / Math.max(1, right.length - 1)]));
  const botN = su.length + 1;
  su.forEach((id, i) => pos.set(id, [xR - (xR - xB) * (i + 1) / botN, yB]));

  const off = M.lw * 0.55;
  const P = (id) => pos.get(id);
  const lines = [];
  const add = (key, color, ids, pts) => { if (pts.length >= 2) lines.push({ key, color, ids, pts }); };
  const L = Object.fromEntries(RM_LINES.map((l) => [l.key, l]));
  // 신분당: 미금 → 정자 → 꺾임 → 판교 … 강남
  add('신분당선', L['신분당선'].color, ['migeum', 'jeongja', ...sb].filter((id) => has.has(id)),
    [...(has.has('migeum') ? [[xM, yMid - off]] : []), [xJ, yMid - off], [xB, yT], ...sb.map(P)]);
  // 2호선: 강남 → 잠실
  if (has.has('gangnam') && has.has(jam)) add('2호선', L['2호선'].color, ['gangnam', jam], [P('gangnam'), P(jam)]);
  // 8호선: 잠실 → … → 복정
  add('8호선', L['8호선'].color, right, right.map(P));
  // 수인분당: 복정 → 가천대 … 수내 → 꺾임 → 정자 → 미금
  add('수인분당선', L['수인분당선'].color, [bok, ...su, 'jeongja', 'migeum'].filter((id) => has.has(id)),
    [P(bok), ...su.map(P), [xB, yB], [xJ, yMid + off], ...(has.has('migeum') ? [[xM, yMid + off]] : [])].filter(Boolean));

  const lineCount = new Map();
  for (const l of lines) for (const id of l.ids) lineCount.set(id, (lineCount.get(id) || 0) + 1);
  const st = stations.filter((s) => pos.has(s.id)).map((s) => ({ ...s, pass: !!s.pass, xf: (lineCount.get(s.id) || 0) >= 2 }));
  const segs = [];
  for (const l of lines) for (let i = 1; i < l.pts.length; i++) segs.push([...l.pts[i - 1], ...l.pts[i], M.lw / 2, 'line:' + l.key]);

  // 터치 영역: 44px 기본, 아주 낮은 화면(740×360 등)에서 오른쪽 세로 줄 간격이 44 보다 좁으면 그 간격까지만(겹침 없이)
  if (right.length > 1) M.minHit = Math.min(44, Math.floor((yB - yT) / (right.length - 1)) - 1);

  // 이름표 배치 — 장애물: 이미 놓은 이름표·지시선·터치 영역, 노선, 점, 지도 테두리
  const placed = [];
  const leaders = []; // [x1,y1,x2,y2]
  const boxOf = (l) => ({ l: l.x, r: l.x + l.w, t: l.y - l.h / 2, b: l.y + l.h / 2 });
  const hitOf = (l) => { const h = Math.max(M.minHit, l.h); return { l: l.x, r: l.x + l.w, t: l.y - h / 2, b: l.y + h / 2 }; };
  const inter = (a, q, pad) => a.l < q.r + pad && q.l < a.r + pad && a.t < q.b + pad && q.t < a.b + pad;
  const segHits = (sg, bx, pad) => {
    const [x1, y1, x2, y2, hw = 0] = sg;
    const n = Math.max(6, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
    for (let i = 0; i <= n; i++) {
      const px = x1 + (x2 - x1) * i / n, py = y1 + (y2 - y1) * i / n;
      if (px > bx.l - hw - pad && px < bx.r + hw + pad && py > bx.t - hw - pad && py < bx.b + hw + pad) return true;
    }
    return false;
  };
  const blocked = (l) => {
    const bx = boxOf(l);
    if (bx.l < 3 || bx.r > W - 3 || bx.t < 2 || bx.b > H - 2) return true;
    if (placed.some((p) => inter(bx, boxOf(p), 5))) return true;
    // 누를 수 있는 칩끼리는 터치 영역(높이 minHit)도 안 겹치게
    if (!l.pass) { const hb = hitOf(l); if (placed.some((p) => !p.pass && inter(hb, hitOf(p), -0.5))) return true; }
    if (leaders.some((ld) => segHits([...ld, 0.75], bx, 3))) return true;
    if (segs.some((sg) => segHits(sg, bx, 3))) return true;
    for (const [id, [x, y]] of pos) if (id !== l.id && x > bx.l - 9 && x < bx.r + 9 && y > bx.t - 9 && y < bx.b + 9) return true;
    if (l.leader) {
      // 지시선이 다른 이름표·점을 지나지 않게
      if (placed.some((p) => segHits([...l.leader, 0.75], boxOf(p), 2))) return true;
      for (const [id, [x, y]] of pos) if (id !== l.id && segHits([...l.leader, 0.75], { l: x - M.dotR, r: x + M.dotR, t: y - M.dotR, b: y + M.dotR }, 1)) return true;
    }
    return false;
  };
  const mk = (id, sd, x, y) => { const { w, h } = sz(id); const [nx, ny] = P(id); return { id, sd, nx, ny, w, h, x, y, pass: !!byId.get(id)?.pass, leader: null }; };
  const TIER = M.chipH + 8;
  const center = (id, dir, tier = 0, dx = 0) => {
    const { w, h } = sz(id); const [nx, ny] = P(id);
    const l = mk(id, 'C', nx - w / 2 + dx, ny + dir * (M.offY + tier * TIER));
    // 고리 안쪽 둘째·셋째 줄이나 점에서 많이 비킨 이름표는 점에서 이름표 가장자리까지 지시선
    if (tier > 0 || Math.abs(dx) > w / 2 - 6) l.leader = [nx, ny + dir * (M.dotR + 1), nx + dx, l.y - dir * h / 2];
    return l;
  };
  // 오른쪽 세로(잠실·복정 포함): 점 오른쪽
  for (const id of right) { const [nx, ny] = P(id); placed.push(mk(id, 'R', nx + M.gapDot, ny)); }
  // 정자: 고리 안쪽(오른쪽), 미금: 점 아래
  { const [nx, ny] = P('jeongja'); placed.push(mk('jeongja', 'R', nx + M.gapDot + 2, ny)); }
  if (has.has('migeum')) placed.push(center('migeum', 1));
  // 위·아래 줄: 줄 배치 패턴(o=바깥, i=고리 안쪽, j/k=안쪽 둘째·셋째 줄 + 지시선)을 차례로 시험해 겹침 없는 첫 패턴을 쓴다.
  //   이름표가 좁으면 'o'(전부 바깥), 넓으면 o/i 지그재그 → o,i,o,j … 로 넘어간다. 패턴 안에서도 x 를 조금(±24px) 밀 수 있다.
  const PATTERNS = ['o', 'oi', 'io', 'oioj', 'ioj', 'oij', 'joi', 'ojoi', 'iojo', 'oiojoi', 'oiojok', 'ojoiok'];
  const ROW = { o: [1, 0], i: [-1, 0], j: [-1, 1], k: [-1, 2] };
  const DX = [0, 4, -4, 8, -8, 12, -12, 16, -16, 20, -20, 24, -24];
  const tryPattern = (ids, outward, pat, rot) => {
    const out = [];
    for (let n = 0; n < ids.length; n++) {
      const [d, tier] = ROW[pat[(n + rot) % pat.length]];
      let ok = null;
      for (const dx of DX) { const l = center(ids[n], d * outward, tier, dx); if (!blocked(l)) { ok = l; break; } }
      if (!ok) { for (const l of out) { placed.pop(); if (l.leader) leaders.pop(); } return false; }
      out.push(ok); placed.push(ok); if (ok.leader) leaders.push(ok.leader);
    }
    return true;
  };
  let fallback = 0;
  const track = (ids, outward) => {
    for (const pat of PATTERNS) for (let rot = 0; rot < pat.length; rot++) if (tryPattern(ids, outward, pat, rot)) return;
    fallback++;
    // 마지막 수단: 하나씩 가장 덜 나쁜 자리(겹칠 수 있음 — 검증 스크립트가 잡는다)
    for (const id of ids) {
      let cand = null;
      for (const tier of [0, 1, 2]) for (const dx of DX) for (const dir of tier ? [-outward] : [outward, -outward]) { if (cand) break; const l = center(id, dir, tier, dx); if (!blocked(l)) cand = l; }
      const l = cand || center(id, -outward);
      placed.push(l); if (l.leader) leaders.push(l.leader);
    }
  };
  track(top, -1);
  track(su, 1);
  return { fallback, mobile: true, land: true, W, H, k: 1, kx: 1, M, pos, lines, stations: st, segs, diamond: null, labels: placed, rows: { yT, yB, yMid, xR, xJ } };
}
