// [camera] 사진 앱 전체 화면 뷰어 — 사진을 저장된 원본 해상도로 본다.
//   · 화면에 맞춤(기본, 원본보다 크게 늘리지 않음) ↔ 1:1 원본 크기(드래그로 이동) — 버튼 또는 키 1
//   · 여러 장이면 좌우 넘기기: ‹ › 버튼 · ←/→ 키 · 드래그/스와이프, "3 / 7" 위치 표시
//   · 닫기: ✕ 버튼 · Esc
//   · 아래 도구 막대(공유 · 내려받기 · [제보] · 삭제)와 캡션은 보관함에서 쓰던 그대로 (실제 동작은 cameraApp 이 맡는다)
// 메모리: 지금 사진과 양옆 한 장씩만 Blob URL 로 들고, 멀어지면 바로 놓는다. 닫으면 DOM·리스너·URL 전부 해제.
import { ICONS } from './icons.js';
import { isEn, onLangChange } from '../i18n.js';
import { TIP_CAPTION_MAX, cleanCaption } from './newsTip.js';

const SWIPE_PX = 60; // 이만큼 끌면 넘긴다
const SWIPE_FAST = 0.45; // px/ms — 짧게 휙 넘겨도 넘긴다
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (ko, en) => (isEn() ? en : ko);

/**
 * @param {object} o
 * @param {string[]} o.ids        보관함 순서(최신순) 사진 id
 * @param {number}   o.index      처음 볼 사진
 * @param {(id:string)=>Promise<object|null>} o.load   사진 레코드(blob 포함)
 * @param {(rec:object)=>string}  o.meta    "동네 · 날짜" 한 줄
 * @param {(name:string, rec:object, caption:string)=>Promise<{note?:string, err?:boolean, deleted?:boolean}>} o.act
 *        'share' | 'download' | 'tip-send' | 'delete' | 'caption'
 * @param {boolean} [o.newsTip]
 * @param {()=>void} [o.onClose]
 */
export function openPhotoViewer({ ids, index = 0, load, meta, act, newsTip = false, onClose }) {
  ids = ids.slice();
  let i = Math.min(Math.max(0, index), ids.length - 1);
  let actual = false, confirmDel = false, confirmTip = false, busy = false, toastTimer = 0, closed = false;
  const cache = new Map(); // id → { rec, url }

  const root = document.createElement('div');
  root.className = 'pv-root';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="pv-top">
      <span class="pv-count" aria-live="polite"></span><span class="pv-meta"></span>
      <button type="button" class="pv-ic pv-zoom" data-v="zoom"></button>
      <button type="button" class="pv-ic" data-v="close">${ICONS.close}</button>
    </div>
    <div class="pv-stage"><img class="pv-img" alt="" draggable="false" /></div>
    <button type="button" class="pv-nav prev" data-v="prev">${ICONS.back}</button>
    <button type="button" class="pv-nav next" data-v="next">${ICONS.next}</button>
    <div class="pv-bottom"></div>
    <div class="pv-toast" role="status"></div>`;
  document.body.appendChild(root);
  document.body.classList.add('pv-open');
  const $ = (s) => root.querySelector(s);
  const stage = $('.pv-stage'), img = $('.pv-img'), bottom = $('.pv-bottom');

  // ── 사진 불러오기 (지금 ±1 장만 유지) ──
  async function entry(id) {
    let e = cache.get(id);
    if (!e) {
      e = { rec: null, url: '', p: null };
      cache.set(id, e);
      e.p = load(id).then((rec) => { if (rec && !closed && cache.get(id) === e) { e.rec = rec; e.url = URL.createObjectURL(rec.blob); } return e; }).catch(() => e);
    }
    return e.p;
  }
  function trim() {
    const keep = new Set([ids[i - 1], ids[i], ids[i + 1]]);
    for (const [id, e] of cache) if (!keep.has(id)) { if (e.url) URL.revokeObjectURL(e.url); cache.delete(id); }
  }
  const cur = () => cache.get(ids[i])?.rec || null;

  async function show(n, dir = 0) {
    if (!ids.length) { close(); return; }
    commitCaption();
    i = Math.min(Math.max(0, n), ids.length - 1);
    confirmDel = false; confirmTip = false;
    trim();
    const want = ids[i];
    paintChrome();
    const e = await entry(want);
    if (closed || ids[i] !== want) return;
    if (!e.rec) { // 다른 창에서 지워졌으면 목록에서 빼고 다음 장
      ids.splice(i, 1); cache.delete(want); show(i, dir); return;
    }
    img.classList.remove('slide-l', 'slide-r');
    img.style.transform = '';
    img.src = e.url;
    img.width = e.rec.w || 0; img.height = e.rec.h || 0;
    if (dir) { void img.offsetWidth; img.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
    stage.scrollTo(0, 0);
    if (actual) centerActual();
    paintChrome();
    paintBottom();
    // 양옆 미리 받아 두기
    if (ids[i + 1]) entry(ids[i + 1]);
    if (ids[i - 1]) entry(ids[i - 1]);
  }
  const go = (d) => { if (!busy && ids[i + d]) show(i + d, d); };

  // ── 그리기 ──
  function paintChrome() {
    const rec = cur(), n = ids.length;
    root.setAttribute('aria-label', L('사진 보기', 'Photo viewer'));
    $('.pv-count').textContent = n ? `${i + 1} / ${n}` : '';
    $('.pv-meta').textContent = rec ? `${meta(rec)} · ${rec.w}×${rec.h}` : '';
    const z = $('.pv-zoom');
    z.innerHTML = `${actual ? ICONS.fit : ICONS.actual}<span>${actual ? L('맞춤', 'Fit') : '1:1'}</span>`;
    z.title = actual ? L('화면에 맞추기 (1)', 'Fit to screen (1)') : L('원본 크기로 보기 (1)', 'View original size (1)');
    z.setAttribute('aria-pressed', String(actual));
    $('[data-v="close"]').title = L('닫기 (Esc)', 'Close (Esc)');
    const prev = $('[data-v="prev"]'), next = $('[data-v="next"]');
    prev.title = L('이전 사진 (←)', 'Previous photo (←)'); next.title = L('다음 사진 (→)', 'Next photo (→)');
    for (const b of [z, $('[data-v="close"]'), prev, next]) b.setAttribute('aria-label', b.title);
    prev.hidden = next.hidden = n < 2;
    prev.disabled = i <= 0; next.disabled = i >= n - 1;
    root.classList.toggle('is-actual', actual);
  }

  function paintBottom(note = '', err = false) {
    const rec = cur();
    if (!rec) { bottom.innerHTML = ''; return; }
    const en = isEn();
    const prevCap = bottom.querySelector('.pv-caption');
    const cap = prevCap && prevCap.dataset.id === rec.id ? prevCap.value : rec.caption || '';
    bottom.innerHTML = `
      <input class="pv-caption" data-id="${esc(rec.id)}" maxlength="${TIP_CAPTION_MAX}" placeholder="${en ? 'Caption' : '캡션'}" autocomplete="off" value="${esc(cap)}" />
      ${confirmTip ? `<p class="pv-confirm">${en ? 'Send to the news desk with your nickname, number and spot? Operators review tips before anything is featured.' : '닉네임·번호·위치와 함께 뉴스 데스크에 제보할까요? 운영진 검토 후에만 소개돼요.'}</p>
        <div class="pv-tools"><button type="button" data-v="tip-cancel">${en ? 'Cancel' : '취소'}</button><button type="button" class="red" data-v="tip-send">${en ? 'Send' : '보내기'}</button></div>`
      : `<div class="pv-tools">
        <button type="button" data-v="share">${ICONS.share}<em>${en ? 'Share' : '공유'}</em></button>
        <button type="button" data-v="download">${ICONS.download}<em>${en ? 'Download' : '내려받기'}</em></button>
        ${newsTip ? `<button type="button" data-v="tip" ${rec.tipId ? 'disabled' : ''}>${ICONS.tip}<em>${rec.tipId ? (en ? 'Sent' : '제보함') : (en ? 'Tip' : '제보')}</em></button>` : ''}
        <button type="button" class="del${confirmDel ? ' armed' : ''}" data-v="delete">${ICONS.trash}<em>${confirmDel ? (en ? 'Delete?' : '삭제할까요?') : (en ? 'Delete' : '삭제')}</em></button>
      </div>`}
      <p class="pv-note${err ? ' err' : ''}">${err ? esc(note) : ''}</p>`;
    for (const b of bottom.querySelectorAll('button')) noFocus(b);
    if (note && !err) toast(note);
  }

  function toast(text) {
    const t = $('.pv-toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // 캡션: 바뀌었으면 넘기거나 닫거나 도구를 누를 때 저장
  function captionValue() { return cleanCaption(bottom.querySelector('.pv-caption')?.value || ''); }
  function commitCaption() {
    const rec = cur(), input = bottom.querySelector('.pv-caption');
    if (!rec || !input || input.dataset.id !== rec.id) return;
    const c = cleanCaption(input.value);
    if (c === (rec.caption || '')) return;
    rec.caption = c;
    act('caption', rec, c).catch(() => {});
  }

  // ── 도구 ──
  async function tool(name, btn) {
    const rec = cur();
    if (!rec || busy) return;
    if (name === 'tip') { if (newsTip) { confirmTip = true; confirmDel = false; paintBottom(); } return; }
    if (name === 'tip-cancel') { confirmTip = false; paintBottom(); return; }
    if (name === 'delete' && !confirmDel) { confirmDel = true; paintBottom(); return; }
    if (name !== 'delete') confirmDel = false;
    const caption = captionValue();
    if (caption !== (rec.caption || '')) rec.caption = caption;
    busy = true; if (btn) btn.disabled = true;
    try {
      const r = (await act(name, rec, caption)) || {};
      if (closed) return;
      if (name === 'tip-send') confirmTip = false;
      if (r.deleted) {
        const e = cache.get(rec.id); if (e?.url) URL.revokeObjectURL(e.url); cache.delete(rec.id);
        ids.splice(i, 1);
        busy = false;
        if (!ids.length) { close(); return; }
        await show(Math.min(i, ids.length - 1));
        if (r.note) toast(r.note);
        return;
      }
      if (r.tipId) rec.tipId = r.tipId;
      paintBottom(r.note || '', !!r.err);
    } catch {
      if (!closed) paintBottom(L('처리하지 못했어요.', 'Something went wrong.'), true);
    } finally {
      busy = false;
      if (btn?.isConnected) btn.disabled = false;
    }
  }

  // ── 맞춤 ↔ 1:1 ──
  function centerActual() {
    requestAnimationFrame(() => { stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2; stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2; });
  }
  function toggleActual() { actual = !actual; paintChrome(); stage.scrollTo(0, 0); if (actual) centerActual(); }

  // ── 클릭 · 키 · 드래그 ──
  // 뷰어 안을 누른 건 '바깥 클릭'이 아니다 — 뒤에 있는 폰이 닫히지 않게 document 로 올려보내지 않는다.
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  function noFocus(b) { b.addEventListener('mousedown', (e) => e.preventDefault()); }
  root.querySelectorAll('.pv-top button, .pv-nav').forEach(noFocus);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || !root.contains(b)) return;
    const v = b.dataset.v;
    if (v === 'close') close();
    else if (v === 'prev') go(-1);
    else if (v === 'next') go(1);
    else if (v === 'zoom') toggleActual();
    else tool(v, b);
  });
  bottom.addEventListener('focusout', (e) => { if (e.target.classList?.contains('pv-caption')) commitCaption(); });

  function onKey(e) {
    if (closed) return;
    const typing = (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') && root.contains(e.target);
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (typing) { e.target.blur(); root.focus({ preventScroll: true }); } else close();
      return;
    }
    if (typing) {
      // 캡션 입력 중: 글자·방향키는 입력칸 기본 동작만. 게임(Enter=채팅 열기 등)으로는 보내지 않는다.
      e.stopImmediatePropagation();
      if (e.key === 'Enter') { e.preventDefault(); commitCaption(); e.target.blur(); root.focus({ preventScroll: true }); }
      return;
    }
    // 뷰어가 열려 있는 동안 게임 이동·단축키로 새지 않게
    e.stopImmediatePropagation();
    if (e.target?.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return; // 포커스된 버튼은 기본 동작(click)
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === '1') { e.preventDefault(); toggleActual(); }
    else if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
  }
  addEventListener('keydown', onKey, true);

  // 맞춤 모드: 좌우로 끌어 넘기기 · 1:1 모드: 끌어서 둘러보기
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !cur()) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), sl: stage.scrollLeft, st: stage.scrollTop, dx: 0 };
    stage.setPointerCapture(e.pointerId);
    img.classList.remove('slide-l', 'slide-r', 'snap');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (actual) { stage.scrollLeft = drag.sl - dx; stage.scrollTop = drag.st - dy; return; }
    // 끝 장에서는 고무줄처럼 덜 따라오게
    drag.dx = (dx > 0 && i === 0) || (dx < 0 && i === ids.length - 1) ? dx * 0.3 : dx;
    img.style.transform = `translate(calc(-50% + ${drag.dx}px), -50%)`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (actual) return;
    const v = Math.abs(d.dx) / Math.max(1, performance.now() - d.t);
    const dir = d.dx < 0 ? 1 : -1;
    if ((Math.abs(d.dx) > SWIPE_PX || (Math.abs(d.dx) > 20 && v > SWIPE_FAST)) && ids[i + dir]) go(dir);
    else { img.classList.add('snap'); img.style.transform = ''; }
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  const offLang = onLangChange(() => { if (!closed) { paintChrome(); paintBottom(); } });

  function close() {
    if (closed) return;
    commitCaption();
    closed = true;
    removeEventListener('keydown', onKey, true);
    offLang?.();
    clearTimeout(toastTimer);
    for (const e of cache.values()) if (e.url) URL.revokeObjectURL(e.url);
    cache.clear();
    img.removeAttribute('src');
    if (root.contains(document.activeElement)) document.activeElement.blur(); // 게임 키보드로 바로 돌아가게
    root.remove();
    document.body.classList.remove('pv-open');
    onClose?.();
  }

  root.focus({ preventScroll: true });
  show(i);
  return {
    el: root,
    close,
    go,
    toggleActual,
    get index() { return i; },
    get count() { return ids.length; },
    get actual() { return actual; },
    get closed() { return closed; },
  };
}
