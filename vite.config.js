import { defineConfig } from 'vite';

// [local-stack] npm run dev:all (scripts/dev-all.mjs) 이 BW_LOCAL_STACK=1 로 띄울 때만:
//   - 0.0.0.0 으로 열어 같은 와이파이의 아이폰이 http://<맥 LAN IP>:5173 로 들어온다
//   - /_phone/* (웹소켓 포함) → 로컬 wrangler dev(server/phone, 127.0.0.1:8789) 로 넘긴다
//     → 페이지와 API 가 같은 출처라 세션 쿠키(SameSite=Lax)가 PC·아이폰·터널 어디서든 그대로 실린다
//   - 번호부·계정·웹소켓 주소를 "지금 페이지 출처 + /_phone" 으로(접속한 주소가 localhost 든 172.x 든 맞게)
//   - 계정 기능(VITE_ACCOUNTS) 기본 켬. 운영 빌드(npm run build)에는 아무 영향 없음.
const LOCAL = process.env.BW_LOCAL_STACK === '1';
const PHONE = process.env.BW_PHONE_TARGET || 'http://127.0.0.1:8789';
const here = (suffix, ws = false) => `${ws ? 'globalThis.location.origin.replace(/^http/, "ws")' : 'globalThis.location.origin'} + ${JSON.stringify(suffix)}`;

const local = !LOCAL ? {} : {
  server: {
    host: '0.0.0.0',
    port: Number(process.env.BW_VITE_PORT || 5173),
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'], // 선택: cloudflared 빠른 터널(https) 로 실제 구글 로그인 시험
    proxy: {
      '/_phone': { target: PHONE, changeOrigin: true, ws: true, rewrite: (p) => p.replace(/^\/_phone/, '') || '/' },
    },
  },
  define: {
    'import.meta.env.VITE_PHONE_URL': here('/_phone'),
    'import.meta.env.VITE_ACCOUNT_API_URL': here('/_phone'),
    'import.meta.env.VITE_WS_URL': here('/_phone/ws', true),
    'import.meta.env.VITE_ACCOUNTS': JSON.stringify('1'),
    // [accounts] 로컬 스택 표시: localhost 에서도 번호부(sms)를 위 /_phone 으로 쓴다(src/sms.js smsBase). 없으면 localhost = 로컬 테스트 모드(번호부 꺼짐)
    'import.meta.env.VITE_LOCAL_STACK': JSON.stringify('1'),
  },
};

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  ...local,
});
