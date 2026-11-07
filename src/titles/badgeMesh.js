// [titles] 메달을 얇은 금속 원판 + 테 + 그림으로 세운다. 등급마다 금속·발광·반짝임이 다르다.
import { GRADES } from './catalog.js';
import { gradeOf, paintIcon } from './icons.js';

export function createBadgeMesh(THREE, title, radius = 0.34) {
  const g = GRADES[gradeOf(title)] || GRADES.gold;
  const group = new THREE.Group();
  group.name = `title-badge:${title.id}`;
  group.userData.grade = gradeOf(title);
  const metal = new THREE.MeshStandardMaterial({
    color: new THREE.Color(g.metal),
    metalness: g.metalness,
    roughness: g.roughness,
    emissive: new THREE.Color(g.emissive),
    emissiveIntensity: g.emit,
  });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.96, radius * 0.16, 40), metal);
  disc.rotation.x = Math.PI / 2;
  group.add(disc);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.055, 10, 40),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(g.rim),
      metalness: 1,
      roughness: 0.12,
      emissive: new THREE.Color(g.rim),
      emissiveIntensity: g.rimEmit,
    }),
  );
  group.add(rim);
  const faceCanvas = document.createElement('canvas');
  faceCanvas.width = faceCanvas.height = 256;
  const tex = new THREE.CanvasTexture(faceCanvas);
  paintIcon(faceCanvas.getContext('2d'), title, 256, () => { tex.needsUpdate = true; });
  if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const face = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.9, 40), faceMat);
  face.position.z = radius * 0.09;
  group.add(face);
  const back = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.9, 40), faceMat);
  back.position.z = -radius * 0.09;
  back.rotation.y = Math.PI;
  group.add(back);

  const sparks = [];
  const n = g.sparks;
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(radius * (0.035 + (i % 3) * 0.012), 6, 6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(g.spark), transparent: true, opacity: 0.9 }),
    );
    s.userData.a = (i / n) * Math.PI * 2;
    s.userData.r = radius * (1.15 + (i % 4) * 0.12);
    s.userData.lift = ((i % 5) - 2) * radius * 0.12;
    group.add(s);
    sparks.push(s);
  }
  const rays = new THREE.Group();
  const rayN = group.userData.grade === 'legendary' ? 10 : group.userData.grade === 'bronze' ? 0 : 6;
  for (let i = 0; i < rayN; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 0.08, radius * (group.userData.grade === 'legendary' ? 2.4 : 1.7)),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(g.spark), transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.rotation.z = (i / rayN) * Math.PI;
    rays.add(m);
  }
  rays.visible = false;
  group.add(rays);
  const glint = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 1.3, radius * 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false }),
  );
  glint.position.z = radius * 0.1;
  group.add(glint);

  group.userData.sparks = sparks;
  group.userData.rays = rays;
  group.userData.glint = glint;
  group.userData.radius = radius;
  group.userData.titleId = title.id;
  group.renderOrder = 3;
  return group;
}

export function spinBadge(group, time, bright = 1) {
  if (!group) return;
  const sparks = group.userData.sparks || [];
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    const a = s.userData.a + time * (0.9 + bright * 0.6);
    const r = s.userData.r;
    s.position.set(Math.cos(a) * r, Math.sin(a * 1.4) * r * 0.28 + s.userData.lift, Math.sin(a) * r * 0.22);
    s.material.opacity = 0.35 + 0.65 * Math.abs(Math.sin(time * (2 + bright) + i));
  }
  if (group.userData.rays) group.userData.rays.rotation.z = time * (0.35 + bright);
  if (group.userData.glint) {
    group.userData.glint.material.opacity = (0.12 + 0.4 * Math.max(0, Math.sin(time * 2.4))) * Math.min(1, bright);
    group.userData.glint.rotation.z = -0.6 + Math.sin(time * 0.8) * 0.4;
  }
}

export function disposeBadge(group) {
  const seen = new Set();
  group?.traverse?.((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const map = m.map;
      m.map = null;
      m.dispose();
      if (map && !seen.has(map)) { seen.add(map); map.dispose(); }
    }
  });
}
