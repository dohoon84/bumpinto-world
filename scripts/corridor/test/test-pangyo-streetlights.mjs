// [pangyo-streetlights] 판교역 일대 가로등: 굽기 재현 · 배치 규칙(범위·데크·건물·차도) · 런타임(인스턴싱 3메시 · 데크 LED 와 같은 켜짐 값) · 플래그
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as THREE from 'three';
import { setEvening } from '../../../src/evening.js';
import { nightFade, nightTarget } from '../../../src/world/nightFade.js';
import { createPangyoStreetlights, pangyoLampsEnabled } from '../../../src/corridor/pangyoStreetlights.js';
import { createStreetlights } from '../../../src/world/streetlights.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let n = 0; const ok = (m) => console.log(`ok ${++n} ${m}`);
const FILE = 'public/corridor/pangyo/streetlights.json';
const data = J(FILE), pg = J('public/corridor/pangyo/index.json'), B = pg.meta.boxes;
const inB = (x, z) => B.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [a, b] = r[i], [p, q] = r[j]; if ((b > z) !== (q > z) && x < ((p - a) * (z - b)) / (q - b) + a) c = !c; } return c; };
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };

// 1) 플래그
assert.equal(pangyoLampsEnabled(''), true);
assert.equal(pangyoLampsEnabled('?pangyolamps=0'), false);
assert.equal(pangyoLampsEnabled('?pangyo=0'), false);
assert.equal(pangyoLampsEnabled('?streetlights=0'), false);
ok('?pangyolamps=0 / ?pangyo=0 / ?streetlights=0 → off');

// 2) 다시 구우면 같은 결과
{
  const tmp = path.join(os.tmpdir(), `pg-sl-${process.pid}.json`);
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/corridor/build-streetlights.mjs'), '--pangyo', `--out=${tmp}`], { stdio: 'pipe' });
  assert.equal(fs.readFileSync(tmp, 'utf8'), fs.readFileSync(path.join(ROOT, FILE), 'utf8'), '다시 구운 결과가 커밋된 pangyo/streetlights.json 과 다름 (npm run corridor:streetlights -- --pangyo)');
  fs.unlinkSync(tmp);
  ok('rebake (--pangyo) is byte-identical');
}

// 3) 배치 규칙
const L = []; for (let i = 0; i < data.lamps.length; i += 5) L.push({ x: data.lamps[i], z: data.lamps[i + 1], yaw: data.lamps[i + 2], kind: data.lamps[i + 3], y: data.lamps[i + 4] });
{
  assert.ok(L.length >= 150, `가로등 ${L.length}`);
  assert.equal(data.meta.osm.streetLampNodes, 0, 'OSM street_lamp 개수 기록');
  assert.ok(L.every((l) => inB(l.x, l.z)), '모두 판교 범위 안');
  const deck = pg.landmarks.find((l) => l.id === 'pangyo-deck').parts[0];
  const dl = L.filter((l) => l.kind === 4), gl = L.filter((l) => l.kind !== 4);
  assert.ok(dl.length >= 20, `데크 보행등 ${dl.length}`);
  assert.ok(dl.every((l) => inRing(l.x, l.z, deck.o) && l.y === deck.h), '데크 등은 데크 위(윗면 높이)');
  assert.ok(gl.every((l) => l.y === -1), '땅 위 등은 지형 높이');
  // 땅 위 10 m 기둥은 데크(밑면 10 m) · 낮은 매스 아래에 서지 않음
  const low = []; for (const lm of pg.landmarks) for (const p of lm.parts || []) if ((p.mh || 0) < 11) low.push(p.o);
  for (const k of Object.keys(pg.tiles)) for (const b of J(`public/corridor/pangyo/tiles/${k}.json`).b || []) if ((b.mh || 0) < 11) low.push(b.o);
  const bad = gl.filter((l) => low.some((o) => inRing(l.x, l.z, o)));
  assert.equal(bad.length, 0, `건물·데크 안 가로등 ${bad.length}`);
  // 차도 위에 서지 않음 (판교 타일 차도)
  const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'living_street', 'road']);
  let onRoad = 0;
  for (const k of Object.keys(pg.tiles)) for (const r of J(`public/corridor/pangyo/tiles/${k}.json`).r || []) if (CAR.has(r.k) && !r.br) for (let i = 1; i < r.p.length; i++) for (const l of gl) if (segD(l.x, l.z, r.p[i - 1], r.p[i]) < r.w / 2 - 0.3) onRoad++;
  assert.equal(onRoad, 0, `차도 위 가로등 ${onRoad}`);
  // 같은 종류끼리 너무 가깝지 않음
  let close = 0; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if ((L[i].kind === 4) === (L[j].kind === 4) && Math.hypot(L[i].x - L[j].x, L[i].z - L[j].z) < 3.5) close++;
  assert.equal(close, 0, `3.5 m 안 겹침 ${close}`);
  ok(`placement: ${L.length} lamps (ground ${gl.length}, deck ${dl.length}) in boxes, none under deck/low masses or on roads`);
}

// 4) 런타임: 메시 3개 · 타일 빌드 기준 표시 · 밤 값 = 데크 LED 와 같은 nightFade()
{
  globalThis.fetch = async () => ({ ok: true, json: async () => data });
  setEvening(false);
  const scene = new THREE.Scene();
  const tiles = new Map(Object.keys(pg.tiles).map((k) => [k, { dState: 0 }]));
  const pl = createPangyoStreetlights({ scene, terrain: null, corridor: { tiles }, url: 'x' });
  await pl.ready;
  assert.equal(pl.stats.lamps, L.length);
  const fx = 250, fz = -3120;
  pl.update(1, fx, fz, 'follow');
  assert.equal(pl.root.children.length, 0, '상세 타일 없으면 메시 없음');
  for (const t of tiles.values()) t.dState = 3;
  pl.update(1, fx, fz, 'follow');
  const ms = pl.root.children;
  assert.equal(ms.length, 3); assert.ok(ms.every((m) => m.isInstancedMesh));
  assert.ok(pl.stats.visible > 50, `보이는 등 ${pl.stats.visible}`);
  const pool = ms.find((m) => m.name.endsWith('pool'));
  assert.equal(pool.visible, false, '낮엔 웅덩이 숨김 (draw +2)');
  setEvening(true);
  assert.equal(nightTarget(), 1);
  pl.update(0.016, fx, fz, 'follow');
  assert.ok(Math.abs(pl.stats.night - nightFade()) < 1e-3, '데크 LED 와 같은 공용 값');
  await new Promise((r) => setTimeout(r, 300));
  pl.update(0.3, fx, fz, 'follow');
  assert.ok(pl.stats.night > 0 && Math.abs(pl.stats.night - nightFade()) < 0.02);
  assert.equal(pool.visible, true, '저녁엔 웅덩이 켜짐 (draw +3)');
  pl.update(1, fx, fz, 'overview');
  assert.ok(pl.stats.overview === L.length && ms.find((m) => m.name.endsWith('body')).visible === false, '위에서 보기: 웅덩이만');
  pl.update(1, 5000, 5000, 'follow');
  assert.equal(pl.root.children.length, 0, '멀어지면 GPU 버퍼 해제');
  pl.dispose(); setEvening(false);
  ok('runtime: 3 InstancedMesh, tile-gated, night value === shared nightFade (deck LEDs), overview pools only, freed when far');
}

// 5) 코리더 가로등 skipBoxes: 판교 범위 안은 건너뜀
{
  const main = J('public/corridor/streetlights.json');
  globalThis.fetch = async () => ({ ok: true, json: async () => main });
  const CI = J('public/corridor/index.json');
  const mk = (skipBoxes) => createStreetlights({ scene: new THREE.Scene(), corridor: { tiles: new Map(Object.keys(CI.tiles).map((k) => [k, { dState: 3 }])) }, liveBox: J('public/jeongja.json').meta.bboxLocal, url: 'x', skipBoxes });
  const a = mk([]), b = mk(B); await a.ready; await b.ready;
  let inside = 0; for (const arr of Object.values(main.cells)) for (let i = 0; i < arr.length; i += 4) if (inB(arr[i], arr[i + 1])) inside++;
  assert.ok(inside > 0);
  assert.equal(a.stats.lamps - b.stats.lamps, inside);
  a.dispose(); b.dispose();
  ok(`corridor lamps inside pangyo boxes skipped when pangyo lamps on (${inside})`);
}
console.log('pangyo streetlights: all ok');
