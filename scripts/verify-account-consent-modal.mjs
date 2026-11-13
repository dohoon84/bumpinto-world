// Headless Chrome: 재동의 모달을 배경 클릭으로 닫을 수 없고, 확인 전에 입장되지 않는지 확인
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.CONSENT_VERIFY_PORT || 41873);
const BASE = `http://127.0.0.1:${PORT}`;
const GL = ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function startVite() {
  const child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      VITE_ACCOUNTS: '1',
      VITE_ACCOUNT_API_URL: 'https://api.bumpinto.world',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let out = '';
  child.stdout.on('data', (b) => { out += b.toString(); });
  child.stderr.on('data', (b) => { out += b.toString(); });
  return { child, logs: () => out };
}

async function waitForVite(child, logs, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (child.exitCode != null) throw new Error(`vite exited ${child.exitCode}: ${logs()}`);
    try {
      const r = await fetch(`${BASE}/terms.html`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`vite did not start: ${logs()}`);
}

const vite = startVite();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome-stable', args: GL });
const errors = [];
let ok = 0;
const pass = (m) => { ok++; console.log('  ok', m); };
try {
  await waitForVite(vite.child, vite.logs);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // Chrome 리소스 404 콘솔은 URL 을 안 남기는 경우가 많아, 응답 리스너가 실제 경로를 가린다.
    if (/Failed to load resource: the server responded with a status of 404/.test(text)) return;
    errors.push(text);
  });
  page.on('response', (res) => {
    if (res.status() !== 404) return;
    const u = res.url();
    if (/favicon\.ico($|\?)/i.test(u)) return;
    errors.push(`404 ${u}`);
  });
  await page.goto(`${BASE}/terms.html`, { waitUntil: 'domcontentloaded' });

  await page.evaluate(() => {
    const resume = document.createElement('button');
    resume.id = 'fake-resume';
    resume.type = 'button';
    resume.textContent = '이어하기';
    resume.style.cssText = 'position:fixed;inset:0;z-index:1;';
    resume.addEventListener('click', () => { window.__entered = true; });
    document.body.appendChild(resume);
    window.__entered = false;
    window.__logout = 0;
    window.__consentSaved = 0;
  });

  await page.evaluate(async () => {
    const { accountApi } = await import('/src/account/api.js');
    accountApi.consent = async () => {
      window.__consentSaved += 1;
      return { ok: true, consent: { needsTerms: false, marketingOptIn: false } };
    };
    accountApi.logout = async () => { window.__logout += 1; return { ok: true }; };
    accountApi.config = async () => ({ ok: true, consent: { termsVersion: '2026-11-13', privacyVersion: '2026-11-13' } });
    const { ensureAccountConsent } = await import('/src/account/consent.js');
    window.__consentResult = null;
    window.__consentDone = false;
    ensureAccountConsent({
      me: { ok: true, account: { name: '테스트' }, consent: { needsTerms: true, marketingOptIn: false } },
      cfg: { ok: true, consent: { termsVersion: '2026-11-13', privacyVersion: '2026-11-13', termsUrl: '/terms.html', privacyUrl: '/privacy.html' } },
    }).then((r) => { window.__consentResult = r; window.__consentDone = true; });
  });

  const modal = page.locator('.acct-reconsent');
  await modal.waitFor({ state: 'visible' });
  await page.locator('[data-consent="terms"]').check();
  await page.locator('[data-consent="privacy"]').check();
  const agree = page.locator('.acct-reconsent .acct-btn.primary');
  if (await agree.isDisabled() !== false) {
    // should be enabled after both required checks; still must not proceed without click
  }
  await modal.click({ position: { x: 8, y: 8 } });
  await sleep(300);
  const afterBackdrop = await page.evaluate(() => ({
    open: !!document.querySelector('.acct-reconsent'),
    entered: !!window.__entered,
    done: !!window.__consentDone,
    logout: window.__logout,
    saved: window.__consentSaved,
  }));
  if (!afterBackdrop.open) throw new Error('backdrop click closed the modal');
  if (afterBackdrop.entered) throw new Error('backdrop click entered the game');
  if (afterBackdrop.done) throw new Error('backdrop click resolved the consent gate');
  if (afterBackdrop.logout || afterBackdrop.saved) throw new Error('backdrop click triggered logout or save');
  pass('backdrop click does not close the modal and does not enter the game');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__consentDone === true);
  const afterEsc = await page.evaluate(() => ({
    open: !!document.querySelector('.acct-reconsent'),
    entered: !!window.__entered,
    result: window.__consentResult,
    logout: window.__logout,
    saved: window.__consentSaved,
  }));
  if (afterEsc.open) throw new Error('Escape did not close the modal via decline');
  if (afterEsc.entered) throw new Error('Escape entered the game');
  if (!afterEsc.result || afterEsc.result.ok !== false || afterEsc.result.declined !== true) {
    throw new Error(`Escape did not decline+logout: ${JSON.stringify(afterEsc.result)}`);
  }
  if (afterEsc.logout < 1) throw new Error('Escape did not call logout');
  if (afterEsc.saved) throw new Error('Escape saved consent without confirm');
  pass('Escape explicitly declines, logs out to guest, and does not enter the game');

  const midErrors = errors.slice();
  if (midErrors.length) throw new Error(`console errors during modal test: ${midErrors.join(' | ')}`);
  pass('no console errors during backdrop / Escape checks');
} finally {
  await browser.close().catch(() => {});
  const pid = vite.child.pid;
  try { if (pid) process.kill(-pid, 'SIGTERM'); } catch { try { vite.child.kill('SIGTERM'); } catch { /* noop */ } }
  await sleep(400);
  try { if (pid && vite.child.exitCode == null) process.kill(-pid, 'SIGKILL'); } catch { try { vite.child.kill('SIGKILL'); } catch { /* noop */ } }
}

console.log(`verify-account-consent-modal: ${ok} passed`);
