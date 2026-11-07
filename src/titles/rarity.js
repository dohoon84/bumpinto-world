// [titles] 보유 비율. 서버가 ready 로 집계를 줄 때만 숫자를 만든다. 없는 값은 지어내지 않는다.
//   GET {accountBase}/econ/titles/rarity
//   { ok:true, data:{ ready:boolean, asOf:number|null, totalPlayers:number|null, counts:{ [titleId]: number } } }

export function rarityView(payload) {
  if (!payload || payload.ready !== true) return { ready: false, pct: {} };
  const total = Number(payload.totalPlayers);
  if (!Number.isFinite(total) || total <= 0) return { ready: false, pct: {} };
  const pct = {};
  for (const [id, raw] of Object.entries(payload.counts || {})) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    pct[id] = Math.min(100, (n / total) * 100);
  }
  return { ready: true, total, asOf: payload.asOf ?? null, pct };
}

export function formatRarityPct(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  const v = Math.max(0, Math.min(100, n));
  if (v === 0) return '0';
  if (v >= 10) return String(Math.round(v));
  return v.toFixed(1).replace(/\.0$/, '');
}

export async function fetchTitleRarity(base) {
  if (!base) return null;
  try {
    const res = await fetch(`${base}/econ/titles/rarity`, { credentials: 'include' });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) return null;
    return rarityView(body.data);
  } catch {
    return null;
  }
}
