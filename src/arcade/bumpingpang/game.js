// [범핑팡] 귀여운 캔버스 보드 — 통통한 캐릭터 + 트윈 스왑/낙하 + 콤보 연출
import { TILES } from './tiles.js';
import { getTileSprite, prewarmSprites } from './sprites.js';
import {
  COLS, ROWS, PLAY_SEC, createBoard, makeRng, hashSeed, trySwap, hasMoves, shuffleBoard, areAdjacent, swap,
} from './engine.js';

const COLORS = Object.fromEntries(TILES.map((t) => [t.id, t.color]));

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
    <div class="arc-pang-float" data-floats></div>
    <div class="arc-pang-intro" data-intro>
      <div class="box">
        <div class="mascot" aria-hidden="true">💜</div>
        <h2>범핑팡</h2>
        <p>같은 친구 3명 이상 모아 팡!<br/><b>60초</b> 동안 귀엽게 겨뤄요.</p>
        <p class="tag">${practice || !ranked ? '연습 모드 · 순위 기록 안 함' : '랭킹 도전 ★'}</p>
        <button type="button" data-go>시작!</button>
      </div>
    </div>
    <div class="arc-pang-count" data-count hidden></div>
    <div class="arc-pang-result" data-result hidden></div>
  `;
  root.appendChild(wrap);
  try { prewarmSprites(); } catch { /* SSR / headless ok */ }

  const cv = wrap.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const el = {
    score: wrap.querySelector('[data-score]'),
    time: wrap.querySelector('[data-time]'),
    combo: wrap.querySelector('[data-combo]'),
    ring: wrap.querySelector('[data-ring]'),
    fx: wrap.querySelector('[data-fx]'),
    toast: wrap.querySelector('[data-toast]'),
    floats: wrap.querySelector('[data-floats]'),
    intro: wrap.querySelector('[data-intro]'),
    result: wrap.querySelector('[data-result]'),
    count: wrap.querySelector('[data-count]'),
    mute: wrap.querySelector('[data-mute]'),
  };

  const seed = hashSeed(`${storeId}|${new Date().toISOString().slice(0, 10)}|pang`);
  const rng = makeRng(seed);
  let board = createBoard(rng);
  let score = 0, comboShow = 0, left = PLAY_SEC, playing = false, over = false, busy = false;
  let sel = null, particles = [], shake = 0, punch = 0;
  let raf = 0, last = 0, acc = 0, blinkT = 0, blinkOn = false;
  let anim = null; // { type, t, dur, ... }
  let cellAnim = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ y: 0, s: 1, pop: 0 })));

  function cellSize() {
    const pad = 10;
    return { pad, s: (cv.width - pad * 2) / COLS };
  }

  function draw() {
    const { pad, s } = cellSize();
    const tNow = performance.now() / 1000;
    ctx.clearRect(0, 0, cv.width, cv.height);

    // soft pastel board bg
    const bg = ctx.createLinearGradient(0, 0, 0, cv.height);
    bg.addColorStop(0, '#1a2748'); bg.addColorStop(1, '#0c1220');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);

    // cute polka dots
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % cv.width, y = (i * 53) % cv.height;
      ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
    }

    ctx.save();
    if (shake || punch) {
      const mag = shake + punch * 4;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = pad + c * s, y = pad + r * s;
      // slot
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, x + 3, y + 3, s - 6, s - 6, 16); ctx.fill();

      const cell = board[r][c];
      if (!cell) continue;
      const ca = cellAnim[r][c];
      const bob = playing && !busy ? Math.sin(tNow * 2.2 + r * 0.7 + c * 0.5) * 1.5 : 0;
      let scale = ca.s * (1 + (ca.pop || 0));
      let ox = 0, oy = ca.y + bob;
      let rot = 0;

      if (anim?.type === 'swap' || anim?.type === 'wobble') {
        const a = anim.a, b = anim.b;
        const u = easeInOut(Math.min(1, anim.t / anim.dur));
        if (a.r === r && a.c === c) {
          ox += (b.c - a.c) * s * (anim.type === 'wobble' ? wobble(u) : u);
          oy += (b.r - a.r) * s * (anim.type === 'wobble' ? wobble(u) : u);
          rot = anim.type === 'wobble' ? Math.sin(u * Math.PI * 4) * 0.12 : 0;
        } else if (b.r === r && b.c === c) {
          ox += (a.c - b.c) * s * (anim.type === 'wobble' ? wobble(u) : u);
          oy += (a.r - b.r) * s * (anim.type === 'wobble' ? wobble(u) : u);
          rot = anim.type === 'wobble' ? Math.sin(u * Math.PI * 4) * -0.12 : 0;
        }
      }

      if (sel && sel.r === r && sel.c === c) {
        scale *= 1.08 + Math.sin(tNow * 10) * 0.04;
        oy -= 4;
      }

      const cx = x + s / 2 + ox, cy = y + s / 2 + oy;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(scale, scale);
      const spr = getTileSprite(cell.id, cell.special, blinkOn && !sel);
      const sz = s - 8;
      ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();

      if (sel && sel.r === r && sel.c === c) {
        ctx.strokeStyle = '#ffe66d';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#ffe66d'; ctx.shadowBlur = 12;
        roundRect(ctx, x + 4 + ox, y + 4 + oy, s - 8, s - 8, 18); ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.kind === 'heart') {
        ctx.fillStyle = p.color;
        ctx.font = `${Math.floor(p.r * 2)}px sans-serif`;
        ctx.fillText('♥', p.x, p.y);
      } else if (p.kind === 'star') {
        ctx.fillStyle = p.color;
        ctx.font = `${Math.floor(p.r * 2.2)}px sans-serif`;
        ctx.fillText('✦', p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function wobble(t) { // go forward then back
    if (t < 0.45) return easeInOut(t / 0.45);
    return easeInOut(1 - (t - 0.45) / 0.55);
  }

  function burst(r, c, color, n = 12) {
    const { pad, s } = cellSize();
    const x = pad + c * s + s / 2, y = pad + r * s + s / 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 70 + Math.random() * 160;
      const kind = i % 3 === 0 ? 'heart' : i % 3 === 1 ? 'star' : 'dot';
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        r: kind === 'dot' ? 2 + Math.random() * 4 : 6 + Math.random() * 5,
        color: kind === 'heart' ? '#ff6b9d' : kind === 'star' ? '#ffe66d' : color,
        life: 1, kind,
      });
    }
  }

  function floatScore(r, c, text) {
    const { pad, s } = cellSize();
    const box = cv.getBoundingClientRect();
    const x = box.left + ((pad + c * s + s / 2) / cv.width) * box.width;
    const y = box.top + ((pad + r * s + s / 2) / cv.height) * box.height;
    const node = document.createElement('div');
    node.className = 'arc-pang-floater';
    node.textContent = text;
    node.style.left = `${x}px`; node.style.top = `${y}px`;
    el.floats.appendChild(node);
    setTimeout(() => node.remove(), 900);
  }

  function toast(msg, cls = '') {
    el.toast.hidden = false;
    el.toast.className = `arc-pang-toast ${cls}`.trim();
    el.toast.textContent = msg;
    clearTimeout(el.toast._t);
    el.toast._t = setTimeout(() => { el.toast.hidden = true; el.toast.className = 'arc-pang-toast'; }, 1000);
  }

  function syncHud() {
    el.score.textContent = String(score);
    el.time.textContent = String(Math.max(0, Math.ceil(left)));
    el.combo.textContent = String(comboShow);
    const pct = Math.max(0, left / PLAY_SEC) * 100;
    el.ring.style.strokeDasharray = `${pct} 100`;
    el.ring.classList.toggle('urgent', left <= 10);
    wrap.classList.toggle('is-urgent', playing && left <= 10);
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

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function runAnim(spec) {
    anim = { ...spec, t: 0 };
    const start = performance.now();
    while (anim && anim.t < anim.dur) {
      anim.t = performance.now() - start;
      await wait(16);
    }
    anim = null;
  }

  // Proper swap with pre-check on a clone so we can animate before mutating live board
  async function doSwapSafe(a, b) {
    if (busy || !playing || over) return;
    busy = true;
    try {
      try { sfx?.swap?.(); } catch { /* */ }

      // Clone board for prediction
      const clone = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
      const peek = trySwap(clone, a, b, makeRng(hashSeed(`${a.r},${a.c}-${b.r},${b.c}-${score}`)));

      if (!peek.ok) {
        // visual wobble on live board without committing
        await runAnim({ type: 'wobble', a, b, dur: 180 });
        try { sfx?.deny?.(); } catch { /* */ }
        shake = 6; sel = null; draw();
        return;
      }

      // valid: tween swap on live tiles, then apply real engine with same rng path
      await runAnim({ type: 'swap', a, b, dur: 120 });
      // Apply real swap+cascade with a fresh deterministic rng from current board state seed
      const res = trySwap(board, a, b, rng);
      if (!res.ok) {
        // extremely rare desync — just clear lock
        sel = null; return;
      }
      score += res.score;
      comboShow = res.maxCombo;

      for (const step of res.steps) {
        if (step.type === 'clear') {
          try { sfx?.match?.(step.combo); } catch { /* */ }
          if (step.specs?.length) try { sfx?.special?.(); } catch { /* */ }
          if (step.combo >= 2) {
            try { sfx?.cascade?.(step.combo); } catch { /* */ }
            toast(`콤보 x${step.combo}!`, 'combo');
          }
          for (const p of step.cells) {
            burst(p.r, p.c, COLORS[p.id] || '#ffe66d', 10);
            // squish
            if (cellAnim[p.r]?.[p.c]) {
              cellAnim[p.r][p.c].s = 0.2;
              cellAnim[p.r][p.c].pop = 0.4;
            }
          }
          const mid = step.cells[Math.floor(step.cells.length / 2)] || a;
          floatScore(mid.r, mid.c, `+${step.gained}`);
          if (step.combo >= 3) punch = 1;
          shake = 3 + step.combo;
          syncHud(); draw();
          await wait(120);
          // clear anim scales
          for (const p of step.cells) {
            if (cellAnim[p.r]?.[p.c]) { cellAnim[p.r][p.c].s = 1; cellAnim[p.r][p.c].pop = 0; }
          }
        } else if (step.type === 'fall') {
          // bounce-in for moved/spawned
          for (const m of step.moves || []) {
            const to = m.to;
            if (cellAnim[to.r]?.[to.c]) {
              cellAnim[to.r][to.c].y = m.spawn ? -40 : -Math.max(8, (m.from.r - to.r) * 8);
              cellAnim[to.r][to.c].s = 0.92;
            }
          }
          draw();
          await wait(40);
          // settle bounce
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const ca = cellAnim[r][c];
            if (ca.y) { ca.y = 0; ca.s = 1.06; }
          }
          await wait(70);
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cellAnim[r][c].s = 1;
        }
      }

      if (!hasMoves(board)) {
        toast('섞는 중…');
        shuffleBoard(board, rng);
        await wait(220);
      }
      sel = null; syncHud(); draw();
    } catch (err) {
      console.warn('[pang] swap', err);
      sel = null;
    } finally {
      busy = false;
    }
  }

  function onPointer(e) {
    if (!playing || over || busy) return;
    e.preventDefault();
    const cell = cellFromEvent(e);
    if (!cell || !board[cell.r][cell.c]) return;
    if (!sel) { sel = cell; try { sfx?.select?.(); } catch { /* */ } draw(); return; }
    if (sel.r === cell.r && sel.c === cell.c) { sel = null; draw(); return; }
    if (!areAdjacent(sel, cell)) { sel = cell; try { sfx?.select?.(); } catch { /* */ } draw(); return; }
    const a = sel; sel = null;
    doSwapSafe(a, cell);
  }

  // Drag-swap: pointerdown select, pointerup on adjacent = swap
  let dragFrom = null;
  function onDown(e) {
    if (!playing || over || busy) return;
    const cell = cellFromEvent(e);
    dragFrom = cell;
    onPointer(e);
  }
  function onUp(e) {
    if (!playing || over || busy || !dragFrom) { dragFrom = null; return; }
    const cell = cellFromEvent(e);
    if (cell && sel && areAdjacent(dragFrom, cell) && (cell.r !== dragFrom.r || cell.c !== dragFrom.c)) {
      // if still selected from onDown and released on neighbor, swap
      if (sel.r === dragFrom.r && sel.c === dragFrom.c) {
        const a = sel; sel = null;
        doSwapSafe(a, cell);
      }
    }
    dragFrom = null;
  }

  function tick(ts) {
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    blinkT += dt;
    if (blinkT > 2.4) { blinkOn = true; if (blinkT > 2.55) { blinkOn = false; blinkT = 0; } }

    if (playing && !over) {
      left -= dt;
      if (left <= 10) {
        acc += dt;
        if (acc > 0.4) { acc = 0; try { sfx?.urgent?.(); } catch { /* */ } }
        try { sfx?.setUrgentBgm?.(true); } catch { /* */ }
      }
      if (left <= 0) { left = 0; finish(); }
      syncHud();
    }
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt * 1.6;
    }
    particles = particles.filter((p) => p.life > 0);
    if (shake) shake = Math.max(0, shake - dt * 40);
    if (punch) punch = Math.max(0, punch - dt * 3);
    // settle pop
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ca = cellAnim[r][c];
      if (ca.pop) ca.pop = Math.max(0, ca.pop - dt * 3);
      if (ca.y) ca.y += (0 - ca.y) * Math.min(1, dt * 12);
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  async function countdownThenPlay() {
    el.intro.hidden = true;
    el.count.hidden = false;
    for (const n of [3, 2, 1, '팡!']) {
      el.count.textContent = String(n);
      el.count.classList.remove('pop');
      void el.count.offsetWidth;
      el.count.classList.add('pop');
      try { if (n === '팡!') sfx?.startWhistle?.(); else sfx?.countdown?.(typeof n === 'number' ? n : 1); } catch { /* */ }
      await wait(n === '팡!' ? 450 : 650);
    }
    el.count.hidden = true;
    playing = true; over = false; left = PLAY_SEC; score = 0; comboShow = 0;
    board = createBoard(rng);
    cellAnim = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ y: 0, s: 1, pop: 0 })));
    try { sfx?.startBgm?.(); } catch { /* */ }
    syncHud(); draw();
  }

  function start(ev) {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    if (playing) return;
    if (over) { el.result.hidden = true; over = false; }
    if (!el.count.hidden) return; // mid countdown
    countdownThenPlay();
  }

  function finish() {
    if (over) return;
    over = true; playing = false;
    try { sfx?.setUrgentBgm?.(false); } catch { /* */ }
    try { sfx?.timeUp?.(); } catch { /* */ }
    try { sfx?.stopBgm?.(); } catch { /* */ }
    try { sfx?.fanfare?.(score > 5000); } catch { /* */ }
    const name = (() => { try { return getName() || '나'; } catch { return '나'; } })();
    const stars = score >= 8000 ? '★★★' : score >= 4000 ? '★★☆' : score >= 1500 ? '★☆☆' : '☁';
    el.result.hidden = false;
    el.result.innerHTML = `<div class="box cute">
      <div class="mascot big">🎉</div>
      <h2>시간 끝!</h2>
      <p class="big">${score.toLocaleString()}점</p>
      <p class="stars">${stars}</p>
      <p>${practice || !ranked ? '연습 기록' : '랭킹 도전 기록'} · 최고 콤보 ${comboShow}</p>
      <div class="row">
        <button type="button" data-again>한 판 더</button>
        <button type="button" data-board>순위판</button>
        <button type="button" data-leave>오락실로</button>
      </div>
    </div>`;
    el.result.querySelector('[data-again]')?.addEventListener('click', () => {
      el.result.hidden = true; over = false; playing = false; start();
    });
    el.result.querySelector('[data-leave]')?.addEventListener('click', () => dispose(true));
    el.result.querySelector('[data-board]')?.addEventListener('click', () => onResult?.({ score, ranked: ranked && !practice, name, openBoard: true }));
    onResult?.({ score, ranked: ranked && !practice, name, openBoard: false });
  }

  function dispose(exit = false) {
    cancelAnimationFrame(raf);
    try { sfx?.setUrgentBgm?.(false); } catch { /* */ }
    try { sfx?.stopBgm?.(); } catch { /* */ }
    wrap.remove();
    if (exit) onExit?.();
  }

  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointerup', onUp);
  const goBtn = wrap.querySelector('[data-go]');
  goBtn?.addEventListener('click', start);
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
