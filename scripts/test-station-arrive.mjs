// node scripts/test-station-arrive.mjs — [arrivefix] #43 역 입장 위치 고르기(src/corridor/arrive.js) 테스트. 브라우저·네트워크 불필요.
import assert from 'node:assert/strict';
const { entrySpawn, arriveFixEnabled, pickFirstEnabled, withArriveCap, ARRIVE_MAX_MS } = await import('../src/corridor/arrive.js');

let n = 0;
const ok = (m) => console.log('  ok', ++n, m);
const DESTS = { pangyo: { id: 'pangyo', x: 264.7, z: -3100.4 }, migeum: { id: 'migeum', x: 58.9, z: 1845 }, jeongja: { id: 'jeongja', home: true } };
const placeOf = (id) => DESTS[id] || null;
const bounds = { x0: -5000, x1: 5000, z0: -20000, z1: 5000 };

// 1) 역을 고르면 정자 기본 위치가 아니라 그 역 출구 좌표, 숨김
let s = entrySpawn({ picked: true, at: 'pangyo', placeOf, bounds });
assert.deepEqual(s, { kind: 'station', x: 264.7, z: -3100.4, at: 'pangyo', hidden: true }); ok('station pick → destination exit, hidden');
s = entrySpawn({ picked: true, at: 'migeum', placeOf, sessionPlace: { x: 1, z: 2 } });
assert.equal(s.kind, 'station'); assert.equal(s.z, 1845); ok('picked station beats saved server place');
// 2) 정자(home)·모르는 역·placeOf 없음 → 예전 기본 위치
assert.equal(entrySpawn({ picked: true, at: 'jeongja', placeOf }).kind, 'default'); ok('jeongja home → default spawn');
assert.equal(entrySpawn({ picked: true, at: 'nowhere', placeOf }).kind, 'default'); ok('unknown station → default');
assert.equal(entrySpawn({ picked: true, at: 'pangyo', placeOf: null }).kind, 'default'); ok('no travel yet → default');
assert.equal(entrySpawn({ picked: true, at: null, placeOf }).kind, 'default'); ok('no station → default');
// 3) #42 직접 고른 역이 로컬 이어하기·서버 위치보다 우선 (정자를 거치지 않음)
s = entrySpawn({ resume: { x: 10, z: 20 }, picked: true, at: 'pangyo', placeOf, bounds, sessionPlace: { x: 1, z: 2 } });
assert.deepEqual(s, { kind: 'station', x: 264.7, z: -3100.4, at: 'pangyo', hidden: true }); ok('picked station beats resume and server place');
assert.equal(entrySpawn({ resume: { x: 10, z: 20 }, picked: false, at: 'migeum', placeOf, bounds, sessionPlace: { x: 1, z: 2 } }).kind, 'station'); ok('?at= without from still beats saved place');
assert.equal(entrySpawn({ resume: { x: 10, z: 20 }, picked: true, at: 'jeongja', placeOf, bounds }).kind, 'default'); ok('explicit jeongja ignores resume (home spawn, not the saved spot)');
assert.equal(entrySpawn({ resume: { x: 99999, z: 0 }, picked: true, at: 'pangyo', placeOf, bounds }).kind, 'station'); ok('resume out of bounds → station');
assert.equal(entrySpawn({ resume: { x: 10, z: 20 }, inWater: () => true, picked: true, at: 'pangyo', placeOf, bounds }).kind, 'station'); ok('resume in water → station');
assert.equal(entrySpawn({ resume: { x: NaN, z: 0 }, picked: true, at: 'pangyo', placeOf }).kind, 'station'); ok('bad resume → station');
// 4) 이어하기·계속하기, 또는 역을 고르지 않은 재입장만 저장 위치
s = entrySpawn({ resume: { x: 10, z: 20 }, picked: true, continued: true, at: 'pangyo', placeOf, bounds, sessionPlace: { x: 1, z: 2 } });
assert.deepEqual(s, { kind: 'resume', x: 10, z: 20, at: null, hidden: false }); ok('continue uses local resume even when last station is set');
s = entrySpawn({ picked: true, continued: true, at: 'pangyo', placeOf, sessionPlace: { x: 1, z: 2 } });
assert.deepEqual(s, { kind: 'session', at: null, hidden: false, stay: true }); ok('continue without local resume uses server place and stays');
assert.equal(entrySpawn({ picked: true, continued: true, at: 'migeum', placeOf }).kind, 'station'); ok('continue with no saved place → last station exit');
assert.equal(entrySpawn({ picked: false, sessionPlace: { x: 1, z: 2 } }).kind, 'session'); ok('no station picked → server place');
s = entrySpawn({ resume: { x: 10, z: 20 }, picked: false, bounds });
assert.equal(s.kind, 'resume'); ok('no station picked → local resume');
// 5) 끄면(?arrivefix=0 · ?pickfirst=0) 예전 그대로
assert.equal(entrySpawn({ picked: true, at: 'pangyo', placeOf, fix: false }).kind, 'default'); ok('fix off → old default spawn then teleport');
s = entrySpawn({ resume: { x: 10, z: 20 }, picked: true, at: 'pangyo', placeOf, bounds, pickFirst: false });
assert.deepEqual(s, { kind: 'resume', x: 10, z: 20, at: null, hidden: false }); ok('?pickfirst=0 → resume wins over picked station');
assert.equal(entrySpawn({ picked: false, sessionPlace: { x: 1, z: 2 }, at: 'pangyo', placeOf, pickFirst: false }).kind, 'session'); ok('?pickfirst=0 → server place wins when not explicitly picked');

// 6) 플래그: 기본 켜짐, ?arrivefix=0 끄고 탭에서 기억, ?arrivefix=1 다시 켬
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const st = mem();
assert.equal(arriveFixEnabled('', st), true); ok('flag default ON');
assert.equal(arriveFixEnabled('?arrivefix=0', st), false); ok('?arrivefix=0 → off');
assert.equal(arriveFixEnabled('', st), false); ok('off remembered in session');
assert.equal(arriveFixEnabled('?arrivefix=1', st), true); assert.equal(arriveFixEnabled('', st), true); ok('?arrivefix=1 → on again');
assert.equal(arriveFixEnabled('?arrivefix=off', null), false); ok('works without storage');

// 8) ?pickfirst=0 기본 켜짐, 탭에서 기억, ?pickfirst=1 다시 켬 (arrivefix 와 키가 다름)
const pst = mem();
assert.equal(pickFirstEnabled('', pst), true); ok('pickfirst default ON');
assert.equal(pickFirstEnabled('?pickfirst=0', pst), false); ok('?pickfirst=0 → off');
assert.equal(pickFirstEnabled('', pst), false); ok('pickfirst off remembered');
assert.equal(pickFirstEnabled('?pickfirst=1', pst), true); assert.equal(pickFirstEnabled('', pst), true); ok('?pickfirst=1 → on again');
assert.equal(pickFirstEnabled('?pickfirst=off', null), false); ok('pickfirst works without storage');
assert.equal(pickFirstEnabled('?arrivefix=0', mem()), true); ok('arrivefix flag does not turn pickfirst off');

// 7) 최대 8초 대기
assert.equal(ARRIVE_MAX_MS, 8000);
assert.equal(await withArriveCap(Promise.resolve(true), 50), 'arrived'); ok('cap: arrived');
assert.equal(await withArriveCap(new Promise(() => {}), 20), 'timeout'); ok('cap: timeout');
assert.equal(await withArriveCap(Promise.reject(new Error('x')), 50), 'error'); ok('cap: rejection still resolves');
assert.equal(await withArriveCap(undefined, 50), 'arrived'); ok('cap: nothing to wait');
console.log(`station-arrive: ${n} ok`);
