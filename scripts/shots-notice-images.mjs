// [notice-images] 로컬 게시판에 사진 4장짜리 공지를 심고, 목록(아이콘만)·본문·라이트박스를 찍는다.
// 사용: npm run build && npx vite preview --port 4239 --strictPort
//       node scripts/shots-notice-images.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

function png(w, h, paint) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y, w, h);
      const i = y * (w * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
    }
  }
  const crc = (buf) => {
    let c = ~0;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
writeFileSync('/tmp/notice-a.png', png(240, 140, (x, y, w, h) => [20 + (x / w) * 30, 40, 70 + (1 - y / h) * 40]));
writeFileSync('/tmp/notice-b.png', png(240, 140, (x, y, w) => (Math.floor(x / 30) % 2 ? [255, 225, 105] : [18, 32, 51 + y])));

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
          body: [
            '오늘 밤 정자역 일대 조명을 점검합니다.',
            '',
            '[사진1]',
            '',
            '점검이 끝나면 광장을 다시 엽니다.',
            '',
            '[사진2]',
            '',
            '이용해 주셔서 감사합니다.',
          ].join('\n'),
          images: [
            { url: paint('#1d2e4b', '#0f192a', '1 정자역'), alt: '정자역 야간' },
            { url: paint('#14324a', '#f5a200', '2 탄천'), alt: '탄천 산책로' },
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
    ? { viewport: { width: 844, height: 700 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
    : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await seed(page);
  const url = `${B}?${QS}${mobile ? '&mobile=1' : ''}`;
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(() => {
    const leave = document.getElementById('btn-leave');
    const modal = document.getElementById('board-modal');
    const list = modal?.querySelector('.board-table');
    const text = list?.innerText || '';
    return leave && !leave.hidden && modal && !modal.hidden && list && list.querySelector('.ni-mark') && !list.querySelector('img') && !text.includes('[사진');
  }, null, { timeout: 180000 });
  await page.waitForTimeout(300);
  if (!mobile) await page.screenshot({ path: `${OUT}/pc-list.png` });

  await page.locator('#board-modal .title-btn:has(.ni-mark)').click();
  await page.waitForFunction(() => document.querySelectorAll('#board-modal .ni-inline').length >= 2);
  await page.locator('#board-modal .board-body').evaluate((el) => { el.scrollTop = 0; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${mobile ? 'mobile' : 'pc'}-detail-inline.png` });

  await page.locator('#board-modal [data-action="back-list"]').click();
  await page.waitForSelector('#board-modal [data-action="write"]');
  await page.locator('#board-modal [data-action="write"]').click();
  await page.waitForSelector('#board-modal textarea[name="body"]');
  await page.fill('#board-modal input[name="title"]', '야간 점검 안내');
  await page.fill('#board-modal textarea[name="body"]', '첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.');
  const put = async (file, marker) => {
    await page.locator('#board-modal textarea[name="body"]').evaluate((el, token) => {
      const at = token ? el.value.indexOf(token) : el.value.indexOf('\n\n');
      const pos = at < 0 ? el.value.length : at;
      el.focus();
      el.setSelectionRange(pos, pos);
    }, marker);
    await page.setInputFiles('#board-modal input[name="noticeImages"]', file);
    await page.waitForFunction((m) => (document.querySelector('#board-modal textarea[name="body"]')?.value || '').includes(m), marker ? '[사진2]' : '[사진1]');
  };
  await put('/tmp/notice-a.png', '');
  await put('/tmp/notice-b.png', '둘째');
  await page.waitForFunction(() => document.querySelectorAll('#board-modal .ni-compose .ni-thumb').length >= 2);
  await page.locator('#board-modal .ni-add').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${mobile ? 'mobile' : 'pc'}-compose-button.png` });
  await page.screenshot({ path: `${OUT}/${mobile ? 'mobile' : 'pc'}-compose-inline.png` });
  await ctx.close();
  console.log('shot', name);
}

const only = process.env.ONLY;
if (only !== 'mobile') await shoot('pc', { mobile: false });
if (only !== 'pc') await shoot('mobile', { mobile: true });
await browser.close();
console.log('shots done', OUT);
