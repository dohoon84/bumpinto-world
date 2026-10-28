// 서버 인프라 후원 전광판 & 하단 QR 전단지 설정 파일
// 추후 실제 후원 계좌번호나 카카오페이/토스 송금 QR 이미지를 바꾸실 때 이 파일만 수정하시면
// 3D 전광판, 하단 전단지 포스터, 그리고 확대 모달에 모두 자동 반영됩니다.

export const DONATION_CONFIG = {
  // 1) 전광판 상단 LED에 흐르는 문구
  tickerText:
    '☕ 무료로 운영되는 Bumpinto World 오픈월드! 서버·실시간 버스 API 인프라 유지를 위해 커피 한 잔 후원해 주세요 ♥   ·   하단 QR 전단지 또는 F 키를 눌러 후원 안내 보기   ·   ',
  subBannerText: '100% 서버 · 도메인 · 트래픽 인프라 비용으로 사용됩니다',

  // 2) 후원 계좌 정보 (복사 버튼 클릭 시 복사됨)
  bankName: '카카오뱅크',
  accountNumber: '3333-00-0000000', // ← 실제 계좌번호로 변경해 주세요
  accountHolder: '김도훈 (크레이지랩스)',

  // 3) QR코드 이미지 경로 (예: '/donation-qr.png' 또는 '/crazylabs-qr.svg')
  //    별도 송금 QR 이미지를 public 폴더에 넣고 경로만 바꾸시면 전단지와 모달에 즉시 표시됩니다.
  qrImageUrl: `${import.meta.env?.BASE_URL || '/'}crazylabs-qr.svg`,

  // 4) 모달 안내 문구
  modalTitle: '☕ Bumpinto World 인프라 후원 안내',
  modalLead:
    'Bumpinto World는 광고나 유료 결제 없이 누구나 무료로 산책하고 소통할 수 있도록 개인 사비로 운영 중인 오픈소스 3D 월드입니다.',
  modalPoints: [
    '🛰️ 실시간 멀티플레이 웹소켓 & 입주민 번호부 서버 (Cloudflare Durable Objects)',
    '🚌 경기도 실시간 시내·광역버스 위치 및 정류장 도착 정보 API 중계',
    '🌏 신규 동네 확장 및 24시간 무중단 월드 호스팅 유지',
  ],
  modalNote:
    '보내주신 소중한 커피 한 잔은 전액 서버 인프라 유지비로 사용되며, 원하시는 분은 게시판이나 문자로 남겨주시면 전광판 감사 명단에도 올려드립니다! 🙏',
};
