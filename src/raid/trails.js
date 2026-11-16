// 무기 잔상. 소켓 월드 좌표를 매 프레임 기록해 리본으로 그린다.
// 수치와 클립 구간은 public/dungeon/chars/trail 사양(v4.1)과 같다.
import * as THREE from 'three';

const MAX = 48;
const SPEED_MIN = 1.5;

const SPEC = {
  warrior: {
    len: 0.22,
    pairs: [['trail_base', 'trail_tip']],
    clips: { attack: [0.25, 0.62], skill1: [0.3, 0.62] },
  },
  mage: {
    len: 0.18,
    width: 0.22,
    tips: ['trail_tip'],
    clips: { attack: [0.28, 0.55], cast: [0.2, 0.7], skill1: [0.2, 0.6] },
  },
  priest: {
    len: 0.2,
    width: 0.24,
    tips: ['trail_tip'],
    clips: { attack: [0.28, 0.6], cast: [0.1, 0.4], skill1: [0.28, 0.55] },
  },
  archer: {
    len: 0.14,
    width: 0.1,
    tips: ['trail_tip_top', 'trail_tip_bottom'],
    clips: { attack: [0.2, 0.65], cast: [0.6, 0.85], skill1: [0.1, 0.8] },
  },
  assassin: {
    len: 0.16,
    pairs: [['trail_base_L', 'trail_tip_L'], ['trail_base_R', 'trail_tip_R']],
    clips: { attack: [0.2, 0.65], skill1: [0.2, 0.65] },
  },
};

const texCache = new Map();
function loadTex(url) {
  if (texCache.has(url)) return texCache.get(url);
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  texCache.set(url, tex);
  return tex;
}

function ribbonMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function makeRibbon(map) {
  const pos = new Float32Array(MAX * 2 * 3);
  const uv = new Float32Array(MAX * 2 * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let i = 0; i < MAX - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, ribbonMaterial(map));
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.visible = false;
  return { mesh, pos, uv, geo, hist: [], lastTip: null, recording: false };
}

const bound = new WeakMap();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmpHand = new THREE.Vector3();

function findHand(group) {
  let hand = null;
  group.traverse((o) => {
    if (!hand && o.name === 'hand_R') hand = o;
  });
  return hand;
}

function inWindow(spec, clip, norm) {
  const span = spec.clips[clip];
  return !!span && norm >= span[0] && norm <= span[1];
}

export function attachTrails(group, classId, scene) {
  const spec = SPEC[classId];
  if (!spec || bound.has(group)) return;
  const trailMap = loadTex(`/dungeon/chars/trail/${classId}-trail.png`);
  const tipMap = loadTex(`/dungeon/chars/trail/${classId}-tip.png`);
  const sockets = {};
  group.traverse((o) => {
    if (o.name && o.name.startsWith('trail_')) sockets[o.name] = o;
  });
  const ribbons = [];
  const tips = [];
  const pairs = spec.pairs || (spec.tips || []).map((name) => [null, name]);
  for (const [baseName, tipName] of pairs) {
    if (!sockets[tipName]) continue;
    const ribbon = makeRibbon(trailMap);
    scene.add(ribbon.mesh);
    ribbons.push({ ...ribbon, base: baseName ? sockets[baseName] : null, tip: sockets[tipName], width: spec.width || 0 });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tipMap,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }));
    sprite.frustumCulled = false;
    sprite.renderOrder = 7;
    sprite.scale.setScalar(0.18);
    scene.add(sprite);
    tips.push({ sprite, tip: sockets[tipName] });
  }
  const hand = findHand(group);
  bound.set(group, { spec, ribbons, tips, hand });
}

export function updateTrails(group, now) {
  const bag = bound.get(group);
  if (!bag || !group.visible) {
    if (bag) {
      for (const r of bag.ribbons) r.mesh.visible = false;
      for (const t of bag.tips) t.sprite.visible = false;
    }
    return;
  }
  const clip = group.userData.clipName || '';
  const dur = group.userData.clipDur || 1;
  const norm = dur > 0 ? (group.userData.clipTime || 0) / dur : 0;
  const active = inWindow(bag.spec, clip, norm);
  const len = bag.spec.len;
  for (const ribbon of bag.ribbons) {
    if (active && !ribbon.recording) {
      ribbon.hist.length = 0;
      ribbon.lastTip = null;
      ribbon.recording = true;
    }
    if (!active) ribbon.recording = false;
    if (ribbon.recording) {
      ribbon.tip.getWorldPosition(tmp);
      const speed = ribbon.lastTip ? tmp.distanceTo(ribbon.lastTip) / Math.max(1 / 120, now - (ribbon.hist.at(-1)?.t || now)) : SPEED_MIN;
      if (!ribbon.lastTip || speed >= SPEED_MIN) {
        const T = tmp.clone();
        let B;
        if (ribbon.base) {
          ribbon.base.getWorldPosition(tmp2);
          B = tmp2.clone();
        } else if (bag.hand) {
          bag.hand.getWorldPosition(tmpHand);
          B = T.clone().add(tmpHand.sub(T).normalize().multiplyScalar(ribbon.width || 0.22));
        } else {
          B = T.clone();
          B.y -= ribbon.width || 0.22;
        }
        ribbon.hist.push({ t: now, B, T });
        ribbon.lastTip = T.clone();
      }
    }
    while (ribbon.hist.length && now - ribbon.hist[0].t > len) ribbon.hist.shift();
    const n = Math.min(ribbon.hist.length, MAX);
    ribbon.mesh.visible = n >= 2;
    if (n >= 2) {
      for (let i = 0; i < n; i++) {
        const h = ribbon.hist[ribbon.hist.length - 1 - i];
        const age = (now - h.t) / len;
        const o = i * 6;
        ribbon.pos[o] = h.B.x;
        ribbon.pos[o + 1] = h.B.y;
        ribbon.pos[o + 2] = h.B.z;
        ribbon.pos[o + 3] = h.T.x;
        ribbon.pos[o + 4] = h.T.y;
        ribbon.pos[o + 5] = h.T.z;
        ribbon.uv[i * 4] = age;
        ribbon.uv[i * 4 + 1] = 0;
        ribbon.uv[i * 4 + 2] = age;
        ribbon.uv[i * 4 + 3] = 1;
      }
      ribbon.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
      ribbon.geo.attributes.position.needsUpdate = true;
      ribbon.geo.attributes.uv.needsUpdate = true;
    }
  }
  for (const tip of bag.tips) {
    tip.tip.getWorldPosition(tmp);
    tip.sprite.position.copy(tmp);
    tip.sprite.visible = true;
    const hot = active ? 0.28 : 0.18;
    tip.sprite.scale.setScalar(hot);
    tip.sprite.material.opacity = active ? 1 : 0.35;
  }
}
