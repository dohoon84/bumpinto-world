// node scripts/test-account-consent-ui.mjs — 재동의 모달: 배경 클릭/Escape, 확인 전 입장 차단
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const consent = src('../src/account/consent.js');
const start = src('../src/ui-v2/start.js');
const landing = src('../src/mobile/landing.js');
const lobby = src('../src/lobby.js');
const signin = src('../src/account/signin.js');
const ui = src('../src/account/ui.js');

let n = 0;
const ok = (m) => console.log('  ok', ++n, m);

// ── 배경 클릭은 닫지 않는다 (예전: wrap click → finish({ agreed: false })) ──
assert.match(consent, /const absorbBackdrop = \(e\) => \{/);
assert.match(consent, /if \(e\.target !== wrap\) return;/);
assert.doesNotMatch(
  consent,
  /wrap\.addEventListener\('click',\s*\(e\)\s*=>\s*\{\s*if\s*\(e\.target === wrap\)\s*finish\(\{\s*agreed:\s*false\s*\}\)/,
);
assert.match(consent, /wrap\.addEventListener\('pointerdown', absorbBackdrop\)/);
assert.match(consent, /wrap\.addEventListener\('click', absorbBackdrop\)/);
ok('reconsent backdrop click is absorbed, not treated as decline');

// ── Escape 는 '동의하지 않음'과 같이 명시적으로 거절(로그아웃) ──
assert.match(consent, /if \(e\.key !== 'Escape'\) return;/);
assert.match(consent, /finish\(\{\s*agreed:\s*false\s*\}\)/);
assert.match(consent, /document\.addEventListener\('keydown', onKey, true\)/);
assert.match(consent, /if \(!result\.agreed\) \{\s*await accountApi\.logout\(false\)/s);
ok('Escape / decline explicitly logs out, never silent-dismiss');

assert.match(consent, /if \(done\) return;/);
assert.match(consent, /document\.body\.classList\.add\('acct-consent-blocking'\)/);
ok('finish is single-shot; blocking class on while the modal is open');

// ── 로그인 창은 배경 클릭으로 성공 처리되지 않는다 ──
assert.doesNotMatch(signin, /e\.target === wrap\) finish\(/);
ok('login modal has no backdrop-success / backdrop-agree path');

// ── 시작화면: 약관 미동의면 계정 입장 차단, 확인 실패 시 통과하지 않음 ──
assert.match(start, /if \(!me\?\.ok\) return \{ ok: false, signedOut: true \}/);
assert.match(start, /if \(!me\.consent\?\.needsTerms\) return \{ ok: true, me \}/);
assert.match(start, /return \{ ok: false, error: true \}/);
assert.match(start, /if \(k === 'account'\)/);
assert.match(start, /const g = await gateAccountConsent\(\);/);
assert.match(start, /if \(!g\.ok\) \{/);
assert.match(start, /if \(k === 'continue' && last\) \{\s*if \(signedIn\(\)\) return;/s);
ok('start screen blocks account continue while needsTerms / unsigned confirmation');

// ── 모바일: 계속하기·입장할 곳 고르기·입장 모두 게이트 ──
assert.match(landing, /if \(!me\?\.ok\) return \{ ok: false, signedOut: true \}/);
assert.match(landing, /return \{ ok: false, error: true \}/);
assert.match(landing, /if \(act === 'pick'\) \{\s*if \(signedIn\(\)\) \{\s*b\.disabled = true;\s*gateAccountConsent\(\)/s);
assert.match(landing, /if \(act === 'resume'\) \{\s*if \(signedIn\(\)\) \{\s*b\.disabled = true;\s*gateAccountConsent\(\)/s);
assert.match(landing, /if \(act === 'go'\) \{\s*b\.disabled = true;\s*if \(signedIn\(\)\) \{\s*gateAccountConsent\(\)/s);
ok('mobile start/pick/go/resume stay blocked while needsTerms is true');

// ── 로비: 동의 확인 실패 시 계정 입장 유지 금지, 입장 제출 때도 재확인 ──
assert.match(lobby, /if \(found\?\.me\?\.consent\?\.needsTerms\)/);
assert.match(lobby, /catch \{\s*\/\/ 약관을 확인하지 못하면 계정으로 입장하지 않는다\s*found = null;/s);
assert.match(lobby, /if \(acct\?\.me\?\.consent\?\.needsTerms\)/);
assert.match(lobby, /const g = await ensureAccountConsent\(\{ me: acct\.me \}\)/);
assert.match(lobby, /if \(!g\.ok\) \{\s*acct = null;/s);
ok('lobby does not enter as an account without confirmed terms');


// ── 인게임 계정 칩 로그인 팝오버에도 필수/선택 체크박스가 있고, 동의 전에 로그인을 막는다 ──
assert.match(ui, /import \{ ensureAccountConsent, fmtAgreedAt, legalHref, mountConsentFields \} from '\.\/consent\.js'/);
assert.match(ui, /import \{ googleSignIn, isLocalHost, devLogin \} from '\.\/signin\.js'/);
assert.match(ui, /loginFields = mountConsentFields\(body, \{ cfg: state\.cfg, initial: pendingConsent \}\)/);
assert.match(ui, /button\(tr\('구글로 계속'/);
assert.match(ui, /button\(tr\('개발용 로그인 \(로컬\)'/);
assert.match(ui, /googleBtn\.disabled = !on/);
assert.match(ui, /if \(devBtn\) devBtn\.disabled = !on/);
assert.match(ui, /async function startLogin\(\) \{\s*if \(!requireLoginConsent\(\)\) return;/s);
assert.match(ui, /googleSignIn\(\{ deviceId: deviceId\(\), clientId: state\.cfg\?\.clientId \|\| GOOGLE_CLIENT_ID, consent \}\)/);
assert.match(ui, /const r = await devLogin\(deviceId\(\), consent\)/);
assert.doesNotMatch(ui, /async function startDevLogin\(\) \{[\s\S]*?await startLogin\(\)/);
ok('in-game account-chip popover mounts consent fields and blocks Google/dev login until required checks');

assert.match(signin, /export async function googleSignIn\(\{ deviceId = currentDeviceId\(\), clientId, consent \} = \{\}\)/);
assert.match(signin, /const preset = \(consent\?\.termsVersion && consent\?\.privacyVersion\)/);
assert.match(signin, /if \(preset\) \$\('\.acct-fields'\)\.hidden = true/);
ok('googleSignIn reuses pre-agreed consent from the account-chip popover and does not ask twice');

assert.match(consent, /class="acct-check-req"/);
assert.match(consent, /const snapshot = \(\) => \(\{ terms: !!terms\.checked, privacy: !!privacy\.checked, marketing: !!marketing\.checked \}\)/);
ok('required consent labels stay on one line; checkbox state can be restored after render');

console.log(`account-consent-ui: ${n} passed`);
