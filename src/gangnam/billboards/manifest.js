// [gangnam-ads] 화면 id → 그림. 이 파일만 고치면 화면이 바뀐다.
//   src: 'builtin:bump' | 'builtin:world' | 'builtin:bump24' | 'builtin:gradient'
//        또는 사이트 안 경로('/corridor/gangnam/screens/foo.png' 처럼). 경로는 공유 아틀라스 칸에 그려 넣는다.
//   schedule: 있으면 4초마다 다음 src. 없으면 src 한 장.
//   지금 값은 임시 BUMP 자체 아트다. 최종 그림은 특급 디자이너가 오너 승인 뒤에 넣는다. README.md.
//   제3자 로고·상표·브랜드 색을 넣지 않는다.

export const ATLAS = { w: 1024, h: 256, cols: 4 };

export const BUILTIN = {
  'builtin:bump': 0,
  'builtin:world': 1,
  'builtin:bump24': 2,
  'builtin:gradient': 3,
};

/** @type {Record<string, { src: string, schedule?: string[] }>} */
export const SCREENS = {
  'pole-e11': { src: 'builtin:bump', schedule: ['builtin:bump', 'builtin:world', 'builtin:bump24'] },
  'pole-e10': { src: 'builtin:world', schedule: ['builtin:world', 'builtin:bump24', 'builtin:bump'] },
  'pole-e10s': { src: 'builtin:bump24', schedule: ['builtin:bump24', 'builtin:gradient', 'builtin:bump'] },
  'pole-e7': { src: 'builtin:gradient', schedule: ['builtin:gradient', 'builtin:bump'] },
  'pole-e2': { src: 'builtin:bump', schedule: ['builtin:bump', 'builtin:bump24'] },
  'pole-e12': { src: 'builtin:world', schedule: ['builtin:world', 'builtin:bump'] },
  'board-cross-w': { src: 'builtin:bump', schedule: ['builtin:bump', 'builtin:gradient', 'builtin:world'] },
  'board-cross-e': { src: 'builtin:world', schedule: ['builtin:world', 'builtin:bump24'] },
  'board-e11': { src: 'builtin:bump24', schedule: ['builtin:bump24', 'builtin:bump', 'builtin:gradient'] },
  'board-teh': { src: 'builtin:gradient', schedule: ['builtin:gradient', 'builtin:world', 'builtin:bump'] },
};

export const FRAME_SEC = 4;

export function gangnamAdsEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search || '');
  return q.get('gangnam') !== '0' && q.get('gangnamads') !== '0';
}
