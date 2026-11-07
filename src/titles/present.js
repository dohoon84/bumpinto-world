// [titles] 머리 위 3D 메달. 획득 순간에는 커졌다가, 이후에는 이름표 위에 작게 남는다.
import { titleById } from './catalog.js';
import { gradeOf } from './icons.js';
import { createBadgeMesh, disposeBadge, spinBadge } from './badgeMesh.js';
import { titleLabel } from './nametag.js';
import { tr } from '../i18n.js';

export function createTitleWorld({ THREE, scene, camera, overlay, sound, getAnchor, shown, listRemotes }) {
  const homeScene = scene;
  const homeCam = camera;
  let viewScene = scene;
  let cam = camera;
  const local = new THREE.Group();
  local.visible = false;
  viewScene.add(local);
  let mesh = null;
  let meshId = '';
  let equippedId = '';
  let ceremony = null;
  let onDone = null;
  const v = new THREE.Vector3();
  const banner = overlay.add({
    cls: 'tag tb-pop',
    getPos: () => {
      const a = anchor();
      if (!a) return null;
      return v.set(a.x, a.y + (ceremony ? 1.2 : 0.62), a.z);
    },
    maxDist: 80,
  });
  banner.hidden = true;

  const burstN = 40;
  const burstPos = new Float32Array(burstN * 3);
  const burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
  const burst = new THREE.Points(burstGeo, new THREE.PointsMaterial({
    color: 0xffe169, size: 0.09, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true,
  }));
  burst.visible = false;
  burst.renderOrder = 4;
  viewScene.add(burst);
  const seeds = Array.from({ length: burstN }, (_, i) => ({
    a: (i / burstN) * Math.PI * 2,
    up: 0.4 + (i % 5) * 0.18,
    out: 0.15 + (i % 7) * 0.08,
  }));

  const remotes = new Map();
  function adopt(obj) { if (obj && obj.parent !== viewScene) viewScene.add(obj); }
  function setView(zone, nextScene, nextCam) {
    banner.zone = zone || '';
    viewScene = nextScene || homeScene;
    cam = nextCam || homeCam;
    adopt(local);
    adopt(burst);
    for (const g of remotes.values()) adopt(g);
  }

  function anchor() {
    if (shown && !shown()) return null;
    const a = getAnchor?.();
    if (!a || !Number.isFinite(a.x)) return null;
    return a;
  }
  function useMesh(title, force = false) {
    const grade = gradeOf(title);
    if (!force && meshId === title.id && mesh?.userData.grade === grade) return;
    if (mesh) { local.remove(mesh); disposeBadge(mesh); }
    mesh = createBadgeMesh(THREE, title, 0.36);
    meshId = title.id;
    mesh.userData.grade = grade;
    local.add(mesh);
  }
  function hideLocal() {
    local.visible = false;
    banner.hidden = true;
    burst.visible = false;
  }
  function showBanner(title) {
    banner.hidden = false;
    banner.el.className = `tag tb-pop g-${gradeOf(title)}`;
    banner.el.replaceChildren();
    const k = document.createElement('span');
    k.className = 'tb-pop-k';
    k.textContent = tr('칭호 획득', 'Title earned');
    const n = document.createElement('span');
    n.className = 'tb-pop-name';
    n.textContent = titleLabel(title);
    banner.el.append(k, n);
  }
  function play(title) {
    if (!title) return false;
    ceremony = { title, t0: performance.now() };
    useMesh(title);
    if (mesh?.userData.rays) mesh.userData.rays.visible = true;
    local.visible = true;
    showBanner(title);
    burst.visible = true;
    burst.material.opacity = 1;
    burst.material.color.set(gradeOf(title) === 'legendary' ? 0xffe169 : gradeOf(title) === 'bronze' ? 0xe0b07a : 0xfff3bf);
    sound?.playAcquire(title.grade);
    return true;
  }
  function setEquipped(id) {
    equippedId = id || '';
    if (ceremony) return;
    applyEquipped();
  }
  function applyEquipped() {
    if (!equippedId) { hideLocal(); return; }
    const t = titleById(equippedId);
    if (!t) { hideLocal(); return; }
    useMesh(t);
    if (mesh?.userData.rays) mesh.userData.rays.visible = false;
    local.visible = true;
    banner.hidden = true;
    burst.visible = false;
    local.scale.setScalar(1);
    if (mesh) mesh.rotation.y = 0;
  }
  function finish() {
    const done = ceremony;
    ceremony = null;
    if (mesh?.userData.rays) mesh.userData.rays.visible = false;
    banner.hidden = true;
    burst.visible = false;
    local.scale.setScalar(1);
    if (mesh) mesh.rotation.y = 0;
    applyEquipped();
    onDone?.(done?.title || null);
  }
  function place(yLift, spin, bright) {
    const a = anchor();
    if (!a) { local.visible = false; return; }
    local.visible = true;
    local.position.set(a.x, a.y + yLift, a.z);
    local.quaternion.copy(cam.quaternion);
    if (mesh) mesh.rotation.y = spin;
    spinBadge(mesh, performance.now() / 1000, bright);
    const d = cam.position.distanceTo(local.position);
    if (d > (ceremony ? 80 : 42)) local.visible = false;
  }
  function tickBurst(k) {
    const a = anchor();
    if (!a) return;
    burst.position.set(a.x, a.y + 0.4, a.z);
    const fade = Math.max(0, 1 - k);
    burst.material.opacity = fade;
    for (let i = 0; i < burstN; i++) {
      const s = seeds[i];
      const dist = s.out * (0.2 + k * 2.4);
      burstPos[i * 3] = Math.cos(s.a) * dist;
      burstPos[i * 3 + 1] = s.up * k * 1.4 - k * k * 0.4;
      burstPos[i * 3 + 2] = Math.sin(s.a) * dist;
    }
    burstGeo.attributes.position.needsUpdate = true;
    burst.visible = fade > 0.02;
  }
  function tick() {
    if (ceremony) {
      const t = (performance.now() - ceremony.t0) / 1000;
      if (t < 0.75) {
        const k = t / 0.75;
        const s = 0.15 + easeOutBack(k) * 1.7;
        local.scale.setScalar(s);
        place(0.55 + k * 0.35, t * 6.5, 1.6);
      } else if (t < 4.1) {
        local.scale.setScalar(1.72 + Math.sin(t * 3.2) * 0.05);
        place(0.9, Math.sin(t) * 0.35, 1.3);
      } else if (t < 4.7) {
        const k = (t - 4.1) / 0.6;
        local.scale.setScalar(1.72 + (1 - 1.72) * k);
        place(0.9 - 0.48 * k, 0, 1);
        banner.el.style.opacity = String(1 - k);
      } else {
        banner.el.style.opacity = '';
        finish();
      }
      tickBurst(Math.min(1, ceremony ? (performance.now() - ceremony.t0) / 1400 : 1));
    } else if (equippedId) {
      local.scale.setScalar(1);
      place(0.82, 0, 0.85);
    } else hideLocal();
    tickRemotes();
  }
  function tickRemotes() {
    const list = listRemotes?.() || [];
    const seen = new Set();
    for (const p of list) {
      if (!p.titleId) continue;
      seen.add(p.id);
      let g = remotes.get(p.id);
      if (!g || g.userData.titleId !== p.titleId || g.userData.grade !== gradeOf(titleById(p.titleId) || {})) {
        if (g) { g.parent?.remove(g); disposeBadge(g); }
        const t = titleById(p.titleId);
        if (!t) { remotes.delete(p.id); continue; }
        g = createBadgeMesh(THREE, t, 0.3);
        g.userData.owner = p.id;
        g.userData.grade = gradeOf(t);
        viewScene.add(g);
        remotes.set(p.id, g);
      }
      g.position.set(p.x, (p.tagY || p.y || 0) + 0.82, p.z);
      g.quaternion.copy(cam.quaternion);
      spinBadge(g, performance.now() / 1000, 0.7);
      const d = cam.position.distanceTo(g.position);
      g.visible = d < 42;
    }
    for (const [id, g] of remotes) {
      if (seen.has(id)) continue;
      g.parent?.remove(g);
      disposeBadge(g);
      remotes.delete(id);
    }
  }
  return {
    play, setEquipped, tick, setView,
    refresh() {
      if (ceremony) useMesh(ceremony.title, true);
      else if (equippedId) { const t = titleById(equippedId); if (t) useMesh(t, true); }
      for (const [, g] of remotes) { g.parent?.remove(g); disposeBadge(g); }
      remotes.clear();
    },
    get playing() { return !!ceremony; },
    set onDone(fn) { onDone = fn; },
  };
}

function easeOutBack(k) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2;
}
