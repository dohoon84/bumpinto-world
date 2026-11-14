// [boot-fast] 로그인 뒤 첫 월드(정자)를 빨리 띄운다. 기본 켜짐. ?bootfast=0 이면 예전처럼 한 번에 다 짓는다.
export function bootFastEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  return s.get('bootfast') !== '0';
}

/** ?at= 이 남산·한강(또는 그 스폰)이면 해당 데이터를 부트에 받아야 한다. */
export function bootNeedsLandmarkData(search = typeof location !== 'undefined' ? location.search : '') {
  const s = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  const at = s.get('at') || '';
  if (!at) return false;
  return /ntower|namsan|myeongdong|명동|hangang|jamsu|jamsoo|banpo|jamwon|잠원|hapjeong|\bhap\b|잠수|반포|남산|한강|합정/.test(at);
}

export function markBoot(label) {
  try {
    if (typeof performance === 'undefined') return;
    performance.mark(`boot:${label}`);
    const boot = (typeof window !== 'undefined') ? (window.__boot ||= { steps: [] }) : null;
    if (boot) {
      const steps = boot.steps ||= [];
      const prev = steps.length ? steps[steps.length - 1].t : 0;
      const t = performance.now();
      steps.push({ label, t, dt: +(t - prev).toFixed(1) });
    }
  } catch { /* noop */ }
}
