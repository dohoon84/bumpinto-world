// [route-map v1] ui-v2 역 선택 모달의 분당–잠실 노선도 배치 (시안: bw-route-map/v1/spec.md).
//   - 점 좌표는 layoutCorridorMap(실제 OSM 좌표)를 그대로 쓰고, 이름표는 자기 점 옆(RA 오른쪽 / I 두 노선 사이 / L 서쪽 바깥)에 붙인다.
//   - 같은 쪽 이름표끼리는 y 만 이완(최소 간격)하고, 노선·다른 점에 닿으면 바깥쪽으로 2px씩 민다 → 지시선이 짧고 노선을 가로지르지 않는다.
//   - 모바일(좁은 화면)은 x 0.46배 + 구간별 y 배율(촘촘한 잠실–복정은 늘리고 성긴 구간은 줄임, 순서·방향 유지).
//   - DOM 없이 돌아가는 순수 함수만 있다(gate.js 가 실측 크기를 넘긴다). auditRouteMap 은 테스트·검증 스크립트용 겹침 검사.

export const RM_COLOR = { sb: '#d31145', su: '#f5a200', l8: '#e6186c', l2: '#33a23d', cyan: '#4cc9f0', gold: '#ffe169', amber: '#f5a200', ink: '#122033' };

// 노선(그리는 순서대로). 정자–미금은 신분당·수인분당 공용 → shared 로 두 줄 나란히. 8호선 분홍은 복정까지, 복정부터 수인분당 주황.
export const RM_LINES = [
  { key: '2호선', en: 'Line 2', color: RM_COLOR.l2, ids: ['jamsil', 'gangnam'] },
  { key: '8호선', en: 'Line 8', color: RM_COLOR.l8, ids: ['jamsil', 'seokchon', 'songpa', 'garak', 'munjeong', 'jangji', 'bokjeong'] },
  { key: '수인분당선', en: 'Suin-Bundang', color: RM_COLOR.su, ids: ['bokjeong', 'gachon', 'taepyeong', 'moran', 'yatap', 'imae', 'seohyeon', 'sunae', 'jeongja', 'migeum'], shared: 0 },
  { key: '신분당선', en: 'Shinbundang', color: RM_COLOR.sb, ids: ['gangnam', 'yangjae', 'yangjaeforest', 'cheonggyesan', 'pangyo', 'jeongja', 'migeum'], shared: 1 },
];
// 범례 순서 (랜드마크는 띠에 있으니 범례에서 뺀다)
export const RM_LEGEND = ['신분당선', '수인분당선', '8호선', '2호선'];
const SHARED_IDS = new Set(['jeongja', 'migeum']);
// 모바일 영문 모드의 통과역 이름표는 좁은 폭에 맞춰 줄인다(풀네임은 title 로)
export const RM_PASS_SHORT_EN = { yangjaeforest: 'Yangjae Forest' };

// 이름표가 붙는 쪽. 목록에 없는 새 역은 점 오른쪽(RA).
export const RM_SIDE = {
  jamsil: 'RA', seokchon: 'RA', garak: 'RA', jangji: 'RA', gachon: 'RA', moran: 'RA', yatap: 'RA', imae: 'RA', seohyeon: 'RA', sunae: 'RA',
  songpa: 'I', munjeong: 'I', bokjeong: 'I', taepyeong: 'I',
  gangnam: 'L', yangjae: 'L', yangjaeforest: 'L', cheonggyesan: 'L', pangyo: 'L', jeongja: 'L', migeum: 'L',
};

// layoutCorridorMap({height:430}) 좌표 → 시안 좌표(1.5배). 시안의 데스크톱 배율 1.0 = 이 값.
const MOCK = 1.5;
// 모바일 구간별 y 배율: [시안 y(잠실=0), 배율] — 잠실–복정 1.12 · 가천대–모란 0.56 · 야탑–수내 0.84 · 정자–미금 0.5
const MOBILE_YBREAKS = [[0, 1.12], [158, 0.56], [358, 0.84], [518, 0.5]];

export const RM_MODE = {
  desktop: { pitch: 30, adjGap: 12, dotR: 6, lw: 6, diaUp: 16, oy: 26, padB: 26, kx: 1, nudge: { pangyo: 12 }, bandH: 56, chipH: 32, minHit: 0 },
  mobile: { pitch: 44, adjGap: 9, dotR: 5, lw: 5, diaUp: 14, oy: 20, padB: 7, kx: 0.46, nudge: { pangyo: 10 }, bandH: 52, chipH: 36, minHit: 44 },
};

const sidOf = (s) => (s.live ? 'jeongja' : s.id);

function yMapper(mobile, k) {
  if (!mobile) return (my) => my * k;
  return (my) => {
    let acc = 0;
    for (let i = 0; i < MOBILE_YBREAKS.length; i++) {
      const [y0, s] = MOBILE_YBREAKS[i];
      const y1 = i + 1 < MOBILE_YBREAKS.length ? MOBILE_YBREAKS[i + 1][0] : Infinity;
      if (my <= y1) return acc + (my - y0) * s;
      acc += (y1 - y0) * s;
    }
    return acc;
  };
}

/** 노선 정의에서 실제로 그릴 역만 남긴 선 목록 */
function activeLines(has) {
  return RM_LINES.map((l) => ({ ...l, ids: l.ids.filter((id) => has.has(id)) })).filter((l) => l.ids.length >= 2);
}

/**
 * 점·선 좌표 (이름표 제외). base = layoutCorridorMap({ height: 430, width: 320 })
 * @param {{ mobile?: boolean, W: number, k?: number, shiftX?: number }} o  k = 데스크톱 배율(pickK, 0.9–1.15)
 */
export function routeGeometry(base, { mobile = false, W, k = 1, kx: kxIn, shiftX = 0, sides = null } = {}) {
  const M = mobile ? RM_MODE.mobile : RM_MODE.desktop;
  const src = [...base.items, ...base.branches];
  const yTop = Math.min(...src.map((s) => s.dy)), yBot = Math.max(...src.map((s) => s.dy));
  const xs = src.map((s) => s.dx * MOCK);
  const kx = mobile ? (kxIn ?? M.kx) : k;
  const fy = yMapper(mobile, k);
  const ox = W / 2 - ((Math.min(...xs) + Math.max(...xs)) / 2) * kx + shiftX;
  const pos = new Map();
  for (const s of src) pos.set(sidOf(s), [ox + s.dx * MOCK * kx, M.oy + fy((s.dy - yTop) * MOCK)]);
  const H = Math.round(M.oy + fy((yBot - yTop) * MOCK) + M.padB);
  const has = new Set(pos.keys());
  const lines = activeLines(has).map((l) => ({
    ...l,
    pts: l.ids.map((id) => {
      const [x, y] = pos.get(id);
      if (l.shared === undefined || !SHARED_IDS.has(id)) return [x, y];
      return [x + (l.shared ? -M.lw * 0.55 : M.lw * 0.55), y];
    }),
  }));
  const lineCount = new Map();
  for (const l of lines) for (const id of l.ids) lineCount.set(id, (lineCount.get(id) || 0) + 1);
  const stations = src.map((s) => {
    const id = sidOf(s);
    return { id, ko: s.ko, en: s.en, pass: !!s.pass, xf: (lineCount.get(id) || 0) >= 2, side: sides?.[id] || RM_SIDE[id] || 'RA', lines: s.live ? ['수인분당선', '신분당선'] : (s.lines || []) };
  });
  const segs = [];
  for (const l of lines) for (let i = 1; i < l.pts.length; i++) segs.push([...l.pts[i - 1], ...l.pts[i], M.lw / 2, 'line:' + l.key]);
  const jam = pos.get('jamsil');
  const diamond = jam ? [jam[0], jam[1] - M.diaUp] : null;
  return { mobile, W, H, k, kx, M, pos, lines, stations, segs, diamond };
}

// 사각형(라벨) 둘레 pad 안으로 선분이 들어오는지 — 샘플링
function segHitsBox(seg, box, pad) {
  const [x1, y1, x2, y2, hw] = seg;
  const n = Math.max(8, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 1.5));
  for (let i = 0; i <= n; i++) {
    const px = x1 + (x2 - x1) * i / n, py = y1 + (y2 - y1) * i / n;
    if (px > box.l - hw - pad && px < box.r + hw + pad && py > box.t - hw - pad && py < box.b + hw + pad) return true;
  }
  return false;
}

/**
 * 이름표 배치. size(id) → { w, h } (선택 상태까지 포함한 최대 크기)
 * @returns {Array<{ id, sd, nx, ny, w, h, x, y, pass, leader: number[] | null }>}
 */
export function placeLabels(g, size) {
  const { M, H } = g;
  const avoid = g.segs.slice();
  for (const [id, [x, y]] of g.pos) avoid.push([x, y, x, y, M.dotR + 4, 'dot:' + id]);
  if (g.diamond) avoid.push([g.diamond[0], g.diamond[1], g.diamond[0], g.diamond[1], 9, 'lotte']);
  const minY = {};
  // 송파 이름표 하한을 2호선(잠실–강남) 아래로 — 모바일 폭·데스크톱 작은 배율(k<1)에서 두 노선 사이가 좁다
  if (g.pos.has('gangnam') && g.pos.has('songpa')) minY.songpa = g.pos.get('gangnam')[1] + 11;
  const labels = g.stations.map((s) => {
    const [nx, ny] = g.pos.get(s.id);
    const { w, h } = size(s.id);
    return { id: s.id, sd: s.side, nx, ny, w, h, pass: s.pass, y: ny + (M.nudge[s.id] || 0), x: 0, leader: null };
  });
  const groups = {};
  for (const l of labels) (groups[l.sd] ||= []).push(l);
  const need = (a, b) => ((a.pass || b.pass) ? (a.h + b.h) / 2 + 6 : Math.max(M.pitch, (a.h + b.h) / 2 + 2));
  for (const sd in groups) {
    const gr = groups[sd].sort((a, b) => a.y - b.y);
    for (let it = 0; it < 60; it++) {
      for (let i = 1; i < gr.length; i++) {
        const q = need(gr[i - 1], gr[i]), gap = gr[i].y - gr[i - 1].y;
        if (gap < q) { const d = (q - gap) / 2; gr[i].y += d; gr[i - 1].y -= d; }
      }
      for (const l of gr) {
        if (minY[l.id] !== undefined) l.y = Math.max(l.y, minY[l.id]);
        l.y = Math.max(l.h / 2 + 2, Math.min(H - l.h / 2 - 2, l.y));
      }
    }
  }
  const pushFor = (l, y) => {
    const right = l.sd === 'RA' || l.sd === 'R';
    let x = right ? l.nx + M.adjGap : l.nx - M.adjGap - l.w;
    const hits = (x0) => {
      const box = { l: x0, r: x0 + l.w, t: y - l.h / 2, b: y + l.h / 2 };
      return avoid.some((s) => s[5] !== 'dot:' + l.id && segHitsBox(s, box, 4));
    };
    let n = 0;
    while (hits(x) && n++ < 60) x += right ? 2 : -2;
    return { x, n };
  };
  for (const sd in groups) {
    const gr = groups[sd];
    for (let i = 0; i < gr.length; i++) {
      const l = gr[i], prev = gr[i - 1], next = gr[i + 1];
      // 노선에 닿아 옆으로 많이 밀리면, 이웃 간격을 지키는 범위에서 y 를 조금(±12px) 옮겨 지시선이 가장 짧은 자리를 고른다
      let best = null;
      for (const dy of [0, 3, -3, 6, -6, 9, -9, 12, -12]) {
        const y = l.y + dy;
        if (prev && y - prev.y < need(prev, l)) continue;
        if (next && next.y - y < need(l, next)) continue;
        if (minY[l.id] !== undefined && y < minY[l.id]) continue;
        if (y < l.h / 2 + 2 || y > H - l.h / 2 - 2) continue;
        const { x, n } = pushFor(l, y);
        const right = l.sd === 'RA' || l.sd === 'R';
        const len = Math.hypot((right ? x : x + l.w) - l.nx, y - l.ny);
        if (!best || len < best.len - 0.5) best = { x, n, y, len };
        if (n === 0 && dy === 0) break;
      }
      if (!best) { const { x, n } = pushFor(l, l.y); best = { x, n, y: l.y }; }
      l.x = best.x; l.y = best.y; l.push = best.n * 2;
    }
  }
  for (const l of labels) {
    const right = l.sd === 'RA' || l.sd === 'R';
    const ex = right ? l.x : l.x + l.w;
    const dist = Math.hypot(ex - l.nx, l.y - l.ny);
    if (dist > M.dotR + 3) {
      const r = M.dotR + 1, ang = Math.atan2(l.y - l.ny, ex - l.nx);
      l.leader = [l.nx + Math.cos(ang) * r, l.ny + Math.sin(ang) * r, ex, l.y];
    }
  }
  return labels;
}

/** 점·이름표 전체 묶음의 좌우 범위 */
function extentX(g, labels) {
  let lo = Infinity, hi = -Infinity;
  for (const l of labels) { lo = Math.min(lo, l.x); hi = Math.max(hi, l.x + l.w); }
  for (const [x] of g.pos.values()) { lo = Math.min(lo, x - 12); hi = Math.max(hi, x + 12); }
  return { lo, hi };
}

function placeAll(base, opts, size) {
  let g = routeGeometry(base, opts);
  let labels = placeLabels(g, size);
  // 두 노선 사이(I)에 들어가기엔 넓은 이름표(영문 모드 등)는 바깥쪽 밀기가 다른 노선까지 넘어간다 → 점 오른쪽(RA)으로 돌린다
  const sides = { ...(opts.sides || {}) };
  for (let round = 0; round < 3; round++) {
    const wide = labels.filter((l) => l.sd === 'I' && l.push > g.M.adjGap * 2);
    if (!wide.length) break;
    for (const l of wide) sides[l.id] = 'RA';
    opts = { ...opts, sides };
    g = routeGeometry(base, opts);
    labels = placeLabels(g, size);
  }
  return { g, labels, opts };
}

/**
 * 점·선 + 이름표까지 한 번에. 묶음이 지도 가운데 오도록 평행이동하고(결과 모양은 같다),
 * 좌우 여백 8px 안에 안 들어가면(영문 모드·큰 배율) 가로 배율을 조금씩 줄인다(데스크톱 k ≥ 0.9, 모바일 kx ≥ 0.36).
 */
export function buildRouteMap(base, opts, size) {
  const mobile = !!opts.mobile;
  let o = { ...opts };
  let r = placeAll(base, o, size);
  for (let i = 0; i < 12; i++) {
    const { lo, hi } = extentX(r.g, r.labels);
    if (hi - lo <= r.g.W - 16) break;
    const next = mobile ? (r.g.kx - 0.02) : (r.g.k - 0.03);
    if (next < (mobile ? 0.36 : 0.9)) break;
    o = mobile ? { ...o, kx: next } : { ...o, k: next };
    r = placeAll(base, o, size);
  }
  const { lo, hi } = extentX(r.g, r.labels);
  const dx = (hi - lo <= r.g.W - 16) ? (r.g.W - (hi - lo)) / 2 - lo : 8 - lo;
  if (Math.abs(dx) > 0.5) r = placeAll(base, { ...r.opts, shiftX: (r.opts.shiftX || 0) + dx }, size);
  return { ...r.g, labels: r.labels };
}

/**
 * 롯데월드타워 칩 x: 잠실 점 x 가운데, 남산 칩 오른쪽 끝 + 12px 보다 왼쪽으로 가지 않고, 잠실 x 를 덮도록(칩 left ≤ jx-16), 지도 오른쪽 8px 안.
 */
export function lotteChipX(jx, chipW, W, namsanRight = -Infinity) {
  let x = jx - chipW / 2;
  x = Math.min(x, jx - 16, W - 8 - chipW);
  x = Math.max(x, namsanRight + 12, 8);
  return x;
}

const cross = (a, b) => {
  const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const p1 = [a[0], a[1]], p2 = [a[2], a[3]], p3 = [b[0], b[1]], p4 = [b[2], b[3]];
  return d(p1, p2, p3) * d(p1, p2, p4) < 0 && d(p3, p4, p1) * d(p3, p4, p2) < 0;
};

/**
 * 겹침 검사 (시안 check-report.json 과 같은 항목).
 * @param m buildRouteMap 결과
 * @param {{ boxes?: Map<string,{l,r,t,b}>, extra?: Array<{n,l,r,t,b,hit?}> }} o  boxes = 실측 라벨 박스(지도 좌표). 없으면 계산값.
 */
export function auditRouteMap(m, { boxes, extra = [] } = {}) {
  const out = [];
  const box = (l) => boxes?.get(l.id) || { l: l.x, r: l.x + l.w, t: l.y - l.h / 2, b: l.y + l.h / 2 };
  const L = m.labels.map((l) => ({ l, b: box(l) }));
  const inter = (a, b, pad = 0) => a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad;
  const all = [...L.map(({ l, b }) => ({ n: 'stn-' + l.id, ...b, hit: !l.pass })), ...extra];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (inter(all[i], all[j], 1)) out.push(`BOX ${all[i].n} × ${all[j].n}`);
  if (m.M.minHit) {
    const hits = all.filter((a) => a.hit).map((a) => { const cy = (a.t + a.b) / 2, h = Math.max(m.M.minHit, a.b - a.t); return { n: a.n, l: a.l, r: a.r, t: cy - h / 2, b: cy + h / 2 }; });
    for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) if (inter(hits[i], hits[j], -0.5)) out.push(`HIT ${hits[i].n} × ${hits[j].n}`);
  }
  const leaders = m.labels.filter((l) => l.leader);
  const segs = [...m.segs, ...leaders.map((l) => [...l.leader, 0.75, 'leader:' + l.id])];
  if (m.diamond) segs.push([m.diamond[0], 0, m.diamond[0], m.diamond[1] - 8, 0.75, 'sight']);
  for (const { l, b } of L) {
    for (const s of segs) if (s[5] !== 'leader:' + l.id && segHitsBox(s, b, 2)) out.push(`SEG ${l.id} × ${s[5]}`);
    for (const [id, [x, y]] of m.pos) if (x > b.l - 8 && x < b.r + 8 && y > b.t - 8 && y < b.b + 8) out.push(`DOT ${l.id} × ${id}`);
    if (b.l < 2 || b.r > m.W - 2 || b.t < 0 || b.b > m.H) out.push(`OUT ${l.id}`);
  }
  for (let i = 0; i < leaders.length; i++) {
    for (let j = i + 1; j < leaders.length; j++) if (cross(leaders[i].leader, leaders[j].leader)) out.push(`XLEAD ${leaders[i].id} × ${leaders[j].id}`);
    for (const s of m.segs) if (cross(leaders[i].leader, s)) out.push(`XLINE ${leaders[i].id} × ${s[5]}`);
  }
  const len = (l) => Math.hypot(l.leader[2] - l.leader[0], l.leader[3] - l.leader[1]);
  return { issues: [...new Set(out)], maxLeader: leaders.length ? Math.round(Math.max(...leaders.map(len))) : 0 };
}
