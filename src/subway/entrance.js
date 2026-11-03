// [subway] 바깥 월드의 지하철역 출입구 (실제 OSM 출구 위치마다 하나씩, 역마다 buildEntrances 한 번)
//
//   한 출입구 = 낮은 화강석 벽 + 캐노피 + 앞쪽 간판(출구 번호·역 이름·노선 색) + 옆 기둥 간판 + 내려가는 계단 구덩이.
//   계단 구덩이는 지면을 실제로 파지 않는다: 스텐실로 '입구 구멍' 픽셀만 표시 → 그 픽셀의 깊이를 비우고 → 계단을 그린다.
//     mark (renderOrder 1000): 구멍 사각형, 색·깊이 안 씀, 보이는 픽셀에 stencil=1
//     clear (1001): stencil==1 인 곳 깊이를 맨 뒤(1.0)로
//     pit   (1002): stencil==1 인 곳에만 계단·벽 (자기들끼리 깊이 정상)
//   → 앞에 서 있는 사람(renderOrder 0, 먼저 그림)은 mark 에서 가려져 그대로 남는다.
//   전체 출구 수와 무관하게 draw call ≈ 6 (위 구조 1 · 글자/조명 1 · mark · clear · pit · 지붕 유리 없음)
import * as THREE from 'three';
import { createBuilder, createAtlas, FONT, fitText, lineBadge, exitNumber } from './geom.js';
import { JEONGJA_THEME } from './stations.js';

const W = 3.0;       // 계단 폭
const L = 5.6;       // 구멍 길이 (앞 → 뒤)
const STEP_N = 18, STEP_RISE = 0.17, STEP_RUN = 0.29, STEP_W0 = 0.25;
export const ENTRANCE_DIM = { W, L };

// 출입구 로컬(u: 오른쪽, w: 내려가는 방향) ↔ 월드
export function toWorld(e, u, w) {
  const s = Math.sin(e.ry), c = Math.cos(e.ry);
  return { x: e.x + u * c + w * s, z: e.z - u * s + w * c };
}
export function toLocal(e, x, z) {
  const s = Math.sin(e.ry), c = Math.cos(e.ry), dx = x - e.x, dz = z - e.z;
  return { u: dx * c - dz * s, w: dx * s + dz * c };
}

function segDir(px, pz, roads) {
  let best = null;
  for (const r of roads || []) {
    if (!r.p || r.w < 6) continue;
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
      const dx = bx - ax, dz = bz - az, LL = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / LL));
      const d = Math.hypot(ax + dx * t - px, az + dz * t - pz);
      if (d < 60 && (!best || d < best.d)) best = { d, a: Math.atan2(dx, dz) };
    }
  }
  return best;
}

// 출구 하나의 방향·위치 고르기: 가까운 큰길과 나란히, 역 쪽으로 내려가게. 건물·차도에 걸리면 돌리거나 조금 옮긴다.
//   radii: 제자리에서 못 찾으면 옮겨 볼 거리들 (기본 = 정자 런타임 그대로)
export function placeEntrance(exit, { roads, station, isFree, radii = [1.5, 3, 4.5, 6] }) {
  const road = segDir(exit.x, exit.z, roads);
  const base = road ? road.a : 0;
  const toSt = { x: station.x - exit.x, z: station.z - exit.z };
  const cands = [base, base + Math.PI, base + Math.PI / 2, base - Math.PI / 2]
    .map((ry) => ({ ry, pref: Math.sin(ry) * toSt.x + Math.cos(ry) * toSt.z }))
    .sort((a, b) => b.pref - a.pref);
  const shifts = [[0, 0]];
  for (const r of radii) for (let k = 0; k < 8; k++) shifts.push([Math.cos((k * Math.PI) / 4) * r, Math.sin((k * Math.PI) / 4) * r]);
  let best = null;
  for (const [sx, sz] of shifts) {
    for (const c of cands) {
      const e = { x: exit.x + sx, z: exit.z + sz, ry: c.ry };
      let bad = 0;
      for (let u = -2.0; u <= 2.01; u += 0.5) for (let w = -2.4; w <= L + 0.4; w += 0.5) { const p = toWorld(e, u, w); if (!isFree(p.x, p.z)) bad++; }
      const score = bad * 10 + Math.hypot(sx, sz);
      if (!best || score < best.score) best = { ...e, score, bad, shift: Math.hypot(sx, sz) };
      if (bad === 0) break;
    }
    if (best && best.bad === 0) break;
  }
  return best;
}

function drawFascia(ctx, w, h, ex, th) {
  ctx.fillStyle = '#1d2228'; ctx.fillRect(0, 0, w, h);
  exitNumber(ctx, 8, 8, h - 16, ex.ref);
  let x = h + 6;
  const bx = w - 236; // 노선 뱃지 (최대 2개, 위·아래)
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  fitText(ctx, th.name + '역', bx - x - 8, Math.round(h * 0.42), 800); ctx.fillText(th.name + '역', x, h * 0.38);
  ctx.fillStyle = '#c9d1d9'; fitText(ctx, th.nameEn, bx - x - 8, Math.round(h * 0.22), 600); ctx.fillText(th.nameEn, x + 2, h * 0.76);
  th.lines.slice(0, 2).forEach((l, i) => lineBadge(ctx, bx + i * 4, h * (th.lines.length > 1 ? 0.14 + i * 0.4 : 0.34), h * 0.32, l.color, l.short));
  ctx.textAlign = 'left';
}
function drawPillar(ctx, w, h, ex, th) {
  ctx.fillStyle = '#1d2228'; ctx.fillRect(0, 0, w, h);
  exitNumber(ctx, 10, 10, w - 20, ex.ref);
  const bars = th.lines.slice(0, 2);
  bars.forEach((l, i) => { ctx.fillStyle = l.color; ctx.fillRect(10, w + 4 + i * 26, w - 20, bars.length > 1 ? 22 : 48); });
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const t = th.name + '역';
  const step = Math.min(w * 0.36, (h - 60 - (w + 90)) / Math.max(1, t.length - 1)); // 가락시장역(5자)까지 영문 위에 들어가게
  ctx.font = `800 ${Math.round(Math.min(w * 0.3, step * 0.86))}px ${FONT}`;
  for (let i = 0; i < t.length; i++) ctx.fillText(t[i], w / 2, w + 90 + i * step);
  ctx.fillStyle = '#c9d1d9'; fitText(ctx, th.nameEn, w - 8, Math.round(w * 0.15), 600);
  ctx.fillText(th.nameEn, w / 2, h - 26);
  ctx.textAlign = 'left';
}

// exits: resolveExits / corridorExits 결과. exit.place 가 있으면 (코리더 역, 미리 구운 위치) 그대로 쓰고 없으면 런타임에 고른다 (정자역)
// theme: stationTheme() (기본 = 정자역 1단계 그대로)
export function buildEntrances({ scene, overlay, exits, data, world, terrain, theme = JEONGJA_THEME }) {
  const group = new THREE.Group(); group.name = 'subwayEntrances';
  const top = createBuilder(), pit = createBuilder(), mark = createBuilder(), glow = createBuilder();
  const rowsH = Math.ceil(exits.length / 2) * 98 + Math.ceil(exits.length / 10) * 386 + 4; // 앞 간판 504×96 2개씩 + 기둥 96×384 10개씩
  const atlas = createAtlas(1024, 2 ** Math.ceil(Math.log2(Math.max(256, rowsH))), 'entrances-' + theme.id); // 정자역 6개 → 1024×1024
  const white = atlas.add(8, 8, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });
  const isFree = (x, z) => !world.isBlocked(x, z, 0.2) && !world.onRoad(x, z);
  const gy = (x, z) => (terrain ? terrain.getGroundHeight(x, z, 0) : 0);
  const list = [], labels = [];
  const fm = new THREE.Matrix4();
  // 같은 크기끼리 먼저 모아 그려야 행이 낭비되지 않는다 (앞 간판 줄 → 기둥 간판 줄)
  const fasciaUv = new Map(exits.map((ex) => [ex, atlas.add(504, 96, (c, w, h) => drawFascia(c, w, h, ex, theme))]));
  atlas.row(); // 홀수 개면 마지막 앞 간판 줄 옆에 기둥이 끼어 줄 높이가 384 로 커진다 → 기둥은 새 줄부터
  const pillarUv = new Map(exits.map((ex) => [ex, atlas.add(96, 384, (c, w, h) => drawPillar(c, w, h, ex, theme))]));
  for (const ex of exits) {
    const p = ex.place ? { ...ex.place } : placeEntrance(ex, { roads: data?.roads, station: data?.station || { x: 0, z: 0 }, isFree });
    if (!p) continue;
    const e = { exit: ex, x: p.x, z: p.z, ry: p.ry, shift: p.shift, bad: p.bad };
    let y = -Infinity;
    for (const [u, w] of [[-1.9, -0.3], [1.9, -0.3], [-1.9, L + 0.3], [1.9, L + 0.3], [0, L / 2]]) { const q = toWorld(e, u, w); y = Math.max(y, gy(q.x, q.z)); }
    e.y = y;
    // 돌아올 때 서는 곳: 계단 앞 2.6m(들어가는 칸에서 떨어지게), 계단을 등지고
    for (const w of [-2.6, -3.2, -4.0, -5.0]) { const q = toWorld(e, 0, w); e.spawn = { x: q.x, z: q.z, ry: e.ry + Math.PI }; if (isFree(q.x, q.z)) break; }
    list.push(e);

    fm.compose(new THREE.Vector3(e.x, e.y, e.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.ry), new THREE.Vector3(1, 1, 1));
    for (const b of [top, pit, mark, glow]) b.frame(fm.clone());
    // --- 지상 구조 ---
    const GRANITE = '#9aa0a6', CAP = '#c9ccd0', STEEL = '#3d434b', ROOF = '#2f353d';
    for (const sx of [-1, 1]) {
      top.block(sx * 1.66, -0.6, L / 2 + 0.05, 0.3, 1.65, L + 0.5, GRANITE);
      top.block(sx * 1.66, 1.05, L / 2 + 0.05, 0.4, 0.06, L + 0.6, CAP);
      top.block(sx * 1.7, 0, 0.05, 0.14, 3.0, 0.14, STEEL);
      top.block(sx * 1.7, 0, L - 0.1, 0.14, 3.0, 0.14, STEEL);
      top.box(sx * 0.95, 3.12, L / 2, 2.05, 0.08, L + 0.9, ROOF, { rz: sx * -0.12 });
      // 난간 (스테인리스)
      top.box(sx * 1.45, 0.95 - (STEP_N * STEP_RISE) / 2 + 0.2, STEP_W0 + (STEP_N * STEP_RUN) / 2, 0.05, 0.05, Math.hypot(STEP_N * STEP_RUN, STEP_N * STEP_RISE), '#b8bec5', { rx: Math.atan2(STEP_N * STEP_RISE, STEP_N * STEP_RUN) });
    }
    top.block(0, -0.6, L + 0.1, W + 0.6, 3.65, 0.3, GRANITE);          // 뒷벽
    top.block(0, 2.45, -0.02, W + 0.5, 0.66, 0.12, '#1d2228');         // 앞 간판 뒤판
    top.block(-2.25, -0.2, -0.35, 0.56, 3.4, 0.2, '#1d2228');          // 기둥 간판
    // --- 계단 구덩이 (스텐실 안에서만 보임) ---
    const DARK = (y0) => (ly) => Math.max(0.25, 1 + (y0 + ly) * 0.16);
    for (const sx of [-1, 1]) pit.box(sx * (W / 2 + 0.02), -2.1, L / 2, 0.04, 4.2, L + 0.2, '#b9b3a7', { shade: (ly) => Math.max(0.3, 1 + (-2.1 + ly * 4.2) * 0.17) });
    pit.box(0, -0.6, STEP_W0 / 2, W, 1.2, STEP_W0, '#c8c2b6');
    for (let i = 0; i < STEP_N; i++) {
      const yTop = -(i + 1) * STEP_RISE, w0 = STEP_W0 + i * STEP_RUN;
      const k = Math.max(0.3, 1 - i * 0.038);
      const c = new THREE.Color('#cfc8bb').multiplyScalar(k);
      pit.box(0, yTop - 0.3, w0 + STEP_RUN / 2, W, 0.6, STEP_RUN, '#' + c.getHexString());
      pit.box(0, yTop + 0.006, w0 + 0.03, W, 0.012, 0.05, '#' + new THREE.Color('#d9a400').multiplyScalar(k).getHexString()); // 계단 코 미끄럼 방지 띠
    }
    pit.box(0, -2.4, L + 0.02, W, 4.8, 0.04, '#15181c');               // 아래 통로 (어둠)
    pit.box(0, -0.5, L - 0.02, W, 1.0, 0.04, '#8d877c', { shade: DARK(-0.5) });
    mark.quad(0, 0.04, L / 2, W, L, '#ffffff', { rx: -Math.PI / 2 });
    // --- 간판·조명 (아틀라스) ---
    const fascia = fasciaUv.get(ex);
    glow.quad(0, 2.45, -0.09, W + 0.4, (W + 0.4) * (96 / 504), '#ffffff', { ry: Math.PI, uv: fascia });
    glow.quad(0, 2.45, 0.05, W + 0.4, (W + 0.4) * (96 / 504), '#ffffff', { uv: fascia });
    const pillar = pillarUv.get(ex);
    glow.quad(-2.25, 1.7, -0.46, 0.5, 2.0, '#ffffff', { ry: Math.PI, uv: pillar });
    glow.quad(-2.25, 1.7, -0.24, 0.5, 2.0, '#ffffff', { uv: pillar });
    glow.quad(0, 3.02, L / 2, 0.35, L - 0.6, '#fff4dc', { rx: Math.PI / 2, uv: white }); // 캐노피 아래 조명
    if (overlay) {
      const label = ex.ref ? `🚇 ${theme.name}역 ${ex.ref}번 출구` : `🚇 ${theme.name}역 출구`;
      labels.push(overlay.add({ cls: 'label subway-exit', text: label, getPos: () => new THREE.Vector3(e.x, e.y + 4.2, e.z), maxDist: 70, minDist: 0 }));
    }
  }
  const tex = atlas.texture();
  const mats = [];
  const mk = (g, m, order, opts = {}) => { const mesh = new THREE.Mesh(g, m); mesh.renderOrder = order; mesh.name = 'subwayEntrance'; Object.assign(mesh, opts); group.add(mesh); mats.push(m); return mesh; };
  mk(top.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), 0, { castShadow: true, receiveShadow: true });
  mk(glow.build(), new THREE.MeshBasicMaterial({ vertexColors: true, map: tex, toneMapped: false }), 0);
  const markGeo = mark.build();
  const S = { stencilWrite: true, stencilRef: 1 };
  mk(markGeo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, ...S, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }), 1000);
  mk(markGeo, new THREE.ShaderMaterial({
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main(){ gl_FragDepth = 1.0; gl_FragColor = vec4(0.0); }',
    colorWrite: false, depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth, ...S, stencilFunc: THREE.EqualStencilFunc,
  }), 1001);
  mk(pit.build(), new THREE.MeshLambertMaterial({ vertexColors: true, ...S, stencilFunc: THREE.EqualStencilFunc }), 1002);
  scene.add(group);

  // 충돌: 옆벽·뒷벽·기둥 간판 + 계단 깊은 쪽(1.3m 이후)은 막고, 앞 0.15~1.3m 는 들어가는 칸
  const blocks = (x, z, r = 0.3) => {
    for (const e of list) {
      if (Math.abs(x - e.x) > 9 || Math.abs(z - e.z) > 9) continue;
      const { u, w } = toLocal(e, x, z);
      if (w > -0.25 - r && w < L + 0.3 + r && Math.abs(u) < 1.85 + r && Math.abs(u) > 1.45 - r) return true;
      if (w > L - 0.1 - r && w < L + 0.3 + r && Math.abs(u) < 1.9 + r) return true;
      if (Math.abs(u + 2.25) < 0.3 + r && Math.abs(w + 0.35) < 0.12 + r) return true;
      if (Math.abs(u) < 1.5 && w >= 1.3 && w < L) return true;
    }
    return false;
  };
  const zoneAt = (x, z) => {
    for (const e of list) { const { u, w } = toLocal(e, x, z); if (Math.abs(u) < 1.4 && w > 0.15 && w < 1.3) return e; }
    return null;
  };
  const near = (x, z, d = 3.2) => {
    let best = null, bd = d;
    for (const e of list) { const { u, w } = toLocal(e, x, z); if (Math.abs(u) < 2.4 && w > -d && w < 1.3) { const dd = Math.hypot(u, Math.min(0, w)); if (dd <= bd) { bd = dd; best = e; } } }
    return best;
  };
  return {
    group, list, blocks, zoneAt, near, texture: tex,
    dispose() { scene.remove(group); group.traverse((o) => o.geometry?.dispose()); for (const m of mats) m.dispose(); tex.dispose(); for (const it of labels) overlay?.remove(it); labels.length = 0; },
  };
}
