// [범핑팡] DOM 오버레이 게임 — 캔버스 보드 + 콤보/파티클 + 터치·마우스
import { TILES } from './tiles.js';
import {
  COLS, ROWS, PLAY_SEC, createBoard, makeRng, hashSeed, trySwap, hasMoves, shuffleBoard, areAdjacent,
} from './engine.js';

const COLORS = Object.fromEntries(TILES.map((t) => [t.id, t.color]));
const LABELS = Object.fromEntries(TILES.map((t) => [t.id, t.label]));

export function mountBumpingPang({
  root, sfx, ranked = true, storeId = 'arcade-seohyeon', getName = () => '나',
  onExit, onResult, practice = false,
} = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'arc-pang';
  wrap.innerHTML = `
    <div class="arc-pang-hud">
      <div class="arc-pang-score"><small>점수</small><b data-score>0</b></div>
      <div class="arc-pang-timer"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" pathLength="100"/><circle data-ring cx="18" cy="18" r="15.5" pathLength="100"/></svg><b data-time>${PLAY_SEC}</b></div>
      <div class="arc-pang-combo"><small>콤보</small><b data-combo>0</b></div>
      <button type="button" class="arc-pang-mute" data-mute title="음소거">🔊</button>
      <button type="button" class="arc-pang-x" data-exit title="나가기">✕</button>
    </div>
    <canvas class="arc-pang-cv" width="560" height="560"></canvas>
    <div class="arc-pang-fx" data-fx></div>
    <div class="arc-pang-toast" data-toast hidden></div>
    <div class="arc-pang-intro" data-intro>
      <div class="box">
        <h2>범핑팡</h2>
        <p>같은 알 3개 이상 맞추면 터져요. <b>60초</b> 동안 점수를 겨뤄요.</p>
        <p class="tag">${practice || !ranked ? '연습 모드 · 순위 기록 안 함' : '랭킹 도전'}</p>
        <button type="button" data-go>시작</button>
      </div>
    </div>
    <div class="arc-pang-result" data-result hidden></div>
  `;
  root.appendChild(wrap);
  const cv = wrap.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const el = {
    score: wrap.querySelector('[data-score]'),
    time: wrap.querySelector('[data-time]'),
    combo: wrap.querySelector('[data-combo]'),
    ring: wrap.querySelector('[data-ring]'),
    fx: wrap.querySelector('[data-fx]'),
    toast: wrap.querySelector('[data-toast]'),
    intro: wrap.querySelector('[data-intro]'),
    result: wrap.querySelector('[data-result]'),
    mute: wrap.querySelector('[data-mute]'),
  };

  const seed = hashSeed(`${storeId}|${new Date().toISOString().slice(0, 10)}|pang`);
  const rng = makeRng(seed);
  let board = createBoard(rng);
  let score = 0, comboShow = 0, left = PLAY_SEC, playing = false, over = false, busy = false;
  let sel = null, particles = [], shake = 0;
  let raf = 0, last = 0, acc = 0;

  function cellSize() {
    const pad = 8;
    return { pad, s: (cv.width - pad * 2) / COLS };
  }
  function draw() {
    const { pad, s } = cellSize();
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (shake) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      const x = pad + c * s, y = pad + r * s;
      ctx.fillStyle = '#152238';
      roundRect(ctx, x + 2, y + 2, s - 4, s - 4, 10); ctx.fill();
      if (!cell) continue;
      const col = COLORS[cell.id] || '#888';
      // jewel body
      const g = ctx.createRadialGradient(x + s * 0.35, y + s * 0.3, 2, x + s / 2, y + s / 2, s * 0.42);
      g.addColorStop(0, '#fff'); g.addColorStop(0.25, col); g.addColorStop(1, shade(col, -40));
      ctx.fillStyle = g;
      roundRect(ctx, x + 6, y + 6, s - 12, s - 12, 12); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(ctx, x + 10, y + 10, s * 0.35, s * 0.18, 6); ctx.fill();
      ctx.fillStyle = '#0a1220';
      ctx.font = `800 ${Math.floor(s * 0.28)}px Pretendard,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(LABELS[cell.id] || '?', x + s / 2, y + s / 2 + 2);
      if (cell.special) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.strokeRect(x + 8, y + 8, s - 16, s - 16);
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${Math.floor(s * 0.2)}px sans-serif`;
        const mark = cell.special === 'lineH' ? '═' : cell.special === 'lineV' ? '║' : cell.special === 'bomb' ? '✦' : '★';
        ctx.fillText(mark, x + s / 2, y + s * 0.78);
      }
      if (sel && sel.r === r && sel.c === c) {
        ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 4;
        roundRect(ctx, x + 3, y + 3, s - 6, s - 6, 12); ctx.stroke();
      }
    }
    // particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (shake) ctx.restore();
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }
  function burst(r, c, color, n = 10) {
    const { pad, s } = cellSize();
    const x = pad + c * s + s / 2, y = pad + r * s + s / 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 4, color, life: 1 });
    }
  }
  function toast(msg) {
    el.toast.hidden = false; el.toast.textContent = msg;
    clearTimeout(el.toast._t);
    el.toast._t = setTimeout(() => { el.toast.hidden = true; }, 900);
  }
  function syncHud() {
    el.score.textContent = String(score);
    el.time.textContent = String(Math.max(0, Math.ceil(left)));
    el.combo.textContent = String(comboShow);
    const pct = Math.max(0, left / PLAY_SEC) * 100;
    el.ring.style.strokeDasharray = `${pct} 100`;
    el.ring.classList.toggle('urgent', left <= 10);
  }

  function cellFromEvent(e) {
    const rect = cv.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] || e.changedTouches[0] : e;
    const x = (pt.clientX - rect.left) * (cv.width / rect.width);
    const y = (pt.clientY - rect.top) * (cv.height / rect.height);
    const { pad, s } = cellSize();
    const c = Math.floor((x - pad) / s), r = Math.floor((y - pad) / s);
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null;
    return { r, c };
  }

  async function doSwap(a, b) {
    if (busy || !playing || over) return;
    busy = true;
    sfx?.swap?.();
    const res = trySwap(board, a, b, rng);
    if (!res.ok) {
      sfx?.deny?.();
      shake = 6;
      busy = false; sel = null; draw();
      return;
    }
    score += res.score;
    comboShow = res.maxCombo;
    for (const step of res.steps) {
      if (step.type === 'clear') {
        sfx?.match?.(step.combo);
        if (step.specs?.length) sfx?.special?.();
        if (step.combo >= 2) { sfx?.cascade?.(step.combo); toast(`${step.combo}콤보! +${step.gained}`); }
        for (const p of step.cells) {
          const cellCol = COLORS[board[p.r]?.[p.c]?.id] || '#ffe66d';
          burst(p.r, p.c, cellCol, 8);
        }
        // board already cleared by engine; show empty then fall
        shake = 3 + step.combo;
        syncHud(); draw();
        await wait(140);
      } else if (step.type === 'fall') {
        draw();
        await wait(90);
      }
    }
    if (!hasMoves(board)) {
      toast('섞는 중…');
      shuffleBoard(board, rng);
      await wait(200);
    }
    sel = null; busy = false; syncHud(); draw();
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function onPointer(e) {
    if (!playing || over || busy) return;
    e.preventDefault();
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (!sel) { sel = cell; sfx?.select?.(); draw(); return; }
    if (sel.r === cell.r && sel.c === cell.c) { sel = null; draw(); return; }
    if (!areAdjacent(sel, cell)) { sel = cell; sfx?.select?.(); draw(); return; }
    const a = sel; sel = null;
    doSwap(a, cell);
  }

  function tick(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (playing && !over) {
      left -= dt;
      if (left <= 10) { acc += dt; if (acc > 0.45) { acc = 0; sfx?.urgent?.(); } }
      if (left <= 0) { left = 0; finish(); }
      syncHud();
    }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 280 * dt; p.life -= dt * 1.8; }
    particles = particles.filter((p) => p.life > 0);
    if (shake) shake = Math.max(0, shake - dt * 40);
    draw();
    raf = requestAnimationFrame(tick);
  }

  function start(ev) {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    if (playing || over) return;
    el.intro.hidden = true;
    playing = true; over = false; left = PLAY_SEC; score = 0; comboShow = 0;
    board = createBoard(rng);
    try { sfx?.startWhistle?.(); } catch { /* 오디오 실패해도 게임은 진행 */ }
    try { sfx?.startBgm?.(); } catch { /* */ }
    syncHud(); draw();
  }

  function finish() {
    if (over) return;
    over = true; playing = false;
    sfx?.timeUp?.();
    sfx?.stopBgm?.();
    sfx?.fanfare?.(score > 5000);
    const name = (() => { try { return getName() || '나'; } catch { return '나'; } })();
    el.result.hidden = false;
    el.result.innerHTML = `<div class="box"><h2>시간 끝!</h2><p class="big">${score.toLocaleString()}점</p>
      <p>${practice || !ranked ? '연습 기록' : '랭킹 도전 기록'} · 최고 콤보 ${comboShow}</p>
      <div class="row"><button type="button" data-again>한 판 더</button><button type="button" data-board>순위판</button><button type="button" data-leave>오락실로</button></div></div>`;
    el.result.querySelector('[data-again]')?.addEventListener('click', () => {
      el.result.hidden = true; start();
    });
    el.result.querySelector('[data-leave]')?.addEventListener('click', () => dispose(true));
    el.result.querySelector('[data-board]')?.addEventListener('click', () => onResult?.({ score, ranked: ranked && !practice, name, openBoard: true }));
    onResult?.({ score, ranked: ranked && !practice, name, openBoard: false });
  }

  function dispose(exit = false) {
    cancelAnimationFrame(raf);
    sfx?.stopBgm?.();
    wrap.remove();
    if (exit) onExit?.();
  }

  cv.addEventListener('pointerdown', onPointer);
  const goBtn = wrap.querySelector('[data-go]');
  goBtn?.addEventListener('click', start);
  goBtn?.addEventListener('pointerup', start);
  wrap.querySelector('[data-exit]')?.addEventListener('click', () => dispose(true));
  el.mute.addEventListener('click', () => {
    const next = !sfx?.muted;
    sfx?.setMuted?.(next);
    el.mute.textContent = next ? '🔇' : '🔊';
    if (next) sfx?.stopBgm?.(); else if (playing && !over) sfx?.startBgm?.();
  });

  syncHud(); draw();
  raf = requestAnimationFrame(tick);

  return { dispose: () => dispose(false), get score() { return score; } };
}
