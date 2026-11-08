// node scripts/test-subway-chooser.mjs — 방면 고르기 노선 배지가 줄바꿈·넘침 없이 글자 수에 맞는지
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LINES } from '../src/subway/lines.js';
import { STATIONS } from '../src/subway/stationsData.js';
import { stationTheme } from '../src/subway/stations.js';
import { CHOOSER_BADGE_PX, chooserBadgeCss, chooserBadgeSpan, chooserBadgeSpec } from '../src/subway/chooserBadge.js';

const expectPx = (label, kind) => {
  const n = Array.from(label).length;
  const t = CHOOSER_BADGE_PX[kind];
  return n <= 2 ? t.short : n === 3 ? t.n3 : t.n4;
};

for (const L of Object.values(LINES)) {
  const spec = chooserBadgeSpec(L.short, 'line');
  assert.equal(spec.n, Array.from(L.short).length, L.key);
  assert.equal(spec.px, expectPx(L.short, 'line'), `${L.short} ${spec.px}`);
  assert.ok(spec.px <= 15, L.short);
  const html = chooserBadgeSpan(L.short, { kind: 'line', bg: L.color, color: '#fff' });
  assert.match(html, /data-k="line"/);
  assert.match(html, new RegExp(`data-n="${spec.bucket}"`));
  assert.ok(html.includes(`>${L.short}</span>`), html);
  assert.doesNotMatch(html, /font-size/, '크기는 CSS. 인라인 font-size:15px 가 38px 줄높이와 겹쳐 넘쳤다');
  assert.match(html, new RegExp(`background:${L.color}`));
}

assert.equal(chooserBadgeSpec('수인분당', 'line').px, 11);
assert.equal(chooserBadgeSpec('신분당', 'line').px, 13);
assert.equal(chooserBadgeSpec('경강', 'line').px, 15);
assert.equal(chooserBadgeSpec('2호선', 'line').px, 13);
assert.equal(chooserBadgeSpec('8호선', 'line').px, 13);
assert.equal(chooserBadgeSpec('9호선', 'line').px, 13);
assert.equal(chooserBadgeSpec('3호선', 'line').px, 13);
assert.deepEqual(Object.values(LINES).map((l) => [l.short, Array.from(l.short).length]), [
  ['수인분당', 4], ['신분당', 3], ['경강', 2], ['2호선', 3], ['3호선', 3], ['8호선', 3], ['9호선', 3],
]);

const refs = new Set();
for (const d of STATIONS) for (const e of d.exits) if (e.ref) refs.add(e.ref);
assert.ok(refs.has('1') && refs.has('10') && refs.has('2-1'), [...refs].sort().join(','));
for (const ref of refs) {
  const spec = chooserBadgeSpec(ref, 'exit');
  assert.equal(spec.px, expectPx(ref, 'exit'), ref);
  if (Array.from(ref).length <= 2) assert.equal(spec.px, 24, ref);
  const html = chooserBadgeSpan(ref, { kind: 'exit' });
  assert.match(html, /data-k="exit"/);
  assert.doesNotMatch(html, /style=/);
}
assert.equal(chooserBadgeSpec('2-1', 'exit').px, 16);
assert.equal(chooserBadgeSpec('10', 'exit').px, 24);
assert.equal(chooserBadgeSpec('·', 'exit').px, 24);

const css = chooserBadgeCss();
assert.match(css, /white-space:nowrap/);
assert.match(css, /overflow:hidden/);
assert.match(css, /min-width:38px/);
assert.match(css, /height:38px/);
assert.match(css, /width:max-content/);
assert.match(css, new RegExp(`font:900 ${CHOOSER_BADGE_PX.exit.short}px/38px`));
assert.match(css, new RegExp(`\\[data-k=line\\]\\{font-size:${CHOOSER_BADGE_PX.line.short}px\\}`));
assert.match(css, new RegExp(`\\[data-k=line\\]\\[data-n="3"\\]\\{font-size:${CHOOSER_BADGE_PX.line.n3}px\\}`));
assert.match(css, new RegExp(`\\[data-k=line\\]\\[data-n="4"\\]\\{font-size:${CHOOSER_BADGE_PX.line.n4}px\\}`));
assert.match(css, new RegExp(`\\[data-k=exit\\]\\[data-n="3"\\]\\{font-size:${CHOOSER_BADGE_PX.exit.n3}px\\}`));
assert.match(css, new RegExp(`\\[data-k=exit\\]\\[data-n="4"\\]\\{font-size:${CHOOSER_BADGE_PX.exit.n4}px\\}`));

const index = fs.readFileSync(new URL('../src/subway/index.js', import.meta.url), 'utf8');
assert.ok(index.includes('${chooserBadgeCss()}'), 'PC 스타일에 배지 규칙이 들어간다');
assert.equal(index.split('chooserBadgeSpan(').length - 1, 2, '출구 고르기·환승 방면 고르기 둘 다');
assert.doesNotMatch(index, /class="n"[^>]*font-size/, '배지 글자 크기는 인라인 font-size 가 아니라 CSS');
assert.match(index, /#subway-chooser\{[^}]*z-index:202/);
assert.match(index, /#subway-chooser\{[^}]*background:#1d2228/);
assert.match(index, /#subway-chooser\{[^}]*overflow:hidden/);
assert.match(index, /#subway-chooser li\{[^}]*overflow:hidden/);

const mobile = fs.readFileSync(new URL('../src/mobile/mobile.css', import.meta.url), 'utf8');
const mob = mobile.match(/body\.mobile #subway-chooser \.n \{[^}]+\}/);
assert.ok(mob, 'mobile.css 에 배지 규칙');
assert.match(mob[0], /white-space:\s*nowrap/);
assert.match(mob[0], /overflow:\s*hidden/);
assert.match(mob[0], /min-width:\s*38px/);
assert.match(mob[0], /width:\s*max-content/);
assert.match(mobile, /body\.mobile #subway-chooser \.n\[data-k=line\] \{ font-size: 15px; \}/);
assert.match(mobile, /body\.mobile #subway-chooser \.n\[data-k=line\]\[data-n="3"\] \{ font-size: 13px; \}/);
assert.match(mobile, /body\.mobile #subway-chooser \.n\[data-k=line\]\[data-n="4"\] \{ font-size: 11px; \}/);
assert.match(mobile, /body\.mobile #subway-chooser \.n\[data-k=exit\]\[data-n="3"\] \{ font-size: 16px; \}/);
assert.match(mobile, /body\.mobile #subway-chooser \.n\[data-k=exit\]\[data-n="4"\] \{ font-size: 13px; \}/);

const affected = [];
for (const d of STATIONS) {
  const t = stationTheme(d);
  if (!t.transfer) continue;
  const n = Array.from(t.transfer.short).length;
  affected.push(`${d.name}:${t.transfer.short}(${n})`);
  if (n >= 3) assert.ok(chooserBadgeSpec(t.transfer.short, 'line').px < 15, d.name);
}
for (const name of ['강남', '정자', '미금']) assert.ok(affected.some((s) => s.startsWith(name + ':신분당(3)')), name);
assert.ok(affected.some((s) => s.startsWith('잠실:2호선(3)')));
assert.ok(affected.some((s) => s.startsWith('석촌:9호선(3)')));
assert.ok(affected.some((s) => s.startsWith('가락시장:3호선(3)')));
assert.ok(affected.some((s) => s.startsWith('모란:8호선(3)')) && affected.some((s) => s.startsWith('복정:8호선(3)')));
const imae = stationTheme(STATIONS.find((d) => d.id === 'imae'));
assert.equal(imae.transfer.short, '경강');
assert.ok(imae.transfer.dirs.some((d) => d.ko.startsWith('판교')));
assert.equal(chooserBadgeSpec('경강', 'line').px, 15, '판교 방면(이매 경강)은 2자라 15px, 그래도 nowrap');
assert.equal(STATIONS.some((d) => d.id === 'pangyo'), false, '판교역 대합실은 없다. 판교 방면은 이매 경강');

const style = fs.readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const ov = style.match(/#overlay \{[^}]+\}/);
assert.ok(ov);
assert.doesNotMatch(ov[0], /z-index/, '지명 라벨은 #overlay(z-index 없음) 안. 고르기 창 202·불투명 #1d2228 보다 아래');

console.log('chooser badge ok', affected.join(' '));
