// [gangnam-ads] 화면 id → 그림. 이 파일만 고치면 화면이 바뀐다.
//   src: 기본은 공식 CI '/corridor/gangnam/screens/bumpinto-logo.png' (비율 유지, 늘리지 않음).
//   schedule: 4초마다 다음 장. builtin:world · builtin:bump24 · builtin:gradient 는 글자 슬라이드.
//   builtin:bump 임시 글자는 빼 두었다. 제3자 로고는 넣지 않는다. README.md.

export const ATLAS = { w: 1024, h: 256, cols: 4 };

export const BUILTIN = {
  'builtin:world': 1,
  'builtin:bump24': 2,
  'builtin:gradient': 3,
};

const LOGO = '/corridor/gangnam/screens/bumpinto-logo.png';

/** @type {Record<string, { src: string, schedule?: string[] }>} */
export const SCREENS = {
  'pole-e11': { src: LOGO, schedule: [LOGO, 'builtin:world', 'builtin:bump24'] },
  'pole-e10': { src: LOGO, schedule: [LOGO, 'builtin:bump24', 'builtin:world'] },
  'pole-e10s': { src: LOGO, schedule: [LOGO, 'builtin:gradient'] },
  'pole-e7': { src: LOGO, schedule: [LOGO, 'builtin:world'] },
  'pole-e2': { src: LOGO, schedule: [LOGO, 'builtin:bump24'] },
  'pole-e12': { src: LOGO, schedule: [LOGO, 'builtin:world', 'builtin:gradient'] },
  'board-cross-w': { src: LOGO, schedule: [LOGO, 'builtin:gradient', 'builtin:world'] },
  'board-cross-e': { src: LOGO, schedule: [LOGO, 'builtin:bump24'] },
  'board-e11': { src: LOGO, schedule: [LOGO, 'builtin:world', 'builtin:bump24'] },
  'board-teh': { src: LOGO, schedule: [LOGO, 'builtin:gradient', 'builtin:bump24'] },
};

export const FRAME_SEC = 4;

export function gangnamAdsEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search || '');
  return q.get('gangnam') !== '0' && q.get('gangnamads') !== '0';
}
