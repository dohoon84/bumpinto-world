// [gangnam-ads] 화면 쿼드. 앞·뒤 모두 글자가 바른 방향으로 읽히게 한다.
//   CanvasTexture flipY=true: u=0 왼쪽, v=1 이 그림의 위.
//   앞(+로컬 Z 쪽 관찰자)의 오른쪽은 +로컬 X. 뒤(−로컬 Z)의 오른쪽은 −로컬 X.
//   그래서 뒷면은 U 를 뒤집어 같은 그림을 바른 순서로 보여 준다.

export const LOGO_SRC = '/corridor/gangnam/screens/bumpinto-logo.png';
export const LOGO_PX = { w: 689, h: 768 };
export const LOGO_ASPECT = LOGO_PX.w / LOGO_PX.h;
/** 짧은 변의 이 비율만큼을 네 변의 최소 여백으로 둔다. 로고는 화면 가장자리에 닿지 않는다. */
export const LOGO_PAD = 0.12;
/** 로고 바깥 여백. 로고 PNG 의 흰 바탕(#fefefe)과 똑같게 해서 로고 둘레에 사각 테두리가 보이지 않게 한다. */
export const LOGO_PAD_COLOR = '#fefefe';
/** 아틀라스 칸 내용 바깥. 선형 필터가 이웃 칸을 섞지 않게 양쪽에 둔다. */
export const ATLAS_GUTTER = 4;

export function atlasMetrics(cols, contentW, contentH, gutter = ATLAS_GUTTER) {
  const pitchX = contentW + gutter * 2;
  const pitchY = contentH + gutter * 2;
  return { gutter, contentW, contentH, pitchX, pitchY, cols, atlasW: pitchX * cols, atlasH: pitchY };
}

/** 화면 사각형 안에 로고 비율을 유지한 채 들어가는 크기. 늘리지 않는다. */
export function fitInside(boxW, boxH, aspect = LOGO_ASPECT) {
  const boxA = boxW / boxH;
  if (aspect > boxA) return { w: boxW, h: boxW / aspect };
  return { w: boxH * aspect, h: boxH };
}

/**
 * 화면 한가운데에 로고를 넣는다. 689:768 을 유지하고, 좌우·상하 여백은 각각 같다.
 * 네 변 모두 최소 LOGO_PAD × 짧은 변 만큼 비운다.
 */
export function logoPlacement(screenW, screenH, aspect = LOGO_ASPECT, pad = LOGO_PAD) {
  const m = Math.min(screenW, screenH) * pad;
  const fit = fitInside(screenW - 2 * m, screenH - 2 * m, aspect);
  return {
    w: fit.w,
    h: fit.h,
    mx: (screenW - fit.w) / 2,
    my: (screenH - fit.h) / 2,
  };
}

/**
 * 로고(또는 같은 칸)가 샘플하는 UV. 내용은 contentW×contentH 라 689:768 이 유지되고,
 * 칸 경계에서는 최소 0.5텍셀, 실제로는 gutter 만큼 안쪽이다.
 */
export function logoUvRect(cell, cols, contentW, contentH, gutter = ATLAS_GUTTER) {
  const m = atlasMetrics(cols, contentW, contentH, gutter);
  const x0 = cell * m.pitchX + gutter;
  const y0 = gutter;
  return {
    u0: x0 / m.atlasW,
    u1: (x0 + contentW) / m.atlasW,
    v0: y0 / m.atlasH,
    v1: (y0 + contentH) / m.atlasH,
  };
}

/**
 * 로컬 좌표 4꼭짓점. 순서 0,1,2 / 0,2,3 이 바깥에서 볼 때 CCW.
 * back=false: +Z 에서 봄. back=true: −Z 에서 봄.
 */
export function faceCorners({ w, h, cell, cols, back = false, z = 0.02, contentW, contentH, gutter = ATLAS_GUTTER }) {
  const hw = w / 2, hh = h / 2;
  const uv = logoUvRect(cell, cols, contentW, contentH, gutter);
  const u0 = uv.u0, u1 = uv.u1, v0 = uv.v0, v1 = uv.v1;
  const zz = back ? -Math.abs(z) : Math.abs(z);
  if (!back) {
    return [
      { lx: -hw, ly: -hh, lz: zz, u: u0, v: v0 },
      { lx: hw, ly: -hh, lz: zz, u: u1, v: v0 },
      { lx: hw, ly: hh, lz: zz, u: u1, v: v1 },
      { lx: -hw, ly: hh, lz: zz, u: u0, v: v1 },
    ];
  }
  return [
    { lx: hw, ly: -hh, lz: zz, u: u0, v: v0 },
    { lx: -hw, ly: -hh, lz: zz, u: u1, v: v0 },
    { lx: -hw, ly: hh, lz: zz, u: u1, v: v1 },
    { lx: hw, ly: hh, lz: zz, u: u0, v: v1 },
  ];
}

/** 관찰자 기준. front: +Z 에서 −Z 를 봄(오른쪽=+X). back: −Z 에서 +Z 를 봄(오른쪽=−X). */
export function viewerRightIsImageRight(corners, { back = false } = {}) {
  const top = corners.filter((c) => c.ly > 0);
  const left = back ? top.reduce((a, b) => (a.lx > b.lx ? a : b)) : top.reduce((a, b) => (a.lx < b.lx ? a : b));
  const right = back ? top.reduce((a, b) => (a.lx < b.lx ? a : b)) : top.reduce((a, b) => (a.lx > b.lx ? a : b));
  const upright = top.every((c) => c.v > corners.find((q) => q.ly < 0 && q.lx === c.lx)?.v);
  return upright && left.u < right.u;
}
