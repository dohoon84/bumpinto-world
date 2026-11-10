// [arcade] 게스트 보상 안내 — BUMP24 로그인 버튼 스타일(흰 바탕 · Google 로그인)을 그대로 쓴다.
import { requestGoogleSignIn, googleNotReadyText } from '../ui-v2/google.js';

export const LOGIN_NUDGE_TEXT = '로그인하면 보상을 받을 수 있어요';

export function loginNudgeHtml() {
  return `<div class="arc-login-nudge">
    <p>${LOGIN_NUDGE_TEXT}</p>
    <button type="button" data-login>Google 로그인</button>
  </div>`;
}

export function bindLoginNudge(root, { onDone } = {}) {
  const box = root?.querySelector?.('.arc-login-nudge') || root;
  const btn = box?.querySelector?.('[data-login]');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    let r = { ok: false };
    try { r = await requestGoogleSignIn(); } catch { r = { ok: false, reason: 'error' }; }
    if (r?.ok) { onDone?.(r); return; }
    let note = box.querySelector('[data-login-note]');
    if (!note) {
      note = document.createElement('div');
      note.dataset.loginNote = '1';
      box.appendChild(note);
    }
    note.textContent = r?.reason === 'not_ready'
      ? googleNotReadyText()
      : '로그인하지 못했어요. 다시 시도하거나 게스트로 계속해 주세요.';
    b.disabled = false;
  });
}
