// 작은 소품의 castShadow 를 끈다. 건물·지형·나무 그루터기/수관은 그대로 둔다.
//   그림자 패스 draw 를 줄인다 (수석 추정 ~-1000). 기본 켜짐. ?propshadow=0 이면 건드리지 않는다.
const KEEP = /building|facade|ground|terrain|dem|bridge|road|tree|trunk|crown|towers?|roof|bmesh|world-build/i;

export function propShadowsEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return s.get('propshadow') !== '0';
}

export function silenceSmallPropShadows(root, { maxRadius = 1.25 } = {}) {
  if (!root) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return;
    const tag = `${o.name || ''} ${o.userData?.kind || ''}`;
    if (KEEP.test(tag)) return;
    const g = o.geometry;
    if (!g) return;
    if (!g.boundingSphere) {
      try { g.computeBoundingSphere(); } catch { return; }
    }
    const r = g.boundingSphere?.radius;
    if (!(r > 0) || r > maxRadius) return;
    o.castShadow = false;
    n++;
  });
  return n;
}
