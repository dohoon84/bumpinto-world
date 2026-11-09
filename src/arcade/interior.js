// [arcade] 오락실 내부 Scene — 네온 바닥 + 오락기 3대(가운데가 범핑팡)
import * as THREE from 'three';
import { createAvatar } from '../entities/avatar.js';

export function buildArcadeInterior({ renderer = null, storeName = 'BUMP 오락실' } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0e1a');
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
  camera.position.set(0, 1.55, 4.2);
  camera.lookAt(0, 1.2, 0);

  const hemi = new THREE.HemisphereLight(0x9eb7ff, 0x1a1020, 0.85);
  scene.add(hemi);
  const key = new THREE.PointLight(0x6ea8ff, 1.4, 14, 2); key.position.set(0, 2.6, 1); scene.add(key);
  const neon = new THREE.PointLight(0xff66aa, 0.9, 10, 2); neon.position.set(-2, 2.2, -1); scene.add(neon);

  // room
  const floorMat = new THREE.MeshStandardMaterial({ color: '#141c2e', roughness: 0.55, metalness: 0.2 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), floorMat);
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  // neon grid
  const grid = new THREE.GridHelper(10, 20, 0x5b8cff, 0x243049);
  grid.position.y = 0.01; scene.add(grid);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#101828', roughness: 0.9 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.2), wallMat); back.position.set(0, 1.6, -3.2); scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.2), wallMat); left.position.set(-5, 1.6, 0); left.rotation.y = Math.PI / 2; scene.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.2), wallMat); right.position.set(5, 1.6, 0); right.rotation.y = -Math.PI / 2; scene.add(right);

  // ceiling neon strip
  const strip = new THREE.Mesh(new THREE.BoxGeometry(8, 0.08, 0.25), new THREE.MeshBasicMaterial({ color: '#5b8cff' }));
  strip.position.set(0, 3.05, -1); scene.add(strip);
  const strip2 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.08, 0.25), new THREE.MeshBasicMaterial({ color: '#ff66aa' }));
  strip2.position.set(0, 3.05, 1); scene.add(strip2);

  // title sign
  const title = makeSign(storeName, '#ffe66d', '#1a1030');
  title.position.set(0, 2.55, -3.1); scene.add(title);

  const cabinets = [];
  const specs = [
    { id: 'soon', label: '곧 공개', color: '#445', x: -2.2, playable: false },
    { id: 'bumpingpang', label: '범핑팡', color: '#5b8cff', x: 0, playable: true },
    { id: 'soon2', label: '준비중', color: '#445', x: 2.2, playable: false },
  ];
  for (const s of specs) {
    const cab = makeCabinet(s);
    cab.position.set(s.x, 0, -1.6);
    scene.add(cab);
    cabinets.push({ id: s.id, playable: s.playable, label: s.label, root: cab, screen: cab.userData.screen });
  }

  // ranking board on wall
  const board = makeSign('범핑팡 랭킹 · R', '#fff', '#152238');
  board.position.set(3.2, 1.8, -3.05); board.scale.set(0.7, 0.7, 0.7); scene.add(board);

  // 이름표·말풍선이 selfInterior.player 를 보므로 아바타를 둔다 (오락실에선 서 있기만)
  const me = createAvatar({ color: '#5b8cff' });
  me.position.set(0, 0, 1.2);
  me.rotation.y = Math.PI; // 오락기 쪽을 봄
  me.userData.jumpY = 0;
  me.userData.sit = '';
  scene.add(me);

  const clock = new THREE.Clock();
  return {
    scene, camera, player: me, cabinets, board,
    dispose() {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.map?.dispose?.() || m.dispose?.());
          else { o.material.map?.dispose?.(); o.material.dispose?.(); }
        }
      });
    },
    resize(w, h) { camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); },
    tick() {
      const t = clock.getElapsedTime();
      for (const c of cabinets) {
        if (!c.playable) continue;
        const mat = c.screen?.material;
        if (mat?.emissive) mat.emissiveIntensity = 0.55 + Math.sin(t * 3) * 0.25;
      }
      strip.material.color.offsetHSL(0.0008, 0, 0);
    },
    pickCabinet(raycaster) {
      const screens = cabinets.map((c) => c.screen).filter(Boolean);
      const hits = raycaster.intersectObjects(screens, false);
      if (!hits.length) return null;
      return cabinets.find((c) => c.screen === hits[0].object) || null;
    },
  };
}

function makeCabinet({ label, color, playable }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.7, 0.85),
    new THREE.MeshStandardMaterial({ color: '#1a2236', roughness: 0.45, metalness: 0.35 }),
  );
  body.position.y = 0.85; g.add(body);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.05, 0.75),
    new THREE.MeshStandardMaterial({
      color: playable ? color : '#222',
      emissive: playable ? color : '#000',
      emissiveIntensity: playable ? 0.7 : 0,
      roughness: 0.4,
    }),
  );
  screen.position.set(0, 1.25, 0.43); g.add(screen);
  g.userData.screen = screen;

  const marquee = makeSign(label, playable ? '#0a1220' : '#888', playable ? color : '#2a3144');
  marquee.position.set(0, 1.85, 0.2); marquee.scale.set(0.55, 0.45, 0.55); g.add(marquee);

  // control panel
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.35, 0.5),
    new THREE.MeshStandardMaterial({ color: '#0e1524', roughness: 0.6 }),
  );
  panel.position.set(0, 0.55, 0.35); g.add(panel);
  if (playable) {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), new THREE.MeshStandardMaterial({ color: '#ff6b6b', emissive: '#ff6b6b', emissiveIntensity: 0.5 }));
    btn.rotation.x = Math.PI / 2; btn.position.set(-0.25, 0.72, 0.45); g.add(btn);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 10), new THREE.MeshStandardMaterial({ color: '#ddd' }));
    stick.position.set(0.25, 0.78, 0.4); g.add(stick);
  }
  return g;
}

function makeSign(text, fg, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg; ctx.font = '900 48px Pretendard,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  return mesh;
}
