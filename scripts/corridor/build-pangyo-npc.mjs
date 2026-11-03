// [pangyo-npc] 판교 IT 직장인 NPC 데이터: 회사 건물 위치(OSM) + 점심 장소(식당·카페 점) → public/corridor/pangyo-npc.json
//   node scripts/corridor/build-pangyo-npc.mjs            : data/osm_pangyo_npc_raw.json(잘라 둔 OSM 응답)으로 다시 만든다
//   node scripts/corridor/build-pangyo-npc.mjs --fetch    : data/query_pangyo_npc.overpassql 로 Overpass 를 다시 받아 잘라 저장한 뒤 만든다
// 회사 좌표는 OSM 에서 확인된 것만 쓴다(좌표를 지어내지 않음). 못 찾은 회사는 omitted 에 이유와 함께 남긴다.
// 게임 안에는 회사 이름을 쓰지 않는다: 이 파일·런타임 라벨은 이니셜(K·N·A·S …)과 업종(kind)만 쓴다. 이름은 이 스크립트의 OSM 매칭에만 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const OUT = path.resolve(ROOT, arg('out', 'public/corridor/pangyo-npc.json'));
const RAW = path.resolve(ROOT, 'data/osm_pangyo_npc_raw.json');

// ---------- 투영 (정자역 원점, build-pangyo.mjs / scripts/lib/geo.mjs 와 같음) ----------
const CENTER = { lat: 37.3665, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const r1 = (v) => Math.round(v * 10) / 10;
const proj = (g) => [r1((g.lon - CENTER.lon) * kx), r1(-(g.lat - CENTER.lat) * kz)];

// ---------- 회사 → OSM 요소 (2026-11-03 Overpass 로 확인. name/name:en/office 태그) ----------
//   initial: 라벨용 이니셜(겹쳐도 됨 — 일부러 일반적으로) · kind: 직무 풀(platform | game | security)
const COMPANIES = [
  { key: 'k1', initial: 'K', kind: 'platform', osm: 'way/659687063', match: /카카오 판교아지트/ }, // building=commercial, 알파돔시티 타워
  { key: 'k2', initial: 'K', kind: 'platform', osm: 'node/13891563282', match: /카카오모빌리티/ }, // office=logistics, 판교역로 152
  { key: 'k3', initial: 'K', kind: 'game', osm: 'way/1087134310', match: /크래프톤타워/ }, // building=commercial, 알파돔시티 타워
  { key: 'n1', initial: 'N', kind: 'game', osm: 'way/694434545', match: /엔씨소프트R&D센터/ }, // office=it, 대왕판교로644번길 12
  { key: 'a1', initial: 'A', kind: 'security', osm: 'way/477387896', match: /안랩|AhnLab/ }, // office=it, 판교역로 220
  { key: 'n2', initial: 'N', kind: 'game', osm: 'way/468588694', match: /NHN엔터테인먼트/ }, // office=it, 대왕판교로645번길 16
  { key: 's1', initial: 'S', kind: 'game', osm: 'node/4718106609', match: /스마일게이트/ }, // office=it, 판교역로 220
];
// OSM(name·operator·brand·office, 판교 일대 bbox)에서 못 찾았거나 쓰지 않은 것
const OMITTED = [
  { initial: 'N', reason: 'naver-cloud: no OSM feature with matching name/operator/brand in bbox 37.385,127.085,37.415,127.125 (2026-11-03)' },
  { initial: 'D', reason: 'douzone-bizon: no OSM feature with matching name/operator/brand in bbox 37.385,127.085,37.415,127.125 (2026-11-03)' },
  { initial: 'N', osm: 'way/455732653', reason: 'ncsoft global R&D center: landuse=construction, opening_date=2027 — not a workplace yet' },
];
// 점심 장소: 판교 박스(build-pangyo BOX) ± 250m 안 식당·카페 점(이름은 저장하지 않음)
const BOX = { x0: -250, x1: 1000, z0: -3500, z1: -2500 }, FOOD_M = 250;
const FOOD = { restaurant: 'r', fast_food: 'r', food_court: 'r', cafe: 'c' };

if (process.argv.includes('--fetch')) {
  const tmp = path.join(ROOT, 'data/osm_pangyo_npc_full.json');
  execFileSync('bash', [path.join(ROOT, 'data/fetch.sh'), 'query_pangyo_npc.overpassql', path.basename(tmp)], { stdio: 'inherit' });
  const full = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const want = new Set(COMPANIES.map((c) => c.osm));
  const keep = full.elements.filter((e) => want.has(`${e.type}/${e.id}`) || (FOOD[e.tags?.amenity] && inFoodBox(e)));
  fs.writeFileSync(RAW, JSON.stringify({ osm3s: full.osm3s, query: 'data/query_pangyo_npc.overpassql (trimmed: companies + food amenities)', elements: keep }, null, 0) + '\n');
  fs.rmSync(tmp, { force: true });
}
function inFoodBox(e) { const c = e.center || e; if (c.lat == null) return false; const [x, z] = proj(c); return x >= BOX.x0 - FOOD_M && x <= BOX.x1 + FOOD_M && z >= BOX.z0 - FOOD_M && z <= BOX.z1 + FOOD_M; }

const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
const byId = new Map(raw.elements.map((e) => [`${e.type}/${e.id}`, e]));
const companies = [];
for (const c of COMPANIES) {
  const e = byId.get(c.osm);
  if (!e) throw new Error(`${c.osm} missing from ${path.relative(ROOT, RAW)} — run with --fetch`);
  const name = [e.tags?.name, e.tags?.['name:ko'], e.tags?.['name:en']].filter(Boolean).join(' ');
  if (!c.match.test(name)) throw new Error(`${c.osm}: tags no longer match (${name})`);
  const [x, z] = proj(e.center || e);
  companies.push({ key: c.key, initial: c.initial, kind: c.kind, osm: c.osm, x, z });
}
const food = raw.elements.filter((e) => FOOD[e.tags?.amenity] && inFoodBox(e)).map((e) => [...proj(e.center || e), FOOD[e.tags.amenity]])
  .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const out = {
  meta: {
    name: 'Pangyo IT office-worker NPC spots', generated: new Date().toISOString(),
    source: { osm: `Overpass API (osm_base ${raw.osm3s?.timestamp_osm_base || '?'})`, query: 'data/query_pangyo_npc.overpassql', raw: 'data/osm_pangyo_npc_raw.json' },
    attribution: '© OpenStreetMap contributors (ODbL)',
    note: 'initials only — no company names in game. x/z = game metres (Jeongja station origin). food: [x, z, r=restaurant|c=cafe]',
  },
  companies, omitted: OMITTED, food,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`pangyo-npc: ${companies.length} companies, ${food.length} food spots → ${path.relative(ROOT, OUT)}`);
