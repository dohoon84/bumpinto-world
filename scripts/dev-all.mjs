#!/usr/bin/env node
// [local-stack] 로컬 전체 실행: 로컬 D1 마이그레이션(--local) → wrangler dev(server/phone) → Vite(0.0.0.0) [→ 선택: cloudflared 터널]
//   npm run dev:all              PC·같은 와이파이 아이폰
//   npm run dev:all -- --tunnel  + https 빠른 터널(실제 구글 로그인을 아이폰에서 시험할 때, cloudflared 필요)
//   npm run dev:all -- --reset   로컬 D1·DO·R2 상태(server/phone/.wrangler/state)를 지우고 시작
// 원격(운영) D1 에는 절대 손대지 않는다: 마이그레이션은 항상 --local. 배포 명령 없음.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PHONE_DIR = join(ROOT, 'server/phone');
const args = new Set(process.argv.slice(2));
const VITE_PORT = Number(process.env.BW_VITE_PORT || 5173);
const PHONE_PORT = Number(process.env.BW_PHONE_PORT || 8789);
const WRANGLER = ['--yes', 'wrangler@4'];
const kids = [];

const log = (...a) => console.log('\x1b[36m[dev:all]\x1b[0m', ...a);
const die = (m) => { console.error('\x1b[31m[dev:all]\x1b[0m', m); stopAll(1); };
function stopAll(code = 0) { for (const k of kids) { try { k.kill('SIGTERM'); } catch {} } process.exit(code); }
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

// 1) .dev.vars — 없으면 예시에서 만든다(SESSION_SECRET 은 이 기기에서 새로 뽑고 화면에 찍지 않는다)
const devVars = join(PHONE_DIR, '.dev.vars');
if (!existsSync(devVars)) {
  const ex = readFileSync(join(PHONE_DIR, '.dev.vars.example'), 'utf8');
  writeFileSync(devVars, ex.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${randomBytes(36).toString('base64url')}`), { mode: 0o600 });
  log('server/phone/.dev.vars 를 예시에서 만들었어요 (SESSION_SECRET 은 새로 생성, 출력 안 함).');
}
const vars = Object.fromEntries(readFileSync(devVars, 'utf8').split('\n').filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
if ((vars.SESSION_SECRET || '').length < 32) die('server/phone/.dev.vars 의 SESSION_SECRET 이 32자보다 짧아요.');
for (const k of ['ACCOUNTS_ENABLED', 'ECONOMY_ENABLED', 'DEV_LOGIN', 'SESSION_COOKIE_INSECURE']) if (vars[k] !== '1') log(`주의: .dev.vars 의 ${k} 가 1 이 아니에요(${k === 'SESSION_COOKIE_INSECURE' ? '아이폰 http 로그인 쿠키가 저장되지 않음' : '계정 모드 시험이 안 될 수 있음'}).`);

// 2) 상태 초기화(선택)
if (args.has('--reset')) { rmSync(join(PHONE_DIR, '.wrangler/state'), { recursive: true, force: true }); log('로컬 D1·DO·R2 상태를 지웠어요.'); }

// 3) 로컬 D1 마이그레이션 (항상 --local)
log('로컬 D1 마이그레이션 적용 (--local) …');
const mig = spawnSync('npx', [...WRANGLER, 'd1', 'migrations', 'apply', 'bumpinto-accounts', '--local'], { cwd: PHONE_DIR, stdio: 'inherit', env: { ...process.env, CI: '1' } });
if (mig.status !== 0) die('로컬 마이그레이션 실패');

// 4) (선택) 터널 — 출처를 먼저 알아야 wrangler 에 ALLOWED_ORIGINS 로 넘길 수 있다
async function startTunnel() {
  const which = spawnSync('cloudflared', ['--version'], { stdio: 'ignore' });
  if (which.status !== 0) die('cloudflared 가 없어요. macOS: brew install cloudflared');
  const t = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${VITE_PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(t);
  return new Promise((resolve) => {
    const timer = setTimeout(() => die('터널 주소를 30초 안에 받지 못했어요.'), 30000);
    const onData = (b) => { const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(b)); if (m) { clearTimeout(timer); resolve(m[0]); } };
    t.stdout.on('data', onData); t.stderr.on('data', onData);
  });
}
const tunnel = args.has('--tunnel') ? await startTunnel() : '';

// 5) wrangler dev (127.0.0.1 만 — 바깥에서는 Vite /_phone 프록시로만 들어온다)
const wArgs = [...WRANGLER, 'dev', '--ip', '127.0.0.1', '--port', String(PHONE_PORT)];
if (tunnel) wArgs.push('--var', `ALLOWED_ORIGINS:${tunnel}`);
const w = spawn('npx', wArgs, { cwd: PHONE_DIR, stdio: 'inherit', env: process.env });
kids.push(w);
w.on('exit', (c) => die(`wrangler dev 가 끝났어요 (code ${c})`));

// 6) Vite (0.0.0.0, /_phone 프록시 — vite.config.js 의 BW_LOCAL_STACK)
const v = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', String(VITE_PORT), '--strictPort'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, BW_LOCAL_STACK: '1', BW_PHONE_TARGET: `http://127.0.0.1:${PHONE_PORT}` } });
kids.push(v);
v.on('exit', (c) => die(`vite 가 끝났어요 (code ${c})`));

// 7) 주소 안내
const lan = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
setTimeout(() => {
  const L = (s) => console.log('  ' + s);
  console.log('\n\x1b[32m[dev:all] 준비되면 아래 주소로 들어가세요\x1b[0m');
  L(`PC 리뉴얼+경제 UI : http://localhost:${VITE_PORT}/?ui=v2&noticePopup=0`);
  L(`PC 게스트로 시작  : http://localhost:${VITE_PORT}/?ui=v2&noticePopup=0  (로그인 안 하면 게스트)`);
  for (const ip of lan) L(`아이폰(같은 와이파이): http://${ip}:${VITE_PORT}/?mobile=1&noticePopup=0`);
  if (tunnel) { L(`터널(https)       : ${tunnel}/?mobile=1&noticePopup=0`); L(`  → Google Cloud Console "승인된 JavaScript 원본"에 ${tunnel} 추가`); }
  L(`로컬 서버(직접)   : http://127.0.0.1:${PHONE_PORT}/auth/config`);
  console.log('');
}, 4000);
