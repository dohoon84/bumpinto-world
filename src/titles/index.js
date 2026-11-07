// [titles] 칭호 장착. 도감·이름표·획득 연출이 이 모델을 같이 본다.
import './titles.css';
import { announceTitleId, gradeRank, sanitizeTitleId, titleById } from './catalog.js';
import { titleCheerOn, titleDemoId, titleFxOn, titleRarityOn, titlesEnabled } from './flags.js';
import { createTitleStore } from './store.js';
import { createTitleSound } from './sound.js';
import { paintTitleTag, setTitleFxEnabled, setTitleTagsEnabled } from './nametag.js';
import { createCeremony } from './present.js';
import { createIconSheet, createTitleBook } from './book.js';
import { mountTitleEntries } from './entries.js';
import { gradeOf, iconsReady, loadTitleIcons, onIcons } from './icons.js';
import { fetchTitleRarity } from './rarity.js';
import { createCheer } from './cheer.js';
import { createTitleFx } from './fx.js';
import { accountBase } from '../account/api.js';
import { isEn, tr } from '../i18n.js';

function repaint() {
  try { window.dispatchEvent(new CustomEvent('bw:titles-icons')); } catch { /* 없음 */ }
}

export function mountTitles({
  overlay, params, getAnchor, getFeet, listRemotes, onEquip, shown, presence,
} = {}) {
  const search = params?.toString ? `?${params.toString()}` : String(params?.search || '');
  if (!titlesEnabled(search)) {
    setTitleTagsEnabled(false);
    return {
      enabled: false,
      tick() {},
      selectedId: () => '',
      openBook() {},
      closeBook() {},
      showSheet() {},
      hideSheet() {},
      grant() {},
      present() {},
      paintTag(el, spec) {
        paintTitleTag(el, { ...spec, titleId: '', afkText: spec.afkText || '' });
      },
      setView() {},
      playing: () => false,
      iconsReady: () => false,
      cheerOn: false,
    };
  }
  const fxOn = titleFxOn(search);
  const rarityOn = titleRarityOn(search);
  const cheerOn = titleCheerOn(search);
  setTitleTagsEnabled(true);
  setTitleFxEnabled(fxOn);
  const storage = browserStorage();
  const store = createTitleStore({ storage });
  const sfxOff = (() => { try { return params?.get?.('rideSfx') === '0'; } catch { return false; } })();
  const sound = createTitleSound({ sfxOff });
  const world = createCeremony({ sound, onPaint: repaint });
  const announced = new Set();
  let announceAt = 0;
  function maybeAnnounce(id) {
    if (!cheerOn) return;
    const ok = announceTitleId(id);
    if (!ok || announced.has(ok)) return;
    const now = Date.now();
    if (now - announceAt < 20000) return;
    announced.add(ok);
    announceAt = now;
    presence?.sendTitle?.(ok);
  }
  const mobile = () => typeof document !== 'undefined' && document.body.classList.contains('mobile');
  const fx = createTitleFx({ overlay, enabled: fxOn, mobile: mobile() });
  const cheer = createCheer({
    enabled: cheerOn,
    presence,
    getPos: () => getFeet?.() || getAnchor?.() || null,
    onClap: (msg) => {
      try { window.__jj?.triggerEmote?.('clap', true); } catch { /* 없음 */ }
      void msg;
    },
  });
  presence?.on?.('title', (m) => cheer.show(m));
  presence?.on?.('title_clap', (m) => {
    try { window.__jj?.onTitleClap?.(m); } catch { /* 없음 */ }
  });

  const queue = [];
  function pump() {
    if (world.playing || !queue.length) return;
    const id = queue.shift();
    const t = titleById(id);
    if (!t || store.seen(id)) { pump(); return; }
    store.markSeen(id);
    playTitle(t);
  }
  world.onDone = () => pump();

  function playTitle(t) {
    world.play(t);
    maybeAnnounce(t.id);
  }
  function wear(id) {
    if (!id) {
      store.select('');
      onEquip?.('');
      return true;
    }
    const next = sanitizeTitleId(id);
    if (!next || !store.has(next)) return false;
    store.select(next);
    onEquip?.(next);
    return true;
  }
  let rarityState = null;
  let rarityAsked = false;
  function rarityOf(id) {
    if (!rarityOn) return null;
    if (!rarityState || rarityState.ready !== true || typeof rarityState.pct?.[id] !== 'number') return { wait: true };
    return { pct: rarityState.pct[id] };
  }
  async function loadRarity() {
    if (!rarityOn || rarityAsked) return;
    rarityAsked = true;
    const view = await fetchTitleRarity(accountBase());
    rarityState = view || { ready: false, pct: {} };
    book.refresh();
  }
  let sheetOpen = false;
  const book = createTitleBook({
    store,
    rarityOf,
    onEquip: (id) => { wear(id); sound.playClick(); },
    onUnequip: () => { wear(''); sound.playClick(); },
  });
  const sheet = createIconSheet();
  store.onChange(() => book.refresh());

  const demo = titleDemoId(search, (id) => !!titleById(id));
  let demoArmed = !!demo;
  function armDemo() {
    if (!demoArmed) return;
    if (shown && !shown()) return;
    demoArmed = false;
    const t = titleById(demo);
    if (!t) return;
    store.grant(t.id);
    store.select(t.id);
    store.markSeen(t.id);
    playTitle(t);
    onEquip?.(t.id);
  }

  mountTitleEntries({
    openBook: () => { loadRarity(); book.open(); },
    closeBook: () => book.close(),
    isOpen: () => book.openNow,
  });

  onIcons(() => {
    book.refresh();
    if (sheetOpen) sheet.open();
    repaint();
  });
  loadTitleIcons();

  watchKarma(store, (ids) => {
    for (const id of ids) {
      const t = titleById(id);
      if (t && gradeRank(gradeOf(t)) >= gradeRank('gold')) maybeAnnounce(id);
    }
    queue.push(...ids);
    pump();
  });

  function paintTag(el, spec) {
    const id = spec.titleId ?? store.selected;
    paintTitleTag(el, {
      ...spec,
      titleId: id,
      afkText: spec.afkText || tr('자리비움', 'AFK'),
      celebrate: !!(spec.local && world.celebrating() === id),
    });
  }
  function fxList() {
    if (!fxOn) return [];
    const feet = getFeet?.();
    const out = [];
    const selfTitle = titleById(store.selected);
    const selfGrade = selfTitle ? gradeOf(selfTitle) : '';
    if (feet && (selfGrade === 'legendary' || selfGrade === 'event')) {
      out.push({ x: feet.x, y: feet.y, z: feet.z, grade: selfGrade, d: 0 });
    }
    if (mobile()) return out.slice(0, 1);
    const mine = feet || { x: 0, y: 0, z: 0 };
    for (const p of listRemotes?.() || []) {
    const g = gradeOf(titleById(p.titleId));
    if (!titleById(p.titleId) || (g !== 'legendary' && g !== 'event')) continue;
      const d = Math.hypot((p.x || 0) - mine.x, (p.z || 0) - mine.z);
      if (d > fx.near) continue;
      out.push({ x: p.x, y: p.y || 0, z: p.z, grade: g, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, 3);
  }

  return {
    enabled: true,
    cheerOn,
    tick() { armDemo(); fx.tick(fxList()); },
    selectedId: () => store.selected,
    openBook: () => { loadRarity(); book.open(); },
    closeBook: () => book.close(),
    showSheet: () => { sheetOpen = true; sheet.open(); },
    hideSheet: () => { sheetOpen = false; sheet.close(); },
    playing: () => !!world.playing,
    iconsReady: () => iconsReady(),
    grant(ids) {
      const list = Array.isArray(ids) ? ids : [ids];
      for (const id of list) if (titleById(id)) store.grant(id);
      if (!store.selected && list.length) wear(sanitizeTitleId(list[0]));
      book.refresh();
    },
    present(id) {
      const t = titleById(id);
      if (!t) return false;
      store.grant(t.id);
      store.select(t.id);
      store.markSeen(t.id);
      playTitle(t);
      onEquip?.(t.id);
      return true;
    },
    paintTag,
    setView() {},
    labelOf: (id) => {
      const t = titleById(id);
      return t ? (isEn() ? t.name.en : t.name.ko) : '';
    },
  };
}

function browserStorage() {
  try {
    const k = 'bw.titles.probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const m = new Map();
    return { getItem: (key) => (m.has(key) ? m.get(key) : null), setItem: (key, v) => m.set(key, String(v)) };
  }
}

async function watchKarma(store, onFresh) {
  try {
    const { econ } = await import('../ui-v2/econ/index.js');
    const pull = async () => {
      try {
        const karma = await econ.getKarma();
        const fresh = store.syncLadders(karma?.ladders || []);
        if (fresh.length) onFresh(fresh);
      } catch { /* 카르마를 못 읽으면 도감은 로컬만 */ }
    };
    await pull();
    econ.on?.('reward', () => pull());
    econ.on?.('session', () => pull());
  } catch { /* 경제 모듈이 없어도 칭호 도감은 동작 */ }
}
