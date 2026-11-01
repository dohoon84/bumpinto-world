// jeongja.json buildings 인덱스 + 중심점(cx, cz)으로 건물을 가리키는 작은 데이터 파일(public/jeongja-shops.json,
// public/jeongja-colours.json) 공통 로더. jeongja.json 을 다시 만들어 인덱스가 밀리면 중심점이 어긋난 줄은 버린다.
export const MAX_CENTROID_DRIFT = 2.5; // m (빌드 스크립트는 중심점을 0.1~1 m 로 반올림해 저장)

export function ringCentroid(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return [x / ring.length, z / ring.length];
}

/**
 * json = { meta: { fields: ['idx', ..., 'cx', 'cz', ...] }, b: [[...], ...] }
 * @returns {{ rows: { idx:number, b:object, row:any[] }[], dropped:number } | null} 파일이 없거나 비면 null
 */
export function matchKeyedRows(buildings, json) {
  if (!json?.b?.length || !buildings?.length) return null;
  const f = json.meta?.fields || [];
  const ii = Math.max(0, f.indexOf('idx')), ix = f.indexOf('cx'), iz = f.indexOf('cz');
  if (ix < 0 || iz < 0) return null;
  const rows = [];
  let dropped = 0;
  for (const row of json.b) {
    const idx = row[ii], b = buildings[idx];
    if (!b?.o?.length) { dropped++; continue; }
    const [bx, bz] = ringCentroid(b.o);
    if (Math.hypot(bx - row[ix], bz - row[iz]) > MAX_CENTROID_DRIFT) { dropped++; continue; }
    rows.push({ idx, b, row });
  }
  return { rows, dropped };
}
