// [bus-sfx] 버스 효과음: 루프 믹스(순수 함수)·?rideSfx=0·음소거·자산 파일 존재
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { busLoopMix, createRideSound, BUS_SFX } from '../../../src/ride/sound.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
// 정차 = 공회전만, 빠를수록 주행음, 재생 속도 0.85–1.1
const d = busLoopMix(8, true); assert.equal(d.mix, 0); assert.ok(d.idle > 0.99 && d.interior < 0.01);
const s0 = busLoopMix(0, false), s5 = busLoopMix(5, false), s14 = busLoopMix(14, false), s30 = busLoopMix(30, false);
assert.ok(s0.idle > 0.99 && s5.interior > 0.99 && s5.idle < 0.01);
assert.ok(Math.abs(s0.rate - 0.85) < 1e-9 && Math.abs(s14.rate - 1.1) < 1e-9 && Math.abs(s30.rate - 1.1) < 1e-9);
for (let v = 0; v <= 20; v += 0.5) { const m = busLoopMix(v, false); assert.ok(Math.abs(m.interior ** 2 + m.idle ** 2 - 1) < 1e-9, 'equal-power'); }
// ?rideSfx=0 → 효과음 꺼짐, 안내 음성 설정은 그대로
const off = createRideSound({ params: new URLSearchParams('rideSfx=0'), storage: mem() });
assert.equal(off.sfxEnabled, false); assert.equal(off.muted, false);
off.prepareBus(); assert.equal(off.sfx('card-tap-v2'), false); off.busEngine(10, false); off.stopBus();
assert.equal(off.sfxStats.requests, 0); assert.equal(off.sfxEvents.length, 0);
// ?rideVoice=0 → 전부 꺼짐
const mu = createRideSound({ params: new URLSearchParams('rideVoice=0'), storage: mem() });
assert.equal(mu.muted, true); assert.equal(mu.sfx('door-open-v2'), false); assert.equal(mu.announce('x'), false);
// 오디오 없는 환경(node): 조용히 실패, 예외 없음, 내려받기 없음
const on = createRideSound({ params: new URLSearchParams(''), storage: mem() });
assert.equal(on.sfxEnabled, true); on.prepareBus(); on.busEngine(5, false); assert.equal(on.sfxStats.requests, 0);
// 자산: ogg + m4a 둘 다
assert.equal(BUS_SFX.length, 8);
for (const n of BUS_SFX) for (const e of ['ogg', 'm4a']) { const f = new URL(`../../../public/audio/bus/${n}.${e}`, import.meta.url); assert.ok(existsSync(f) && statSync(f).size > 2000, `${n}.${e}`); }
console.log('test-bus-sfx: ok');
