// [mobile] 입장 안전망: 역을 고른 뒤 게임(로비)을 여는 중에 오류가 나면 빈 화면으로 멈추지 않게 한다.
//   오류를 모아 두었다가 로비가 안 뜨면 '다시 시도' 카드를 보여 준다. 로비·게임이 뜨면 조용히 끝.
import { isEn } from '../i18n.js';

const errs = [];
let watching = false;
const onErr = (e) => { errs.push(String(e?.reason?.message || e?.reason || e?.message || e?.error?.message || 'error')); };

export function startEntryWatch() {
  if (watching) return;
  watching = true;
  addEventListener('error', onErr);
  addEventListener('unhandledrejection', onErr);
  const t0 = Date.now();
  const iv = setInterval(() => {
    const nick = document.getElementById('nick');
    const lobbyUp = !!nick && nick.getClientRects().length > 0;
    const inGame = !!window.__jj?.ready && !document.body.classList.contains('in-gate') && !document.body.classList.contains('in-lobby');
    if (lobbyUp || inGame) { stop(); return; }
    if (errs.length && Date.now() - t0 > 2500) { stop(); showEntryError(errs[0]); }
    else if (Date.now() - t0 > 90000) stop();
  }, 500);
  const stop = () => { clearInterval(iv); removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr); watching = false; };
}

export function showEntryError(err) {
  if (document.getElementById('m-fatal')) return;
  let en = false; try { en = isEn(); } catch { /* 기본 한국어 */ }
  const msg = String(err?.message || err || '').slice(0, 160);
  const el = document.createElement('div');
  el.id = 'm-fatal';
  el.innerHTML = `<div class="m-fatal-card">
    <b>${en ? 'Couldn’t open the world' : '입장 화면을 여는 중에 문제가 생겼어요'}</b>
    <p>${en ? 'Please try again. If it keeps happening, send this to the team:' : '다시 시도해 주세요. 계속되면 아래 내용을 알려 주세요.'}</p>
    <code></code>
    <div class="m-fatal-btns"><button type="button" data-a="retry">${en ? 'Try again' : '다시 시도'}</button><button type="button" data-a="home">${en ? 'Back to start' : '처음으로'}</button></div>
  </div>`;
  el.querySelector('code').textContent = msg;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'retry') location.reload();
    if (a === 'home') { const u = new URL(location.href); for (const k of ['enter', 'passport', 'from', 'at']) u.searchParams.delete(k); location.href = u.toString(); }
  });
  document.body.appendChild(el);
}
