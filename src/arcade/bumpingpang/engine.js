// [범핑팡] 순수 3매치 엔진 (DOM/캔버스 없음). scripts/test-arcade-pang.mjs 가 이 파일만 본다.
import { TILES } from './tiles.js';

export const COLS = 8;
export const ROWS = 8;
export const PLAY_SEC = 30; // 시간 바 용량(레벨업 시 풀 충전). 고정 60초 라운드 폐지.
export const BASE_GAUGE = 90;
export const GAUGE_GROWTH = 1.17; // 레벨당 게이지 요구량 증가
export const DRAIN_GROWTH = 0.11; // 레벨당 시간 소모 배율 증가

export const MATCH_MIN = 3;

export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** @returns {{id:string, special?:string|null}[][]} */
export function createBoard(rng = Math.random) {
  const board = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      let id;
      do {
        id = TILES[Math.floor(rng() * TILES.length)].id;
      } while (
        (c >= 2 && row[c - 1]?.id === id && row[c - 2]?.id === id)
        || (r >= 2 && board[r - 1][c]?.id === id && board[r - 2][c]?.id === id)
      );
      row.push({ id, special: null });
    }
    board.push(row);
  }
  return board;
}

export function inBounds(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }

export function areAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

export function swap(board, a, b) {
  const t = board[a.r][a.c];
  board[a.r][a.c] = board[b.r][b.c];
  board[b.r][b.c] = t;
}

/** 같은 id 연속 3+ 그룹 + special 발동 그룹 */
export function findMatches(board) {
  const mark = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const groups = [];

  const run = (cells) => {
    if (cells.length < MATCH_MIN) return;
    for (const { r, c } of cells) mark[r][c] = true;
    groups.push(cells);
  };

  for (let r = 0; r < ROWS; r++) {
    let cells = [{ r, c: 0 }];
    for (let c = 1; c < COLS; c++) {
      const cur = board[r][c], prev = board[r][c - 1];
      if (cur && prev && cur.id === prev.id && !cur.special && !prev.special) cells.push({ r, c });
      else { run(cells); cells = [{ r, c }]; }
    }
    run(cells);
  }
  for (let c = 0; c < COLS; c++) {
    let cells = [{ r: 0, c }];
    for (let r = 1; r < ROWS; r++) {
      const cur = board[r][c], prev = board[r - 1][c];
      if (cur && prev && cur.id === prev.id && !cur.special && !prev.special) cells.push({ r, c });
      else { run(cells); cells = [{ r, c }]; }
    }
    run(cells);
  }

  // specials trigger: collect their blast sets
  const specialBlasts = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = board[r][c];
    if (!cell?.special) continue;
    // only blast if this special is part of a marked match OR we activate via swap (handled by caller with force)
  }

  const matched = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (mark[r][c]) matched.push({ r, c });
  return { matched, groups, mark, specialBlasts };
}

/** 스왑으로 special 을 활성화할 때 blast 칸 */
export function specialCells(board, r, c) {
  const cell = board[r]?.[c];
  if (!cell?.special) return [];
  const out = [{ r, c }];
  if (cell.special === 'lineH') {
    for (let cc = 0; cc < COLS; cc++) out.push({ r, c: cc });
  } else if (cell.special === 'lineV') {
    for (let rr = 0; rr < ROWS; rr++) out.push({ r: rr, c });
  } else if (cell.special === 'bomb') {
    for (let rr = r - 1; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) if (inBounds(rr, cc)) out.push({ r: rr, c: cc });
  } else if (cell.special === 'color') {
    const id = cell.id;
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) if (board[rr][cc]?.id === id) out.push({ r: rr, c: cc });
  }
  return out;
}

/** 매치 결과로 special 생성 위치·종류 결정 */
export function planSpecials(groups) {
  const specs = [];
  for (const g of groups) {
    if (g.length < 4) continue;
    const rs = new Set(g.map((p) => p.r)), cs = new Set(g.map((p) => p.c));
    const mid = g[Math.floor(g.length / 2)];
    let special = 'bomb';
    if (g.length >= 5 && (rs.size === 1 || cs.size === 1)) special = 'color';
    else if (rs.size === 1) special = 'lineH';
    else if (cs.size === 1) special = 'lineV';
    else if (g.length >= 5) special = 'bomb';
    specs.push({ r: mid.r, c: mid.c, special, id: null }); // id filled by caller from board
  }
  return specs;
}

export function clearCells(board, cells) {
  const seen = new Set();
  let n = 0;
  for (const { r, c } of cells) {
    const k = `${r},${c}`;
    if (seen.has(k) || !inBounds(r, c) || !board[r][c]) continue;
    seen.add(k);
    board[r][c] = null;
    n++;
  }
  return n;
}

export function applyGravity(board, rng = Math.random) {
  const moves = [];
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        if (write !== r) {
          board[write][c] = board[r][c];
          board[r][c] = null;
          moves.push({ from: { r, c }, to: { r: write, c }, tile: board[write][c] });
        }
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      const id = TILES[Math.floor(rng() * TILES.length)].id;
      board[r][c] = { id, special: null };
      moves.push({ from: { r: r - (write + 1), c }, to: { r, c }, tile: board[r][c], spawn: true });
    }
  }
  return moves;
}

export function scoreFor(cleared, combo, level = 1) {
  // 기본 10 × 칸수 × 콤보 배율 × 레벨 배율
  const comboMult = 1 + Math.max(0, combo - 1) * 0.5;
  const levelMult = scoreMult(level);
  return Math.round(cleared * 10 * comboMult * levelMult);
}

/** 레벨 점수 배율 — Lv1=1.0, 매 레벨 +0.12 */
export function scoreMult(level) {
  return 1 + Math.max(0, (Number(level) || 1) - 1) * 0.12;
}

/** 레벨업에 필요한 게이지 */
export function gaugeNeed(level) {
  const lv = Math.max(1, Number(level) || 1);
  return Math.round(BASE_GAUGE * (GAUGE_GROWTH ** (lv - 1)));
}

/** 초당 시간 소모(초). Lv1=1.0 → 30초 풀, Lv10≈1.99 → ~15초 */
export function timeDrainPerSec(level) {
  const lv = Math.max(1, Number(level) || 1);
  return 1 + (lv - 1) * DRAIN_GROWTH;
}

/** 클리어로 채우는 게이지량 */
export function gaugeFill(cleared, combo = 1, specialCount = 0) {
  const c = Math.max(0, Number(cleared) || 0);
  const k = Math.max(1, Number(combo) || 1);
  const sp = Math.max(0, Number(specialCount) || 0);
  return Math.round(c * 7 + Math.max(0, k - 1) * 14 + sp * 22);
}

/** 도달 레벨 기준 별점 */
export function starsForLevel(level) {
  const lv = Math.max(0, Number(level) || 0);
  if (lv >= 12) return 3;
  if (lv >= 7) return 2;
  if (lv >= 3) return 1;
  return 0;
}

/**
 * 긴 런 대비 서버/클라 공통 타당성 검사.
 * - 최소 플레이 시간: 레벨당 ~6초 (애니·조작)
 * - 점수 상한: 초당 ~280 + 레벨 보너스(여유)
 * - 레벨 상한: 지속시간으로 역산
 */
export function plausibleRun({ score, level, durationMs, maxLevel = 40 } = {}) {
  const sc = Math.round(Number(score) || 0);
  const lv = Math.max(1, Math.round(Number(level) || 1));
  const dur = Math.max(0, Number(durationMs) || 0);
  if (!Number.isFinite(sc) || sc < 0) return { ok: false, reason: 'bad_score' };
  if (lv > maxLevel) return { ok: false, reason: 'level_cap' };
  const minMs = Math.max(0, (lv - 1) * 6000); // 레벨업 lv-1회 최소 시간
  if (dur > 0 && dur < minMs * 0.7) return { ok: false, reason: 'too_fast' };
  const sec = Math.max(1, dur / 1000);
  const maxScore = Math.round(sec * 280 + lv * 2800);
  if (sc > maxScore) return { ok: false, reason: 'score_cap' };
  // 레벨 없이 점수만 비정상적으로 클 때
  if (sc > 5000 && lv < 2 && dur < 20000) return { ok: false, reason: 'implausible' };
  return { ok: true };
}

/**
 * 한 스왑을 시도하고 연쇄까지 처리(동기).
 * @returns {{ ok:boolean, steps: object[], score:number, maxCombo:number }}
 */
export function trySwap(board, a, b, rng = Math.random, level = 1) {
  if (!areAdjacent(a, b)) return { ok: false, steps: [], score: 0, maxCombo: 0, cleared: 0, gauge: 0 };
  swap(board, a, b);
  const steps = [];
  let score = 0, combo = 0, maxCombo = 0, clearedTotal = 0, gauge = 0;

  // special activation if either cell is special
  const forced = [];
  for (const p of [a, b]) {
    if (board[p.r][p.c]?.special) forced.push(...specialCells(board, p.r, p.c));
  }

  for (;;) {
    const { matched, groups } = findMatches(board);
    const cells = matched.concat(forced);
    forced.length = 0;
    if (!cells.length) break;
    combo += 1;
    maxCombo = Math.max(maxCombo, combo);

    // also expand specials that are being cleared
    const expand = [...cells];
    for (const { r, c } of cells) {
      if (board[r]?.[c]?.special) expand.push(...specialCells(board, r, c));
    }

    const specs = planSpecials(groups);
    for (const s of specs) {
      const src = board[s.r]?.[s.c];
      if (src) s.id = src.id;
    }

    const cleared = clearCells(board, expand);
    // place specials back
    for (const s of specs) {
      if (inBounds(s.r, s.c)) board[s.r][s.c] = { id: s.id || TILES[0].id, special: s.special };
    }
    const gained = scoreFor(cleared, combo, level);
    score += gained;
    clearedTotal += cleared;
    const gFill = gaugeFill(cleared, combo, specs.length);
    gauge += gFill;
    steps.push({ type: 'clear', cells: expand, cleared, combo, gained, specs, gaugeFill: gFill });
    const moves = applyGravity(board, rng);
    steps.push({ type: 'fall', moves });
  }

  if (!steps.length) {
    swap(board, a, b); // revert
    return { ok: false, steps: [], score: 0, maxCombo: 0, cleared: 0, gauge: 0 };
  }
  return { ok: true, steps, score, maxCombo, cleared: clearedTotal, gauge };
}

/** 보드에 유효 수(인접 스왑으로 매치)가 있는지 */
export function hasMoves(board) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) {
        swap(board, { r, c }, { r, c: c + 1 });
        const m = findMatches(board).matched.length;
        swap(board, { r, c }, { r, c: c + 1 });
        if (m) return true;
      }
      if (r + 1 < ROWS) {
        swap(board, { r, c }, { r: r + 1, c });
        const m = findMatches(board).matched.length;
        swap(board, { r, c }, { r: r + 1, c });
        if (m) return true;
      }
    }
  }
  return false;
}

export function shuffleBoard(board, rng = Math.random) {
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push(board[r][c]);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  let k = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) board[r][c] = cells[k++];
}
