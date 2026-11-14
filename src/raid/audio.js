// 레이드 오디오. 파일은 public/dungeon/audio, 출처는 CREDITS.md.
// 마스터 / BGM / 효과 버스. 큰 타격은 BGM 을 잠깐 낮추고, 보스·스킬은 위치 음이다.

const FA = 'sfx/fa';
const FILES = {
  slash: ['sfx/knifeSlice.ogg', 'sfx/knifeSlice2.ogg', 'sfx/chop.ogg', 'sfx/blade_01.ogg'],
  slam: [`${FA}/bang-01.ogg`, `${FA}/bang-03.ogg`, `${FA}/cannon-01.ogg`],
  charge: [`${FA}/hit-plate-0.ogg`, `${FA}/hit-punch-0.ogg`, 'sfx/chain_03.ogg'],
  whirl: ['sfx/chop.ogg', 'sfx/knifeSlice2.ogg', 'sfx/blade_03.ogg'],
  shout: ['sfx/creature_roar_01.ogg'],
  spin: ['sfx/blade_03.ogg', 'sfx/chop.ogg'],
  fire: [`${FA}/spell-fire-01.ogg`, `${FA}/spell-fire-02.ogg`, `${FA}/spell-fire-03.ogg`, `${FA}/bang-04.ogg`],
  frost: [`${FA}/spell-01.ogg`, `${FA}/spell-02.ogg`, 'sfx/coldsnap.wav'],
  heal: ['sfx/heal.ogg', `${FA}/gem-01.ogg`, `${FA}/gem-02.ogg`, `${FA}/gem-03.ogg`],
  holy: [`${FA}/gem-01.ogg`, `${FA}/gem-03.ogg`, 'sfx/bong_001.ogg'],
  shield: [`${FA}/hit-plate-1.ogg`, 'sfx/metalLatch.ogg', `${FA}/hit-metal-1.ogg`],
  pierce: ['sfx/drawKnife2.ogg', 'sfx/drawKnife1.ogg'],
  multi: ['sfx/drawKnife1.ogg', 'sfx/knifeSlice.ogg'],
  rain: [`${FA}/spell-02.ogg`, 'sfx/drawKnife1.ogg'],
  blink: ['sfx/footstep02.ogg', `${FA}/spell-01.ogg`],
  combo: ['sfx/knifeSlice.ogg', 'sfx/knifeSlice2.ogg', 'sfx/chop.ogg', 'sfx/blade_02.ogg'],
  dodge: ['sfx/footstep02.ogg', 'sfx/drawKnife1.ogg'],
  hit: [`${FA}/hit-metal-0.ogg`, `${FA}/hit-metal-1.ogg`, `${FA}/hit-metal-2.ogg`, `${FA}/hit-plate-0.ogg`, `${FA}/hit-punch-0.ogg`, `${FA}/hit-punch-1.ogg`],
  hurt: [`${FA}/hit-plate-1.ogg`, `${FA}/hit-metal-2.ogg`, 'sfx/metalLatch.ogg'],
  wind: ['sfx/coldsnap.wav', `${FA}/spell-02.ogg`],
  transform: [`${FA}/spell-01.ogg`, `${FA}/hit-metal-0.ogg`],
  warn: ['sfx/bong_001.ogg', 'sfx/error_003.ogg'],
  ui: ['sfx/click_001.ogg', 'sfx/click_002.ogg', 'sfx/click_003.ogg'],
  ice: [`${FA}/spell-01.ogg`, `${FA}/spell-02.ogg`],
  arrow: ['sfx/drawKnife1.ogg', 'sfx/drawKnife2.ogg'],
  arrowHit: [`${FA}/hit-punch-1.ogg`, `${FA}/hit-metal-1.ogg`],
  dagger: ['sfx/knifeSlice.ogg', 'sfx/knifeSlice2.ogg', 'sfx/chop.ogg'],
  siren: ['alert-siren.ogg'],
  roar: ['sfx/creature_roar_01.ogg', 'sfx/creature_roar_02.ogg', 'sfx/creature_roar_03.ogg'],
  step: ['sfx/footstep00.ogg', 'sfx/footstep01.ogg', 'sfx/footstep02.ogg', 'sfx/footstep03.ogg'],
  levelup: ['sfx/level-up.mp3'],
  victory: ['victory.ogg'],
  bolt: [`${FA}/bang-03.ogg`, `${FA}/spell-02.ogg`],
  poison: [`${FA}/spell-01.ogg`, `${FA}/spell-02.ogg`],
  boom: [`${FA}/bang-01.ogg`, `${FA}/bang-02.ogg`, `${FA}/bang-06.ogg`, `${FA}/cannon-01.ogg`, `${FA}/cannon-02.ogg`],
  crumble: [`${FA}/bang-08.ogg`, `${FA}/bang-10.ogg`, `${FA}/cannon-03.ogg`, `${FA}/bang-06.ogg`],
};

const MUSIC = {
  peace: 'bgm-calm.ogg',
  alert: 'bgm-battle-a.ogg',
  cutscene: 'bgm-qazi.ogg',
  1: 'bgm-epic-boss.ogg',
  2: 'bgm-pursuit.ogg',
  3: 'bgm-phase3.ogg',
};

// Peak-safe loudness so the new recordings sit with the existing mix.
// BGM targets about -14 dB mean without crossing -1.5 dBTP. Quiet spell files are brought up to the same peak.
const LOUD = {
  'bgm-epic-boss.ogg': 0.53,
  'bgm-qazi.ogg': 0.84,
  'bgm-pursuit.ogg': 1.07,
  'bgm-phase3.ogg': 0.85,
  'bgm-battle-a.ogg': 0.87,
  'sfx/heal.ogg': 2.37,
  'sfx/fa/spell-fire-01.ogg': 6.68,
  'sfx/fa/spell-fire-02.ogg': 14.62,
  'sfx/fa/spell-fire-03.ogg': 4.79,
  'sfx/fa/gem-02.ogg': 1.55,
  'sfx/fa/bang-04.ogg': 1.07,
  'sfx/fa/bang-01.ogg': 0.89,
  'sfx/fa/bang-02.ogg': 0.89,
  'sfx/fa/bang-03.ogg': 0.89,
  'sfx/fa/bang-06.ogg': 0.89,
  'sfx/fa/bang-08.ogg': 0.91,
  'sfx/fa/bang-10.ogg': 0.91,
  'sfx/fa/cannon-01.ogg': 0.89,
  'sfx/fa/cannon-02.ogg': 0.89,
  'sfx/fa/cannon-03.ogg': 0.89,
  'sfx/fa/spell-01.ogg': 0.89,
  'sfx/fa/gem-01.ogg': 0.89,
  'sfx/fa/gem-03.ogg': 0.89,
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
    const level = LOUD[url] ?? 1;
    const next = playBuffer(buf, { loop, gain: 0.001, bus: 'music' });
    if (!next) return;
    const t = ac.currentTime;
    next.gain.gain.cancelScheduledValues(t);
    next.gain.gain.setValueAtTime(0.001, t);
    next.gain.gain.linearRampToValueAtTime(level, t + 1.3);
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
    if (mode === 'alert') return MUSIC.alert;
    if (mode === 'cutscene') return MUSIC.cutscene;
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
      mode = next === 'boss' || next === 'peace' || next === 'alert' || next === 'cutscene' ? next : 'none';
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
      const list = FILES[name];
      if (!list) return;
      const url = pick(list);
      const steady = name === 'siren' || name === 'levelup' || name === 'victory';
      const rate = steady ? 1 : 0.96 + Math.random() * 0.08;
      const jitter = steady ? 1 : Math.pow(10, (Math.random() * 3 - 1.5) / 20);
      const gain = (opts.gain || 0.85) * (LOUD[url] ?? 1) * jitter;
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
