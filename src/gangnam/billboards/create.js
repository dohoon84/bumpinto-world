// [gangnam-ads] 미디어폴·전광판. 자리 = placements.js, 그림 = manifest.js.
//   로고 쿼드는 그림 비율 그대로(fitInside). 앞·뒤 쿼드를 따로 두어 양쪽에서 핀이 원본과 같은 쪽에 있다.
//   화면 틀(파란 여백)은 로고와 다른 메시. 텍스처는 아틀라스 1장.
//   ?gangnamads=0 · ?gangnam=0 이면 만들지 않는다.
import * as THREE from 'three';
import placements from './placements.js';
import { SCREENS, BUILTIN, FRAME_SEC } from './manifest.js';
import { faceCorners, fitInside, LOGO_ASPECT, LOGO_SRC } from './faces.js';

const IH = 512;
const IW = Math.round(IH * LOGO_ASPECT);

function sourcesOf(entry) {
  return entry?.schedule?.length ? entry.schedule : [entry?.src].filter(Boolean);
}

function paintText(ctx, i, label, sub, colors) {
  const x = i * IW;
  const g = ctx.createLinearGradient(x, 0, x + IW, IH);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(x, 0, IW, IH);
  ctx.fillStyle = '#f4f7fb';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(IH * 0.22)}px Pretendard, sans-serif`;
  ctx.fillText(label, x + IW / 2, IH * 0.42);
  if (sub) {
    ctx.font = `700 ${Math.round(IH * 0.1)}px Pretendard, sans-serif`;
    ctx.fillStyle = '#d5e4f5';
    ctx.fillText(sub, x + IW / 2, IH * 0.68);
  }
}

function pushFace(pos, uv, idx, cx, cy, cz, yaw, corners) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const base = pos.length / 3;
  for (const v of corners) {
    pos.push(cx + v.lx * c + v.lz * s, cy + v.ly, cz - v.lx * s + v.lz * c);
    if (uv) uv.push(v.u, v.v);
  }
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return base;
}

export function createGangnamBillboards({ scene, baseUrl = '/', mobile = false, terrain = null }) {
  const list = (placements.screens || []).filter((s) => SCREENS[s.id]);
  const root = new THREE.Group();
  root.name = 'gangnamAds';
  scene.add(root);
  const extra = [];
  for (const s of list) for (const src of (mobile ? [SCREENS[s.id].src] : sourcesOf(SCREENS[s.id]))) {
    if (src !== LOGO_SRC && BUILTIN[src] == null && src && !extra.includes(src)) extra.push(src);
  }
  const cols = 4 + extra.length;
  const canvas = document.createElement('canvas');
  canvas.width = IW * cols;
  canvas.height = IH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0072DD';
  ctx.fillRect(0, 0, IW, IH);
  paintText(ctx, 1, 'bumpinto', '.world', ['#245b86', '#1a3f5c']);
  paintText(ctx, 2, 'BUMP24', '강남대로', ['#2a4d78', '#1c3554']);
  const gg = ctx.createLinearGradient(3 * IW, 0, 4 * IW, IH);
  gg.addColorStop(0, '#1a6cff');
  gg.addColorStop(0.55, '#7fd0ff');
  gg.addColorStop(1, '#ff5a7a');
  ctx.fillStyle = gg;
  ctx.fillRect(3 * IW, 0, IW, IH);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  tex.anisotropy = 4;
  const paintLogo = (img) => {
    ctx.fillStyle = '#0072DD';
    ctx.fillRect(0, 0, IW, IH);
    ctx.drawImage(img, 0, 0, IW, IH);
    tex.needsUpdate = true;
  };
  const logo = new Image();
  logo.onload = () => paintLogo(logo);
  logo.src = baseUrl + LOGO_SRC.slice(1);
  const cellOf = (src) => {
    if (src === LOGO_SRC) return 0;
    if (BUILTIN[src] != null) return BUILTIN[src];
    return 4 + extra.indexOf(src);
  };
  extra.forEach((src, i) => {
    const img = new Image();
    img.onload = () => {
      const dx = (4 + i) * IW;
      const sc = Math.min(IW / img.width, IH / img.height);
      const w = img.width * sc, h = img.height * sc;
      ctx.fillStyle = '#0072DD';
      ctx.fillRect(dx, 0, IW, IH);
      ctx.drawImage(img, dx + (IW - w) / 2, (IH - h) / 2, w, h);
      tex.needsUpdate = true;
    };
    img.src = src.startsWith('/') ? baseUrl + src.slice(1) : src;
  });

  const pos = [], uv = [], idx = [];
  const fpos = [], fidx = [];
  const anim = [];
  const ground = (x, z) => (terrain ? terrain.renderHeight(x, z) : 0);
  for (const s of list) {
    const entry = SCREENS[s.id];
    const seq = (mobile ? [entry.src] : sourcesOf(entry)).map((src) => cellOf(src));
    const y = s.kind === 'pole' ? ground(s.x, s.z) + (s.poleH || 5.6) - s.h / 2 : ground(s.x, s.z) + s.y;
    const fit = fitInside(s.w, s.h, LOGO_ASPECT);
    // 로고가 파란 판보다 관찰자 쪽에 있고, 둘 다 기둥(반지름 0.16) 앞에 있다.
    const front = pushFace(pos, uv, idx, s.x, y, s.z, s.yaw, faceCorners({ w: fit.w, h: fit.h, cell: seq[0], cols, back: false, z: 0.28 }));
    const back = pushFace(pos, uv, idx, s.x, y, s.z, s.yaw, faceCorners({ w: fit.w, h: fit.h, cell: seq[0], cols, back: true, z: 0.28 }));
    pushFace(fpos, null, fidx, s.x, y, s.z, s.yaw, faceCorners({ w: s.w, h: s.h, cell: 0, cols, back: false, z: 0.2 }));
    pushFace(fpos, null, fidx, s.x, y, s.z, s.yaw, faceCorners({ w: s.w, h: s.h, cell: 0, cols, back: true, z: 0.2 }));
    anim.push({ front, back, seq, cell: seq[0] });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'gangnamScreens';
  mesh.visible = false;
  const frameGeo = new THREE.BufferGeometry();
  frameGeo.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  frameGeo.setIndex(fidx);
  frameGeo.computeBoundingSphere();
  const frameMat = new THREE.MeshBasicMaterial({ color: '#0072DD', toneMapped: false, side: THREE.FrontSide });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.name = 'gangnamScreenFrames';
  frame.visible = false;
  root.add(frame, mesh);

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
  const setPair = (a, cell) => {
    const frontC = faceCorners({ w: 1, h: 1, cell, cols, back: false });
    const backC = faceCorners({ w: 1, h: 1, cell, cols, back: true });
    for (let i = 0; i < 4; i++) {
      uvAttr.setXY(a.front + i, frontC[i].u, frontC[i].v);
      uvAttr.setXY(a.back + i, backC[i].u, backC[i].v);
    }
  };
  return {
    root,
    screens: list,
    stats: { screens: list.length, poles: poles.length, mobile, atlas: `${canvas.width}x${canvas.height}` },
    update(dt, x, z) {
      const on = x >= box.x0 - 800 && x <= box.x1 + 800 && z >= box.z0 - 800 && z <= box.z1 + 800;
      if (on !== shown) {
        shown = on;
        mesh.visible = on;
        frame.visible = on;
        if (poleMesh) poleMesh.visible = on;
      }
      if (!on || mobile) return;
      acc += dt;
      const step = Math.floor(acc / FRAME_SEC);
      let dirty = false;
      for (const a of anim) {
        const cell = a.seq[step % a.seq.length];
        if (cell !== a.cell) { a.cell = cell; setPair(a, cell); dirty = true; }
      }
      if (dirty) uvAttr.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      tex.dispose();
      frameGeo.dispose();
      frameMat.dispose();
      poleMesh?.geometry.dispose();
      poleMesh?.material.dispose();
      scene.remove(root);
    },
  };
}
