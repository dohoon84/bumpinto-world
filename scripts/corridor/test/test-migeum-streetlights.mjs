// [migeum-lamps] 미금역 일대 가로등: 굽기 재현(미금 · 판교 그대로) · 배치 규칙(범위·탄천 띠·출입구·건물·차도) · 런타임(3메시 · 판교와 같은 nightFade) · 플래그 · skipBoxes
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import pc from 'polygon-clipping';
import { setEvening } from '../../../src/evening.js';
import { nightFade, nightTarget } from '../../../src/world/nightFade.js';
import { createMigeumStreetlights, migeumLampsEnabled, MIGEUM_LAMPS_FILE } from '../../../src/corridor/migeumStreetlights.js';
import { createPangyoStreetlights } from '../../../src/corridor/pangyoStreetlights.js';
import { createStreetlights } from '../../../src/world/streetlights.js';
import { mergeTancheon } from '../../../src/corridor/tancheon.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let n = 0; const ok = (m) => console.log(`ok ${++n} ${m}`);
const FILE = 'public/corridor/' + MIGEUM_LAMPS_FILE;
const data = J(FILE), mg = J('public/corridor/migeum/index.json'), B = mg.meta.boxes;
const inB = (x, z) => B.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [a, b] = r[i], [p, q] = r[j]; if ((b > z) !== (q > z) && x < ((p - a) * (z - b)) / (q - b) + a) c = !c; } return c; };
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
// 탄천 제방 띠 (build-pangyo.mjs --region=migeum STRIP 과 같은 계산)
const T = mergeTancheon(J('public/terrain.json'), J('public/corridor/tancheon.json'));
const strip = (() => {
  const ax = T.axis, prof = T.prof, N = ax.length, left = [], right = [];
  for (let i = 0; i < N; i += 2) {
    const a = ax[Math.max(0, i - 1)], b = ax[Math.min(N - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;
    right.push([ax[i][0] + nx * (prof.topR[i] + 0.6), ax[i][1] + nz * (prof.topR[i] + 0.6)]); left.push([ax[i][0] - nx * (prof.topL[i] + 0.6), ax[i][1] - nz * (prof.topL[i] + 0.6)]);
  }
  const ring = [...right, ...left.reverse()]; ring.push(ring[0]); return pc.union([[ring]]);
})();
const inStrip = (x, z) => strip.some((p) => inRing(x, z, p[0]) && !p.slice(1).some((h) => inRing(x, z, h)));

// 1) 플래그
assert.equal(migeumLampsEnabled(''), true);
assert.equal(migeumLampsEnabled('?migeumlamps=0'), false);
assert.equal(migeumLampsEnabled('?migeum=0'), false);
assert.equal(migeumLampsEnabled('?streetlights=0'), false);
assert.equal(migeumLampsEnabled('?pangyolamps=0'), true);
ok('?migeumlamps=0 / ?migeum=0 / ?streetlights=0 → off (?pangyolamps=0 은 상관없음)');

// 2) 다시 구우면 같은 결과 — 미금(--migeum · --region=migeum) + 판교는 그대로
{
  for (const [args, file] of [[['--migeum'], FILE], [['--region=migeum'], FILE], [['--pangyo'], 'public/corridor/pangyo/streetlights.json']]) {
    const tmp = path.join(os.tmpdir(), `mg-sl-${process.pid}.json`);
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/corridor/build-streetlights.mjs'), ...args, `--out=${tmp}`], { stdio: 'pipe' });
    assert.equal(fs.readFileSync(tmp, 'utf8'), fs.readFileSync(path.join(ROOT, file), 'utf8'), `다시 구운 결과가 ${file} 과 다름 (build-streetlights.mjs ${args.join(' ')})`);
    fs.unlinkSync(tmp);
  }
  ok('rebake --migeum / --region=migeum byte-identical; --pangyo unchanged');
}

// 3) 배치 규칙
const L = []; for (let i = 0; i < data.lamps.length; i += 5) L.push({ x: data.lamps[i], z: data.lamps[i + 1], yaw: data.lamps[i + 2], kind: data.lamps[i + 3], y: data.lamps[i + 4] });
const main = J('public/corridor/streetlights.json');
const corIn = []; for (const arr of Object.values(main.cells)) for (let i = 0; i < arr.length; i += 4) if (inB(arr[i], arr[i + 1])) corIn.push({ x: arr[i], z: arr[i + 1], kind: arr[i + 3] });
{
  assert.ok(L.length >= 300, `가로등 ${L.length}`);
  assert.equal(data.meta.osm.streetLampNodes, 0, 'OSM street_lamp 개수 기록');
  assert.equal(J('data/osm_migeum_streetlights_raw.json').elements.filter((e) => e.tags.highway === 'street_lamp' || e.tags.man_made === 'street_lamp' || e.tags.light_source).length, 0);
  assert.ok(L.every((l) => inB(l.x, l.z)), '모두 미금 범위 안');
  assert.ok(L.every((l) => l.y === -1 && l.kind !== 4), '데크 없음 · 모두 지형 높이');
  // 탄천 띠 안 = 기존 코리더 가로등 그대로(새로 만든 것 없음)
  const inS = L.filter((l) => inStrip(l.x, l.z)), corS = corIn.filter((l) => inStrip(l.x, l.z));
  assert.equal(inS.length, corS.length, `띠 안 ${inS.length} vs 코리더 ${corS.length}`);
  assert.ok(corS.every((c) => inS.some((l) => Math.abs(l.x - c.x) < 0.051 && Math.abs(l.z - c.z) < 0.051 && l.kind === c.kind)), '띠 안 코리더 가로등이 그대로 옮겨짐');
  assert.equal(data.meta.counts.keptStrip, corS.length);
  assert.equal(data.meta.counts.corridorReplaced, corIn.length);
  // 출입구 캐노피 5 m 안 없음
  const ent = mg.landmarks.flatMap((l) => l.entrances || []).filter((e) => !e.indoor);
  assert.ok(ent.length > 0);
  assert.equal(L.filter((l) => ent.some((e) => Math.hypot(e.x - l.x, e.z - l.z) < 5)).length, 0, '출입구 둘레');
  // 낮은 매스(밑면 11 m 미만) 안 · 차도 위 없음 (미금 타일)
  const low = []; for (const k of Object.keys(mg.tiles)) for (const b of J(`public/corridor/migeum/tiles/${k}.json`).b || []) if ((b.mh || 0) < 11) low.push(b.o);
  const gen = L.filter((l) => !inStrip(l.x, l.z));
  assert.equal(gen.filter((l) => low.some((o) => inRing(l.x, l.z, o))).length, 0, '건물 안 가로등');
  const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'living_street', 'road']);
  let onRoad = 0;
  for (const k of Object.keys(mg.tiles)) for (const r of J(`public/corridor/migeum/tiles/${k}.json`).r || []) if (CAR.has(r.k) && !r.br) for (let i = 1; i < r.p.length; i++) for (const l of gen) if (segD(l.x, l.z, r.p[i - 1], r.p[i]) < r.w / 2 - 0.3) onRoad++;
  assert.equal(onRoad, 0, `차도 위 가로등 ${onRoad}`);
  let close = 0; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z) < 3.5) close++;
  assert.equal(close, 0, `3.5 m 안 겹침 ${close}`);
  // 간격 규칙 기록(판교와 같은 값)
  const sp = data.meta.spacing; assert.ok(sp.primary === 35 && sp.secondary === 35 && sp.trunk === 35 && sp.tertiary === 40 && sp.primary_link === 40 && sp.residential === 50 && !('deck' in sp));
  ok(`placement: ${L.length} lamps in box, strip = corridor lamps kept (${corS.length}), none near entrances / in low masses / on roads`);
}

// 4) 런타임: 메시 3개(migeumLamp-*) · 타일 빌드 기준 · 밤 값 = 판교 가로등과 같은 nightFade()
{
  const pgData = J('public/corridor/pangyo/streetlights.json');
  globalThis.fetch = async (u) => ({ ok: true, json: async () => (u === 'pg' ? pgData : data) });
  setEvening(false);
  const scene = new THREE.Scene();
  const tiles = new Map(Object.keys(mg.tiles).map((k) => [k, { dState: 0 }]));
  const ml = createMigeumStreetlights({ scene, terrain: null, corridor: { tiles }, url: 'x' });
  const pl = createPangyoStreetlights({ scene, terrain: null, corridor: { tiles: new Map() }, url: 'pg' });
  await ml.ready; await pl.ready;
  assert.equal(ml.stats.lamps, L.length);
  assert.equal(ml.root.name, 'migeumLamps'); assert.equal(pl.root.name, 'pangyoLamps');
  const fx = 60, fz = 1830;
  ml.update(1, fx, fz, 'follow');
  assert.equal(ml.root.children.length, 0, '상세 타일 없으면 메시 없음');
  for (const t of tiles.values()) t.dState = 3;
  ml.update(1, fx, fz, 'follow');
  const ms = ml.root.children;
  assert.equal(ms.length, 3); assert.ok(ms.every((m) => m.isInstancedMesh && m.name.startsWith('migeumLamp-')));
  assert.ok(ml.stats.visible > 50, `보이는 등 ${ml.stats.visible}`);
  const pool = ms.find((m) => m.name.endsWith('pool'));
  assert.equal(pool.visible, false, '낮엔 웅덩이 숨김');
  setEvening(true);
  assert.equal(nightTarget(), 1);
  await new Promise((r) => setTimeout(r, 300));
  ml.update(0.3, fx, fz, 'follow'); pl.update(0.3, 250, -3120, 'follow');
  assert.ok(ml.stats.night > 0 && Math.abs(ml.stats.night - nightFade()) < 0.02 && Math.abs(ml.stats.night - pl.stats.night) < 0.02, '판교 가로등 · 데크 LED 와 같은 공용 값');
  assert.equal(pool.visible, true, '저녁엔 웅덩이 켜짐');
  ml.update(1, fx, fz, 'overview');
  assert.ok(ml.stats.overview === L.length && ms.find((m) => m.name.endsWith('body')).visible === false, '위에서 보기: 웅덩이만');
  ml.update(1, 5000, 5000, 'follow');
  assert.equal(ml.root.children.length, 0, '멀어지면 GPU 버퍼 해제');
  ml.dispose(); pl.dispose(); setEvening(false);
  ok('runtime: 3 InstancedMesh (migeumLamp-*), tile-gated, night value === shared nightFade (same as pangyo lamps), overview pools only, freed when far');
}

// 5) 코리더 가로등 skipBoxes: 미금 범위 안(-1_2 · 0_2 칸)은 건너뜀
{
  globalThis.fetch = async () => ({ ok: true, json: async () => main });
  const CI = J('public/corridor/index.json');
  const mk = (skipBoxes) => createStreetlights({ scene: new THREE.Scene(), corridor: { tiles: new Map(Object.keys(CI.tiles).map((k) => [k, { dState: 3 }])) }, liveBox: J('public/jeongja.json').meta.bboxLocal, url: 'x', skipBoxes });
  const a = mk([]), b = mk(B); await a.ready; await b.ready;
  assert.ok(corIn.length > 0);
  assert.equal(a.stats.lamps - b.stats.lamps, corIn.length);
  assert.ok(corIn.every((l) => ['-1_2', '0_2'].includes(`${Math.floor(l.x / 500)}_${Math.floor(l.z / 500)}`)), '겹치는 코리더 칸은 -1_2 · 0_2');
  a.dispose(); b.dispose();
  ok(`corridor lamps inside migeum box skipped when migeum lamps on (${corIn.length})`);
}
console.log('migeum streetlights: all ok');
