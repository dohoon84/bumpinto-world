// [cableguide] 남산 케이블카 길안내·탑승 안내. 기본 켜짐, ?cableguide=0 이면 끈다.
//   - 정류장(회현·남산타워) 600 m 안: 걸어갈 수 있는 길(OSM 길·계단·시가지 도로)을 따라 바닥 화살표(쉐브론)로 출입문까지.
//   - 출입문 위에 멀리서도·밤에도 읽히는 '케이블카 타는 곳' 표지.
//   - 승강장 안: 오락실·BUMP24 문 앞과 같은 안내(PC <kbd>E</kbd>, 터치 '탭하여'), 기다리면 다음 칸까지 남은 시간.
//   - 탑승·도착 토스트, 승강장 조명·노란 안전선·'여기 서 있으면 탑승' 바닥 표시.
import * as THREE from 'three';
import { tr } from '../../i18n.js';

export function cableGuideEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search || '').get('cableguide') !== '0';
}

const SHOW_R = 600; // 이 안에서 바닥 화살표
const SIGN_R = 900; // 표지
const STEP = 4.2; // 화살표 간격
const MAX_ARROWS = 160;

// ---------------------------------------------------------------- 길 그래프
/** 폴리라인(osm ways · 시가지 도로)로 보행 그래프를 만들고, 각 정류장 출입문까지의 최단 경로 트리를 미리 구한다. */
export function buildCableGraph(lines, targets, { radius = 760, link = 6 } = {}) {
  const nodes = []; // {x,z,e:[{t,w}]}
  const cell = 8;
  const grid = new Map();
  const gk = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const exact = new Map();
  const near = (x, z) => targets.some((t) => Math.hypot(x - t.x, z - t.z) < radius);
  function node(x, z) {
    const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    let i = exact.get(k);
    if (i != null) return i;
    i = nodes.length;
    nodes.push({ x, z, e: [] });
    exact.set(k, i);
    const g = gk(x, z);
    if (!grid.has(g)) grid.set(g, []);
    grid.get(g).push(i);
    return i;
  }
  const edge = (a, b, w) => { if (a === b) return; nodes[a].e.push({ t: b, w }); nodes[b].e.push({ t: a, w }); };
  for (const pts of lines) {
    if (!pts || pts.length < 2) continue;
    let prev = -1;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[i - 1];
      // 반경 밖 구간은 건너뛴다(양 끝 중 하나라도 안이면 넣는다)
      if (!near(p[0], p[1]) && !(q && near(q[0], q[1]))) { prev = -1; continue; }
      // 긴 구간은 잘게 나눠 가까운 노드 스냅이 길 위로 떨어지게
      if (prev >= 0 && q) {
        const L = Math.hypot(p[0] - q[0], p[1] - q[1]);
        const n = Math.max(1, Math.ceil(L / 12));
        for (let k = 1; k <= n; k++) {
          const x = q[0] + (p[0] - q[0]) * (k / n), z = q[1] + (p[1] - q[1]) * (k / n);
          const cur = node(x, z);
          edge(prev, cur, L / n);
          prev = cur;
        }
      } else prev = node(p[0], p[1]);
    }
  }
  const around = (x, z, r) => {
    const out = [];
    const c0 = Math.floor((x - r) / cell), c1 = Math.floor((x + r) / cell);
    const r0 = Math.floor((z - r) / cell), r1 = Math.floor((z + r) / cell);
    for (let a = c0; a <= c1; a++) for (let b = r0; b <= r1; b++) {
      const l = grid.get(`${a},${b}`);
      if (l) for (const i of l) if (Math.hypot(nodes[i].x - x, nodes[i].z - z) <= r) out.push(i);
    }
    return out;
  };
  // 끊긴 OSM 조각(교차로·계단 끝) 잇기
  const base = nodes.length;
  for (let i = 0; i < base; i++) {
    for (const j of around(nodes[i].x, nodes[i].z, link)) {
      if (j <= i) continue;
      if (nodes[i].e.some((e) => e.t === j)) continue;
      edge(i, j, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z) * 1.05);
    }
  }
  // 연결 성분 (문 앞에서 끊긴 짧은 조각만 잡히지 않게)
  const comp = new Int32Array(nodes.length).fill(-1);
  const compSize = [];
  for (let i = 0; i < nodes.length; i++) {
    if (comp[i] >= 0) continue;
    const id = compSize.length; let n = 0;
    const stack = [i]; comp[i] = id;
    while (stack.length) { const u = stack.pop(); n++; for (const e of nodes[u].e) if (comp[e.t] < 0) { comp[e.t] = id; stack.push(e.t); } }
    compSize.push(n);
  }
  const trees = targets.map((t) => {
    // 출입문 → 가까운 길 노드 (직선, 문 앞 광장). 가까운 6개 + 130 m 안 큰 성분마다 가장 가까운 노드 1개
    const ti = nodes.length;
    nodes.push({ x: t.x, z: t.z, e: [] });
    const dOf = (j) => Math.hypot(nodes[j].x - t.x, nodes[j].z - t.z);
    const cand = around(t.x, t.z, 130).sort((a, b) => dOf(a) - dOf(b));
    const pick = new Set(cand.filter((j) => dOf(j) < 40).slice(0, 6));
    const seenC = new Set();
    for (const j of cand) {
      const c = comp[j];
      if (seenC.has(c) || compSize[c] < 30) continue;
      seenC.add(c); pick.add(j);
      if (seenC.size >= 4) break;
    }
    for (const j of pick) edge(ti, j, dOf(j) * 1.15);
    return dijkstraFrom(nodes, ti);
  });
  return {
    nodes, trees, around,
    /** (x,z) 에서 target k 까지 [x,z][] (출입문 포함). 길에서 너무 멀면 null. */
    pathFrom(x, z, k, maxSnap = 70) {
      const tree = trees[k];
      if (!tree) return null;
      let best = -1, bd = Infinity;
      for (const i of around(x, z, maxSnap)) {
        if (!Number.isFinite(tree.dist[i])) continue;
        // 가까움 + 남은 거리(되돌아가는 노드 피하기)
        const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
        const score = d * 1.6 + tree.dist[i];
        if (score < bd) { bd = score; best = i; }
      }
      if (best < 0) return null;
      const out = [[x, z]];
      for (let i = best, n = 0; i >= 0 && n < 4000; i = tree.next[i], n++) out.push([nodes[i].x, nodes[i].z]);
      return out;
    },
  };
}

function dijkstraFrom(nodes, src) {
  const N = nodes.length;
  const dist = new Float64Array(N).fill(Infinity);
  const next = new Int32Array(N).fill(-1);
  dist[src] = 0;
  // binary heap of [d, i]
  const hd = [], hi = [];
  const push = (d, i) => {
    let k = hd.length; hd.push(d); hi.push(i);
    while (k > 0) { const p = (k - 1) >> 1; if (hd[p] <= hd[k]) break; [hd[p], hd[k]] = [hd[k], hd[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; }
  };
  const pop = () => {
    const d = hd[0], i = hi[0];
    const ld = hd.pop(), li = hi.pop();
    if (hd.length) {
      hd[0] = ld; hi[0] = li;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1; let m = k;
        if (l < hd.length && hd[l] < hd[m]) m = l;
        if (r < hd.length && hd[r] < hd[m]) m = r;
        if (m === k) break;
        [hd[m], hd[k]] = [hd[k], hd[m]]; [hi[m], hi[k]] = [hi[k], hi[m]]; k = m;
      }
    }
    return [d, i];
  };
  push(0, src);
  while (hd.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    for (const e of nodes[u].e) {
      const nd = d + e.w;
      if (nd < dist[e.t]) { dist[e.t] = nd; next[e.t] = u; push(nd, e.t); }
    }
  }
  return { dist, next };
}

export function resample(pts, step, carry0 = 0) {
  const out = [];
  let carry = carry0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 1e-4) continue;
    let s = carry;
    while (s < L) {
      out.push({ x: a[0] + dx * (s / L), z: a[1] + dz * (s / L), hx: dx / L, hz: dz / L });
      s += step;
    }
    carry = s - L;
  }
  return out;
}

// ---------------------------------------------------------------- 3D 소품
export function chevronGeo() {
  const s = new THREE.Shape();
  // 팁이 -Y. rotation 'YXZ' (x=-PI/2) 후 +Z(진행 방향)를 가리킨다.
  s.moveTo(0, -1.0);
  s.lineTo(-0.85, 0.75);
  s.lineTo(-0.42, 0.75);
  s.lineTo(0, -0.12);
  s.lineTo(0.42, 0.75);
  s.lineTo(0.85, 0.75);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function rr(x, X, Y, W, H, R) {
  x.beginPath();
  x.moveTo(X + R, Y); x.lineTo(X + W - R, Y); x.quadraticCurveTo(X + W, Y, X + W, Y + R);
  x.lineTo(X + W, Y + H - R); x.quadraticCurveTo(X + W, Y + H, X + W - R, Y + H);
  x.lineTo(X + R, Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - R);
  x.lineTo(X, Y + R); x.quadraticCurveTo(X, Y, X + R, Y); x.closePath();
}

function cabinIcon(x, cx, cy, s, color) {
  // 줄 + 매달린 칸 (이모지 대신 직접 그려 폰트에 기대지 않는다)
  x.save();
  x.strokeStyle = color; x.fillStyle = color; x.lineWidth = 5 * s; x.lineCap = 'round';
  x.beginPath(); x.moveTo(cx - 46 * s, cy - 40 * s); x.lineTo(cx + 46 * s, cy - 52 * s); x.stroke();
  x.beginPath(); x.moveTo(cx, cy - 46 * s); x.lineTo(cx, cy - 22 * s); x.stroke();
  rr(x, cx - 30 * s, cy - 22 * s, 60 * s, 58 * s, 10 * s); x.fill();
  x.fillStyle = 'rgba(20,28,40,.9)';
  rr(x, cx - 22 * s, cy - 14 * s, 18 * s, 20 * s, 3 * s); x.fill();
  rr(x, cx + 4 * s, cy - 14 * s, 18 * s, 20 * s, 3 * s); x.fill();
  x.restore();
}

function signTexture(title, sub) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  // 패널
  x.fillStyle = 'rgba(8,12,20,.0)'; x.fillRect(0, 0, 1024, 512);
  x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 18;
  x.fillStyle = '#c62828';
  rr(x, 24, 20, 976, 290, 46); x.fill();
  x.shadowBlur = 0;
  x.lineWidth = 10; x.strokeStyle = '#ffffff';
  rr(x, 24, 20, 976, 290, 46); x.stroke();
  cabinIcon(x, 140, 168, 1.35, '#ffffff');
  x.fillStyle = '#ffffff';
  x.textAlign = 'left'; x.textBaseline = 'middle';
  x.font = '900 108px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  x.fillText(title, 250, 128);
  x.font = '800 56px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  x.fillStyle = '#ffe66d';
  x.fillText(sub, 254, 240);
  // 아래 화살표
  x.fillStyle = '#ffe66d'; x.strokeStyle = '#ffffff'; x.lineWidth = 8;
  x.beginPath();
  x.moveTo(512 - 70, 330); x.lineTo(512 + 70, 330); x.lineTo(512 + 70, 395);
  x.lineTo(512 + 130, 395); x.lineTo(512, 500); x.lineTo(512 - 130, 395); x.lineTo(512 - 70, 395);
  x.closePath(); x.fill(); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function floorDecalTexture(line1, line2) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,214,0,.95)'; rr(x, 8, 8, 1008, 368, 40); x.fill();
  x.fillStyle = '#1b1b1b'; rr(x, 30, 30, 964, 324, 28); x.fill();
  x.fillStyle = '#ffd600';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 104px "Noto Sans KR", sans-serif';
  x.fillText(line1, 512, 140);
  x.font = '800 60px "Noto Sans KR", sans-serif';
  x.fillStyle = '#ffffff';
  x.fillText(line2, 512, 262);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- DOM
const CSS = `
#cg-root{position:fixed;inset:0;pointer-events:none;z-index:118;font-family:Pretendard,"Noto Sans KR",system-ui,sans-serif}
#cg-root .cg-hint{position:fixed;left:50%;bottom:100px;transform:translateX(-50%);display:none;max-width:min(92vw,460px);text-align:center;
  background:rgba(12,16,28,.88);color:#fff;padding:10px 16px;border-radius:22px;font-weight:800;font-size:14px;line-height:1.35;border:2px solid rgba(255,230,109,.35)}
#cg-root .cg-hint.on{display:block}
#cg-root .cg-hint kbd{display:inline-block;min-width:22px;padding:1px 6px;margin:0 4px;border-radius:6px;background:#ffe66d;color:#111;font-weight:900;text-align:center;font-family:inherit}
#cg-root .cg-hint small{display:block;margin-top:3px;font-size:12.5px;font-weight:700;color:#d8e2ee}
#cg-root .cg-hint small b{color:#ffe66d}
#cg-root .cg-hint.tap{pointer-events:auto;padding:0;background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#cg-root .cg-hint.tap small{margin-top:8px;padding:4px 10px;border-radius:12px;background:rgba(12,16,28,.82);display:inline-block}
#cg-root .cg-hint.tap .arc-tapbtn{max-width:min(92vw,400px)}
#cg-root .cg-toast{position:fixed;left:50%;top:84px;transform:translate(-50%,-10px);opacity:0;transition:opacity .25s,transform .25s;
  background:rgba(198,40,40,.94);color:#fff;padding:10px 20px;border-radius:999px;font-weight:900;font-size:17px;letter-spacing:-.01em;
  box-shadow:0 6px 18px rgba(0,0,0,.35);border:2px solid rgba(255,255,255,.75);white-space:nowrap;text-align:center}
#cg-root .cg-toast small{display:block;font-size:12.5px;font-weight:700;opacity:.92}
#cg-root .cg-toast.on{opacity:1;transform:translate(-50%,0)}
`;
const HAND = '<svg class="hand" viewBox="0 0 64 64" aria-hidden="true"><path fill="#fff" d="M28 8c2.5 0 4.5 2 4.5 4.5V30l1.2-.6c1.4-.7 3.1-.4 4.1.8l.4.5V18.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5V36l1.5-1c1.5-1 3.6-.7 4.7.8 1.1 1.5.9 3.6-.4 4.9L42 52.5C38.5 56.5 33.5 59 28 59c-9 0-16.5-6.5-18.5-15.2L7 30.5c-.7-2.3.6-4.7 2.9-5.4 2.3-.7 4.7.6 5.4 2.9l2.2 7.5V12.5C17.5 10 19.5 8 22 8s4.5 2 4.5 4.5V28L28 8z"/></svg>';
const isTouch = () => {
  try { return document.body.classList.contains('mobile') || matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; }
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function createDom(onTap) {
  if (typeof document === 'undefined') return null;
  if (!document.getElementById('cg-style')) {
    const st = document.createElement('style'); st.id = 'cg-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  let root = document.getElementById('cg-root');
  if (!root) { root = document.createElement('div'); root.id = 'cg-root'; document.body.appendChild(root); }
  root.innerHTML = '<div class="cg-hint" role="status"></div><div class="cg-toast" role="status" aria-live="polite"></div>';
  const hint = root.querySelector('.cg-hint');
  const toastEl = root.querySelector('.cg-toast');
  const fire = (e) => { if (!hint.classList.contains('tap')) return; e.preventDefault(); e.stopPropagation(); onTap?.(); };
  hint.addEventListener('pointerdown', fire);
  let lastKey = '';
  let toastT = 0;
  return {
    root,
    hint(state) {
      const k = state ? JSON.stringify(state) + isTouch() : '';
      if (k === lastKey) return;
      lastKey = k;
      if (!state) { hint.classList.remove('on', 'tap'); hint.innerHTML = ''; return; }
      const touch = (state.act || state.tapAct) && isTouch();
      hint.classList.add('on');
      hint.classList.toggle('tap', !!touch);
      hint.setAttribute('role', touch ? 'button' : 'status');
      const sub = state.sub ? `<small>${state.sub}</small>` : '';
      if (touch) {
        hint.innerHTML = `<span class="arc-tapbtn"><span class="ico" aria-hidden="true"><i class="rip"></i><i class="rip r2"></i>${HAND}</span><span class="lb"><b class="tw">${esc(tr('탭하여', 'Tap'))}</b>${esc(state.tap || state.text)}</span></span>${sub}`;
      } else if (state.act) {
        hint.innerHTML = `<kbd>E</kbd> ${esc(state.text)}${sub}`;
      } else hint.innerHTML = `${esc(state.text)}${sub}`;
    },
    toast(title, sub = '', ms = 3200) {
      toastEl.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
      toastEl.classList.add('on');
      clearTimeout(toastT);
      toastT = setTimeout(() => toastEl.classList.remove('on'), ms);
    },
    dispose() { root.remove(); },
  };
}

// ---------------------------------------------------------------- main
export function createNamsanCableGuide({ parent, cable, ways = [], city = null, heightAt, surfaceY = null, floorAt = null } = {}) {
  const info = cable?.stationInfo || [];
  const group = new THREE.Group();
  group.name = 'namsan-cable-guide';
  parent.add(group);
  if (!info.length) return { group, update() {}, setNight() {}, onKey() { return false; }, get canAct() { return false; } };

  // [myeongdong-perf] 바닥 높이 캐시 (5 cm 격자). 화살표는 문 쪽 끝에 맞춰 같은 자리에 놓이므로
  //   걸을 때마다 다시 깔아도 대부분 캐시에서 나온다. 예전엔 3 m 마다 1440 번 남산 표면 질의 → 명동에서 0.4 초 끊김.
  const gCache = new Map();
  const groundAt = (x, z) => {
    const key = Math.round(x * 20) * 2097152 + Math.round(z * 20);
    const c = gCache.get(key);
    if (c !== undefined) return c;
    const f = floorAt ? floorAt(x, z) : null; // [myeongdong] 명동 바닥이 있으면 그 위
    let y;
    if (Number.isFinite(f)) y = f + 0.12; // 명동 골목 포장(+0.06~0.1) 위로
    else {
      const h = heightAt(x, z);
      const s = surfaceY ? surfaceY(x, z, h + 1.4) : null;
      y = Number.isFinite(s) ? s : h;
    }
    if (gCache.size > 40000) gCache.clear();
    gCache.set(key, y);
    return y;
  };

  // 출입문 바로 앞(바깥 3 m)을 길 끝으로, 문 → 승강장 판까지는 안쪽 직선
  const stations = info.map((s) => {
    const d = s.door || { x: s.node.x, z: s.node.z, nx: 0, nz: 1 };
    const out = { x: d.x + d.nx * 3, z: d.z + d.nz * 3 };
    const ud = s.group.userData || {};
    const c = ud.center || { x: s.node.x, z: s.node.z };
    const fa = ud.faceAng || 0;
    const fx = Math.sin(fa), fz = Math.cos(fa);
    const plat = { x: c.x + fx * 0.6, z: c.z + fz * 0.6 };
    return { ...s, d, out, c, fa, fx, fz, plat };
  });

  const lines = [];
  for (const w of ways) if (w?.pts?.length >= 2) lines.push(w.pts);
  for (const r of city?.roads || []) if (r?.p?.length >= 2) lines.push(r.p);
  let graph = buildCableGraph(lines, stations.map((s) => s.out));

  // ---- 바닥 화살표 (본색 + 짙은 테두리). 비탈면 법선에 붙이고, 낮에도 대비가 나오게.
  const arrowMat = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.98, depthWrite: false, side: THREE.DoubleSide,
    toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const rimMat = new THREE.MeshBasicMaterial({
    color: '#08244a', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide,
    toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const chev = chevronGeo();
  const arrows = new THREE.InstancedMesh(chev, arrowMat, MAX_ARROWS);
  const rims = new THREE.InstancedMesh(chev, rimMat, MAX_ARROWS);
  arrows.name = 'namsan-cable-arrows';
  rims.name = 'namsan-cable-arrow-rims';
  for (const m of [arrows, rims]) {
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  arrows.renderOrder = 4;
  rims.renderOrder = 3;
  arrows.setColorAt(0, new THREE.Color('#0a7ae0'));
  rims.setColorAt(0, new THREE.Color('#08244a'));
  group.add(rims);
  group.add(arrows);
  const dummy = new THREE.Object3D();
  dummy.rotation.order = 'YXZ';
  const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _y = new THREE.Vector3(), _m = new THREE.Matrix4();
  const colDayA = new THREE.Color('#005cbc'), colDayB = new THREE.Color('#39c4ff');
  const colNgtA = new THREE.Color('#1488ff'), colNgtB = new THREE.Color('#e4f8ff');
  const colA = new THREE.Color(), colB = new THREE.Color(), tmpC = new THREE.Color();
  let placed = []; // [{x,y,z,yaw,s,sc,flat}] s = 문까지 남은 거리
  let pathKey = '';

  function slopeAt(x, z) {
    const e = 0.8;
    const hx = (groundAt(x + e, z) - groundAt(x - e, z)) / (2 * e);
    const hz = (groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
    return _n.set(-(Number.isFinite(hx) ? hx : 0), 1, -(Number.isFinite(hz) ? hz : 0)).normalize();
  }
  function poseArrow(p, scale) {
    dummy.scale.setScalar(scale);
    if (p.flat) {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(-Math.PI / 2, p.yaw, 0, 'YXZ');
      dummy.updateMatrix();
      return;
    }
    dummy.rotation.set(0, 0, 0);
    const n = p.n || (p.n = slopeAt(p.x, p.z).clone()); // [myeongdong-perf] 테두리와 본체가 같은 법선을 쓴다
    const lift = 0.07;
    dummy.position.set(p.x + n.x * lift, p.y + n.y * lift, p.z + n.z * lift);
    const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw);
    _f.set(hx, 0, hz).addScaledVector(n, -_f.dot(n));
    if (_f.lengthSq() < 1e-6) _f.set(hx, 0, hz);
    _f.normalize();
    _r.crossVectors(n, _f).normalize();
    _y.copy(_f).multiplyScalar(-1); // 쉐브론 팁이 -Y 이므로 +Y = 진행 반대
    dummy.quaternion.setFromRotationMatrix(_m.makeBasis(_r, _y, n));
    dummy.updateMatrix();
  }
  function clearArrows() {
    arrows.count = 0;
    rims.count = 0;
    pathKey = '';
  }

  function layPath(path, st) {
    // 문 바깥 → 문 → 승강장까지 이어 붙인다
    const full = path.concat([[st.d.x, st.d.z], [st.d.x - st.d.nx * 3.5, st.d.z - st.d.nz * 3.5]]);
    // 경로 총 길이 (남은 거리 → 흐르는 빛)
    let total = 0;
    for (let i = 1; i < full.length; i++) total += Math.hypot(full[i][0] - full[i - 1][0], full[i][1] - full[i - 1][1]);
    // [myeongdong-perf] 문 쪽 끝에서 STEP 배수 자리에 놓는다 → 걸어도 화살표가 미끄러지지 않고 높이 캐시가 맞는다
    const s0 = total % STEP;
    const rs = resample(full, STEP, s0);
    placed = [];
    for (let i = 0; i < rs.length && placed.length < MAX_ARROWS; i++) {
      const p = rs[i];
      const acc = s0 + i * STEP;
      if (acc < 3) continue; // 발밑은 비운다
      const inside = st.pts && pointInRing(p.x, p.z, st.pts);
      const y = inside ? st.y + 0.2 : groundAt(p.x, p.z);
      placed.push({ x: p.x, y, z: p.z, yaw: Math.atan2(p.hx, p.hz), s: total - acc, sc: inside ? 0.8 : 1.7, flat: !!inside });
    }
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      poseArrow(p, p.sc);
      arrows.setMatrixAt(i, dummy.matrix);
      poseArrow(p, p.sc * 1.22);
      rims.setMatrixAt(i, dummy.matrix);
    }
    arrows.count = placed.length;
    rims.count = placed.length;
    arrows.instanceMatrix.needsUpdate = true;
    rims.instanceMatrix.needsUpdate = true;
  }

  // ---- 표지 (스프라이트, 멀어질수록 커져 화면 크기 유지)
  const signs = stations.map((s) => {
    const sub = s.which === 'upper' ? tr('남산타워 → 회현', 'Tower → Hoehyeon') : tr('회현 → 남산타워', 'Hoehyeon → Tower');
    const mat = new THREE.SpriteMaterial({ map: signTexture(tr('케이블카 타는 곳', 'Cable Car'), sub), toneMapped: false, fog: false, transparent: true, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.center.set(0.5, 0.0);
    const wallH = s.group.userData?.wallH || 7.2;
    const bx = s.d.x + s.d.nx * 1.2, bz = s.d.z + s.d.nz * 1.2;
    sp.position.set(bx, s.y + wallH + 0.9, bz);
    sp.userData.base = sp.position.clone();
    sp.renderOrder = 30;
    sp.name = `namsan-cable-sign-${s.which}`;
    group.add(sp);
    return sp;
  });

  // ---- 승강장 조명·노란 안전선·바닥 안내
  const panelMat = new THREE.MeshBasicMaterial({ color: '#fff3d6', toneMapped: false });
  const lineMat = new THREE.MeshBasicMaterial({ color: '#ffd400', toneMapped: false });
  const tactMat = new THREE.MeshLambertMaterial({ color: '#e8b800', emissive: new THREE.Color('#ffcc00'), emissiveIntensity: 0.25 });
  const decalTex = floorDecalTexture(tr('여기 서 있으면 탑승', 'Stand here to board'), tr('케이블카가 오면 자동으로 타요 · E 바로 타기', 'Boards automatically · E to board'));
  const decalMat = new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, toneMapped: false, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const tintMats = [];
  for (const s of stations) {
    const ud = s.group.userData || {};
    const wallH = ud.wallH || 7.2;
    const y = s.y;
    const g = new THREE.Group();
    g.name = `namsan-cable-platform-${s.which}`;
    g.position.set(s.c.x, y, s.c.z);
    g.rotation.y = s.fa; // 로컬 +Z = 케이블(칸이 서는) 쪽
    // 천장 조명 패널 3줄
    for (const zz of [-1.8, 0.4, 2.4]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.08, 0.7), panelMat);
      m.position.set(0, wallH - 0.12, zz);
      g.add(m);
    }
    // 승강장 판 위(판 윗면 ≈ +0.29): 가장자리 노란 안전선 + 점자블록 띠
    const line = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.025, 0.16), lineMat);
    line.position.set(0, 0.305, 0.6 + 1.6 - 0.18);
    g.add(line);
    const tact = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.03, 0.42), tactMat);
    tact.position.set(0, 0.3, 0.6 + 1.6 - 0.55);
    g.add(tact);
    // 바닥 안내 판 (출입문 쪽에서 읽히게 — 텍스트 위쪽이 케이블 쪽)
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.35), decalMat);
    dec.rotation.x = -Math.PI / 2;
    dec.rotation.z = Math.PI;
    dec.position.set(0, 0.31, 0.6 - 0.35);
    g.add(dec);
    group.add(g);
    // 바닥·승강장 판이 어둡게 죽지 않게 은은한 자체광
    for (const m of [ud.plat?.material, ud.floor?.material]) if (m && 'emissive' in m) { m.emissive = new THREE.Color(m.color).multiplyScalar(1); m.emissiveIntensity = 0.12; tintMats.push(m); }
  }
  // 가까운 정류장 하나만 비추는 점광원 (장면에 늘 두고 세기만 바꿔 셰이더 재컴파일 없음)
  const lamp = new THREE.PointLight('#fff1d2', 0, 26, 1.3);
  lamp.name = 'namsan-cable-platform-light';
  group.add(lamp);

  let night = 0;
  const dom = createDom(() => act());

  // ---- 상태
  let lastBoard = cable.boardSeq || 0, lastArrive = cable.arriveSeq || 0;
  let canAct = false, actLabel = '';
  let time = 0;
  let repathT = 0;

  function nearestStation(x, z) {
    let best = null, bd = Infinity;
    for (const s of stations) {
      const d = Math.hypot(x - s.c.x, z - s.c.z);
      if (d < bd) { bd = d; best = s; }
    }
    return { st: best, d: bd };
  }

  function act() {
    if (!cable.atStation) return false;
    return cable.actBoard?.() || false;
  }

  function onKey(e) {
    if (e.repeat) return false;
    if (e.code !== 'KeyE' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return false;
    if (cable.riding || !cable.atStation) return false;
    e.preventDefault?.();
    act();
    return true;
  }

  function promptFor(st) {
    const dest = st.which === 'upper' ? tr('회현', 'Hoehyeon') : tr('남산타워', 'Namsan Tower');
    const next = cable.nextArrival;
    if (!cable.armed) {
      return { act: true, text: tr('케이블카 다시 타기', 'Ride back'), tap: tr('케이블카 다시 타기', 'Ride back'), sub: tr('나가는 문은 앞쪽이에요', 'Exit is straight ahead') };
    }
    if (cable.docked) {
      return { act: true, text: tr(`케이블카 타기 · ${dest}행`, `Board · to ${dest}`), tap: tr(`케이블카 타기 · ${dest}행`, `Board · to ${dest}`), sub: tr('곧 출발 · 이대로 서 있어도 탑승해요', 'Leaving soon · just stand to board') };
    }
    if (cable.queued) {
      return { act: false, text: tr(`탑승 예약됨 · ${dest}행`, `Queued · to ${dest}`), sub: tr(`다음 케이블카 <b>${mmss(next)}</b> 뒤 도착 · 이대로 서 있으면 탑승해요`, `Next cabin in <b>${mmss(next)}</b> · stay here to board`) };
    }
    const touch = isTouch();
    return {
      act: false,
      tapAct: true,
      text: tr('케이블카 기다리는 중… 이대로 서 있으면 탑승해요', 'Waiting for the cable car… just stand here to board'),
      tap: tr('케이블카 타기 예약', 'Queue for the cable car'),
      sub: touch
        ? tr(`다음 케이블카 <b>${mmss(next)}</b> 뒤 도착 · 이대로 서 있으면 탑승해요`, `Next cabin in <b>${mmss(next)}</b> · stand here to board`)
        : tr(`다음 케이블카 <b>${mmss(next)}</b> 뒤 도착 · <kbd>E</kbd> 누르면 오자마자 타요`, `Next cabin in <b>${mmss(next)}</b> · <kbd>E</kbd> to board as soon as it arrives`),
    };
  }

  let gCacheT = 0;
  let suppressed = false;
  function update(dt, player, camera) {
    time += dt;
    gCacheT += dt; if (gCacheT > 10) { gCacheT = 0; gCache.clear(); } // 늦게 올라온 남산 조각 높이도 반영
    if (!player) return;
    const P = player.position;
    // 토스트: 탑승·도착
    if (cable.boardSeq !== lastBoard) {
      lastBoard = cable.boardSeq;
      const dest = cable.rideDest === 'upper' ? tr('남산타워', 'Namsan Tower') : tr('회현', 'Hoehyeon');
      dom?.toast(tr(`🚠 ${dest}행 케이블카 탑승!`, `🚠 Cable car to ${dest}`), tr(`약 ${Math.round(cable.rideDur || 70)}초 · T 전망 전환`, `About ${Math.round(cable.rideDur || 70)}s · T to change view`), 3400);
    }
    if (cable.arriveSeq !== lastArrive) {
      lastArrive = cable.arriveSeq;
      const at = cable.lastArrived === 'upper' ? tr('남산타워', 'Namsan Tower') : tr('회현', 'Hoehyeon');
      dom?.toast(tr(`🚠 ${at} 도착`, `🚠 Arrived · ${at}`), cable.lastArrived === 'upper' ? tr('타워 입구는 노란 화살표를 따라가세요', 'Follow the yellow arrows to the tower') : tr('앞쪽 문으로 나가세요', 'Exit through the door ahead'), 3600);
    }
    const { st, d } = nearestStation(P.x, P.z);
    const riding = !!cable.riding;
    const atSt = cable.atStation;

    // 점광원: 가까운 정류장
    if (st && d < 160) {
      lamp.position.set(st.c.x + st.fx * 0.4, st.y + 5.2, st.c.z + st.fz * 0.4);
      lamp.intensity = 14 + night * 14;
    } else lamp.intensity = 0;

    // 표지: 멀수록 크게, 600 m 안에서만 벽 너머로도 보이게
    const cam = camera || null;
    for (let si = 0; si < signs.length; si++) {
      const sp = signs[si];
      const b = sp.userData.base;
      const cd = cam ? cam.position.distanceTo(b) : Math.hypot(P.x - b.x, P.z - b.z);
      // 가까운 정류장 표지만 (다른 정류장 표지가 산 너머로 비치면 헷갈린다), 승강장 안에서는 숨김
      sp.visible = !riding && !atSt && stations[si] === st && cd < SIGN_R;
      if (!sp.visible) continue;
      const k = Math.max(1, cd / 42);
      sp.scale.set(9 * k, 4.5 * k, 1);
      sp.position.set(b.x, b.y + Math.sin(time * 2.4) * 0.25 * Math.min(k, 3), b.z);
      const through = cd > 45;
      if (sp.material.depthTest === through) { sp.material.depthTest = !through; sp.material.needsUpdate = true; }
    }

    // 바닥 화살표
    const show = !suppressed && !riding && !atSt && st && d < SHOW_R; // [place-guide] 다른 길 안내 중이면 숨김
    if (!show) clearArrows();
    else {
      repathT -= dt;
      const k = `${st.which}|${Math.round(P.x / 3)}|${Math.round(P.z / 3)}`;
      if (k !== pathKey && repathT <= 0) {
        pathKey = k;
        repathT = 0.35;
        const idx = stations.indexOf(st);
        const path = graph.pathFrom(P.x, P.z, idx) || [[P.x, P.z], [st.out.x, st.out.z]];
        layPath(path, st);
      }
      // 문 쪽으로 흐르는 빛 (낮은 진한 파랑, 밤은 더 밝게)
      colA.lerpColors(colDayA, colNgtA, night);
      colB.lerpColors(colDayB, colNgtB, night);
      for (let i = 0; i < placed.length; i++) {
        const w = 0.5 + 0.5 * Math.sin((placed[i].s * 0.22) + time * 5.0);
        tmpC.copy(colA).lerp(colB, w * w * 0.75);
        arrows.setColorAt(i, tmpC);
      }
      if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
    }

    // 안내 문구
    let state = null;
    canAct = false; actLabel = '';
    if (!riding && atSt) {
      const s = stations.find((x) => x.which === atSt) || st;
      state = promptFor(s);
      canAct = !!(state.act || state.tapAct);
      actLabel = !cable.armed ? tr('다시 타기', 'Ride back') : cable.docked ? tr('케이블카', 'Board') : tr('탑승 예약', 'Queue');
    } else if (!riding && st && d < 38) {
      state = { act: false, text: tr('🚠 케이블카 타는 곳', '🚠 Cable car'), sub: tr('파란 화살표 따라 안으로 → 승강장에 서 있으면 탑승해요', 'Follow the blue arrows inside → stand on the platform to board') };
    }
    dom?.hint(state);
  }

  function setNight(v) {
    night = Math.max(0, Math.min(1, v || 0));
    for (const m of tintMats) m.emissiveIntensity = 0.12 + night * 0.22;
    tactMat.emissiveIntensity = 0.25 + night * 0.45;
  }

  // [myeongdong] 나중에 지어진 명동 골목을 길 그래프에 더한다 → 명동에서 화살표가 건물을 뚫지 않고 골목을 따라간다
  function addLines(extra) {
    if (!extra?.length) return;
    for (const p of extra) if (p?.length >= 2) lines.push(p);
    graph = buildCableGraph(lines, stations.map((s) => s.out));
    pathKey = ''; repathT = 0; gCache.clear();
  }

  return {
    group,
    get graph() { return graph; },
    addLines,
    stations,
    update,
    setNight,
    onKey,
    act,
    get canAct() { return canAct; },
    get actLabel() { return actLabel; },
    get arrowCount() { return arrows.count; },
    get suppressed() { return suppressed; },
    set suppressed(v) { suppressed = !!v; },
    dispose() { dom?.dispose(); parent.remove(group); },
  };
}

function pointInRing(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi)) inside = !inside;
  }
  return inside;
}
