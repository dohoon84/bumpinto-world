// [colours] 건물 외벽·지붕 색: public/jeongja-colours.json (scripts/building-colours.mjs 가 만든다)
//   - 브이월드 GIS건물통합정보(구조·주용도·사용승인연도) 기반 추정색 + 사진 근거가 있는 랜드마크 수동색.
//   - buildWorld 의 기존 버텍스 컬러에만 들어간다 (추가 draw call / 텍스처 0).
//   - ?colours=0 이면 파일을 받지 않고 b.fc 도 없어서 기존 모습과 똑같다.
import * as THREE from 'three';
import { facadeKey } from '../world.js';

// paintFacade() 의 벽 바탕색 (src/world.js). 버텍스 색 = 목표색 / 바탕색 으로 보정해 화면에서 목표색이 나오게 한다.
const FACADE_WALL = { office: '#c5d0dc', commercial: '#d5dee8', residential: '#f0e2d2', house: '#efe6d8', school: '#f6e7d4', public: '#e7e0d2', yes: '#e6e2da' };
const MAX_DRIFT = 2.5; // m: 중심점이 이보다 어긋나면 (jeongja.json 재생성) 그 항목은 버린다

const centroid = (ring) => { let x = 0, z = 0; for (const p of ring) { x += p[0]; z += p[1]; } return [x / ring.length, z / ring.length]; };
const _base = new THREE.Color();

/**
 * jeongja-colours.json 을 data.buildings[i].fc = { wall, roof, tint, src } 로 붙인다.
 * wall/roof/tint 는 THREE.Color (linear). tint 는 벽 텍스처에 곱할 버텍스 색.
 * @returns {{ applied:number, dropped:number, bySrc:Object, attribution:string } | null}
 */
export function prepareBuildingColours(data, json) {
  if (!json?.b?.length || !data?.buildings) return null;
  const srcs = json.meta?.srcs || ['k-fallback', 'vworld-estimate', 'manual', 'mapillary'];
  let applied = 0, dropped = 0; const bySrc = {};
  for (const [idx, cx, cz, wall, roof, si] of json.b) {
    const b = data.buildings[idx];
    if (!b?.o?.length) { dropped++; continue; }
    const [bx, bz] = centroid(b.o);
    if (Math.hypot(bx - cx, bz - cz) > MAX_DRIFT) { dropped++; continue; }
    const w = new THREE.Color(wall), r = new THREE.Color(roof);
    _base.set(FACADE_WALL[facadeKey(b.k)] || FACADE_WALL.yes);
    const tint = new THREE.Color(Math.min(1, w.r / _base.r), Math.min(1, w.g / _base.g), Math.min(1, w.b / _base.b));
    const src = srcs[si] || 'vworld-estimate';
    b.fc = { wall: w, roof: r, tint, src };
    bySrc[src] = (bySrc[src] || 0) + 1;
    applied++;
  }
  if (!applied) return null;
  const stats = { applied, dropped, bySrc, attribution: json.meta?.attribution || '' };
  data.buildingColours = stats; // buildWorld 가 색 모드 외벽 재질을 고르는 신호
  return stats;
}

/**
 * 색 모드 외벽 재질 패치: 텍스처의 밝은 벽 부분에는 버텍스 색을 그대로, 어두운 유리 부분에는 절반만 곱한다.
 * (그래야 벽돌·석재 건물도 창이 탁하게 뭉개지지 않는다. 아주 어두운 외벽색 = 유리 커튼월은 유리까지 더 물든다)
 */
export function tintFacadeShader(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', /* glsl */`
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  {
    #ifdef USE_MAP
      float wallness = smoothstep( 0.3, 0.6, dot( sampledDiffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
    #else
      float wallness = 1.0;
    #endif
    float vl = dot( vColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    float glassMix = mix( 0.5, 0.85, smoothstep( 0.25, 0.1, vl ) );
    diffuseColor.rgb *= mix( mix( vec3( 1.0 ), vColor.rgb, glassMix ), vColor.rgb, wallness );
  }
#endif`);
  };
  mat.customProgramCacheKey = () => 'facade-colours';
  return mat;
}
