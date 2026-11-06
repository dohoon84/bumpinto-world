// [bump24game] 매장 안 DOM UI: HUD(타이머 링·금액 롤업·무게 게이지·콤보) · 카운트다운 · 영수증 · 결과(색종이) · 가로 안내
import './ui.css';

const ICON = {
  exit: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H4v12h4M12 6l-4 4 4 4M8 10h9"/></svg>',
  vol: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 7.5h3L10 4v12l-4-3.5H3z"/><path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.3 5a7 7 0 0 1 0 10"/></svg>',
  mute: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M3 7.5h3L10 4v12l-4-3.5H3z"/><path d="M13.5 8l4 4M17.5 8l-4 4"/></svg>',
  logo: '<svg viewBox="0 0 40 40"><rect x="7" y="5" width="22" height="30" rx="8" fill="#0072DD"/><path d="M11 23h8c3 0 4-2 5-4l2-4" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="27" cy="13" r="4.4" fill="#fff"/><circle cx="27" cy="13" r="2.4" fill="#ff3b3b"/></svg>',
};
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function ensureFont() {
  if (document.getElementById('b24-pretendard')) return;
  const l = document.createElement('link'); l.id = 'b24-pretendard'; l.rel = 'stylesheet';
  l.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css';
  document.head.appendChild(l);
}

export function createBump24UI({ onGrab, onExit, onMute, onHintTap, onIntroGo } = {}) {
  ensureFont();
  const root = document.createElement('div');
  root.id = 'b24-root'; root.dataset.inside = '0';
  root.innerHTML = `
    <div class="b24-fx b24-in"><div class="b24-edge"></div><div class="b24-flash"></div></div>
    <div class="b24-top b24-in">
      <button class="b24-ibtn" data-k="exit" aria-label="매장 나가기">${ICON.exit}<span>나가기</span></button>
      <button class="b24-ibtn round" data-k="mute" aria-label="효과음 끄기">${ICON.vol}</button>
    </div>
    <div class="b24-hud b24-in off">
      <div class="b24-ring"><svg viewBox="0 0 76 76"><circle class="bg" cx="38" cy="38" r="33" fill="none" stroke-width="7"/><circle class="fg" cx="38" cy="38" r="33" fill="none" stroke-width="7" stroke-dasharray="207.3" stroke-dashoffset="0"/></svg><div class="num"><span>30</span><small>초</small></div></div>
      <div class="b24-total"><div class="lb">장바구니 합계 <i>랭킹</i></div><div class="v"><span>0</span><u>원</u></div></div>
      <div class="b24-weight"><div class="b24-bico"><svg viewBox="0 0 44 38"><defs><clipPath id="b24bc"><path d="M6 13h32l-4 21H10z"/></clipPath></defs><rect class="fill" clip-path="url(#b24bc)" x="0" y="34" width="44" height="0" fill="#3aa6ff"/><path d="M6 13h32l-4 21H10z" fill="none" stroke="#0072DD" stroke-width="2.6" stroke-linejoin="round"/><path d="M13 13c0-8 18-8 18 0" fill="none" stroke="#0072DD" stroke-width="2.6"/><path d="M13 19v10M19 19v10M25 19v10M31 19v10" stroke="#0072DD" stroke-width="1.4" opacity=".45"/></svg></div><div class="kg"><span>0.0</span> / 6kg<small>무게</small></div></div>
    </div>
    <div class="b24-sale b24-in"></div>
    <div class="b24-combo b24-in"></div>
    <div class="b24-count b24-in"></div>
    <div class="b24-banner b24-in"></div>
    <div class="b24-hint"></div>
    <button class="b24-grab b24-in" hidden><span>담기<small>E</small></span></button>
    <div class="b24-intro-wrap b24-in"></div>
    <div class="b24-receipt-wrap b24-in"></div>
    <div class="b24-modal-wrap b24-in"></div>
    <div class="b24-rotate"><div class="b24r-box"><div class="b24r-phone"><i>↻</i></div><div class="b24r-arc"></div><h3>휴대폰을 가로로 돌려주세요</h3><p>BUMP24 30초 장보기는<br>가로 화면에서 플레이해요</p><div class="b24r-tag">${ICON.logo.replace('<svg', '<svg width="22" height="22"')}<span>돌리면 <b>바로 이어서</b> 시작돼요</span></div><br><button class="b24r-ex" data-k="exit">매장 나가기</button></div></div>
    <div class="b24-fade"><div class="t"><div class="logo">${ICON.logo.replace('<svg', '<svg width="40" height="40"')}</div><b></b><span></span></div></div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const el = {
    fade: $('.b24-fade'), fadeT: $('.b24-fade b'), fadeS: $('.b24-fade span'), hud: $('.b24-hud'), ring: $('.b24-ring .fg'), ringN: $('.b24-ring .num span'),
    total: $('.b24-total .v'), totalN: $('.b24-total .v span'), mode: $('.b24-total .lb i'), w: $('.b24-weight'), wFill: $('.b24-bico .fill'), wN: $('.b24-weight .kg span'),
    sale: $('.b24-sale'), combo: $('.b24-combo'), count: $('.b24-count'), banner: $('.b24-banner'), hint: $('.b24-hint'), grab: $('.b24-grab'),
    intro: $('.b24-intro-wrap'), receipt: $('.b24-receipt-wrap'), modal: $('.b24-modal-wrap'), rotate: $('.b24-rotate'), fx: $('.b24-fx'), edge: $('.b24-edge'), flash: $('.b24-flash'), mute: $('[data-k="mute"]'),
  };
  root.addEventListener('click', (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (k === 'exit') onExit?.(); else if (k === 'mute') onMute?.();
  });
  const grabDown = (e) => { e.preventDefault(); el.grab.classList.add('press'); onGrab?.(); };
  el.grab.addEventListener('pointerdown', grabDown);
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.grab.addEventListener(ev, () => el.grab.classList.remove('press'));
  el.hint.addEventListener('click', () => onHintTap?.());

  // 금액 롤업
  let shown = 0, target = 0, raf = 0;
  function roll() {
    const d = target - shown; shown = Math.abs(d) < 8 ? target : shown + d * 0.18;
    el.totalN.textContent = won(shown);
    raf = shown !== target ? requestAnimationFrame(roll) : 0;
  }
  let lastTime = -1, lastKg = -1;
  const api = {
    root,
    setInside(on) { root.dataset.inside = on ? '1' : '0'; },
    setFade(a, title = '', sub = '') {
      el.fade.style.opacity = String(a); el.fade.style.pointerEvents = a > 0.02 ? 'auto' : 'none';
      if (title) { el.fadeT.textContent = title; el.fadeS.textContent = sub || ''; }
      el.fade.querySelector('.t').style.opacity = a > 0.6 ? '1' : '0';
    },
    setHint(html, center = false) { if (el.hint.innerHTML !== (html || '')) el.hint.innerHTML = html || ''; el.hint.classList.toggle('center', !!center); },
    showHud(on) { el.hud.classList.toggle('off', !on); el.sale.style.display = on ? '' : 'none'; },
    setMode(ranked) { el.mode.textContent = ranked ? '랭킹' : '연습'; el.mode.classList.toggle('prac', !ranked); },
    setSale(items) { el.sale.innerHTML = items.map((p) => `<span><b>2배</b>${esc(p.name)}</span>`).join(''); },
    setHud({ time, total, kg, maxKg = 6, urgent = false } = {}) {
      if (time != null) {
        const t = Math.max(0, time), s = Math.ceil(t);
        if (s !== lastTime) { el.ringN.textContent = String(s); lastTime = s; }
        el.ring.style.strokeDashoffset = String(207.3 * (1 - t / 30));
        el.hud.classList.toggle('urgent', urgent);
      }
      if (total != null && total !== target) { const up = total > target; target = total; if (!raf) raf = requestAnimationFrame(roll); if (up) { el.total.classList.remove('bump'); void el.total.offsetWidth; el.total.classList.add('bump'); } }
      if (kg != null && Math.abs(kg - lastKg) > 0.001) {
        lastKg = kg; const f = Math.min(1, kg / maxKg);
        el.wN.textContent = kg.toFixed(1);
        el.wFill.setAttribute('y', String(34 - 23 * f)); el.wFill.setAttribute('height', String(23 * f));
        el.wFill.setAttribute('fill', f > 0.9 ? '#ff2d55' : f > 0.7 ? '#ff9f1a' : '#3aa6ff');
        el.w.classList.toggle('warn', f > 0.7 && f <= 0.9); el.w.classList.toggle('full', f > 0.9);
      }
    },
    resetTotal() { shown = 0; target = 0; el.totalN.textContent = '0'; lastKg = -1; },
    showGrab(visible, enabled = true, label = '담기') {
      el.grab.hidden = !visible; el.grab.classList.toggle('dim', !enabled);
      const sp = el.grab.querySelector('span'); const want = `${label}<small>${matchMedia('(pointer:coarse)').matches ? '탭' : 'E'}</small>`;
      if (sp.innerHTML !== want) sp.innerHTML = want;
    },
    countdown(n, cap = '') {
      if (n == null) { el.count.innerHTML = ''; return; }
      const go = n === 0;
      el.count.innerHTML = `<div class="ring pop"></div><div class="n pop ${go ? 'go' : ''}">${go ? 'START!' : n}</div>${cap ? `<div class="cap">${esc(cap)}</div>` : ''}`;
    },
    combo(n) {
      if (n < 2) return;
      el.combo.textContent = `${n} COMBO!`; el.combo.classList.remove('on'); void el.combo.offsetWidth; el.combo.classList.add('on');
    },
    float(x, y, text, cls = '', sub = '') {
      const d = document.createElement('div'); d.className = `b24-float ${cls}`; d.style.left = `${x}px`; d.style.top = `${y}px`;
      d.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`; el.fx.appendChild(d); setTimeout(() => d.remove(), 1000);
    },
    sparkle(x, y, n = 10, colors = ['#ffd400', '#3aa6ff', '#ffffff', '#ff5577']) {
      for (let i = 0; i < n; i++) {
        const s = document.createElement('i'); s.className = 'b24-spark'; const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, r = 40 + Math.random() * 50;
        s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r - 20}px;--c:${colors[i % colors.length]}`;
        el.fx.appendChild(s); setTimeout(() => s.remove(), 650);
      }
    },
    burst(x, y, text) {
      const d = document.createElement('div'); d.className = 'b24-burst'; d.style.left = `${x}px`; d.style.top = `${y}px`; d.innerHTML = `<span>${esc(text)}</span>`;
      el.fx.appendChild(d); setTimeout(() => d.remove(), 1700);
    },
    flash() { el.flash.classList.remove('on'); void el.flash.offsetWidth; el.flash.classList.add('on'); },
    edge(on) { el.edge.classList.toggle('on', !!on); },
    banner(text, ms = 1400) { el.banner.innerHTML = `<b>${esc(text)}</b>`; clearTimeout(api._bt); api._bt = setTimeout(() => { el.banner.innerHTML = ''; }, ms); },
    intro({ storeName, ranked, sale = [], best = 0 } = {}) {
      el.intro.innerHTML = `<div class="b24-intro"><span class="mode ${ranked ? '' : 'prac'}">${ranked ? '오늘의 랭킹 도전 1회' : '연습 모드 · 무제한'}</span>
        <h2><em>30초</em> 장보기</h2><p>${esc(storeName)} · 내 최고 ${won(best)}원</p>
        <ol><li><b>1</b>입구 옆 파란 바구니를 집으면 5초 뒤 시작</li><li><b>2</b>진열대 앞에서 담기 — 비싼 걸 많이!</li>
        <li><b>3</b>바구니 ${6}kg 넘으면 와르르 쏟아져요</li><li><b>4</b>오늘의 2배: ${sale.map((p) => esc(p.name)).join(', ') || '-'}</li></ol>
        <button class="go">바구니 집으러 가기</button></div>`;
      el.intro.querySelector('.go').addEventListener('click', () => { api.hideIntro(); onIntroGo?.(); });
      el.intro.querySelector('.b24-intro').style.pointerEvents = 'auto';
    },
    hideIntro() { el.intro.innerHTML = ''; },
    get introOpen() { return !!el.intro.firstChild; },
    // 영수증: 프린터에서 한 줄씩
    receiptOpen(storeName, ranked) {
      const now = new Date();
      el.receipt.innerHTML = `<div class="b24-receipt"><div class="printer"><span>BUMP24 POS</span><i></i></div><div class="b24-paper"><div class="in">
        <div class="hd"><b>BUMP24</b><span>${esc(storeName)} · ${now.toLocaleDateString('ko-KR')} ${now.toTimeString().slice(0, 5)}</span><br><span>${ranked ? '랭킹 도전' : '연습'} · 영수증</span></div>
        <div class="rows"></div><div class="end" style="display:none"><div class="tot"><span>합계</span><b>0원</b></div><div class="bar"></div><div class="ft">30초 장보기 · 또 오세요!</div></div></div></div></div>`;
      api._fit = () => { const p = api._paper; if (!p) return; const lim = (innerHeight * (innerHeight < 520 ? 1.12 : 0.86)) - 60; p.style.maxHeight = `${Math.min(p.scrollHeight, lim)}px`; const sc = () => { if (api._paper && api._paper.scrollHeight > lim + 2) api._paper.scrollTop = api._paper.scrollHeight; else if (api._paper) api._paper.scrollTop = 0; }; sc(); setTimeout(sc, 280); };
      api._rows = el.receipt.querySelector('.rows'); api._paper = el.receipt.querySelector('.b24-paper'); api._tot = el.receipt.querySelector('.tot b');
      requestAnimationFrame(() => api._fit());
    },
    receiptLine(item, sale, price) {
      if (!api._rows) return;
      const r = document.createElement('div'); r.className = 'row';
      r.innerHTML = `<span>${esc(item.name)}${sale ? '<em>2배</em>' : ''}</span><span>${won(price)}</span>`;
      api._rows.appendChild(r); api._fit();
    },
    receiptTotal(total, dur = 700) {
      const t0 = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3); if (api._tot) api._tot.textContent = `${won(total * e)}원`; if (k < 1) requestAnimationFrame(step); };
      const end = el.receipt.querySelector('.end'); if (end) end.style.display = '';
      step(); api._fit?.();
    },
    receiptClose() { el.receipt.innerHTML = ''; api._rows = api._paper = api._tot = null; },
    showResult({ score, best, isBest, ranked, items = [], kg = 0, combo = 0, spills = 0, onRetry, onBoard, onExit: ex }) {
      const chips = items.slice(0, 18).map((it) => `<i class="${it.sale ? 's' : ''}">${esc(it.name)}</i>`).join('') + (items.length > 18 ? `<i>+${items.length - 18}</i>` : '');
      el.modal.innerHTML = `<div class="b24-modal"><canvas class="b24-confetti"></canvas><div class="b24-result">
        <div class="top"><div class="ttl">${ranked ? '오늘의 랭킹 기록' : '연습 기록'}</div><div class="sc"><span>0</span><u>원</u></div>
        <div class="ribbon ${isBest ? '' : 'prac'}">${isBest ? '🎉 내 최고 기록 갱신!' : `내 최고 ${won(best)}원`}</div></div>
        <div class="stats"><div><b>${items.length}</b><span>담은 개수</span></div><div><b>${kg.toFixed(1)}kg</b><span>무게</span></div><div><b>${combo}</b><span>최대 콤보</span></div></div>
        <div class="items">${chips || '<i>빈 바구니…</i>'}</div>
        <div class="btns"><button class="pri" data-r="retry">연습 한 판 더</button><button data-r="board">리더보드</button><button data-r="exit">매장 나가기</button></div>
        <div class="note">${spills ? `와르르 ${spills}번 · ` : ''}기록은 이 기기에만 저장돼요 (로컬)</div></div></div>`;
      const sc = el.modal.querySelector('.sc span'); const t0 = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - t0) / 900), e = 1 - Math.pow(1 - k, 3); sc.textContent = won(score * e); if (k < 1) requestAnimationFrame(step); }; step();
      el.modal.querySelector('[data-r="retry"]').onclick = () => onRetry?.();
      el.modal.querySelector('[data-r="board"]').onclick = () => onBoard?.();
      el.modal.querySelector('[data-r="exit"]').onclick = () => ex?.();
      confetti(el.modal.querySelector('.b24-confetti'), isBest ? 160 : 90);
    },
    showBoard(rows, { me } = {}) {
      const list = rows.length ? rows.map((r, i) => `<li><b>${i + 1}</b><span>${esc(r.name)}${r.at ? ` <small style="color:#8a97a8;font-weight:600">${new Date(r.at).toLocaleDateString('ko-KR')}</small>` : ''}</span><em>${won(r.score)}원</em></li>`).join('') : '<li><span>아직 기록이 없어요</span></li>';
      el.modal.innerHTML = `<div class="b24-modal"><div class="b24-board"><h3>오늘의 리더보드</h3><span class="loc">로컬 기록 · 이 기기만 (서버 랭킹 준비 중)</span><ol>${list}</ol><button>닫기</button></div></div>`;
      el.modal.querySelector('button').onclick = () => me?.();
    },
    hideModal() { el.modal.innerHTML = ''; },
    setMuted(m) { el.mute.innerHTML = m ? ICON.mute : ICON.vol; el.mute.setAttribute('aria-label', m ? '효과음 켜기' : '효과음 끄기'); },
    rotate(on) { el.rotate.classList.toggle('on', !!on); },
    get rotating() { return el.rotate.classList.contains('on'); },
    dispose() { cancelAnimationFrame(raf); root.remove(); },
  };
  return api;
}

function confetti(cv, n) {
  const r = cv.getBoundingClientRect(); const W = (cv.width = Math.max(1, r.width)), H = (cv.height = Math.max(1, r.height)); const c = cv.getContext('2d');
  const cols = ['#0072DD', '#3aa6ff', '#ffd400', '#ff2d55', '#ffffff', '#7dff9a'];
  const ps = Array.from({ length: n }, () => ({ x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.3, vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, w: 5 + Math.random() * 6, h: 8 + Math.random() * 8, c: cols[Math.floor(Math.random() * cols.length)] }));
  const t0 = performance.now();
  const step = () => {
    const t = performance.now() - t0; c.clearRect(0, 0, W, H);
    for (const p of ps) { p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.scale(1, Math.cos(t / 120 + p.r)); c.fillStyle = p.c; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore(); }
    if (t < 3200 && cv.isConnected) requestAnimationFrame(step); else c.clearRect(0, 0, W, H);
  };
  step();
}

// ---------- 로컬 기록 ----------
const KEY_BEST = 'bw.bump24.best', KEY_BOARD = 'bw.bump24.localBoard', KEY_RANKED = 'bw.bump24.ranked';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };
export function loadBest(storeId) { return Number(read(KEY_BEST)[storeId] || 0); }
export function saveBest(storeId, score) { const all = read(KEY_BEST); const b = Math.max(Number(all[storeId] || 0), score); all[storeId] = b; write(KEY_BEST, all); return b; }
export function pushLocalBoard(storeId, entry) { const all = read(KEY_BOARD); const arr = (all[storeId] || []).concat([entry]).sort((a, b) => b.score - a.score).slice(0, 20); all[storeId] = arr; write(KEY_BOARD, all); return arr; }
export function loadLocalBoard(storeId, dateKey) { const arr = read(KEY_BOARD)[storeId] || []; return dateKey ? arr.filter((r) => !r.dateKey || r.dateKey === dateKey) : arr; }
export function rankedUsed(storeId, dateKey) { return !!read(KEY_RANKED)[`${storeId}|${dateKey}`]; }
export function markRanked(storeId, dateKey) { const all = read(KEY_RANKED); all[`${storeId}|${dateKey}`] = Date.now(); for (const k of Object.keys(all)) if (Date.now() - all[k] > 3 * 864e5) delete all[k]; write(KEY_RANKED, all); }
