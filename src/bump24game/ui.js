// [bump24game] HUD · 카운트다운 · 영수증 · 결과 · 리더보드(로컬) · 담기 버튼
const FONT = '"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';
const CSS = `
body.b24-inside #topbar, body.b24-inside #hud, body.b24-inside #emote-bar, body.b24-inside #chat, body.b24-inside #minimap, body.b24-inside .phone-shell, body.b24-inside #m-hud, body.b24-inside #inventory-fab { opacity:0 !important; pointer-events:none !important; }
#b24-root{position:fixed;inset:0;pointer-events:none;z-index:220;font-family:${FONT};color:#fff}
#b24-root *{box-sizing:border-box}
#b24-hint{position:fixed;left:50%;bottom:110px;transform:translateX(-50%);background:rgba(10,18,36,.88);padding:10px 16px;border-radius:14px;font:700 15px/1.3 ${FONT};opacity:0;transition:opacity .2s;pointer-events:none;border:1px solid rgba(58,166,255,.35);box-shadow:0 8px 24px rgba(0,0,0,.25)}
#b24-hint kbd{display:inline-block;min-width:22px;padding:2px 7px;margin-right:8px;border-radius:6px;background:#FFC20E;color:#111;font:800 13px ${FONT};text-align:center}
#b24-fade{position:fixed;inset:0;background:#0a1630;opacity:0;pointer-events:none;z-index:221;display:flex;align-items:center;justify-content:center;transition:none}
#b24-fade .t{font:800 22px/1.4 ${FONT};color:#fff;text-align:center;letter-spacing:.02em}
#b24-fade .sub{font:600 14px/1.4 ${FONT};color:rgba(205,230,251,.85);margin-top:8px}
#b24-hud{position:fixed;top:0;left:0;right:0;padding:calc(10px + env(safe-area-inset-top,0px)) 14px 0;display:none;gap:10px;justify-content:center;align-items:stretch;pointer-events:none}
#b24-hud .card{background:rgba(10,18,36,.82);border:1px solid rgba(58,166,255,.3);border-radius:16px;padding:10px 14px;min-width:92px;backdrop-filter:blur(8px);box-shadow:0 6px 20px rgba(0,0,0,.22)}
#b24-hud .lbl{font:700 11px/1 ${FONT};color:rgba(205,230,251,.75);letter-spacing:.04em}
#b24-hud .val{font:900 22px/1.15 ${FONT};margin-top:4px;color:#fff}
#b24-hud .val.warn{color:#ff8a80}
#b24-hud .val.urgent{color:#ff5252;animation:b24pulse .45s ease-in-out infinite alternate}
#b24-hud .gauge{height:8px;border-radius:99px;background:rgba(255,255,255,.12);margin-top:8px;overflow:hidden}
#b24-hud .gauge>i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#3aa6ff,#0072DD);transition:width .12s}
#b24-hud .gauge.hot>i{background:linear-gradient(90deg,#ff8a65,#ff1744)}
#b24-combo{position:fixed;right:18px;top:38%;font:900 28px/1 ${FONT};color:#ffe14d;text-shadow:0 2px 12px rgba(0,0,0,.45);opacity:0;transform:scale(.8);transition:opacity .15s,transform .15s;pointer-events:none}
#b24-pop{position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);font:900 20px/1.2 ${FONT};color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .15s,transform .25s}
#b24-count{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:222;pointer-events:none}
#b24-count .n{font:900 120px/1 ${FONT};color:#fff;text-shadow:0 8px 40px rgba(0,114,221,.55);transform:scale(.6);opacity:0;transition:transform .18s,opacity .18s}
#b24-count .go{font:900 72px/1 ${FONT};color:#FFE14D}
#b24-grab{position:fixed;right:18px;bottom:calc(28px + env(safe-area-inset-bottom,0px));width:92px;height:92px;border-radius:50%;border:none;background:linear-gradient(160deg,#3aa6ff,#0072DD);color:#fff;font:900 20px/1 ${FONT};box-shadow:0 10px 28px rgba(0,114,221,.45);pointer-events:auto;display:none;align-items:center;justify-content:center;touch-action:none;user-select:none;-webkit-user-select:none}
#b24-grab:active,#b24-grab.on{transform:scale(.94);filter:brightness(1.08)}
#b24-grab[disabled]{opacity:.35;filter:grayscale(.4)}
#b24-edge{position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 0 0 rgba(255,50,50,0);transition:box-shadow .2s;z-index:219}
#b24-edge.on{box-shadow:inset 0 0 80px 20px rgba(255,40,40,.35);animation:b24edge .5s ease-in-out infinite alternate}
#b24-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(6,12,24,.55);z-index:230;pointer-events:auto;padding:18px}
#b24-modal .sheet{width:min(420px,94vw);max-height:min(86vh,720px);overflow:auto;background:linear-gradient(180deg,#13264a,#0a1630);border:1px solid rgba(58,166,255,.35);border-radius:22px;padding:22px 20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.45);color:#fff}
#b24-modal h2{margin:0 0 4px;font:900 22px/1.25 ${FONT}}
#b24-modal .muted{color:rgba(205,230,251,.7);font:600 13px/1.4 ${FONT};margin-bottom:14px}
#b24-modal .score{font:900 40px/1 ${FONT};color:#FFE14D;margin:8px 0 4px}
#b24-modal .row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08);font:600 14px/1.3 ${FONT}}
#b24-modal .actions{display:flex;flex-direction:column;gap:8px;margin-top:16px}
#b24-modal button{pointer-events:auto;border:none;border-radius:14px;padding:14px 16px;font:800 15px/1 ${FONT};cursor:pointer}
#b24-modal .primary{background:linear-gradient(160deg,#3aa6ff,#0072DD);color:#fff}
#b24-modal .ghost{background:rgba(255,255,255,.08);color:#fff}
#b24-receipt{font:600 13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(255,255,255,.06);border-radius:12px;padding:12px;margin:10px 0;max-height:180px;overflow:auto}
#b24-receipt .tot{font-weight:900;color:#FFE14D;margin-top:8px;font-size:15px}
#b24-board{position:fixed;inset:0;display:none;align-items:flex-end;justify-content:center;background:rgba(6,12,24,.5);z-index:231;pointer-events:auto;padding:18px}
#b24-board .sheet{width:min(420px,94vw);max-height:70vh;overflow:auto;background:#0a1630;border-radius:22px 22px 0 0;padding:18px;border:1px solid rgba(58,166,255,.3)}
@keyframes b24pulse{from{transform:scale(1)}to{transform:scale(1.06)}}
@keyframes b24edge{from{opacity:.7}to{opacity:1}}
#b24-sparks{position:fixed;inset:0;pointer-events:none;z-index:225}
#b24-sparks i{position:absolute;width:6px;height:6px;border-radius:50%;background:#ffe14d;box-shadow:0 0 8px #3aa6ff;animation:b24spark .55s ease-out forwards}
@keyframes b24spark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0}}
@media(max-width:480px){
  #b24-hud .val{font-size:20px}
  #b24-count .n{font-size:96px}
  #b24-grab{width:84px;height:84px;right:14px}
}
`;

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function createBump24UI({ onGrab, onAction } = {}) {
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = el(`<div id="b24-root" aria-live="polite">
    <div id="b24-fade"><div><div class="t"></div><div class="sub"></div></div></div>
    <div id="b24-hint"></div>
    <div id="b24-hud">
      <div class="card" data-k="time"><div class="lbl">남은 시간</div><div class="val" id="b24-time">30</div></div>
      <div class="card" data-k="score"><div class="lbl">담은 금액</div><div class="val" id="b24-score">0원</div></div>
      <div class="card" data-k="wt"><div class="lbl">무게</div><div class="val" id="b24-wt">0%</div><div class="gauge" id="b24-gauge"><i></i></div></div>
    </div>
    <div id="b24-combo">COMBO x2</div>
    <div id="b24-pop"></div>
    <div id="b24-count"><div class="n">5</div></div>
    <div id="b24-edge"></div>
    <button id="b24-grab" type="button">담기</button>
    <div id="b24-modal"></div>
    <div id="b24-board"></div>
  </div>`);
  document.body.appendChild(root);

  const fade = root.querySelector('#b24-fade');
  const hint = root.querySelector('#b24-hint');
  const hud = root.querySelector('#b24-hud');
  const grab = root.querySelector('#b24-grab');
  const count = root.querySelector('#b24-count');
  const combo = root.querySelector('#b24-combo');
  const pop = root.querySelector('#b24-pop');
  const edge = root.querySelector('#b24-edge');
  const modal = root.querySelector('#b24-modal');
  const board = root.querySelector('#b24-board');

  let grabHold = null;
  const fireGrab = () => onGrab?.();
  grab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grab.classList.add('on');
    fireGrab();
    grabHold = setInterval(fireGrab, 220);
  });
  const stopHold = () => { grab.classList.remove('on'); if (grabHold) { clearInterval(grabHold); grabHold = null; } };
  grab.addEventListener('pointerup', stopHold);
  grab.addEventListener('pointerleave', stopHold);
  grab.addEventListener('pointercancel', stopHold);

  return {
    root,
    setFade(a, title = '', sub = '') {
      fade.style.opacity = String(a);
      fade.style.pointerEvents = a > 0.05 ? 'auto' : 'none';
      fade.querySelector('.t').textContent = title;
      fade.querySelector('.sub').textContent = sub;
    },
    setHint(html) {
      hint.innerHTML = html || '';
      hint.style.opacity = html ? '1' : '0';
    },
    showHud(on) { hud.style.display = on ? 'flex' : 'none'; },
    setHud({ time, score, fill, urgent } = {}) {
      const t = root.querySelector('#b24-time');
      const s = root.querySelector('#b24-score');
      const w = root.querySelector('#b24-wt');
      const g = root.querySelector('#b24-gauge');
      if (time != null) {
        t.textContent = String(Math.max(0, Math.ceil(time)));
        t.classList.toggle('urgent', !!urgent || time <= 5);
        t.classList.toggle('warn', time <= 10 && time > 5);
      }
      if (score != null) s.textContent = `${Number(score).toLocaleString('ko-KR')}원`;
      if (fill != null) {
        const pct = Math.min(100, Math.round(fill * 100));
        w.textContent = `${pct}%`;
        w.classList.toggle('warn', fill >= 0.8);
        g.classList.toggle('hot', fill >= 0.8);
        g.querySelector('i').style.width = `${pct}%`;
      }
      edge.classList.toggle('on', !!urgent);
    },
    showGrab(on, enabled = true) {
      grab.style.display = on ? 'flex' : 'none';
      grab.disabled = !enabled;
    },
    showCountdown(n) {
      count.style.display = n == null ? 'none' : 'flex';
      const eln = count.querySelector('.n');
      if (n == null) return;
      eln.className = n <= 0 ? 'n go' : 'n';
      eln.textContent = n <= 0 ? 'START!' : String(n);
      eln.style.opacity = '0'; eln.style.transform = 'scale(.6)';
      requestAnimationFrame(() => { eln.style.opacity = '1'; eln.style.transform = 'scale(1)'; });
    },
    flashCombo(n) {
      combo.textContent = `COMBO x${n}`;
      combo.style.opacity = '1'; combo.style.transform = 'scale(1)';
      clearTimeout(combo._t);
      combo._t = setTimeout(() => { combo.style.opacity = '0'; combo.style.transform = 'scale(.8)'; }, 550);
    },
    flashPop(text) {
      pop.textContent = text;
      pop.style.opacity = '1'; pop.style.transform = 'translate(-50%,-60%)';
      clearTimeout(pop._t);
      pop._t = setTimeout(() => { pop.style.opacity = '0'; pop.style.transform = 'translate(-50%,-40%)'; }, 480);
    },
    showResult({ score, best, items, isBest, practice, onRetry, onPractice, onExit, onBoard }) {
      const lines = (items || []).map((it) => `<div class="row"><span>${it.name}${it.sale ? ' ×2' : ''}</span><span>${(it.price * (it.sale ? 2 : 1)).toLocaleString('ko-KR')}원</span></div>`).join('');
      modal.style.display = 'flex';
      modal.innerHTML = `<div class="sheet">
        <h2>${isBest ? '🎉 신기록!' : '장보기 완료'}</h2>
        <div class="muted">${practice ? '연습 모드 · 랭킹 미반영' : '오늘 기록 (로컬)'} · BUMP24</div>
        <div class="score">${score.toLocaleString('ko-KR')}원</div>
        <div class="muted">최고 ${best.toLocaleString('ko-KR')}원</div>
        <div id="b24-receipt">${lines || '<div class="muted">담은 상품 없음</div>'}<div class="tot">합계 ${score.toLocaleString('ko-KR')}원</div></div>
        <div class="actions">
          <button class="primary" data-a="retry">다시 하기 (연습)</button>
          <button class="ghost" data-a="board">리더보드 (로컬)</button>
          <button class="ghost" data-a="exit">매장 나가기</button>
        </div>
      </div>`;
      modal.onclick = (e) => {
        const a = e.target?.getAttribute?.('data-a');
        if (!a) return;
        if (a === 'retry') onRetry?.();
        if (a === 'practice') onPractice?.();
        if (a === 'exit') onExit?.();
        if (a === 'board') onBoard?.();
      };
    },
    hideModal() { modal.style.display = 'none'; modal.innerHTML = ''; },
    showReceiptAnim(lines, total, onDone) {
      modal.style.display = 'flex';
      modal.innerHTML = `<div class="sheet"><h2>계산 중…</h2><div class="muted">BUMP24 · 스캔 중</div><div id="b24-receipt"></div></div>`;
      const box = modal.querySelector('#b24-receipt');
      let i = 0;
      const tick = () => {
        if (i < lines.length) {
          const it = lines[i++];
          const row = document.createElement('div');
          row.className = 'row';
          row.innerHTML = `<span>${it.name}${it.sale ? ' ×2' : ''}</span><span>${(it.price * (it.sale ? 2 : 1)).toLocaleString('ko-KR')}원</span>`;
          box.appendChild(row);
          onAction?.('scan');
          setTimeout(tick, 120);
        } else {
          const tot = document.createElement('div');
          tot.className = 'tot';
          tot.textContent = `합계 ${total.toLocaleString('ko-KR')}원`;
          box.appendChild(tot);
          onAction?.('kaching');
          setTimeout(() => onDone?.(), 450);
        }
      };
      setTimeout(tick, 200);
    },
    showBoard(rows, onClose) {
      board.style.display = 'flex';
      const body = rows.length
        ? rows.map((r, i) => `<div class="row"><span>${i + 1}. ${r.name}</span><span>${r.score.toLocaleString('ko-KR')}원</span></div>`).join('')
        : '<div class="muted">아직 기록이 없어요</div>';
      board.innerHTML = `<div class="sheet"><h2 style="margin:0 0 6px;font:900 20px Pretendard,sans-serif">리더보드</h2>
        <div class="muted" style="color:rgba(205,230,251,.7);font:600 12px Pretendard,sans-serif;margin-bottom:10px">로컬 기록 · 서버 연동 전</div>
        ${body}
        <button class="primary" style="margin-top:14px;width:100%;border:none;border-radius:14px;padding:14px;font:800 15px Pretendard,sans-serif;background:linear-gradient(160deg,#3aa6ff,#0072DD);color:#fff" data-close>닫기</button>
      </div>`;
      board.onclick = (e) => { if (e.target === board || e.target?.hasAttribute?.('data-close')) { board.style.display = 'none'; onClose?.(); } };
    },
    sparkle(cx = innerWidth / 2, cy = innerHeight * 0.45) {
      let layer = root.querySelector('#b24-sparks');
      if (!layer) { layer = document.createElement('div'); layer.id = 'b24-sparks'; root.appendChild(layer); }
      for (let i = 0; i < 14; i++) {
        const d = document.createElement('i');
        const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 70;
        d.style.left = cx + 'px'; d.style.top = cy + 'px';
        d.style.setProperty('--dx', Math.cos(a) * r + 'px');
        d.style.setProperty('--dy', Math.sin(a) * r + 'px');
        d.style.background = ['#FFE14D','#3aa6ff','#fff','#FF3B3B'][i % 4];
        layer.appendChild(d);
        setTimeout(() => d.remove(), 600);
      }
    },
    dispose() {
      stopHold();
      style.remove(); root.remove();
    },
  };
}

const BEST_KEY = 'bw.bump24.best';
const LOG_KEY = 'bw.bump24.localBoard';

export function loadBest(storeId) {
  try { return Number(JSON.parse(localStorage.getItem(BEST_KEY) || '{}')[storeId] || 0); } catch { return 0; }
}
export function saveBest(storeId, score) {
  try {
    const o = JSON.parse(localStorage.getItem(BEST_KEY) || '{}');
    o[storeId] = Math.max(Number(o[storeId] || 0), score);
    localStorage.setItem(BEST_KEY, JSON.stringify(o));
    return o[storeId];
  } catch { return score; }
}
export function pushLocalBoard(storeId, entry) {
  try {
    const o = JSON.parse(localStorage.getItem(LOG_KEY) || '{}');
    const list = o[storeId] || [];
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    o[storeId] = list.slice(0, 20);
    localStorage.setItem(LOG_KEY, JSON.stringify(o));
    return o[storeId];
  } catch { return [entry]; }
}
export function loadLocalBoard(storeId) {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '{}')[storeId] || []; } catch { return []; }
}
