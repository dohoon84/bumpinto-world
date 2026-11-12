// [depot-story v0.5] 자리 표시 소품·그림 (모두 코드로 그림, 진짜 브랜드 없음):
//   주먹밥 쟁반(E13, 카트 위 테두리에 얹힘) · 노란 '반값' 스티커(E14, 진열대 위 표지 + 담은 상품에 붙음, 구석에 작은 빗자루)
//   보라 모자 실루엣(2일차 끝 유리문 컷 · 3일차 미리보기) · 다음 날 미리보기 그림(4일차: 보들범 탑 + 꼬마 실루엣).
export function stickerCanvas(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), s = size / 128;
  g.save(); g.translate(64 * s, 64 * s); g.rotate(-0.18);
  g.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = (i % 2 ? 54 : 60) * s; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
  g.fillStyle = '#F2D21E'; g.fill(); g.lineWidth = 4 * s; g.strokeStyle = '#B8860B'; g.stroke();
  g.fillStyle = '#C0281E'; g.font = `900 ${34 * s}px Pretendard, "Noto Sans KR", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('반값', 0, -4 * s);
  g.font = `800 ${13 * s}px Pretendard, sans-serif`; g.fillStyle = '#5a3a00'; g.fillText('HALF', 0, 22 * s);
  // 작은 빗자루 (복선)
  g.translate(30 * s, 30 * s); g.rotate(0.6); g.fillStyle = '#6b4a2a'; g.fillRect(-1.5 * s, -14 * s, 3 * s, 16 * s); g.fillStyle = '#7a5a2a'; g.beginPath(); g.moveTo(-6 * s, 2 * s); g.lineTo(6 * s, 2 * s); g.lineTo(8 * s, 11 * s); g.lineTo(-8 * s, 11 * s); g.closePath(); g.fill();
  g.restore(); return c;
}
/** 보라 모자 실루엣 (유리문 너머) — 얼굴·이름 없음 */
export function spySilhouette(w = 480, h = 300, { door = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#24364a'); bg.addColorStop(1, '#0f1a26'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  // 바깥 주차장 불빛
  for (let i = 0; i < 7; i++) { g.fillStyle = `rgba(255,214,120,${0.12 + (i % 3) * 0.05})`; g.beginPath(); g.arc(30 + i * 70, h * 0.32 + (i % 2) * 12, 6 + (i % 3) * 3, 0, Math.PI * 2); g.fill(); }
  const cx = w * 0.56, base = h;
  g.fillStyle = '#05080c';
  g.beginPath(); g.moveTo(cx - 80, base); g.quadraticCurveTo(cx - 74, h * 0.6, cx - 40, h * 0.55); g.lineTo(cx + 40, h * 0.55); g.quadraticCurveTo(cx + 74, h * 0.6, cx + 80, base); g.closePath(); g.fill(); // 코트 어깨
  g.beginPath(); g.ellipse(cx, h * 0.44, 30, 36, 0, 0, Math.PI * 2); g.fill(); // 머리
  g.fillStyle = '#6B4FA0'; g.beginPath(); g.ellipse(cx, h * 0.355, 34, 17, 0, Math.PI, 0); g.fill(); g.fillRect(cx - 2, h * 0.35, 54, 7); // 보라 모자 + 챙
  g.fillStyle = 'rgba(160,200,255,.85)'; g.fillRect(cx - 18, h * 0.43, 12, 4); g.fillRect(cx + 4, h * 0.43, 12, 4); // 선글라스 반짝
  g.fillStyle = '#F2D21E'; g.save(); g.translate(cx + 66, h * 0.86); g.rotate(-0.3); g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill(); g.restore(); // 손에 든 노란 스티커
  if (door) { // 유리문 틀 + 반사
    g.strokeStyle = '#8aa0b4'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.lineWidth = 7; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.moveTo(40, 0); g.lineTo(120, 0); g.lineTo(20, h); g.lineTo(-60, h); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(243,234,218,.9)'; g.font = '800 18px Pretendard, sans-serif'; g.fillText('???', 18, h - 20);
  return c;
}
export function nextDayArt(day) {
  if (day === 3) return spySilhouette(480, 280, { door: false });
  const w = 480, h = 280, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#1d3a2f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e9e4d8'; for (let r = 0; r < 6; r++) for (let k = 0; k < 6 - r; k++) { g.fillRect(140 + k * 36 + r * 18, h - 40 - r * 34, 32, 30); } // 보들범 탑
  g.save(); g.translate(150, 70); g.rotate(-0.5); g.fillRect(0, 0, 32, 30); g.restore(); // 떨어지는 롤
  g.fillStyle = '#05080c'; g.beginPath(); g.ellipse(380, h - 118, 16, 18, 0, 0, Math.PI * 2); g.fill(); g.fillRect(366, h - 100, 28, 62); g.fillRect(368, h - 40, 9, 30); g.fillRect(383, h - 40, 9, 30); // 꼬마 실루엣
  g.fillStyle = 'rgba(243,234,218,.9)'; g.font = '800 18px Pretendard, sans-serif'; g.fillText(`${day}일차 · ???`, 18, h - 20);
  return c;
}

/** 3D 소품: 주먹밥 쟁반 · 진열대 스티커 표지 · 담은 상품 스티커 */
export function createProps({ THREE, scene, keep, cartObj, items }) {
  let tray = null, trayFloor = null;
  function buildTray() {
    const gp = new THREE.Group(); gp.name = 'story-riceball-tray';
    const base = new THREE.Mesh(keep(new THREE.BoxGeometry(0.42, 0.03, 0.3)), keep(new THREE.MeshLambertMaterial({ color: 0x9fd8c0 })));
    gp.add(base);
    const rice = keep(new THREE.MeshLambertMaterial({ color: 0xf6f3ea })), nori = keep(new THREE.MeshLambertMaterial({ color: 0x1f2a22 }));
    const ball = keep(new THREE.ConeGeometry(0.055, 0.085, 3)), band = keep(new THREE.BoxGeometry(0.05, 0.035, 0.012));
    for (let i = 0; i < 6; i++) { const x = -0.13 + (i % 3) * 0.13, z = i < 3 ? -0.065 : 0.065; const b = new THREE.Mesh(ball, rice); b.position.set(x, 0.058, z); b.rotation.y = Math.PI / 6 + (i % 2) * 0.2; gp.add(b); const nb = new THREE.Mesh(band, nori); nb.position.set(x, 0.04, z + 0.04); gp.add(nb); }
    const film = new THREE.Mesh(keep(new THREE.BoxGeometry(0.43, 0.11, 0.31)), keep(new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })));
    film.position.y = 0.06; gp.add(film);
    return gp;
  }
  const stT = keep(new THREE.CanvasTexture(stickerCanvas(128))); stT.colorSpace = THREE.SRGBColorSpace;
  const stM = keep(new THREE.SpriteMaterial({ map: stT, depthWrite: false }));
  const shelf = [];
  const onItem = new Map();
  return {
    tray(on, fell = false) {
      if (on) { tray ||= buildTray(); tray.position.set(0, 1.0, 0.25); cartObj.add(tray); tray.visible = true; if (trayFloor) { trayFloor.removeFromParent(); trayFloor = null; } return; }
      if (!tray) return;
      if (fell) { tray.removeFromParent(); const wp = cartObj.localToWorld(new THREE.Vector3(0.5, 0, -0.4)); tray.position.set(wp.x, 0.02, wp.z); tray.rotation.set(0, 0.6, 0.12); scene.add(tray); trayFloor = tray; tray = null; setTimeout(() => { trayFloor?.removeFromParent(); trayFloor = null; }, 20000); }
      else { tray.removeFromParent(); }
    },
    trayOn: () => !!tray && tray.parent === cartObj,
    /** 진열대 위 스티커 표지 (null 이면 치움) */
    shelfStickers(list) {
      for (const s of shelf) s.removeFromParent(); shelf.length = 0;
      for (const t of list || []) { if (!t) continue; const s = new THREE.Sprite(stM); s.scale.set(0.55, 0.55, 1); s.position.set(t.x, 1.75, t.z); s.name = 'story-sticker'; scene.add(s); shelf.push(s); }
    },
    hideShelfSticker(i) { if (shelf[i]) shelf[i].visible = false; },
    /** 담은 상품에 스티커 붙이기 */
    stick(it) { if (!it?.mesh || onItem.has(it)) return; const s = new THREE.Sprite(stM); s.scale.set(0.16, 0.16, 1); s.position.set(0, 0.12, 0); it.mesh.add(s); onItem.set(it, s); },
    stuck: (it) => onItem.has(it),
    clearStick() { for (const s of onItem.values()) s.removeFromParent(); onItem.clear(); },
    dispose() { this.shelfStickers(null); this.clearStick(); tray?.removeFromParent(); trayFloor?.removeFromParent(); },
    _items: items,
  };
}
