// [place-guide] 장소 가이드의 월드 쪽(일반): 안내판(클릭) · 안내원 NPC(빨간 재킷) · 입구 근처 안내 표지 · E 키 · 'Take me there' 바닥 화살표.
//   데이터(place-guide/1 JSON)의 anchors(gate·board·npc)·spots 만 보고 동작한다 → 다른 랜드마크도 JSON 하나로 재사용.
//   더하는 draw: 안내판 2 + 안내원 아바타(가까울 때만 보임) + 길 화살표 2(안내 중일 때만). 패널은 DOM.
import * as THREE from 'three';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { createPlaceGuideUI } from './placeGuideUI.js';
import { createGroundRoute, routeSteps } from './groundRoute.js';

function boardTexture(g) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const x = c.getContext('2d');
  const F = 'Pretendard,"Noto Sans KR",system-ui,sans-serif';
  x.fillStyle = '#FBFAF7'; x.fillRect(0, 0, 512, 640);
  x.fillStyle = '#111418'; x.fillRect(0, 0, 512, 168);
  x.fillStyle = '#fff'; x.font = 'italic 800 120px Georgia,serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('i', 92, 90);
  x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(180, 20, 2, 128);
  x.textAlign = 'left'; x.fillStyle = '#fff'; x.font = `800 46px ${F}`; x.fillText(g.name.ko, 208, 66);
  x.font = `700 30px ${F}`; x.fillStyle = 'rgba(255,255,255,.75)'; x.fillText(g.name.en, 208, 116);
  x.fillStyle = '#111418'; x.font = `800 40px ${F}`; x.fillText(g.prompt?.title?.en || 'Guide', 40, 236);
  x.fillStyle = '#3A4048'; x.font = `600 30px ${F}`; x.fillText(g.prompt?.title?.ko || '', 40, 284);
  x.fillStyle = '#E2DFD7'; x.fillRect(40, 320, 432, 2);
  const tabs = (g.tabs || []).slice(0, 6);
  x.font = `600 27px ${F}`;
  tabs.forEach((tb, i) => { const yy = 368 + i * 42; x.fillStyle = '#6E747C'; x.fillText(String(i + 1).padStart(2, '0'), 40, yy); x.fillStyle = '#111418'; x.fillText(`${tb.label.en} · ${tb.label.ko}`, 92, yy); });
  x.fillStyle = '#0B63CE'; x.fillRect(0, 618, 512, 22);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/**
 * @param {{ guide: any, parent: THREE.Object3D, camera: THREE.Camera, canvas: HTMLElement, getPlayer: ()=>THREE.Object3D,
 *   surfaceY: (x:number,z:number)=>number, walkLines: ()=>{pts:number[][], n?:string, w?:number}[], mobile?: boolean,
 *   setSuppressOthers?: (on:boolean)=>void, track?: (name:string, p?:any)=>void }} o
 */
export function createPlaceGuideWorld(o) {
  const G = o.guide, A = G.anchors || {};
  const group = new THREE.Group(); group.name = `place-guide-${G.id}`; o.parent.add(group);
  const ground = (x, z) => { const y = o.surfaceY(x, z); return Number.isFinite(y) ? y : 0; };
  const disposables = [];

  // ---------- 안내판 ----------
  const pickables = [];
  let board = null;
  if (A.board) {
    const bx = A.board.x, bz = A.board.z, by = ground(bx, bz);
    const fx = (A.board.face?.[0] ?? bx) - bx, fz = (A.board.face?.[1] ?? bz + 1) - bz, ry = Math.atan2(fx, fz);
    const post = new THREE.BoxGeometry(0.16, 2.2, 0.16); post.translate(0, 1.1, -0.06);
    const frame = new THREE.BoxGeometry(1.32, 1.62, 0.1); frame.translate(0, 1.62 + 0.25, -0.02);
    const base = new THREE.BoxGeometry(0.6, 0.12, 0.4); base.translate(0, 0.06, -0.06);
    const merged = new THREE.BufferGeometry();
    { // 작은 상자 3개를 한 덩어리로 (draw 1)
      const parts = [post, frame, base]; let n = 0; for (const p of parts) n += p.attributes.position.count;
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), idx = []; let off = 0;
      for (const p of parts) { pos.set(p.attributes.position.array, off * 3); nrm.set(p.attributes.normal.array, off * 3); for (const i of p.index.array) idx.push(i + off); off += p.attributes.position.count; p.dispose(); }
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3)); merged.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); merged.setIndex(idx);
    }
    const frameMat = new THREE.MeshLambertMaterial({ color: '#1b1f25' });
    const frameMesh = new THREE.Mesh(merged, frameMat); frameMesh.name = 'place-guide-board-frame';
    const tex = boardTexture(G);
    const faceGeo = new THREE.PlaneGeometry(1.2, 1.5); faceGeo.translate(0, 1.87, 0.035);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const face = new THREE.Mesh(faceGeo, faceMat); face.name = 'place-guide-board-face';
    board = new THREE.Group(); board.name = 'place-guide-board'; board.add(frameMesh, face);
    board.position.set(bx, by, bz); board.rotation.y = ry; group.add(board);
    pickables.push(frameMesh, face);
    disposables.push(merged, frameMat, tex, faceGeo, faceMat);
  }

  // ---------- 안내원 NPC (빨간 재킷) ----------
  let npc = null;
  if (A.npc) {
    npc = createAvatar({ color: '#c8372d', top: 'long', gender: 'f', hair: 'pony', hairColor: '#2a211c', hat: 'cap', hatColor: '#c8372d', pants: '#2b2f36', badge: '#ffd23f', skin: '#f0c9a4' });
    npc.name = 'place-guide-npc';
    npc.traverse((m) => { if (m.isMesh) { m.castShadow = false; pickables.push(m); } });
    const nx = A.npc.x, nz = A.npc.z; npc.position.set(nx, ground(nx, nz), nz);
    const f = A.npc.face || [nx, nz + 1]; npc.rotation.y = Math.atan2(f[0] - nx, f[1] - nz);
    npc.userData.baseRy = npc.rotation.y;
    group.add(npc);
  }

  // ---------- UI · 길 ----------
  const lines = (o.walkLines?.() || []).filter((w) => w.pts?.length >= 2);
  const route = createGroundRoute({ parent: group, groundAt: (x, z) => ground(x, z) + 0.12, lines: lines.map((w) => w.pts) });
  // 길 이름: 가장 가까운 이름 있는 길 (단계 글)
  const named = lines.filter((w) => w.n);
  const nameAt = (x, z) => {
    let best = null, bd = 9;
    for (const w of named) for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
      const tt = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)), d = Math.hypot(a[0] + dx * tt - x, a[1] + dz * tt - z);
      if (d < bd) { bd = d; best = w.n; }
    }
    return best;
  };
  const spots = G.spots || [];
  let distCache = null;
  const player = () => o.getPlayer?.();
  function computeDists() {
    const p = player(); if (!p) return;
    distCache = new Map();
    spots.forEach((s, k) => { try { distCache.set(s.id, route.length(route.pathTo(spots, k, p.position.x, p.position.z))); } catch { /* */ } });
  }
  let cur = null; // 진행 중 안내 {k, spot, steps, total, arrivedT}
  const ui = createPlaceGuideUI({
    mobile: !!o.mobile,
    mapData: () => { const p = player(); return { lines, you: p ? { x: p.position.x, z: p.position.z } : null }; },
    distTo: (id) => distCache?.get(id) ?? null,
    onOpenChange: (on) => { if (on) { computeDists(); o.track?.('place_guide_open', { place: G.id }); } },
    onRoute: (id) => startRoute(id),
    onEndRoute: () => endRoute(),
  });
  ui.setGuide(G);

  function startRoute(id) {
    const k = spots.findIndex((s) => s.id === id); if (k < 0) return;
    if (ui.isOpen) ui.close();
    const p = player(); if (!p) return;
    const path0 = route.pathTo(spots, k, p.position.x, p.position.z);
    const total = route.length(path0);
    cur = { k, spot: spots[k], steps: routeSteps(path0, nameAt, spots[k].name), total, arrivedT: 0 };
    route.start(spots, k);
    o.setSuppressOthers?.(true);
    ui.route.show(info(p));
    o.track?.('place_guide_route', { place: G.id, spot: id, m: Math.round(total) });
  }
  function endRoute() { cur = null; route.stop(); ui.route.hide(); o.setSuppressOthers?.(false); }

  const _v = new THREE.Vector3(), _d = new THREE.Vector3();
  function toScreen(x, y, z) {
    const cam = o.camera; _v.set(x, y, z).project(cam);
    if (_v.z > 1 || _v.z < -1) return null;
    const w = innerWidth, h = innerHeight; const sx = (_v.x + 1) / 2 * w, sy = (1 - _v.y) / 2 * h;
    if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) return null;
    return { x: sx, y: sy };
  }
  function info(p) {
    const path = route.path || route.pathTo(spots, cur.k, p.position.x, p.position.z);
    const rem = route.length(path);
    const done = Math.max(0, cur.total - rem);
    let si = 0; for (let i = 0; i < cur.steps.length; i++) if (cur.steps[i].from <= done + 3) si = i;
    // 다음 꺾임이 18 m 안이면 그 방향, 아니면 앞 8 m 지점 쪽 화살표를 카메라 기준으로 돌린다
    const nx = cur.steps[si + 1];
    let turn = 'straight';
    if (nx && nx.turn !== 'arrive' && nx.from - done < 18) turn = nx.turn;
    let ax = path[path.length - 1][0], az = path[path.length - 1][1], acc = 0;
    for (let i = 1; i < path.length; i++) { const L = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); acc += L; if (acc >= 8) { ax = path[i][0]; az = path[i][1]; break; } }
    o.camera.getWorldDirection(_d);
    const camYaw = Math.atan2(_d.x, _d.z), h = Math.atan2(ax - p.position.x, az - p.position.z);
    let rel = h - camYaw; while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
    const sp = cur.spot; const ds = toScreen(sp.x, ground(sp.x, sp.z) + 2.6, sp.z);
    return { spot: sp, remaining: rem, total: cur.total, steps: cur.steps, stepIdx: si, turn, rel: -rel * 180 / Math.PI, destScreen: ds };
  }

  // ---------- 가까이 · 클릭 · E ----------
  const NEAR = A.near || 4.5, SEE = 12;
  let inRange = false, promptAt = null;
  function anchorsNear(px, pz) {
    let best = null;
    const test = (k, x, z, r, y) => { const d = Math.hypot(px - x, pz - z); if (d <= r && (!best || d < best.d)) best = { k, x, z, d, y }; };
    if (A.board) test('board', A.board.x, A.board.z, SEE, 2.85);
    if (A.npc) test('npc', A.npc.x, A.npc.z, SEE, 2.25);
    if (A.gate) test('gate', A.gate.x, A.gate.z, A.gate.r || 9, 8.6);
    return best;
  }
  const rc = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  let downAt = null;
  const onDown = (e) => { downAt = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    if (!downAt || ui.isOpen) return; const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y); downAt = null; if (moved > 6) return;
    const p = player(); if (!p || !pickables.length) return;
    const pa = A.board || A.npc; if (Math.hypot(p.position.x - pa.x, p.position.z - pa.z) > 45) return;
    const r = o.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    rc.setFromCamera(ndc, o.camera);
    if (rc.intersectObjects(pickables, false).length) { ui.open(); }
  };
  o.canvas?.addEventListener('pointerdown', onDown);
  o.canvas?.addEventListener('pointerup', onUp);

  let time = 0, npcT = 0;
  function update(dt) {
    time += dt;
    const p = player(); if (!p) return;
    const px = p.position.x, pz = p.position.z;
    const far = A.region ? Math.hypot(px - A.region.x, pz - A.region.z) > (A.region.r || 300) + 200 : false;
    group.visible = !far || !!cur;
    if (npc) {
      const d = Math.hypot(px - npc.position.x, pz - npc.position.z);
      npc.visible = d < 140;
      if (npc.visible) {
        npcT += dt;
        // 가까이 오면 플레이어 쪽으로 천천히 돌아보고 손 인사
        const want = d < 10 ? Math.atan2(px - npc.position.x, pz - npc.position.z) : npc.userData.baseRy;
        let dr = want - npc.rotation.y; while (dr > Math.PI) dr -= 2 * Math.PI; while (dr < -Math.PI) dr += 2 * Math.PI;
        npc.rotation.y += dr * Math.min(1, dt * 3);
        animateAvatar(npc, 0, dt);
      }
    }
    o.camera.updateMatrixWorld?.();
    const a = anchorsNear(px, pz);
    inRange = !!a && !cur;
    if (a) {
      const sc = toScreen(a.x, ground(a.x, a.z) + a.y, a.z);
      promptAt = { show: true, x: sc?.x, y: sc?.y, near: a.d <= Math.max(NEAR, a.k === 'gate' ? 99 : NEAR) };
    } else promptAt = null;
    ui.prompt(ui.isOpen ? null : promptAt);
    if (cur && far && A.region && Math.hypot(px - A.region.x, pz - A.region.z) > (A.region.r || 300) + 600) endRoute(); // 순간이동 등으로 멀리 가면 안내 끝
    if (cur) {
      route.update(dt, px, pz);
      const inf = info(p);
      ui.route.update(inf);
      if (inf.remaining < 6 || Math.hypot(px - cur.spot.x, pz - cur.spot.z) < 7) {
        if (!cur.arrivedT) { cur.arrivedT = time; ui.toast(ui.lang === 'ko' ? `도착 · ${cur.spot.name.ko}` : `Arrived · ${cur.spot.name.en}`, cur.spot.placement === 'manual' ? '' : (ui.lang === 'ko' ? '게임 속 개략 위치' : 'Schematic spot in the game'), 3200); o.track?.('place_guide_arrive', { place: G.id, spot: cur.spot.id }); }
        else if (time - cur.arrivedT > 2.5) endRoute();
      }
    }
  }
  function onKey(e) {
    if (ui.onKey(e)) return true;
    if (e.code === 'KeyE' && !e.repeat && inRange && !ui.isOpen) { ui.open(undefined, { focus: true }); return true; }
    return false;
  }
  return {
    ui, route, group,
    update, onKey,
    get canOpen() { return inRange && !ui.isOpen; },
    get isOpen() { return ui.isOpen; },
    get routing() { return !!cur; },
    open: (tab) => ui.open(tab),
    close: () => ui.close(),
    startRoute, endRoute,
    get current() { return cur ? { spot: cur.spot.id, total: cur.total, steps: cur.steps.length, path: route.path?.length || 0, arrows: route.arrowCount } : null; },
    dispose() {
      endRoute();
      o.canvas?.removeEventListener('pointerdown', onDown); o.canvas?.removeEventListener('pointerup', onUp);
      ui.dispose(); route.dispose(); o.parent.remove(group);
      for (const d of disposables) d.dispose?.();
    },
  };
}
