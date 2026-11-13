// [route-map v1] ui-v2 역 선택 노선도 배치 검사 (DOM 없이 추정 글자 폭으로).
//   node scripts/test-route-map.mjs
//   - 데스크톱(672px)·모바일(358px) × 한/영: 이름표↔이름표·노선·다른 점·지시선 겹침 0, 지시선 교차 0, 지도 밖 0, 모바일 터치 44px 겹침 0
//   - 노선 정의가 역 데이터(lines)와 맞는지: 장지–복정은 8호선(분홍), 복정부터 수인분당(주황)
//   - 지시선 최대 길이(데스크톱 ≤ 25px, 모바일 ≤ 19px 근처 — 여유 6px)
import assert from 'node:assert/strict';

globalThis.location = { search: '', hostname: 'localhost' };
const G = await import('../src/corridor/globeCorridor.js');
const RM = await import('../src/ui-v2/routeMap.js');

const base = G.layoutCorridorMap({ height: 430, width: 320 });
const all = new Map([...base.items, ...base.branches].map((s) => [s.live ? 'jeongja' : s.id, s]));

// 글자 폭 추정: 한글 ≈ 1.0em, 그 밖 ≈ 0.56em (굵은 글꼴 기준으로 조금 넉넉히). 실제 화면은 verify 스크립트가 DOM 실측으로 다시 검사한다.
const tw = (s, fs) => [...String(s)].reduce((a, c) => a + (/[\u3131-\uD79D]/.test(c) ? fs : fs * 0.56), 0);
function sizer(mobile, en) {
  return (id) => {
    const s = all.get(id);
    const main = en ? s.en : s.ko, sub = s.pass ? (en ? 'pass' : '통과') : (en ? s.ko : s.en);
    // 폭은 선택(.on) 상태 기준, 높이는 기본 상태 (gate.js 실측과 같은 규칙)
    if (!mobile) {
      if (s.pass) return { w: Math.ceil(20 + tw(main, 12) + 6 + tw(sub, 11)), h: 26 };
      return { w: Math.ceil(24 + tw(main, 14) + 6 + tw(sub, 11)), h: 26 };
    }
    if (s.pass) return en ? { w: Math.ceil(14 + tw(RM.RM_PASS_SHORT_EN[id] || main, 10.5)), h: 22 } : { w: Math.ceil(14 + tw(main, 11.5) + 4 + tw(sub, 10)), h: 22 };
    return { w: Math.max(46, Math.ceil((en ? 16 : 20) + tw(main, en ? 13 : 14))), h: 32 };
  };
}

let fails = 0;
for (const mobile of [false, true]) {
  for (const en of [false, true]) {
    for (const k of mobile ? [1] : [0.9, 1, 1.15]) {
      const W = mobile ? 358 : 672;
      const m = RM.buildRouteMap(base, { mobile, W, k }, sizer(mobile, en));
      const rep = RM.auditRouteMap(m);
      const tag = `${mobile ? 'mobile' : 'desktop'}${en ? '/en' : '/ko'} k=${k}`;
      console.log(`${tag}: H=${m.H} issues=${rep.issues.length} maxLeader=${rep.maxLeader}`);
      if (rep.issues.length) { fails++; console.log('  ' + rep.issues.join('\n  ')); }
      if (process.env.RM_DEBUG) console.log('  ' + m.labels.filter((l) => l.leader).map((l) => `${l.id}:${Math.round(Math.hypot(l.leader[2] - l.leader[0], l.leader[3] - l.leader[1]))}`).join(' '));
      if (!process.env.RM_DEBUG) assert.ok(rep.maxLeader <= (en ? 40 : (mobile ? 22 : 25)), `${tag}: 지시선이 너무 김 ${rep.maxLeader}`);
      assert.equal(m.labels.length, 21, `${tag}: 이름표 21개(시작 19 + 통과 2)`);
      assert.equal(m.labels.filter((l) => !l.pass).length, G.CORRIDOR_STATION_COUNT, `${tag}: 시작 가능 역 수 = CORRIDOR_STATION_COUNT`);
    }
  }
}

// 노선 데이터 일관성: 각 노선의 역은 그 노선을 lines 에 갖고 있어야 한다
for (const l of RM.RM_LINES) {
  for (const id of l.ids) {
    const s = all.get(id);
    if (!s) continue;
    const lines = s.live ? ['수인분당선', '신분당선'] : s.lines;
    assert.ok(lines.includes(l.key), `${id} 의 lines(${lines}) 에 ${l.key} 가 없음`);
  }
}
const g = RM.routeGeometry(base, { W: 672 });
const colorOf = (a, b) => g.lines.find((l) => { const i = l.ids.indexOf(a), j = l.ids.indexOf(b); return i >= 0 && j >= 0 && Math.abs(i - j) === 1; })?.color;
assert.equal(colorOf('jangji', 'bokjeong'), '#e6186c', '장지–복정은 8호선 분홍');
assert.equal(colorOf('bokjeong', 'gachon'), '#f5a200', '복정–가천대는 수인분당 주황');
assert.equal(colorOf('jamsil', 'gangnam'), '#33a23d', '잠실–강남은 2호선 초록');
assert.deepEqual(g.stations.filter((s) => s.xf).map((s) => s.id).sort(), ['bokjeong', 'gangnam', 'jamsil', 'jeongja', 'migeum']);
assert.deepEqual(g.stations.filter((s) => s.pass).map((s) => s.id).sort(), ['yangjae', 'yangjaeforest']);
// 정자–미금은 두 줄 나란히
const sb = g.lines.find((l) => l.key === '신분당선'), su = g.lines.find((l) => l.key === '수인분당선');
assert.notEqual(sb.pts.at(-1)[0], su.pts.at(-1)[0]);
// 롯데 칩: 잠실 x 가운데, 남산 칩 + 12px 이상
assert.equal(RM.lotteChipX(300, 100, 672, 100), 250);
assert.equal(RM.lotteChipX(150, 100, 672, 120), 132);
assert.ok(RM.lotteChipX(650, 100, 672, 0) <= 672 - 8 - 100);

// 지선을 끈 주소(?pangyo=0 · ?gangnam=0 등)처럼 본선만 있어도 그려지고 겹치지 않는다
{
  const mainOnly = G.layoutCorridorMap({ height: 430, width: 320, branches: [] });
  for (const mobile of [false, true]) {
    const m = RM.buildRouteMap(mainOnly, { mobile, W: mobile ? 358 : 672, k: 1 }, sizer(mobile, false));
    const rep = RM.auditRouteMap(m);
    assert.equal(m.labels.length, mainOnly.items.length);
    assert.ok(!m.lines.some((l) => l.key === '2호선' || l.key === '신분당선'), '강남이 없으면 2호선·신분당선 구간도 없다');
    if (rep.issues.length) { fails++; console.log(`main-only ${mobile ? 'mobile' : 'desktop'}: ` + rep.issues.join(', ')); }
  }
}
assert.equal(fails, 0, `겹침 검사 실패 ${fails}건`);
console.log('route map OK');
