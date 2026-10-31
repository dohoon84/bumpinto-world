// [memory] ?mem=1 메모리 오버레이 (기본 꺼짐 — 파라미터가 없으면 아무것도 설치하지 않는다).
//   JS heap(크롬 performance.memory) · renderer.info.memory · 업로드된 텍스처/렌더버퍼 추정 MB(GL 호출 장부) ·
//   코리더 타일 수 · 버스 텍스처 캐시/풀. Shift+M 으로 숨김/표시.
const BPP = {
  0x8058: 4, 0x8c43: 4, 0x1908: 4, 0x8051: 3, 0x8c41: 3, 0x1907: 3, 0x8229: 1, 0x1903: 1, 0x822b: 2, 0x8227: 2,
  0x881a: 8, 0x881b: 6, 0x8814: 16, 0x8815: 12, 0x822d: 2, 0x822e: 4, 0x8230: 8, 0x822f: 4,
  0x88f0: 4, 0x81a6: 4, 0x8cac: 4, 0x81a5: 2, 0x1902: 4, 0x84f9: 4, 0x8d48: 1, 0x1909: 1, 0x190a: 2,
};
const bpp = (f) => BPP[f] || 4;
const MB = (b) => (b / 1048576).toFixed(0);

function installLedger(gl) {
  const tex = new Map(), rb = new Map();
  let unit = 0; const bound = new Map(); let boundRb = null;
  const key = (t) => unit + ':' + t;
  const W = (name, fn) => { const o = gl[name]; if (typeof o !== 'function') return; gl[name] = function (...a) { fn.apply(this, a); return o.apply(this, a); }; };
  const cur = (target) => bound.get(key(target === 0x8513 || (target >= 0x8515 && target <= 0x851a) ? 0x8513 : target));
  W('activeTexture', (u) => { unit = u; });
  W('bindTexture', (target, t) => { bound.set(key(target), t); });
  W('deleteTexture', (t) => { tex.delete(t); });
  W('texStorage2D', (target, levels, fmt, w, h) => {
    const t = cur(target); if (!t) return;
    let b = 0; for (let l = 0; l < levels; l++) b += Math.max(1, w >> l) * Math.max(1, h >> l) * bpp(fmt);
    tex.set(t, (target === 0x8513 ? 6 : 1) * b);
  });
  W('texStorage3D', (target, levels, fmt, w, h, d) => {
    const t = cur(target); if (!t) return;
    let b = 0; for (let l = 0; l < levels; l++) b += Math.max(1, w >> l) * Math.max(1, h >> l) * d * bpp(fmt);
    tex.set(t, b);
  });
  W('texImage2D', (target, level, fmt, ...a) => {
    if (level !== 0) return;
    const t = cur(target); if (!t) return;
    let w, h; if (a.length >= 6) { w = a[0]; h = a[1]; } else { const s = a[2]; w = s?.videoWidth || s?.width || 0; h = s?.videoHeight || s?.height || 0; }
    const face = target >= 0x8515 && target <= 0x851a; // 큐브맵 면은 누적
    tex.set(t, (face && target !== 0x8515 ? tex.get(t) || 0 : 0) + w * h * bpp(fmt));
  });
  W('generateMipmap', (target) => { const t = cur(target); if (t && tex.has(t)) tex.set(t, Math.round(tex.get(t) * 4 / 3)); });
  W('bindRenderbuffer', (_t, r) => { boundRb = r; });
  W('deleteRenderbuffer', (r) => { rb.delete(r); });
  W('renderbufferStorage', (_t, fmt, w, h) => { if (boundRb) rb.set(boundRb, w * h * bpp(fmt)); });
  W('renderbufferStorageMultisample', (_t, s, fmt, w, h) => { if (boundRb) rb.set(boundRb, w * h * bpp(fmt) * Math.max(1, s)); });
  const sum = (m) => { let b = 0; for (const v of m.values()) b += v; return b; };
  return { texBytes: () => sum(tex), texCount: () => tex.size, rbBytes: () => sum(rb) };
}

export function mountMemHud({ renderer, params, getCorridor, getExtra }) {
  if (params?.get('mem') !== '1') return { tick() {} };
  const gl = renderer.getContext();
  const led = installLedger(gl);
  const el = document.createElement('div');
  el.id = 'mem-hud';
  el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:60;padding:4px 8px;border-radius:8px;background:rgba(0,0,0,.65);color:#ffe9c8;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre;pointer-events:none';
  document.body.appendChild(el);
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && e.shiftKey && !e.repeat) el.hidden = !el.hidden; });
  let t0 = 0;
  return {
    tick() {
      const now = performance.now();
      if (el.hidden || now - t0 < 1000) return;
      t0 = now;
      const m = renderer.info.memory, pm = performance.memory;
      const dbw = gl.drawingBufferWidth, dbh = gl.drawingBufferHeight;
      const samples = gl.getContextAttributes?.()?.antialias ? 4 : 1;
      const fb = dbw * dbh * 4 * 2 * (samples + 1); // 색+깊이, MSAA + resolve (대략)
      const lines = [
        pm ? `JS heap ${MB(pm.usedJSHeapSize)} / ${MB(pm.totalJSHeapSize)} MB` : 'JS heap n/a',
        `three geo ${m.geometries} · tex ${m.textures}`,
        `GL tex ${led.texCount()} ≈ ${MB(led.texBytes())} MB · rb ≈ ${MB(led.rbBytes())} MB`,
        `canvas ${dbw}×${dbh} ≈ ${MB(fb)} MB (est.)`,
      ];
      const c = getCorridor?.()?.counts?.();
      if (c) lines.push(`tiles detail ${c.detail} · lod ${c.lod} · queue ${c.queue}`);
      const x = getExtra?.(); if (x) lines.push(x);
      el.textContent = lines.join('\n');
    },
  };
}
