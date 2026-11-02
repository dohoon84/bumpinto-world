// [camera] 카메라 뷰파인더 + 촬영 확인(캡션·저장·뉴스 제보·내려받기·공유) + 폰 속 사진 보관함.
// 이 파일은 사용자가 처음 카메라/사진 앱을 열 때만 동적 로드된다.
// 성능 원칙: 뷰파인더는 게임 캔버스 위에 얹은 DOM 뿐(추가 렌더 패스·렌더 타깃 없음).
// 셔터 때만 한 번 더 그려 2D 캔버스로 복사하고, 쓰고 난 캔버스·Blob URL·AudioContext 는 닫을 때 모두 놓는다.
import './camera.css';
import { isEn, tr, onLangChange } from '../i18n.js';
import { captureScene, composeExport, downloadBlob, shareOrDownload, fileName, playShutter } from './media.js';
import { MAX_PHOTOS, addPhoto, listPhotos, getPhoto, updatePhoto, deletePhoto, newPhotoId, closeStore } from './photoStore.js';
import { ICONS } from './icons.js';
import { sendNewsTip, tipErrorText, cleanCaption, TIP_CAPTION_MAX } from './newsTip.js';

const ZOOMS = [0.5, 1, 2, 3];
const MODES = [
  { id: 'square', ko: '정방형', en: 'SQUARE', aspect: 1 },
  { id: 'photo', ko: '사진', en: 'PHOTO', aspect: 4 / 3 },
  { id: 'wide', ko: '와이드', en: 'WIDE', aspect: 16 / 9 },
];
const SITE_URL = 'https://bumpinto.world';
const TOP_BAR = 56;
const BOTTOM_BAR = 168;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = (ko, en) => tr(ko, en);

function fmtWhen(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function createCameraApp({ handset, renderer, scene, camera, cam, sms, getInfo, newsTip = false }) {
  let root = null; // 뷰파인더 DOM (열려 있을 때만 존재)
  let zoom = 1;
  let mode = 'photo';
  let grid = false;
  let baseFov = camera.fov;
  let audio = null;
  let busy = false;
  let review = null; // { blob, thumb, w, h, takenAt, info, url, savedId, tipId }
  let lastThumbUrl = '';
  let offLang = null;
  let toastTimer = 0;

  const info = () => { try { return getInfo?.() || {}; } catch { return {}; } };
  const placeLabel = (i = info()) => (isEn() ? i.regionEnName || i.regionName || '' : i.regionName || '');
  const shortPlace = (i) => placeLabel(i).replace(/\s*\(.*\)\s*$/, '');

  // ───────── 뷰파인더 ─────────
  function frameRect() {
    const W = innerWidth, H = innerHeight;
    const availH = Math.max(80, H - TOP_BAR - BOTTOM_BAR);
    const a = MODES.find((m) => m.id === mode)?.aspect || 4 / 3;
    let w = W, h = W / a;
    if (h > availH) { h = availH; w = h * a; }
    return { x: (W - w) / 2, y: TOP_BAR + (availH - h) / 2, w, h };
  }

  function layout() {
    if (!root) return;
    const r = frameRect();
    const f = root.querySelector('.cam-frame');
    Object.assign(f.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    root.querySelector('.cam-zoom').style.top = `${r.y + r.h - 58}px`;
  }

  function applyZoom(z) {
    zoom = z;
    const half = (baseFov * Math.PI) / 360;
    camera.fov = (Math.atan(Math.tan(half) / z) * 360) / Math.PI;
    camera.updateProjectionMatrix();
    root?.querySelectorAll('.cam-zoom button').forEach((b) => b.classList.toggle('on', Number(b.dataset.z) === z));
  }

  function zoomLabel(z, on) {
    const t = z < 1 ? '.5' : String(z);
    return on ? `${t}×` : t;
  }

  function paintChrome() {
    if (!root) return;
    const en = isEn();
    root.querySelector('.cam-title').innerHTML = `<i class="cam-rec"></i>${en ? 'Camera' : '카메라'}`;
    root.querySelector('.cam-hint').textContent = L('Space 촬영 · 드래그로 구도 · 휠로 거리 · Esc 닫기', 'Space to shoot · drag to frame · wheel to dolly · Esc to close');
    root.querySelector('[data-c="grid"]').title = L('격자', 'Grid');
    root.querySelector('[data-c="close"]').title = L('닫기 (Esc)', 'Close (Esc)');
    root.querySelector('[data-c="flip"]').title = L('반대편에서 보기 (셀카)', 'Flip view (selfie)');
    root.querySelector('[data-c="library"]').title = L('사진 보관함', 'Photo library');
    root.querySelector('[data-c="shoot"]').title = L('촬영 (Space)', 'Take photo (Space)');
    root.querySelector('.cam-modes').innerHTML = MODES.map((m) => `<button type="button" data-m="${m.id}" class="${m.id === mode ? 'on' : ''}">${en ? m.en : m.ko}</button>`).join('');
    root.querySelector('.cam-zoom').innerHTML = ZOOMS.map((z) => `<button type="button" data-z="${z}" class="${z === zoom ? 'on' : ''}">${zoomLabel(z, z === zoom)}</button>`).join('');
    if (review) paintReview();
  }

  async function refreshThumb() {
    if (!root) return;
    const el = root.querySelector('.cam-thumb');
    try {
      const list = await listPhotos();
      if (!root) return;
      if (lastThumbUrl) URL.revokeObjectURL(lastThumbUrl);
      lastThumbUrl = list[0]?.thumb ? URL.createObjectURL(list[0].thumb) : '';
      el.style.backgroundImage = lastThumbUrl ? `url("${lastThumbUrl}")` : '';
      el.classList.toggle('empty', !lastThumbUrl);
    } catch {
      el.classList.add('empty');
    }
  }

  function toast(text, ms = 2600) {
    const t = root?.querySelector('.cam-toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function onKey(e) {
    if (!root) return;
    const tag = document.activeElement?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';
    if (e.code === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (review) closeReview(); else closeViewfinder();
      return;
    }
    if (typing) return;
    if (review) { e.stopImmediatePropagation(); return; } // 확인 화면에서는 게임 단축키·이동을 막는다
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) shoot();
    }
  }
  const onResize = () => layout();

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || !root?.contains(b)) return;
    if (b.dataset.m) { mode = b.dataset.m; paintChrome(); layout(); return; }
    if (b.dataset.z) { applyZoom(Number(b.dataset.z)); paintChrome(); return; }
    if (b.dataset.r) { reviewAction(b.dataset.r, b); return; }
    switch (b.dataset.c) {
      case 'close': closeViewfinder(); break;
      case 'shoot': shoot(); break;
      case 'grid': grid = !grid; root.classList.toggle('grid-on', grid); b.classList.toggle('on', grid); break;
      case 'flip': if (cam) cam.yaw += Math.PI; break;
      case 'library': closeViewfinder(); handset.openApp('photos'); break;
      default: break;
    }
    b.blur();
  }

  function openViewfinder() {
    if (root) return;
    if (document.body.classList.contains('in-gate') || document.body.classList.contains('in-lobby')) return;
    baseFov = camera.fov;
    zoom = 1;
    root = document.createElement('div');
    root.className = 'cam-root';
    root.innerHTML = `
      <div class="cam-frame"><div class="cam-grid"></div></div>
      <div class="cam-top"><button type="button" class="cam-ic" data-c="grid">${ICONS.grid}</button><span class="cam-title"></span><button type="button" class="cam-ic" data-c="close">${ICONS.close}</button></div>
      <div class="cam-hint"></div>
      <div class="cam-zoom"></div>
      <div class="cam-bottom">
        <div class="cam-modes"></div>
        <button type="button" class="cam-thumb empty" data-c="library"></button>
        <button type="button" class="cam-shutter" data-c="shoot"><i></i></button>
        <button type="button" class="cam-flip" data-c="flip">${ICONS.flip}</button>
      </div>
      <div class="cam-flash"></div>
      <div class="cam-review" hidden></div>
      <div class="cam-toast" role="status"></div>`;
    document.body.appendChild(root);
    document.body.classList.add('cam-mode');
    root.addEventListener('click', onClick);
    addEventListener('keydown', onKey, true);
    addEventListener('resize', onResize);
    offLang = onLangChange(() => paintChrome());
    paintChrome();
    layout();
    refreshThumb();
  }

  function closeViewfinder() {
    if (!root) return;
    closeReview();
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    offLang?.(); offLang = null;
    clearTimeout(toastTimer);
    root.removeEventListener('click', onClick);
    root.remove();
    root = null;
    document.body.classList.remove('cam-mode');
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    zoom = 1;
    if (lastThumbUrl) { URL.revokeObjectURL(lastThumbUrl); lastThumbUrl = ''; }
    if (audio) { audio.close().catch(() => {}); audio = null; }
    if (!photos) closeStore();
  }

  async function shoot() {
    if (!root || busy || review) return;
    busy = true;
    try {
      if (!audio) { const AC = window.AudioContext || window.webkitAudioContext; audio = AC ? new AC() : null; }
      playShutter(audio);
      const fl = root.querySelector('.cam-flash');
      fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
      const shot = await captureScene({ renderer, scene, camera, rect: frameRect() });
      if (!root) return;
      openReview({ ...shot, takenAt: Date.now(), info: info() });
    } catch (err) {
      console.warn('[camera] capture failed', err);
      toast(L('촬영하지 못했어요.', 'Could not take the photo.'));
    } finally {
      busy = false;
    }
  }

  // ───────── 촬영 확인(캡션·저장·제보·내려받기·공유) ─────────
  function openReview(shot) {
    review = { ...shot, url: URL.createObjectURL(shot.blob), savedId: '', tipId: 0, caption: '', confirmTip: false };
    paintReview();
    const box = root.querySelector('.cam-review');
    box.hidden = false;
    setTimeout(() => box.querySelector('.cr-caption')?.focus(), 380);
  }

  function closeReview() {
    if (!review) return;
    URL.revokeObjectURL(review.url);
    review = null;
    const box = root?.querySelector('.cam-review');
    if (box) { box.hidden = true; box.innerHTML = ''; }
  }

  function paintReview(note = '', err = false) {
    const box = root?.querySelector('.cam-review');
    if (!box || !review) return;
    const en = isEn();
    const r = review;
    const prev = box.querySelector('.cr-caption');
    if (prev) r.caption = prev.value;
    const where = `${shortPlace(r.info)} · ${fmtWhen(r.takenAt)}`;
    box.innerHTML = `<div class="cr-card">
      <div class="cr-head"><button type="button" data-r="retake">${ICONS.back}${r.savedId || r.tipId ? (en ? 'Camera' : '카메라') : (en ? 'Retake' : '다시 찍기')}</button><b>${en ? 'Photo' : '사진'}</b><button type="button" data-r="done">${en ? 'Done' : '완료'}</button></div>
      <div class="cr-photo"><img src="${r.url}" alt="" /></div>
      <p class="cr-meta">${esc(where)} · ${r.w}×${r.h}</p>
      <label class="cr-cap"><input class="cr-caption" maxlength="${TIP_CAPTION_MAX}" placeholder="${en ? 'Add a caption…' : '캡션을 달아 보세요…'}" autocomplete="off" value="${esc(r.caption)}" /><small class="cr-count">${r.caption.length}/${TIP_CAPTION_MAX}</small></label>
      ${r.confirmTip ? `<div class="cr-confirm">
        <p>${en
          ? 'Send this photo and caption to the in-game news desk? Your nickname, phone number, neighborhood and spot go with it. Tips are reviewed by the operators and may be featured in game news — nothing is published automatically.'
          : '이 사진과 캡션을 게임 뉴스 데스크에 제보할까요? 닉네임·전화번호·동네·위치가 함께 전송됩니다. 운영진이 검토한 뒤 게임 뉴스에 소개될 수 있으며, 자동으로 게시되지는 않아요.'}</p>
        <div class="cr-row"><button type="button" class="cr-btn" data-r="tip-cancel">${en ? 'Cancel' : '취소'}</button><button type="button" class="cr-btn red" data-r="tip-send">${en ? 'Send tip' : '제보 보내기'}</button></div>
      </div>` : `<div class="cr-row cr-actions">
        <button type="button" class="cr-btn blue" data-r="save" ${r.savedId ? 'disabled' : ''}>${r.savedId ? ICONS.check : ICONS.save}<span>${r.savedId ? (en ? 'Saved' : '저장됨') : (en ? 'Save' : '저장')}</span></button>
        <button type="button" class="cr-btn" data-r="download">${ICONS.download}<span>${en ? 'Download' : '내려받기'}</span></button>
        <button type="button" class="cr-btn" data-r="share">${ICONS.share}<span>${en ? 'Share' : '공유'}</span></button>
        ${newsTip ? `<button type="button" class="cr-btn red" data-r="tip" ${r.tipId ? 'disabled' : ''}>${r.tipId ? ICONS.check : ICONS.tip}<span>${r.tipId ? (en ? 'Tip sent' : '제보함') : (en ? 'News tip' : '뉴스 제보')}</span></button>` : ''}
      </div>`}
      <p class="cr-note${err ? ' err' : ''}">${esc(note)}</p>
    </div>`;
    const input = box.querySelector('.cr-caption');
    input.addEventListener('input', () => { r.caption = input.value; box.querySelector('.cr-count').textContent = `${input.value.length}/${TIP_CAPTION_MAX}`; });
  }

  function currentCaption() {
    const v = root?.querySelector('.cr-caption')?.value;
    if (review && v != null) review.caption = v;
    return cleanCaption(review?.caption || '');
  }

  async function exportBlob(blob, caption, rec) {
    return composeExport(blob, { caption, sub: `${shortPlace(rec)} · ${fmtWhen(rec.takenAt)}` });
  }

  async function reviewAction(name, btn) {
    if (!review) return;
    const r = review;
    const caption = currentCaption();
    if (name === 'retake') { closeReview(); return; }
    if (name === 'done') { closeReview(); closeViewfinder(); return; }
    if (name === 'tip') { if (!newsTip) return; r.confirmTip = true; paintReview(); return; }
    if (name === 'tip-cancel') { r.confirmTip = false; paintReview(); return; }
    btn.disabled = true;
    try {
      if (name === 'save') {
        const id = newPhotoId();
        await addPhoto({ id, blob: r.blob, thumb: r.thumb, w: r.w, h: r.h, caption, takenAt: r.takenAt, region: r.info.region || '', regionName: r.info.regionName || '', regionEnName: r.info.regionEnName || '', x: r.info.x, z: r.info.z, tipId: r.tipId || 0 });
        if (review !== r) return;
        r.savedId = id;
        paintReview(); toast(L('사진 앱에 저장했어요.', 'Saved to Photos.'));
        refreshThumb();
      } else if (name === 'tip-send') {
        const { tipId } = await sendNewsTip({ sms, blob: r.blob, caption, takenAt: r.takenAt, info: r.info });
        if (review !== r) return;
        r.tipId = tipId || 1;
        r.confirmTip = false;
        if (r.savedId) await updatePhoto(r.savedId, { tipId: r.tipId, caption });
        paintReview(); toast(L('제보를 보냈어요. 운영진 검토 후 소개될 수 있어요.', 'Tip sent. The operators will review it.'));
      } else if (name === 'download') {
        const out = await exportBlob(r.blob, caption, { ...r.info, takenAt: r.takenAt });
        downloadBlob(out, fileName(r.takenAt));
        paintReview(); toast(L('내려받았어요. SNS에 올려 보세요!', 'Downloaded — share it on social media!'));
      } else if (name === 'share') {
        const out = await exportBlob(r.blob, caption, { ...r.info, takenAt: r.takenAt });
        const how = await shareOrDownload(out, fileName(r.takenAt), shareText(caption));
        if (how !== 'cancelled') toast(how === 'shared' ? L('공유했어요.', 'Shared.') : L('이 브라우저는 바로 공유를 지원하지 않아 내려받았어요.', 'Sharing is not supported here, so the photo was downloaded.'));
      }
    } catch (err) {
      const code = err?.code || '';
      let msg;
      if (code === 'album_full') msg = L(`사진은 ${MAX_PHOTOS}장까지 보관돼요. 사진 앱에서 지우거나 내려받은 뒤 다시 저장해 주세요.`, `Photos holds up to ${MAX_PHOTOS} pictures. Delete or download some first.`);
      else if (name === 'tip-send') { msg = tipErrorText(code); if (code === 'empty') r.confirmTip = false; }
      else msg = L('처리하지 못했어요.', 'Something went wrong.');
      if (review === r) paintReview(msg, true);
    } finally {
      if (btn.isConnected) btn.disabled = false;
    }
  }

  function shareText(caption) {
    return {
      title: 'Bumpinto World',
      text: `${caption ? `${caption} ` : ''}#BumpintoWorld`,
      url: SITE_URL,
    };
  }

  // ───────── 폰 속 사진 보관함 ─────────
  let photos = null; // { pane, view: 'grid'|'detail', id, urls: [], observer }

  function releasePhotoUrls() {
    if (!photos) return;
    for (const u of photos.urls) URL.revokeObjectURL(u);
    photos.urls = [];
  }

  function detachPhotos() {
    if (!photos) return;
    releasePhotoUrls();
    photos.observer?.disconnect();
    document.querySelector('#handset .ph-toast')?.remove();
    clearTimeout(phToastTimer);
    photos = null;
    if (!root) closeStore();
  }

  function mountPhotos(pane) {
    detachPhotos();
    if (!pane?.isConnected) return;
    const host = pane.parentElement;
    photos = { pane, view: 'grid', id: '', urls: [], observer: null, confirmDel: false };
    // 폰이 다른 화면을 그리면(pane 교체) Blob URL 을 바로 놓는다.
    photos.observer = new MutationObserver(() => { if (photos && !photos.pane.isConnected) detachPhotos(); });
    photos.observer.observe(host, { childList: true });
    paintGrid();
  }

  function phRoot() { return photos?.pane.querySelector('.ph-root'); }

  async function paintGrid(note = '') {
    const p = photos;
    if (!p) return;
    p.view = 'grid'; p.id = ''; p.confirmDel = false;
    let list = [];
    try { list = await listPhotos(); } catch { list = null; }
    if (photos !== p || !p.pane.isConnected) return;
    releasePhotoUrls();
    const en = isEn();
    const el = phRoot();
    if (!el) return;
    if (!list) { el.innerHTML = `<p class="hint">${en ? 'Photo storage is not available in this browser.' : '이 브라우저에서는 사진을 보관할 수 없어요.'}</p>`; return; }
    const cells = list.map((m) => {
      const u = URL.createObjectURL(m.thumb); p.urls.push(u);
      return `<button type="button" class="ph-cell" data-xact="ph-open" data-id="${esc(m.id)}" style="background-image:url('${u}')">${m.tipId && newsTip ? `<i class="ph-tip">${ICONS.check}</i>` : ''}</button>`;
    }).join('');
    el.innerHTML = `<div class="ph-bar"><span>${en ? 'Library' : '보관함'}</span><small>${list.length}/${MAX_PHOTOS}</small><button type="button" class="ph-camera" data-xact="ph-camera">${en ? 'Camera' : '카메라'}</button></div>
      ${list.length ? `<div class="ph-grid">${cells}</div>` : `<p class="hint">${en ? 'No photos yet. Open Camera and press the shutter (Space).' : '아직 사진이 없어요. 카메라를 열고 셔터(Space)를 눌러 보세요.'}</p>`}
`;
    if (note) phToast(note);
  }

  // 사진 앱 상태 문구: 폰 화면 아래쪽에 잠깐 떴다 사라지는 작은 알림
  let phToastTimer = 0;
  function phToast(text) {
    const host = photos?.pane?.closest('#handset');
    if (!host) return;
    let t = host.querySelector('.ph-toast');
    if (!t) { t = document.createElement('div'); t.className = 'ph-toast'; t.setAttribute('role', 'status'); host.appendChild(t); }
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(phToastTimer);
    phToastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function paintDetail(id, note = '', err = false) {
    const p = photos;
    if (!p) return;
    let rec = null;
    try { rec = await getPhoto(id); } catch { rec = null; }
    if (photos !== p || !p.pane.isConnected) return;
    if (!rec) { paintGrid(); return; }
    releasePhotoUrls();
    const keepCaption = p.view === 'detail' && p.id === id ? phRoot()?.querySelector('.ph-caption')?.value : null;
    p.view = 'detail'; p.id = id;
    const en = isEn();
    const u = URL.createObjectURL(rec.blob); p.urls.push(u);
    const where = `${(en ? rec.regionEnName || rec.regionName : rec.regionName || '').replace(/\s*\(.*\)\s*$/, '')} · ${fmtWhen(rec.takenAt)}`;
    phRoot().innerHTML = `<div class="ph-bar"><button type="button" class="ph-back" data-xact="ph-back">${ICONS.back}${en ? 'Library' : '보관함'}</button></div>
      <div class="ph-photo"><img src="${u}" alt="" /></div>
      <p class="ph-meta">${esc(where)}${rec.tipId && newsTip ? ` · <b>${en ? 'Tip sent' : '제보함'}</b>` : ''}</p>
      <input class="ph-caption" maxlength="${TIP_CAPTION_MAX}" placeholder="${en ? 'Caption' : '캡션'}" autocomplete="off" value="${esc(keepCaption ?? rec.caption ?? '')}" />
      ${p.confirmTip ? `<p class="ph-confirm">${en ? 'Send to the news desk with your nickname, number and spot? Operators review tips before anything is featured.' : '닉네임·번호·위치와 함께 뉴스 데스크에 제보할까요? 운영진 검토 후에만 소개돼요.'}</p>
        <div class="ph-tools"><button type="button" data-xact="ph-tip-cancel">${en ? 'Cancel' : '취소'}</button><button type="button" class="red" data-xact="ph-tip-send">${en ? 'Send' : '보내기'}</button></div>` : `<div class="ph-tools${newsTip ? ' four' : ''}">
        <button type="button" data-xact="ph-share">${ICONS.share}<em>${en ? 'Share' : '공유'}</em></button>
        <button type="button" data-xact="ph-download">${ICONS.download}<em>${en ? 'Download' : '내려받기'}</em></button>
        ${newsTip ? `<button type="button" data-xact="ph-tip" ${rec.tipId ? 'disabled' : ''}>${ICONS.tip}<em>${rec.tipId ? (en ? 'Sent' : '제보함') : (en ? 'Tip' : '제보')}</em></button>` : ''}
        <button type="button" class="del${p.confirmDel ? ' armed' : ''}" data-xact="ph-delete">${ICONS.trash}<em>${p.confirmDel ? (en ? 'Delete?' : '삭제할까요?') : (en ? 'Delete' : '삭제')}</em></button>
      </div>`}
      ${err && note ? `<p class="hint ph-note err">${esc(note)}</p>` : ''}`;
    if (note && !err) phToast(note);
  }

  async function photosAction(name, el) {
    const p = photos;
    if (!p) return;
    const en = isEn();
    if (name === 'ph-open') { p.confirmDel = false; p.confirmTip = false; paintDetail(el.dataset.id); return; }
    if (name === 'ph-back') { paintGrid(); return; }
    if (name === 'ph-camera') { setTimeout(() => { handset.close(); openViewfinder(); }, 0); return; } // 폰 클릭 처리가 끝난 뒤 닫기
    const id = p.id;
    if (!id) return;
    const caption = cleanCaption(phRoot()?.querySelector('.ph-caption')?.value || '');
    if (name === 'ph-tip') { if (!newsTip) return; p.confirmTip = true; p.confirmDel = false; paintDetail(id); return; }
    if (name === 'ph-tip-cancel') { p.confirmTip = false; paintDetail(id); return; }
    if (name === 'ph-delete' && !p.confirmDel) { p.confirmDel = true; paintDetail(id); return; }
    if (name !== 'ph-delete') p.confirmDel = false;
    el.disabled = true;
    try {
      const rec = await getPhoto(id);
      if (!rec) { paintGrid(); return; }
      if (caption !== (rec.caption || '')) await updatePhoto(id, { caption });
      if (name === 'ph-delete') {
        await deletePhoto(id);
        paintGrid(en ? 'Deleted.' : '삭제했어요.');
      } else if (name === 'ph-download' || name === 'ph-share') {
        const out = await exportBlob(rec.blob, caption, { region: rec.region, regionName: rec.regionName, regionEnName: rec.regionEnName, takenAt: rec.takenAt });
        if (name === 'ph-download') { downloadBlob(out, fileName(rec.takenAt)); paintDetail(id, en ? 'Downloaded.' : '내려받았어요.'); }
        else {
          const how = await shareOrDownload(out, fileName(rec.takenAt), shareText(caption));
          if (how !== 'cancelled') paintDetail(id, how === 'shared' ? (en ? 'Shared.' : '공유했어요.') : (en ? 'Sharing unsupported — downloaded instead.' : '바로 공유가 안 돼 내려받았어요.'));
        }
      } else if (name === 'ph-tip-send') {
        p.confirmTip = false;
        const { tipId } = await sendNewsTip({ sms, blob: rec.blob, caption, takenAt: rec.takenAt, info: { region: rec.region, x: rec.x, z: rec.z } });
        await updatePhoto(id, { tipId: tipId || 1 });
        paintDetail(id, en ? 'Tip sent. Operators will review it.' : '제보를 보냈어요. 운영진이 검토해요.');
      }
    } catch (err) {
      if (photos === p) paintDetail(id, name.startsWith('ph-tip') ? tipErrorText(err?.code) : (en ? 'Something went wrong.' : '처리하지 못했어요.'), true);
    }
  }

  return {
    get isOpen() { return Boolean(root); },
    openViewfinder,
    closeViewfinder,
    mountPhotos,
    photosAction,
    // 테스트용
    shoot,
    get review() { return review; },
  };
}
