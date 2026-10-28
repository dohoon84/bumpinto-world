// 휴대폰 화면. 홈에서 메시지와 연락처를 열고, 번호부 서버와 주고받는다.
import { phoneDigits, currentRegion } from './sms.js';
import { isEn, tr, onLangChange } from './i18n.js';

const REGION_NAMES = {
  jeongja: '정자동',
  starbase: 'Starbase, TX',
  sunae: '수내역',
  seohyeon: '서현역',
  imae: '이매역',
  yatap: '야탑역',
  pangyo: '판교역',
  gangnam: '강남역',
  seongsu: '성수동',
  hongdae: '홍대입구',
};
function defaultGuideName() {
  const r = currentRegion();
  return `${REGION_NAMES[r] || r || '정자동'} 안내센터`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (at) => {
  const d = new Date(at);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function mountHandset({ sms } = {}) {
  const el = document.getElementById('handset');
  const timeEl = document.getElementById('handset-time');
  const body = document.getElementById('handset-body');
  let open = false;
  let view = 'home';
  let peer = '';
  let unread = 0;
  let timer = 0;
  let toastDismissed = false;

  const toastEl = document.createElement('button');
  toastEl.type = 'button';
  toastEl.className = 'handset-toast';
  toastEl.hidden = true;
  el.prepend(toastEl);

  const updateToast = (threads = null) => {
    if (unread <= 0 || open || toastDismissed) {
      toastEl.hidden = true;
      return;
    }
    const unreadThread = Array.isArray(threads) ? threads.find((t) => t.unread > 0) : null;
    const sender = unreadThread?.name || defaultGuideName();
    toastEl.dataset.peer = unreadThread?.phone || '01020000000';
    toastEl.innerHTML = `<span class="toast-dot"></span><span>📩 <b>${esc(sender)}</b> ${tr('새 문자', 'New SMS')} (${unread})</span>`;
    toastEl.hidden = false;
  };

  const paintTime = () => {
    const d = new Date();
    timeEl.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  paintTime();
  setInterval(paintTime, 15000);

  const setOpen = (next) => {
    if (open === next) return;
    open = next;
    el.classList.toggle('open', open);
    el.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      toastEl.hidden = true;
      show('home');
    } else {
      updateToast();
    }
  };

  const badge = (n) => (n > 0 ? `<i class="badge">${n > 99 ? '99+' : n}</i>` : '');

  const home = () => {
    const en = isEn();
    const session = sms?.session;
    const mine = session?.display
      ? `<p class="mine">${esc(session.display)}</p>`
      : `<p class="mine">${en ? 'No Number' : '번호 없음'}</p>`;
    const hintText = session?.off
      ? (en ? 'Joined in local offline mode.' : '번호 서버 없이 입장한 상태입니다.')
      : (session?.hasPin
          ? (en ? 'Recovery PIN is set.' : '재입장 PIN이 설정되어 있습니다.')
          : (en ? 'Set a PIN to resume on other devices.' : '다른 기기에서 이어하려면 비밀번호(PIN)를 설정하세요.'));
    body.innerHTML = `<div class="pane front">${mine}
      <div class="apps">
        <button type="button" class="app" data-app="threads"><span class="glyph msg">${badge(unread)}</span><em>${en ? 'Messages' : '메시지'}</em></button>
        <button type="button" class="app" data-app="contacts"><span class="glyph book"></span><em>${en ? 'Contacts' : '연락처'}</em></button>
        <button type="button" class="app" data-app="pin"><span class="glyph lock"></span><em>${en ? 'PIN' : '비밀번호'}</em></button>
      </div>
      <p class="hint">${hintText}</p>
    </div>`;
  };

  const show = (next, extra = '') => {
    view = next;
    peer = extra;
    if (view === 'home') home();
    else if (view === 'threads') loadThreads();
    else if (view === 'thread') loadThread();
    else if (view === 'contacts') loadContacts();
    else if (view === 'add') paintAdd();
    else if (view === 'pin') paintPin();
  };

  const paintThreads = (threads) => {
    const en = isEn();
    const prevPane = body.querySelector('.pane.list');
    const prevScroll = prevPane ? prevPane.scrollTop : 0;
    const rows = threads.length ? threads.map((t) => `<button type="button" class="row" data-open="${esc(t.phone)}">
      <span><b>${esc(t.name)}</b><small>${esc(t.display)} · ${esc(t.preview)}</small></span>
      ${t.unread ? `<i class="count">${t.unread}</i>` : ''}
    </button>`).join('') : `<p class="hint">${en ? 'No messages yet.' : '오고 간 메시지가 없습니다.'}</p>`;
    body.innerHTML = `<div class="pane list"><p class="hd">${en ? 'Messages' : '메시지'}</p>${rows}</div>`;
    const nextPane = body.querySelector('.pane.list');
    if (nextPane) nextPane.scrollTop = prevScroll;
  };

  const paintLog = (conv) => {
    const en = isEn();
    const log = body.querySelector('.log');
    if (!log || peer !== conv.peer.phone) return false;
    const pane = log.closest('.pane');
    const prevScroll = pane ? pane.scrollTop : 0;
    log.innerHTML = conv.messages.map((m) => `<div class="msgline ${m.mine ? 'out' : 'in'}">${esc(m.body)}<time>${clock(m.at)}</time></div>`).join('')
      || `<p class="hint">${en ? 'Send the first message.' : '첫 메시지를 보내 보세요.'}</p>`;
    if (pane) pane.scrollTop = prevScroll;
    const block = body.querySelector('[data-block]');
    if (block) block.textContent = conv.peer.blocked ? (en ? 'Unblock' : '차단 해제') : (en ? 'Block' : '차단');
    return true;
  };

  const paintThread = (conv) => {
    const en = isEn();
    body.innerHTML = `<div class="pane thread">
      <p class="hd"><button type="button" data-app="threads">‹</button> ${esc(conv.peer.name)} <small>${esc(conv.peer.display)}</small>
        <button type="button" class="sideact" data-block="${esc(conv.peer.phone)}">${conv.peer.blocked ? (en ? 'Unblock' : '차단 해제') : (en ? 'Block' : '차단')}</button></p>
      <div class="log"></div>
      <form class="composer"><input maxlength="200" placeholder="${en ? 'Message' : '메시지'}" autocomplete="off" /><button type="submit">${en ? 'Send' : '보내기'}</button></form>
      <p class="hint err"></p>
    </div>`;
    paintLog(conv);
  };

  const paintContacts = (contacts) => {
    const en = isEn();
    const rows = contacts.length ? contacts.map((c) => `<div class="row static">
      <button type="button" data-open="${esc(c.phone)}"><b>${esc(c.name)}</b><small>${esc(c.display)}${c.blocked ? (en ? ' · Blocked' : ' · 차단됨') : ''}</small></button>
      <button type="button" class="sideact" data-block="${esc(c.phone)}">${c.blocked ? (en ? 'Unblock' : '차단 해제') : (en ? 'Block' : '차단')}</button>
      <button type="button" class="sideact" data-drop="${esc(c.phone)}">${en ? 'Del' : '삭제'}</button>
    </div>`).join('') : `<p class="hint">${en ? 'No saved contacts.' : '저장된 번호가 없습니다.'}</p>`;
    body.innerHTML = `<div class="pane list"><p class="hd">${en ? 'Contacts' : '연락처'} <button type="button" class="sideact" data-app="add">${en ? 'Add' : '추가'}</button></p>${rows}</div>`;
  };

  const paintAdd = () => {
    const en = isEn();
    body.innerHTML = `<form class="pane add">
      <p class="hd"><button type="button" data-app="contacts">‹</button> ${en ? 'Add Number' : '번호 추가'}</p>
      <input name="phone" inputmode="numeric" maxlength="13" placeholder="010-0000-0000" autocomplete="off" />
      <input name="alias" maxlength="16" placeholder="${en ? 'Name (Optional)' : '이름 (선택)'}" autocomplete="off" />
      <button type="submit">${en ? 'Save' : '저장'}</button>
      <p class="hint err"></p>
    </form>`;
  };

  const paintPin = () => {
    const en = isEn();
    const session = sms?.session;
    const status = session?.hasPin
      ? (en ? 'PIN set (enter new digits to change)' : '현재 PIN 설정됨 (새 번호로 변경 가능)')
      : (en ? 'No PIN set' : '현재 PIN 미설정');
    body.innerHTML = `<form class="pane pin-form add">
      <p class="hd"><button type="button" data-app="home">‹</button> ${en ? 'Recovery PIN' : '재입장 PIN'}</p>
      <p class="hint" style="margin:2px 0 6px">${esc(session?.display || (en ? 'No Number' : '번호 없음'))} · ${status}</p>
      <input name="pin" type="password" inputmode="numeric" maxlength="6" placeholder="${en ? 'Enter 4–6 digits' : '숫자 4~6자리 입력'}" autocomplete="off" />
      <button type="submit">${en ? 'Save PIN' : '비밀번호 저장'}</button>
      <p class="hint err"></p>
    </form>`;
  };

  async function loadThreads() {
    body.innerHTML = '<div class="pane"><p class="hint">불러오는 중…</p></div>';
    try {
      const box = await sms.threads();
      unread = box.unread || 0;
      el.classList.toggle('has-mail', unread > 0);
      if (view === 'threads') paintThreads(box.threads || []);
      else if (view === 'home') home();
    } catch (error) {
      if (view === 'threads') body.innerHTML = `<div class="pane"><p class="hint">${esc(error.message)}</p></div>`;
    }
  }

  async function loadThread() {
    try {
      await sms.read(peer);
      const conv = await sms.messages(peer);
      if (view !== 'thread' || peer !== conv.peer.phone) return;
      if (!paintLog(conv)) paintThread(conv);
      const box = await sms.threads();
      unread = box.unread || 0;
      el.classList.toggle('has-mail', unread > 0);
    } catch (error) {
      if (view === 'thread') body.innerHTML = `<div class="pane"><p class="hint">${esc(error.message)}</p></div>`;
    }
  }

  async function loadContacts() {
    body.innerHTML = '<div class="pane"><p class="hint">불러오는 중…</p></div>';
    try {
      const data = await sms.contacts('list');
      if (view === 'contacts') paintContacts(data.contacts || []);
    } catch (error) {
      if (view === 'contacts') body.innerHTML = `<div class="pane"><p class="hint">${esc(error.message)}</p></div>`;
    }
  }

  body.addEventListener('click', async (e) => {
    const app = e.target.closest('[data-app]');
    if (app) { show(app.dataset.app); return; }
    const openPeer = e.target.closest('[data-open]');
    if (openPeer) { show('thread', openPeer.dataset.open); return; }
    const drop = e.target.closest('[data-drop]');
    if (drop) {
      try { await sms.contacts('remove', { phone: drop.dataset.drop }); } catch (error) { body.querySelector('.hint')?.replaceChildren(document.createTextNode(error.message)); return; }
      loadContacts();
      return;
    }
    const block = e.target.closest('[data-block]');
    if (block) {
      const on = block.textContent === '차단';
      try { await sms.contacts(on ? 'block' : 'unblock', { phone: block.dataset.block }); } catch (error) { note(error.message); return; }
      if (view === 'contacts') loadContacts();
      else loadThread();
    }
  });

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.classList.contains('composer')) {
      const input = form.querySelector('input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try { await sms.send(peer, text); } catch (error) { note(error.message); input.value = text; return; }
      loadThread();
      return;
    }
    if (form.classList.contains('pin-form')) {
      const pin = form.pin.value.trim();
      if (!/^\d{4,6}$/.test(pin)) { note('비밀번호(PIN)는 숫자 4~6자리로 입력해 주세요.'); return; }
      try { await sms.setPin(pin); } catch (error) { note(error.message); return; }
      show('home');
      return;
    }
    if (form.classList.contains('add')) {
      const phone = phoneDigits(form.phone.value);
      try { await sms.contacts('add', { phone, alias: form.alias.value }); } catch (error) { note(error.message); return; }
      show('contacts');
    }
  });

  function note(message) {
    const hint = body.querySelector('.err');
    if (hint) hint.textContent = message;
  }

  el.addEventListener('click', (e) => {
    const toastBtn = e.target.closest('.handset-toast');
    if (toastBtn) {
      e.stopPropagation();
      toastDismissed = true;
      toastEl.hidden = true;
      open = true;
      el.classList.add('open');
      el.setAttribute('aria-expanded', 'true');
      const targetPeer = toastBtn.dataset.peer;
      if (targetPeer) show('thread', targetPeer);
      else show('threads');
      return;
    }
    if (!open) { setOpen(true); return; }
    if (e.target.closest('.home')) {
      if (view === 'home') setOpen(false);
      else show('home');
    }
    const active = document.activeElement;
    if (active?.closest?.('#handset') && active.tagName === 'BUTTON') active.blur();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!open || el.contains(e.target)) return;
    setOpen(false);
  });

  async function poll() {
    if (!sms?.session || sms.session.off) return;
    try {
      if (view === 'thread' && peer) {
        const conv = await sms.messages(peer);
        if (view === 'thread') paintLog(conv);
      }
      const box = await sms.threads();
      const prevUnread = unread;
      unread = box.unread || 0;
      if (unread > prevUnread) toastDismissed = false;
      el.classList.toggle('has-mail', unread > 0);
      updateToast(box.threads || []);
      if (view === 'threads') paintThreads(box.threads || []);
      if (view === 'home') {
        const glyph = body.querySelector('.glyph.msg');
        if (glyph) {
          const existing = glyph.querySelector('.badge');
          if (unread > 0) {
            const text = unread > 99 ? '99+' : String(unread);
            if (existing) existing.textContent = text;
            else glyph.insertAdjacentHTML('beforeend', badge(unread));
          } else existing?.remove();
        }
      }
    } catch { /* 다음 주기에 다시 */ }
  }

  home();

  onLangChange(() => {
    if (open && view === 'home') home();
  });

  return {
    get open() { return open; },
    close() { setOpen(false); },
    signIn() {
      unread = sms?.session?.unread || 0;
      toastDismissed = false;
      el.classList.toggle('has-mail', unread > 0);
      updateToast();
      if (view === 'home') home();
      clearInterval(timer);
      if (sms?.session && !sms.session.off) {
        poll();
        timer = setInterval(poll, 4000);
      }
    },
  };
}
