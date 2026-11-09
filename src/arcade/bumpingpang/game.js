// [범핑팡] 모바일 퍼즐급 연출 — 큰 타일 · 스쿼시버스트 · 히트스톱 · 게임 결과창
import { TILES } from './tiles.js';
import { getTileSprite, prewarmSprites } from './sprites.js';
import {
  COLS, ROWS, PLAY_SEC, createBoard, makeRng, hashSeed, trySwap, hasMoves, shuffleBoard, areAdjacent,
} from './engine.js';

const COLORS = Object.fromEntries(TILES.map((t) => [t.id, t.color]));
// 별점: 60초 시뮬(클리어당 ~30–80점, 히트율·콤보 반영) → 캐주얼~500 / 중급~1200 / 숙련~2000+
export const STAR_THRESHOLDS = [500, 1200, 2000];
export function starsFor(score) {
  const s = Number(score) || 0;
  if (s >= STAR_THRESHOLDS[2]) return 3;
  if (s >= STAR_THRESHOLDS[1]) return 2;
  if (s >= STAR_THRESHOLDS[0]) return 1;
  return 0;
}

export function mountBumpingPang({
  root, sfx, ranked = true, storeId = 'arcade-seohyeon', getName = () => '나',
  onExit, onResult, practice = false,
} = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'arc-pang';
  wrap.innerHTML = `
    <div class="arc-pang-hud">
      <div class="arc-pang-score jelly" data-score-wrap>
        <span class="lbl">점수</span><b data-score>0</b>
      </div>
      <div class="arc-pang-time jelly" data-time-wrap>
        <span class="lbl">시간</span>
        <div class="tube"><i data-bar></i></div>
        <b data-time>${PLAY_SEC}</b>
      </div>
      <div class="arc-pang-combo jelly" data-combo-wrap>
        <span class="lbl">콤보</span><b data-combo>0</b>
      </div>
      <button type="button" class="arc-pang-mute jelly-btn" data-mute title="음소거" aria-label="음소거">🔊</button>
      <button type="button" class="arc-pang-x jelly-btn" data-exit title="나가기" aria-label="나가기">✕</button>
    </div>
    <canvas class="arc-pang-cv jelly-board" width="640" height="640"></canvas>
    <div class="arc-pang-fx" data-fx></div>
    <div class="arc-pang-toast" data-toast hidden></div>
    <div class="arc-pang-float" data-floats></div>
    <div class="arc-pang-intro" data-intro>
      <div class="box">
        <div class="mascot logo-bounce" aria-hidden="true">💜</div>
        <h2 class="logo-bounce">범핑팡</h2>
        <p>같은 친구 3명 이상 모아 팡!<br/><b>60초</b> 동안 귀엽게 겨뤄요.</p>
        <p class="tag">${practice || !ranked ? '연습 모드 · 순위 기록 안 함' : '랭킹 도전 ★'}</p>
        <button type="button" data-go>시작!</button>
      </div>
    </div>
    <div class="arc-pang-count" data-count hidden></div>
    <div class="arc-pang-result" data-result hidden></div>
  `;
  root.appendChild(wrap);
  try { prewarmSprites(); } catch { /* */ }

  const cv = wrap.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const el = {
    score: wrap.querySelector('[data-score]'),
    scoreWrap: wrap.querySelector('[data-score-wrap]'),
    time: wrap.querySelector('[data-time]'),
    timeWrap: wrap.querySelector('[data-time-wrap]'),
    bar: wrap.querySelector('[data-bar]'),
    combo: wrap.querySelector('[data-combo]'),
    comboWrap: wrap.querySelector('[data-combo-wrap]'),
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
  let sel = null, particles = [], shake = 0, punch = 0, hitStop = 0, flashCells = [];
  let raf = 0, last = 0, acc = 0, blinkT = 0, blinkOn = false;
  let anim = null;
  let cellAnim = freshCellAnim();

  function freshCellAnim() {
    return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ y: 0, sx: 1, sy: 1, pop: 0, flash: 0 })));
  }
  function cellSize() {
    const pad = 4; // larger tiles fill the board
    return { pad, s: (cv.width - pad * 2) / COLS };
  }
  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; }
  function wobble(t) { return t < 0.45 ? easeInOut(t / 0.45) : easeInOut(1 - (t - 0.45) / 0.55); }

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

  function draw() {
    const { pad, s } = cellSize();
    const tNow = performance.now() / 1000;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const bg = ctx.createLinearGradient(0, 0, 0, cv.height);
    bg.addColorStop(0, '#1e2a52'); bg.addColorStop(1, '#0c1220');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);

    ctx.save();
    if (shake || punch) {
      const mag = shake + punch * 5;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = pad + c * s, y = pad + r * s;
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      roundRect(ctx, x + 2, y + 2, s - 4, s - 4, 14); ctx.fill();

      const cell = board[r][c];
      if (!cell) continue;
      const ca = cellAnim[r][c];
      const bob = playing && !busy ? Math.sin(tNow * 2.4 + r * 0.7 + c * 0.5) * 1.8 : 0;
      let sx = ca.sx, sy = ca.sy;
      let ox = 0, oy = ca.y + bob, rot = 0;

      if (anim?.type === 'swap' || anim?.type === 'wobble') {
        const u = easeInOut(Math.min(1, anim.t / anim.dur));
        const wu = anim.type === 'wobble' ? wobble(Math.min(1, anim.t / anim.dur)) : u;
        if (anim.a.r === r && anim.a.c === c) {
          ox += (anim.b.c - anim.a.c) * s * wu;
          oy += (anim.b.r - anim.a.r) * s * wu;
          if (anim.type === 'wobble') rot = Math.sin(u * Math.PI * 4) * 0.14;
        } else if (anim.b.r === r && anim.b.c === c) {
          ox += (anim.a.c - anim.b.c) * s * wu;
          oy += (anim.a.r - anim.b.r) * s * wu;
          if (anim.type === 'wobble') rot = Math.sin(u * Math.PI * 4) * -0.14;
        }
      }
      if (sel && sel.r === r && sel.c === c) {
        sx *= 1.1; sy *= 1.1; oy -= 5;
      }

      const cx = x + s / 2 + ox, cy = y + s / 2 + oy;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(sx, sy);
      const spr = getTileSprite(cell.id, cell.special, blinkOn && !(sel && sel.r === r && sel.c === c));
      const sz = s - 4;
      ctx.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
      if (ca.flash > 0) {
        ctx.globalAlpha = Math.min(1, ca.flash);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, 0, sz * 0.42, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      if (sel && sel.r === r && sel.c === c) {
        ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 4;
        ctx.shadowColor = '#ffe66d'; ctx.shadowBlur = 14;
        roundRect(ctx, x + 3 + ox, y + 3 + oy, s - 6, s - 6, 16); ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
      } else if (p.kind === 'shard') {
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
        ctx.restore();
      } else if (p.kind === 'heart' || p.kind === 'star') {
        ctx.fillStyle = p.color;
        ctx.font = `${Math.floor(p.r * 2.2)}px sans-serif`;
        ctx.fillText(p.kind === 'heart' ? '♥' : '✦', p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function burst(r, c, color, n = 16) {
    const { pad, s } = cellSize();
    const x = pad + c * s + s / 2, y = pad + r * s + s / 2;
    particles.push({ x, y, vx: 0, vy: 0, r: 8, color: '#fff', life: 0.55, kind: 'ring', grow: 90 });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 90 + Math.random() * 200;
      const kind = i % 4 === 0 ? 'heart' : i % 4 === 1 ? 'star' : i % 4 === 2 ? 'shard' : 'dot';
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50,
        r: kind === 'dot' ? 3 + Math.random() * 4 : 7 + Math.random() * 6,
        color: kind === 'heart' ? '#ff6b9d' : kind === 'star' ? '#ffe66d' : color,
        life: 1, kind, rot: Math.random() * Math.PI,
      });
    }
  }

  function floatScore(r, c, text) {
    const { pad, s } = cellSize();
    const box = cv.getBoundingClientRect();
    const x = box.left + ((pad + c * s + s / 2) / cv.width) * box.width;
    const y = box.top + ((pad + r * s + s / 2) / cv.height) * box.height;
    const target = el.scoreWrap.getBoundingClientRect();
    const node = document.createElement('div');
    node.className = 'arc-pang-floater';
    node.textContent = text;
    node.style.left = `${x}px`; node.style.top = `${y}px`;
    el.floats.appendChild(node);
    // fly toward score counter
    requestAnimationFrame(() => {
      node.style.transition = 'transform .55s cubic-bezier(.2,.8,.2,1), opacity .55s';
      const dx = target.left + target.width / 2 - x;
      const dy = target.top + target.height / 2 - y;
      node.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.6)`;
      node.style.opacity = '0';
    });
    setTimeout(() => {
      node.remove();
      el.scoreWrap.classList.remove('bump');
      void el.scoreWrap.offsetWidth;
      el.scoreWrap.classList.add('bump');
      try { sfx?.scoreTick?.(); } catch { /* */ }
    }, 560);
  }

  function toast(msg, cls = '') {
    el.toast.hidden = false;
    el.toast.className = `arc-pang-toast ${cls}`.trim();
    el.toast.textContent = msg;
    clearTimeout(el.toast._t);
    el.toast._t = setTimeout(() => { el.toast.hidden = true; el.toast.className = 'arc-pang-toast'; }, 1100);
  }

  function syncHud() {
    const prevScore = el.score.textContent;
    const nextScore = String(score);
    el.score.textContent = nextScore;
    if (prevScore !== nextScore) {
      el.scoreWrap.classList.remove('bump');
      void el.scoreWrap.offsetWidth;
      el.scoreWrap.classList.add('bump');
    }
    el.time.textContent = String(Math.max(0, Math.ceil(left)));
    const prevCombo = el.combo.textContent;
    const nextCombo = String(comboShow);
    el.combo.textContent = nextCombo;
    const pct = Math.max(0, left / PLAY_SEC) * 100;
    if (el.bar) el.bar.style.width = `${pct}%`;
    el.timeWrap?.classList.toggle('urgent', left <= 10);
    wrap.classList.toggle('is-urgent', playing && left <= 10);
    el.comboWrap.classList.toggle('glow', comboShow >= 2);
    if (prevCombo !== nextCombo && comboShow >= 2) {
      el.comboWrap.classList.remove('pop');
      void el.comboWrap.offsetWidth;
      el.comboWrap.classList.add('pop');
    }
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

  async function runAnim(spec) {
    anim = { ...spec, t: 0 };
    const start = performance.now();
    while (anim && anim.t < anim.dur) {
      if (hitStop > 0) { await wait(16); continue; }
      anim.t = performance.now() - start;
      await wait(16);
    }
    anim = null;
  }

  async function doSwapSafe(a, b) {
    if (busy || !playing || over) return;
    busy = true;
    try {
      try { sfx?.swap?.(); } catch { /* */ }
      const clone = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
      const peek = trySwap(clone, a, b, makeRng(1));
      if (!peek.ok) {
        await runAnim({ type: 'wobble', a, b, dur: 180 });
        try { sfx?.deny?.(); } catch { /* */ }
        shake = 5; sel = null; draw();
        return;
      }
      await runAnim({ type: 'swap', a, b, dur: 110 });
      const res = trySwap(board, a, b, rng);
      if (!res.ok) { sel = null; return; }
      score += res.score;
      comboShow = Math.max(comboShow, res.maxCombo);

      for (const step of res.steps) {
        if (step.type === 'clear') {
          try { sfx?.match?.(step.combo); } catch { /* */ }
          if (step.specs?.length) {
            try { sfx?.special?.(); } catch { /* */ }
            const sp = step.specs[0]?.special;
            if (sp === 'lineH' || sp === 'lineV') try { sfx?.lineBlast?.(); } catch { /* */ }
            else if (sp === 'bomb') try { sfx?.bomb?.(); } catch { /* */ }
            else if (sp === 'color') try { sfx?.colorClear?.(); } catch { /* */ }
          }
          if (step.combo >= 2) {
            try { sfx?.cascade?.(step.combo); } catch { /* */ }
            toast(`콤보 x${step.combo}!`, 'combo');
          }
          // white flash + squash
          for (const p of step.cells) {
            const ca = cellAnim[p.r]?.[p.c];
            if (ca) { ca.flash = 1; ca.sx = 1.25; ca.sy = 0.55; }
          }
          draw();
          await wait(45);
          for (const p of step.cells) {
            const col = COLORS[board[p.r]?.[p.c]?.id] || '#ffe66d';
            burst(p.r, p.c, col, 14);
            const ca = cellAnim[p.r]?.[p.c];
            if (ca) { ca.sx = 0.15; ca.sy = 0.15; ca.flash = 0; }
          }
          const mid = step.cells[Math.floor(step.cells.length / 2)] || a;
          floatScore(mid.r, mid.c, `+${step.gained}`);
          if (step.combo >= 3) { punch = 1.2; hitStop = 0.055; }
          else if (step.combo >= 2) hitStop = 0.04;
          shake = 4 + step.combo * 1.5;
          syncHud(); draw();
          await wait(100);
          for (const p of step.cells) {
            if (cellAnim[p.r]?.[p.c]) { cellAnim[p.r][p.c].sx = 1; cellAnim[p.r][p.c].sy = 1; }
          }
        } else if (step.type === 'fall') {
          try { sfx?.drop?.(); } catch { /* */ }
          for (const m of step.moves || []) {
            const to = m.to;
            if (cellAnim[to.r]?.[to.c]) {
              cellAnim[to.r][to.c].y = m.spawn ? -48 : -Math.max(10, (m.from.r - to.r) * 10);
              cellAnim[to.r][to.c].sy = 0.9;
            }
          }
          draw(); await wait(35);
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const ca = cellAnim[r][c];
            if (ca.y) { ca.y = 6; ca.sy = 0.85; ca.sx = 1.12; } // overshoot
          }
          try { sfx?.land?.(); } catch { /* */ }
          await wait(55);
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            cellAnim[r][c].y = 0; cellAnim[r][c].sx = 1; cellAnim[r][c].sy = 1;
          }
        }
      }
      if (!hasMoves(board)) {
        toast('섞는 중…');
        shuffleBoard(board, rng);
        await wait(200);
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

  let dragFrom = null;
  function onDown(e) {
    if (!playing || over || busy) return;
    dragFrom = cellFromEvent(e);
    onPointer(e);
  }
  function onUp(e) {
    if (!playing || over || busy || !dragFrom) { dragFrom = null; return; }
    const cell = cellFromEvent(e);
    if (cell && sel && areAdjacent(dragFrom, cell) && (cell.r !== dragFrom.r || cell.c !== dragFrom.c)) {
      if (sel.r === dragFrom.r && sel.c === dragFrom.c) {
        const a = sel; sel = null;
        doSwapSafe(a, cell);
      }
    }
    dragFrom = null;
  }

  function tick(ts) {
    if (!last) last = ts;
    let dt = Math.min(0.05, (ts - last) / 1000); last = ts;
    if (hitStop > 0) { hitStop -= dt; dt *= 0.15; }

    blinkT += dt;
    if (blinkT > 2.4) { blinkOn = true; if (blinkT > 2.55) { blinkOn = false; blinkT = 0; } }

    if (playing && !over) {
      left -= dt;
      if (left <= 10) {
        acc += dt;
        if (acc > 0.38) { acc = 0; try { sfx?.urgent?.(); } catch { /* */ } }
        try { sfx?.setUrgentBgm?.(true); } catch { /* */ }
      }
      if (left <= 0) { left = 0; finish(); }
      syncHud();
    }
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 280 * dt; p.life -= dt * 1.7;
      if (p.kind === 'ring' && p.grow) p.r += p.grow * dt;
      if (p.kind === 'shard') p.rot = (p.rot || 0) + dt * 8;
    }
    particles = particles.filter((p) => p.life > 0);
    if (shake) shake = Math.max(0, shake - dt * 42);
    if (punch) punch = Math.max(0, punch - dt * 3.2);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ca = cellAnim[r][c];
      if (ca.flash) ca.flash = Math.max(0, ca.flash - dt * 4);
      if (ca.y) ca.y += (0 - ca.y) * Math.min(1, dt * 14);
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  async function countdownThenPlay() {
    el.intro.hidden = true;
    el.count.hidden = false;
    for (const n of [3, 2, 1, 'GO!']) {
      el.count.textContent = String(n);
      el.count.classList.remove('pop');
      void el.count.offsetWidth;
      el.count.classList.add('pop');
      try {
        if (n === 'GO!') sfx?.startWhistle?.();
        else sfx?.countdown?.(n);
      } catch { /* */ }
      await wait(n === 'GO!' ? 480 : 620);
    }
    el.count.hidden = true;
    playing = true; over = false; left = PLAY_SEC; score = 0; comboShow = 0;
    board = createBoard(rng);
    cellAnim = freshCellAnim();
    try { sfx?.startBgm?.(); } catch { /* */ }
    syncHud(); draw();
  }

  function start(ev) {
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    if (playing) return;
    if (over) { el.result.hidden = true; over = false; }
    if (!el.count.hidden) return;
    countdownThenPlay();
  }

  async function finish() {
    if (over) return;
    over = true; playing = false;
    try { sfx?.setUrgentBgm?.(false); } catch { /* */ }
    try { sfx?.timeUp?.(); } catch { /* */ }
    try { sfx?.stopBgm?.(); } catch { /* */ }
    const name = (() => { try { return getName() || '나'; } catch { return '나'; } })();
    const finalScore = score;
    const stars = starsFor(finalScore);
    el.result.hidden = false;
    el.result.innerHTML = `<div class="box cute">
      <div class="rays" aria-hidden="true"></div>
      <div class="confetti" data-confetti></div>
      <div class="banner">시간 끝!</div>
      <div class="mascot big">🎉💜</div>
      <p class="big" data-roll>0점</p>
      <div class="star-row" data-stars><span class="dim">★</span><span class="dim">★</span><span class="dim">★</span></div>
      <div class="rank-badge" data-badge>${practice || !ranked ? '연습 기록' : '랭킹 도전'}</div>
      <p>최고 콤보 ${comboShow}</p>
      <div class="row">
        <button type="button" data-again>한 판 더</button>
        <button type="button" data-board>순위판</button>
        <button type="button" data-leave>오락실로</button>
      </div>
    </div>`;
    // confetti
    const conf = el.result.querySelector('[data-confetti]');
    const colors = ['#ff6b9d', '#ffe66d', '#7eb6ff', '#3ddc97', '#c084fc', '#ff9f1c'];
    for (let i = 0; i < 36; i++) {
      const bit = document.createElement('i');
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = `${Math.random() * 0.8}s`;
      bit.style.transform = `rotate(${Math.random() * 360}deg)`;
      conf.appendChild(bit);
    }
    try { sfx?.fanfare?.(finalScore > 5000); } catch { /* */ }

    // score count-up
    const roll = el.result.querySelector('[data-roll]');
    const t0 = performance.now();
    const dur = 900;
    const tickRoll = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - u) ** 3;
      const v = Math.round(finalScore * eased);
      roll.textContent = `${v.toLocaleString()}점`;
      if (u < 1) {
        if (Math.random() < 0.4) try { sfx?.scoreTick?.(); } catch { /* */ }
        requestAnimationFrame(tickRoll);
      }
    };
    requestAnimationFrame(tickRoll);

    // stars one by one
    const starEls = [...el.result.querySelectorAll('[data-stars] span')];
    for (let i = 0; i < 3; i++) {
      await wait(350 + i * 280);
      if (i < stars) {
        starEls[i]?.classList.remove('dim');
        starEls[i]?.classList.add('on');
        try { sfx?.starDing?.(); } catch { /* */ }
      }
    }

    el.result.querySelector('[data-again]')?.addEventListener('click', () => {
      el.result.hidden = true; over = false; playing = false; start();
    });
    el.result.querySelector('[data-leave]')?.addEventListener('click', () => dispose(true));
    el.result.querySelector('[data-board]')?.addEventListener('click', () => onResult?.({ score: finalScore, ranked: ranked && !practice, name, openBoard: true }));
    onResult?.({ score: finalScore, ranked: ranked && !practice, name, openBoard: false });
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
  wrap.querySelector('[data-go]')?.addEventListener('click', start);
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
