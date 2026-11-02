// [camera] 선 아이콘 (인라인 SVG, 24×24, 같은 굵기). 폰트·이모지 글리프에 기대지 않아 어느 기기에서나 또렷하다.
const svg = (body, cls = '') => `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  // 앞/뒤 전환: 원을 도는 두 화살표
  flip: svg('<path d="M4.5 10.5a7.6 7.6 0 0 1 13.4-3.6"/><path d="M19.5 13.5a7.6 7.6 0 0 1-13.4 3.6"/><path d="M18.6 2.9v4.4h-4.4" /><path d="M5.4 21.1v-4.4h4.4"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  // 전체 화면 뷰어: 다음(›) · 원본 크기(바깥으로 벌어지는 모서리) · 화면에 맞춤(안으로 모이는 모서리)
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  actual: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  fit: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  grid: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  // 보관함에 저장: 받침 위로 내려앉는 화살표
  save: svg('<path d="M12 3.5v11"/><path d="M7.5 10l4.5 4.5 4.5-4.5"/><path d="M4 14.5v3.5a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-3.5"/>'),
  download: svg('<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/>'),
  share: svg('<path d="M12 3.5v11.5"/><path d="M8 7.5l4-4 4 4"/><path d="M8.5 10.5H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5"/>'),
  trash: svg('<path d="M4 6.5h16"/><path d="M9.5 6.5V4.5h5v2"/><path d="M6.5 6.5l.9 12.6a1.6 1.6 0 0 0 1.6 1.4h6a1.6 1.6 0 0 0 1.6-1.4l.9-12.6"/><path d="M10.2 10.5v6M13.8 10.5v6"/>'),
  tip: svg('<path d="M4 5.5h12.5a1.5 1.5 0 0 1 1.5 1.5v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M18 9h1.5a1 1 0 0 1 1 1v8.5a2 2 0 0 1-2 2"/><path d="M7.5 9.5h7M7.5 13h7M7.5 16.5h4"/>'),
};
