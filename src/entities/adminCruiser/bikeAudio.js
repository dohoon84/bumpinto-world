// [bikeaudio] 바이크 엔진음: 공회전(idle) / 주행(ride) 루프 2개를 속도·스로틀로 크로스페이드 + 선택 1회 재생음
// - 기본(Admin Cruiser): public/audio/bike_idle.{ogg,mp3}, bike_ride.{ogg,mp3} (scripts/synth-bike-audio.py 로 합성)
// - 슈퍼바이크 RR: files/formats/start/launch/곡선 옵션으로 public/audio/superbike/*.{ogg,m4a} (scripts/superbike-audio.py)
//   files.ride 를 배열로 주면 기어별 주행 루프: curves.layer(av, 지금 루프) 가 고른 루프만 재생하고, 바뀌면 XF 초 등전력 크로스페이드 (최대 2개 동시)
//   start = 시동(탈 때 1회), launch = 정지에서 출발할 때 1회. 1회 재생음이 나오는 동안 루프는 줄였다가 끝날 때 다시 올린다.
// - AudioContext 는 첫 사용자 입력(탑승 F/클릭) 이후에만 만들고 resume
// - ?sound=0 이면 비활성, N 키 = 바이크 소리 음소거 토글 (M 은 기존 '위에서 보기')
import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const MIME = { ogg: 'audio/ogg; codecs="vorbis"', mp3: 'audio/mpeg', m4a: 'audio/mp4; codecs="mp4a.40.2"' };
const listeners = new WeakMap(); // 카메라당 AudioListener 1개 (바이크마다 만들지 않게)
const DUCK_OUT = 0.35; // 1회 재생음 끝나기 전 이 시간 동안 루프를 다시 올린다
const XF = 0.22; // 기어 루프 크로스페이드(s)
const buffers = new Map(); // url → Promise<AudioBuffer>: 같은 음원은 바이크가 몇 대든 한 번만 받아 디코드
function loadBuffer(url) {
  if (!buffers.has(url)) buffers.set(url, new THREE.AudioLoader().loadAsync(url).catch((err) => { buffers.delete(url); throw err; }));
  return buffers.get(url);
}

const CRUISER = {
  mix: (av, throttle) => clamp(av / 7 + throttle * 0.35, 0, 1),
  idleRate: (av, throttle) => clamp(0.9 + 0.2 * clamp(throttle * 0.6 + av / 4, 0, 1), 0.9, 1.1),
  rideRate: (av, throttle) => clamp(0.8 + 0.9 * clamp(av / 52, 0, 1) + throttle * 0.08, 0.8, 1.75),
  rideGain: (av, throttle) => 0.85 + 0.15 * throttle,
  layer: () => 0,
};

export function createBikeAudio({
  camera, anchor, params, base = import.meta.env.BASE_URL, volume = 0.9,
  files = { idle: 'bike_idle', ride: 'bike_ride' }, formats = ['ogg', 'mp3'], curves = {},
}) {
  if (!camera || !anchor || params?.get('sound') === '0') return null;
  const C = { ...CRUISER, ...curves };
  const ext = (() => {
    try {
      const a = new Audio();
      return formats.find((f) => a.canPlayType(MIME[f])) || formats.at(-1);
    } catch { return formats.at(-1); }
  })();
  const rideFiles = [].concat(files.ride);
  const st = { gestured: false, listener: null, idle: null, rides: [], cur: 0, prev: -1, xf: 1, shots: {}, shot: null, shotEnd: 0, ready: false, playing: false,
    on: 0, mix: 0, quiet: 0, rest: 0, wasOn: false, lift: 0,
    muted: (() => { try { return localStorage.getItem('bikeAudioMuted') === '1'; } catch { return false; } })() };
  const onGesture = () => { st.gestured = true; st.listener?.context.state === 'suspended' && st.listener.context.resume(); };
  addEventListener('pointerdown', onGesture, { capture: true }); addEventListener('keydown', onGesture, { capture: true });
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyN' || e.repeat) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    st.muted = !st.muted; try { localStorage.setItem('bikeAudioMuted', st.muted ? '1' : '0'); } catch {}
  });

  function init() {
    if (st.listener) return;
    st.listener = listeners.get(camera) || listeners.set(camera, new THREE.AudioListener()).get(camera);
    if (st.listener.parent !== camera) camera.add(st.listener);
    const mk = (name, loop) => { const a = new THREE.PositionalAudio(st.listener); a.setRefDistance(4); a.setRolloffFactor(1.2); a.setLoop(loop); a.setVolume(0); anchor.add(a);
      loadBuffer(`${base}audio/${name}.${ext}`).then((buf) => { a.setBuffer(buf); a.userData.loaded = true; st.ready = !!st.idle?.userData.loaded && st.rides.every((r) => r.userData.loaded); }, (err) => console.warn('[bikeaudio] load failed', name, err)); return a; };
    st.idle = mk(files.idle, true);
    st.rides = rideFiles.map((f) => mk(f, true));
    for (const k of ['start', 'launch']) if (files[k]) st.shots[k] = mk(files[k], false);
  }
  const ramp = (param, v, tc) => param.setTargetAtTime(v, st.listener.context.currentTime, tc);
  function playShot(k) {
    const a = st.shots[k];
    if (!a?.userData.loaded || st.muted) return;
    if (st.shot?.isPlaying) st.shot.stop();
    a.setVolume(volume);
    a.play();
    st.shot = a;
    st.shotEnd = st.listener.context.currentTime + a.buffer.duration;
  }
  const playLoop = (a) => {
    const g = a.gain.gain, now = st.listener.context.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(0, now);
    a.offset = Math.random() * Math.max(0.1, a.buffer.duration - 0.1);
    a.play();
  };
  const stopLoop = (a) => { if (a?.isPlaying) a.stop(); };
  /** 기어 루프 교체. 이전 루프는 지금 음높이 그대로 XF 초 동안 내려가고 새 루프가 올라온다 (동시에 최대 2개) */
  function switchLayer(k, rate) {
    if (k === st.cur) return;
    if (k === st.prev) { st.prev = st.cur; st.cur = k; st.xf = 1 - st.xf; return; } // 크로스페이드 중 되돌아가면 그대로 거꾸로
    const keep = st.prev >= 0 && st.xf < 0.5 ? st.prev : st.cur; // 둘 중 지금 더 큰 쪽을 남긴다
    if (st.prev >= 0) stopLoop(st.rides[keep === st.prev ? st.cur : st.prev]);
    st.prev = keep;
    st.cur = k;
    st.xf = 0;
    st.rides[k].playbackRate = rate;
    playLoop(st.rides[k]);
  }
  function stopShot(tc = 0.08) {
    if (!st.shot?.isPlaying) return;
    ramp(st.shot.gain.gain, 0, tc);
    const s = st.shot;
    setTimeout(() => s.isPlaying && s.stop(), tc * 5000);
    st.shot = null;
    st.shotEnd = 0;
  }

  return {
    get muted() { return st.muted; },
    setMuted(m) { st.muted = !!m; },
    /** 탑승 순간(사용자 제스처 안)에서 호출: 컨텍스트 생성/재개 */
    unlock() { st.gestured = true; init(); if (st.listener.context.state === 'suspended') st.listener.context.resume(); },
    /** 매 프레임: on=시동(탑승 중/원격 탑승), v=속도(m/s), throttle 0..1 */
    update(dt, { on, v = 0, throttle = 0 }) {
      if (on && !st.listener && st.gestured) init();
      if (!st.ready) return;
      const ctx = st.listener.context;
      const target = on && !st.muted ? 1 : 0;
      st.on += clamp(target - st.on, -dt / 0.7, dt / 0.35);                 // 시동/하차: 0.35 s 페이드인, 0.7 s 페이드아웃
      const av = Math.abs(v), wantMix = C.mix(av, throttle);
      st.mix += (wantMix - st.mix) * Math.min(1, dt * 3);
      const layer = clamp(C.layer(av, st.playing ? st.cur : -1) | 0, 0, st.rides.length - 1);
      if (st.on > 0.001 && !st.playing) {                                    // 필요할 때만 재생 (끝나면 정지해 CPU 절약)
        if (ctx.state === 'suspended') ctx.resume();
        st.cur = layer; st.prev = -1; st.xf = 1;
        playLoop(st.idle); playLoop(st.rides[layer]); st.playing = true;
      }
      if (!st.playing) return;
      if (st.shot && !st.shot.isPlaying) st.shot = null; // 끝까지 재생됨
      // 1회 재생음: 시동(켜지는 순간) · 출발(멈춰 있다가 스로틀). 출발음은 스로틀을 놓으면 끊는다
      const lit = target > 0;
      if (lit && !st.wasOn) playShot('start');
      if (!lit && st.shot) stopShot(0.15);
      st.wasOn = lit;
      // 정지 시간은 이번 프레임 이동 전 값으로 본다 (낮은 fps 에선 첫 프레임에 이미 0.3 m/s 를 넘는다)
      if (lit && st.shots.launch && st.rest > 0.4 && throttle > 0.2) { playShot('launch'); st.rest = 0; }
      st.rest = av < 0.3 ? st.rest + (throttle > 0.2 ? 0 : dt) : 0;
      st.lift = throttle > 0.05 ? 0 : st.lift + dt;
      if (st.shot === st.shots.launch && st.lift > 0.25) stopShot();
      const left = st.shot?.isPlaying ? st.shotEnd - ctx.currentTime : 0;
      const duck = left > DUCK_OUT ? 1 : clamp(left / DUCK_OUT, 0, 1);
      const g = volume * st.on * (1 - duck);
      const rIdle = C.idleRate(av, throttle);
      const rRide = C.rideRate(av, throttle, layer);
      switchLayer(layer, rRide);
      st.xf = Math.min(1, st.xf + dt / XF);
      if (st.xf >= 1 && st.prev >= 0) { stopLoop(st.rides[st.prev]); st.prev = -1; }
      const gRide = g * Math.sin(st.mix * Math.PI / 2) * C.rideGain(av, throttle);
      ramp(st.idle.gain.gain, g * Math.cos(st.mix * Math.PI / 2), 0.05);     // equal-power 크로스페이드 (공회전 ↔ 주행)
      const cur = st.rides[st.cur];
      ramp(cur.gain.gain, gRide * Math.sin(st.xf * Math.PI / 2), 0.03);       // equal-power 크로스페이드 (기어 ↔ 기어)
      if (st.prev >= 0) ramp(st.rides[st.prev].gain.gain, gRide * Math.cos(st.xf * Math.PI / 2), 0.03);
      if (st.idle.source) ramp(st.idle.source.playbackRate, rIdle, 0.08);
      if (cur.source) ramp(cur.source.playbackRate, rRide, 0.1);
      st.idle.playbackRate = rIdle; cur.playbackRate = rRide;
      st.quiet = st.on <= 0.001 ? st.quiet + dt : 0;
      if (st.quiet > 1) { stopLoop(st.idle); for (const r of st.rides) stopLoop(r); st.prev = -1; st.playing = false; }
    },
    get state() { return { ctx: st.listener?.context.state || 'none', ready: st.ready, playing: st.playing, on: +st.on.toFixed(2), mix: +st.mix.toFixed(2), ext, muted: st.muted,
      shot: st.shot === st.shots.start ? 'start' : (st.shot && st.shot === st.shots.launch ? 'launch' : null),
      layer: st.cur, xfading: st.prev >= 0, layersPlaying: st.rides.filter((r) => r.isPlaying).length,
      rate: [st.idle?.playbackRate, st.rides[st.cur]?.playbackRate].map((r) => +(+r || 0).toFixed(2)) }; },
  };
}
