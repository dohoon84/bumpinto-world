// [mobile-audio] iOS 소리 잠금 해제 배선 테스트 (가짜 window·AudioContext·speechSynthesis)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudioUnlock, pickAudioExt, GESTURE_EVENTS } from '../src/audio/unlock.js';

let pass = 0; const ok = (name) => { pass++; console.log('  ok', name); };
const mkTarget = () => { const gl = {}; return { gl, addEventListener: (e, f, o) => { (gl[e] ||= []).push({ f, o }); }, removeEventListener: (e, f) => { gl[e] = (gl[e] || []).filter((x) => x.f !== f); }, fire(type) { for (const { f } of gl[type] || []) f({ type }); } }; };
const mkSynth = () => ({ spoken: [], speaking: false, pending: false, speak(u) { this.spoken.push(u); }, cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} });
class U { constructor(t) { this.text = t; this.volume = 1; } }
const made = [];
class AC { constructor() { this.state = 'suspended'; this.resumes = 0; this.currentTime = 0; this.destination = {}; made.push(this); } resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); } createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; } createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; } }

// 1) 허브: 리스너 · 세션 · 프라임
{
  const t = mkTarget(), synth = mkSynth(), nav = { audioSession: { type: 'auto' } };
  const hub = createAudioUnlock({ target: t, nav, synth, Utterance: U });
  for (const ev of ['touchend', 'click', 'keydown', 'pointerdown']) { assert.ok(GESTURE_EVENTS.includes(ev)); assert.equal(t.gl[ev]?.length, 1, ev); assert.equal(t.gl[ev][0].o.capture, true); assert.equal(t.gl[ev][0].o.passive, true); }
  ok('listens touchend/click/keydown/pointerdown (capture, passive)');
  const calls = []; hub.add((e) => calls.push(e.type));
  t.fire('pointerdown');
  assert.deepEqual(calls, ['pointerdown']); assert.equal(synth.spoken.length, 0, 'pointerdown 은 iOS 활성화가 아님 → 프라임 안 함');
  assert.equal(nav.audioSession.type, 'playback');
  ok('pointerdown: callbacks + audioSession=playback, no speech prime');
  t.fire('touchend');
  assert.equal(synth.spoken.length, 1); assert.equal(synth.spoken[0].volume, 0); assert.equal(hub.primed, true);
  t.fire('click'); t.fire('touchend');
  assert.equal(synth.spoken.length, 1, '프라임은 한 번만');
  assert.deepEqual(calls, ['pointerdown', 'touchend', 'click', 'touchend'], '콜백은 탭마다 (interrupted 재기상)');
  ok('first touchend primes speechSynthesis once with a silent utterance; callbacks every gesture');
  hub.dispose(); t.fire('touchend'); assert.equal(calls.length, 4); ok('dispose removes listeners');
}
{
  const t = mkTarget(), synth = mkSynth(); synth.speaking = true;
  const hub = createAudioUnlock({ target: t, nav: {}, synth, Utterance: U });
  t.fire('click'); assert.equal(synth.spoken.length, 0); assert.equal(hub.primed, true);
  ok('no prime utterance when already speaking; missing audioSession is fine');
}

// 2) ext: Safari → m4a, Chrome/Firefox → ogg
{
  const probe = (ogg, mp4) => ({ canPlayType: (m) => (m.includes('ogg') ? ogg : mp4) });
  assert.equal(pickAudioExt(probe('probably', 'maybe')), 'ogg');
  assert.equal(pickAudioExt(probe('', 'maybe')), 'm4a');
  assert.equal(pickAudioExt(probe('maybe', 'maybe')), 'm4a');
  assert.equal(pickAudioExt(probe('maybe', '')), 'ogg');
  ok('pickAudioExt: ogg only when "probably", else m4a');
}

// 3) 버스 소리: 허브에 붙으면 첫 탭에서 컨텍스트 생성 + resume, interrupted 도 다시 깨움 / 허브 없으면(PC) 예전 그대로
globalThis.window = { AudioContext: AC, speechSynthesis: mkSynth() };
globalThis.SpeechSynthesisUtterance = U;
const { createRideSound } = await import('../src/ride/sound.js');
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
{
  const t = mkTarget(), hub = createAudioUnlock({ target: t, nav: {}, synth: mkSynth(), Utterance: U });
  made.length = 0;
  const s = createRideSound({ params: new URLSearchParams(''), storage: store(), base: '/', unlock: hub });
  assert.equal(s.unlockWired, true); assert.equal(s.muted, false, '기본은 소리 켬');
  assert.equal(made.length, 0, '생성만으로는 컨텍스트 안 만듦');
  t.fire('touchend');
  assert.equal(made.length, 1); assert.equal(made[0].state, 'running'); assert.equal(made[0].resumes, 1);
  made[0].state = 'interrupted'; t.fire('click');
  assert.equal(made.length, 1); assert.equal(made[0].resumes, 2); assert.equal(made[0].state, 'running');
  t.fire('touchend'); assert.equal(made[0].resumes, 2, 'running 이면 resume 안 부름');
  made[0].state = 'interrupted'; assert.equal(s.bell(), true); assert.equal(made[0].resumes, 3, '하차벨도 interrupted 를 깨움');
  ok('ride sound: first tap creates+resumes ctx, re-wakes interrupted, bell wakes too');
}
{
  const t = mkTarget(), hub = createAudioUnlock({ target: t, nav: {}, synth: mkSynth(), Utterance: U });
  made.length = 0;
  const s = createRideSound({ params: new URLSearchParams('rideVoice=0'), storage: store(), base: '/', unlock: hub });
  t.fire('touchend'); assert.equal(made.length, 0, '음소거면 컨텍스트 안 만듦'); assert.equal(s.muted, true);
  ok('ride sound muted (?rideVoice=0): no ctx on tap');
}
{
  made.length = 0;
  const s = createRideSound({ params: new URLSearchParams(''), storage: store(), base: '/' });
  assert.equal(s.unlockWired, false); assert.equal(made.length, 0);
  s.bell(); assert.equal(made.length, 1, 'PC: 하차벨 때 처음 만듦 (예전과 같음)');
  ok('ride sound without hub (PC) unchanged: lazy ctx at first bell');
}

// 4) 지하철 방송: touchend/click 에서도 resume, 허브 연결
{
  const { createSubwayVoice } = await import('../src/subway/voice.js');
  const t = mkTarget(), hubT = mkTarget(), hub = createAudioUnlock({ target: hubT, nav: {}, synth: mkSynth(), Utterance: U });
  made.length = 0;
  const v = createSubwayVoice({ params: new URLSearchParams(''), synth: mkSynth(), Utterance: U, AudioCtx: AC, fetchFn: null, base: '/', target: t, logFn: null, unlockHub: hub });
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) assert.equal(t.gl[ev]?.length, 1, ev);
  assert.equal(v.hubWired, true);
  t.fire('pointerdown'); made[0].state = 'suspended'; // iOS: pointerdown 의 resume 은 무시됨
  t.fire('touchend'); assert.equal(made[0].state, 'running');
  made[0].state = 'interrupted'; hubT.fire('click'); assert.equal(made[0].state, 'running', '허브 탭도 지하철 컨텍스트를 깨움');
  v.dispose(); assert.equal(hub.size, 0); for (const ev of ['touchend', 'click']) assert.equal(t.gl[ev].length, 0);
  ok('subway voice: touchend/click resume (iOS), hub wired, dispose cleans up');
  const v2 = createSubwayVoice({ params: new URLSearchParams(''), synth: mkSynth(), Utterance: U, AudioCtx: AC, fetchFn: null, base: '/', target: mkTarget(), logFn: null });
  assert.equal(v2.hubWired, false); ok('subway voice without hub (PC): no hub');
}

// 5) 배선: 모바일 모드에서만 허브 · 모바일 액션 버튼은 click(사용자 입력) 안에서 동기로 KeyE
{
  const ride = readFileSync(new URL('../src/ride/index.js', import.meta.url), 'utf8');
  const sub = readFileSync(new URL('../src/subway/index.js', import.meta.url), 'utf8');
  const hud = readFileSync(new URL('../src/mobile/hud.js', import.meta.url), 'utf8');
  assert.match(ride, /createRideSound\(\{[^}]*unlock: isMobileMode\(\) \? sharedAudioUnlock\(\) : null/);
  assert.match(sub, /unlockHub: isMobileMode\(\) \? sharedAudioUnlock\(\) : null/);
  assert.match(hud, /root\.addEventListener\('click'[\s\S]*act === 'ride' \|\| act === 'ride2'\) \{ const x = curActs/);
  assert.match(hud, /function pressKey\(code[^)]*\) \{[\s\S]{0,200}dispatchEvent\(new KeyboardEvent\('keydown'/);
  ok('wiring: hub only in mobile mode; HUD ride/bell/alight buttons dispatch KeyE synchronously from click');
}
console.log(`audio-unlock: ${pass} passed`);
