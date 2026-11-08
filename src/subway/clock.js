// [subway-sync] 서버 시계 — 같은 열차를 탄 사람이 같은 순간 출발·도착하도록 지하철 시각은 모두 serverNow() 로.
//   프레즌스(WebSocket)로 { t:'time', c } 를 보내고 { c, s } 를 받아 NTP 처럼: offset = s − (c + r)/2, 왕복(r − c)이 짧은 샘플일수록 정확.
//   최근 샘플 중 왕복이 가장 짧은 것의 offset 을 쓴다. 샘플이 없으면(예전 서버·mock) offset 0 = 로컬 시계.
//   offset 이 바뀔 때 한 번에 튀지 않게 2초 이하 차이는 0.5초에 걸쳐 따라간다 (큰 차이는 바로 맞춤).
export function createServerClock({ max = 8, local = () => Date.now() } = {}) {
  const samples = []; // { c, s, r, rtt, off }
  let target = 0, cur = 0, curAt = 0, synced = false;
  function add({ c, s, r = local() }) {
    if (!Number.isFinite(c) || !Number.isFinite(s) || !Number.isFinite(r) || r < c || r - c > 10000) return false;
    samples.push({ rtt: r - c, off: s - (c + r) / 2 });
    while (samples.length > max) samples.shift();
    const best = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    const t = local(), now = synced ? offsetAt(t) : best.off;
    cur = Math.abs(best.off - now) > 2000 ? best.off : now; curAt = t; target = best.off; synced = true;
    return true;
  }
  function offsetAt(t) { // cur → target 로 0.5초에 걸쳐 (시계가 뒤로 크게 가지 않게)
    const k = Math.min(1, Math.max(0, (t - curAt) / 500));
    return cur + (target - cur) * k;
  }
  const serverNow = () => { const t = local(); return t + offsetAt(t); };
  return {
    add, serverNow,
    get offset() { return offsetAt(local()); },
    get synced() { return synced; },
    get rtt() { return samples.length ? Math.min(...samples.map((q) => q.rtt)) : null; },
    get samples() { return samples.length; },
  };
}
