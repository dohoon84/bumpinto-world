// [weekly-titles] 칭호 전용 WebGL 메시 1개(아틀라스 1장, draw 1). 닉네임 라벨과 같은 앵커·maxDist.
import * as THREE from 'three';
import { composeTitle, earnDuration, langPack, sfxCues, sortQuads } from './eval.js';
import { prefersReducedMotion, useHalfAtlas } from './flag.js';
import atlasJson from './assets/atlas.json';
import atlasPng from './assets/atlas.png';
import atlasHalfPng from './assets/atlas@0.5x.png';

const MAX_QUADS = 256;
const EFFECT_N = 6;
const EARN_N = 2;
const GAP_PT = 4;
const FADE_MS = 200;
const SWAP_MS = 150;

export function pickAtlasUrl(half) {
  return half ? atlasHalfPng : atlasPng;
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(url, resolve, undefined, (err) => reject(err || new Error('title atlas load failed')));
  });
}

export async function loadAtlas(half = false) {
  const url = pickAtlasUrl(half);
  const tex = await loadTexture(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // atlas.uv 원점이 왼쪽 위
  tex.premultiplyAlpha = false;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { json: atlasJson, tex, half };
}

function makeGeometry() {
  const pos = new Float32Array(MAX_QUADS * 4 * 3);
  const uv = new Float32Array(MAX_QUADS * 4 * 2);
  const col = new Float32Array(MAX_QUADS * 4 * 4);
  const idx = new Uint16Array(MAX_QUADS * 6);
  for (let i = 0; i < MAX_QUADS; i++) {
    const v = i * 4;
    idx[i * 6 + 0] = v + 0; idx[i * 6 + 1] = v + 1; idx[i * 6 + 2] = v + 2;
    idx[i * 6 + 3] = v + 1; idx[i * 6 + 4] = v + 3; idx[i * 6 + 5] = v + 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.setDrawRange(0, 0);
  return { geo, pos, uv, col };
}

function spriteOf(atlas, name) { return atlas.sprites?.[name]; }

function writeQuad(pos, uv, col, qi, ox, oy, quad, spr) {
  if (!spr) return false;
  const [w, h] = spr.sizePt;
  const [px, py] = spr.pivotPt;
  const sx = quad.scale?.[0] ?? 1, sy = quad.scale?.[1] ?? 1;
  const a = Math.max(0, Math.min(1, quad.alpha ?? 1));
  const [u0, v0, u1, v1] = spr.uv; // flipY=false
  const x0 = ox + (0 - px) * sx + (quad.pos?.[0] || 0);
  const y0 = oy + (0 - py) * sy + (quad.pos?.[1] || 0);
  const x1 = ox + (w - px) * sx + (quad.pos?.[0] || 0);
  const y1 = oy + (h - py) * sy + (quad.pos?.[1] || 0);
  const vo = qi * 12, uvo = qi * 8, co = qi * 16;
  // y down (ortho top=0, bottom=h). corners: TL, TR, BL, BR. z=0 so bounding sphere is finite
  pos[vo + 0] = x0; pos[vo + 1] = y0; pos[vo + 2] = 0;
  pos[vo + 3] = x1; pos[vo + 4] = y0; pos[vo + 5] = 0;
  pos[vo + 6] = x0; pos[vo + 7] = y1; pos[vo + 8] = 0;
  pos[vo + 9] = x1; pos[vo + 10] = y1; pos[vo + 11] = 0;
  uv[uvo + 0] = u0; uv[uvo + 1] = v0;
  uv[uvo + 2] = u1; uv[uvo + 3] = v0;
  uv[uvo + 4] = u0; uv[uvo + 5] = v1;
  uv[uvo + 6] = u1; uv[uvo + 7] = v1;
  for (let i = 0; i < 4; i++) { col[co + i * 4] = 1; col[co + i * 4 + 1] = 1; col[co + i * 4 + 2] = 1; col[co + i * 4 + 3] = a; }
  return true;
}

export function createTitleLayer({ renderer, camera, getCamera = null, getLang = () => 'ko', sfx = null } = {}) {
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  cam.position.set(0, 0, 5);
  const { geo, pos, uv, col } = makeGeometry();
  const mat = new THREE.MeshBasicMaterial({
    transparent: true, vertexColors: true, depthTest: false, depthWrite: false,
    premultipliedAlpha: false, toneMapped: false, side: THREE.DoubleSide,
  });
  // 본 렌더러는 logarithmicDepthBuffer 를 켠다. 같은 렌더러로 정사영 오버레이를 그리면
  // 로그 깊이 셰이더가 조각을 버려 칭호가 안 보이므로, 이 머티리얼만 로그 깊이를 끈다.
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <logdepthbuf_pars_vertex>', '')
      .replace('#include <logdepthbuf_vertex>', '');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <logdepthbuf_pars_fragment>', '')
      .replace('#include <logdepthbuf_fragment>', '');
  };
  mat.customProgramCacheKey = () => 'title-nologdepth';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  scene.add(mesh);

  // 본 월드 렌더러는 logarithmicDepthBuffer 를 써서 같은 컨텍스트에 정사영 오버레이를 합성하면
  // 칭호가 프레임버퍼에 안 남는다. 라벨(#overlay) 아래에 투명 캔버스+전용 렌더러를 둔다.
  const canvas = document.createElement('canvas');
  canvas.id = 'title-layer';
  canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
  const host = (typeof document !== 'undefined' && (document.getElementById('overlay') || document.getElementById('app') || document.body));
  if (host) host.insertBefore(canvas, host.firstChild);
  const dpr0 = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? Math.min(devicePixelRatio, 2) : 1;
  const overlayR = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: false, logarithmicDepthBuffer: false,
    premultipliedAlpha: false, depth: false, stencil: false,
  });
  overlayR.setClearColor(0x000000, 0);
  overlayR.setPixelRatio(dpr0);
  overlayR.autoClear = true;
  overlayR.outputColorSpace = THREE.SRGBColorSpace;
  const wearers = new Map(); // key -> state
  let atlas = null;
  let lastDraw = 0, lastTris = 0, lastQuads = 0;
  let lastW = 0, lastH = 0;
  const tmp = new THREE.Vector3();

  function reduced() { return prefersReducedMotion(); }

  function setAtlas(a) {
    atlas = a;
    if (mat.map && mat.map !== a.tex) mat.map.dispose();
    mat.map = a.tex;
    mat.needsUpdate = true;
  }

  function ensure(key, init) {
    let w = wearers.get(key);
    if (!w) { w = { key, phase: Math.random() * 100000, state: 'hidden', titleId: null, t0: 0, lastMode: '', fade: 1, fadeT: 0, lastClock: 0, sfxHandle: null, pending: init || {} }; wearers.set(key, w); }
    Object.assign(w, init || {});
    return w;
  }

  function remove(key) {
    const w = wearers.get(key);
    if (w?.sfxHandle) try { w.sfxHandle.stop(); } catch { /* */ }
    wearers.delete(key);
  }

  function playEarn(w, titleId) {
    if (!atlas || !titleId) return;
    const pack = langPack(atlas.json, titleId, getLang());
    if (!pack) return;
    if (w.sfxHandle) try { w.sfxHandle.stop(); } catch { /* */ }
    w.titleId = titleId;
    w.state = 'earn';
    w.t0 = performance.now();
    w.lastClock = w.t0;
    const red = reduced();
    w.reducedEarn = red;
    w.duration = earnDuration(pack, red);
    w.holdEarn = false;
    w.frozenT = null;
    if (sfx) w.sfxHandle = sfx.schedule(sfxCues(pack, red), { other: !w.local, reduced: red, onStop() { w.sfxHandle = null; } });
  }

  // 스크린샷·디버그용. tMs 시점으로 고정하고 시간 점프 가드를 끈다.
  function seekEarn(w, titleId, tMs, { mute = true } = {}) {
    playEarn(w, titleId);
    if (mute && w.sfxHandle) { try { w.sfxHandle.stop(); } catch { /* */ } w.sfxHandle = null; }
    const t = Math.max(0, Number(tMs) || 0);
    const now = performance.now();
    w.t0 = now - t;
    w.lastClock = now;
    w.holdEarn = true;
    w.frozenT = t;
  }

  function setTitle(key, { titleId, tag, getPos, local = false, earn = false } = {}) {
    const w = ensure(key, { tag, getPos, local });
    w.tag = tag || w.tag;
    w.getPos = getPos || w.getPos;
    if (!titleId) {
      if (w.titleId && w.state !== 'hidden') {
        w.state = 'fadeOut';
        w.fadeT = performance.now();
        w.fadeFrom = w.fade ?? 1;
      } else {
        w.titleId = null;
        w.state = 'hidden';
      }
      return w;
    }
    if (titleId !== w.titleId && w.titleId && w.state !== 'hidden') {
      w.state = 'swapOut';
      w.nextTitleId = titleId;
      w.nextEarn = !!earn;
      w.fadeT = performance.now();
      w.fadeFrom = w.fade ?? 1;
      return w;
    }
    w.titleId = titleId;
    if (earn && (w.state === 'hidden' || w.state === 'rest' || w.state === 'restLite' || !w.playedEarnFor || w.playedEarnFor !== titleId)) {
      playEarn(w, titleId);
      w.playedEarnFor = titleId;
    } else if (w.state === 'hidden' || w.state === 'fadeOut') {
      w.state = 'rest';
      w.t0 = performance.now();
    }
    return w;
  }

  function tickWearer(w, now) {
    if (w.state === 'swapOut') {
      const k = Math.min(1, (now - w.fadeT) / SWAP_MS);
      w.fade = (w.fadeFrom ?? 1) * (1 - k);
      if (k >= 1) {
        w.titleId = w.nextTitleId;
        w.nextTitleId = null;
        if (w.nextEarn) playEarn(w, w.titleId);
        else { w.state = 'rest'; w.t0 = now; }
        w.nextEarn = false;
        w.fade = 1;
      }
      return;
    }
    if (w.state === 'fadeOut') {
      const k = Math.min(1, (now - w.fadeT) / FADE_MS);
      w.fade = (w.fadeFrom ?? 1) * (1 - k);
      if (k >= 1) { w.state = 'hidden'; w.titleId = null; w.fade = 1; }
      return;
    }
    if (w.state === 'earn') {
      const dtJump = now - (w.lastClock || now);
      w.lastClock = now;
      // 백그라운드 탭에서만 연출을 건너뛴다. 스크린샷 히치(>500ms)에 끊기지 않게.
      if (!w.holdEarn && dtJump > 500 && typeof document !== 'undefined' && document.hidden) {
        w.state = 'rest';
        if (w.sfxHandle) try { w.sfxHandle.stop(); } catch { /* */ }
        w.sfxHandle = null;
        return;
      }
      if (!w.holdEarn && now - w.t0 >= (w.duration || 0)) {
        w.state = 'rest';
        if (w.sfxHandle) { /* let sfx finish */ }
      }
    }
    w.fade = 1;
  }

  function project(getPos, tag, wPx, hPx) {
    const p = getPos?.() || tag?.getPos?.();
    const cam3 = (getCamera && getCamera()) || camera;
    if (!p || !cam3) return null;
    const d = cam3.position.distanceTo(p);
    const maxD = tag?.maxDist ?? 80;
    if (d > maxD) return null;
    if (tag && tag.visible === false) return null;
    if (tag?.hidden) return null;
    tmp.copy(p).project(cam3);
    if (tmp.z >= 1 || tmp.z <= -1 || Math.abs(tmp.x) > 1.2 || Math.abs(tmp.y) > 1.2) return null;
    const x = ((tmp.x + 1) / 2) * wPx;
    const y = ((1 - tmp.y) / 2) * hPx;
    const labelH = tag?.el?.offsetHeight || tag?.h || 15;
    const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio > 0) ? devicePixelRatio : 1;
    const ox = Math.round(x * dpr) / dpr;
    const top = y - labelH;
    const oy = Math.round((top - GAP_PT) * dpr) / dpr;
    return { x: ox, y: oy, d, visible: true };
  }

  function render(rendererIn, wPx, hPx) {
    const r = rendererIn || renderer;
    if (!r || !atlas) return { quads: 0, draws: 0, tris: 0 };
    if (wPx !== lastW || hPx !== lastH) {
      cam.left = 0; cam.right = wPx; cam.top = 0; cam.bottom = hPx;
      cam.updateProjectionMatrix();
      lastW = wPx; lastH = hPx;
      try { overlayR.setSize(wPx, hPx, false); } catch { /* */ }
    }
    const now = performance.now();
    const red = reduced();
    const live = [];
    for (const w of wearers.values()) {
      tickWearer(w, now);
      if (w.state === 'hidden' || !w.titleId) continue;
      const scr = project(w.getPos, w.tag, wPx, hPx);
      if (!scr) continue;
      w._scr = scr;
      live.push(w);
    }
    live.sort((a, b) => a._scr.d - b._scr.d);
    let earnUsed = 0;
    const entries = [];
    for (let i = 0; i < live.length; i++) {
      const w = live[i];
      const near = i < EFFECT_N;
      let mode = w.state;
      if (mode === 'swapOut' || mode === 'fadeOut') mode = 'rest';
      if (mode === 'earn') {
        if (!near || earnUsed >= EARN_N) mode = red ? 'reduced' : 'reduced';
        else earnUsed += 1;
      }
      if (mode === 'rest' && !near) mode = 'restLite';
      if (mode === 'rest' && red) mode = 'rest';
      const pack = langPack(atlas.json, w.titleId, getLang());
      if (!pack) continue;
      const t = (mode === 'earn' || mode === 'reduced') ? (w.frozenT != null ? w.frozenT : (now - w.t0)) : now;
      const quads = sortQuads(composeTitle(pack, mode === 'reduced' ? 'reduced' : mode, t, {
        phase: w.phase,
        reducedRest: red && mode === 'rest',
      }));
      const fade = w.fade ?? 1;
      entries.push({ w, quads: fade === 1 ? quads : quads.map((q) => ({ ...q, alpha: (q.alpha ?? 1) * fade })), d: w._scr.d });
    }
    // 먼 칭호부터
    entries.sort((a, b) => b.d - a.d);
    let qi = 0;
    for (const e of entries) {
      const ox = e.w._scr.x, oy = e.w._scr.y;
      for (const q of e.quads) {
        if (qi >= MAX_QUADS) break;
        const spr = spriteOf(atlas.json, q.sprite);
        if (writeQuad(pos, uv, col, qi, ox, oy, q, spr)) qi += 1;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, qi * 6);
    lastQuads = qi;
    lastTris = qi * 2;
    mesh.visible = qi > 0;
    mesh.visible = qi > 0;
    if (overlayR) {
      if (qi === 0) overlayR.clear();
      else overlayR.render(scene, cam);
    }
    lastDraw = qi > 0 ? 1 : 0;
    return { quads: lastQuads, draws: lastDraw, tris: lastTris };
  }

  return {
    setAtlas, ensure, setTitle, playEarn: (key, id) => { const w = wearers.get(key); if (w) playEarn(w, id || w.titleId); },
    seekEarn: (key, id, tMs, opts) => {
      const w = wearers.get(key) || ensure(key);
      seekEarn(w, id || w.titleId, tMs, opts);
    },
    remove, render,
    get stats() { return { quads: lastQuads, draws: lastDraw, tris: lastTris, wearers: wearers.size }; },
    wearers,
    scene, mesh,
    ready: () => !!atlas,
  };
}
