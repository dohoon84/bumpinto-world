// [gyeongbu] 경부고속도로 서울 방면 '준비 중' 안내 (도로는 건드리지 않음 — 판교·경부 도로는 다른 브랜치 담당)
//   게임 안 경부고속도로(라이브 정자 + 코리더 타일 -1_-4)는 x ≈ -466..-438 을 따라 z ≈ -1834 (금곡동 북쪽) 에서 끝난다.
//   그 북쪽 끝(서울 방면)에 가까이 가면 안내만 띄운다. ?gyeongbu=0 이면 끔. 걷기·운전 모두 같은 위치로 판정.
export const GYEONGBU_SOON = Object.freeze({ x0: -540, x1: -360, z: -1740 }); // 끝(-1834)보다 ~90m 앞에서
export const gyeongbuSoonAt = (x, z, a = GYEONGBU_SOON) => x >= a.x0 && x <= a.x1 && z <= a.z;

export function mountGyeongbuSoon({ getPos, params, isEn = () => false }) {
  if (params?.get?.('gyeongbu') === '0') return null;
  const el = document.createElement('div');
  el.id = 'gyeongbu-soon';
  el.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:190;background:rgba(20,24,30,.9);color:#fff;padding:10px 18px;border-radius:12px;font:600 15px/1.4 system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .3s;text-align:center;white-space:nowrap';
  document.body.appendChild(el);
  let inZone = false, showT = 0;
  return {
    tick(dt) {
      const p = getPos?.();
      const now = !!p && gyeongbuSoonAt(p.x, p.z);
      if (now && !inZone) {
        const en = isEn();
        el.innerHTML = en ? '🛣️ Gyeongbu Expressway toward Seoul<br><b>Coming soon</b>' : '🛣️ 경부고속도로 서울 방면<br><b>준비 중이에요</b> · Coming soon';
        el.style.opacity = '1'; showT = 4;
      }
      inZone = now;
      if (showT > 0 && (showT -= dt) <= 0) el.style.opacity = '0';
    },
    get shown() { return showT > 0; },
    dispose() { el.remove(); },
  };
}
