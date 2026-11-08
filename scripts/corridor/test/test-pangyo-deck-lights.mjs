// [pangyo-deck-lights] 판교역 광장 데크 가장자리 야간 조명: 공유 데이터에서 만들기 · 메시 1개 · 저녁 스위치 · 플래그
import './dom-shim.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { buildPangyoDeckLights, pangyoDeckLightsEnabled, deckEdges, DECK_LIGHTS } from '../../../src/corridor/landmarks/pangyoDeckLights.js';
import { createPangyoLandmarks } from '../../../src/corridor/landmarks/pangyo.js';
import { setEvening } from '../../../src/evening.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const pg = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/corridor/pangyo/index.json'), 'utf8'));
const deck = pg.landmarks.find((l) => l.model === 'pangyoDeck');
let n = 0; const ok = (m) => console.log(`ok ${++n} ${m}`);
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [a, b] = r[i], [p, q] = r[j]; if ((b > z) !== (q > z) && x < ((p - a) * (z - b)) / (q - b) + a) c = !c; } return c; };

// 1) 플래그
{
  assert.equal(pangyoDeckLightsEnabled(''), true);
  assert.equal(pangyoDeckLightsEnabled('?pangyodeckled=0'), false);
  assert.equal(pangyoDeckLightsEnabled('?pangyo=0'), false);
  assert.equal(pangyoDeckLightsEnabled('?hour=21&pangyodeckled=1'), true);
  assert.equal(buildPangyoDeckLights(deck, { enabled: false }), null);
  assert.equal(buildPangyoDeckLights(null, { enabled: true }), null);
  ok('?pangyodeckled=0 / ?pangyo=0 flags, missing data → null');
}

// 2) 테두리: 데이터 외곽 그대로, 법선은 바깥, 조각 길이 ≤ SEG, 둘레 = 외곽 길이
{
  const p = deck.parts[0], E = deckEdges(p);
  let per = 0; for (let i = 0; i < p.o.length; i++) per += Math.hypot(p.o[(i + 1) % p.o.length][0] - p.o[i][0], p.o[(i + 1) % p.o.length][1] - p.o[i][1]);
  const sum = E.reduce((s, e) => s + e.L, 0);
  assert.ok(Math.abs(sum - per) < 0.01 * (p.holes?.length ? 3 : 1) || p.holes?.length, `둘레 ${sum} vs ${per}`);
  let inner = 0;
  for (const e of E) {
    assert.ok(e.L <= DECK_LIGHTS.SEG + 1e-6);
    const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2;
    assert.ok(!inRing(mx + e.nx * 0.2, mz + e.nz * 0.2, p.o), '법선은 데크 바깥');
    inner += inRing(mx - e.nx * 0.2, mz - e.nz * 0.2, p.o);
  }
  assert.ok(inner > E.length * 0.95, `안쪽은 데크 ${inner}/${E.length}`); // 아주 좁은 꺾임 몇 곳 제외
  // 반대 방향 링(시계/반시계)이어도 바깥
  const E2 = deckEdges({ o: [...p.o].reverse() });
  for (const e of E2) assert.ok(!inRing((e.ax + e.bx) / 2 + e.nx * 0.5, (e.az + e.bz) / 2 + e.nz * 0.5, p.o));
  ok(`perimeter from shared deck outline (${E.length} pieces, ${per.toFixed(0)} m), outward normals`);
}

// 3) 높이는 데이터를 따른다 (데크를 올리거나 내려도)
{
  const ys = (l) => { const m = buildPangyoDeckLights(l, { enabled: true }); const a = m.geometry.attributes.position; let lo = Infinity, hi = -Infinity; for (let i = 0; i < a.count; i++) { lo = Math.min(lo, a.getY(i)); hi = Math.max(hi, a.getY(i)); } return [lo, hi, m]; };
  const p = deck.parts[0];
  const [lo, hi] = ys(deck);
  assert.ok(lo > p.mh - 0.2 && lo < p.mh, `밑면 빛은 데크 밑(${p.mh}) 바로 아래: ${lo}`);
  assert.ok(hi > p.h + 1.1 && hi < p.h + 1.8, `위 줄·번짐은 난간(상판 ${p.h} + 1.1) 바로 위: ${hi}`);
  const hiDeck = JSON.parse(JSON.stringify(deck)); hiDeck.parts[0].mh = 20; hiDeck.parts[0].h = 22;
  const [lo2, hi2] = ys(hiDeck);
  assert.ok(Math.abs(lo2 - lo - 10) < 1e-3 && Math.abs(hi2 - hi - 10) < 1e-3, 'deck +10m → lights +10m');
  ok(`heights follow data (deck ${p.mh}–${p.h} m → lights ${lo.toFixed(2)}–${hi.toFixed(2)} m)`);
}

// 4) 메시 1개 · 재질 공유(타일 재빌드해도 하나) · 가산 발광 셰이더 · 진짜 조명 없음 · 삼각형 수 상한
{
  const a = buildPangyoDeckLights(deck, { enabled: true }), b = buildPangyoDeckLights(deck, { enabled: true });
  assert.ok(a.isMesh && a.material === b.material, '재질 공유');
  assert.ok(a.material.isShaderMaterial && a.material.blending === THREE.AdditiveBlending && a.material.depthWrite === false);
  assert.ok('uTime' in a.material.uniforms && 'uFade' in a.material.uniforms);
  assert.ok(/logdepthbuf_vertex/.test(a.material.vertexShader), 'logarithmicDepthBuffer 청크');
  assert.equal(a.children.length, 0);
  const tris = a.geometry.index.count / 3;
  assert.ok(tris < 6000, `tris ${tris}`);
  const lm = createPangyoLandmarks(pg);
  const key = lm.keys.find((k) => pg.landmarks.some((l) => l.model === 'pangyoDeck' && `${Math.floor(l.pos.x / 500)}_${Math.floor(l.pos.z / 500)}` === k));
  const g = lm.build(key), found = [];
  g.traverse((o) => { if (o.name === 'pangyoDeckLights') found.push(o); if (o.isLight) assert.fail('no real lights'); });
  assert.equal(found.length, 1, '데크 타일에 조명 메시 1개');
  ok(`one mesh, shared additive ShaderMaterial, ${tris} tris, attached to deck tile`);
}

// 5) 저녁 스위치: 낮엔 숨김, 저녁이면 보임 (nightFade 페이드가 끝나면 숨김)
{
  const scene = new THREE.Scene();
  setEvening(false);
  const m = buildPangyoDeckLights(deck, { enabled: true }); scene.add(m);
  assert.equal(m.visible, false, '낮: 숨김 → draw 0');
  setEvening(true);
  assert.equal(m.visible, true, '저녁: 보임');
  m.onBeforeRender(); assert.ok(m.material.uniforms.uFade.value >= 0 && m.material.uniforms.uFade.value <= 1);
  setEvening(false);
  assert.equal(m.visible, true, '끄는 페이드 동안은 보임');
  // 씬에서 떨어진(타일 해제) 메시는 저녁 전환 때 집합에서 빠지고 다시 켜지지 않는다
  scene.remove(m); m.visible = false; setEvening(true);
  assert.equal(m.visible, false, '해제된 메시는 건드리지 않음');
  setEvening(false);
  ok('evening switch: hidden by day, shown at night, detached meshes released');
}

// 6) 로고·광고 문구 없음 (텍스처·캔버스 글자 없음)
{
  const src = fs.readFileSync(path.join(ROOT, 'src/corridor/landmarks/pangyoDeckLights.js'), 'utf8');
  assert.ok(!/CanvasTexture|fillText|TextureLoader|\.png|\.jpg/.test(src));
  ok('no textures/text (procedural only)');
}
console.log(`pangyo-deck-lights: ${n} ok`);
