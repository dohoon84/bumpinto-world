// [notice-images] 로컬 게시판에 사진 4장짜리 공지를 심고, 목록(아이콘만)·본문·라이트박스를 찍는다.
// 사용: npm run build && npx vite preview --port 4239 --strictPort
//       node scripts/shots-notice-images.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.BASE || 'http://127.0.0.1:4239/';
const OUT = process.env.OUT || '/opt/cursor/artifacts';
mkdirSync(OUT, { recursive: true });

const QS = 'passport=1&noticeimgdemo=1&npcs=0&taxis=0&police=0&trucks=0&bike=0&roadbike=0&superbike=0&bus=sim&bgm=0&ws=mock&shadow=0';

async function seed(page) {
  await page.addInitScript(() => {
    const paint = (c1, c2, label) => {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 400;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 400);
      grad.addColorStop(0, c1); grad.addColorStop(1, c2);
      g.fillStyle = grad; g.fillRect(0, 0, 640, 400);
      g.strokeStyle = '#ffe169'; g.lineWidth = 8; g.strokeRect(24, 24, 592, 352);
      g.fillStyle = '#ffe169'; g.font = '700 42px sans-serif'; g.textAlign = 'center';
      g.fillText(label, 320, 210);
      return c.toDataURL('image/jpeg', 0.85);
    };
    const now = Date.now();
    const post = (extra) => ({
      authorId: 'system', authorPhone: '01020000000', authorName: '크레이지랩스',
      views: 1, createdAt: now, updatedAt: now, ...extra,
    });
    const store = {
      nextPostId: 4,
      nextCommentId: 1,
      likes: [],
      comments: [],
      posts: [
        post({ id: 1, noticeKey: 'notice-2026-10-28-launch', category: 'notice', title: '런치', body: '런치' }),
        post({ id: 2, noticeKey: 'notice-2026-10-28-chat-and-board', category: 'notice', title: '업데이트', body: '업데이트' }),
        post({
          id: 3, category: 'notice',
          title: '야간 점검 안내 — 공지 이미지',
          body: '오늘 밤 정자역 일대 조명을 점검합니다. 아래 사진을 눌러 크게 볼 수 있습니다.',
          images: [
            { url: paint('#1d2e4b', '#0f192a', '1 정자역'), alt: '정자역 야간' },
            { url: paint('#14324a', '#f5a200', '2 탄천'), alt: '탄천 산책로' },
            { url: paint('#0f192a', '#4cc9f0', '3 광장'), alt: '정자역 광장' },
            { url: paint('#3a2a00', '#ffe169', '4 야간'), alt: '야간 조명' },
          ],
        }),
      ],
    };
    localStorage.setItem('jeongja3d.board.v1', JSON.stringify(store));
    localStorage.removeItem('bw.noticeSeen');
    if (!localStorage.getItem('jeongja3d.profile')) {
      localStorage.setItem('jeongja3d.profile', JSON.stringify({ name: 'Tester', look: {} }));
    }
  });
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function shoot(name, { mobile }) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
    : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await seed(page);
  const url = `${B}?${QS}${mobile ? '&mobile=1' : ''}`;
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => {
    const leave = document.getElementById('btn-leave');
    const modal = document.getElementById('board-modal');
    const list = modal.querySelector('.board-table');
    return leave && !leave.hidden && modal && !modal.hidden && list && list.querySelector('.ni-mark') && !list.querySelector('img') && !list.querySelector('.ni-more');
  }, null, { timeout: 180000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${mobile ? 'mobile' : 'pc'}-firstscreen.png` });

  await page.locator('#board-modal .title-btn:has(.ni-mark)').click();
  await page.waitForSelector('#board-modal .ni-detail .ni-thumb');
  await page.locator('#board-modal .board-body').evaluate((el) => { el.scrollTop = 0; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${mobile ? 'mobile' : 'pc'}-detail.png` });

  await page.locator('#board-modal .ni-detail .ni-thumb').first().click();
  await page.waitForSelector('#ni-lightbox img');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${mobile ? 'mobile' : 'pc'}-lightbox.png` });
  await page.locator('#ni-lightbox .ni-x').click();
  await page.waitForSelector('#ni-lightbox', { state: 'detached' });
  await ctx.close();
  console.log('shot', name);
}

const only = process.env.ONLY;
if (only !== 'mobile') await shoot('pc', { mobile: false });
if (only !== 'pc') await shoot('mobile', { mobile: true });
await browser.close();
console.log('shots done', OUT);
