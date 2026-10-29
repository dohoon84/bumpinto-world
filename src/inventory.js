// [inventory] 인원당 1개씩 지급되는 개인 인벤토리 (드래그 이동 가능한 동그란 플로팅 아이콘 & 제자리 펼침 포켓 독)
import { isEn, onLangChange } from './i18n.js';

const POS_KEY = 'jeongja3d.inventory.pos.v1';
const ORB_SIZE = 50;
const EDGE_PAD = 10;
const DEFAULT_CAPACITY = 4;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&quot;', "'": '&#39;' }[c]));
}

function defaultPos() {
  return {
    x: Math.max(EDGE_PAD, window.innerWidth - ORB_SIZE - 18),
    y: 96,
  };
}

function clampPos(x, y) {
  const maxX = Math.max(EDGE_PAD, window.innerWidth - ORB_SIZE - EDGE_PAD);
  const maxY = Math.max(EDGE_PAD, window.innerHeight - ORB_SIZE - EDGE_PAD);
  return {
    x: Math.min(maxX, Math.max(EDGE_PAD, Math.round(x))),
    y: Math.min(maxY, Math.max(EDGE_PAD, Math.round(y))),
  };
}

function readPos() {
  try {
    const raw = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) {
      return clampPos(raw.x, raw.y);
    }
  } catch {}
  return clampPos(defaultPos().x, defaultPos().y);
}

function savePos(pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x: pos.x, y: pos.y }));
  } catch {}
}

export function mountInventory({
  items = [],
  capacity = DEFAULT_CAPACITY,
  isReady = () => true,
  getOwnerLabel = null,
  getPeers = () => [],
} = {}) {
  const registry = [...items];
  let open = false;
  let pos = readPos();
  let tab = 'pocket';
  let giftPickId = null;
  let giftPeer = null;
  let notice = '';

  const root = document.createElement('div');
  root.id = 'inventory-dock';
  root.className = 'inv-dock';
  root.innerHTML = `
    <button type="button" id="inventory-orb" class="inv-orb" aria-expanded="false" title="인벤토리 (I) · 드래그하여 위치 이동">
      <span class="inv-orb-ring" aria-hidden="true"></span>
      <span class="inv-orb-icon" aria-hidden="true">🎒</span>
      <span class="inv-orb-count" hidden>0</span>
      <span class="inv-orb-dot" hidden></span>
    </button>
    <div id="inventory-tray" class="inv-tray" role="region" aria-label="인벤토리" hidden>
      <div class="inv-tray-head">
        <span class="inv-tray-title"></span>
        <span class="inv-tray-sub"></span>
      </div>
      <div class="inv-tabs" role="tablist">
        <button type="button" class="inv-tab" data-inv-tab="pocket"></button>
        <button type="button" class="inv-tab" data-inv-tab="gift"></button>
      </div>
      <div class="inv-tray-list"></div>
      <div class="inv-gift-pick" hidden>
        <p class="inv-gift-title"></p>
        <div class="inv-gift-list"></div>
        <form class="inv-gift-confirm" hidden>
          <p class="inv-gift-who"></p>
          <p class="inv-gift-warn"></p>
          <label class="inv-gift-phone">
            <span class="inv-gift-phone-label"></span>
            <input type="tel" inputmode="numeric" maxlength="13" autocomplete="off" spellcheck="false" />
          </label>
          <button type="submit" class="inv-gift-send"></button>
        </form>
        <button type="button" class="inv-gift-cancel"></button>
      </div>
      <p class="inv-notice" hidden></p>
    </div>
  `;
  document.body.appendChild(root);

  const orb = root.querySelector('#inventory-orb');
  const orbCount = root.querySelector('.inv-orb-count');
  const orbDot = root.querySelector('.inv-orb-dot');
  const tray = root.querySelector('#inventory-tray');
  const titleEl = root.querySelector('.inv-tray-title');
  const subEl = root.querySelector('.inv-tray-sub');
  const listEl = root.querySelector('.inv-tray-list');
  const tabBtns = [...root.querySelectorAll('[data-inv-tab]')];
  const pickEl = root.querySelector('.inv-gift-pick');
  const pickTitle = root.querySelector('.inv-gift-title');
  const pickList = root.querySelector('.inv-gift-list');
  const confirmEl = root.querySelector('.inv-gift-confirm');
  const whoEl = root.querySelector('.inv-gift-who');
  const warnEl = root.querySelector('.inv-gift-warn');
  const phoneLabel = root.querySelector('.inv-gift-phone-label');
  const phoneInput = root.querySelector('.inv-gift-phone input');
  const sendBtn = root.querySelector('.inv-gift-send');
  const pickCancel = root.querySelector('.inv-gift-cancel');
  const noticeEl = root.querySelector('.inv-notice');

  function visibleItems() {
    return registry.filter((it) => (typeof it.isAvailable === 'function' ? !!it.isAvailable() : true));
  }

  function applyPosition() {
    pos = clampPos(pos.x, pos.y);
    root.style.left = `${pos.x}px`;
    root.style.top = `${pos.y}px`;
    const expandLeft = pos.x + ORB_SIZE / 2 > window.innerWidth * 0.5;
    const expandUp = pos.y + ORB_SIZE / 2 > window.innerHeight * 0.62;
    root.classList.toggle('expand-left', expandLeft);
    root.classList.toggle('expand-right', !expandLeft);
    root.classList.toggle('expand-up', expandUp);
    root.classList.toggle('expand-down', !expandUp);
  }

  function itemCategory(it) {
    return it?.category === 'gift' ? 'gift' : 'pocket';
  }

  function render() {
    const en = isEn();
    const ready = typeof isReady === 'function' ? !!isReady() : true;
    root.hidden = !ready;
    if (!ready) {
      if (open) setOpen(false);
      return;
    }

    const avail = visibleItems();
    const pocket = avail.filter((it) => itemCategory(it) === 'pocket');
    const gifts = avail.filter((it) => itemCategory(it) === 'gift');
    const giftUnits = gifts.reduce((n, it) => {
      const q = typeof it.getQty === 'function' ? Math.max(0, it.getQty() | 0) : 1;
      return n + q;
    }, 0);
    const shown = tab === 'gift' ? gifts : pocket;
    const anyActive = avail.some((it) => (typeof it.isActive === 'function' ? !!it.isActive() : false));
    orb.classList.toggle('has-active', anyActive);
    orbDot.hidden = gifts.length === 0 && !anyActive;
    orbCount.hidden = avail.length === 0;
    orbCount.textContent = String(avail.length);
    orb.title = en
      ? 'My Inventory (I) · Drag anywhere to move'
      : '내 인벤토리 (I) · 드래그하여 원하는 위치로 이동';

    const owner = typeof getOwnerLabel === 'function' ? getOwnerLabel(en) : '';
    titleEl.textContent = owner
      ? (en ? `${owner}'s Pocket` : `${owner}의 인벤토리`)
      : (en ? 'MY INVENTORY' : '내 인벤토리');
    subEl.textContent = tab === 'gift'
      ? (en ? `${giftUnits} in gift box · I` : `선물함 보유 ${giftUnits} · I`)
      : `${pocket.length} / ${Math.max(capacity, pocket.length)} · I`;
    for (const btn of tabBtns) {
      const on = btn.dataset.invTab === tab;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.textContent = btn.dataset.invTab === 'gift'
        ? (en ? `Gifts${giftUnits ? ` ×${giftUnits}` : ''}` : `선물함${giftUnits ? ` ×${giftUnits}` : ''}`)
        : (en ? 'Items' : '내 아이템');
    }

    const slotRows = shown.map((it) => {
      const active = typeof it.isActive === 'function' ? !!it.isActive() : false;
      const riding = typeof it.isRiding === 'function' ? !!it.isRiding() : false;
      const rawName = typeof it.getName === 'function' ? it.getName(en) : (en ? (it.enName || it.name) : it.name);
      const badge = typeof it.getBadge === 'function' ? it.getBadge(en) : null;
      const qty = typeof it.getQty === 'function' ? Math.max(0, it.getQty() | 0) : 0;
      const desc = typeof it.getStatusText === 'function'
        ? it.getStatusText(en)
        : (en ? (it.enDesc || it.desc || '') : (it.desc || ''));
      const actionLabel = typeof it.getActionLabel === 'function'
        ? it.getActionLabel(en, { active, riding })
        : (active ? (en ? 'Stow' : '수납') : (en ? 'Summon' : '꺼내기'));
      const canGift = itemCategory(it) === 'gift' && (typeof it.canGift === 'function' ? !!it.canGift() : true);
      const badgeHtml = badge
        ? `<span class="inv-slot-swatch" style="background:${esc(badge.color || '#4f7cff')}">${esc(badge.text || '')}</span>`
        : '';
      const qtyHtml = qty > 0
        ? `<span class="inv-slot-qty" aria-label="${en ? `quantity ${qty}` : `수량 ${qty}`}">×${qty}</span>`
        : '';
      const unit = Math.max(1, Math.floor(Number(it.giftUnit) || 1));
      const unitName = en ? '' : (it.unitName || '개');
      const giftBtn = canGift
        ? `<button type="button" class="inv-slot-pill gift" data-inv-gift="${esc(it.id)}">${en ? `Gift ${unit}` : `${unit}${unitName} 선물`}</button>`
        : '';
      const useBtn = typeof it.onUse === 'function'
        ? `<button type="button" class="inv-slot-pill ${active ? 'on' : ''}" data-inv-use="${esc(it.id)}">${esc(actionLabel)}</button>`
        : '';
      return `
        <div class="inv-slot ${active ? 'is-active' : ''}">
          <span class="inv-slot-icon">${esc(it.icon || '📦')}${qtyHtml}</span>
          <span class="inv-slot-meta">
            <strong>${esc(rawName)}${badgeHtml}</strong>
            <small>${esc(desc)}</small>
          </span>
          <span class="inv-slot-actions">
            ${useBtn}
            ${giftBtn}
          </span>
        </div>
      `;
    });

    if (tab === 'pocket') {
      const emptyCount = Math.max(0, capacity - pocket.length);
      for (let i = 0; i < emptyCount; i++) {
        const hint = i === 0 && pocket.length === 0
          ? (en ? 'Empty slot · Upcoming items will be stored here' : '빈 슬롯 · 앞으로 획득하는 아이템이 담깁니다')
          : (en ? 'Empty slot' : '빈 슬롯');
        slotRows.push(`
          <div class="inv-slot is-empty" aria-disabled="true">
            <span class="inv-slot-icon">＋</span>
            <span class="inv-slot-meta">
              <strong>${en ? `Slot ${pocket.length + i + 1}` : `슬롯 ${pocket.length + i + 1}`}</strong>
              <small>${esc(hint)}</small>
            </span>
          </div>
        `);
      }
    } else if (!shown.length && !giftPickId) {
      slotRows.push(`
        <div class="inv-slot is-empty" aria-disabled="true">
          <span class="inv-slot-icon">🎁</span>
          <span class="inv-slot-meta">
            <strong>${en ? 'Gift box' : '선물함'}</strong>
            <small>${en ? 'Gifts you receive are kept here' : '받은 선물이 여기 보관됩니다'}</small>
          </span>
        </div>
      `);
    }

    listEl.hidden = !!giftPickId;
    listEl.innerHTML = slotRows.join('');
    pickEl.hidden = !giftPickId;
    confirmEl.hidden = !giftPeer;
    pickList.hidden = !!giftPeer;
    if (giftPickId) {
      const item = registry.find((it) => it.id === giftPickId);
      const itemName = item
        ? (typeof item.getName === 'function' ? item.getName(en) : (en ? (item.enName || item.name) : item.name))
        : '';
      pickTitle.textContent = giftPeer
        ? (en ? `Confirm gift` : `선물 확인`)
        : (en ? `Gift ${itemName}` : `${itemName} 선물하기`);
      pickCancel.textContent = giftPeer ? (en ? 'Back' : '뒤로') : (en ? 'Cancel' : '취소');
      if (!giftPeer) {
        const peers = (typeof getPeers === 'function' ? getPeers() : []) || [];
        pickList.innerHTML = peers.length
          ? peers.map((p) => `<button type="button" class="inv-peer" data-inv-peer="${esc(p.id)}" data-inv-peer-name="${esc(p.name || '')}"><strong>${esc(p.name || (en ? 'Player' : '손님'))}</strong></button>`).join('')
          : `<p class="inv-peer-empty">${en ? 'Nobody else is in this region.' : '같은 지역에 접속 중인 사람이 없습니다.'}</p>`;
      } else {
        const who = giftPeer.name || (en ? 'this player' : '이 사람');
        whoEl.textContent = en ? `${itemName} → ${who}` : `${who}에게 ${itemName}`;
        warnEl.textContent = en
          ? 'Sends 1 from your stock after the phone number matches. This cannot be undone here.'
          : '전화번호가 맞으면 보유 수량에서 1대만 넘어갑니다. 여기서는 되돌릴 수 없습니다.';
        phoneLabel.textContent = en ? 'Their phone number' : '상대 전화번호';
        sendBtn.textContent = en ? 'Check number and gift 1' : '번호 확인하고 1대 선물';
      }
    }
    noticeEl.hidden = !notice;
    noticeEl.textContent = notice;
  }

  function setOpen(next) {
    const ready = typeof isReady === 'function' ? !!isReady() : true;
    const want = !!next && ready;
    open = want;
    root.classList.toggle('open', open);
    orb.setAttribute('aria-expanded', open ? 'true' : 'false');
    tray.hidden = !open;
    if (!open) {
      giftPickId = null;
      giftPeer = null;
      if (phoneInput) phoneInput.value = '';
    }
    if (open) {
      applyPosition();
      render();
    }
  }

  let drag = null;
  orb.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
    orb.setPointerCapture(e.pointerId);
    root.classList.add('dragging');
    e.stopPropagation();
  });

  orb.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
    }
    if (drag.moved) {
      pos = clampPos(drag.origX + dx, drag.origY + dy);
      applyPosition();
    }
  });

  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const wasMoved = drag.moved;
    drag = null;
    root.classList.remove('dragging');
    if (wasMoved) {
      savePos(pos);
    } else {
      setOpen(!open);
    }
  };
  orb.addEventListener('pointerup', endDrag);
  orb.addEventListener('pointercancel', () => {
    drag = null;
    root.classList.remove('dragging');
  });

  root.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-inv-tab]');
    if (tabBtn && root.contains(tabBtn)) {
      tab = tabBtn.dataset.invTab === 'gift' ? 'gift' : 'pocket';
      giftPickId = null;
      giftPeer = null;
      if (phoneInput) phoneInput.value = '';
      notice = '';
      render();
      return;
    }
    if (e.target.closest('.inv-gift-cancel')) {
      if (giftPeer) {
        giftPeer = null;
        if (phoneInput) phoneInput.value = '';
      } else giftPickId = null;
      render();
      return;
    }
    const peerBtn = e.target.closest('[data-inv-peer]');
    if (peerBtn) {
      giftPeer = {
        id: peerBtn.dataset.invPeer,
        name: peerBtn.dataset.invPeerName || peerBtn.textContent.trim(),
      };
      if (phoneInput) phoneInput.value = '';
      notice = '';
      render();
      phoneInput?.focus();
      return;
    }
    const giftBtn = e.target.closest('[data-inv-gift]');
    if (giftBtn) {
      giftPickId = giftBtn.dataset.invGift;
      giftPeer = null;
      if (phoneInput) phoneInput.value = '';
      notice = '';
      render();
      return;
    }
    const useBtn = e.target.closest('[data-inv-use]');
    if (!useBtn) return;
    const item = registry.find((it) => it.id === useBtn.dataset.invUse);
    if (!item) return;
    item.onUse?.();
    render();
  });

  confirmEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    const item = registry.find((it) => it.id === giftPickId);
    const peer = giftPeer;
    const phone = String(phoneInput?.value || '').replace(/\D/g, '');
    const en = isEn();
    if (!item || !peer) return;
    if (!/^010\d{8}$/.test(phone)) {
      notice = en ? 'Enter an 11-digit mobile number starting with 010.' : '010으로 시작하는 11자리 번호를 입력해 주세요.';
      render();
      return;
    }
    notice = '';
    giftPickId = null;
    giftPeer = null;
    if (phoneInput) phoneInput.value = '';
    item.onGift?.(peer.id, phone);
    render();
  });

  addEventListener('pointerdown', (e) => {
    if (!open) return;
    if (root.contains(e.target)) return;
    setOpen(false);
  });

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyI' || e.repeat) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
    if (document.body.classList.contains('in-gate') || document.body.classList.contains('in-lobby')) return;
    if (typeof isReady === 'function' && !isReady()) return;
    setOpen(!open);
  });

  addEventListener('resize', () => {
    applyPosition();
  });

  onLangChange(() => render());

  applyPosition();
  render();

  return {
    get open() { return open; },
    setOpen,
    refresh: render,
    notify(text) {
      notice = String(text || '');
      render();
    },
    registerItem(item) {
      if (!item || !item.id) return;
      const idx = registry.findIndex((x) => x.id === item.id);
      if (idx >= 0) registry[idx] = item;
      else registry.push(item);
      render();
    },
  };
}
