// [gentle-monster] 조각 메시를 백그라운드에서 만든다 (메인 스레드 멈춤 방지)
import { sculptArrays } from './sculpt.js';
self.onmessage = (e) => {
  const { names, stepMul } = e.data;
  for (const n of names) { const a = sculptArrays(n, stepMul); self.postMessage(a, [a.pos.buffer, a.nor.buffer, a.col.buffer, a.idx.buffer]); }
  self.postMessage({ done: true });
};
