// [mobile-profile] 폰 GPU·메모리 프로필. 기본 켜짐. ?mprof=0 이면 예전 설정(MSAA 켜짐, pixelRatio 최대 1.5).
//   logarithmicDepthBuffer 는 기본으로 켠다. 남산·한강이 원점에서 수~20km 이고 떠다니는 원점도 없어서
//   끄면 차선·횡단보도·수면이 깜빡일 수 있다 (수석 리뷰: 끄려면 전후 스크린샷 비교가 필요).

export function mobileProfileEnabled(search, mobileMode) {
  if (!mobileMode) return false;
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || (typeof location !== 'undefined' ? location.search : ''));
  return s.get('mprof') !== '0';
}

export function mobileProfile(search, mobileMode) {
  const on = mobileProfileEnabled(search, mobileMode);
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return {
    on,
    // 컨텍스트 만들기 전에 결정해야 한다 (antialias · logarithmicDepthBuffer 는 생성 시점 옵션).
    antialias: !on,
    logarithmicDepthBuffer: true,
    // 프로필 켜짐: 1.0 (동적 상한 1.25). 꺼짐: 폰 1.5 · PC 2.
    pixelRatio: on ? 1 : Math.min(dpr, mobileMode ? 1.5 : 2),
    maxPixelRatio: on ? 1.25 : (mobileMode ? 1.5 : 2),
    near: 0.3,
    far: 5000,
  };
}
