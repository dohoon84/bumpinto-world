// [arcade] ESC/나가기 때 stopBgm 이 이미 예약된 WebAudio 노드를 멈추고, 다시 켜도 BGM 이 겹치지 않는지
import { readFileSync } from 'node:fs';
import { createArcadeSfx } from '../src/arcade/sfx.js';

const assert = (c, m) => { if (!c) throw new Error(m); };

function mockAudioCtxClass() {
  const tally = { osc: 0, src: 0, stopped: 0 };
  const param = (v = 1) => {
    const p = {
      value: v,
      setValueAtTime(x) { p.value = x; return p; },
      exponentialRampToValueAtTime() { return p; },
      linearRampToValueAtTime() { return p; },
      setTargetAtTime(x) { p.value = x; return p; },
      cancelScheduledValues() { return p; },
    };
    return p;
  };
  class MockCtx {
    constructor() {
      this.currentTime = 1;
      this.sampleRate = 44100;
      this.state = 'running';
      this.destination = {};
      this.tally = tally;
    }
    resume() { return Promise.resolve(); }
    createGain() { return { gain: param(1), connect() { return this; } }; }
    createDynamicsCompressor() {
      return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() { return this; } };
    }
    createDelay() { return { delayTime: param(0), connect() { return this; } }; }
    createOscillator() {
      return {
        type: 'sine', detune: param(0), frequency: param(440),
        connect() { return this; },
        start() { tally.osc += 1; },
        stop() { tally.stopped += 1; },
      };
    }
    createBiquadFilter() { return { type: 'lowpass', frequency: param(1000), Q: param(1), connect() { return this; } }; }
    createBuffer(_c, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() {
      return { buffer: null, connect() { return this; }, start() { tally.src += 1; }, stop() { tally.stopped += 1; } };
    }
  }
  MockCtx.tally = tally;
  return MockCtx;
}

const Ctx = mockAudioCtxClass();
const sfx = createArcadeSfx({
  AudioCtx: Ctx,
  getLevel: () => ({ muted: false, volume: 1 }),
  sfxOff: false,
});

sfx.startStoreBgm();
assert(sfx.bgmPlaying === true, 'store BGM starts');
assert(Ctx.tally.osc > 0, `scheduled melody/bass/kick, got ${Ctx.tally.osc}`);
const afterStart = Ctx.tally.osc;

sfx.stopBgm();
assert(sfx.bgmPlaying === false, 'stopBgm clears playing flag (ESC/나가기)');
await new Promise((r) => setTimeout(r, 80));
assert(sfx.bgmPlaying === false, 'leftover loop does not turn BGM back on');
assert(Ctx.tally.osc === afterStart, `stopped generation must not schedule more notes (${afterStart} -> ${Ctx.tally.osc})`);

sfx.startStoreBgm();
assert(sfx.bgmPlaying === true, 're-enter starts BGM again');
const afterRestart = Ctx.tally.osc;
assert(afterRestart > afterStart, 'second start schedules a new loop');
sfx.stopBgm();
await new Promise((r) => setTimeout(r, 80));
assert(sfx.bgmPlaying === false, 'second stop holds');
assert(Ctx.tally.osc === afterRestart, 'no overlapping leftover loop after restart');

// ESC = exit via endSession → dispose → stopBgm (not KeyP-only pause)
const idx = readFileSync(new URL('../src/arcade/index.js', import.meta.url), 'utf8');
assert(/if \(e\.code === 'Escape'\) \{ endSession\(\);/.test(idx), 'ESC exits session');
assert(/function endSession[\s\S]*sfx\.stopBgm\(\)/.test(idx), 'endSession stops BGM');
const merge = readFileSync(new URL('../src/arcade/bumstore/game.js', import.meta.url), 'utf8');
assert(/e\.code === 'Escape'/.test(merge), 'merge captures Escape');
assert(/function dispose[\s\S]*playing = false[\s\S]*stopBgm/.test(merge), 'dispose pauses play and stops BGM');

console.log('ok arcade-sfx', { notes: afterStart, restart: afterRestart });
