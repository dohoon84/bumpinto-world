// 실내 조명과 차량 램프가 같이 보는 저녁 여부.
// 시각 구분은 weather.js dayPart(새벽·저녁·밤). ?evening=0|1 이 있으면 그 값을 따른다.

let evening = false;
const watchers = new Set();

function forcedEvening() {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search).get('evening');
  if (q == null || q === '') return null;
  if (q === '0' || q === 'off' || q === 'day') return false;
  if (q === '1' || q === 'on' || q === 'night') return true;
  return null;
}

const forced = forcedEvening();

export function eveningFromPart(part) {
  return part === '새벽' || part === '저녁' || part === '밤';
}

export function isEvening() {
  return evening;
}

export function setEvening(next) {
  const on = forced == null ? !!next : forced;
  if (on === evening) return evening;
  evening = on;
  for (const fn of watchers) fn(on);
  return evening;
}

// [depot-perf] 월드를 다시 지을 때(폰: 범창고에서 나올 때) 옛 월드가 건 감시자를 풀 수 있게, 짓는 동안 건 감시자를 목록에 모은다.
let scope = null;
export function withEveningScope(list, fn) {
  const prev = scope; scope = list;
  try { return fn(); } finally { scope = prev; }
}
export function dropEveningWatchers(list) {
  for (const fn of list) watchers.delete(fn);
  list.length = 0;
}

export function watchEvening(fn) {
  watchers.add(fn);
  scope?.push(fn);
  fn(evening);
  return () => watchers.delete(fn);
}
