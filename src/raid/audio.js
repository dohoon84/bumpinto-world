// 레이드 오디오. 파일은 public/dungeon/audio, 출처는 CREDITS.md.
// 마스터 / BGM / 효과 버스. 큰 타격은 BGM 을 잠깐 낮추고, 보스·스킬은 위치 음이다.

const FILES = {
  slash: ['sfx/blade_01.ogg', 'sfx/blade_02.ogg', 'sfx/blade_03.ogg'],
  slam: ['sfx/blade_01.ogg', 'sfx/chain_03.ogg'],
  charge: ['sfx/chain_03.ogg', 'sfx/blade_02.ogg'],
  whirl: ['sfx/chop.ogg', 'sfx/blade_03.ogg'],
  shout: ['sfx/creature_roar_01.ogg'],
  spin: ['sfx/blade_03.ogg', 'sfx/chop.ogg'],
  fire: ['sfx/magic2.ogg'],
  frost: ['sfx/coldsnap.wav'],
  heal: ['sfx/heal.ogg'],
  holy: ['sfx/bong_001.ogg'],
  shield: ['sfx/metalLatch.ogg'],
  pierce: ['sfx/drawKnife2.ogg'],
  multi: ['sfx/drawKnife1.ogg'],
  rain: ['sfx/metalPot1.ogg'],
  blink: ['sfx/footstep02.ogg'],
  combo: ['sfx/knifeSlice.ogg', 'sfx/knifeSlice2.ogg'],
  dodge: ['sfx/footstep02.ogg', 'sfx/drawKnife1.ogg'],
  hit: ['sfx/blade_01.ogg', 'sfx/metalPot1.ogg', 'sfx/metalPot2.ogg'],
  hurt: ['sfx/metalLatch.ogg'],
  wind: ['sfx/coldsnap.wav'],
  transform: ['sfx/magic2.ogg'],
  warn: ['sfx/bong_001.ogg', 'sfx/error_003.ogg'],
  ui: ['sfx/click_001.ogg', 'sfx/click_002.ogg', 'sfx/click_003.ogg'],
  ice: ['sfx/magic.ogg', 'sfx/magic2.ogg'],
  arrow: ['sfx/drawKnife1.ogg', 'sfx/drawKnife2.ogg'],
  arrowHit: ['sfx/metalClick.ogg', 'sfx/metalPot1.ogg'],
  dagger: ['sfx/knifeSlice.ogg', 'sfx/knifeSlice2.ogg', 'sfx/chop.ogg'],
  siren: ['alert-siren.ogg'],
  roar: ['sfx/creature_roar_01.ogg', 'sfx/creature_roar_02.ogg', 'sfx/creature_roar_03.ogg'],
  step: ['sfx/footstep00.ogg', 'sfx/footstep01.ogg', 'sfx/footstep02.ogg', 'sfx/footstep03.ogg'],
  levelup: ['sfx/level-up.mp3'],
  victory: ['victory.ogg'],
};

const MUSIC = {
  peace: 'bgm-calm.ogg',
  1: 'bgm-phase1.ogg',
  2: 'bgm-phase2.ogg',
  3: 'bgm-phase3.ogg',
};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function createRaidAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let duck = null;
  let muted = false;
  let mode = 'none';
  let bossPhase = 1;
  let musicGain = 0.72;
  let sfxGain = 0.9;
  let masterGain = 0.85;
  const buffers = new Map();
  const loading = new Map();
  let currentMusic = null;
  let musicToken = 0;
  let ambStage = 0;
  let ambT = 3;
  const SYNTH = new Set(['bolt', 'poison', 'boom', 'crumble']);

  function synth(kind, gain) {
    const ac = ensure();
    if (!ac || muted) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const filter = ac.createBiquadFilter();
    const g = ac.createGain();
    o.connect(filter);
    filter.connect(g);
    g.connect(sfxBus);
    if (kind === 'bolt') {
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(320, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.16);
      filter.type = 'highpass';
      filter.frequency.value = 500;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.start(t);
      o.stop(t + 0.2);
    } else if (kind === 'poison') {
      o.type = 'triangle';
      o.frequency.setValueAtTime(180, t);
      o.frequency.linearRampToValueAtTime(90, t + 0.4);
      filter.type = 'bandpass';
      filter.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain * 0.45, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.start(t);
      o.stop(t + 0.44);
    } else if (kind === 'boom') {
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(32, t + 0.45);
      filter.type = 'lowpass';
      filter.frequency.value = 240;
      g.gain.setValueAtTime(gain * 0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.start(t);
      o.stop(t + 0.52);
    } else {
      const len = Math.floor(ac.sampleRate * 0.35);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      src.buffer = buf;
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      src.connect(filter);
      g.gain.setValueAtTime(gain * 0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      src.start(t);
    }
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    duck = ctx.createGain();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    master.gain.value = masterGain;
    duck.gain.value = 1;
    musicBus.gain.value = musicGain;
    sfxBus.gain.value = sfxGain;
    musicBus.connect(duck);
    duck.connect(master);
    sfxBus.connect(master);
    master.connect(ctx.destination);
    if (ctx.listener.positionX) {
      ctx.listener.positionX.value = 0;
      ctx.listener.positionY.value = 1.6;
      ctx.listener.positionZ.value = 0;
    }
    return ctx;
  }

  function applyGains() {
    if (!master) return;
    master.gain.value = muted ? 0 : masterGain;
    musicBus.gain.value = musicGain;
    sfxBus.gain.value = sfxGain;
  }

  function load(url) {
    if (buffers.has(url)) return Promise.resolve(buffers.get(url));
    if (loading.has(url)) return loading.get(url);
    const job = fetch(`/dungeon/audio/${url}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status);
        return res.arrayBuffer();
      })
      .then((raw) => ensure().decodeAudioData(raw))
      .then((buf) => {
        buffers.set(url, buf);
        loading.delete(url);
        return buf;
      })
      .catch((err) => {
        loading.delete(url);
        console.warn('[raid] audio', url, err);
        return null;
      });
    loading.set(url, job);
    return job;
  }

  function playBuffer(buf, { loop = false, gain = 0.8, rate = 1, bus = 'sfx', x, z, dest } = {}) {
    const ac = ensure();
    if (!ac || !buf || muted) return null;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.value = gain;
    src.connect(g);
    if (x != null && z != null && ac.createPanner) {
      const p = ac.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 3.5;
      p.maxDistance = 70;
      p.rolloffFactor = 1.15;
      if (p.positionX) {
        p.positionX.value = x;
        p.positionY.value = 1.2;
        p.positionZ.value = z;
      } else p.setPosition(x, 1.2, z);
      g.connect(p);
      p.connect(dest || (bus === 'music' ? musicBus : sfxBus));
    } else {
      g.connect(dest || (bus === 'music' ? musicBus : sfxBus));
    }
    src.start();
    return { src, gain: g };
  }

  function duckBgm(amount, hold) {
    const ac = ensure();
    if (!ac || !duck) return;
    const t = ac.currentTime;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(duck.gain.value, t);
    duck.gain.linearRampToValueAtTime(Math.max(0.15, 1 - amount), t + 0.04);
    duck.gain.linearRampToValueAtTime(1, t + hold);
  }

  async function startMusic(url, loop) {
    const token = ++musicToken;
    const buf = await load(url);
    if (!buf || token !== musicToken || muted && false) return;
    const ac = ensure();
    if (!ac) return;
    const next = playBuffer(buf, { loop, gain: 0.001, bus: 'music' });
    if (!next) return;
    const t = ac.currentTime;
    next.gain.gain.cancelScheduledValues(t);
    next.gain.gain.setValueAtTime(0.001, t);
    next.gain.gain.linearRampToValueAtTime(1, t + 1.3);
    if (currentMusic) {
      const prev = currentMusic;
      prev.gain.gain.cancelScheduledValues(t);
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, t);
      prev.gain.gain.linearRampToValueAtTime(0.001, t + 1.3);
      prev.src.stop(t + 1.4);
    }
    currentMusic = next;
  }

  function musicForMode() {
    if (mode === 'peace') return MUSIC.peace;
    if (mode === 'boss') return MUSIC[bossPhase] || MUSIC[1];
    return null;
  }

  return {
    get muted() { return muted; },
    unlock() {
      const ac = ensure();
      if (ac && ac.state === 'suspended') ac.resume();
    },
    setMuted(v) {
      muted = !!v;
      applyGains();
      if (!muted && musicForMode() && !currentMusic) startMusic(musicForMode(), true);
    },
    setVolumes({ master: m, bgm, sfx } = {}) {
      if (m != null) masterGain = m;
      if (bgm != null) musicGain = bgm;
      if (sfx != null) sfxGain = sfx;
      applyGains();
    },
    setListener(ear) {
      const ac = ensure();
      if (!ac || !ear) return;
      if (ac.listener.positionX) {
        ac.listener.positionX.value = ear.x;
        ac.listener.positionY.value = ear.y;
        ac.listener.positionZ.value = ear.z;
        if (ear.fx != null) {
          ac.listener.forwardX.value = ear.fx;
          ac.listener.forwardY.value = ear.fy;
          ac.listener.forwardZ.value = ear.fz;
          ac.listener.upX.value = 0;
          ac.listener.upY.value = 1;
          ac.listener.upZ.value = 0;
        }
      } else if (ac.listener.setPosition) ac.listener.setPosition(ear.x, ear.y, ear.z);
    },
    setBossPhase(phase) {
      const next = phase <= 1 ? 1 : phase === 2 ? 2 : 3;
      if (next === bossPhase && mode === 'boss') return;
      bossPhase = next;
      if (mode === 'boss') startMusic(MUSIC[bossPhase], true);
    },
    playBgm(next) {
      ensure();
      mode = next === 'boss' || next === 'peace' ? next : 'none';
      if (mode === 'none') {
        musicToken += 1;
        if (currentMusic) {
          const t = ctx.currentTime;
          currentMusic.gain.gain.cancelScheduledValues(t);
          currentMusic.gain.gain.linearRampToValueAtTime(0.001, t + 0.6);
          currentMusic.src.stop(t + 0.7);
          currentMusic = null;
        }
        return;
      }
      startMusic(musicForMode(), true);
    },
    playSfx(name, opts = {}) {
      const ac = ensure();
      if (!ac || muted) return;
      if (ac.state === 'suspended') ac.resume();
      if (SYNTH.has(name)) {
        synth(name, (opts.gain || 0.7) * (0.9 + Math.random() * 0.15));
        return;
      }
      const list = FILES[name];
      if (!list) return;
      const url = pick(list);
      const rate = name === 'siren' || name === 'levelup' ? 1 : 0.92 + Math.random() * 0.16;
      const gain = (opts.gain || 0.85) * (0.9 + Math.random() * 0.2);
      load(url).then((buf) => {
        if (!buf) return;
        playBuffer(buf, { gain, rate, x: opts.x, z: opts.z, bus: 'sfx' });
      });
      if (opts.big || name === 'roar' || name === 'slam') duckBgm(name === 'roar' ? 0.62 : 0.4, name === 'roar' ? 1.1 : 0.55);
    },
    playSting(name) {
      if (name === 'levelup') this.playSfx('levelup', { gain: 0.7 });
      else if (name === 'victory') {
        this.playBgm('none');
        load(FILES.victory[0]).then((buf) => playBuffer(buf, { gain: 0.9, bus: 'music' }));
      }
    },
    setAmbience(stage) { ambStage = stage || 0; },
    tick(dt = 0.016) {
      if (!ambStage || muted) return;
      ambT -= dt;
      if (ambT > 0) return;
      ambT = ambStage >= 3 ? 2.2 : ambStage === 2 ? 3.8 : 6.5;
      this.playSfx(Math.random() < 0.45 ? 'boom' : 'crumble', { gain: 0.28 + ambStage * 0.05 });
      if (ambStage >= 2 && Math.random() < 0.35) this.playSfx('siren', { gain: 0.18 });
    },
  };
}
