// node scripts/test-subway-routemap.mjs — [subway] 승강장 노선도 순수 로직
import assert from 'node:assert/strict';
import { STATIONS } from '../src/subway/roster.js';
import { LINE_STOPS } from '../src/subway/stationsData.js';
import { LINES } from '../src/subway/lines.js';
import {
  routeMapEnabled, routeMapData, routeMapSlots, nearRouteMap, panelWindow, PANEL_RADIUS,
} from '../src/subway/routeMap.js';

assert.equal(routeMapEnabled(new URLSearchParams('')), true, '기본 켜짐');
assert.equal(routeMapEnabled(new URLSearchParams('routemap=1')), true);
assert.equal(routeMapEnabled(new URLSearchParams('routemap=0')), false, 'opt-out');

let panels = 0;
for (const def of STATIONS) {
  for (const line of def.lines) {
    assert.ok(LINES[line], `${def.id} unknown line ${line}`);
    assert.ok(LINE_STOPS[line]?.stops?.includes(def.name), `${def.name} must be in LINE_STOPS.${line}`);
    const d = routeMapData(def, line);
    assert.ok(d, `${def.id}/${line} routeMapData`);
    assert.equal(d.me, def.name);
    assert.equal(d.meIdx, LINE_STOPS[line].stops.indexOf(def.name));
    assert.equal(d.stops.length, LINE_STOPS[line].stops.length, 'full line, no invented/truncated stops');
    assert.deepEqual(d.stops.map((s) => s.name), LINE_STOPS[line].stops);
    assert.ok(d.stops.every((s) => typeof s.name === 'string' && s.name.length > 0));
    assert.equal(d.stops.filter((s) => s.me).length, 1);
    assert.ok(d.stops[d.meIdx].me);
    // 갈아타는 곳 = 이 역의 다른 노선만 (지어내지 않음)
    assert.deepEqual(d.transfer.map((t) => t.key).sort(), def.lines.filter((k) => k !== line).sort());
    panels++;
  }
}
assert.ok(panels >= 14, `expected many station×line maps, got ${panels}`);

// 없는 역·노선
assert.equal(routeMapData({ name: '없는역', nameEn: 'X', id: 'x', lines: ['suin'] }, 'suin'), null);
assert.equal(routeMapData(STATIONS[0], 'nope'), null);

// 슬롯: 넓은 유리 칸만, 계단 앞 제외, 최대 4
const spans = [[-40, -37], [-20, -17], [-2, 2], [10, 13.5], [30, 34]];
const slots = routeMapSlots(spans, { avoidHalf: 3.2, max: 4 });
assert.ok(slots.every((s) => Math.abs(s.x) > 3.2));
assert.ok(slots.length <= 4);
assert.ok(!slots.some((s) => s.a === -2 && s.b === 2), 'stair span excluded');
assert.deepEqual(slots.map((s) => s.x), [...slots].map((s) => s.x).sort((a, b) => a - b), 'sorted by x');

assert.ok(nearRouteMap(10.2, -0.8, [{ x: 10, a: 9, b: 11, w: 2 }]));
assert.equal(nearRouteMap(10.2, -4.5, [{ x: 10, a: 9, b: 11, w: 2 }]), null, 'too far back');
assert.equal(nearRouteMap(40, -0.5, [{ x: 10, a: 9, b: 11, w: 2 }]), null);

// 패널 창: 현재 역 ±PANEL_RADIUS (전체 stops 는 그대로 두고 창만)
{
  const jeongja = STATIONS.find((s) => s.id === 'jeongja');
  const d = routeMapData(jeongja, 'suin');
  const w = panelWindow(d, PANEL_RADIUS);
  assert.ok(w.stops.length <= PANEL_RADIUS * 2 + 1);
  assert.ok(w.stops.some((s) => s.me && s.name === '정자'));
  assert.equal(w.stops[w.meLocal].name, '정자');
  assert.ok(w.moreLeft && w.moreRight, '정자는 수인분당 중간이라 양쪽에 더 있음');
  assert.ok(w.stops.every((s) => d.stops.some((q) => q.name === s.name)), '창 역은 전부 LINE_STOPS 안');
  // 종착 근처: 미금은 신분당에서 끝쪽에 가깝지 않음 — 모란(l8) 은 시종착
  const moran = STATIONS.find((s) => s.id === 'moran');
  const ml = routeMapData(moran, 'l8');
  const mw = panelWindow(ml, PANEL_RADIUS);
  assert.equal(mw.from, 0, '모란은 8호선 시종착 → 왼쪽 잘림 없음');
  assert.equal(mw.moreLeft, false);
}

// 로고/브랜드 문자열 금지 (데이터 필드)
for (const def of STATIONS) {
  const d = routeMapData(def, def.lines[0]);
  const blob = JSON.stringify(d);
  assert.equal(/서울교통공사|코레일|Korail|Seoul Metro|metro\.seoul|logo/i.test(blob), false);
}

console.log(`ok subway-routemap (${panels} station×line maps, ${STATIONS.length} stations)`);
