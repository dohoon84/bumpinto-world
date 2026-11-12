// [depot] 범창고 오디오 — 매장 BGM + 공간 효과음. 들어갈 때만 만들고 나오면 전부 해제.
//   - 월드 OST 는 bgm.player.hold(true) 로 멈추고, setExternal 로 HUD 제목·막대를 매장 곡으로 바꾼다.
//   - 볼륨·음소거는 기존 BGM 미니 플레이어(bw.bgmVolume / bw.bgmMuted) 를 그대로 따른다.
//   - 샘플 파일 없음(오리지널 합성). 버퍼는 입장 때 한 번 굽고, 재생은 풀링된 BufferSource + Panner.
//   - 다른 스트림(계산대 A, 가전 C)은 play(name, {pos, on, kg, material, ...}) 만 호출하면 된다.
import {
  BGM_ID, BGM_TITLE, BGM_BPM, BGM_BARS, phraseDur, bakeBgmPhrase, scheduleDepotBgm,
  SFX_BAKE, materialOf, placeBufForKg, EVENT_NAMES, LOOP_EVENTS, encodeWav, renderDepotAudioPreviews,
} from './audioPatch.js';

export {
  BGM_ID, BGM_TITLE, BGM_BPM, EVENT_NAMES, LOOP_EVENTS, materialOf, placeBufForKg,
  encodeWav, renderDepotAudioPreviews, scheduleDepotBgm, phraseDur,
};

const MAX_VOICES = 16;
const MAX_PANNERS = 8;
const JOINT_M = 6; // 바닥 타일 이음매 간격 (실내 바닥 텍스처 repeat 와 같음)
const FREEZER = Object.freeze({ x: 80, y: 1.2, z: 50 });
const PA_TEXTS = [
  '시식 코너에서 범란 오믈렛을 나눠 드려요',
  '타임세일! 범콜라 1.5L×12 잠깐 할인 중이에요',
  '계산대는 출입구 쪽에 있어요 · 장바구니 확인 부탁드려요',
  '냉동 코너 온도를 점검했습니다 · 아이스크림도 있어요',
  '카트는 출입구 카트 보관소에 반납해 주세요',
  '신선·정육 코너, 오늘 들어온 범한돈 삼겹살 안내 드립니다',
];

const DEFAULT_LEVEL = () => {
  try {
    const p = typeof window !== 'undefined' ? window.__jj?.bgm?.player : null;
    return p ? { muted: !!p.muted, volume: p.volume ?? 0.55 } : { muted: false, volume: 0.55 };
  } catch { return { muted: false, volume: 0.55 }; }
};
// coinSound / subway voice 와 같은 곡선: 0 → 0, 그 외 0.45 + 0.55v (너무 작아지지 않게)
export const loudness = (level) => {
  if (!level || level.muted) return 0;
  const v = Math.min(1, Math.max(0, Number(level.volume) || 0));
  return v <= 0 ? 0 : 0.45 + 0.55 * v;
};
const syllables = (text) => String(text || '').replace(/[\s.,!?~…^😊😤🙂😅🙇🏆🥚🧑‍💼ㅋㅎ^]/g, '').length || 4;

/**
 * @param {{ getLevel?: () => {muted:boolean, volume:number}, getBgmPlayer?: () => any, onAnnounce?: (text:string) => void, AudioCtx?: any, sfxOff?: boolean, bgmOff?: boolean }} opts
 */
export function createDepotAudio({
  getLevel = DEFAULT_LEVEL,
  getBgmPlayer = () => { try { return window.__jj?.bgm?.player || null; } catch { return null; } },
  onAnnounce = null,
  AudioCtx = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext || null) : null,
  Offline = typeof window !== 'undefined' ? (window.OfflineAudioContext || window.webkitOfflineAudioContext || null) : null,
  sfxOff = (() => { try { return new URLSearchParams(location.search).get('rideSfx') === '0' || new URLSearchParams(location.search).get('depotSfx') === '0'; } catch { return false; } })(),
  bgmOff = (() => { try { return new URLSearchParams(location.search).get('bgm') === '0'; } catch { return false; } })(),
} = {}) {
  let ctx = null, master = null, sfxBus = null, bgmBus = null, ambBus = null, comp = null, analyser = null;
  let entered = false, disposed = false, gen = 0, leaveTok = 0, hidden = typeof document !== 'undefined' && document.hidden;
  let buffers = null, baking = null;
  let bgmSrc = [null, null], bgmGain = [null, null], bgmIdx = 0, bgmStartedAt = 0, bgmPhrase = 0, bgmFadeTok = 0;
  let userPaused = false;
  const loops = new Map(); // name+id → {src, gain, pan}
  const voices = []; // {src, gain, pan, t, g}
  const panners = [];
  let panI = 0;
  let rollSrc = null, rollGain = null, rollRate = 1, rollOn = false;
  let hvacSrc = null, hvacGain = null, crowdSrc = null, crowdGain = null;
  let freezerSrc = null, freezerGain = null, freezerPan = null;
  let lastJoint = 0, cartDist = 0, paTimer = 0, paFirst = true;
  let lastWobbleAt = 0, lastStaffAt = 0;
  const levels = new Uint8Array(128);
  const listenerFwd = { x: 0, y: 0, z: -1 }, listenerUp = { x: 0, y: 1, z: 0 };

  const ac = () => {
    if (ctx || !AudioCtx || sfxOff || disposed) return ctx;
    try {
      ctx = new AudioCtx({ latencyHint: 'interactive' });
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.12;
      master = ctx.createGain(); master.gain.value = 0.95;
      analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.78;
      master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
      bgmBus = ctx.createGain(); bgmBus.gain.value = 0; bgmBus.connect(master);
      ambBus = ctx.createGain(); ambBus.gain.value = 0.7; ambBus.connect(master);
      for (let i = 0; i < MAX_PANNERS; i++) {
        const p = ctx.createPanner();
        p.panningModel = 'equalpower';
        p.distanceModel = 'inverse';
        p.refDistance = 3.5; p.maxDistance = 45; p.rolloffFactor = 1.15;
        p.coneInnerAngle = 360; p.coneOuterAngle = 360;
        panners.push({ node: p, busy: false });
      }
    } catch { ctx = null; }
    return ctx;
  };
  const unlock = () => { const c = ac(); if (c && c.state !== 'running') try { c.resume()?.catch?.(() => {}); } catch { /* */ } };
  if (typeof window !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  const onVis = () => {
    hidden = typeof document !== 'undefined' && document.hidden;
    if (!ctx || !entered) return;
    if (hidden) ctx.suspend?.().catch?.(() => {});
    else if (!userPaused) ctx.resume?.().catch?.(() => {});
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

  const sfxLvl = () => loudness(getLevel?.() || DEFAULT_LEVEL());
  const bgmLvl = () => (userPaused || hidden || bgmOff ? 0 : loudness(getLevel?.() || DEFAULT_LEVEL()));

  async function bake() {
    const c = ac(); if (!c || buffers || sfxOff) return buffers;
    if (baking) return baking;
    baking = (async () => {
      const out = Object.create(null);
      for (const [k, fn] of Object.entries(SFX_BAKE)) {
        try { out[k] = fn(c); } catch (e) { console.warn('[depot-audio] bake', k, e?.message || e); }
      }
      if (Offline && !bgmOff) {
        try {
          out.__bgm0 = await bakeBgmPhrase(Offline, c.sampleRate, 0, BGM_BARS);
          out.__bgm1 = await bakeBgmPhrase(Offline, c.sampleRate, 1, BGM_BARS);
        } catch (e) { console.warn('[depot-audio] bake bgm', e?.message || e); }
      }
      buffers = out;
      return out;
    })();
    try { return await baking; } finally { baking = null; }
  }

  function stealVoice() {
    if (voices.length < MAX_VOICES) return null;
    let old = voices[0], idx = 0;
    for (let i = 1; i < voices.length; i++) if (voices[i].t < old.t) { old = voices[i]; idx = i; }
    try { old.src.stop(); } catch { /* */ }
    try { old.src.disconnect(); old.gain.disconnect(); } catch { /* */ }
    voices.splice(idx, 1);
    if (old.panSlot) old.panSlot.busy = false;
    return old;
  }
  function nextPanner() {
    for (let i = 0; i < panners.length; i++) {
      const s = panners[(panI + i) % panners.length];
      if (!s.busy) { panI = (panI + i + 1) % panners.length; s.busy = true; return s; }
    }
    const s = panners[panI % panners.length]; panI = (panI + 1) % panners.length; return s;
  }
  function setPanPos(node, pos) {
    if (!pos || !node) return;
    const x = pos.x ?? pos[0], y = pos.y ?? pos[1] ?? 1.1, z = pos.z ?? pos[2];
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (node.positionX) { node.positionX.setValueAtTime(x, ctx.currentTime); node.positionY.setValueAtTime(y, ctx.currentTime); node.positionZ.setValueAtTime(z, ctx.currentTime); }
    else node.setPosition?.(x, y, z);
  }

  function playBuf(name, { gain = 1, rate = 1, pos = null, loop = false, dest = null, when = 0 } = {}) {
    const c = ac(); if (!c || !buffers?.[name] || sfxOff) return null;
    const g0 = sfxLvl(); if (g0 <= 0 && !loop) return null;
    stealVoice();
    try {
      if (c.state !== 'running') c.resume?.().catch?.(() => {});
      const src = c.createBufferSource();
      src.buffer = buffers[name]; src.loop = !!loop;
      src.playbackRate.value = Math.max(0.4, Math.min(2.2, rate));
      const g = c.createGain();
      const t0 = c.currentTime + (when || 0.008);
      g.gain.setValueAtTime(Math.max(0.0001, gain * (loop ? 1 : g0)), t0);
      let panSlot = null;
      if (pos) {
        panSlot = nextPanner();
        setPanPos(panSlot.node, pos);
        src.connect(g); g.connect(panSlot.node); panSlot.node.connect(dest || sfxBus);
      } else {
        src.connect(g); g.connect(dest || sfxBus);
      }
      src.start(t0);
      const voice = { src, gain: g, panSlot, t: t0, g: gain };
      if (!loop) {
        voices.push(voice);
        src.onended = () => {
          const i = voices.indexOf(voice);
          if (i >= 0) voices.splice(i, 1);
          if (panSlot) panSlot.busy = false;
          try { src.disconnect(); g.disconnect(); } catch { /* */ }
        };
      }
      return voice;
    } catch { return null; }
  }

  function stopLoop(key, fade = 0.15) {
    const L = loops.get(key); if (!L || !ctx) { loops.delete(key); return; }
    try {
      const t = ctx.currentTime;
      L.gain.gain.cancelScheduledValues(t);
      L.gain.gain.setValueAtTime(L.gain.gain.value, t);
      L.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => { try { L.src.stop(); L.src.disconnect(); L.gain.disconnect(); } catch { /* */ } if (L.panSlot) L.panSlot.busy = false; }, fade * 1000 + 40);
    } catch { /* */ }
    loops.delete(key);
  }
  function startLoop(key, bufName, { gain = 0.2, pos = null, rate = 1, dest = null } = {}) {
    if (loops.has(key)) {
      const L = loops.get(key);
      if (pos) setPanPos(L.panSlot?.node, pos);
      if (ctx) L.gain.gain.setTargetAtTime(Math.max(0.0001, gain * sfxLvl()), ctx.currentTime, 0.08);
      return L;
    }
    const v = playBuf(bufName, { gain: gain * Math.max(sfxLvl(), 0.0001), rate, pos, loop: true, dest: dest || sfxBus });
    if (v) loops.set(key, v);
    return v;
  }

  function fadeBgmTo(target, dur = 1.0) {
    if (!bgmBus || !ctx) return;
    const t = ctx.currentTime, tok = ++bgmFadeTok;
    try {
      bgmBus.gain.cancelScheduledValues(t);
      bgmBus.gain.setValueAtTime(bgmBus.gain.value, t);
      if (dur <= 0.02) bgmBus.gain.setValueAtTime(target, t + 0.01);
      else bgmBus.gain.linearRampToValueAtTime(target, t + dur);
    } catch { /* */ }
    return tok;
  }

  function startBgmLiveSchedule() {
    // 구운 버퍼가 없을 때(Offline 없음) 라이브 시퀀서로 폴백
    const c = ac(); if (!c || !bgmBus) return;
    const dur = phraseDur(BGM_BARS);
    const loop = () => {
      if (!entered || disposed || gen !== startBgmLiveSchedule._gen) return;
      scheduleDepotBgm(c, bgmBus, { t0: c.currentTime + 0.03, bars: BGM_BARS, phrase: bgmPhrase, gain: 0.28 });
      bgmPhrase ^= 1;
      startBgmLiveSchedule._timer = setTimeout(loop, dur * 1000 - 80);
    };
    startBgmLiveSchedule._gen = gen;
    loop();
  }
  function stopBgmLiveSchedule() {
    startBgmLiveSchedule._gen = -1;
    if (startBgmLiveSchedule._timer) { clearTimeout(startBgmLiveSchedule._timer); startBgmLiveSchedule._timer = 0; }
  }

  function startBgmBuffers() {
    const c = ac(); if (!c || bgmOff) return;
    const a = buffers.__bgm0, b = buffers.__bgm1 || buffers.__bgm0;
    if (!a) { startBgmLiveSchedule(); return; }
    const startOne = (i, buf, at, fadeIn) => {
      try { bgmSrc[i]?.stop(); } catch { /* */ }
      const src = c.createBufferSource(); src.buffer = buf; src.loop = false;
      const g = c.createGain();
      g.gain.setValueAtTime(fadeIn ? 0.0001 : 1, at);
      if (fadeIn) g.gain.linearRampToValueAtTime(1, at + 0.08);
      src.connect(g); g.connect(bgmBus);
      src.start(at);
      src.onended = () => {};
      bgmSrc[i] = src; bgmGain[i] = g;
    };
    const t0 = c.currentTime + 0.05;
    startOne(0, a, t0, false);
    bgmIdx = 0; bgmStartedAt = t0; bgmPhrase = 0;
    // 다음 프레이즈를 끝나기 0.08초 전에 이어서 붙임
    const arm = () => {
      if (!entered || disposed) return;
      const cur = buffers[bgmPhrase === 0 ? '__bgm1' : '__bgm0'] || a;
      const next = bgmIdx ^ 1;
      const end = bgmStartedAt + (bgmSrc[bgmIdx]?.buffer?.duration || phraseDur(BGM_BARS));
      const at = Math.max(c.currentTime + 0.05, end - 0.08);
      startOne(next, cur, at, true);
      try {
        const g = bgmGain[bgmIdx];
        if (g) { g.gain.setValueAtTime(1, at); g.gain.linearRampToValueAtTime(0.0001, at + 0.08); }
      } catch { /* */ }
      bgmIdx = next; bgmStartedAt = at; bgmPhrase ^= 1;
      const wait = Math.max(200, (at + (cur.duration || phraseDur(BGM_BARS)) - 0.2 - c.currentTime) * 1000);
      startBgmBuffers._timer = setTimeout(arm, wait);
    };
    const firstWait = Math.max(200, ((a.duration || phraseDur(BGM_BARS)) - 0.25) * 1000);
    startBgmBuffers._timer = setTimeout(arm, firstWait);
  }
  function stopBgmBuffers() {
    if (startBgmBuffers._timer) { clearTimeout(startBgmBuffers._timer); startBgmBuffers._timer = 0; }
    stopBgmLiveSchedule();
    for (let i = 0; i < 2; i++) {
      try { bgmSrc[i]?.stop(); bgmSrc[i]?.disconnect(); bgmGain[i]?.disconnect(); } catch { /* */ }
      bgmSrc[i] = bgmGain[i] = null;
    }
  }

  function startAmbience() {
    if (!buffers) return;
    const g0 = Math.max(sfxLvl(), 0.0001);
    if (buffers['ambient-hvac'] && !hvacSrc) {
      const v = playBuf('ambient-hvac', { gain: 0.18 * g0, loop: true, dest: ambBus });
      if (v) { hvacSrc = v.src; hvacGain = v.gain; }
    }
    if (buffers['ambient-crowd'] && !crowdSrc) {
      const v = playBuf('ambient-crowd', { gain: 0.12 * g0, loop: true, dest: ambBus });
      if (v) { crowdSrc = v.src; crowdGain = v.gain; }
    }
    if (buffers['freezer-hum'] && !freezerSrc) {
      const v = playBuf('freezer-hum', { gain: 0.22 * g0, loop: true, pos: FREEZER, dest: ambBus });
      if (v) { freezerSrc = v.src; freezerGain = v.gain; freezerPan = v.panSlot; }
    }
  }
  function stopAmbience() {
    for (const s of [hvacSrc, crowdSrc, freezerSrc]) try { s?.stop(); s?.disconnect(); } catch { /* */ }
    hvacSrc = crowdSrc = freezerSrc = null; hvacGain = crowdGain = freezerGain = null;
    if (freezerPan) freezerPan.busy = false; freezerPan = null;
  }

  function setExternalHud(on) {
    const pl = getBgmPlayer?.();
    if (!pl?.setExternal) return;
    if (!on) { pl.setExternal(null); return; }
    pl.setExternal({
      id: BGM_ID,
      title: BGM_TITLE,
      playing: true,
      progress: () => {
        if (!ctx || !bgmStartedAt) return 0;
        const dur = bgmSrc[bgmIdx]?.buffer?.duration || phraseDur(BGM_BARS);
        const t = Math.max(0, ctx.currentTime - bgmStartedAt);
        return dur > 0 ? (t / dur) % 1 : 0;
      },
      spectrum: () => {
        if (!analyser) return null;
        analyser.getByteFrequencyData(levels);
        return levels;
      },
    });
  }

  function applyWorldHold(on) {
    const pl = getBgmPlayer?.();
    try { if (on) pl?.hold?.(true); else { pl?.setExternal?.(null); pl?.hold?.(false); } } catch { /* */ }
  }

  async function enter() {
    if (disposed) return;
    leaveTok += 1; // 진행 중인 leave 콜백 무효
    entered = true; gen += 1; const my = gen;
    userPaused = !!(getBgmPlayer?.()?.paused);
    ac(); unlock();
    applyWorldHold(true);
    await bake();
    if (my !== gen || !entered || disposed) return;
    startAmbience();
    if (!bgmOff) {
      startBgmBuffers();
      fadeBgmTo(Math.max(0.0001, 0.72 * bgmLvl() || 0.0001), 1.15);
      setExternalHud(true);
    }
    paTimer = 12 + Math.random() * 6; paFirst = true;
    cartDist = 0; lastJoint = 0;
  }

  function leave() {
    if (!entered && !ctx) return;
    entered = false; gen += 1;
    const tok = ++leaveTok;
    fadeBgmTo(0, 0.7);
    // 0.35초 뒤 월드 OST 페이드인 = 크로스페이드. 다시 들어가면 tok 가 바뀌어 건드리지 않음.
    setTimeout(() => {
      if (tok !== leaveTok) return;
      try { getBgmPlayer?.()?.setExternal?.(null); getBgmPlayer?.()?.hold?.(false); } catch { /* */ }
    }, 350);
    setTimeout(() => { if (tok !== leaveTok) return; disposeGraph(); }, 800);
  }

  function disposeGraph() {
    stopBgmBuffers();
    stopAmbience();
    if (rollSrc) { try { rollSrc.stop(); rollSrc.disconnect(); rollGain?.disconnect(); } catch { /* */ } rollSrc = rollGain = null; rollOn = false; }
    for (const k of [...loops.keys()]) stopLoop(k, 0.05);
    for (const v of voices.splice(0)) {
      try { v.src.stop(); v.src.disconnect(); v.gain.disconnect(); } catch { /* */ }
      if (v.panSlot) v.panSlot.busy = false;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true; entered = false; gen += 1; leaveTok += 1;
    disposeGraph();
    try { getBgmPlayer?.()?.setExternal?.(null); } catch { /* */ }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
    try { ctx?.close(); } catch { /* */ }
    ctx = master = sfxBus = bgmBus = ambBus = comp = analyser = null;
    buffers = null;
  }

  function playStaffTalk(text, level = 1, pos) {
    const now = ctx ? ctx.currentTime : 0;
    if (now - lastStaffAt < 0.15) return;
    lastStaffAt = now;
    const n = Math.min(18, Math.max(3, syllables(text)));
    const base = 240 + Math.min(4, level) * 35;
    for (let i = 0; i < n; i++) {
      const jitter = 0.82 + (Math.sin(i * 2.7 + level) * 0.5 + 0.5) * 0.4;
      const rate = (base * jitter) / 280;
      playBuf('staff-blip', { gain: 0.22 + level * 0.04, rate, pos, when: 0.02 + i * (0.075 + (level >= 3 ? 0.01 : 0.02)) });
    }
  }

  function play(name, opts = {}) {
    if (!name || sfxOff || disposed || !entered) return false;
    if (!buffers) { bake().then(() => { if (entered && !disposed) play(name, opts); }); return false; }
    const pos = opts.pos || null;
    const on = opts.on;
    // 루프형 (계산대 벨트, 가전)
    if (LOOP_EVENTS.has(name)) {
      const key = `${name}:${opts.id || ''}`;
      if (on === false) { stopLoop(key); return true; }
      startLoop(key, name, { gain: opts.gain ?? (name === 'elec-tv' ? 0.12 : name === 'elec-vac' ? 0.2 : 0.18), pos, rate: opts.rate || 1 });
      return true;
    }
    switch (name) {
      case 'item-pick': {
        const mat = opts.material || materialOf(opts.product) || 'cardboard';
        const key = mat === 'egg' ? 'pick-egg' : mat === 'bottle' ? 'pick-bottle' : mat === 'sack' ? 'pick-sack' : mat === 'melon' ? 'pick-melon' : mat === 'tray' ? 'pick-tray' : 'pick-cardboard';
        return !!playBuf(key, { gain: 0.9, pos, rate: 0.94 + Math.random() * 0.12 });
      }
      case 'item-place': {
        const key = placeBufForKg(opts.kg);
        const rate = opts.kg > 15 ? 0.85 : opts.kg > 5 ? 0.95 : 1.05;
        return !!playBuf(key, { gain: 0.85 + Math.min(0.4, (opts.kg || 1) / 30), pos, rate });
      }
      case 'staff-talk':
        playStaffTalk(opts.text || opts.line || '', opts.level || 1, pos);
        return true;
      case 'pa-chime': {
        playBuf('pa-chime', { gain: 0.7 });
        const text = opts.text || PA_TEXTS[Math.floor(Math.random() * PA_TEXTS.length)];
        try { onAnnounce?.(text); } catch { /* */ }
        return true;
      }
      case 'egg-crack':
        playBuf('egg-crack', { gain: 0.7 + Math.min(0.4, (opts.n || 1) * 0.08), pos, rate: 0.95 + Math.random() * 0.1 });
        if ((opts.n || 1) >= 3 || opts.splat) playBuf('egg-splat', { gain: 0.55, pos, when: 0.04 });
        return true;
      case 'egg-splat':
        return !!playBuf('egg-splat', { gain: 0.7, pos });
      default:
        return !!playBuf(name, { gain: opts.gain ?? 0.85, pos, rate: opts.rate || 1 });
    }
  }

  function setListener(cam) {
    if (!ctx?.listener || !cam) return;
    const p = cam.position || cam;
    const l = ctx.listener;
    const t = ctx.currentTime;
    const x = p.x, y = p.y, z = p.z;
    if (!Number.isFinite(x)) return;
    if (l.positionX) {
      l.positionX.setValueAtTime(x, t); l.positionY.setValueAtTime(y, t); l.positionZ.setValueAtTime(z, t);
    } else l.setPosition?.(x, y, z);
    // 카메라 전방·위
    let fx = listenerFwd.x, fy = listenerFwd.y, fz = listenerFwd.z;
    if (cam.getWorldDirection) {
      // getWorldDirection 은 할당이 생기므로 미리 둔 객체에 쓴다
      if (!setListener._v) setListener._v = { x: 0, y: 0, z: -1, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
    }
    if (typeof cam.rotation?.y === 'number') {
      // YXZ: yaw = rotation.y
      const yaw = cam.rotation.y, pitch = cam.rotation.x || 0;
      fx = -Math.sin(yaw) * Math.cos(pitch);
      fy = Math.sin(pitch);
      fz = -Math.cos(yaw) * Math.cos(pitch);
    }
    if (l.forwardX) {
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(fy, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else l.setOrientation?.(fx, fy, fz, 0, 1, 0);
    void listenerUp;
  }

  function tick(dt, { camera, cart, paused } = {}) {
    if (!entered || disposed || !ctx) return;
    // HUD 일시정지 반영 (월드 플레이어의 userPaused)
    const pl = getBgmPlayer?.();
    const wantPause = !!(paused || pl?.paused);
    if (wantPause !== userPaused) {
      userPaused = wantPause;
      fadeBgmTo(userPaused ? 0 : Math.max(0.0001, 0.72 * bgmLvl()), 0.25);
    }
    const gSfx = sfxLvl();
    const gBgm = bgmLvl();
    if (bgmBus && !userPaused) {
      // 볼륨 슬라이더 반영 (페이드 중이 아닐 때만 살살)
      const target = 0.72 * gBgm;
      if (Math.abs(bgmBus.gain.value - target) > 0.04) bgmBus.gain.setTargetAtTime(Math.max(0.0001, target), ctx.currentTime, 0.12);
    }
    if (ambBus) ambBus.gain.setTargetAtTime(Math.max(0.0001, 0.7 * gSfx), ctx.currentTime, 0.2);
    if (camera) setListener(camera);

    // 카트 바퀴
    if (cart && buffers?.['cart-roll']) {
      const held = !!cart.held, sp = Math.max(0, Number(cart.speed) || 0), load = Math.max(0, Number(cart.loadKg) || 0);
      const want = held && sp > 0.06 && gSfx > 0;
      if (want && !rollOn) {
        const v = playBuf('cart-roll', { gain: 0.0001, loop: true, dest: sfxBus });
        if (v) { rollSrc = v.src; rollGain = v.gain; rollOn = true; }
      } else if (!want && rollOn && rollGain) {
        try { rollGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); } catch { /* */ }
        // 완전히 멈추면 잠시 후 정지하지 않고 게인만 0 — 재시작 할당을 줄임. 2초 정지 시 정지.
        rollOn = false;
      }
      if (rollSrc && rollGain) {
        const loadK = Math.min(1, load / 120);
        const g = want ? (0.08 + sp * 0.12) * (1 + loadK * 0.5) * gSfx : 0.0001;
        const rate = (0.85 + sp * 0.25) * (1 - loadK * 0.18);
        try {
          rollGain.gain.setTargetAtTime(Math.max(0.0001, g), ctx.currentTime, 0.05);
          rollSrc.playbackRate.setTargetAtTime(Math.max(0.6, Math.min(1.8, rate)), ctx.currentTime, 0.05);
        } catch { /* */ }
        rollRate = rate;
      }
      if (want && Number.isFinite(cart.x) && Number.isFinite(cart.z)) {
        const step = sp * dt;
        cartDist += step;
        const joint = Math.floor(cartDist / JOINT_M);
        if (joint !== lastJoint && sp > 0.25) {
          lastJoint = joint;
          playBuf('cart-joint', { gain: 0.25 + loadKSafe(load) * 0.15, pos: { x: cart.x, y: 0.15, z: cart.z }, rate: 0.9 + Math.random() * 0.2 });
        }
      }
    }

    // 안내 방송
    if (gSfx > 0 && !userPaused) {
      paTimer -= dt;
      if (paTimer <= 0) {
        play('pa-chime', { text: PA_TEXTS[Math.floor(Math.random() * PA_TEXTS.length)] });
        paTimer = (paFirst ? 55 : 50) + Math.random() * 30;
        paFirst = false;
      }
    }
  }
  function loadKSafe(load) { return Math.min(1, (load || 0) / 120); }

  function wobble(pos) {
    const t = ctx ? ctx.currentTime : 0;
    if (t - lastWobbleAt < 0.45) return;
    lastWobbleAt = t;
    play('item-wobble', { pos });
  }

  return {
    play,
    tick,
    enter,
    leave,
    dispose,
    unlock,
    wobble,
    setListener,
    materialOf,
    get entered() { return entered; },
    get ready() { return !!buffers; },
    get ctxState() { return ctx?.state || null; },
    events: EVENT_NAMES,
    _dbg: {
      buffers: () => buffers && Object.keys(buffers),
      voices: () => voices.length,
      loops: () => [...loops.keys()],
      paNow: (text) => play('pa-chime', { text }),
      bake,
    },
  };
}

export default createDepotAudio;
