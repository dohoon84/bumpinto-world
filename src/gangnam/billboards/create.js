// [gangnam-ads] 미디어폴·전광판. 자리 = placements.json, 그림 = manifest.js.
//   화면은 아틀라스 1장 + 메시 1개. 폴 기둥은 InstancedMesh 1개. 애니메이션은 UV 를 4초마다 바꾸는 것(셰이더 없음).
//   모바일은 schedule 없이 첫 장만, UV 스크롤 없음.
//   ?gangnamads=0 · ?gangnam=0 이면 만들지 않는다.
import * as THREE from 'three';
import placements from './placements.js';
import { SCREENS, BUILTIN, FRAME_SEC } from './manifest.js';

const CELL = 256;
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintBuiltin(ctx, i, label, sub, colors) {
  const x = i * CELL;
  const g = ctx.createLinearGradient(x, 0, x + CELL, CELL);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(x, 0, CELL, CELL);
  ctx.fillStyle = 'rgba(8,16,32,.35)';
  roundRect(ctx, x + 14, 14, CELL - 28, CELL - 28, 28);
  ctx.fill();
  ctx.fillStyle = '#f4f7fb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 54px Pretendard, sans-serif';
  ctx.fillText(label, x + CELL / 2, CELL / 2 - (sub ? 16 : 0));
  if (sub) {
    ctx.font = '700 22px Pretendard, sans-serif';
    ctx.fillStyle = '#d5e4f5';
    ctx.fillText(sub, x + CELL / 2, CELL / 2 + 36);
  }
}

function paintAtlas(logo) {
  const cols = 4;
  const canvas = document.createElement('canvas');
  canvas.width = CELL * cols;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  paintBuiltin(ctx, 0, 'BUMP', '강남', ['#1d4e89', '#16365f']);
  paintBuiltin(ctx, 1, 'bumpinto', '.world', ['#245b86', '#1a3f5c']);
  paintBuiltin(ctx, 2, 'BUMP24', '강남대로', ['#2a4d78', '#1c3554']);
  const x = 3 * CELL;
  const g = ctx.createLinearGradient(x, 0, x + CELL, CELL);
  g.addColorStop(0, '#1a6cff');
  g.addColorStop(0.5, '#7fd0ff');
  g.addColorStop(1, '#ff5a7a');
  ctx.fillStyle = g;
  ctx.fillRect(x, 0, CELL, CELL);
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(CELL * 0.5, 78, 36, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, CELL * 0.5 - 36, 42, 72, 72);
    ctx.restore();
  } else {
    ctx.fillStyle = '#7ec8e8';
    ctx.beginPath();
    ctx.arc(CELL * 0.5, 78, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e23b4a';
    ctx.beginPath();
    ctx.arc(CELL * 0.5, 78, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

function sourcesOf(entry) {
  return entry?.schedule?.length ? entry.schedule : [entry?.src].filter(Boolean);
}

function quad(pos, uv, col, idx, cx, cy, cz, yaw, w, h, zLocal, cell, cols, rgb) {
  const hw = w / 2, hh = h / 2;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const u0 = cell / cols, u1 = (cell + 1) / cols;
  const corners = [[-hw, -hh, u0, 1], [hw, -hh, u1, 1], [hw, hh, u1, 0], [-hw, hh, u0, 0]];
  const base = pos.length / 3;
  for (const [lx, ly, u, v] of corners) {
    const wx = cx + lx * c + zLocal * s;
    const wz = cz - lx * s + zLocal * c;
    pos.push(wx, cy + ly, wz);
    uv.push(u, v);
    col.push(rgb[0], rgb[1], rgb[2]);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return base;
}

export function createGangnamBillboards({ scene, baseUrl = '/', mobile = false, terrain = null }) {
  const list = (placements.screens || []).filter((s) => SCREENS[s.id]);
  const root = new THREE.Group();
  root.name = 'gangnamAds';
  scene.add(root);
  const custom = [];
  for (const s of list) for (const src of (mobile ? [SCREENS[s.id].src] : sourcesOf(SCREENS[s.id]))) {
    if (BUILTIN[src] == null && src && !custom.includes(src)) custom.push(src);
  }
  const cols = 4 + custom.length;
  const canvas = document.createElement('canvas');
  canvas.width = CELL * cols;
  canvas.height = CELL;
  const baked = paintAtlas(null);
  canvas.getContext('2d').drawImage(baked, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const drawLogo = () => {
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.beginPath();
    ctx.arc(CELL * 0.5, 70, 34, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, CELL * 0.5 - 34, 36, 68, 68);
    ctx.restore();
    tex.needsUpdate = true;
  };
  const logo = new Image();
  logo.onload = drawLogo;
  logo.src = baseUrl + 'favicon.svg';
  const cellOf = (src) => (BUILTIN[src] != null ? BUILTIN[src] : 4 + custom.indexOf(src));
  custom.forEach((src, i) => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      const dx = (4 + i) * CELL;
      ctx.fillStyle = '#10141c';
      ctx.fillRect(dx, 0, CELL, CELL);
      const sc = Math.max(CELL / img.width, CELL / img.height);
      const w = img.width * sc, h = img.height * sc;
      ctx.drawImage(img, dx + (CELL - w) / 2, (CELL - h) / 2, w, h);
      tex.needsUpdate = true;
    };
    img.src = src.startsWith('/') ? baseUrl + src.slice(1) : src;
  });

  const pos = [], uv = [], col = [], idx = [];
  const anim = [];
  const ground = (x, z) => (terrain ? terrain.renderHeight(x, z) : 0);
  for (const s of list) {
    const entry = SCREENS[s.id];
    const seq = (mobile ? [entry.src] : sourcesOf(entry)).map((src) => cellOf(src));
    const y = s.kind === 'pole' ? ground(s.x, s.z) + (s.poleH || 5.6) - s.h / 2 : ground(s.x, s.z) + s.y;
    const frame = quad(pos, uv, col, idx, s.x, y, s.z, s.yaw, s.w + (s.kind === 'pole' ? 0.18 : 0.6), s.h + (s.kind === 'pole' ? 0.18 : 0.45), -0.06, 0, cols, [0.08, 0.09, 0.12]);
    const face = quad(pos, uv, col, idx, s.x, y, s.z, s.yaw, s.w, s.h, 0.02, seq[0], cols, [1, 1, 1]);
    anim.push({ face, seq, cell: seq[0], grad: seq.includes(BUILTIN['builtin:gradient']) });
    void frame;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, toneMapped: false, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'gangnamScreens';
  mesh.visible = false;
  root.add(mesh);

  const poles = list.filter((s) => s.kind === 'pole');
  let poleMesh = null;
  if (poles.length) {
    const g = new THREE.CylinderGeometry(0.12, 0.16, 1, 6);
    g.translate(0, 0.5, 0);
    poleMesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: '#3c4450' }), poles.length);
    poleMesh.name = 'gangnamPoles';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3();
    poles.forEach((s, i) => {
      q.identity();
      m4.compose(p.set(s.x, ground(s.x, s.z), s.z), q, sv.set(1, s.poleH || 5.6, 1));
      poleMesh.setMatrixAt(i, m4);
    });
    poleMesh.instanceMatrix.needsUpdate = true;
    poleMesh.computeBoundingSphere();
    poleMesh.visible = false;
    root.add(poleMesh);
  }

  const box = list.reduce((b, s) => ({
    x0: Math.min(b.x0, s.x), x1: Math.max(b.x1, s.x), z0: Math.min(b.z0, s.z), z1: Math.max(b.z1, s.z),
  }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
  const uvAttr = geo.getAttribute('uv');
  let acc = 0, shown = false;
  const setCell = (face, cell) => {
    const u0 = cell / cols, u1 = (cell + 1) / cols;
    uvAttr.setXY(face, u0, 1);
    uvAttr.setXY(face + 1, u1, 1);
    uvAttr.setXY(face + 2, u1, 0);
    uvAttr.setXY(face + 3, u0, 0);
  };
  return {
    root,
    screens: list,
    stats: { screens: list.length, poles: poles.length, mobile, atlas: `${canvas.width}x${canvas.height}` },
    update(dt, x, z) {
      const on = x >= box.x0 - 800 && x <= box.x1 + 800 && z >= box.z0 - 800 && z <= box.z1 + 800;
      if (on !== shown) { shown = on; mesh.visible = on; if (poleMesh) poleMesh.visible = on; }
      if (!on || mobile) return;
      acc += dt;
      const step = Math.floor(acc / FRAME_SEC);
      let dirty = false;
      const shift = (Math.sin(acc * 0.7) * 0.5 + 0.5) * 0.08;
      for (const a of anim) {
        const cell = a.seq[step % a.seq.length];
        if (cell !== a.cell) { a.cell = cell; setCell(a.face, cell); dirty = true; }
        if (a.grad && a.cell === BUILTIN['builtin:gradient']) {
          const u0 = a.cell / cols + shift * 0.15, u1 = (a.cell + 1) / cols - 0.02 + shift * 0.05;
          uvAttr.setX(a.face, u0); uvAttr.setX(a.face + 1, u1); uvAttr.setX(a.face + 2, u1); uvAttr.setX(a.face + 3, u0);
          dirty = true;
        }
      }
      if (dirty) uvAttr.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
      poleMesh?.geometry.dispose();
      poleMesh?.material.dispose();
      scene.remove(root);
    },
  };
}
