// [범편의점] 합치기 퍼즐 — PC 가로 레이아웃 · 모바일 세로는 뷰포트에 맞추고, 가로는 전환 안내
import {
  TUB_INNER_W, TUB_INNER_H, STAGES, SPRITE_PAD,
  createSession, tryDrop, setAimX, canDrop, step, spawnAt, resetSession,
  stageInfo, radiusFor, peekPending, FIXED_DT,
} from './engine.js';
import { mergeUrl, itemImage, itemUrl, bumUrl, prewarmMerge, loadImage } from './sprites.js';

const DROP_PAD = 112;
const AIM_SPEED = 220;

function isCoarse() {
  try {
    return document.body.classList.contains('mobile')
      || matchMedia('(hover: none) and (pointer: coarse)').matches
      || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
  } catch { return false; }
}
function isWideScreen() {
  try { return innerWidth >= 880 && innerWidth > innerHeight * 0.92; }
  catch { return false; }
}
function fmt(n) { return Math.max(0, Number(n) || 0).toLocaleString('ko-KR'); }
function resultLine(bestStage) {
  if (bestStage >= 10) return '편의점 왕!';
  if (bestStage >= 9) return '대단해요!';
  if (bestStage >= 7) return '잘했어요!';
  return '아쉽다! 한판 더?';
}

export function mountBumStore({
  root, sfx, ranked = true, getName = () => '나',
  onExit, onResult, onOpenBoard, practice = false, getBest = () => 0,
} = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'arc-merge' + (isCoarse() ? ' is-touch' : ' is-desk');
  const guideHtml = STAGES.map((s) => (
    `<li><img src="${itemUrl(s.id, 2)}" alt=""><span>${s.name}</span></li>`
  )).join('');
  wrap.innerHTML = `
    <div class="arc-merge-orient" data-orient hidden>
      <div class="orient-card">
        <div class="phone-spin" aria-hidden="true"><div class="phone-body"><span></span></div></div>
        <p class="orient-title">세로로 돌려 주세요</p>
        <p class="orient-sub">범편의점은 세로 화면에서 플레이할 수 있어요</p>
      </div>
    </div>
    <div class="arc-merge-shell">
      <aside class="arc-merge-left">
        <img class="arc-merge-logo" src="${mergeUrl('logo/logo-bumstore.png')}" alt="범편의점" />
        <div class="arc-merge-score" data-score-card>
          <span class="lbl">점수</span>
          <b data-score>0</b>
          <em class="best">최고 <i data-best>0</i></em>
        </div>
        <div class="arc-merge-next" data-next-card>
          <span class="lbl">다음</span>
          <img data-next-img alt="" />
        </div>
        <p class="arc-merge-ctrl" data-ctrl>마우스 좌우 + 클릭</p>
        <div class="arc-merge-iconrow">
          <button type="button" class="arc-merge-icon is-sound" data-mute aria-label="소리"></button>
          <button type="button" class="arc-merge-icon is-pause" data-pause aria-label="일시정지"></button>
        </div>
      </aside>
      <header class="arc-merge-top">
        <div class="arc-merge-score" data-score-card>
          <span class="lbl">점수</span>
          <b data-score>0</b>
        </div>
        <div class="arc-merge-next" data-next-card>
          <span class="lbl">다음</span>
          <img data-next-img alt="" />
        </div>
        <div class="arc-merge-iconrow">
          <button type="button" class="arc-merge-icon is-sound" data-mute aria-label="소리"></button>
          <button type="button" class="arc-merge-icon is-pause" data-pause aria-label="일시정지"></button>
        </div>
      </header>
      <div class="arc-merge-play">
        <div class="arc-merge-tub">
          <img class="arc-merge-frame" src="${mergeUrl('tub/frame.png')}" alt="" />
          <img class="arc-merge-dline" src="${mergeUrl('tub/danger-line.png')}" alt="" />
          <img class="arc-merge-dlabel" src="${mergeUrl('tub/danger-label.png')}" alt="위험선" />
        </div>
        <canvas class="arc-merge-cv" width="636" height="1052"></canvas>
      </div>
      <aside class="arc-merge-right">
        <img class="arc-merge-bum" data-mascot src="${bumUrl('front')}" alt="" />
        <p class="arc-merge-bubble">합치면 커져요!</p>
        <p class="arc-merge-guide-title">합치기 단계</p>
        <ul class="arc-merge-guide">${guideHtml}</ul>
      </aside>
      <img class="arc-merge-floatbum" data-floatbum src="${bumUrl('front')}" alt="" />
      <p class="arc-merge-bubble float" data-floatsay>합치면 커져요!</p>
      <p class="arc-merge-hint" data-hint>좌우로 움직여 떨어뜨리기</p>
    </div>
    <div class="arc-merge-pause" data-pause-ui hidden>
      <div class="arc-merge-modal">
        <p class="ttl">일시정지</p>
        <button type="button" class="arc-merge-btn again" data-resume>계속하기</button>
        <button type="button" class="arc-merge-btn arcade" data-leave-pause>오락실로</button>
      </div>
    </div>
    <div class="arc-merge-result" data-result hidden></div>
    <div class="arc-merge-rank" data-rank hidden></div>
  `;
  root?.appendChild(wrap);

  const cv = wrap.querySelector('.arc-merge-cv');
  const ctx = cv.getContext('2d');
  const pauseUi = wrap.querySelector('[data-pause-ui]');
  const resultEl = wrap.querySelector('[data-result]');
  const rankEl = wrap.querySelector('[data-rank]');
  const scoreEls = [...wrap.querySelectorAll('[data-score]')];
  const bestEls = [...wrap.querySelectorAll('[data-best]')];
  const nextImgs = [...wrap.querySelectorAll('[data-next-img]')];
  const muteBtns = [...wrap.querySelectorAll('[data-mute]')];
  const pauseBtns = [...wrap.querySelectorAll('[data-pause]')];
  const hint = wrap.querySelector('[data-hint]');
  const ctrl = wrap.querySelector('[data-ctrl]');
  const orientEl = wrap.querySelector('[data-orient]');

  prewarmMerge();
  loadImage(mergeUrl('tub/drop-indicator.png'));

  let session = createSession({ seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
  let best = Math.max(0, Number(getBest?.()) || 0);
  let runStartedAt = performance.now();
  let pendingPopAt = performance.now();
  let playing = true;
  let overShown = false;
  let raf = 0;
  let lastT = 0;
  let keyDir = 0;
  let particles = [];
  let floats = [];
  const spin = new Map();
  let pointerTouching = false;
  let submitted = false;
  let orientPaused = false;

  function viewportBox() {
    try {
      const vv = window.visualViewport;
      if (vv && vv.height) {
        return { w: Math.round(vv.width), h: Math.round(vv.height), top: Math.round(vv.offsetTop || 0) };
      }
    } catch { /* */ }
    try { return { w: innerWidth, h: innerHeight, top: 0 }; }
    catch { return { w: 390, h: 844, top: 0 }; }
  }
  function applyViewport() {
    const { w, h, top } = viewportBox();
    wrap.style.setProperty('--merge-vvw', `${w}px`);
    wrap.style.setProperty('--merge-vvh', `${h}px`);
    wrap.style.setProperty('--merge-vv-top', `${top}px`);
  }
  function syncOrient() {
    const coarse = isCoarse();
    const land = (() => { try { return innerWidth > innerHeight; } catch { return false; } })();
    const need = coarse && land;
    if (orientEl) orientEl.hidden = !need;
    wrap.classList.toggle('is-landscape', need);
    if (need) {
      if (!session.paused) {
        session.paused = true;
        orientPaused = true;
      }
    } else if (orientPaused) {
      session.paused = false;
      orientPaused = false;
    }
    return need;
  }
  function syncLayout() {
    applyViewport();
    const coarse = isCoarse();
    const wide = !coarse && isWideScreen();
    wrap.classList.toggle('is-wide', wide);
    wrap.classList.toggle('is-touch', coarse);
    wrap.classList.toggle('is-desk', !coarse);
    syncOrient();
    if (ctrl) ctrl.textContent = coarse ? '좌우로 밀고 손을 떼면 떨어져요' : '마우스 좌우 + 클릭';
    if (hint) hint.textContent = coarse ? '좌우로 밀어 떨어뜨리기' : '좌우로 움직여 떨어뜨리기';
  }

  function syncHud() {
    const sc = session.score;
    best = Math.max(best, sc);
    for (const el of scoreEls) el.textContent = fmt(sc);
    for (const el of bestEls) el.textContent = fmt(best);
    const info = stageInfo(session.nextStage);
    for (const img of nextImgs) {
      const src = itemUrl(info.id);
      if (img.getAttribute('src') !== src) img.src = src;
      img.alt = info.name;
    }
    for (const btn of muteBtns) {
      btn.classList.toggle('is-off', !!sfx?.muted);
      btn.setAttribute('aria-label', sfx?.muted ? '소리 켜기' : '소리 끄기');
    }
  }

  function resizeCanvas() {
    const play = wrap.querySelector('.arc-merge-play');
    const tub = wrap.querySelector('.arc-merge-tub');
    if (!play || !tub) return;
    const tr = tub.getBoundingClientRect();
    const pr = play.getBoundingClientRect();
    const innerW = tr.width * (318 / 350);
    const innerH = tr.height * (454 / 500);
    const left = (tr.left - pr.left) + tr.width * (16 / 350);
    const top = (tr.top - pr.top) + tr.height * (28 / 500) - innerH * (DROP_PAD / TUB_INNER_H);
    const height = innerH * ((TUB_INNER_H + DROP_PAD) / TUB_INNER_H);
    cv.style.left = `${left}px`;
    cv.style.top = `${top}px`;
    cv.style.width = `${innerW}px`;
    cv.style.height = `${height}px`;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const pw = Math.max(2, Math.round(innerW * dpr));
    const ph = Math.max(2, Math.round(height * dpr));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  }

  function worldFromClientX(clientX) {
    const rect = cv.getBoundingClientRect();
    if (!rect.width) return session.aimX;
    return (clientX - rect.left) / rect.width * TUB_INNER_W;
  }

  function addParticles(x, y, stage, burst = 12) {
    const cols = ['#FF7A6E', '#F0B429', '#5ECFB0', '#3A8FD9', '#fff4e8', '#B8322B'];
    for (let i = 0; i < burst; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 140;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 0.45 + Math.random() * 0.3, age: 0, r: 2.2 + Math.random() * 3.2,
        col: cols[(stage + i) % cols.length],
      });
    }
  }
  function addFloat(x, y, text) {
    floats.push({ x, y, text, age: 0, life: 0.75 });
  }

  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'drop') {
        try { sfx?.drop?.(); } catch { /* */ }
        pendingPopAt = performance.now();
      } else if (ev.type === 'merge') {
        try { sfx?.mergePop?.(ev.stage); } catch { /* */ }
        addParticles(ev.x, ev.y + DROP_PAD, ev.stage, 14);
        if (ev.score) addFloat(ev.x, ev.y + DROP_PAD, `+${ev.score}`);
        const mascots = wrap.querySelectorAll('[data-mascot], [data-floatbum]');
        if (ev.stage >= 7) mascots.forEach((m) => { m.src = bumUrl('cheer'); });
      } else if (ev.type === 'bonus') {
        try { sfx?.mergeBonus?.(); } catch { /* */ }
        addParticles(ev.x, ev.y + DROP_PAD, 10, 28);
        addFloat(ev.x, ev.y + DROP_PAD, `+${ev.score}`);
      } else if (ev.type === 'over') {
        finish();
      }
    }
  }

  function dropNow() {
    if (!playing || session.paused || session.over || orientPaused) return;
    if (!canDrop(session)) return;
    const item = tryDrop(session);
    if (item) {
      pendingPopAt = performance.now();
      handleEvents(session.events);
      session.events = [];
    }
    syncHud();
  }

  function onKeyDown(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keyDir = -1; e.preventDefault(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keyDir = 1; e.preventDefault(); }
    else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) dropNow(); }
    else if (e.code === 'KeyP') { togglePause(); }
    else if (e.code === 'Escape') {
      playing = false;
      if (session) session.paused = true;
      try { sfx?.stopBgm?.(); } catch { /* */ }
    }
  }
  function onKeyUp(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'ArrowRight' || e.code === 'KeyD') keyDir = 0;
  }

  function onPointerMove(e) {
    if (session.paused || session.over || orientPaused) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      if (!pointerTouching) return;
      setAimX(session, worldFromClientX(e.clientX));
    } else {
      setAimX(session, worldFromClientX(e.clientX));
    }
  }
  function onPointerDown(e) {
    if (e.target.closest('button, .arc-merge-result, .arc-merge-rank, .arc-merge-pause, .arc-merge-orient')) return;
    if (session.paused || session.over || !playing || orientPaused) return;
    const onPlay = e.target === cv || e.target.closest('.arc-merge-play');
    if (!onPlay) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      pointerTouching = true;
      setAimX(session, worldFromClientX(e.clientX));
    } else {
      setAimX(session, worldFromClientX(e.clientX));
      dropNow();
    }
  }
  function endTouch(e, { drop } = { drop: true }) {
    if (!pointerTouching) return;
    pointerTouching = false;
    if (!drop || orientPaused) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      setAimX(session, worldFromClientX(e.clientX));
      dropNow();
    }
  }
  function onPointerUp(e) { endTouch(e, { drop: true }); }
  function onPointerCancel() { endTouch({ pointerType: 'touch' }, { drop: false }); }

  function togglePause() {
    if (session.over || !playing || orientPaused) return;
    session.paused = !session.paused;
    pauseUi.hidden = !session.paused;
    if (session.paused) { try { sfx?.stopBgm?.(); } catch { /* */ } }
    else { try { sfx?.startStoreBgm?.(); } catch { /* */ } }
  }

  function draw() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const cssW = parseFloat(cv.style.width) || cv.clientWidth || 1;
    const cssH = parseFloat(cv.style.height) || cv.clientHeight || 1;
    const sx = (cv.width / cssW) || dpr;
    const sy = (cv.height / cssH) || dpr;
    const scale = cssW / TUB_INNER_W;
    ctx.setTransform(sx * scale, 0, 0, sy * scale, 0, 0);
    ctx.clearRect(0, 0, TUB_INNER_W, TUB_INNER_H + DROP_PAD);

    const dangerWorldY = TUB_INNER_H * 0.08;
    // 위험선 아래를 살짝 강조
    if (session.items.some((it) => it.aboveMs > 0.4)) {
      ctx.save();
      ctx.fillStyle = 'rgba(224,58,74,0.08)';
      ctx.fillRect(0, DROP_PAD, TUB_INNER_W, dangerWorldY);
      ctx.restore();
    }

    const pending = peekPending(session);
    if (pending && !session.over) {
      const pop = Math.min(1, (performance.now() - pendingPopAt) / 200);
      const ease = 1 - (1 - pop) ** 3;
      const px = pending.x;
      const py = DROP_PAD + pending.y + (1 - ease) * -18;
      const pr = pending.r * (0.52 + 0.48 * ease);
      ctx.save();
      ctx.strokeStyle = 'rgba(224, 90, 82, 0.55)';
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, py + pr * 0.2);
      ctx.lineTo(px, DROP_PAD + dangerWorldY + 70);
      ctx.stroke();
      ctx.restore();
      drawItem(pending.stage, px, py, pr, 0);
      const arrow = loadImage(mergeUrl('tub/drop-indicator.png'));
      if (arrow.complete && arrow.naturalWidth) {
        const aw = 22, ah = 15;
        ctx.drawImage(arrow, px - aw / 2, py + pending.r * SPRITE_PAD * 0.55, aw, ah);
      }
    }

    const alpha = Math.max(0, Math.min(1, (session.acc || 0) / FIXED_DT));
    for (const it of session.items) {
      if (it.dead) continue;
      let ang = spin.get(it.id) || 0;
      ang += it.vx * 0.0018;
      spin.set(it.id, ang);
      const rx = it.prevX == null ? it.x : it.prevX + (it.x - it.prevX) * alpha;
      const ry = it.prevY == null ? it.y : it.prevY + (it.y - it.prevY) * alpha;
      drawItem(it.stage, rx, DROP_PAD + ry, it.r, ang);
    }

    for (const p of particles) {
      const u = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, u);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.6 + u * 0.4), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.font = '700 18px "Black Han Sans", "Jua", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floats) {
      const u = 1 - f.age / f.life;
      ctx.globalAlpha = Math.max(0, u);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = '#B8322B';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawItem(stage, x, y, r, angle) {
    const info = stageInfo(stage);
    const img = itemImage(info.id);
    const size = r * 2 * SPRITE_PAD;
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = '#ffd6cf';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function tick(now) {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if (playing && !session.paused && !session.over) {
      if (keyDir) setAimX(session, session.aimX + keyDir * AIM_SPEED * dt);
      const events = step(session, dt);
      handleEvents(events);
      for (const p of particles) {
        p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
      }
      particles = particles.filter((p) => p.age < p.life);
      for (const f of floats) { f.age += dt; f.y -= 36 * dt; }
      floats = floats.filter((f) => f.age < f.life);
      syncHud();
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  function finish() {
    if (overShown) return;
    overShown = true;
    playing = false;
    session.over = true;
    try { sfx?.timeUp?.(); } catch { /* */ }
    try { sfx?.stopBgm?.(); } catch { /* */ }
    const name = (() => { try { return getName() || '나'; } catch { return '나'; } })();
    const finalScore = session.score;
    const finalLevel = Math.max(1, session.bestStage || 1);
    const durationMs = runStartedAt ? Math.max(0, performance.now() - runStartedAt) : 0;
    const high = Math.max(best, finalScore);
    best = high;
    const info = stageInfo(finalLevel);
    resultEl.hidden = false;
    resultEl.innerHTML = `
      <div class="arc-merge-modal result">
        <img class="res-bum" src="${bumUrl('front')}" alt="" />
        <p class="res-msg">${resultLine(finalLevel)}</p>
        <div class="res-stats">
          <div><span>점수</span><b>${fmt(finalScore)}</b></div>
          <div><span>최고</span><b>${fmt(high)}</b></div>
        </div>
        <div class="res-merge">최고 합치기 <em>${info.name}</em></div>
        <div class="res-actions">
          <button type="button" class="arc-merge-btn again" data-again aria-label="다시하기"></button>
          <button type="button" class="arc-merge-btn arcade" data-leave aria-label="오락실로"></button>
        </div>
      </div>`;
    resultEl.querySelector('[data-again]')?.addEventListener('click', () => restart());
    resultEl.querySelector('[data-leave]')?.addEventListener('click', () => dispose(true));
    if (!submitted) {
      submitted = true;
      onResult?.({ score: finalScore, level: finalLevel, durationMs, ranked: ranked && !practice, name, openBoard: false });
    }
  }

  function restart() {
    resultEl.hidden = true;
    resultEl.innerHTML = '';
    rankEl.hidden = true;
    rankEl.innerHTML = '';
    pauseUi.hidden = true;
    resetSession(session, { seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
    particles = [];
    floats = [];
    spin.clear();
    pendingPopAt = performance.now();
    playing = true;
    overShown = false;
    submitted = false;
    runStartedAt = performance.now();
    try { sfx?.startStoreBgm?.(); } catch { /* */ }
    syncHud();
  }

  function showRanking(rows = [], me = null) {
    const list = Array.isArray(rows) ? rows.filter((r) => r && (r.name != null || r.score != null)) : [];
    const rowHtml = (r, extra = '') => {
      const rank = Number(r.rank) || 0;
      const medal = rank >= 1 && rank <= 3
        ? `<img class="medal" src="${mergeUrl(`ui/medals/medal-${rank}.png`)}" alt="${rank}등" />`
        : `<span class="medal num">${rank || '-'}</span>`;
      const mine = extra.includes('me') || r.me;
      return `<li class="rank-row${mine ? ' me' : ''}${rank <= 3 && rank ? ` top${rank}` : ''}">${medal}<span class="nm">${esc(r.name || '나')}${mine ? ' <i>나</i>' : ''}</span><span class="sc">${fmt(r.score)}</span></li>`;
    };
    const body = list.length
      ? `<ul class="rank-list">${list.map((r) => rowHtml(r)).join('')}</ul>`
      : `<div class="empty">아직 기록이 없어요<br/>첫 판을 플레이하면 여기에 순위가 쌓여요.</div>`;
    rankEl.hidden = false;
    rankEl.innerHTML = `
      <div class="arc-merge-modal rank">
        <img class="res-bum" src="${bumUrl('front')}" alt="" />
        ${body}
        <div class="res-actions">
          <button type="button" class="arc-merge-btn again" data-again aria-label="다시하기"></button>
          <button type="button" class="arc-merge-btn arcade" data-leave aria-label="오락실로"></button>
        </div>
      </div>`;
    rankEl.querySelector('[data-again]')?.addEventListener('click', () => { rankEl.hidden = true; restart(); });
    rankEl.querySelector('[data-leave]')?.addEventListener('click', () => dispose(true));
  }

  async function openRank() {
    if (typeof onOpenBoard === 'function') {
      const out = await onOpenBoard();
      if (Array.isArray(out)) showRanking(out);
    }
  }

  function dispose(exit = false) {
    playing = false;
    if (session) session.paused = true;
    cancelAnimationFrame(raf);
    raf = 0;
    try { window.removeEventListener('keydown', onKeyDown, true); } catch { /* */ }
    try { window.removeEventListener('keyup', onKeyUp, true); } catch { /* */ }
    try { window.removeEventListener('resize', onResize); } catch { /* */ }
    try { window.removeEventListener('orientationchange', onResize); } catch { /* */ }
    try { window.visualViewport?.removeEventListener('resize', onResize); } catch { /* */ }
    try { window.visualViewport?.removeEventListener('scroll', onResize); } catch { /* */ }
    try { document.removeEventListener('visibilitychange', onVisibility); } catch { /* */ }
    try { sfx?.stopBgm?.(); } catch { /* */ }
    wrap.remove();
    if (exit) onExit?.();
  }

  function onResize() { syncLayout(); resizeCanvas(); }
  function onVisibility() {
    pointerTouching = false;
    lastT = 0;
  }

  muteBtns.forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = !sfx?.muted;
    sfx?.setMuted?.(next);
    if (next) sfx?.stopBgm?.();
    else if (playing && !session.over && !session.paused) sfx?.startStoreBgm?.();
    syncHud();
  }));
  pauseBtns.forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); }));
  wrap.querySelector('[data-resume]')?.addEventListener('click', () => { if (session.paused) togglePause(); });
  wrap.querySelector('[data-leave-pause]')?.addEventListener('click', () => dispose(true));

  cv.addEventListener('pointerdown', onPointerDown);
  wrap.querySelector('.arc-merge-play')?.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerCancel, { passive: true });
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  try { window.visualViewport?.addEventListener('resize', onResize); } catch { /* */ }
  try { window.visualViewport?.addEventListener('scroll', onResize); } catch { /* */ }
  document.addEventListener('visibilitychange', onVisibility);

  function seedDemo() {
    resetSession(session, { seed: 42 });
    session.pendingStage = 3;
    session.nextStage = 2;
    session.pendingR = radiusFor(3);
    session.score = 6420;
    session.bestStage = 7;
    session.dropLock = 0;
    session.fallingId = null;
    // 같은 단계가 서로 닿지 않게 쌓아 스크린샷용으로 안정적인 더미를 만든다
    const pile = [
      [1, 30, 434], [2, 68, 432], [3, 110, 426], [1, 152, 434], [2, 192, 432], [4, 236, 422], [1, 284, 434],
      [4, 50, 396], [5, 104, 388], [3, 158, 398], [6, 214, 382], [2, 270, 400], [5, 300, 388],
      [6, 82, 348], [4, 148, 354], [5, 208, 346], [3, 268, 360], [6, 300, 348],
      [5, 64, 310], [7, 160, 314], [6, 240, 318], [4, 300, 320],
    ];
    for (const [st, x, y] of pile) spawnAt(session, st, x, y, { age: 2, contacted: true, sleeping: true, vx: 0, vy: 0 });
    setAimX(session, TUB_INNER_W / 2);
    session.paused = true;
    playing = true;
    session.over = false;
    overShown = false;
    particles = [];
    floats = [];
    addFloat(168, DROP_PAD + 312, '+40');
    syncHud();
  }

  syncLayout();
  resizeCanvas();
  syncHud();
  try { sfx?.startStoreBgm?.(); } catch { /* */ }
  raf = requestAnimationFrame(tick);

  return {
    dispose: () => dispose(false),
    get score() { return session.score; },
    openRank,
    debug: {
      session,
      seedDemo,
      canDrop: () => canDrop(session),
      tryDrop: () => tryDrop(session),
      dropNow,
      syncLayout,
      showResult: () => { session.score = session.score || 8640; session.bestStage = session.bestStage || 6; finish(); },
      showRanking: (rows, me) => showRanking(rows, me),
      hideOverlays: () => { resultEl.hidden = true; rankEl.hidden = true; pauseUi.hidden = true; },
    },
  };
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
