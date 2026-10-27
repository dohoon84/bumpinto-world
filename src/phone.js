// 휴대폰 화면 안의 소형맵. 정자역 장면(jeongja.json)을 위에서 본 탑다운이고,
// 플레이어를 가운데 두고 주변만 보여 준다. 북쪽은 위(z가 남쪽이므로 캔버스 +y = +z).

const ROAD_COLOR = {
  primary: '#8d939c', secondary: '#949aa3', tertiary: '#9ca1a9', trunk: '#8d939c',
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

function drawBaseMap(data) {
  const b = data.meta.bboxLocal;
  const scale = MAP_SCALE;
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

export function mountPhone({ data }) {
  const canvas = document.getElementById('phone-map');
  const ctx = canvas.getContext('2d');
  const map = drawBaseMap(data);
  let heading = 0;
  let ready = false;

  return {
    tick({ x, z, moving, moveYaw, lookYaw, dt = 0.016 }) {
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
      ctx.drawImage(src, sx, sy, viewW * scale, viewH * scale, 0, 0, w, h);

      const reach = Math.min(w, h) * 0.46;
      const dir = Math.atan2(Math.cos(heading), Math.sin(heading));
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(dir);
      drawCone(ctx, reach);
      ctx.restore();

      ctx.save();
      ctx.translate(w / 2, h / 2);
      drawBlip(ctx, performance.now(), w / Math.max(1, canvas.clientWidth));
      ctx.restore();
    },
  };
}
