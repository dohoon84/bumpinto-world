// 핸드폰·태블릿만 가린다. 데스크톱은 창을 줄여도 그대로 둔다.
// 모바일에서도 첫 화면인 3D 지구본(worldGate)까지는 둘러볼 수 있고,
// 동네 입장을 눌렀을 때 PC 전용 안내 모달을 띄운다.
import { isEn } from './i18n.js';

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
  const en = isEn();
  const cardP = panel.querySelector('.pc-only-card > p:not(.pc-only-kicker)');
  const copyBtnEl = panel.querySelector('[data-pc-only-copy]');
  const ghBtnEl = panel.querySelector('a.pc-only-btn');
  const closeBtnEl = panel.querySelector('[data-pc-only-close]');
  if (cardP) {
    cardP.innerHTML = en
      ? '3D open-world exploration and multiplayer run on <b>desktop browsers</b>.<br>Please visit <b>bumpinto.world</b> on your PC!'
      : '3D 오픈월드 탐험과 멀티플레이는 <b>PC 브라우저</b>에서 진행할 수 있습니다.<br>PC에서 <b>bumpinto.world</b>로 접속해 주세요!';
  }
  if (copyBtnEl) copyBtnEl.textContent = en ? '🔗 Copy Link for Desktop' : '🔗 PC에서 열기 위해 주소 복사';
  if (ghBtnEl) ghBtnEl.textContent = en ? '⭐ Explore on GitHub' : '⭐ GitHub 오픈소스 구경하기';
  if (closeBtnEl) closeBtnEl.textContent = en ? '🌏 Back to Globe' : '🌏 지구본으로 돌아가기';
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
          copyBtn.textContent = isEn() ? '✅ Link copied!' : '✅ 주소가 복사되었습니다!';
          setTimeout(() => { copyBtn.textContent = orig; }, 2200);
        } catch {
          prompt(
            isEn() ? 'Copy this URL to open on your PC browser:' : '아래 주소를 복사해 PC 브라우저에서 열어주세요:',
            'https://bumpinto.world',
          );
        }
      }
    });
  }
}
