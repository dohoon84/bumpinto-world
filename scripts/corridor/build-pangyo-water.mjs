// [pangyo-water] 정자→판교 탄천 수위(본류 낙차) + 판교 쪽 지류(운중천·금토천) 하도: public/corridor/pangyo/water.json
//
//   ?pangyowater=0 (또는 ?pangyo=0) 이면 런타임이 이 파일을 읽지 않는다 → 기존 화면/동작 그대로.
//
//   1) 본류 낙차 main.dz[i] (≤ 0, m) — 합친 탄천 축(라이브 terrain.json[0..from) + corridor/tancheon.json) 2m 점마다.
//      게임 세계는 둑·도로가 0m 인 평면이라 DEM 의 절대 고도(정자 ≈35m → 판교 ≈28m 수면)를 그대로 쓸 수 없다.
//      대신 '둑 대비 하도 깊이(상대 낙차)'를 둔치·수면·하상에 같이 더한다(둑 0m·다리 상판 0m 는 그대로).
//        - 궁내교(정자 북쪽)까지 0: 게임 상판→하상 7.6m 가 DEM 단면 7~8m 와 이미 맞음 → 정자(라이브) 구간 불변
//        - 양현교 −1.4m: 공개 자료 높이 9m(디지털성남문화대전 GC00101471) − 게임 7.6m. DEM 단면 8.5~9.3m 와도 맞음
//          (CROSSINGS: scripts/corridor/build-pangyo-link.mjs)
//        - 그 사이는 smoothstep(축 길이) — 두 공개 기준점 사이 보간(실측 아님). DEM 축 방향 요철은 DSM 잡음(다리·나무)이 커서 안 씀
//        - 양현교 → 운중천 합류점 + HOLD 까지 −1.4m 유지 (DEM 은 더 깊음: 합류부 둑−수로 ≈8m. 공개 기준점 값보다 깊게 만들지 않음)
//        - 그 뒤 RET 동안 0 으로 되돌림 → 판교 북쪽(야탑·잠실 방향) 코리더 구간은 기존 그대로 (알려진 한계: 이 800m 는 수위가 둑 대비 조금씩 올라감)
//   2) 지류: scripts/corridor/build-streams.mjs(feat/tributary-depth, 수정 없이)를 판교 타일 + 운중천이 지나는 코리더 타일
//      (-1_-5, 1_-8, 2_-8)만 담은 임시 루트에서 그대로 돌린다. OSM = 코리더 osm_merged + data/osm_pangyo_raw.json(판교 bbox).
//      결과 중 운중천(OSM 429222895)은 streams.json 의 두 조각(429222895, 429222895-1)을 대신한다(판교 타일을 지나 이어짐).
//      깊이 D: build-streams 의 폭 근사 대신 DEM 단면(둑 중앙값 − 수로 최저) 중앙값 − 수면 0.4m. 금토천은 받는 운중천보다 깊지 않게.
//      동막천: 판교 bbox(37.388~37.3995N, 127.103~127.1185E)·판교 타일 밖(대장동 쪽)이라 없음.
//
//   사용: node scripts/corridor/build-pangyo-water.mjs [--osm=../bumpinto-world/data/raw/osm_merged.json] [--out=…]  (npm run corridor:pangyowater)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CROSSINGS } from './build-pangyo-link.mjs';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OSM_MAIN = path.resolve(ROOT, arg('osm', '../bumpinto-world/data/raw/osm_merged.json'));
const OSM_PG = path.join(ROOT, 'data/osm_pangyo_raw.json');
const CDIR = path.join(ROOT, 'public/corridor'), PDIR = path.join(CDIR, 'pangyo');
const OUT = path.resolve(ROOT, arg('out', path.join(PDIR, 'water.json')));
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
const smoothstep = (t) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };

// ---------- 근거 값 ----------
const GAME = { deckH: 0, BED: -7.6 }; // terrain.json params (BED) · 다리 상판 = 도로 높이 0
const GN = CROSSINGS.find((c) => c.name === '궁내교'), YH = CROSSINGS.find((c) => c.name === '양현교');
const DZ_YH = r1(-(YH.public.heightM - (GAME.deckH - GAME.BED))); // 9 − 7.6 → −1.4
const HOLD = 200, RET = 800; // m (운중천 합류점 뒤 유지 · 되돌림 길이)
// DEM 단면(둑 중앙값 − 수로 최저, Copernicus GLO-30 DSM) — scripts/corridor/dem/sample-pangyo-water.py 출력.
//   본류 기준점은 CROSSINGS(다리 단면), 지류는 OSM 축 50m 마다(판교 bbox 서쪽 x<-600 제외) ±12m 수로 최저 / ±35~70m 둑 중앙값. DSM 이라 나무·건물·다리가 섞임(참고값)
const DEM_STREAM = {
  운중천: { osm: 429222895, reliefM: [0.4, -0.5, 8.9, 10.0, 8.2, 5.7, 7.2, 5.8, 2.8, 2.4, -1.2, 2.4, 0.4, 3.0, 3.5, 2.5, 1.0, 3.2, 4.5, 6.8, 5.0, 4.8, 4.0, 5.3, 4.1, 3.0, 5.8, 4.4, 4.2, 1.5, 4.6, 5.0, 5.6, 6.7, 6.9, 6.1, 3.7, 2.6, 3.2, 5.6, 5.4, 4.8, 4.9, 6.7, 5.7, 6.2, 6.5, 6.1, 0.5, 5.0, 5.0, 3.6, 2.9, 2.3, 5.7, 5.8, 5.2, 6.6, 6.7, 5.5, 1.7] },
  금토천: { osm: 437907484, reliefM: [5.6, 6.0, 6.0, 7.3, 5.3, 9.4, 5.0, 1.8, 6.2, 2.8, 7.5, 3.5, 3.9, 7.1, 5.9, 2.4, 4.7] },
};
const RELIEF_MIN = 2.5; // 이보다 얕은 샘플은 다리·암거·건물 섞임으로 보고 뺌
const D_MAX = 5.0; // 탄천 둔치(6m)보다 1m 이상 얕게 (합류 램프가 자연스럽게)
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const demMed = (k) => median(DEM_STREAM[k].reliefM.filter((r) => r >= RELIEF_MIN));
const demD = (k) => r1(Math.min(D_MAX, demMed(k) - 0.4));

// ---------- 2) 지류: build-streams.mjs 를 임시 루트에서 ----------
const CI = readJSON(path.join(CDIR, 'index.json')), PG = readJSON(path.join(PDIR, 'index.json'));
const S0 = readJSON(path.join(CDIR, 'streams.json'));
const MAIN_KEYS = ['-1_-5', '1_-8', '2_-8']; // 운중천이 지나는 기존 코리더 타일 (streams.json 에서 운중천만 닿는 칸)
const REPLACE = new Set(['429222895', '429222895-1']);
const merge = (a, b) => { if (!b) return a; const o = { ...a }; for (const [k, v] of Object.entries(b)) if (Array.isArray(v) && v.length) o[k] = (a[k] || []).concat(v); return o; }; // = src/corridor/pangyo.js mergeTileJson
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pangyo-water-'));
try {
  const tc = path.join(tmp, 'public/corridor');
  for (const d of ['tiles', 'lod']) fs.mkdirSync(path.join(tc, d), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'scripts/corridor'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts/corridor/build-streams.mjs'), path.join(tmp, 'scripts/corridor/build-streams.mjs'));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  for (const f of ['terrain.json']) fs.symlinkSync(path.join(ROOT, 'public', f), path.join(tmp, 'public', f));
  for (const f of ['tancheon.json', 'base.json']) fs.symlinkSync(path.join(CDIR, f), path.join(tc, f));
  const tiles = {};
  for (const k of MAIN_KEYS) tiles[k] = CI.tiles[k];
  for (const [k, t] of Object.entries(PG.tiles)) tiles[k] = t.mode === 'add' ? CI.tiles[k] : { x0: t.x0, z0: t.z0, nb: t.nb, nr: t.nr };
  fs.writeFileSync(path.join(tc, 'index.json'), JSON.stringify({ meta: CI.meta, tiles }));
  for (const k of Object.keys(tiles)) for (const d of ['tiles', 'lod']) {
    const main = path.join(CDIR, d, k + '.json'), pg = path.join(PDIR, d, k + '.json'), mode = PG.tiles[k]?.mode;
    const j = mode === 'new' ? readJSON(pg) : mode === 'add' ? merge(readJSON(main), fs.existsSync(pg) ? readJSON(pg) : null) : fs.existsSync(main) ? readJSON(main) : null;
    if (j) fs.writeFileSync(path.join(tc, d, k + '.json'), JSON.stringify(j));
  }
  // OSM: 코리더 + 판교 (같은 id 는 판교 쪽 — out geom 이라 길 전체 좌표)
  const seen = new Map();
  for (const f of [OSM_MAIN, OSM_PG]) for (const e of readJSON(f).elements) seen.set(e.type + e.id, e);
  fs.writeFileSync(path.join(tmp, 'osm.json'), JSON.stringify({ elements: [...seen.values()] }));
  const log = execFileSync(process.execPath, [path.join(tmp, 'scripts/corridor/build-streams.mjs'), `--osm=${path.join(tmp, 'osm.json')}`, `--out=${path.join(tmp, 'streams.json')}`], { cwd: tmp, encoding: 'utf8', maxBuffer: 1 << 26 });
  console.log(log.trim().split('\n').map((l) => '  [build-streams] ' + l).join('\n'));
  var SB = readJSON(path.join(tmp, 'streams.json'));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// 운중천 하나 + 판교 타일 안 지류만. 깊이 = DEM
const isUnjung = (s) => s.osm.includes(429222895);
const pgKey = (x, z) => Math.floor(x / 500) + '_' + Math.floor(z / 500);
const streams = SB.streams.filter((s) => isUnjung(s) || s.axis.some(([x, z]) => PG.tiles[pgKey(x, z)]?.mode === 'new'));
const unjung = streams.filter(isUnjung);
if (unjung.length !== 1) throw new Error(`운중천 조각 ${unjung.length}개 (1개여야 함)`);
const dNote = {};
for (const s of streams) {
  const k = Object.keys(DEM_STREAM).find((n) => s.osm.includes(DEM_STREAM[n].osm));
  if (!k) { dNote[s.id] = `D ${s.D} (build-streams 폭 근사, DEM 샘플 없음)`; continue; }
  const D0 = s.D; s.D = demD(k); dNote[s.id] = `D ${s.D} (DEM 둑−수로 중앙값 ${demMed(k)}m − 수면 0.4${s.D === D_MAX ? `, 최대 ${D_MAX}` : ''}; 폭 근사 ${D0})`;
}
const U = unjung[0];
for (const s of streams) if (s !== U && s.into === U.id && s.D > U.D) { dNote[s.id] += ` → 받는 운중천 ${U.D} 로 제한`; s.D = U.D; }
U.id = '429222895'; // streams.json 의 첫 조각 id 를 이어받음 (into 참조 갱신)
for (const s of streams) if (s.into && SB.streams.some((o) => o.id === s.into && isUnjung(o))) s.into = U.id;
// 계단: 깊이가 바뀐 하천은 아래 끝 높이·단 수 다시 (위치는 build-streams 의 단면 검색 그대로)
const byName = new Map(streams.map((s) => [s.name || s.id, s]));
const ids = new Set(streams.map((s) => s.id));
const stairs = SB.stairs.filter((st) => byName.has(st.river)).map((st) => {
  const s = byName.get(st.river), F = -s.D, n = Math.max(3, Math.round(-F / 0.17)), run = st.run;
  return { ...st, flight: [st.flight[0], [st.flight[1][0], st.flight[1][1], F]], steps: n, riser: Math.round((-F / n) * 100) / 100, tread: Math.round((run / n) * 100) / 100 };
});
// 타일 컷: 판교 new 타일 + 운중천만 닿던 코리더 타일(교체). 다른 기존 컷과 겹치면 중단
const allowed = new Set([...MAIN_KEYS, ...Object.keys(PG.tiles)]);
for (const fld of ['tiles', 'lod']) for (const k of Object.keys(SB[fld])) {
  if (!allowed.has(k)) delete SB[fld][k];
  else if (S0[fld][k] && !MAIN_KEYS.includes(k)) throw new Error(`${fld} ${k}: streams.json 컷과 겹침`);
}
for (const k of MAIN_KEYS) {
  const others = S0.streams.filter((s) => !REPLACE.has(s.id) && s.axis.some(([x, z]) => Math.abs(x - (+k.split('_')[0] * 500 + 250)) < 320 && Math.abs(z - (+k.split('_')[1] * 500 + 250)) < 320));
  if (others.length) throw new Error(`${k}: 운중천 말고 다른 지류(${others.map((s) => s.id)})도 닿음 — 컷 교체 불가`);
}
// 다리: streams.json 에 이미 있는 것은 빼고
const bkey = (b) => b.p.map((p) => p.join(',')).join(';');
const have = new Set(S0.bridges.map(bkey));
const bridges = SB.bridges.filter((b) => !have.has(bkey(b)));
const fordHave = new Set(S0.fords.map((f) => f.osm));
const fords = SB.fords.filter((f) => !fordHave.has(f.osm) && byName.has(f.river));

// ---------- 1) 본류 낙차 ----------
const T = readJSON(path.join(ROOT, 'public/terrain.json')), TAN = readJSON(path.join(CDIR, 'tancheon.json'));
const ax = T.axis.slice(0, TAN.from).concat(TAN.axis), N = ax.length;
const cum = [0]; for (let i = 1; i < N; i++) cum.push(cum[i - 1] + Math.hypot(ax[i][0] - ax[i - 1][0], ax[i][1] - ax[i - 1][1]));
const nearest = ([x, z]) => { let bi = 0, bd = Infinity; ax.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - z); if (d < bd) { bd = d; bi = i; } }); return { i: bi, d: bd }; };
const iG = nearest(GN.at), iY = nearest(YH.at), iC = nearest(U.axis[U.axis.length - 1]);
if (iG.d > 40 || iY.d > 40 || iC.d > 60) throw new Error(`기준점이 축에서 멀다 ${JSON.stringify([iG, iY, iC])}`);
const sG = cum[iG.i], sY = cum[iY.i], sC = cum[iC.i], sH = sC + HOLD, sE = sH + RET;
const live = CI.meta.liveBox;
const dzAt = (s) => (s <= sG ? 0 : s <= sY ? DZ_YH * smoothstep((s - sG) / (sY - sG)) : s <= sH ? DZ_YH : s <= sE ? DZ_YH * (1 - smoothstep((s - sH) / RET)) : 0);
let i0 = -1, i1 = -1; const dz = [];
for (let i = 0; i < N; i++) { const v = r3(dzAt(cum[i])); if (v !== 0) { if (i0 < 0) i0 = i; i1 = i; } }
for (let i = i0; i <= i1; i++) dz.push(r3(dzAt(cum[i])));
for (let i = i0; i <= i1; i++) { const [x, z] = ax[i]; if (x >= live.x0 - 60 && x <= live.x1 + 60 && z >= live.z0 - 60 && z <= live.z1 + 60) throw new Error(`낙차가 정자 liveBox 근처(${i})`); }

const out = {
  meta: {
    generated: new Date().toISOString(), attribution: '© OpenStreetMap contributors (ODbL) · Copernicus GLO-30 DEM (© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA)',
    note: '정자→판교 탄천 수위(본류 둑 대비 낙차) + 판교 지류. ?pangyowater=0 / ?pangyo=0 이면 미사용. 낙차는 공개 기준점(궁내교 7.6m 일치 · 양현교 높이 9m) 사이 보간이고 실측 수위가 아님',
    sources: { 궁내교: { ...GN.public, dem: GN.dem }, 양현교: { ...YH.public, dem: YH.dem }, streamsDem: DEM_STREAM, streamsBuilder: 'scripts/corridor/build-streams.mjs (unmodified, temp root: pangyo tiles + ' + MAIN_KEYS.join(',') + ')' },
    defaults: { HOLD, RET, RELIEF_MIN, D_MAX, interp: 'smoothstep 궁내교→양현교', dNote },
    anchors: { 궁내교: { i: iG.i, s: Math.round(sG), dz: 0, deckToBed: GAME.deckH - GAME.BED }, 양현교: { i: iY.i, s: Math.round(sY), dz: DZ_YH, deckToBed: r1(GAME.deckH - GAME.BED - DZ_YH) }, 운중천합류: { i: iC.i, s: Math.round(sC), dz: DZ_YH }, 끝: { i: i1, s: Math.round(sE) } },
  },
  main: { axisN: N, axisCheck: [ax[i0], ax[i1]].map((p) => p.map(r1)), from: i0, dz },
  streams: { replace: [...REPLACE], streams, stairs, bridges, fords, tiles: SB.tiles, lod: SB.lod },
};
fs.writeFileSync(OUT, JSON.stringify(out));
for (const s of streams) console.log(`${String(s.id).padEnd(11)} ${(s.name || '(이름없음)').padEnd(5)} L=${(s.axis.length * 2 / 1000).toFixed(2)}km into=${s.into} ${dNote[s.id]} start=${s.axis[0].map(Math.round)} end=${s.axis.at(-1).map(Math.round)} fill=${s.sc.filter((v) => v === 0).length}`);
console.log(JSON.stringify({ i0, i1, anchors: out.meta.anchors, stairs: stairs.length, bridges: bridges.length, fords: fords.length, tiles: Object.keys(SB.tiles), lod: Object.keys(SB.lod), kb: Math.round(fs.statSync(OUT).size / 1024) }));
