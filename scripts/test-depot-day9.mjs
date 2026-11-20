// [depot-story] 9일차 '시식 전쟁' — E17 떡볶이 수레(과속 · 출렁) + E18 반기철 대신 장보기(handOver) + 10일차 준비 중. DOM 없이 동작.
//   node scripts/test-depot-day9.mjs   (npm run depot:day9:test)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { E17, E18, D9_SPOTS, evalE17, evalE18, handOverPick, createWagon, createDay9Props } from '../src/depot/story/day9.js';
import EVENTS from '../src/depot/story/data/events.json' with { type: 'json' };
import TARGETS from '../src/depot/story/data/targets.json' with { type: 'json' };
import EXIT from '../src/depot/story/data/exit-rules.json' with { type: 'json' };
import CUES from '../src/depot/story/data/audio-cues.json' with { type: 'json' };
import D8 from '../src/depot/story/data/day8-script.json' with { type: 'json' };
import D9 from '../src/depot/story/data/day9-script.json' with { type: 'json' };

const ev = Object.fromEntries(EVENTS.events.map((e) => [e.id, e]));
const tg = Object.fromEntries(TARGETS.targets.map((t) => [t.id, t]));
const L9 = Object.fromEntries(D9.map((b) => [b.id, b]));
const idx = readFileSync(new URL('../src/depot/story/index.js', import.meta.url), 'utf8');
const W2V = EVENTS.week2Vitality;

// ---------- 데이터 ----------
assert.equal(D9[0].id, 'd9_000'); assert.equal(D8.find((b) => b.cmd === 'day.end').next, 'd9_000');
const ids = new Set(D9.map((b) => b.id));
const refs = (b) => [b.next, b.resume, b.onMissed, b.onCheckout, b.default, ...(b.choices || []).map((c) => c.goto), ...Object.values(b.cases || {})].flat().filter((x) => typeof x === 'string' && /^[dw]\d+_\d+/.test(x));
for (const b of D9) for (const r of refs(b)) assert.ok(ids.has(r) || r === 'd10_000', `${b.id} → ${r}`);
assert.equal(L9.d9_023.event, 'E17'); assert.equal(L9.d9_051.event, 'E18'); assert.equal(L9.d9_051.handOver, true);
assert.equal(L9.d9_080.cmd, 'day.end'); assert.equal(L9.d9_080.next, 'd10_000');
assert.match(idx, /9: 'E17'/); assert.match(idx, /9: 'E18'/); assert.match(idx, /이야기는 준비 중이에요/, 'Day 10 준비 중 (SCRIPTS[10] 없음)');
assert.equal(W2V.main.E17, 10); assert.equal(W2V.side.E18, 3);
assert.deepEqual(EXIT.ignoreEvent.chainMissed.d9_023, ['E17', 'E18']);
for (const b of D9) if (b.stage) for (const [, at] of Object.entries(b.stage)) if (at) assert.ok(tg[at], `${b.id} ${at}`);
assert.ok(Math.hypot(D9_SPOTS.chairSpy.x - tg['massage-chair'].x, D9_SPOTS.chairSpy.z - tg['massage-chair'].z) < 2.5, '안마의자 옆');
assert.ok(Math.hypot(D9_SPOTS.stand.x - tg['sample-corner-2'].x, D9_SPOTS.stand.z - tg['sample-corner-2'].z) < 2.5, '2호 시식대');

// 경로: 8일차 결과 → 9일차 오프닝 갈래, E17/E18 결과 갈래 → day.end
function walk({ ev = {}, flags = {}, mission = {} }) {
  const val = (on) => { const [k, ...r] = on.split('.'); const id = r.join('.'); return k === 'flag' ? flags[id] : k === 'ev' ? ev[id] : k === 'mission' ? mission[id.split('.')[0]] : null; };
  const seen = [], stage = {}; let cur = 'd9_000', n = 0;
  while (cur && L9[cur] && n++ < 200) {
    const b = L9[cur]; seen.push(cur); if (b.stage) Object.assign(stage, b.stage);
    if (b.cmd === 'day.end') break;
    if (b.cmd === 'branch') { const v = val(b.on); cur = (v != null && b.cases[String(v)]) || b.default; continue; }
    if (b.cmd === 'mission.start') { cur = mission[b.event] === 'missed' ? b.onMissed : b.resume; continue; }
    cur = b.next || b.choices?.[0]?.goto;
  }
  return { seen, end: cur, stage };
}
const good = walk({ ev: { E15: 'success', E16: 'success', E17: 'success' }, flags: { w1Ending: 'A' }, mission: { E17: 'success', E18: 'success' } });
const bad = walk({ ev: { E15: 'fail', E16: 'missed', E17: 'fail' }, flags: { w1Ending: 'B' }, mission: { E17: 'fail', E18: 'missed' } });
for (const p of [good, bad]) { assert.equal(p.end, 'd9_080'); for (const [w, at] of Object.entries(p.stage)) assert.equal(at, null, `stage ${w} 치움`); }
assert.ok(good.seen.includes('d9_003') && good.seen.includes('d9_006') && good.seen.includes('d9_019') && good.seen.includes('d9_031') && good.seen.includes('d9_054') && good.seen.includes('d9_066'));
assert.ok(bad.seen.includes('d9_004') && bad.seen.includes('d9_007') && bad.seen.includes('d9_020') && bad.seen.includes('d9_035') && bad.seen.includes('d9_058') && bad.seen.includes('d9_067'));

// ---------- 소리 ----------
const sfxSrc = readFileSync(new URL('../src/depot/story/sfx.js', import.meta.url), 'utf8');
const syn = new Set([...sfxSrc.matchAll(/^\s+'([\w.-]+)': \[\[/gm)].map((m) => m[1]));
const moods = new Set([...sfxSrc.matchAll(/^\s+'(bgm\.[\w-]+)': \{ bpm/gm)].map((m) => m[1]));
const have = (n) => (CUES.existing?.audioPlay || []).includes(n) || syn.has(n);
for (const b of D9) {
  if (b.sfx) assert.ok(have(String(b.sfx).split(/[|\s(]/)[0]), `${b.id} sfx ${b.sfx}`);
  for (const x of b.timed || []) if (x.sfx) assert.ok(have(x.sfx), `${b.id} timed ${x.sfx}`);
  if (b.bgm && b.bgm !== 'hold' && b.bgm !== 'bgm.shop') assert.ok(moods.has(b.bgm), `${b.id} bgm ${b.bgm}`);
  if (b.nextDay?.sfx) assert.ok(have(b.nextDay.sfx), `${b.id} nextDay sfx`);
}
for (const e of ['E17', 'E18']) for (const x of ev[e].audio?.sfx || []) { const n = x.split(/[|\s(]/)[0]; assert.ok(have(n), `${e} sfx ${n}`); }

// ---------- E17 판정 · 수레 ----------
assert.equal(evalE17({ attached: false }), 'missed'); assert.equal(evalE17({ attached: true, arrived: true }), 'success');
assert.equal(evalE17({ attached: true, arrived: true, slosh: 2 }), 'partial'); assert.equal(evalE17({ attached: true, arrived: true, overSec: 6 }), 'partial');
assert.equal(evalE17({ attached: true, arrived: true, slosh: 3 }), 'fail'); assert.equal(evalE17({ attached: true, arrived: true, overSec: 8.5 }), 'fail'); assert.equal(evalE17({ attached: true, timeUp: true }), 'fail');
{ const w = createWagon(); assert.deepEqual(w.tick(0.25, 1.5, 0), { over: false, slosh: 0 }, '걸기 전엔 안 셈'); assert.ok(w.attach()); assert.ok(!w.attach());
  let t = 0; for (let i = 0; i < 12; i++) { w.tick(0.25, 1.0, t); t += 0.25; } assert.equal(w.S.overSec, 0); assert.equal(w.S.slosh, 0);
  for (let i = 0; i < 8; i++) { w.tick(0.25, 1.4, t); t += 0.25; } assert.ok(Math.abs(w.S.overSec - 2) < 1e-9, '과속 2초');
  assert.equal(w.tick(0.25, 0.6, t).slosh, 1, '급제동(1.4→0.6) 출렁'); t += 0.25;
  w.tick(0.25, 0.6, t); assert.equal(w.bump(t), 0, '출렁 0.6초 안'); t += 1; assert.equal(w.bump(t), 2, '쿵 출렁'); assert.equal(w.bump(t + 0.7), 0, '0.8초 안 쿵은 안 셈');
  assert.ok(w.arrive()); assert.equal(w.result(), 'partial'); }
{ const w = createWagon(); w.attach(); let t = 0; for (let i = 0; i < 3; i++) { w.bump(t); t += 1; } assert.ok(w.S.spilled && w.failed()); assert.equal(w.result(), 'fail'); assert.ok(!w.arrive()); }
{ const w = createWagon(); w.attach(); for (let i = 0; i < 36; i++) w.tick(0.25, 1.6, i * 0.25); assert.ok(w.failed(), '과속 8초 넘음'); }

// ---------- E18 ----------
assert.equal(evalE18({ have: 3, arrived: true }), 'success'); assert.equal(evalE18({ have: 3, arrived: true, eggs: 1 }), 'partial');
assert.equal(evalE18({ have: 2, timeUp: true }), 'fail'); assert.equal(evalE18({ have: 0, timeUp: true }), 'missed');
{ const it = (id) => ({ p: { id } }); const items = [it('water'), it('egg'), it('ramen'), it('tissue'), it('egg')];
  const out = handOverPick(items, E18.items); assert.equal(out.length, 3); assert.deepEqual(out.map((x) => x.p.id).sort(), ['egg', 'tissue', 'water']);
  assert.ok(out.includes(items[4]) && !out.includes(items[1]), '나중에 담은 것부터'); assert.ok(!out.includes(items[2]), '라면은 남김'); }
assert.match(idx, /api\.returnItems\?\.\(\(it\) => picked\.includes\(it\)\)/, 'handOver: 목록 상품만 카트에서 뺌');

// ---------- 소품 ----------
{
  const scene = new THREE.Scene(), kept = []; const keep = (o) => (kept.push(o), o);
  const cartObj = new THREE.Group(); scene.add(cartObj);
  const p = createDay9Props({ THREE, scene, keep, cartObj });
  const count = () => { let m = 0, t = 0; scene.traverse((o) => { if (o.isMesh) { m++; t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { m, t }; };
  p.wagon('floor'); p.stand(true); const a = count(); console.log('E17 props', a); assert.equal(a.m, 2); assert.ok(a.t < 600, `tris ${a.t}`);
  p.wagon('cart'); assert.equal(cartObj.children.length, 1); assert.equal(p.wagonState, 'cart');
  p.wagon('spilled'); assert.equal(cartObj.children.length, 0); assert.equal(count().m, 3, '수레 + 국물 자국 + 시식대');
  p.wagon('stand', { x: D9_SPOTS.stand.x + 1.2, z: D9_SPOTS.stand.z }); assert.equal(count().m, 2);
  p.dispose(); assert.equal(scene.children.length, 1);
}
console.log('depot day9 ok');
