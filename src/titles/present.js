// [titles] 획득 연출은 이름 위 작은 메달에서만 난다. 머리 위에 큰 메달은 두지 않는다.
import { gradeOf } from './icons.js';

const EARN_MS = 4200;

export function createCeremony({ sound, onPaint } = {}) {
  let id = '';
  let until = 0;
  let timer = 0;
  let onDone = null;
  function finish() {
    id = '';
    until = 0;
    onPaint?.();
    const fn = onDone;
    onDone = fn;
    fn?.();
  }
  function play(title) {
    if (!title) return false;
    id = title.id;
    until = performance.now() + EARN_MS;
    sound?.playAcquire?.(gradeOf(title));
    onPaint?.();
    clearTimeout(timer);
    timer = setTimeout(finish, EARN_MS);
    return true;
  }
  return {
    play,
    setEquipped() {},
    tick() {},
    setView() {},
    refresh() { onPaint?.(); },
    celebrating: () => (performance.now() < until ? id : ''),
    get playing() { return performance.now() < until; },
    set onDone(fn) { onDone = fn; },
  };
}
