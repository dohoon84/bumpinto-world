// [controls-card] ?controlscard= 플래그와 닫기 기억.
import { controlsCardWanted, readDismissed, writeDismissed, SESSION_KEY, DISMISS_KEY } from '../src/controlsCard/flag.js';

let failed = 0;
const eq = (a, b, msg) => {
  if (a !== b) { failed += 1; console.error('FAIL', msg, 'got', a, 'want', b); }
};
function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

eq(controlsCardWanted('', mem()), true, 'default on');
{
  const s = mem();
  eq(controlsCardWanted('?controlscard=0', s), false, '0 off');
  eq(s.getItem(SESSION_KEY), '1', '0 remembered');
}
for (const v of ['off', 'old', 'legacy', 'v1', 'OFF']) {
  const s = mem();
  eq(controlsCardWanted(`?controlscard=${v}`, s), false, `${v} off`);
}
{
  const s = mem({ [SESSION_KEY]: '1' });
  eq(controlsCardWanted('', s), false, 'session keeps off');
  eq(controlsCardWanted('?controlscard=1', s), true, '1 clears');
  eq(s.getItem(SESSION_KEY), null, '1 removed key');
}
eq(controlsCardWanted('?controlscard=on', mem()), true, 'on');
eq(controlsCardWanted('?controlscard=v2', mem()), true, 'v2');
{
  const s = mem();
  eq(controlsCardWanted('?controlscard=nope', s), false, 'unknown off');
  eq(s.getItem(SESSION_KEY), '1', 'unknown remembered');
}
{
  const s = mem();
  eq(readDismissed(s), false, 'not dismissed');
  writeDismissed(s);
  eq(s.getItem(DISMISS_KEY), '1', 'dismiss writes');
  eq(readDismissed(s), true, 'dismissed');
}
eq(controlsCardWanted(), true, 'no storage defaults on');

if (failed) { console.error(failed, 'failed'); process.exit(1); }
console.log('controls-card flag ok');
