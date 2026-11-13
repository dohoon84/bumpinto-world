// 던전 방 채팅. HUD C: 접힌 칩 / 파티 / 레이드 / 시스템 전투 기록.
// RoomChannel.attach(transport) 를 붙이면 같은 방 소켓으로 나간다. 없으면 이 화면 안에서만 돈다.

const ALLY = [
  { name: '한결', color: '#FF7A1A', line: '장판 먼저 봅니다. 방패는 제가.' },
  { name: '온유', color: '#FFC845', line: '체력 볼게요. 노란 선으로 오세요.' },
  { name: '서린', color: '#8C7FFF', line: '다음 장판, 왼쪽으로 빠지세요.' },
  { name: '시우', color: '#3DDC84', line: '표식 쪽에 맞출게요.' },
  { name: '무영', color: '#FF5C9A', line: '뒤는 비웠습니다.' },
];

function mockReply(channel, emit) {
  if (channel === 'system') return;
  const ally = ALLY[Math.floor(Math.random() * ALLY.length)];
  setTimeout(() => {
    emit({
      channel,
      name: ally.name,
      color: ally.color,
      text: ally.line,
      self: false,
      t: Date.now(),
    });
  }, 500 + Math.random() * 600);
}

export function createRaidRoom({ roomId, name, onMessage }) {
  let transport = null;
  function emit(msg) { onMessage?.({ roomId, ...msg }); }
  return {
    roomId,
    send(channel, text) {
      const body = String(text || '').trim().slice(0, 80);
      if (!body || channel === 'system') return;
      emit({ channel, name, color: '#9fd6ff', text: body, self: true, t: Date.now() });
      if (transport?.send) transport.send({ t: 'raid-chat', roomId, channel, name, text: body });
      else mockReply(channel, emit);
    },
    system(text, kind = 'info') {
      emit({ channel: 'system', name: '시스템', text, system: true, kind, self: false, t: Date.now() });
    },
    receive(msg) {
      if (!msg || msg.roomId !== roomId) return;
      emit({ channel: msg.channel || 'raid', name: msg.name || '모험가', text: msg.text, self: false, t: Date.now() });
    },
    attach(next) { transport = next || null; },
  };
}

const TABS = [
  ['party', '파티'],
  ['raid', '레이드'],
  ['system', '시스템'],
];

export function mountRaidChat(parent, room) {
  const el = document.createElement('section');
  el.className = 'rchat';
  el.innerHTML = `
    <button type="button" class="rchat-chip" data-chip hidden>
      <span class="rchat-ico">💬</span>
      <b data-unread hidden>0</b>
      <em data-last>파티 대화</em>
      <span class="rchat-caret">▲</span>
    </button>
    <div class="rchat-body">
      <header class="rchat-head">
        <div class="rchat-tabs" role="tablist">
          ${TABS.map(([id, label], i) => `<button type="button" data-ch="${id}" class="${i === 0 ? 'on' : ''}">${label}<i data-dot hidden></i></button>`).join('')}
        </div>
        <button type="button" class="rchat-fold" data-fold aria-expanded="true">–</button>
      </header>
      <div class="rchat-log" data-log></div>
      <form class="rchat-form" data-form>
        <span data-ch-label>파티</span>
        <input data-input maxlength="80" placeholder="Enter로 대화" aria-label="레이드 채팅" />
        <button type="submit">전송</button>
      </form>
    </div>
  `;
  parent.appendChild(el);
  const log = el.querySelector('[data-log]');
  const input = el.querySelector('[data-input]');
  const chip = el.querySelector('[data-chip]');
  const lastEl = el.querySelector('[data-last]');
  const unreadEl = el.querySelector('[data-unread]');
  let channel = 'party';
  let collapsed = false;
  let unread = 0;
  const lines = [];
  const seen = { party: true, raid: true, system: true };

  function clock(t) {
    const d = new Date(t || Date.now());
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function paint() {
    const view = lines.filter((m) => m.channel === channel).slice(-8);
    log.innerHTML = view.map((m) => {
      const kind = m.kind || (m.system ? 'info' : '');
      if (m.channel === 'system') {
        return `<p class="${kind}"><time>${clock(m.t)}</time> ${escapeHtml(m.text)}</p>`;
      }
      const chan = m.channel === 'raid' ? '[레이드]' : '[파티]';
      const chanColor = m.channel === 'raid' ? '#ff9650' : '#78beff';
      return `<p class="${kind}"><time>${clock(m.t)}</time> <b style="color:${chanColor}">${chan}</b> <b style="color:${m.color || '#9fd6ff'}">${escapeHtml(m.name)}</b>: ${escapeHtml(m.text)}</p>`;
    }).join('') || '<p class="info">이 채널은 아직 조용합니다.</p>';
    log.scrollTop = log.scrollHeight;
    const label = TABS.find(([id]) => id === channel)?.[1] || '';
    el.querySelector('[data-ch-label]').textContent = label;
    input.disabled = channel === 'system';
    input.placeholder = channel === 'system' ? '전투 기록' : 'Enter로 대화 · /p 파티 · /r 레이드';
    el.querySelector('[data-form]').querySelector('button').disabled = channel === 'system';
  }
  function setCollapsed(next) {
    collapsed = next;
    el.classList.toggle('is-collapsed', collapsed);
    chip.hidden = !collapsed;
    el.querySelector('.rchat-body').hidden = collapsed;
    el.querySelector('[data-fold]').setAttribute('aria-expanded', String(!collapsed));
    if (!collapsed) {
      unread = 0;
      unreadEl.hidden = true;
      seen[channel] = true;
      paint();
    }
  }
  function push(msg) {
    lines.push(msg);
    if (lines.length > 80) lines.shift();
    const text = `${msg.name}: ${msg.text}`;
    lastEl.textContent = text;
    if (collapsed || msg.channel !== channel) {
      if (!msg.self) {
        unread += 1;
        unreadEl.hidden = false;
        unreadEl.textContent = unread > 9 ? '9+' : String(unread);
        const dot = el.querySelector(`[data-ch="${msg.channel}"] i`);
        if (dot) dot.hidden = false;
      }
    }
    if (msg.channel === channel && !collapsed) paint();
  }

  el.querySelectorAll('[data-ch]').forEach((btn) => {
    btn.addEventListener('click', () => {
      channel = btn.getAttribute('data-ch');
      el.querySelectorAll('[data-ch]').forEach((b) => b.classList.toggle('on', b === btn));
      const dot = btn.querySelector('i');
      if (dot) dot.hidden = true;
      seen[channel] = true;
      paint();
    });
  });
  el.querySelector('[data-fold]').addEventListener('click', () => setCollapsed(true));
  chip.addEventListener('click', () => setCollapsed(false));
  el.querySelector('[data-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    room.send(channel, text);
  });

  return {
    el,
    push,
    focus() {
      if (collapsed) setCollapsed(false);
      if (channel === 'system') {
        channel = 'party';
        el.querySelectorAll('[data-ch]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-ch') === 'party'));
        input.disabled = false;
        paint();
      }
      input.focus();
    },
    collapse() { setCollapsed(true); },
    typing() { return document.activeElement === input; },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
