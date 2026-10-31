// [corridor] 동네 '생활 힌트': 상세 타일을 빌드할 때 원본 데이터에서 한 번만 뽑아 두는 가벼운 목록.
//   spots : 건물 중심점 [x, z, kind]  kind = 'shop'(상가·판매·보행자 거리) | 'apt'(아파트·주거) | 'office'
//   svc   : 서비스 도로(단지 안 주차 통로·이면도로) 폴리라인 { p, w } — 주차된 차량을 세울 곳 (차량 시뮬 그래프 밖)
//   foot  : 보행자 거리·광장 길 { p } — 상가 보행 NPC 경로
//   라이브(정자) 상자 안은 아무것도 넣지 않는다.
const SHOP = new Set(['commercial', 'retail', 'officetel', 'hotel']);
const APT = new Set(['apartments', 'residential', 'dormitory', 'yes;apartments', 'part:apartments']);
const OFFICE = new Set(['office', 'public', 'civic', 'government', 'hospital', 'university', 'school']);

export function extractLifeHints(t, live) {
  const inL = (x, z) => live && x >= live.x0 - 20 && x <= live.x1 + 20 && z >= live.z0 - 20 && z <= live.z1 + 20;
  const spots = [], svc = [], foot = [];
  for (const b of t?.b || []) {
    const kind = SHOP.has(b.k) ? 'shop' : APT.has(b.k) ? 'apt' : OFFICE.has(b.k) ? 'office' : null;
    if (!kind || !b.o?.length) continue;
    let x = 0, z = 0; for (const p of b.o) { x += p[0]; z += p[1]; } x /= b.o.length; z /= b.o.length;
    if (!inL(x, z)) spots.push([x, z, kind]);
  }
  for (const r of t?.r || []) {
    if (!r.p || r.p.length < 2 || r.br) continue;
    const m = r.p[Math.floor(r.p.length / 2)];
    if (inL(m[0], m[1])) continue;
    if (r.k === 'service') svc.push({ p: r.p, w: r.w || 4 });
    else if (r.k === 'pedestrian' || r.k === 'living_street') { foot.push({ p: r.p }); spots.push([m[0], m[1], 'shop']); }
    else if (r.k === 'footway') foot.push({ p: r.p });
  }
  return { spots, svc, foot };
}

// 시점 주변 r 안의 (빌드된) 타일 힌트를 모은다
export function gatherLifeHints(tiles, x, z, r) {
  const out = { spots: [], svc: [], foot: [] };
  for (const t of tiles) {
    const h = t.detail?.hints; if (!h) continue;
    for (const s of h.spots) if (Math.abs(s[0] - x) < r && Math.abs(s[1] - z) < r) out.spots.push(s);
    for (const k of ['svc', 'foot']) for (const w of h[k]) { const m = w.p[Math.floor(w.p.length / 2)]; if (Math.abs(m[0] - x) < r && Math.abs(m[1] - z) < r) out[k].push(w); }
  }
  return out;
}
