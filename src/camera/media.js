// [camera] 캡처·인코딩·내보내기·셔터음. 모든 캔버스는 쓰고 나면 0×0 으로 줄여 바로 놓아준다.
export const MAX_EDGE = 1280; // 보관함 원본 긴 변
export const THUMB_EDGE = 240; // 썸네일 긴 변
export const TIP_EDGE = 960; // 뉴스 제보 전송본 긴 변
export const TIP_MAX_BYTES = 280 * 1024; // 서버 상한(300KB)보다 조금 작게
const JPEG_Q = 0.86;

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')];
}

function release(c) {
  if (c) { c.width = 0; c.height = 0; }
}

function toBlob(c, type = 'image/jpeg', q = JPEG_Q) {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), type, q));
}

function fit(w, h, edge) {
  const s = Math.min(1, edge / Math.max(w, h));
  return [Math.round(w * s), Math.round(h * s)];
}

/**
 * 지금 장면을 한 번 더 그리고(preserveDrawingBuffer 없이도 같은 태스크 안에서는 버퍼가 살아 있다)
 * rect(CSS px) 부분만 잘라 JPEG 원본·썸네일 Blob 으로 만든다. 추가 렌더 타깃은 만들지 않는다.
 */
export async function captureScene({ renderer, scene, camera, rect }) {
  const src = renderer.domElement;
  const k = src.width / src.clientWidth || 1;
  const sx = Math.max(0, Math.round(rect.x * k)), sy = Math.max(0, Math.round(rect.y * k));
  const sw = Math.min(src.width - sx, Math.round(rect.w * k)), sh = Math.min(src.height - sy, Math.round(rect.h * k));
  const [w, h] = fit(sw, sh, MAX_EDGE);
  const [c, g] = canvas2d(w, h);
  renderer.render(scene, camera);
  g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  try {
    const [tw, th] = fit(w, h, THUMB_EDGE);
    const [t, tg] = canvas2d(tw, th);
    tg.imageSmoothingQuality = 'high';
    tg.drawImage(c, 0, 0, tw, th);
    const [blob, thumb] = await Promise.all([toBlob(c), toBlob(t, 'image/jpeg', 0.72)]);
    release(t);
    return { blob, thumb, w, h };
  } finally {
    release(c);
  }
}

async function decode(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function wrapLines(g, text, maxW, maxLines) {
  const lines = [];
  let cur = '';
  const fits = (str) => g.measureText(str).width <= maxW;
  for (const word of String(text).trim().split(/\s+/)) {
    const cand = cur ? `${cur} ${word}` : word;
    if (fits(cand)) { cur = cand; continue; }
    if (cur) { lines.push(cur); cur = ''; }
    if (fits(word)) { cur = word; continue; }
    for (const ch of word) { if (fits(cur + ch)) cur += ch; else { lines.push(cur); cur = ch; } } // 띄어쓰기 없는 긴 문장
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`; }
  return lines;
}

// [photo-cloud] 다른 PC 에서 받은 원본으로 보관함 썸네일을 만든다(촬영 때와 같은 크기·품질).
export async function makeThumb(blob) {
  const bmp = await createImageBitmap(blob);
  try {
    const [tw, th] = fit(bmp.width, bmp.height, THUMB_EDGE);
    const [t, tg] = canvas2d(tw, th);
    tg.imageSmoothingQuality = 'high';
    tg.drawImage(bmp, 0, 0, tw, th);
    try { return await toBlob(t, 'image/jpeg', 0.72); } finally { release(t); }
  } finally {
    bmp.close?.();
  }
}

/** 내려받기·공유용: 캡션 띠 + 작은 게임 워터마크를 합성한 JPEG. */
export async function composeExport(blob, { caption = '', watermark = 'Bumpinto World', sub = '' } = {}) {
  const bmp = await decode(blob);
  const W = bmp.width, H = bmp.height;
  const [c, g] = canvas2d(W, H);
  try {
    g.drawImage(bmp, 0, 0);
    bmp.close?.();
    const u = Math.max(12, Math.round(Math.min(W, H) / 40));
    const font = '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';
    if (caption) {
      g.font = `700 ${Math.round(u * 1.5)}px ${font}`;
      const lines = wrapLines(g, caption, W - u * 4, 3);
      const lh = Math.round(u * 2);
      const band = lines.length * lh + u * 3.2;
      const grad = g.createLinearGradient(0, H - band - u * 2, 0, H);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.35, 'rgba(0,0,0,.45)');
      grad.addColorStop(1, 'rgba(0,0,0,.66)');
      g.fillStyle = grad;
      g.fillRect(0, H - band - u * 2, W, band + u * 2);
      g.fillStyle = '#fff';
      g.textBaseline = 'alphabetic';
      lines.forEach((ln, i) => g.fillText(ln, u * 2, H - band + u * 1.6 + lh * (i + 0.7)));
    }
    g.font = `800 ${Math.round(u * 0.95)}px ${font}`;
    const mark = sub ? `${watermark} · ${sub}` : watermark;
    const mw = g.measureText(mark).width;
    const px = W - mw - u * 1.6, py = u * 1.2;
    g.fillStyle = 'rgba(0,0,0,.38)';
    const r = u * 0.6, bx = px - u * 0.7, by = py - u * 0.2, bw = mw + u * 1.4, bh = u * 1.7;
    g.beginPath();
    g.roundRect ? g.roundRect(bx, by, bw, bh, r) : g.rect(bx, by, bw, bh);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.textBaseline = 'top';
    g.fillText(mark, px, py + u * 0.18);
    return await toBlob(c, 'image/jpeg', 0.9);
  } finally {
    release(c);
  }
}

/** 뉴스 제보 전송본: 긴 변 TIP_EDGE, 크기 상한 아래로 질을 낮춰 가며 맞춘다. → base64(접두어 없음) */
export async function encodeTip(blob) {
  const bmp = await decode(blob);
  const [w, h] = fit(bmp.width, bmp.height, TIP_EDGE);
  const [c, g] = canvas2d(w, h);
  try {
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    let out = null;
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      out = await toBlob(c, 'image/jpeg', q);
      if (out.size <= TIP_MAX_BYTES) break;
    }
    if (!out || out.size > TIP_MAX_BYTES) throw Object.assign(new Error('too_big'), { code: 'too_big' });
    const buf = new Uint8Array(await out.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { image: btoa(bin), w, h, bytes: out.size };
  } finally {
    release(c);
  }
}

export function fileName(takenAt) {
  const d = new Date(takenAt || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `bumpinto-world-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Web Share(파일) 가능하면 공유 시트, 아니면 내려받기. 반환: 'shared' | 'downloaded' | 'cancelled' */
export async function shareOrDownload(blob, name, { title = '', text = '', url = '' } = {}) {
  let file = null;
  try { file = new File([blob], name, { type: 'image/jpeg' }); } catch { file = null; }
  if (file && typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text: url ? `${text}\n${url}`.trim() : text });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // 그 밖의 실패(권한·미지원 형식)는 내려받기로
    }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}

/** 저작권 없는 합성 셔터음: 짧은 노이즈 두 번(찰-칵). 컨텍스트는 호출 쪽이 닫는다. */
export function playShutter(ac) {
  if (!ac) return;
  try {
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime + 0.005;
    const len = Math.floor(ac.sampleRate * 0.06);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const hit = (at, freq, gain) => {
      const src = ac.createBufferSource();
      src.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 1.4;
      const g = ac.createGain();
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
      src.connect(bp).connect(g).connect(ac.destination);
      src.start(at);
      src.stop(at + 0.07);
    };
    hit(t0, 3200, 0.55);
    hit(t0 + 0.085, 1900, 0.45);
  } catch { /* 소리는 없어도 촬영은 된다 */ }
}
