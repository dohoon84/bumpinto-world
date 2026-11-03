// [subway-voice] 안내 방송 대기열·취소·설정 (가짜 speechSynthesis / AudioContext / 타이머 — 헤드리스는 소리를 못 들으므로 호출을 확인)
import assert from 'node:assert/strict';
import { createSubwayVoice, voiceItems, CHIME_SEC, VOICE_WAIT_MS, loudness } from '../src/subway/voice.js';
import { announce } from '../src/subway/ride.js';
import { stairY, inStairArea, UP_Z, PLAT, STEP } from '../src/subway/platform.js';

function rig({ params = '', voices = ['ko-KR', 'en-US'], level = { muted: false, volume: 0.55 }, synth = true, clips = null, acState = 'running' } = {}) {
  const spoken = [], log = { cancel: 0, osc: 0, gains: [], fetch: [], src: [] };
  const timers = []; let tid = 0;
  const T = { set: (f, ms) => { const id = ++tid; timers.push({ id, f, ms }); return id; }, clear: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); } };
  const fire = () => { const t = timers.shift(); assert.ok(t, 'timer'); t.f(); return t; };
  const vl = {}; const S = synth ? { getVoices: () => voices.map((lang) => ({ lang, name: lang })), speak: (u) => spoken.push(u), cancel: () => { log.cancel++; }, addEventListener: (e, f) => { vl[e] = f; }, removeEventListener() {} } : null;
  const gl = {}; const target = { addEventListener: (e, f) => { (gl[e] ||= []).push(f); }, removeEventListener() {} };
  class U { constructor(t) { this.text = t; } }
  const param = (v) => { const g = { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime(a) { if (a > 0.001) log.gains.push(a); } }, connect() {} }; return g; };
  class AC { constructor() { this.currentTime = 0; this.destination = {}; this.state = acState; log.ac = this; }
    createGain() { return param(); } createOscillator() { log.osc++; return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
    createBufferSource() { const s = { connect() {}, start() { log.src.push(s); }, stop() { s.stopped = true; } }; return s; }
    decodeAudioData(ab, ok) { ok({ duration: 1 }); } resume() { log.resumed = (log.resumed || 0) + 1; this.state = 'running'; return Promise.resolve(); } }
  const fetchFn = async (url) => { log.fetch.push(url); if (url.endsWith('clips.json')) return clips ? { ok: true, json: async () => clips } : { ok: false, json: async () => [] }; return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };
  const lv = { ...level };
  const v = createSubwayVoice({ params: new URLSearchParams(params), getLevel: () => lv, synth: S, Utterance: U, AudioCtx: AC, fetchFn, base: '/', timers: T, target, logFn: null });
  return { v, spoken, log, timers, fire, lv, gl, vl, setVoices: (l) => { voices = l; } };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const A = (k) => announce(k, { dirKo: '왕십리 방면', dirEn: 'for Wangsimni', name: '수내', nameEn: 'Sunae' });

// 항목: 차임은 도착 안내(approach·next)만, 그다음 한국어 → 영어 → 일본어
assert.deepEqual(voiceItems(A('approach')).map((i) => i.t + (i.lang ? ':' + i.lang : '')), ['chime', 'line:ko-KR', 'line:en-US', 'line:ja-JP']);
assert.deepEqual(voiceItems(A('depart')).map((i) => i.lang), ['ko-KR', 'en-US', 'ja-JP']);
assert.deepEqual(voiceItems(A('approach'), { chime: false }).map((i) => i.t), ['line', 'line', 'line']);
assert.equal(voiceItems(A('depart')).at(-1).clip, 'depart-sunae.ja');
assert.equal(A('depart').clip, 'depart-sunae'); assert.equal(A('approach').clip, 'approach-wangsimni'); assert.equal(A('closing').clip, 'closing');
assert.deepEqual(voiceItems({ ko: '', en: '' }), []);

{ // 순서·겹치지 않음: 차임(타이머) → ko 말하기 → onend → en → onend → 끝
  const { v, spoken, log, timers, fire } = rig();
  await tick();
  assert.equal(v.play(A('approach')), true);
  assert.equal(spoken.length, 0, '차임 동안은 말 안 함'); assert.ok(log.osc > 0, '차임 합성');
  assert.ok(Math.abs(log.gains[0] - 0.22 * loudness(0.55)) < 1e-9, '차임 크기 = BGM 볼륨(바닥 있음)');
  assert.equal(timers[0].ms, CHIME_SEC * 1000);
  fire();
  assert.equal(spoken.length, 1); assert.equal(spoken[0].lang, 'ko-KR'); assert.equal(spoken[0].text, A('approach').ko); assert.equal(spoken[0].volume, loudness(0.55)); assert.equal(spoken[0].voice.lang, 'ko-KR');
  assert.equal(v.active, true);
  spoken[0].onend();
  assert.equal(spoken.length, 2); assert.equal(spoken[1].lang, 'en-US'); assert.equal(spoken[1].text, A('approach').en);
  spoken[0].onend(); // 이미 끝난 줄의 늦은 onend 는 무시
  assert.equal(spoken.length, 2);
  spoken[1].onend();
  assert.equal(v.active, false); assert.equal(spoken.length, 2);
}
{ // 말하는 중 새 방송: 지금 줄은 끝까지, 대기 중이던 것은 최신으로 교체
  const { v, spoken } = rig();
  v.play(A('depart')); assert.equal(spoken.length, 1);
  v.play(A('closing')); assert.equal(spoken.length, 1, '겹쳐 말하지 않음');
  spoken[0].onend();
  assert.equal(spoken[1].text, A('closing').ko);
  spoken[1].onend(); assert.equal(spoken[2].text, A('closing').en); spoken[2].onend();
  assert.equal(v.active, false);
}
{ // 취소: 승강장·열차를 떠날 때 → speechSynthesis.cancel, 대기열 비움, 늦은 onend/타이머 무시
  const { v, spoken, log, timers } = rig();
  v.play(A('next')); assert.equal(timers.length, 1);
  v.cancel(); assert.equal(v.active, false); assert.equal(timers.length, 0, '차임 타이머도 지움');
  v.play(A('depart')); assert.equal(spoken.length, 1);
  v.cancel(); assert.equal(log.cancel, 1);
  spoken[0].onend(); assert.equal(spoken.length, 1);
  v.cancel(); assert.equal(log.cancel, 1, '말한 게 없으면 cancel 안 부름');
}
{ // 안전 타이머: onend 가 안 와도 다음 줄로
  const { v, spoken, fire } = rig();
  v.play(A('depart')); fire(); assert.equal(spoken.length, 2); assert.equal(spoken[1].lang, 'en-US');
}
{ // 끄기: ?subwayVoice=0 · ?sound=0
  for (const q of ['subwayVoice=0', 'sound=0']) { const { v, spoken, log } = rig({ params: q }); assert.equal(v.enabled, false); assert.equal(v.play(A('approach')), false); assert.equal(spoken.length + log.osc, 0, q); }
}
{ // ?rideSfx=0 → 차임(효과음)만 끔, 음성은 그대로
  const { v, spoken, log } = rig({ params: 'rideSfx=0' });
  v.play(A('approach')); assert.equal(log.osc, 0); assert.equal(spoken.length, 1);
}
{ // BGM HUD 음소거·볼륨 0 → 무음. 말하는 중 음소거하면 update() 가 멈춤
  const { v, spoken, lv, log } = rig({ level: { muted: true, volume: 0.8 } });
  assert.equal(v.play(A('depart')), false); assert.equal(spoken.length, 0);
  lv.muted = false; lv.volume = 0; assert.equal(v.play(A('depart')), false);
  lv.volume = 0.3; v.play(A('depart')); assert.equal(spoken[0].volume, loudness(0.3)); assert.ok(loudness(0.3) > 0.6 && loudness(1) === 1 && loudness(0) === 0, '볼륨 바닥');
  lv.muted = true; v.update(); assert.equal(v.active, false); assert.equal(log.cancel, 1);
}
{ // 음성이 없으면 조용히 건너뜀 (자막은 index.js 가 따로)
  // 목록이 끝내 비면: VOICE_WAIT_MS 기다린 뒤 lang 만으로 말함 (브라우저 기본 음성) — 두 번째 줄은 다시 기다리지 않음
  const a = rig({ voices: [] }); assert.doesNotThrow(() => a.v.play(A('depart'))); assert.equal(a.spoken.length, 0); assert.equal(a.v.active, true);
  assert.equal(a.timers[0].ms, VOICE_WAIT_MS); a.fire(); assert.equal(a.spoken.length, 1); assert.equal(a.spoken[0].lang, 'ko-KR'); assert.equal(a.spoken[0].voice, undefined);
  a.spoken[0].onend(); assert.equal(a.spoken.length, 2); assert.equal(a.spoken[1].lang, 'en-US'); a.spoken[1].onend(); assert.equal(a.v.active, false);
  // 목록이 늦게 옴(macOS Chrome): voiceschanged 가 오면 바로 이어서, 순서 그대로
  const w = rig({ voices: [] }); w.v.play(A('approach')); w.fire(); /* 차임 끝 */ assert.equal(w.spoken.length, 0);
  assert.ok(w.v.events.some((e) => e.t === 'wait-voices'));
  w.setVoices(['ko-KR', 'en-US']); w.vl.voiceschanged(); assert.equal(w.spoken.length, 1); assert.equal(w.spoken[0].voice.lang, 'ko-KR');
  assert.equal(w.timers.length, 1, '대기 타이머는 치움 (안전 타이머만)'); w.spoken[0].onend(); assert.equal(w.spoken[1].lang, 'en-US');
  // 사용자 입력(클릭·키)에서 AudioContext 를 만들고 resume (잠금 해제)
  const g = rig({ acState: 'suspended' }); assert.equal(g.v.unlocked, false); g.gl.keydown[0](); assert.equal(g.v.unlocked, true); assert.equal(g.log.ac.state, 'running'); assert.ok(g.log.resumed >= 1);
  assert.ok(g.gl.pointerdown?.length, 'pointerdown 도 (BGM 과 같은 입력)');
  // 🔊 표시용 구독
  const seen = []; g.v.on((e) => seen.push(e.t)); g.v.play(A('depart')); assert.ok(seen.includes('speak'));
  const b = rig({ synth: false }); b.v.play(A('depart')); assert.equal(b.v.active, false);
  const c = rig({ voices: ['en-GB'] }); c.v.play(A('depart')); assert.equal(c.spoken.length, 1); assert.equal(c.spoken[0].lang, 'en-US', '한국어 음성이 없으면 영어만');
}
{ // [subway-ja] 일본어: ja 음성이 있으면 ko → en → ja 순서, 없으면 ja 만 건너뜀, ?subwayJa=0 이면 끔
  const { v, spoken, fire } = rig({ voices: ['ko-KR', 'en-US', 'ja-JP'] });
  v.play(A('approach')); fire();
  spoken[0].onend(); spoken[1].onend();
  assert.equal(spoken.length, 3); assert.equal(spoken[2].lang, 'ja-JP'); assert.equal(spoken[2].voice.lang, 'ja-JP'); assert.equal(spoken[2].text, A('approach').ja);
  spoken[2].onend(); assert.equal(v.active, false);
  const n = rig(); n.v.play(A('depart')); n.spoken[0].onend(); n.spoken[1].onend();
  assert.equal(n.spoken.length, 2, 'ja 음성 없음 → 일본어 건너뜀'); assert.equal(n.v.active, false);
  assert.ok(n.v.events.some((e) => e.t === 'skip' && e.why === 'no-voice' && e.lang === 'ja-JP'));
  const e = rig({ voices: [] }); e.v.play(A('depart')); e.fire(); e.spoken[0].onend(); e.spoken[1].onend();
  assert.equal(e.spoken.length, 2, '목록이 끝내 비면 ko·en 만 lang 으로, 일본어는 말하지 않음'); assert.equal(e.v.active, false);
  const w = rig({ voices: [] }); w.v.play(A('depart')); w.setVoices(['ko-KR', 'en-US', 'ja-JP']); w.vl.voiceschanged();
  w.spoken[0].onend(); w.spoken[1].onend(); assert.equal(w.spoken[2]?.lang, 'ja-JP', 'voiceschanged 뒤 ja 음성으로');
  const o = rig({ params: 'subwayJa=0', voices: ['ko-KR', 'en-US', 'ja-JP'] }); o.v.play(A('depart')); o.spoken[0].onend(); o.spoken[1].onend();
  assert.equal(o.spoken.length, 2, '?subwayJa=0'); assert.equal(o.v.active, false);
}
{ // 녹음 교체 훅: clips.json 에 있는 줄은 public/audio/subway/<clip>.<ext> 재생, 없는 줄은 TTS
  const { v, spoken, log } = rig({ clips: ['depart-sunae.ko'] });
  v.play(A('closing')); spoken[0].onend(); spoken[1].onend(); // 목록 받기 (첫 방송)
  await tick(); await tick();
  v.play(A('depart'));
  await tick(); await tick(); await tick();
  assert.ok(log.fetch.some((u) => /\/audio\/subway\/depart-sunae\.ko\.(ogg|m4a)$/.test(u)), JSON.stringify(log.fetch));
  assert.equal(log.src.length, 1, '녹음 재생'); assert.equal(spoken.length, 2, 'ko 는 TTS 안 씀');
  log.src[0].onended(); assert.equal(spoken.length, 3); assert.equal(spoken[2].lang, 'en-US');
  assert.equal(log.fetch.filter((u) => u.endsWith('clips.json')).length, 1, '목록은 한 번만');
}

// [subway] 승강장 계단: 입구에 틈 없음 · 높이 연속 · 올라가기 지점 전에 막히지 않음
{
  const rPlat = PLAT.Z0 + 0.2 + 0.3; // 승강장 바닥이 끝나는 z (뒷벽 쪽)
  assert.ok(inStairArea(0, rPlat - 0.01) && inStairArea(0, rPlat + 0.05), '승강장 바닥 ↔ 계단 사이 틈 없음');
  for (let z = PLAT.Z0 + 0.5; z > UP_Z - 0.05; z -= 0.05) assert.ok(inStairArea(0, z), `계단 z ${z.toFixed(2)} 걸을 수 있음`);
  assert.equal(stairY(PLAT.Z0), 0); assert.ok(stairY(UP_Z) > 0.5, '올라가기 지점은 몇 단 위');
  for (let z = PLAT.Z0; z > PLAT.Z0 - 6; z -= 0.1) assert.ok(stairY(z - 0.1) >= stairY(z) && stairY(z - 0.1) - stairY(z) < 0.1, '높이 연속');
  assert.ok(stairY(-100) === STEP.n * STEP.h);
  assert.ok(!inStairArea(PLAT.STAIR.x1, -6), '계단 옆벽');
}
console.log('subway voice: queue · no overlap · cancel · off flags · mute/volume · no voice · ja (order · no ja voice · subwayJa=0) · recording hook · stairs OK');
