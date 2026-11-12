// [depot] 상품 모양 — 렌더 지오메트리(원래 자세, 중심 원점, 크기 p.size)와 cannon-es 충돌 모양.
//   shape: box(기본) · sphere(수박) · cyl(낱병) · bottles(병 묶음) · pillow(포대·봉지) · rolls(화장지 롤 팩) · tray(고기 트레이)
import * as THREE from 'three';

export function buildProductGeometry(p, { boxGeo }) {
  return boxGeo(...p.size);
}
export function addProductShape(body, p, CANNON) {
  const [sx, sy, sz] = p.size;
  body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
}
export { THREE };
