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

export function mountInventory({ items = [], capacity = DEFAULT_CAPACITY, isReady = () => true, getOwnerLabel = null } = {}) {
  const registry = [...items];
  let open = false;
  let pos = readPos();

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
      <div class="inv-tray-list"></div>
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

  function render() {
    const en = isEn();
    const ready = typeof isReady === 'function' ? !!isReady() : true;
    root.hidden = !ready;
    if (!ready) {
      if (open) setOpen(false);
      return;
    }

    const avail = visibleItems();
    const anyActive = avail.some((it) => (typeof it.isActive === 'function' ? !!it.isActive() : false));
    orb.classList.toggle('has-active', anyActive);
    orbDot.hidden = !anyActive;
    orbCount.hidden = avail.length === 0;
    orbCount.textContent = String(avail.length);
    orb.title = en
      ? 'My Inventory (I) · Drag anywhere to move'
      : '내 인벤토리 (I) · 드래그하여 원하는 위치로 이동';

    const owner = typeof getOwnerLabel === 'function' ? getOwnerLabel(en) : '';
    titleEl.textContent = owner
      ? (en ? `${owner}'s Pocket` : `${owner}의 인벤토리`)
      : (en ? 'MY INVENTORY' : '내 인벤토리');
    subEl.textContent = `${avail.length} / ${Math.max(capacity, avail.length)} · I`;

    const slotRows = avail.map((it) => {
      const active = typeof it.isActive === 'function' ? !!it.isActive() : false;
      const riding = typeof it.isRiding === 'function' ? !!it.isRiding() : false;
      const rawName = typeof it.getName === 'function' ? it.getName(en) : (en ? (it.enName || it.name) : it.name);
      const badge = typeof it.getBadge === 'function' ? it.getBadge(en) : null;
      const desc = typeof it.getStatusText === 'function'
        ? it.getStatusText(en)
        : (en ? (it.enDesc || it.desc || '') : (it.desc || ''));
      const actionLabel = typeof it.getActionLabel === 'function'
        ? it.getActionLabel(en, { active, riding })
        : (active ? (en ? 'Stow' : '수납') : (en ? 'Summon' : '꺼내기'));
      const badgeHtml = badge
        ? `<span class="inv-slot-swatch" style="background:${esc(badge.color || '#4f7cff')}">${esc(badge.text || '')}</span>`
        : '';
      return `
        <button type="button" class="inv-slot ${active ? 'is-active' : ''}" data-inv-item="${esc(it.id)}">
          <span class="inv-slot-icon">${esc(it.icon || '📦')}</span>
          <span class="inv-slot-meta">
            <strong>${esc(rawName)}${badgeHtml}</strong>
            <small>${esc(desc)}</small>
          </span>
          <span class="inv-slot-pill ${active ? 'on' : ''}">${esc(actionLabel)}</span>
        </button>
      `;
    });

    const emptyCount = Math.max(0, capacity - avail.length);
    for (let i = 0; i < emptyCount; i++) {
      const hint = i === 0 && avail.length === 0
        ? (en ? 'Empty slot · Upcoming items will be stored here' : '빈 슬롯 · 앞으로 획득하는 아이템이 담깁니다')
        : (en ? 'Empty slot' : '빈 슬롯');
      slotRows.push(`
        <div class="inv-slot is-empty" aria-disabled="true">
          <span class="inv-slot-icon">＋</span>
          <span class="inv-slot-meta">
            <strong>${en ? `Slot ${avail.length + i + 1}` : `슬롯 ${avail.length + i + 1}`}</strong>
            <small>${esc(hint)}</small>
          </span>
        </div>
      `);
    }

    listEl.innerHTML = slotRows.join('');
  }

  function setOpen(next) {
    const ready = typeof isReady === 'function' ? !!isReady() : true;
    const want = !!next && ready;
    open = want;
    root.classList.toggle('open', open);
    orb.setAttribute('aria-expanded', open ? 'true' : 'false');
    tray.hidden = !open;
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

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-inv-item]');
    if (!btn) return;
    const id = btn.dataset.invItem;
    const item = registry.find((it) => it.id === id);
    if (!item) return;
    item.onUse?.();
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
    registerItem(item) {
      if (!item || !item.id) return;
      const idx = registry.findIndex((x) => x.id === item.id);
      if (idx >= 0) registry[idx] = item;
      else registry.push(item);
      render();
    },
  };
}
