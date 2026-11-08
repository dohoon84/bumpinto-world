// 할 일 창 오픈: 서버 지연이 있을 때 click→visible 이 얼마나 막히는지(구조 재현).
// before = PR #34 방식(캐시 없으면 await 후 show), after = 이번 수정(show 먼저).
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function beforeOpen(listMs) {
  const t0 = performance.now();
  let visibleAt = null;
  const cached = null;
  if (!cached) await delay(listMs); // await listQuests
  visibleAt = performance.now(); // show()
  return Math.round(visibleAt - t0);
}

async function afterOpen(listMs, { hasCache = false } = {}) {
  const t0 = performance.now();
  let visibleAt = null;
  const cached = hasCache ? { guest: true } : null;
  // show immediately with cache/skeleton
  visibleAt = performance.now();
  await delay(listMs); // background listQuests
  return Math.round(visibleAt - t0);
}

const samples = [50, 200, 800, 2000]; // 가정 서버 지연(ms) — 실제 프로덕션 게스트는 ~40–150ms, 로그인 autoSettle 은 더 길 수 있음
console.log('listMs\tbefore_visible\tafter_visible\tafter_with_cache');
for (const ms of samples) {
  const b = await beforeOpen(ms);
  const a = await afterOpen(ms);
  const c = await afterOpen(ms, { hasCache: true });
  console.log(`${ms}\t${b}\t${a}\t${c}`);
}
