// 휴대폰 화면 안의 소형맵. 정자역 장면(jeongja.json)을 위에서 본 탑다운이고,
// 플레이어를 가운데 두고 주변만 보여 준다. 북쪽은 위(z가 남쪽이므로 캔버스 +y = +z).

const ROAD_COLOR = {
  motorway: '#8d939c', motorway_link: '#8d939c', primary: '#8d939c', secondary: '#949aa3', tertiary: '#9ca1a9', trunk: '#8d939c',
  residential: '#a9adb4', unclassified: '#a9adb4', service: '#b4b7bc', living_street: '#b4b7bc',
  footway: '#e2d3b5', pedestrian: '#e6d8bb', path: '#d9c8a4', cycleway: '#d68c7a', steps: '#cbbd9f', track: '#c9b48d',
};
const PARK_COLOR = {
  park: '#a8d59a', garden: '#b2dc9f', playground: '#c6e2a0', pitch: '#9fd08c', grass: '#b5dda3',
  forest: '#86bf7c', wood: '#86bf7c', scrub: '#9cc78a', meadow: '#bfe0a8', recreation_ground: '#b0d89c',
  village_green: '#b5dda3', grassland: '#bfe0a8', plaza: '#e9dfca',
};
const BUILDING_COLOR = {
  apartments: '#f3e3d3', residential: '#f1e0cf', commercial: '#d8e2ee', office: '#d3deec',
  retail: '#eedccb', school: '#f4d7b8', kindergarten: '#f7d4c4', public: '#e8dcc8', house: '#efe6d6',
  civic: '#e4ddd0', church: '#efe8dc', yes: '#e7e3dc',
};

const MAP_SCALE = 0.45;
const VIEW_M = 108;
const CONE_SPREAD = 0.72;

function addRing(ctx, ring, x0, z0, scale) {
  for (let i = 0; i < ring.length; i++) {
    const x = (ring[i][0] - x0) * scale, y = (ring[i][1] - z0) * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function fillPoly(ctx, poly, x0, z0, scale) {
  if (!poly.o || poly.o.length < 3) return;
  ctx.beginPath();
  addRing(ctx, poly.o, x0, z0, scale);
  for (const h of poly.holes || []) if (h.length >= 3) addRing(ctx, h, x0, z0, scale);
  ctx.fill('evenodd');
}

export function drawBaseMap(data, region = null) { // [corridor] 코리더 타일 미니맵도 같은 함수로 그린다
  const b = data.meta.bboxLocal;
  const maxSpan = Math.max(b.x1 - b.x0, b.z1 - b.z0, 1);
  const scale = Math.min(MAP_SCALE, 2400 / maxSpan);
  const w = Math.ceil((b.x1 - b.x0) * scale);
  const h = Math.ceil((b.z1 - b.z0) * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ebe4d4';
  ctx.fillRect(0, 0, w, h);

  for (const p of data.parks || []) {
    ctx.fillStyle = PARK_COLOR[p.k] || '#b5dda3';
    fillPoly(ctx, p, b.x0, b.z0, scale);
  }
  ctx.fillStyle = '#7ec3e6';
  for (const p of data.water || []) fillPoly(ctx, p, b.x0, b.z0, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of data.waterLines || []) {
    ctx.strokeStyle = '#7ec3e6';
    ctx.lineWidth = Math.max(2, line.w * scale);
    strokeLine(ctx, line.p, b.x0, b.z0, scale);
  }
  const roads = [...(data.roads || [])].sort((a, c) => (c.w || 0) - (a.w || 0));
  for (const r of roads) {
    ctx.strokeStyle = ROAD_COLOR[r.k] || '#b4b7bc';
    ctx.lineWidth = Math.max(1, (r.w || 2) * scale);
    strokeLine(ctx, r.p, b.x0, b.z0, scale);
  }
  for (const building of data.buildings || []) {
    ctx.fillStyle = BUILDING_COLOR[building.k] || '#e7e3dc';
    fillPoly(ctx, building, b.x0, b.z0, scale);
  }
  // 탄천 반려견 놀이터 (정자동 전용)
  const hasDogPark = region ? !!region.features?.dogPark : data.station?.name !== 'Starbase';
  if (hasDogPark) {
    const dx0 = (75.5 - b.x0) * scale;
    const dx1 = (102.5 - b.x0) * scale;
    const dz0 = (-302.0 - b.z0) * scale;
    const dzMid = (-270.0 - b.z0) * scale;
    const dz1 = (-240.0 - b.z0) * scale;
    ctx.fillStyle = '#9be17b';
    ctx.fillRect(dx0, dz0, dx1 - dx0, dz1 - dz0);
    ctx.strokeStyle = '#ff922b';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(dx0, dzMid, dx1 - dx0, dz1 - dzMid);
    ctx.strokeStyle = '#339af0';
    ctx.strokeRect(dx0, dz0, dx1 - dx0, dzMid - dz0);

    // 탄천 징검다리(돌다리) 미니맵 점선 표시
    const sy = (-196.0 - b.z0) * scale;
    ctx.fillStyle = '#dcd6c8';
    for (let sx = 21; sx <= 63; sx += 3.5) {
      ctx.beginPath();
      ctx.arc((sx - b.x0) * scale, sy, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (data.station) {
    const sx = (data.station.x - b.x0) * scale, sy = (data.station.z - b.z0) * scale;
    ctx.fillStyle = '#d4003b';
    ctx.beginPath();
    ctx.arc(sx, sy, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5a200';
    ctx.beginPath();
    ctx.arc(sx + 2.2, sy, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }
  return { canvas, scale, b };
}

function strokeLine(ctx, pts, x0, z0, scale) {
  if (!pts || pts.length < 2) return;
  ctx.beginPath();
  pts.forEach(([x, z], i) => {
    const px = (x - x0) * scale, py = (z - z0) * scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function fitCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (rect.width < 2 || rect.height < 2) return false;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return true;
}

function drawCone(ctx, reach) {
  const strips = 16;
  const span = CONE_SPREAD * 2;
  for (let i = 0; i < strips; i++) {
    const t0 = -CONE_SPREAD + (span * i) / strips;
    const t1 = -CONE_SPREAD + (span * (i + 1)) / strips;
    const mid = (t0 + t1) / 2;
    const edge = Math.sin(Math.PI * (i + 0.5) / strips);
    const a = 0.8 * edge;
    const gx = Math.cos(mid) * reach, gy = Math.sin(mid) * reach;
    const g = ctx.createLinearGradient(0, 0, gx, gy);
    g.addColorStop(0, `rgba(37, 112, 255, ${a})`);
    g.addColorStop(0.38, `rgba(37, 112, 255, ${a * 0.42})`);
    g.addColorStop(1, 'rgba(37, 112, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, reach, t0, t1);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBlip(ctx, now, s) {
  const wave = (Math.sin(now * 0.008) + 1) / 2;
  ctx.beginPath();
  ctx.arc(0, 0, (6 + wave * 12) * s, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(42, 127, 255, ${0.5 * (1 - wave)})`;
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, 5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = wave > 0.5 ? '#2a7fff' : '#9ec4ff';
  ctx.beginPath();
  ctx.arc(0, 0, 2.8 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawPeerMarkers(ctx, peers, x, z, w, h, viewW, viewH, now, s) {
  if (!peers || !peers.length) return;
  const pxPerM = w / viewW;
  const cx = w / 2;
  const cy = h / 2;
  const pad = 13 * s;
  const maxX = cx - pad;
  const maxY = cy - pad;
  const pulse = (Math.sin(now * 0.007) + 1) / 2;

  ctx.save();
  ctx.font = `800 ${Math.round(9.5 * s)}px Pretendard, -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';

  for (const peer of peers) {
    const dx = (peer.x || 0) - x;
    const dz = (peer.z || 0) - z;
    const ox = dx * pxPerM;
    const oy = dz * pxPerM;
    const inside = Math.abs(ox) <= maxX && Math.abs(oy) <= maxY;
    const label = String(peer.name || '손님').slice(0, 8);

    if (inside) {
      const px = cx + ox;
      const py = cy + oy;
      ctx.beginPath();
      ctx.arc(px, py, (4.8 + pulse * 3.5) * s, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(32, 201, 151, ${0.42 * (1 - pulse * 0.5)})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, 4.3 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#102033';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, 3.1 * s, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe169';
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.lineWidth = 2.8 * s;
      ctx.strokeStyle = 'rgba(16, 32, 51, 0.92)';
      ctx.strokeText(label, px, py - 8.5 * s);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, px, py - 8.5 * s);
    } else {
      const angle = Math.atan2(oy, ox);
      const kx = Math.abs(ox) > 1e-4 ? maxX / Math.abs(ox) : Infinity;
      const ky = Math.abs(oy) > 1e-4 ? maxY / Math.abs(oy) : Infinity;
      const k = Math.min(kx, ky);
      const ex = cx + ox * k;
      const ey = cy + oy * k;

      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(5.5 * s, 0);
      ctx.lineTo(-4.2 * s, -4.0 * s);
      ctx.lineTo(-2.4 * s, 0);
      ctx.lineTo(-4.2 * s, 4.0 * s);
      ctx.closePath();
      ctx.fillStyle = '#20c997';
      ctx.strokeStyle = '#102033';
      ctx.lineWidth = 1.6 * s;
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      const tx = ex - Math.cos(angle) * 8 * s;
      const ty = ey - Math.sin(angle) * 8 * s;
      ctx.textAlign = ex > cx + 12 * s ? 'right' : ex < cx - 12 * s ? 'left' : 'center';
      ctx.lineWidth = 2.6 * s;
      ctx.strokeStyle = 'rgba(16, 32, 51, 0.92)';
      ctx.strokeText(label, tx, ty);
      ctx.fillStyle = '#ffe169';
      ctx.fillText(label, tx, ty);
    }
  }
  ctx.restore();
}

function drawBp24(ctx, x, z, w, h, viewW, viewH) {
  const nav = window.__jj?.bp24Nav;
  const canvas = ctx.canvas;
  canvas._bp24Hits = [];
  if (!nav?.on || !nav.logo) return;
  const pts = nav.points();
  if (!pts.length && !nav.guiding) return;
  const px = w / viewW, pz = h / viewH;
  const g = nav.guiding;
  if (g) {
    const x0 = w / 2 + (g.from[0] - x) * px, y0 = h / 2 + (g.from[1] - z) * pz;
    const x1 = w / 2 + (g.x - x) * px, y1 = h / 2 + (g.z - z) * pz;
    ctx.save();
    ctx.strokeStyle = '#4cc9f0'; ctx.lineWidth = Math.max(2, w / 80); ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }
  for (const st of pts) {
    const sx = w / 2 + (st.x - x) * px, sy = h / 2 + (st.z - z) * pz;
    if (sx < -16 || sy < -16 || sx > w + 16 || sy > h + 16) continue;
    const r = Math.max(7, w / 28);
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#0d1a33'; ctx.stroke();
    ctx.drawImage(nav.logo, sx - r + 2, sy - r + 2, (r - 2) * 2, (r - 2) * 2);
    canvas._bp24Hits.push({ sx, sy, r: r + 4, id: st.id });
  }
}

// [myeongdong] 명동 코너맵: 건물·길·광장·공원 + 명동역(4호선) + 명동성당 + 남산오르미 길안내(점선). 명동 땅 400 m 안이면 남산 대신 그린다.
function drawMyeongdongMini(ctx, x, z, w, h, viewW) {
  const md = (typeof window !== 'undefined' && window.__jj?.myeongdong) || null;
  if (!md?.ready || !(md.ownDist?.(x, z) < 400)) return false;
  const mini = md.mini;
  if (!mini?.roads?.length) return false;
  const px = w / viewW;
  const X = (wx) => w / 2 + (wx - x) * px;
  const Y = (wz) => h / 2 + (wz - z) * px;
  const far = viewW * 0.75;
  const near = (pts) => pts?.some?.(([a, b]) => Math.abs(a - x) < far && Math.abs(b - z) < far);
  const path = (pts, close) => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(X(a), Y(b)) : ctx.moveTo(X(a), Y(b)))); if (close) ctx.closePath(); };
  ctx.save();
  ctx.fillStyle = '#e6dccb'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#86bf7c';
  for (const p of mini.parks || []) if (near(p.o)) { path(p.o, true); ctx.fill(); }
  ctx.fillStyle = '#efe4cf';
  for (const p of mini.plazas || []) if (near(p.o)) { path(p.o, true); ctx.fill(); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const CAR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'primary_link', 'secondary_link', 'tertiary_link']);
  for (const r of mini.roads) {
    if (!near(r.p)) continue;
    const car = CAR.has(r.k);
    ctx.strokeStyle = car ? '#8d939c' : '#fbf6ec';
    ctx.lineWidth = Math.max(car ? 2.2 : 1.2, (r.w || (car ? 9 : 3)) * px * 0.85);
    path(r.p); ctx.stroke();
  }
  ctx.fillStyle = '#c9c1b4'; ctx.strokeStyle = '#b1a898'; ctx.lineWidth = 1;
  for (const b of mini.buildings || []) if (near(b.o)) { path(b.o, true); ctx.fill(); ctx.stroke(); }
  const st = mini.station;
  if (st?.guide?.length > 1) { ctx.setLineDash([5, 4]); ctx.strokeStyle = '#0b7fb0'; ctx.lineWidth = Math.max(2, 2.4 * px); path(st.guide); ctx.stroke(); ctx.setLineDash([]); }
  const s = Math.max(1, w / 180);
  const cath = md.cathedral;
  if (cath) {
    const cx = X(cath.x), cy = Y(cath.z);
    ctx.fillStyle = '#7a3b2a'; ctx.fillRect(cx - 1.2 * s, cy - 6 * s, 2.4 * s, 12 * s); ctx.fillRect(cx - 4.5 * s, cy - 3 * s, 9 * s, 2.4 * s);
  }
  for (const e of st?.exits || []) { ctx.fillStyle = '#f2c200'; ctx.fillRect(X(e.x) - 2 * s, Y(e.z) - 2 * s, 4 * s, 4 * s); }
  if (st) {
    const sx = X(st.x), sy = Y(st.z);
    ctx.beginPath(); ctx.arc(sx, sy, 7 * s, 0, Math.PI * 2); ctx.fillStyle = '#00A5DE'; ctx.fill();
    ctx.lineWidth = 1.5 * s; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.round(9 * s)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('4', sx, sy + 0.5);
  }
  ctx.font = `700 ${Math.round(Math.max(10, w * 0.075))}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(235, 228, 212, 0.92)'; ctx.strokeText('명동 Myeongdong', w / 2, h - 6);
  ctx.fillStyle = '#1a2740'; ctx.fillText('명동 Myeongdong', w / 2, h - 6);
  ctx.restore();
  return true;
}

function drawNamsanMini(ctx, x, z, w, h, viewW, viewH) {
  const n = (typeof window !== 'undefined' && window.__jj?.namsan) || null;
  const mini = n?.mini;
  const nt = n?.tower;
  if (!mini || !nt) return false;
  const nd = Math.hypot((nt.ox ?? nt.x) - x, (nt.oz ?? nt.z) - z);
  if (!Number.isFinite(nd) || nd >= 2800) return false;
  const px = w / viewW;
  const X = (wx) => w / 2 + (wx - x) * px;
  const Y = (wz) => h / 2 + (wz - z) * px;
  const strokePts = (pts) => {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const sx = X(pts[i][0]), sy = Y(pts[i][1]);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  };
  const fillPts = (pts) => {
    if (!pts || pts.length < 3) return;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const sx = X(pts[i][0]), sy = Y(pts[i][1]);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
  };
  ctx.save();
  ctx.fillStyle = '#86bf7c';
  for (const p of mini.parks || []) fillPts(p.o);
  ctx.fillStyle = '#e9dfca';
  for (const p of mini.plazas || []) fillPts(p.o);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'road']);
  for (const r of mini.roads || []) {
    if (!r.p || r.p.length < 2) continue;
    if (r.k === 'aerialway') {
      ctx.strokeStyle = '#e8d296';
      ctx.lineWidth = Math.max(1.6, 3 * px);
      ctx.setLineDash([7, 4]);
      strokePts(r.p);
      ctx.setLineDash([]);
      continue;
    }
    const car = CAR.has(r.k);
    ctx.strokeStyle = car ? '#8d939c' : '#d9c8a4';
    ctx.lineWidth = Math.max(car ? 2.2 : 1.2, (r.w || (car ? 7 : 2.2)) * px * 0.8);
    strokePts(r.p);
  }
  ctx.font = `700 ${Math.round(Math.max(10, w * 0.075))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(235, 228, 212, 0.92)';
  ctx.strokeText('남산', w / 2, h - 6);
  ctx.fillStyle = '#1a2740';
  ctx.fillText('남산', w / 2, h - 6);
  ctx.restore();
  return true;
}


function drawHangangMini(ctx, x, z, w, h, viewW, viewH) {
  const hg = (typeof window !== 'undefined' && window.__jj?.hangang) || null;
  const mini = hg?.mini;
  const b = hg?.bounds;
  if (!mini || !b) return false;
  if (x < b.x0 - 500 || x > b.x1 + 500 || z < b.z0 - 500 || z > b.z1 + 500) return false;
  if (hg.ownDist && hg.ownDist(x, z) > 500) return false; // [hangang-isolation] 강남역 섬 위에 한강 미니맵을 덧그리지 않는다
  const px = w / viewW;
  const X = (wx) => w / 2 + (wx - x) * px;
  const Y = (wz) => h / 2 + (wz - z) * px;
  const strokePts = (pts) => {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const sx = X(pts[i][0]), sy = Y(pts[i][1]);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  };
  const fillPts = (pts, holes) => {
    if (!pts || pts.length < 3) return;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const sx = X(pts[i][0]), sy = Y(pts[i][1]);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    for (const hpts of holes || []) {
      if (!hpts || hpts.length < 3) continue;
      for (let i = 0; i < hpts.length; i++) {
        const sx = X(hpts[i][0]), sy = Y(hpts[i][1]);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');
  };
  ctx.save();
  ctx.fillStyle = '#5aa0c4';
  for (const p of mini.water || []) fillPts(p.o, p.holes);
  ctx.fillStyle = '#86bf7c';
  for (const p of mini.parks || []) fillPts(p.o);
  ctx.fillStyle = 'rgba(160, 186, 218, 0.35)';
  for (const bld of mini.buildings || []) fillPts(bld.o);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const CAR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'road']);
  for (const r of mini.roads || []) {
    if (!r.p || r.p.length < 2) continue;
    if (r.k === 'cycleway') {
      ctx.strokeStyle = '#c05645';
      ctx.lineWidth = Math.max(1.8, (r.w || 4) * px * 0.85);
      strokePts(r.p);
      continue;
    }
    const car = CAR.has(r.k);
    ctx.strokeStyle = car ? '#8d939c' : '#d9c8a4';
    ctx.lineWidth = Math.max(car ? 2.2 : 1.1, (r.w || (car ? 7 : 2.2)) * px * 0.8);
    strokePts(r.p);
  }
  ctx.font = `700 ${Math.round(Math.max(10, w * 0.07))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(235, 228, 212, 0.92)';
  ctx.strokeText('한강', w / 2, h - 6);
  ctx.fillStyle = '#1a2740';
  ctx.fillText('한강', w / 2, h - 6);
  ctx.restore();
  return true;
}

export function mountPhone({ data, region = null, extraTiles = null, placeAt = null, peerHere = null } = {}) { // [corridor] extraTiles(): [{ b, canvas }] (라이브 지도 아래에 깔림) [gangnam-night] placeAt·peerHere

  const canvas = document.getElementById('phone-map');
  const ctx = canvas.getContext('2d');
  const map = drawBaseMap(data, region);
  canvas.addEventListener('click', (e) => { // [bp24nav] 매장 아이콘만. 다른 곳은 예전처럼 클릭이 없다
    const nav = window.__jj?.bp24Nav;
    const hits = canvas._bp24Hits;
    if (!nav?.on || !hits?.length) return;
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (canvas.width / Math.max(1, r.width));
    const sy = (e.clientY - r.top) * (canvas.height / Math.max(1, r.height));
    const hit = hits.find((h) => (h.sx - sx) ** 2 + (h.sy - sy) ** 2 < h.r * h.r);
    if (hit) nav.guide(hit.id);
  });
  let heading = 0;
  let ready = false;

  return {
    tick({ x, z, moving, moveYaw, lookYaw, dt = 0.016, peers = [] }) {
      // [hud-v3] 원형 미니맵이 켜져 있으면 코너맵을 그리지 않음(display:none + 여기 early return)
      if (document.body.classList.contains('h3-mm-on')) return;
      const target = moving ? moveYaw : lookYaw;
      if (!ready) { heading = target; ready = true; }
      else {
        const d = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
        const k = 1 - Math.exp(-12 * dt);
        heading += d * k;
      }
      if (!fitCanvas(canvas)) return;
      const { b, scale, canvas: src } = map;
      const w = canvas.width, h = canvas.height;
      const viewW = VIEW_M * 2;
      const viewH = viewW * (h / w);
      const sx = (x - b.x0) * scale - (viewW * scale) / 2;
      const sy = (z - b.z0) * scale - (viewH * scale) / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#ebe4d4';
      ctx.fillRect(0, 0, w, h);
      if (extraTiles) {
        const k = w / (viewW * scale);
        for (const t of extraTiles()) {
          const tx = ((t.b.x0 - b.x0) * scale - sx) * k, ty = ((t.b.z0 - b.z0) * scale - sy) * k, tw = t.canvas.width * k, th = t.canvas.height * k;
          if (tx > w || ty > h || tx + tw < 0 || ty + th < 0) continue;
          ctx.drawImage(t.canvas, tx, ty, tw, th);
        }
      }
      ctx.drawImage(src, sx, sy, viewW * scale, viewH * scale, 0, 0, w, h);
      if (!drawMyeongdongMini(ctx, x, z, w, h, viewW)) drawNamsanMini(ctx, x, z, w, h, viewW, viewH); // [myeongdong]
      drawHangangMini(ctx, x, z, w, h, viewW, viewH);

      const s = w / Math.max(1, canvas.clientWidth);
      const now = performance.now();
      const reach = Math.min(w, h) * 0.46;
      const dir = Math.atan2(Math.cos(heading), Math.sin(heading));
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(dir);
      drawCone(ctx, reach);
      ctx.restore();

      const peersDraw = peerHere ? peers.filter((p) => peerHere(p.x || 0, p.z || 0, x, z)) : peers;
      drawPeerMarkers(ctx, peersDraw, x, z, w, h, viewW, viewH, now, s);
      drawBp24(ctx, x, z, w, h, viewW, viewH); // [bp24nav] 꺼져 있으면 그리지 않음
      const cap = placeAt?.(x, z);
      if (cap?.name) {
        const label = String(cap.name).slice(0, 14);
        ctx.save();
        ctx.font = `800 ${Math.round(12 * s)}px Pretendard, "Apple SD Gothic Neo", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = Math.max(24, ctx.measureText(label).width);
        const bw = tw + 14 * s, bh = 16 * s, bx = w / 2 - bw / 2, by = h - bh - 6 * s;
        ctx.fillStyle = 'rgba(10, 18, 32, 0.88)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#ffe169';
        ctx.fillText(label, w / 2, by + bh / 2 + 0.5);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(w / 2, h / 2);
      drawBlip(ctx, now, s);
      ctx.restore();
    },
  };
}
