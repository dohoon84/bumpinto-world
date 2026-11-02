// node scripts/test-bgm.mjs — [bgm] 재생 목록·타이밍·등전력 곡선·막대 묶음(순수 함수)과 public/audio/bgm 파일 확인
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { TRACKS, OPENING_ID, FADE, BAR_COUNT, titleOf, playOrder, nextIndex, timingFor, equalPowerCurve, volumeToGain, barBins } from '../src/bgm/playlist.js';

// 곡 파일: 두 형식 모두 있고 너무 크지 않게 (지연 로딩이지만 한 곡 4 MB 이하)
for (const t of TRACKS) for (const ext of ['webm', 'mp3']) {
  const f = `public/audio/bgm/${t.id}.${ext}`;
  assert.ok(fs.existsSync(f), `${f} 없음`);
  assert.ok(fs.statSync(f).size < 4 * 1024 * 1024, `${f} 너무 큼`);
}
// 순서: opening_day 먼저, 나머지는 파일 이름 순, 끝나면 처음으로
const order = playOrder().map((t) => t.id);
assert.equal(order[0], OPENING_ID);
assert.deepEqual(order.slice(1), TRACKS.map((t) => t.id).filter((id) => id !== OPENING_ID).sort());
assert.equal(new Set(order).size, TRACKS.length);
assert.equal(nextIndex(order.length - 1, order.length), 0);
for (let i = 0; i < order.length; i++) assert.notEqual(order[i], order[nextIndex(i, order.length)], '같은 곡 연속 재생');
// 제목
assert.equal(titleOf('opening_day'), 'Opening Day');
assert.equal(titleOf('riverside_lunch'), 'Riverside Lunch');
assert.equal(titleOf('Sunny_Afternoon'), 'Sunny Afternoon');
// 타이밍: 180초 곡 → 175초에 크로스페이드 시작(4초 + 끝 무음 1초), 155초에 다음 곡 내려받기
const tm = timingFor(180);
assert.equal(tm.xf, FADE.xfade); assert.equal(tm.xfadeAt, 180 - FADE.tail - FADE.xfade); assert.equal(tm.preloadAt, tm.xfadeAt - FADE.preload);
assert.ok(timingFor(6).xf < FADE.xfade, '짧은 곡은 크로스페이드도 짧게');
assert.equal(timingFor(NaN), null); assert.equal(timingFor(Infinity), null);
assert.ok(timingFor(30, { skip: 25 }).preloadAt >= 25);
// 등전력: in² + out² = 1 (합친 소리 크기 일정), 양 끝 값, 단조
const a = equalPowerCurve('in'), b = equalPowerCurve('out');
assert.equal(a[0], 0); assert.ok(Math.abs(a.at(-1) - 1) < 1e-6); assert.equal(b[0], 1); assert.ok(Math.abs(b.at(-1)) < 1e-6);
for (let i = 0; i < a.length; i++) {
  assert.ok(Math.abs(a[i] * a[i] + b[i] * b[i] - 1) < 1e-5, 'equal power');
  if (i) { assert.ok(a[i] >= a[i - 1]); assert.ok(b[i] <= b[i - 1]); }
}
const part = equalPowerCurve('in', 16, 0.4, 1); assert.ok(Math.abs(part[0] - 0.4) < 1e-6 && Math.abs(part.at(-1) - 1) < 1e-6);
const down = equalPowerCurve('out', 16, 0.6, 0); assert.ok(Math.abs(down[0] - 0.6) < 1e-6 && Math.abs(down.at(-1)) < 1e-6);
// 볼륨 곡선
assert.equal(volumeToGain(0), 0); assert.equal(volumeToGain(1), 1); assert.equal(volumeToGain(0.5), 0.25); assert.equal(volumeToGain(2), 1); assert.equal(volumeToGain('x'), 0);
// 막대 묶음: 24개, 빈 범위 겹치지 않고 비어 있지 않음
const bins = barBins(128);
assert.equal(bins.length, BAR_COUNT);
for (let i = 0; i < bins.length; i++) {
  const [s, e] = bins[i]; assert.ok(e > s && s >= 1 && e <= 128, `bar ${i}`);
  if (i) assert.ok(s >= bins[i - 1][1] - 1);
}
console.log('test-bgm: ok', order.join(' → '), `bins ${bins.map(([s, e]) => e - s).join(',')}`);
