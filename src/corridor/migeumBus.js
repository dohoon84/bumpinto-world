// [migeum-bus] 미금역 일대 버스(시뮬 전용) — migeum/bus.json (scripts/corridor/build-migeum-bus.mjs)
//   GBIS 정류소 순서(G8110 · 7007-1 · 380 · 9407 · 마을 7-1 · 2 · 14) + OSM 차도 최단 경로(추정 경로).
//     live     : 정자 bbox 안 조각 — src/game.js 가 ?bus=sim 일 때만 덧붙임(실시간 모드 정자는 그대로)
//     corridor : 정자 bbox 밖(코리더 + 미금 9칸) 조각 + 새 정류장 — corridor life 가 ?bus=sim 일 때만 덧붙임
//   각 조각의 skipIf / replace 는 기존 경로(같은 번호, 시작·끝 좌표)로 찾는다:
//     skipIf  : 그 기존 경로가 있으면 새 조각은 안 넣음(기존이 이미 같은 길을 덮음)
//     replace : 그 기존 경로가 있으면 그 자리(경로 번호 그대로)에 새 조각(미금까지 이어진 것)을 넣음 · 없으면 뒤에 덧붙임
//   ?migeumbus=0 (또는 ?migeum=0) 이면 요청 없음 → 정자/판교/코리더 버스 데이터 원본 그대로
import { migeumEnabled, MIGEUM_DIR } from './migeum.js';

export const MIGEUM_BUS_FILE = MIGEUM_DIR + 'bus.json';

export function migeumBusEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return migeumEnabled(search) && new URLSearchParams(search).get('migeumbus') !== '0';
}

const refEq = (a, b) => a === b || (a === 'G8110' && b === '8110') || (a === '8110' && b === 'G8110');
const near = (p, q) => Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5;

// T 의 사본에 X(bus.json 의 live 또는 corridor)를 합친다. 원본 T 는 바꾸지 않음. 기존 경로 번호·순서 유지(새 것은 뒤로).
export function mergeMigeumBus(T, X, { flag = 'migeumBus' } = {}) {
  if (!T || !X?.paths?.length) return T;
  const routes = T.routes.map((r) => ({ ...r, paths: [...(r.paths || [])] })), byId = new Map(routes.map((r) => [r.id, r]));
  const paths = [...T.paths], replaced = new Set();
  const find = (ref, [a, b]) => paths.findIndex((p, i) => !replaced.has(i) && refEq(p.ref, ref) && p.pts?.length > 1 && near(p.pts[0], a) && near(p.pts[p.pts.length - 1], b));
  const stats = { added: 0, replaced: 0, skipped: 0 };
  for (const p0 of X.paths) {
    const { skipIf, replace, ...p } = p0;
    if (skipIf?.some((e) => find(p.ref, e) >= 0)) { stats.skipped++; continue; }
    const i = replace ? replace.map((e) => find(p.ref, e)).find((k) => k >= 0) ?? -1 : -1;
    if (i >= 0) { const E = paths[i]; paths[i] = { ...E, ...p, id: E.id ?? i, route: E.route, [flag]: true }; replaced.add(i); stats.replaced++; continue; }
    if (!byId.has(p.route)) { const r = (X.routes || []).find((x) => x.id === p.route); if (!r) continue; const c = { ...r, paths: [] }; routes.push(c); byId.set(c.id, c); }
    const id = paths.length; paths.push({ ...p, id, [flag]: true }); byId.get(p.route).paths.push(id); stats.added++;
  }
  const out = { ...T, routes, paths, migeumBusStats: stats };
  if (X.stops?.length || X.addRoute?.length) {
    const add = new Map(); for (const [id, ref] of X.addRoute || []) (add.get(id) || add.set(id, []).get(id)).push(ref);
    const have = new Set(T.stops.map((s) => s.id));
    out.stops = T.stops.map((s) => (add.has(s.id) ? { ...s, routes: [...new Set([...(s.routes || []), ...add.get(s.id)])] } : s));
    for (const s of X.stops || []) if (!have.has(s.id)) out.stops.push(s);
  }
  const refTypes = { ...T.refTypes };
  for (const r of X.routes || []) if (!refTypes[r.ref] && r.type) refTypes[r.ref] = { type: r.type, src: r.src, gbis: r.gbis };
  out.refTypes = refTypes;
  return out;
}
