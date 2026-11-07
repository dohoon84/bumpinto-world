// 탈것 상점 오픈: 서버 지연이 있을 때 click→visible 이 얼마나 막히는지(구조 재현).
// before = 예전(await listShop+goal+balance 후 show), after = 이번 수정(show 먼저).
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function beforeOpen(shopMs) {
  const t0 = performance.now();
  await delay(shopMs); // await Promise.all([listShopItems, getShopGoal, getBalance]) — 예전엔 /econ/shop 두 번
  const visibleAt = performance.now();
  return Math.round(visibleAt - t0);
}

async function afterOpen(shopMs, { hasCache = false } = {}) {
  const t0 = performance.now();
  // show immediately with cache/skeleton
  const visibleAt = performance.now();
  await delay(shopMs); // background refresh
  return Math.round(visibleAt - t0);
}

const samples = [50, 200, 800, 2000];
console.log('shopMs\tbefore_visible\tafter_visible\tafter_with_cache');
for (const ms of samples) {
  const b = await beforeOpen(ms);
  const a = await afterOpen(ms);
  const c = await afterOpen(ms, { hasCache: true });
  console.log(`${ms}\t${b}\t${a}\t${c}`);
}
