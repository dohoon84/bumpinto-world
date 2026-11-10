// [gyeongbu-bus] 휴대폰 코너맵·HUD v3 미니맵에 경부 본선·청계산로·주변 길을 그린다.
//   본선·강남 섬 사이에는 코리더 상세 타일이 없어서, 미니맵이 베이지 배경과 화살표만 남았다.
export const CHEONGGYE_STREETS_FILE = 'gyeongbu/cheonggye-streets.json';
export const CHEONGGYE_BUILDINGS_FILE = 'gyeongbu/cheonggye-buildings.json';

// 본선 4+4 차로+갓길 폭, 중심선(서울 방면 차로 중앙)에서 전체 데크 중심까지의 왼쪽 오프셋.
//   nbOuterEdge=-9.75, sbOuterEdge=27.65 → 폭 37.4, 중심 (27.65-9.75)/2=8.95
export const EXPRESS_MAP_W = 37.4;
export const EXPRESS_MAP_OFF = 8.95;
export const SPUR_MAP_W = 20; // gyeongbuExpress.js 스퍼 리본 폭

function xz(p) { return [p[0], p[1]]; }

function offsetPolyline(pts, off) {
  if (!pts?.length) return [];
  if (!off) return pts.map(xz);
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    out.push([pts[i][0] + (-dz / L) * off, pts[i][1] + (dx / L) * off]);
  }
  return out;
}

function splitByKind(pts) {
  const runs = { approach: [], main: [], spur: [] };
  if (!pts?.length) return runs;
  let cur = pts[0][3] || 'main', buf = [pts[0]];
  const flush = () => { if (buf.length && runs[cur]) runs[cur].push(buf); buf = []; };
  for (let i = 1; i < pts.length; i++) {
    const k = pts[i][3] || cur;
    if (k !== cur) {
      buf.push(pts[i]); // 이음새
      flush();
      cur = k;
      buf = [pts[i - 1], pts[i]];
    } else buf.push(pts[i]);
  }
  flush();
  return runs;
}

/** 미니맵용 도로 배열. k 는 phone.js / HUD v3 MAJOR 집합과 맞춘다. */
export function expressRoadsForMap(pts) {
  const roads = [];
  const runs = splitByKind(pts);
  for (const run of [...(runs.approach || []), ...(runs.main || [])]) {
    if (run.length < 2) continue;
    roads.push({ k: 'motorway', w: EXPRESS_MAP_W, p: offsetPolyline(run, EXPRESS_MAP_OFF) });
  }
  for (const run of runs.spur || []) {
    if (run.length < 2) continue;
    roads.push({ k: 'primary', w: SPUR_MAP_W, p: run.map(xz) });
  }
  return roads;
}

function bboxSeg(ax, az, bx, bz, pad) {
  return [
    Math.min(ax, bx) - pad, Math.min(az, bz) - pad,
    Math.max(ax, bx) + pad, Math.max(az, bz) + pad,
  ];
}

/** 도로·건물을 타일 칸에 넣는다. 긴 본선은 세그먼트 bbox 로만 칸을 열어 빈 산을 채우지 않는다. */
export function binGyeongbuMiniTiles({ pts, streets, buildings, tileSize = 500 } = {}) {
  const tiles = new Map();
  const ensure = (i, j) => {
    const key = `${i}_${j}`;
    let t = tiles.get(key);
    if (!t) {
      t = {
        key, x0: i * tileSize, z0: j * tileSize, size: tileSize,
        data: { roads: [], parks: [], water: [], waterLines: [], buildings: [] },
      };
      tiles.set(key, t);
    }
    return t;
  };
  const addLine = (feat, kind, pad) => {
    const p = feat.p;
    if (!p || p.length < 2) return;
    const seen = new Set();
    for (let i = 1; i < p.length; i++) {
      const [x0, z0, x1, z1] = bboxSeg(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], pad);
      for (let ix = Math.floor(x0 / tileSize); ix <= Math.floor(x1 / tileSize); ix++) {
        for (let iz = Math.floor(z0 / tileSize); iz <= Math.floor(z1 / tileSize); iz++) {
          const t = ensure(ix, iz);
          if (seen.has(t.key)) continue;
          seen.add(t.key);
          t.data[kind].push(feat);
        }
      }
    }
  };
  const addPoly = (feat, kind, pad = 8) => {
    const o = feat.o;
    if (!o || o.length < 3) return;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of o) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    for (let ix = Math.floor((x0 - pad) / tileSize); ix <= Math.floor((x1 + pad) / tileSize); ix++) {
      for (let iz = Math.floor((z0 - pad) / tileSize); iz <= Math.floor((z1 + pad) / tileSize); iz++) {
        ensure(ix, iz).data[kind].push(feat);
      }
    }
  };

  for (const r of expressRoadsForMap(pts)) addLine(r, 'roads', (r.w || 20) / 2 + 4);
  for (const r of streets?.roads || []) addLine(r, 'roads', (r.w || 6) / 2 + 4);
  for (const b of buildings?.buildings || []) addPoly(b, 'buildings');
  return [...tiles.values()];
}

export function roadsNearMiniTiles(tiles, x, z, r = 80) {
  const hits = [];
  const seen = new Set();
  for (const t of tiles) {
    for (const rd of t.data.roads || []) {
      if (seen.has(rd)) continue;
      const p = rd.p;
      if (!p || p.length < 2) continue;
      let best = Infinity;
      for (let i = 1; i < p.length; i++) {
        const ax = p[i - 1][0], az = p[i - 1][1], bx = p[i][0], bz = p[i][1];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
        if (d < best) best = d;
      }
      if (best <= r + (rd.w || 0) / 2) { seen.add(rd); hits.push({ ...rd, dist: best }); }
    }
  }
  return hits;
}
