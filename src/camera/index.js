// [camera] 휴대폰 카메라·사진 앱 — 게임에 붙는 얇은 입구.
// 여기서는 폰 홈 화면에 아이콘 두 개만 등록한다. 뷰파인더·사진 보관함·셔터음·IndexedDB 는
// 처음 앱을 열 때 ./cameraApp.js 를 동적 import 해서 만든다(닫혀 있으면 GPU·메모리·드로콜 0).
// ?camera=0 이면 아이콘조차 등록하지 않아 기존 화면과 완전히 같다.
import './glyphs.css';

// 뉴스 제보 버튼 노출 여부 (한 곳에서만 끄고 켠다). 서버 /news-tip 배포 전까지 false.
// false 여도 주소에 ?newstip=1 을 붙이면 그 세션만 켠다(시험용). newsTip.js·서버 코드는 그대로 둔다.
export const NEWS_TIP_ENABLED = false;

export function cameraEnabled(params) {
  return params?.get?.('camera') !== '0';
}

export function mountCamera({ handset, renderer, scene, camera, cam, params, sms, getInfo, getView } = {}) {
  if (!handset?.addApp || !cameraEnabled(params)) return null;
  const newsTip = NEWS_TIP_ENABLED || params?.get?.('newstip') === '1';
  const ctx = { handset, renderer, scene, camera, cam, sms, getInfo, getView, newsTip };
  let loading = null;
  let app = null;
  const load = () => (loading ||= import('./cameraApp.js').then((m) => (app = m.createCameraApp(ctx))));

  handset.addApp({
    id: 'camera', cls: 'camera', glyph: '<i class="cam-lens"></i>', label: { ko: '카메라', en: 'Camera' },
    launch() {
      // 폰 본체의 클릭 처리(닫혀 있으면 다시 여는)가 끝난 뒤에 닫아야 폰이 다시 열리지 않는다.
      setTimeout(() => handset.close(), 0);
      load().then((a) => a.openViewfinder()).catch((err) => console.warn('[camera] load failed', err));
    },
  });
  handset.addApp({
    id: 'photos', cls: 'photos', glyph: '<i class="ph-petals"></i>', label: { ko: '사진', en: 'Photos' },
    title: { ko: '사진', en: 'Photos' },
    render: (en) => `<div class="ph-root"><p class="hint">${en ? 'Loading…' : '불러오는 중…'}</p></div>`,
    mounted(pane) { load().then((a) => a.mountPhotos(pane)).catch(() => {}); },
    onAction(name, el) { app?.photosAction(name, el); },
  });

  return {
    get open() { return Boolean(app?.isOpen); },
    get loaded() { return Boolean(app); },
    close() { app?.closeViewfinder(); },
    // 테스트·스크린샷용
    load,
  };
}
