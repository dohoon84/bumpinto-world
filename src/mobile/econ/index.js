// [econ-mobile] 모바일 경제 UI 진입점. game.js 가 모바일 + ?ui=v2 일 때만 동적으로 부른다(PC 와 같은 플래그, 별도 청크).
//   PC 경제 UI(src/ui-v2/econ-ui)의 데이터·흐름·패널을 그대로 쓰고, 모바일에서 다른 것만 여기서:
//   - HUD: 프로필 칩 안 잔액 + 2행 할 일·이동 칩 (hud.js, useAltHud 로 PC HUD 자리에 끼움)
//   - 지갑(07): 게임 폰의 기존 '교통카드' 앱을 연다
//   - 스타일: PC CSS 를 body.mobile.m-econ 범위로 다시 쓰고(rescope.js) 모바일 시트·토스트 배치로 덮음(econ-m.css)
//   - ☰ 메뉴에 'bum' 묶음(할 일 · 교통카드 · 카르마·업적 · 탈것 상점 · 계정 연동)
import { uiV2Wanted } from '../../ui-v2/flag.js'; // [ui-v2-default]
import './econ-m.css';
import { injectEconCss } from './rescope.js';
import * as mhud from './hud.js';
import { useAltHud } from '../../ui-v2/econ-ui/hud.js';
import { econ } from '../../ui-v2/econ/index.js';
import { tr, esc, EI } from '../../ui-v2/econ-ui/kit.js';
import { GOOGLE_G_SVG } from '../../ui-v2/google.js';
import { mountMenuSection } from './menu.js';
import { close as closeLayer } from '../../ui-v2/econ-ui/layer.js';
import { coinSound, createCoinSound } from '../../ui-v2/econ-ui/coinSound.js';
import { startResumeSaver, whoOf } from '../../ui-v2/resume.js';

/** 모바일 코인 효과음: PC 와 같은 createCoinSound(400 ms 겹침 방지 · 이동/게시판 짧게)를 기기 볼륨만으로.
 *  PC 패널(panels.js)이 부르는 공용 coinSound.play / get 을 이 인스턴스로 돌린다(모바일에서만 실행 → PC 무관, BGM 볼륨 슬라이더와 무관).
 *  iOS 는 터치 입력 뒤에만 소리: 공용 잠금 해제(pointerdown·keydown)에 더해 touchend·pointerup 에서도 resume(iOS 사용자 활성화는 touchend 기준). */
function useMobileCoinSound() {
  let sfxOff = false; try { sfxOff = new URLSearchParams(location.search).get('rideSfx') === '0'; } catch { /* noop */ }
  const cs = createCoinSound({ getLevel: () => ({ muted: false, volume: 1 }), sfxOff });
  coinSound.play = (kind) => cs.play(kind);
  coinSound.get = () => cs;
  if (!sfxOff) for (const ev of ['touchend', 'pointerup']) window.addEventListener(ev, () => { if (cs.state !== 'running' || !cs.ready) cs.unlock(); }, { capture: true, passive: true });
  return cs;
}

export function isMobileEcon(search = location.search) {
  return document.body.classList.contains('mobile') && uiV2Wanted(search);
}

export async function mountMobileEcon({ handset } = {}) {
  // [econ-mobile] 그만둔 자리 저장 (PC bf72209 와 같은 키·규칙: bw.uiv2.resume.v1, 계정/게스트 × 월드, 4초 타이머 1개 · 탑승·지하·입장 전 제외)
  let rses = null;
  econ.getSession().then((x) => { rses = x; }).catch(() => {}); econ.on('session', (x) => { rses = x; });
  startResumeSaver(new URLSearchParams(location.search).get('region') || 'jeongja', () => whoOf(rses));
  if (!isMobileEcon()) return null;
  injectEconCss();
  useAltHud(mhud);
  const coin = useMobileCoinSound();
  const ui = await import('../../ui-v2/econ-ui/index.js');
  const api = ui.mountEconUi({ mobile: true });
  if (!api) return null;
  // 07 지갑 = 게임 폰의 기존 '교통카드' 앱. 내용(bum 잔액·무료(베타)·이번 주·전체/탑승/보상 내역·게스트 연동)은 PC walletApp.js 장식을
  //   그대로 쓰고(mountEconUi({ mobile:true }) → mountWalletApp({ mobile:true })), 모바일 폰 오버레이 배치만 econ-m.css 에서 맞춘다.
  const wallet = { open: () => ui.OPEN['07']() };
  mountMenuSection({ open: api.open, link: api.link, isDemo: ui.isDemo, econ, tr, esc, EI, GOOGLE_G_SVG });
  window.__bwEconMobile = { open: api.open, link: api.link, wallet, closePhone: () => handset?.close?.(), coin, econ: econ.isMock ? econ : undefined }; // 점검·스크린샷용(econ 은 mock 일 때만)
  return api;
}
