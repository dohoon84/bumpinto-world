// [bikeaudio] Admin Cruiser 배기음: 공회전(idle) / 주행(ride) 루프 2개를 속도·스로틀로 크로스페이드
// - 소리 파일: public/audio/bike_idle.{ogg,mp3}, bike_ride.{ogg,mp3} (scripts/synth-bike-audio.py 로 합성)
// - AudioContext 는 첫 사용자 입력(탑승 F/클릭) 이후에만 만들고 resume
// - ?sound=0 이면 비활성, N 키 = 바이크 소리 음소거 토글 (M 은 기존 '위에서 보기')
import * as THREE from 'three';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function createBikeAudio({ camera, anchor, params, base = import.meta.env.BASE_URL, volume = 0.9 }) {
  if (!camera || !anchor || params?.get('sound') === '0') return null;
  const ext = (() => { try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'; } catch { return 'mp3'; } })();
  const st = { gestured: false, listener: null, idle: null, ride: null, ready: false, playing: false, on: 0, mix: 0, quiet: 0,
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
    st.listener = new THREE.AudioListener(); camera.add(st.listener);
    const loader = new THREE.AudioLoader();
    const mk = (name) => { const a = new THREE.PositionalAudio(st.listener); a.setRefDistance(4); a.setRolloffFactor(1.2); a.setLoop(true); a.setVolume(0); anchor.add(a);
      loader.load(`${base}audio/${name}.${ext}`, (buf) => { a.setBuffer(buf); a.userData.loaded = true; st.ready = !!(st.idle?.userData.loaded && st.ride?.userData.loaded); }, undefined, (err) => console.warn('[bikeaudio] load failed', name, err)); return a; };
    st.idle = mk('bike_idle'); st.ride = mk('bike_ride');
  }
  const ramp = (param, v, tc) => param.setTargetAtTime(v, st.listener.context.currentTime, tc);

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
      const av = Math.abs(v), wantMix = clamp(av / 7 + throttle * 0.35, 0, 1);
      st.mix += (wantMix - st.mix) * Math.min(1, dt * 3);
      if (st.on > 0.001 && !st.playing) {                                    // 필요할 때만 재생 (끝나면 정지해 CPU 절약)
        if (ctx.state === 'suspended') ctx.resume();
        st.idle.offset = Math.random() * 3; st.ride.offset = Math.random() * 3;
        st.idle.play(); st.ride.play(); st.playing = true;
      }
      if (!st.playing) return;
      const g = volume * st.on;
      ramp(st.idle.gain.gain, g * Math.cos(st.mix * Math.PI / 2), 0.05);     // equal-power 크로스페이드
      ramp(st.ride.gain.gain, g * Math.sin(st.mix * Math.PI / 2) * (0.85 + 0.15 * throttle), 0.05);
      const rIdle = clamp(0.9 + 0.2 * clamp(throttle * 0.6 + av / 4, 0, 1), 0.9, 1.1);
      const rRide = clamp(0.8 + 0.9 * clamp(av / 52, 0, 1) + throttle * 0.08, 0.8, 1.75);
      if (st.idle.source) ramp(st.idle.source.playbackRate, rIdle, 0.08);
      if (st.ride.source) ramp(st.ride.source.playbackRate, rRide, 0.12);
      st.idle.playbackRate = rIdle; st.ride.playbackRate = rRide;
      st.quiet = st.on <= 0.001 ? st.quiet + dt : 0;
      if (st.quiet > 1) { st.idle.stop(); st.ride.stop(); st.playing = false; }
    },
    get state() { return { ctx: st.listener?.context.state || 'none', ready: st.ready, playing: st.playing, on: +st.on.toFixed(2), mix: +st.mix.toFixed(2), ext, muted: st.muted,
      rate: [st.idle?.playbackRate, st.ride?.playbackRate].map((r) => +(+r || 0).toFixed(2)) }; },
  };
}
