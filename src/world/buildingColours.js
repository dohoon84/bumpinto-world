// [colours] 건물 외벽·지붕 색: public/jeongja-colours.json (scripts/building-colours.mjs 가 만든다)
//   - 브이월드 GIS건물통합정보(구조·주용도·사용승인연도) 기반 추정색 + 사진 근거가 있는 랜드마크 수동색.
//   - buildWorld 의 기존 버텍스 컬러에만 들어간다 (추가 draw call / 텍스처 0).
//   - ?colours=0 이면 파일을 받지 않고 buildWorld 에 아무것도 넘기지 않아 기존 모습과 똑같다.
import * as THREE from 'three';
import { FACADE_WALL, facadeKey } from './facadePalette.js';
import { matchKeyedRows } from './keyedBuildings.js';

const SRCS = ['k-fallback', 'vworld-estimate', 'manual', 'mapillary']; // 파일 포맷의 src 코드 (meta.srcs 가 우선)

/**
 * jeongja-colours.json → { byIdx: Map<건물 인덱스, { wall, roof, tint, src }>, applied, dropped, bySrc } | null
 * wall/roof/tint 는 THREE.Color (linear). tint = 목표 외벽색 / 텍스처 벽 바탕색 (화면에서 목표색이 나오게 하는 버텍스 색)
 */
export function prepareBuildingColours(data, json) {
  const m = matchKeyedRows(data?.buildings, json);
  if (!m?.rows.length) return null;
  const f = json.meta.fields, iw = f.indexOf('wall'), ir = f.indexOf('roof'), is = f.indexOf('src');
  const srcs = json.meta.srcs || SRCS;
  const byIdx = new Map(), bySrc = {}, base = new THREE.Color();
  for (const { idx, b, row } of m.rows) {
    const wall = new THREE.Color(row[iw]), roof = new THREE.Color(row[ir]);
    base.set(FACADE_WALL[facadeKey(b.k)] || FACADE_WALL.yes);
    const tint = new THREE.Color(Math.min(1, wall.r / base.r), Math.min(1, wall.g / base.g), Math.min(1, wall.b / base.b));
    const src = srcs[row[is]] || 'vworld-estimate';
    byIdx.set(idx, { wall, roof, tint, src });
    bySrc[src] = (bySrc[src] || 0) + 1;
  }
  return { byIdx, applied: byIdx.size, dropped: m.dropped, bySrc };
}

/** buildWorld 건물 루프: 기본색(c)·지붕(roof)·벽 버텍스 색(wallTint)을 파일 색으로 바꾼다. */
export function applyFacadeColour(fc, c, roof, wallTint) {
  c.copy(fc.wall); roof.copy(fc.roof); wallTint.copy(fc.tint);
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
    const vec3 luma = vec3( 0.2126, 0.7152, 0.0722 );
    #ifdef USE_MAP
      float wallness = smoothstep( 0.3, 0.6, dot( sampledDiffuseColor.rgb, luma ) );
    #else
      float wallness = 1.0;
    #endif
    float glassMix = mix( 0.5, 0.85, smoothstep( 0.25, 0.1, dot( vColor.rgb, luma ) ) );
    diffuseColor.rgb *= mix( mix( vec3( 1.0 ), vColor.rgb, glassMix ), vColor.rgb, wallness );
  }
#endif`);
  };
  mat.customProgramCacheKey = () => 'facade-colours';
  return mat;
}
