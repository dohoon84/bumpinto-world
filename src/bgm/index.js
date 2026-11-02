// [bgm] 배경음악: 월드에 입장하면 opening_day 부터 재생 목록을 크로스페이드로 이어서 무한 반복 + 상단 가운데 미니 플레이어
//   ?bgm=0 이면 아무것도 설치하지 않는다(소리·HUD 없음). 볼륨·음소거는 localStorage(bw.bgmVolume / bw.bgmMuted) 에 저장
//   디버그 훅(window.__jj.bgm.debug): 개발 서버이거나 ?bgmDebug=1 일 때만
import { createBgmPlayer } from './player.js';
import { createBgmHud } from './hud.js';
import { tr, onLangChange } from '../i18n.js';

export function mountBgm({ params, base = import.meta.env.BASE_URL }) {
  if (params.get('bgm') === '0' || typeof window === 'undefined') return null;
  if (!(window.AudioContext || window.webkitAudioContext)) return null;
  let hud = null;
  const debug = import.meta.env.DEV || params.get('bgmDebug') === '1';
  const player = createBgmPlayer({ base, debug, onChange: () => hud?.render() });
  hud = createBgmHud({ player, tr, onLangChange });
  return {
    player,
    hud,
    debug: player.debug || null,
    /** 월드 입장(로비 → 게임): HUD 표시 + 재생(사용자 입력이 아직 없었다면 첫 클릭/키 입력 때) */
    enter() { hud.show(); player.enter(); },
    /** 월드에서 나감(지구본·로비): 페이드아웃 후 정지 + HUD 숨김. 다시 들어오면 opening_day 부터 */
    leave() { player.leave(); hud.hide(); },
    /** 탈것 효과음이 나는 동안 살짝 줄이기 (매 프레임 호출해도 바뀔 때만 동작) */
    setDuck: (on) => player.setDuck(on),
  };
}
