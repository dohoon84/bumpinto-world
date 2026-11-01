// 탈것 라이더: 내 아바타의 몸통을 복제해 상체를 숙이고, 팔·다리는 두 마디 IK 로 손잡이·발판에 붙인다.
//   로드바이크(페달)와 슈퍼바이크(스텝)가 같이 쓴다. 관리자 크루저는 twoBone 만 쓴다.
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _j = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** 캡슐 o 를 a→b 사이에 늘여 붙인다 (o.userData.r = 캡슐 반지름). */
function limb(o, a, b) {
  _d.subVectors(b, a);
  const L = _d.length();
  o.position.addVectors(a, b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(_up, _d.normalize());
  o.scale.set(1, Math.max(0.05, L / (1 + 2 * o.userData.r)), 1);
}

/** 두 마디 팔다리: a → b, 관절은 bend 쪽으로 꺾인다. */
export function twoBone(o1, o2, a, b, l1, l2, bend) {
  const d = _a.subVectors(b, a);
  const L = Math.min(d.length(), l1 + l2 - 1e-3);
  const dir = d.normalize();
  const x = (l1 * l1 - l2 * l2 + L * L) / (2 * L);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const side = _s.copy(bend).addScaledVector(dir, -bend.dot(dir)).normalize();
  const j = _j.copy(a).addScaledVector(dir, x).addScaledVector(side, h);
  limb(o1, a, j);
  limb(o2, j, b);
}

function isHeadPiece(c, src) {
  const u = src?.userData || {};
  if (c === u.head || c === u.eyeL || c === u.eyeR) return true;
  return c.position?.y > 1.45; // 헤어 캡·모자·포니테일 등 (팔·몸통보다 위)
}

/** 아바타에서 헬멧 머리에 넘길 생김새 */
function lookOf(src, skinMat) {
  const headMesh = src?.userData?.head;
  const face = headMesh?.geometry?.type === 'BoxGeometry' ? 'square' : (headMesh?.scale?.y > 1.05 ? 'long' : 'round');
  let glasses = false;
  for (const c of src?.userData?.rig?.children || []) {
    if (c.geometry?.type === 'TorusGeometry' && c.position?.y > 1.5) { glasses = true; break; }
  }
  const gender = (src?.userData?.look?.gender || src?.userData?.gender) === 'f' ? 'f' : 'm';
  return { skin: skinMat?.color ? `#${skinMat.color.getHexString()}` : '#f2d0b0', face, glasses, gender };
}

const matCache = new Map();
const lambert = (c) => {
  if (!matCache.has(c)) matCache.set(c, new THREE.MeshLambertMaterial({ color: c }));
  return matCache.get(c);
};
// 라이더는 탈 때마다 다시 만든다(내 아바타·원격 피어 생김새). 지오메트리는 치수별로 하나만 두고 공유해 새지 않게 한다.
const geoCache = new Map();
const shared = (key, make) => geoCache.get(key) || geoCache.set(key, make()).get(key);
const capsule = (r) => shared(`c${r}`, () => new THREE.CapsuleGeometry(r, 1, 3, 8));

/**
 * 숙인 자세 라이더. pose 로 매 프레임 손·발을 맞춘다.
 * @param {THREE.Object3D} src 내 아바타(createAvatar) 또는 원격 피어 메시
 * @param {object} o hip, torso(앞으로 숙이는 각, rad), upperScale, helmet(look)→Object3D, shoe, glove, foot [w,h,d], leg [허벅지 r, 정강이 r], arm [위팔 r, 아래팔 r],
 *   neck?: { base [x,y,z] 몸통 좌표 목 밑동, up·fwd 탈것 좌표로 머리를 띄우는 양(m), r, color }
 */
export function buildTuckRider(src, o) {
  const g = new THREE.Group();
  g.name = 'gift-rider';
  const upper = new THREE.Group();
  upper.position.copy(o.hip);
  upper.rotation.x = o.torso;
  upper.scale.set(...o.upperScale);
  g.add(upper);
  const head = new THREE.Group();
  head.scale.setScalar(o.headScale ?? 0.8);
  head.rotation.x = o.headPitch ?? -0.1;
  g.add(head);
  const { legL, legR, armL, armR, handPhone, handUmbrella, rig } = src?.userData || {};
  let bodyMat = null;
  for (const c of rig?.children || []) {
    // 팔·다리·폰·우산은 IK 로 대신하고, 머리·헤어·모자는 헬멧으로 갈아 끼운다
    if (c === legL || c === legR || c === armL || c === armR || c === handPhone || c === handUmbrella) continue;
    if (isHeadPiece(c, src)) continue;
    const m = c.clone();
    m.castShadow = true;
    m.position.y -= 0.38;
    upper.add(m);
    if (c.geometry?.type === 'CapsuleGeometry' && !bodyMat) bodyMat = c.material;
  }
  bodyMat ||= lambert('#4f7cff');
  const pantsMat = legL?.material || lambert('#3b4252');
  const skinMat = src?.userData?.head?.material || bodyMat;
  head.add(o.helmet(lookOf(src, skinMat)));
  const mk = (r, m) => {
    const c = new THREE.Mesh(capsule(r), m);
    c.castShadow = true;
    c.userData.r = r;
    g.add(c);
    return c;
  };
  const footGeo = shared(`f${o.foot}`, () => new THREE.BoxGeometry(...o.foot));
  const handGeo = shared(`h${o.hand ?? 0.045}`, () => new THREE.SphereGeometry(o.hand ?? 0.045, 8, 6));
  const legs = [1, -1].map((sx) => {
    const foot = new THREE.Mesh(footGeo, lambert(o.shoe));
    foot.castShadow = true;
    g.add(foot);
    return { sx, thigh: mk(o.leg[0], pantsMat), shin: mk(o.leg[1], pantsMat), foot };
  });
  const arms = [1, -1].map((sx) => {
    const hand = new THREE.Mesh(handGeo, lambert(o.glove));
    g.add(hand);
    return { sx, upper: mk(o.arm[0], bodyMat), fore: mk(o.arm[1], bodyMat), hand };
  });
  // 목: 숙인 몸통 위로 머리를 띄워 앞을 보게 한다 (없으면 머리를 어깨 위에 바로 붙임)
  const neck = o.neck ? mk(o.neck.r ?? 0.05, o.neck.color ? lambert(o.neck.color) : skinMat) : null;
  g.userData = { upper, head, legs, arms, neck, neckOpt: o.neck || null };
  return g;
}

/**
 * @param {object} p frame(라이더가 붙은 그룹), grips[왼(+x), 오른(-x)], foot(sx, out)→frame 좌표 발끝,
 *   legLen [허벅지, 정강이], armLen [위팔, 아래팔], knee(sx)→Vector3, elbow(sx)→Vector3, footPitch
 */
export function poseTuckRider(rider, p) {
  const { upper, head, legs, arms, neck, neckOpt: N } = rider.userData;
  const F = p.frame;
  F.updateMatrixWorld(true);
  if (N) {
    // 목 밑동(몸통 좌표) → 탈것 좌표로 위·앞으로 띄운 머리 중심. 몸통이 숙여도 머리는 들려 앞을 본다
    const base = F.worldToLocal(upper.localToWorld(_p.set(...N.base))).clone();
    head.position.set(base.x, base.y + N.up, base.z + N.fwd);
    limb(neck, base, head.position);
  } else head.position.copy(F.worldToLocal(upper.localToWorld(_p.set(0, 0.9, 0.12))));
  for (const l of legs) {
    const hip = F.worldToLocal(upper.localToWorld(_p.set(l.sx * 0.15, 0.14, 0.03))).clone();
    const foot = p.foot(l.sx, new THREE.Vector3());
    const ankle = foot.clone();
    ankle.y += 0.045;
    ankle.z -= 0.05;
    twoBone(l.thigh, l.shin, hip, ankle, p.legLen[0], p.legLen[1], p.knee(l.sx));
    l.foot.position.copy(foot);
    l.foot.position.y += 0.02;
    l.foot.rotation.set(p.footPitch ?? 0.08, 0, 0);
  }
  for (const a of arms) {
    const sh = F.worldToLocal(upper.localToWorld(_p.set(a.sx * 0.27, 0.92, 0.06))).clone();
    const grip = F.worldToLocal(p.grips[a.sx > 0 ? 0 : 1].getWorldPosition(new THREE.Vector3()));
    twoBone(a.upper, a.fore, sh, grip, p.armLen[0], p.armLen[1], p.elbow(a.sx));
    a.hand.position.copy(grip);
  }
}
