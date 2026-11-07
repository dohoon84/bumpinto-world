// [titles] 얻은 칭호·장착 칭호. localStorage 만 쓴다. 도감 UI 와 분리된 모델.
import { TITLES, featuredId, sanitizeTitleId, titleByAxisKo, titleById } from './catalog.js';

export const TITLE_STORE_KEY = 'bw.titles.v1';

function empty() {
  return { earned: {}, selected: '', seen: {}, bootstrapped: false };
}

export function createTitleStore({ storage = null, now = () => Date.now() } = {}) {
  let data = empty();
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) { try { fn(snapshot()); } catch { /* 구독자 실수 */ } } };

  function load() {
    if (!storage) return empty();
    try {
      const raw = storage.getItem(TITLE_STORE_KEY);
      if (!raw) return empty();
      const j = JSON.parse(raw);
      const earned = {};
      for (const [id, v] of Object.entries(j?.earned || {})) {
        if (titleById(id)) earned[id] = { at: Number(v?.at) || 0 };
      }
      const selected = sanitizeTitleId(j?.selected);
      const seen = {};
      for (const id of Object.keys(j?.seen || {})) if (titleById(id)) seen[id] = 1;
      return { earned, selected: earned[selected] ? selected : '', seen, bootstrapped: !!j?.bootstrapped };
    } catch {
      return empty();
    }
  }
  function save() {
    try { storage?.setItem(TITLE_STORE_KEY, JSON.stringify(data)); } catch { /* 사생활 모드 */ }
  }
  function snapshot() {
    return {
      earned: { ...data.earned },
      selected: data.selected,
      seen: { ...data.seen },
      bootstrapped: data.bootstrapped,
    };
  }

  data = load();

  function grant(id, at = now()) {
    if (!titleById(id)) return false;
    const fresh = !data.earned[id];
    if (fresh) data.earned[id] = { at };
    if (!data.selected) data.selected = id;
    save(); emit();
    return fresh;
  }
  function select(id) {
    if (!id) {
      data.selected = '';
      save(); emit();
      return true;
    }
    const next = sanitizeTitleId(id);
    if (!next || !data.earned[next]) return false;
    data.selected = next;
    save(); emit();
    return true;
  }
  function markSeen(id) {
    if (!titleById(id)) return;
    data.seen[id] = 1;
    save();
  }
  /**
   * 카르마 사다리(unlocked)를 로컬 도감에 반영.
   * 처음 한 번은 이미 열린 칭호를 연출 없이 기록한다(기존 계정이 한꺼번에 터지지 않게).
   * 그 다음부터 새로 열린 id 만 돌려준다.
   */
  function syncLadders(ladders) {
    const unlocked = [];
    for (const ladder of ladders || []) {
      for (const step of ladder.steps || []) {
        if (!step?.unlocked) continue;
        const ko = typeof step.title === 'string' ? step.title : step.title?.ko;
        const t = titleByAxisKo(ladder.axis, ko);
        if (t) unlocked.push(t.id);
      }
    }
    const fresh = [];
    const first = !data.bootstrapped;
    for (const id of unlocked) {
      if (data.earned[id]) continue;
      data.earned[id] = { at: now() };
      if (first) data.seen[id] = 1;
      else fresh.push(id);
    }
    if (first) data.bootstrapped = true;
    if (!data.selected) {
      const pick = featuredId(Object.keys(data.earned));
      if (pick) data.selected = pick;
    }
    save(); emit();
    return fresh;
  }

  return {
    grant, select, markSeen, syncLadders, snapshot,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get selected() { return data.selected; },
    has: (id) => !!data.earned[id],
    seen: (id) => !!data.seen[id],
    earnedIds: () => Object.keys(data.earned),
    at: (id) => data.earned[id]?.at || 0,
    all: () => TITLES,
  };
}
