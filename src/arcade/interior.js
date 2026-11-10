// [arcade] 오락실 내부 — 따뜻한 큐트 네온 + 오락기 여러 대 + 인형뽑기 + 랭킹보드
import * as THREE from 'three';
import { createAvatar } from '../entities/avatar.js';

export function buildArcadeInterior({ renderer = null, storeName = 'BUMP 오락실' } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a1548');
  scene.fog = new THREE.FogExp2(0x2a1548, 0.028);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
  camera.position.set(0.4, 1.7, 4.8);
  camera.lookAt(-0.3, 1.2, -0.8);

  const hemi = new THREE.HemisphereLight(0xffe0f0, 0x3a2060, 1.15);
  scene.add(hemi);
  const key = new THREE.PointLight(0xfff0d0, 2.2, 18, 2); key.position.set(0, 2.8, 1.2); scene.add(key);
  const fill = new THREE.PointLight(0xffffff, 0.7, 20, 2); fill.position.set(0, 2.0, 3.5); scene.add(fill);
  const pink = new THREE.PointLight(0xff66aa, 1.8, 14, 2); pink.position.set(-2.2, 2.3, -0.5); scene.add(pink);
  const blue = new THREE.PointLight(0x6ea8ff, 1.6, 14, 2); blue.position.set(2.2, 2.3, -0.5); scene.add(blue);

  // checker floor — warm pastel
  const floorCanvas = document.createElement('canvas'); floorCanvas.width = 256; floorCanvas.height = 256;
  const fctx = floorCanvas.getContext('2d');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    fctx.fillStyle = (x + y) % 2 ? '#2a1840' : '#1a1030';
    fctx.fillRect(x * 32, y * 32, 32, 32);
  }
  // soft glow dots
  fctx.fillStyle = 'rgba(255,150,200,0.15)';
  for (let i = 0; i < 20; i++) fctx.fillRect((i * 37) % 256, (i * 53) % 256, 6, 6);
  const floorTex = new THREE.CanvasTexture(floorCanvas);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(4, 3);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 9),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.65, metalness: 0.15 }),
  );
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: '#3a2460', roughness: 0.8 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.4), wallMat); back.position.set(0, 1.7, -3.4); scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), wallMat); left.position.set(-5.5, 1.7, 0); left.rotation.y = Math.PI / 2; scene.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), wallMat); right.position.set(5.5, 1.7, 0); right.rotation.y = -Math.PI / 2; scene.add(right);

  // neon strips
  const strips = [];
  for (const [z, col] of [[-1.2, '#ff66aa'], [0.4, '#7eb6ff'], [2.0, '#ffe66d']]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.06, 0.18),
      new THREE.MeshBasicMaterial({ color: col }),
    );
    strip.position.set(0, 3.1, z); scene.add(strip); strips.push(strip);
  }

  // wall posters (cute abstract blobs)
  for (const [x, col] of [[-3.5, '#ff9ecd'], [3.5, '#7eb6ff']]) {
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.6),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.7 }),
    );
    p.position.set(x, 1.6, -3.35); scene.add(p);
  }

  const title = makeSign(storeName, '#1a1030', '#ffe66d');
  title.position.set(0, 2.65, -3.3); scene.add(title);

  const cabinets = [];
  const specs = [
    { id: 'rhythm', label: '리듬팡', color: '#ff9ecd', x: -3.3, playable: false },
    { id: 'soon', label: '곧 공개', color: '#556', x: -1.65, playable: false },
    { id: 'bumpingpang', label: '범핑팡', color: '#7eb6ff', x: 0, playable: true },
    { id: 'soon2', label: '준비중', color: '#556', x: 1.65, playable: false },
    { id: 'puzzle', label: '퍼즐팡', color: '#3ddc97', x: 3.3, playable: false },
  ];
  for (const s of specs) {
    const cab = makeCabinet(s);
    cab.position.set(s.x, 0, -1.7);
    scene.add(cab);
    cabinets.push({ id: s.id, playable: s.playable, label: s.label, root: cab, screen: cab.userData.screen });
  }

  // claw machine (cute prop, not playable)
  const claw = makeClawMachine();
  claw.position.set(-3.6, 0, 0.9); claw.rotation.y = 0.45; scene.add(claw);

  // ranking kiosk — 오른쪽 벽 쪽, 오락기(z=-1.7)와 가운데 통로를 가리지 않게
  const board = makeRankKiosk();
  board.position.set(4.05, 0, 0.95);
  board.rotation.y = -0.95;
  scene.add(board);
  const boardGlow = new THREE.PointLight(0xffe66d, 1.4, 5.8, 2); boardGlow.position.set(3.65, 1.55, 1.4); scene.add(boardGlow);

  // plush pile near claw
  for (let i = 0; i < 5; i++) {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 + (i % 3) * 0.03, 12, 12),
      new THREE.MeshStandardMaterial({
        color: ['#ff6b9d', '#7eb6ff', '#ffe66d', '#3ddc97', '#c084fc'][i],
        roughness: 0.8,
      }),
    );
    ball.position.set(-4.0 + (i % 3) * 0.2, 0.12, 1.1 + Math.floor(i / 3) * 0.2);
    scene.add(ball);
  }

  const me = createAvatar({ color: '#7eb6ff' });
  me.position.set(0, 0, 1.35);
  me.rotation.y = Math.PI;
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
          if (Array.isArray(o.material)) o.material.forEach((m) => { m.map?.dispose?.(); m.dispose?.(); });
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
        if (mat?.emissive) mat.emissiveIntensity = 0.6 + Math.sin(t * 3.2) * 0.3;
      }
      strips.forEach((s, i) => {
        const h = (t * 0.05 + i * 0.2) % 1;
        s.material.color.setHSL(h, 0.7, 0.65);
      });
      if (board.userData.screen?.material) {
        board.userData.screen.material.emissiveIntensity = 0.2 + Math.sin(t * 2.4) * 0.06;
      }
    },
    pickCabinet(raycaster) {
      const screens = cabinets.map((c) => c.screen).filter(Boolean);
      const hits = raycaster.intersectObjects(screens, false);
      if (!hits.length) return null;
      return cabinets.find((c) => c.screen === hits[0].object) || null;
    },
    pickBoard(raycaster) {
      const targets = [];
      board.traverse((o) => { if (o.isMesh) targets.push(o); });
      const hits = raycaster.intersectObjects(targets, false);
      return hits.length > 0;
    },
  };
}

function makeRankScreenTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 288;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 288);
  bg.addColorStop(0, '#2a1848');
  bg.addColorStop(1, '#1a1030');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 288);
  ctx.fillStyle = '#ffe66d';
  ctx.font = '900 38px Pretendard,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('랭킹', 128, 42);
  ctx.fillStyle = '#ffd6ee';
  ctx.font = '700 16px Pretendard,sans-serif';
  ctx.fillText('범핑팡 · 범편의점', 128, 76);
  const medals = ['#ffe66d', '#e8e8f0', '#e0a878'];
  for (let i = 0; i < 3; i++) {
    const y = 104 + i * 44;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRectPath(ctx, 22, y, 212, 36, 12); ctx.fill();
    ctx.fillStyle = medals[i];
    ctx.beginPath(); ctx.arc(48, y + 18, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1030';
    ctx.font = '900 16px Pretendard,sans-serif';
    ctx.fillText(String(i + 1), 48, y + 19);
    ctx.fillStyle = 'rgba(255,230,109,0.38)';
    roundRectPath(ctx, 70, y + 12, 148 - i * 22, 12, 6); ctx.fill();
  }
  ctx.fillStyle = '#ffe66d';
  ctx.font = '800 18px Pretendard,sans-serif';
  ctx.fillText('일 · 주 · 월', 128, 258);
  return new THREE.CanvasTexture(c);
}

function makeRankKiosk() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.74, 0.8, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: '#2a1840', roughness: 0.55, metalness: 0.22 }),
  );
  plate.position.y = 0.04; g.add(plate);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 1.72, 0.48),
    new THREE.MeshStandardMaterial({ color: '#4a2a78', roughness: 0.38, metalness: 0.32 }),
  );
  body.position.y = 0.94; g.add(body);
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 0.08, 0.52),
    new THREE.MeshBasicMaterial({ color: '#ffe66d' }),
  );
  trim.position.y = 1.8; g.add(trim);
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 1.14, 0.06),
    new THREE.MeshStandardMaterial({ color: '#1a1030', roughness: 0.42 }),
  );
  bezel.position.set(0, 1.16, 0.24); g.add(bezel);
  const screenTex = makeRankScreenTex();
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 1.02),
    new THREE.MeshStandardMaterial({
      map: screenTex,
      emissive: '#ffffff',
      emissiveMap: screenTex,
      emissiveIntensity: 0.22,
      roughness: 0.32,
    }),
  );
  screen.position.set(0, 1.16, 0.276); g.add(screen);
  const sign = makeSign('랭킹 보기', '#1a1030', '#ffe66d');
  sign.position.set(0, 2.06, 0.16); sign.scale.set(0.6, 0.5, 0.6); g.add(sign);
  const prompt = makeSign('탭하여 보기', '#1a1030', '#ff9ecd');
  prompt.position.set(0, 0.4, 0.28); prompt.scale.set(0.44, 0.32, 0.44); g.add(prompt);
  g.userData.screen = screen;
  return g;
}

function makeCabinet({ label, color, playable }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.25, 1.75, 0.9),
    new THREE.MeshStandardMaterial({ color: playable ? '#4a2a78' : '#352050', roughness: 0.35, metalness: 0.35 }),
  );
  body.position.y = 0.88; g.add(body);

  // side accent
  const accent = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 0.08, 0.92),
    new THREE.MeshBasicMaterial({ color: playable ? color : '#333' }),
  );
  accent.position.y = 1.72; g.add(accent);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 0.72),
    new THREE.MeshStandardMaterial({
      color: playable ? color : '#222',
      emissive: playable ? color : '#000',
      emissiveIntensity: playable ? 0.75 : 0,
      roughness: 0.35,
    }),
  );
  screen.position.set(0, 1.28, 0.46); g.add(screen);
  g.userData.screen = screen;

  const marquee = makeSign(label, playable ? '#1a1030' : '#888', playable ? color : '#2a3144');
  marquee.position.set(0, 1.9, 0.22); marquee.scale.set(0.5, 0.42, 0.5); g.add(marquee);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.38, 0.55),
    new THREE.MeshStandardMaterial({ color: '#120c1c', roughness: 0.55 }),
  );
  panel.position.set(0, 0.55, 0.38); g.add(panel);
  if (playable) {
    const btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: '#ff6b9d', emissive: '#ff6b9d', emissiveIntensity: 0.6 }),
    );
    btn.rotation.x = Math.PI / 2; btn.position.set(-0.28, 0.72, 0.5); g.add(btn);
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10),
      new THREE.MeshStandardMaterial({ color: '#ffe66d' }),
    );
    stick.position.set(0.28, 0.8, 0.42); g.add(stick);
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 12),
      new THREE.MeshStandardMaterial({ color: '#ff6b9d', emissive: '#ff6b9d', emissiveIntensity: 0.3 }),
    );
    ball.position.set(0.28, 0.92, 0.42); g.add(ball);
  }
  return g;
}

function makeClawMachine() {
  const g = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({ color: '#a8e0ff', transparent: true, opacity: 0.35, roughness: 0.2, metalness: 0.1 });
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 1.8, 1.0),
    new THREE.MeshStandardMaterial({ color: '#ff6b9d', roughness: 0.45, metalness: 0.3 }),
  );
  frame.position.y = 0.95; g.add(frame);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.85), glassMat);
  glass.position.y = 1.25; g.add(glass);
  // prizes inside
  for (let i = 0; i < 6; i++) {
    const prize = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 10),
      new THREE.MeshStandardMaterial({ color: ['#7eb6ff', '#ffe66d', '#3ddc97', '#c084fc', '#ff9ecd', '#ffd24a'][i], roughness: 0.7 }),
    );
    prize.position.set(-0.25 + (i % 3) * 0.25, 0.55 + Math.floor(i / 3) * 0.2, 0.1);
    g.add(prize);
  }
  const sign = makeSign('인형뽑기', '#1a1030', '#ffe66d');
  sign.position.set(0, 2.0, 0.2); sign.scale.set(0.4, 0.35, 0.4); g.add(sign);
  return g;
}

function makeSign(text, fg, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  // rounded bg
  ctx.fillStyle = bg;
  roundRectPath(ctx, 8, 8, 496, 112, 28); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 4;
  roundRectPath(ctx, 8, 8, 496, 112, 28); ctx.stroke();
  ctx.fillStyle = fg; ctx.font = '900 44px Pretendard,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.6),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  return mesh;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
