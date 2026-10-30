// [corridor] 잠실 랜드마크 그랜드 오픈 이벤트 (월드 쪽). 시각/시계는 ../lotteOpening.js.
//   오픈 전: 타워(근경·원경 LED 포함) 숨김 → 공사 가림막 + 타워 높이(≈555m)의 거대 카운트다운 전광판(캔버스 텍스처, 1초에 한 번 갱신,
//            카메라를 향하는 세로 판 1장 = 드로우콜 1, 안개 무시 + 원거리 평면 밖이면 시선 방향으로 당겨 그려서 복정·송파에서도 보임)
//   오픈 순간(접속 중): 전광판 페이드아웃 → 불꽃(포인트 1개 메시, 가산 혼합) 60초 + 타워가 땅에서 솟아오르는 등장
//   오픈 후 접속: 타워 그대로(오픈 10분 안이면 불꽃 60초)
//   문자에 브랜드 로고/상표 없음 — '잠실 랜드마크 · Grand Opening'
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lotteClock, splitLeft, LOTTE_FIREWORKS_MS, LOTTE_FIREWORKS_WINDOW_MS } from '../lotteOpening.js';

const _wp = new THREE.Vector3(), _cp = new THREE.Vector3(), _sc = new THREE.Vector3(), _m = new THREE.Matrix4(), _r = new THREE.Matrix4();
// anchor(월드 위치) 기준 행렬 → 카메라가 원거리 평면 근처보다 멀면 같은 시선 방향으로 축소 이동(보이는 크기 동일)
let lastFarScale = 1;
function farPlace(out, anchor, camera, yaw = null, boostFrom = 0) {
  lastFarScale = 1;
  _cp.setFromMatrixPosition(camera.matrixWorld);
  out.identity();
  if (yaw != null) out.makeRotationY(yaw);
  out.setPosition(anchor);
  const MAXD = Math.min(4000, camera.far * 0.8), dd = anchor.distanceTo(_cp);
  // 전광판: 멀어질수록 조금 키워서(최대 2.4배) 복정·송파에서도 숫자가 읽히게
  const boost = boostFrom && dd > boostFrom ? Math.min(2.4, Math.sqrt(dd / boostFrom)) : 1;
  if (boost > 1) { out.premultiply(_r.makeTranslation(-anchor.x, -anchor.y, -anchor.z)).premultiply(_m.makeScale(boost, boost, boost)).premultiply(_r.makeTranslation(anchor.x, anchor.y, anchor.z)); }
  if (dd > MAXD) { const s = MAXD / dd; lastFarScale = s; _sc.setScalar(s); _m.makeScale(s, s, s); out.premultiply(_r.makeTranslation(-anchor.x, -anchor.y, -anchor.z)).premultiply(_m); out.setPosition(_wp.copy(_cp).lerp(anchor, s)); }
  return out;
}

function makeBoard(W, H) {
  const cw = 300, ch = Math.round((cw * H) / W);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const font = (w, px) => `${w} ${px}px "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif`;
  let lastKey = '';
  function draw(left, ready) {
    const t = ready ? splitLeft(left) : null;
    const key = t ? `${t.d}|${t.h}|${t.m}|${t.s}` : '--';
    if (key === lastKey) return false;
    lastKey = key;
    const g = ctx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, '#0a1430'); g.addColorStop(1, '#14284d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#ffc857'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, cw - 12, ch - 12);
    ctx.strokeStyle = 'rgba(255,200,87,.35)'; ctx.lineWidth = 2; ctx.strokeRect(18, 18, cw - 36, ch - 36);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let y = 70;
    ctx.fillStyle = '#ffffff'; ctx.font = font(800, 40); ctx.fillText('잠실 랜드마크', cw / 2, y); y += 50;
    ctx.fillText('오픈까지', cw / 2, y); y += 48;
    ctx.fillStyle = '#ffd27a'; ctx.font = font(800, 24); ctx.fillText('JAMSIL LANDMARK', cw / 2, y); y += 30;
    ctx.fillText('GRAND OPENING', cw / 2, y); y += 40;
    ctx.fillStyle = 'rgba(255,200,87,.6)'; ctx.fillRect(40, y, cw - 80, 3); y += 20;
    const rows = [['d', '일', 'DAYS'], ['h', '시간', 'HOURS'], ['m', '분', 'MIN'], ['s', '초', 'SEC']];
    const rowH = (ch - y - 90) / 4;
    for (const [k, ko, en] of rows) {
      const v = t ? String(t[k]).padStart(k === 'd' ? 1 : 2, '0') : '--';
      ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 18;
      ctx.fillStyle = '#fff6dc'; ctx.font = font(900, Math.round(rowH * 0.66)); ctx.fillText(v, cw / 2, y + rowH * 0.4);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#9fc4ff'; ctx.font = font(700, 24); ctx.fillText(`${ko} ${en}`, cw / 2, y + rowH * 0.84);
      y += rowH;
    }
    ctx.fillStyle = 'rgba(255,200,87,.6)'; ctx.fillRect(40, ch - 78, cw - 80, 3);
    ctx.fillStyle = '#ffffff'; ctx.font = font(700, 22); ctx.fillText('2026.11.02 10:30 KST', cw / 2, ch - 46);
    tex.needsUpdate = true;
    return true;
  }
  return { tex, draw };
}

function makeFireworks() {
  const N = 2400, PER = 160;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), alpha = new Float32Array(N), vel = new Float32Array(N * 3), age = new Float32Array(N), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 4 }, uScale: { value: 600 } },
    vertexShader: 'attribute float aAlpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uSize, uScale; void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aAlpha > 0.0 ? clamp(uSize * uScale / -mv.z, 1.5, 36.0) : 0.0; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(vC * vA * (1.0 - r * 3.2), 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const pts = new THREE.Points(geo, mat); pts.name = 'lotte-fireworks'; pts.frustumCulled = false; pts.renderOrder = 3; pts.visible = false;
  const PAL = [[1, 0.25, 0.3], [0.3, 0.6, 1], [1, 0.85, 0.3], [0.5, 1, 0.6], [1, 0.5, 1], [1, 1, 1]];
  let next = 0, cursor = 0, live = 0;
  function burst() {
    const cx = (Math.random() - 0.5) * 420, cz = (Math.random() - 0.5) * 420, cy = 260 + Math.random() * 380;
    const c = PAL[(Math.random() * PAL.length) | 0], c2 = PAL[(Math.random() * PAL.length) | 0], sp = 55 + Math.random() * 35;
    for (let k = 0; k < PER; k++) {
      const i = cursor; cursor = (cursor + 1) % N;
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), v = sp * (0.85 + Math.random() * 0.15);
      pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz;
      vel[i * 3] = Math.cos(a) * s * v; vel[i * 3 + 1] = u * v; vel[i * 3 + 2] = Math.sin(a) * s * v;
      const cc = k % 3 ? c : c2; col[i * 3] = cc[0]; col[i * 3 + 1] = cc[1]; col[i * 3 + 2] = cc[2];
      age[i] = 0; life[i] = 2 + Math.random() * 0.8; alpha[i] = 1;
    }
  }
  function update(dt, active) {
    if (active) { next -= dt; while (next <= 0) { burst(); next += 0.35 + Math.random() * 0.5; } }
    live = 0;
    const drag = Math.pow(0.35, dt);
    for (let i = 0; i < N; i++) {
      if (alpha[i] <= 0) continue;
      age[i] += dt; const f = age[i] / life[i];
      if (f >= 1) { alpha[i] = 0; continue; }
      live++;
      vel[i * 3] *= drag; vel[i * 3 + 1] = vel[i * 3 + 1] * drag - 14 * dt; vel[i * 3 + 2] *= drag;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      alpha[i] = (1 - f) * (f < 0.7 ? 1 : 0.6 + 0.4 * Math.sin(age[i] * 40));
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
    pts.visible = live > 0 || active;
  }
  return { pts, update, get live() { return live; } };
}

export function createLotteEvent({ root, tower, at, rotY = 0, height = 555, halfM = 36, label = null }) {
  const anchor = new THREE.Vector3(at.x, 0, at.z);
  const site = new THREE.Group(); site.name = 'lotte-opening-site'; site.position.copy(anchor); site.rotation.y = rotY; root.add(site);
  // 공사 가림막(4면 병합 1 메시) + 위 띠
  const hh = halfM + 10, fh = 7, walls = [], band = [];
  for (const [sx, sz, w, d] of [[0, hh, hh * 2, 0.6], [0, -hh, hh * 2, 0.6], [hh, 0, 0.6, hh * 2], [-hh, 0, 0.6, hh * 2]]) {
    const a = new THREE.BoxGeometry(w, fh, d); a.translate(sx, fh / 2, sz); walls.push(a);
    const b = new THREE.BoxGeometry(w + 0.2, 0.9, d + 0.2); b.translate(sx, fh - 0.45, sz); band.push(b);
  }
  site.add(new THREE.Mesh(mergeGeometries(walls), new THREE.MeshLambertMaterial({ color: '#d8d2c0' })));
  site.add(new THREE.Mesh(mergeGeometries(band), new THREE.MeshBasicMaterial({ color: '#2f6bd8' })));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 34, 12), new THREE.MeshLambertMaterial({ color: '#3a3f47' })); mast.position.y = 17; site.add(mast);
  // 카운트다운 전광판: 타워 높이만큼(555m) — 바닥 30m 위부터
  const W = 160, H = height - 30;
  const board = makeBoard(W, H);
  const pg = new THREE.PlaneGeometry(W, H); pg.translate(0, 30 + H / 2, 0);
  const pmat = new THREE.MeshBasicMaterial({ map: board.tex, fog: false, toneMapped: false, side: THREE.DoubleSide, transparent: false });
  const panel = new THREE.Mesh(pg, pmat); panel.name = 'lotte-countdown'; panel.frustumCulled = false; panel.matrixAutoUpdate = false; panel.renderOrder = 1;
  panel.onBeforeRender = (renderer, scene, camera) => {
    _cp.setFromMatrixPosition(camera.matrixWorld);
    farPlace(panel.matrixWorld, anchor, camera, Math.atan2(_cp.x - anchor.x, _cp.z - anchor.z), 1200);
  };
  root.add(panel);
  const fw = makeFireworks();
  fw.pts.matrixAutoUpdate = false;
  fw.pts.onBeforeRender = (renderer, scene, camera) => {
    farPlace(fw.pts.matrixWorld, anchor, camera);
    fw.pts.material.uniforms.uScale.value = (lastFarScale * renderer.domElement.height) / 2 / Math.tan((camera.fov * Math.PI) / 360);
  };
  root.add(fw.pts);

  const labelText = label?.el.textContent;
  let mode = 'wait', fwUntil = 0, reveal = -1, fade = -1, wasPending = false;
  tower.visible = false;
  // 떠 있는 타워 이름표는 전광판/등장 연출을 가리므로 오픈 연출이 끝날 때까지 숨김 (그 뒤엔 원래 이름표, 타워 꼭대기 위 y=570)
  if (label) label.hidden = true;
  function setPending() {
    mode = 'pending'; wasPending = true; tower.visible = false; site.visible = panel.visible = true;
    if (label) label.hidden = true;
  }
  function setOpen(animate) {
    mode = 'open'; tower.visible = true;
    const now = lotteClock.now();
    if (animate) { reveal = 0; fade = 0; tower.position.y = -height; fwUntil = performance.now() + LOTTE_FIREWORKS_MS; }
    else {
      tower.position.y = 0; site.visible = panel.visible = false;
      if (now - lotteClock.openAt < LOTTE_FIREWORKS_WINDOW_MS) fwUntil = performance.now() + LOTTE_FIREWORKS_MS;
    }
    if (label) { label.el.textContent = labelText; label.hidden = fwUntil > performance.now() || reveal >= 0; }
  }
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  return {
    get mode() { return mode; },
    get fireworks() { return fw.live; },
    stats: () => ({ mode, towerVisible: tower.visible, towerY: +tower.position.y.toFixed(1), panel: panel.visible, label: label ? !label.hidden : null, site: site.visible, fireworksLive: fw.live, source: lotteClock.source, override: lotteClock.override, msLeft: lotteClock.msLeft() }),
    update(dt) {
      if (mode === 'wait') { board.draw(0, false); if (lotteClock.isReady) (lotteClock.isOpen() ? setOpen(false) : setPending()); }
      else if (mode === 'pending') { if (lotteClock.isOpen()) setOpen(true); else board.draw(lotteClock.msLeft(), true); }
      if (mode === 'open') {
        if (fade >= 0) { // 전광판 1.5초 페이드아웃
          if (fade === 0) { pmat.transparent = true; pmat.needsUpdate = true; board.draw(0, true); }
          fade += dt; pmat.opacity = Math.max(0, 1 - fade / 1.5);
          if (fade >= 1.5) { panel.visible = false; fade = -1; }
        }
        if (reveal >= 0) { // 1초 뒤부터 8초 동안 솟아오름
          reveal += dt; const k = ease(Math.min(1, Math.max(0, (reveal - 1) / 8)));
          tower.position.y = -height * (1 - k);
          if (k > 0.97) site.visible = false;
          if (k >= 1) reveal = -1;
        }
        const active = performance.now() < fwUntil;
        fw.update(dt, active);
        if (label && label.hidden && !active && reveal < 0 && fw.live === 0) label.hidden = false;
      }
    },
  };
}
