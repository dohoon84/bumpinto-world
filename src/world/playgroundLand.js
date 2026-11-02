// [playgrounds] 놀이터 조경: 나무 · 생울타리/덤불/풀숲 · 벤치 (+ 세트 밑 고무칩 바닥은 playgrounds.js 모래놀이터 부품에 포함)
//   위치: public/corridor/playground-land.json (scripts/corridor/playground-land.mjs 가 OSM 놀이터 폴리곤 안에 굽는다)
//   그리기: InstancedMesh 3개 — 나무(줄기+수관 1개 지오메트리), 초록이(생울타리·덤불·풀숲이 같은 저폴리 덩어리를 배율만 달리 씀), 벤치.
//           텍스처 없음. 나무 수관 색은 가로수(trees.js)와 같은 계절 팔레트. 벤치는 그림자를 그리지 않는다(드로우콜 절약).
//   보이기: playgrounds.js 가 보이는 세트의 놀이터 id 목록을 show() 로 넘긴다(같은 거리·타일 기준). 없으면 GPU 버퍼 해제.
//   ?pgland=0 이면 game.js 가 url 을 넘기지 않아 데이터 요청·메시가 없다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getSeason, pickFoliageColor } from './trees.js';

const SINK = 0.3;
const tmp = new THREE.Color();
/** 꼭짓점 색: 고정색, 또는 color 가 함수면 (y) => [r,g,b] */
function paint(g, color) {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const pos = g.attributes.position, a = new Float32Array(pos.count * 3);
  if (typeof color !== 'function') tmp.set(color);
  for (let i = 0; i < pos.count; i++) {
    const c = typeof color === 'function' ? color(pos.getY(i)) : [tmp.r, tmp.g, tmp.b];
    a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const grey = (y0, y1, lo) => (y) => { const v = lo + (1 - lo) * Math.min(1, Math.max(0, (y - y0) / (y1 - y0))); return [v, v, v]; };

/** 나무: 열린 5각 줄기(갈색) + 수관 2덩이(회색 그라데이션 → 런타임 instanceColor 로 물듦). 50 tris */
function treeGeometry() {
  const trunk = paint(new THREE.CylinderGeometry(0.17, 0.25, 3.2 + SINK, 5, 1, true).translate(0, (3.2 - SINK) / 2, 0), '#7a5a3e');
  const c1 = paint(new THREE.IcosahedronGeometry(2.0, 0).translate(0, 4.4, 0), grey(2.4, 6.4, 0.78));
  const c2 = paint(new THREE.IcosahedronGeometry(1.35, 0).translate(0.6, 5.5, 0.35), grey(2.4, 6.9, 0.78));
  return [trunk, c1, c2];
}
/** 초록이 덩어리: 단위 정이십면체, 바닥 -0.25 (배율 sy 만큼 땅에 묻힘). 아래가 어둡게. 20 tris */
function greenGeometry() {
  return [paint(new THREE.IcosahedronGeometry(1, 0).translate(0, 0.75, 0), grey(-0.25, 1.75, 0.62))];
}
/** 벤치: 좌판 + 등받이(+z 쪽) + 다리 2. 앞(-z)이 세트를 본다. 48 tris */
function benchGeometry() {
  const wood = '#b07a48', leg = '#5d6168';
  return [
    paint(new THREE.BoxGeometry(1.6, 0.06, 0.42).translate(0, 0.44, 0), wood),
    paint(new THREE.BoxGeometry(1.6, 0.3, 0.05).translate(0, 0.72, 0.22), wood),
    paint(new THREE.BoxGeometry(0.07, 0.44 + SINK, 0.42).translate(-0.65, (0.44 - SINK) / 2, 0), leg),
    paint(new THREE.BoxGeometry(0.07, 0.44 + SINK, 0.42).translate(0.65, (0.44 - SINK) / 2, 0), leg),
  ];
}
const KINDS = [
  { name: 'tree', make: treeGeometry, shadow: true, tint: true },
  { name: 'green', make: greenGeometry, shadow: true, tint: true },
  { name: 'bench', make: benchGeometry, shadow: false, tint: false },
];
/** 종류별 병합 지오메트리 (테스트/측정용 export) */
export function buildLandGeometries() {
  return KINDS.map((k) => {
    const parts = k.make(); const geometry = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    geometry.computeBoundingSphere();
    return { name: k.name, geometry };
  });
}

// 계절 팔레트 (나무 수관은 trees.js pickFoliageColor)
const PAL = {
  hedge: { spring: ['#4f8f45'], summer: ['#3f7b3c'], autumn: ['#3f7b3c', '#4a7f3a'], winter: ['#3d5f3a'] },
  bush: { spring: ['#6fb04f', '#6fb04f', '#e58fb0'], summer: ['#5d9e4b', '#6aa84f'], autumn: ['#5f9a4c', '#6e9f45', '#b8452f', '#c8642f'], winter: ['#5b6e4f', '#6d6a52'] },
  grass: { spring: ['#8fca5a'], summer: ['#78b34a', '#86bb52'], autumn: ['#a9ad58', '#b7ad5a', '#8fa64c'], winter: ['#a39a70'] },
};
const hashRnd = (x, z, k = 0) => { let s = (Math.abs(Math.floor(x * 73.1 + z * 191.7 + k * 7919)) % 2147483646) + 1; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; };
function pick(pal, season, rnd, out) {
  const list = pal[season] || pal.autumn;
  out.set(list[Math.floor(rnd() * list.length)]).offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08);
  return out;
}

/** 나무 수관만 instanceColor 로 물들이고 줄기(갈색 꼭짓점 색)는 그대로 둔다 */
function tintCrownsOnly(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
#if defined( USE_INSTANCING_COLOR ) && defined( USE_COLOR )
	vColor.rgb = color.rgb * mix( vec3( 1.0 ), instanceColor.rgb, step( abs( color.r - color.b ), 0.02 ) );
#endif`);
  };
  mat.customProgramCacheKey = () => 'pg-land-tree-tint';
  return mat;
}

export function createLandLayer({ root, terrain, url, season = getSeason() }) {
  const groundAt = (x, z) => (terrain ? terrain.renderHeight(x, z) : 0);
  let byId = null, step = 1.35, cap = null, meshes = null, mats = null, disposed = false;
  const stats = { loaded: false, playgrounds: 0, visible: 0, instances: { tree: 0, green: 0, bench: 0 }, triangles: {} };

  const ready = fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((j) => {
    if (!j || disposed) return;
    step = j.meta?.land?.hedgeStep || step;
    byId = new Map(j.playgrounds.map((p) => [p.id, { raw: p, data: null }]));
    cap = { tree: 0, green: 0, bench: 0 };
    for (const { raw: p } of byId.values()) {
      cap.tree += p.t?.length || 0; cap.bench += p.b?.length || 0;
      cap.green += (p.h || []).reduce((n, h) => n + h[3], 0) + (p.u?.length || 0) + 3 * (p.g?.length || 0);
    }
    stats.loaded = true; stats.playgrounds = byId.size;
  });

  // 놀이터 하나의 인스턴스 행렬·색 (처음 보일 때 한 번 만들어 둔다; 지형 높이 포함)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  function build(p) {
    const out = { tree: { m: [], c: [] }, green: { m: [], c: [] }, bench: { m: [], c: [] } };
    const put = (kind, x, z, ry, sx, sy, sz, color) => {
      q.setFromAxisAngle(up, ry); m4.compose(v.set(x, groundAt(x, z), z), q, sc.set(sx, sy, sz));
      out[kind].m.push(...m4.elements); if (color) out[kind].c.push(color.r, color.g, color.b);
    };
    for (const [x, z, s] of p.t || []) { const r = hashRnd(x, z, 1); put('tree', x, z, r() * 6.283, s, s * (0.92 + r() * 0.16), s, pickFoliageColor(r, season, col)); }
    for (const [x, z, ry] of p.b || []) put('bench', x, z, ry, 1, 1, 1, null);
    for (const [x0, z0, ang, n] of p.h || []) for (let i = 0; i < n; i++) {
      const x = x0 + Math.cos(ang) * step * i, z = z0 + Math.sin(ang) * step * i, r = hashRnd(x, z, 2);
      put('green', x, z, -ang, 0.82, 0.34 + r() * 0.04, 0.42, pick(PAL.hedge, season, r, col));
    }
    for (const [x, z, k] of p.u || []) { const r = hashRnd(x, z, 3); put('green', x, z, r() * 6.283, 0.9 * k, 0.55 * k, 0.9 * k, pick(PAL.bush, season, r, col)); }
    for (const [x, z] of p.g || []) {
      const r = hashRnd(x, z, 4);
      for (let i = 0; i < 3; i++) {
        const a = r() * 6.283, d = 0.15 + r() * 0.3, w = 0.28 + r() * 0.16;
        put('green', x + Math.cos(a) * d, z + Math.sin(a) * d, r() * 6.283, w, 0.32 + r() * 0.16, w, pick(PAL.grass, season, r, col));
      }
    }
    for (const k in out) { out[k].m = new Float32Array(out[k].m); out[k].c = new Float32Array(out[k].c); }
    return out;
  }

  function ensure() {
    if (meshes) return;
    const geos = buildLandGeometries();
    mats = {
      tree: tintCrownsOnly(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
      green: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      bench: new THREE.MeshLambertMaterial({ vertexColors: true }),
    };
    meshes = {};
    KINDS.forEach((k, i) => {
      const { geometry } = geos[i];
      stats.triangles[k.name] = geometry.attributes.position.count / 3;
      const m = new THREE.InstancedMesh(geometry, mats[k.name], Math.max(1, cap[k.name]));
      if (k.tint) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap[k.name]) * 3), 3);
      m.name = 'playground-land-' + k.name; m.castShadow = k.shadow; m.receiveShadow = k.name !== 'tree'; m.count = 0;
      root.add(m); meshes[k.name] = m;
    });
  }
  function free() {
    if (!meshes) return;
    for (const k in meshes) { const m = meshes[k]; root.remove(m); m.geometry.dispose(); m.dispose(); mats[k].dispose(); }
    meshes = null; mats = null;
  }

  return {
    ready, stats,
    /** 보이는 놀이터 id 목록 (playgrounds.js refresh 가 부른다) */
    show(ids) {
      if (!byId) return;
      const list = ids.map((id) => byId.get(id)).filter(Boolean);
      stats.visible = list.length;
      if (!list.length) { free(); for (const k in stats.instances) stats.instances[k] = 0; return; }
      ensure();
      for (const k in meshes) {
        const m = meshes[k]; let n = 0;
        for (const e of list) {
          e.data ||= build(e.raw);
          const d = e.data[k]; const cnt = d.m.length / 16;
          if (!cnt) continue;
          m.instanceMatrix.array.set(d.m, n * 16);
          if (m.instanceColor && d.c.length) m.instanceColor.array.set(d.c, n * 3);
          n += cnt;
        }
        m.count = n; stats.instances[k] = n;
        m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
      }
    },
    dispose() { disposed = true; free(); byId = null; },
  };
}
