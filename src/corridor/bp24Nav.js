// [bp24nav] BUMP24 길찾기. ?bp24nav=0 이면 아이콘·이름표·표지·이정표를 만들지 않는다.
//   지도 아이콘은 지금 세계에 있는 매장(BP24_PLACEMENTS 중 켜진 것)마다. 정자점만 이름표·멀리 보이는 표지·이정표.
//   아이콘을 누르면 기존 미니맵 경로(bw:nav-route)로 문 앞(?at=bump24-jeongja 와 같은 문 좌표)까지 선을 긋는다.
import * as THREE from 'three';
import { allBp24Stores, drawLogo } from './bp24.js';
import { bp24NavOn } from './bp24Locations.js';

const JEONGJA = 'bump24-jeongja';

export function findSignSpot(isBlocked, onRoad, anchor, goal, side = 3.4) {
  const dx = goal.x - anchor.x, dz = goal.z - anchor.z;
  const L = Math.hypot(dx, dz) || 1;
  const fx = dx / L, fz = dz / L;
  const rx = fz, rz = -fx;
  for (const s of [side, -side, side * 1.7, -side * 1.7]) {
    for (const f of [8, 12, 5, 16]) {
      const x = anchor.x + fx * f + rx * s;
      const z = anchor.z + fz * f + rz * s;
      if (!isBlocked(x, z, 0.5) && !onRoad(x, z)) return { x, z, fx, fz, face: s > 0 ? -1 : 1 };
    }
  }
  return null;
}

function logoCanvas(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  drawLogo(g, size * 0.06, size * 0.06, size * 0.88);
  return c;
}

function pinCanvas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 168;
  const g = c.getContext('2d');
  g.beginPath();
  g.moveTo(64, 160); g.lineTo(40, 78); g.lineTo(88, 78); g.closePath();
  g.fillStyle = '#0072DD'; g.fill();
  g.beginPath(); g.arc(64, 58, 46, 0, Math.PI * 2);
  g.fillStyle = '#ffffff'; g.fill();
  drawLogo(g, 26, 20, 76);
  return c;
}

function signCanvas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#0d1a33'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#1b2433'; g.fillRect(0, 128, 512, 32);
  drawLogo(g, 16, 28, 72);
  g.font = '900 46px "Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff'; g.fillText('BUMP24', 104, 46);
  g.font = '800 36px "Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  g.fillStyle = '#ffe169'; g.fillText('←  편의점', 104, 96);
  return c;
}

function buildSigns(spots, terrain) {
  const tex = new THREE.CanvasTexture(signCanvas());
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const pos = [], uv = [], idx = [];
  const push = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, u0, v0, u1, v1) => {
    const k = pos.length / 3;
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  };
  const placed = [];
  for (const s of spots) {
    const y = terrain ? terrain.getGroundHeight(s.x, s.z, 0) : 0;
    const fx = s.fx, fz = s.fz;
    const zx = -fz * s.face, zz = fx * s.face;
    const hw = 1.15, hh = 0.38, t = 0.045, cy = y + 2.05;
    const p = (lx, ly, lz) => [s.x + fx * lx + zx * lz, ly, s.z + fz * lx + zz * lz];
    const a = p(-hw, cy - hh, t), b = p(hw, cy - hh, t), c = p(hw, cy + hh, t), d = p(-hw, cy + hh, t);
    push(...a, ...b, ...c, ...d, 0, 0.22, 1, 1);
    const e = p(hw, cy - hh, -t), f = p(-hw, cy - hh, -t), gq = p(-hw, cy + hh, -t), h = p(hw, cy + hh, -t);
    push(...e, ...f, ...gq, ...h, 1, 0.22, 0, 1);
    const pw = 0.07;
    const A = p(-pw, y, -pw), B = p(pw, y, -pw), C = p(pw, y + 1.62, -pw), D = p(-pw, y + 1.62, -pw);
    push(...A, ...B, ...C, ...D, 0, 0, 0.15, 0.18);
    placed.push({ x: s.x, z: s.z });
  }
  if (!idx.length) { tex.dispose(); return null; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  mesh.name = 'bp24NavSigns';
  mesh.frustumCulled = true;
  return { mesh, placed };
}

export function mountBp24Nav({ scene, overlay, world, getExits, station, getPlayer, terrain, search } = {}) {
  if (!bp24NavOn(search)) return null;
  const logo = logoCanvas();
  const pinTex = new THREE.CanvasTexture(pinCanvas());
  pinTex.colorSpace = THREE.SRGBColorSpace;
  const pins = [];
  let label = null;
  let signs = null;
  let guide = null;
  let hint = null;

  function points() {
    const out = [];
    try {
      for (const st of allBp24Stores()) {
        if (!st?.door) continue;
        out.push({ id: st.id, name: st.name || 'BUMP24', x: st.door[0], z: st.door[1] });
      }
    } catch { /* 매장이 아직 없으면 빈 목록 */ }
    return out;
  }
  function jeongja() { return points().find((p) => p.id === JEONGJA) || null; }

  const spot = jeongja();
  if (spot && scene) {
    const mat = new THREE.SpriteMaterial({ map: pinTex, transparent: true, depthWrite: false, depthTest: false });
    const spr = new THREE.Sprite(mat);
    spr.name = 'bp24NavPin';
    spr.renderOrder = 4;
    spr.center.set(0.5, 0.06);
    spr.scale.set(5.2, 6.8, 1);
    spr.position.set(spot.x + 1.6, 11.2, spot.z);
    scene.add(spr);
    pins.push(spr);
    if (overlay) {
      label = overlay.add({
        cls: 'label shop',
        text: 'BUMP24 정자점',
        getPos: () => new THREE.Vector3(spot.x, 7.2, spot.z),
        maxDist: 220,
        minDist: 0,
      });
    }
  }

  if (spot && scene && world) {
    const blocked = (x, z, r) => { try { return world.isBlocked(x, z, r); } catch { return false; } };
    const road = (x, z) => { try { return world.onRoad(x, z); } catch { return false; } };
    const anchors = [];
    const exits = getExits?.() || [];
    const ex6 = exits.find((e) => String(e.ref) === '6');
    if (ex6) anchors.push(ex6);
    if (station) anchors.push({ x: (station.x || 0) + 18, z: (station.z || 0) + 8 });
    const spots = [];
    for (const a of anchors) {
      const s = findSignSpot(blocked, road, a, spot);
      if (!s) continue;
      const n = { ...s, z: s.z + 2.4 };
      spots.push(!blocked(n.x, n.z, 0.45) && !road(n.x, n.z) ? n : s);
    }
    signs = buildSigns(spots, terrain);
    if (signs) scene.add(signs.mesh);
  }

  function showHint(name) {
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'bp24-nav-hint';
      hint.style.cssText = 'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:30;padding:8px 14px;border-radius:16px;background:rgba(10,22,48,.9);color:#fff;font:800 14px/1.3 Pretendard,"Apple SD Gothic Neo",sans-serif;pointer-events:none;white-space:nowrap';
      document.body.appendChild(hint);
    }
    hint.textContent = `${name} 쪽으로 안내 중`;
    hint.hidden = false;
  }
  function hideHint() { if (hint) hint.hidden = true; }

  function guideTo(id) {
    const st = points().find((p) => p.id === id) || jeongja();
    if (!st) return false;
    const p = getPlayer?.()?.position;
    const from = p ? [p.x, p.z] : [st.x, st.z + 20];
    guide = { id: st.id, x: st.x, z: st.z, name: st.name, from };
    dispatchEvent(new CustomEvent('bw:nav-route', { detail: { points: [from, [st.x, st.z]], dest: { x: st.x, z: st.z, label: st.name } } }));
    showHint(st.name);
    return true;
  }

  let acc = 0;
  function update(dt = 0.016) {
    const t = performance.now() / 1000;
    for (const s of pins) s.position.y = 11.2 + Math.sin(t * 2.1) * 0.35;
    if (!guide) return;
    const p = getPlayer?.()?.position;
    if (!p) return;
    if (Math.hypot(p.x - guide.x, p.z - guide.z) < 4) {
      guide = null; hideHint();
      dispatchEvent(new CustomEvent('bw:nav-route', { detail: null }));
      return;
    }
    acc += dt;
    if (acc < 0.6) return;
    acc = 0;
    if (Math.hypot(p.x - guide.from[0], p.z - guide.from[1]) < 3) return;
    guide.from = [p.x, p.z];
    dispatchEvent(new CustomEvent('bw:nav-route', { detail: { points: [guide.from, [guide.x, guide.z]], dest: { x: guide.x, z: guide.z, label: guide.name } } }));
  }

  return {
    on: true,
    logo,
    points,
    signs: () => signs?.placed || [],
    guide: guideTo,
    get guiding() { return guide; },
    update,
    dispose() {
      for (const s of pins) { s.material.map?.dispose(); s.material.dispose(); s.removeFromParent(); }
      if (label && overlay) overlay.remove(label);
      if (signs) { signs.mesh.geometry.dispose(); signs.mesh.material.map?.dispose(); signs.mesh.material.dispose(); signs.mesh.removeFromParent(); }
      hint?.remove();
    },
  };
}
