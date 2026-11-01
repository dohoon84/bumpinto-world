// [bikeaudio] 바이크 엔진음: 공회전(idle) / 주행(ride) 루프 2개를 속도·스로틀로 크로스페이드 + 선택 1회 재생음
// - 기본(Admin Cruiser): public/audio/bike_idle.{ogg,mp3}, bike_ride.{ogg,mp3} (scripts/synth-bike-audio.py 로 합성)
// - 슈퍼바이크 RR: files/formats/start/launch/곡선 옵션으로 public/audio/superbike/*.{ogg,m4a} (scripts/superbike-audio.py)
//   start = 시동(탈 때 1회), launch = 정지에서 출발할 때 1회. 1회 재생음이 나오는 동안 루프는 줄였다가 끝날 때 다시 올린다.
// - AudioContext 는 첫 사용자 입력(탑승 F/클릭) 이후에만 만들고 resume
// - ?sound=0 이면 비활성, N 키 = 바이크 소리 음소거 토글 (M 은 기존 '위에서 보기')
import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const MIME = { ogg: 'audio/ogg; codecs="vorbis"', mp3: 'audio/mpeg', m4a: 'audio/mp4; codecs="mp4a.40.2"' };
const listeners = new WeakMap(); // 카메라당 AudioListener 1개 (바이크마다 만들지 않게)
const DUCK_OUT = 0.35; // 1회 재생음 끝나기 전 이 시간 동안 루프를 다시 올린다

const CRUISER = {
  mix: (av, throttle) => clamp(av / 7 + throttle * 0.35, 0, 1),
  idleRate: (av, throttle) => clamp(0.9 + 0.2 * clamp(throttle * 0.6 + av / 4, 0, 1), 0.9, 1.1),
  rideRate: (av, throttle) => clamp(0.8 + 0.9 * clamp(av / 52, 0, 1) + throttle * 0.08, 0.8, 1.75),
  rideGain: (av, throttle) => 0.85 + 0.15 * throttle,
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
  const st = { gestured: false, listener: null, idle: null, ride: null, shots: {}, shot: null, shotEnd: 0, ready: false, playing: false,
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
    const loader = new THREE.AudioLoader();
    const mk = (name, loop) => { const a = new THREE.PositionalAudio(st.listener); a.setRefDistance(4); a.setRolloffFactor(1.2); a.setLoop(loop); a.setVolume(0); anchor.add(a);
      loader.load(`${base}audio/${name}.${ext}`, (buf) => { a.setBuffer(buf); a.userData.loaded = true; st.ready = !!(st.idle?.userData.loaded && st.ride?.userData.loaded); }, undefined, (err) => console.warn('[bikeaudio] load failed', name, err)); return a; };
    st.idle = mk(files.idle, true); st.ride = mk(files.ride, true);
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
      if (st.on > 0.001 && !st.playing) {                                    // 필요할 때만 재생 (끝나면 정지해 CPU 절약)
        if (ctx.state === 'suspended') ctx.resume();
        st.idle.offset = Math.random() * 3; st.ride.offset = Math.random() * 3;
        st.idle.play(); st.ride.play(); st.playing = true;
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
      ramp(st.idle.gain.gain, g * Math.cos(st.mix * Math.PI / 2), 0.05);     // equal-power 크로스페이드
      ramp(st.ride.gain.gain, g * Math.sin(st.mix * Math.PI / 2) * C.rideGain(av, throttle), 0.05);
      const rIdle = C.idleRate(av, throttle);
      const rRide = C.rideRate(av, throttle);
      if (st.idle.source) ramp(st.idle.source.playbackRate, rIdle, 0.08);
      if (st.ride.source) ramp(st.ride.source.playbackRate, rRide, 0.12);
      st.idle.playbackRate = rIdle; st.ride.playbackRate = rRide;
      st.quiet = st.on <= 0.001 ? st.quiet + dt : 0;
      if (st.quiet > 1) { st.idle.stop(); st.ride.stop(); st.playing = false; }
    },
    get state() { return { ctx: st.listener?.context.state || 'none', ready: st.ready, playing: st.playing, on: +st.on.toFixed(2), mix: +st.mix.toFixed(2), ext, muted: st.muted,
      shot: st.shot === st.shots.start ? 'start' : (st.shot && st.shot === st.shots.launch ? 'launch' : null),
      rate: [st.idle?.playbackRate, st.ride?.playbackRate].map((r) => +(+r || 0).toFixed(2)) }; },
  };
}
