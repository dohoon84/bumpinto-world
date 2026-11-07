// [titles] 칭호 장착. 도감·이름표·획득 연출이 이 모델을 같이 본다.
import * as THREE from 'three';
import './titles.css';
import { sanitizeTitleId, titleById } from './catalog.js';
import { titleDemoId, titlesEnabled } from './flags.js';
import { createTitleStore } from './store.js';
import { createTitleSound } from './sound.js';
import { paintTitleTag, setTitleTagsEnabled } from './nametag.js';
import { createTitleWorld } from './present.js';
import { createIconSheet, createTitleBook } from './book.js';
import { mountTitleEntries } from './entries.js';
import { iconsReady, loadTitleIcons, onIcons } from './icons.js';
import { isEn, tr } from '../i18n.js';

const stub = () => null;

export function mountTitles({
  scene, camera, overlay, params, getAnchor, listRemotes, onEquip, shown,
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
    };
  }
  setTitleTagsEnabled(true);
  const storage = browserStorage();
  const store = createTitleStore({ storage });
  const sfxOff = (() => { try { return params?.get?.('rideSfx') === '0'; } catch { return false; } })();
  const sound = createTitleSound({ sfxOff });
  const world = scene && camera && overlay
    ? createTitleWorld({
      THREE, scene, camera, overlay, sound,
      getAnchor, shown, listRemotes,
    })
    : { play() {}, setEquipped() {}, tick() {}, get playing() { return false; }, set onDone(fn) { stub(fn); } };

  const queue = [];
  function pump() {
    if (world.playing || !queue.length) return;
    const id = queue.shift();
    const t = titleById(id);
    if (!t || store.seen(id)) { pump(); return; }
    store.markSeen(id);
    world.play(t);
  }
  world.onDone = () => { world.setEquipped(store.selected); pump(); };

  function wear(id) {
    if (!id) {
      store.select('');
      world.setEquipped('');
      onEquip?.('');
      return true;
    }
    const next = sanitizeTitleId(id);
    if (!next || !store.has(next)) return false;
    store.select(next);
    world.setEquipped(next);
    onEquip?.(next);
    return true;
  }
  let sheetOpen = false;
  const book = createTitleBook({
    store,
    onEquip: (id) => { wear(id); sound.playClick(); },
    onUnequip: () => { wear(''); sound.playClick(); },
  });
  const sheet = createIconSheet();
  store.onChange(() => book.refresh());

  if (store.selected) world.setEquipped(store.selected);

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
    world.setEquipped(t.id);
    onEquip?.(t.id);
    world.play(t);
  }

  mountTitleEntries({
    openBook: () => book.open(),
    closeBook: () => book.close(),
    isOpen: () => book.openNow,
  });

  onIcons(() => {
    world.refresh?.();
    book.refresh();
    if (sheetOpen) sheet.open();
    try { window.dispatchEvent(new CustomEvent('bw:titles-icons')); } catch { /* 없음 */ }
  });
  loadTitleIcons();

  watchKarma(store, (ids) => { queue.push(...ids); pump(); });

  function paintTag(el, spec) {
    paintTitleTag(el, {
      ...spec,
      titleId: spec.titleId ?? store.selected,
      afkText: spec.afkText || tr('자리비움', 'AFK'),
    });
  }

  return {
    enabled: true,
    tick(dt) { armDemo(); world.tick(dt); },
    selectedId: () => store.selected,
    openBook: () => book.open(),
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
      store.markSeen(t.id);
      world.play(t);
      return true;
    },
    paintTag,
    setView: (zone, nextScene, nextCam) => world.setView?.(zone, nextScene, nextCam),
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
