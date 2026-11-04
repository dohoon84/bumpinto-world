// [econ-mobile] 모바일 경제 UI 진입점. game.js 가 모바일 + ?ui=v2 일 때만 동적으로 부른다(PC 와 같은 플래그, 별도 청크).
//   PC 경제 UI(src/ui-v2/econ-ui)의 데이터·흐름·패널을 그대로 쓰고, 모바일에서 다른 것만 여기서:
//   - HUD: 프로필 칩 안 잔액 + 2행 할 일·이동 칩 (hud.js, useAltHud 로 PC HUD 자리에 끼움)
//   - 지갑(07): 게임 폰의 기존 '교통카드' 앱을 연다
//   - 스타일: PC CSS 를 body.mobile.m-econ 범위로 다시 쓰고(rescope.js) 모바일 시트·토스트 배치로 덮음(econ-m.css)
//   - ☰ 메뉴에 'bum' 묶음(할 일 · 교통카드 · 카르마·업적 · 탈것 상점 · 계정 연동)
import './econ-m.css';
import { injectEconCss } from './rescope.js';
import * as mhud from './hud.js';
import { useAltHud } from '../../ui-v2/econ-ui/hud.js';
import { econ } from '../../ui-v2/econ/index.js';
import { tr, esc, EI } from '../../ui-v2/econ-ui/kit.js';
import { GOOGLE_G_SVG } from '../../ui-v2/google.js';
import { mountMenuSection } from './menu.js';
import { close as closeLayer } from '../../ui-v2/econ-ui/layer.js';

export function isMobileEcon(search = location.search) {
  return document.body.classList.contains('mobile') && new URLSearchParams(search).get('ui') === 'v2';
}

export async function mountMobileEcon({ handset } = {}) {
  if (!isMobileEcon()) return null;
  injectEconCss();
  useAltHud(mhud);
  const ui = await import('../../ui-v2/econ-ui/index.js');
  const api = ui.mountEconUi({ mobile: true });
  if (!api) return null;
  // 07 지갑 = 게임 폰의 기존 '교통카드' 앱을 그대로 연다(모바일은 별도 지갑 화면·장식 없음, PC walletApp.js 도 모바일에서는 등록 안 함)
  const wallet = { open: () => { closeLayer(true); handset?.openApp?.('wallet'); } };
  ui.OPEN['07'] = () => wallet.open();
  mountMenuSection({ open: api.open, link: api.link, isDemo: ui.isDemo, econ, tr, esc, EI, GOOGLE_G_SVG });
  window.__bwEconMobile = { open: api.open, link: api.link, wallet, econ: econ.isMock ? econ : undefined }; // 점검·스크린샷용(econ 은 mock 일 때만)
  return api;
}
