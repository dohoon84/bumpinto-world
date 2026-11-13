// [route-map landscape] 폰 가로(짧은 높이) 전용 노선도 — 데스크톱 모달을 줄인 게 아니라 가로로 눕힌 별도 배치.
//   노선이 고리 모양이라는 점을 그대로 쓴다: 왼쪽 미금–정자 → 위 신분당(판교…강남) → 2호선 → 오른쪽 위 잠실
//   → 오른쪽 세로 8호선(석촌…장지) → 오른쪽 아래 복정 → 아래 수인분당(가천대…수내) → 다시 정자.
//   이름표는 큰 터치 칩(한국어/영어 한 언어)이고, 위·아래 줄은 바깥쪽 우선, 이웃과 부딪히면 고리 안쪽으로 보낸다(지그재그).
//   결과 모양은 routeMap.js buildRouteMap 과 같아서 auditRouteMap(겹침 검사)을 그대로 쓴다. 순수 함수(DOM 없음).
import { RM_LINES } from './routeMap.js';

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

  // 이름표 배치
  const placed = [];
  const boxOf = (l) => ({ l: l.x, r: l.x + l.w, t: l.y - l.h / 2, b: l.y + l.h / 2 });
  const hitsAny = (bx, pad = 5) => placed.some((p) => { const q = boxOf(p); return bx.l < q.r + pad && q.l < bx.r + pad && bx.t < q.b + pad && q.t < bx.b + pad; });
  const mk = (id, sd, x, y) => { const { w, h } = sz(id); const [nx, ny] = P(id); return { id, sd, nx, ny, w, h, x, y, pass: !!byId.get(id)?.pass, leader: null }; };
  const center = (id, dir) => { const { w } = sz(id); const [nx, ny] = P(id); return mk(id, 'C', nx - w / 2, ny + dir * M.offY); };
  // 오른쪽 세로(잠실·복정 포함): 점 오른쪽
  for (const id of right) { const [nx, ny] = P(id); placed.push(mk(id, 'R', nx + M.gapDot, ny)); }
  // 정자: 고리 안쪽(오른쪽), 미금: 점 아래
  { const [nx, ny] = P('jeongja'); placed.push(mk('jeongja', 'R', nx + M.gapDot + 2, ny)); }
  if (has.has('migeum')) placed.push(center('migeum', 1));
  // 위 줄은 바깥(위) 우선, 아래 줄은 바깥(아래) 우선 — 부딪히면 안쪽, 둘 다 안 되면 덜 겹치는 쪽에서 x 를 조금 민다
  const track = (ids, outward) => {
    for (const id of ids) {
      let cand = null;
      for (const dir of [outward, -outward]) {
        const l = center(id, dir);
        if (!hitsAny(boxOf(l))) { cand = l; break; }
      }
      if (!cand) {
        for (const dx of [4, -4, 8, -8, 12, -12, 16, -16]) {
          for (const dir of [outward, -outward]) {
            const l = center(id, dir); l.x += dx;
            if (!hitsAny(boxOf(l))) { cand = l; break; }
          }
          if (cand) break;
        }
      }
      placed.push(cand || center(id, -outward));
    }
  };
  track(top, -1);
  track(su, 1);
  const labels = placed;
  return { mobile: true, land: true, W, H, k: 1, kx: 1, M, pos, lines, stations: st, segs, diamond: null, labels, rows: { yT, yB, yMid, xR, xJ } };
}
