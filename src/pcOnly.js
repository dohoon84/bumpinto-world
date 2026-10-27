// 핸드폰·태블릿만 가린다. 데스크톱은 창을 줄여도 그대로 둔다.
// 모바일에서도 첫 화면인 3D 지구본(worldGate)까지는 둘러볼 수 있고,
// 정자동 입장을 눌렀을 때 PC 전용 안내 모달을 띄운다.
export function isHandheld() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  if (/iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini|CriOS|FxiOS|EdgiOS|Mobile|Silk|Kindle|PlayBook/i.test(ua)) return true;
  if (/iPhone|iPad|iPod/i.test(platform)) return true;
  if (navigator.userAgentData?.mobile === true) return true;

  const points = Number(navigator.maxTouchPoints) || 0;
  // iPadOS는 데스크톱 Safari로 속이고, 터치 포인트만 남긴다.
  if (points > 1 && (/Macintosh|Mac OS X/i.test(ua) || platform === 'MacIntel')) return true;

  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && points > 0;
}

export function showPcOnly({ onClose } = {}) {
  const panel = document.getElementById('pc-only');
  if (!panel) return;
  panel.hidden = false;

  if (!panel.dataset.bound) {
    panel.dataset.bound = '1';
    panel.addEventListener('click', async (e) => {
      if (e.target === panel || e.target.closest('[data-pc-only-close]')) {
        panel.hidden = true;
        onClose?.();
        return;
      }
      const copyBtn = e.target.closest('[data-pc-only-copy]');
      if (copyBtn) {
        try {
          await navigator.clipboard.writeText('https://bumpinto.world');
          const orig = copyBtn.textContent;
          copyBtn.textContent = '✅ 주소가 복사되었습니다!';
          setTimeout(() => { copyBtn.textContent = orig; }, 2200);
        } catch {
          prompt('아래 주소를 복사해 PC 브라우저에서 열어주세요:', 'https://bumpinto.world');
        }
      }
    });
  }
}
