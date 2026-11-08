// HTML 오버레이: 이름표, 말풍선, 지명 라벨을 3D 위치에 맞춰 화면에 투영
import * as THREE from 'three';
import { isShoutText } from './emotes.js';
const v = new THREE.Vector3();

export class Overlay {
  constructor(root, camera) { this.root = root; this.camera = camera; this.items = new Set(); this.zone = ''; this.homeCamera = camera; }
  // [zone] 실내 구역(지하철 대합실 등)에 들어가면 그 구역 항목만 그 구역 카메라로 투영. '' = 바깥(원래 카메라)
  setView(zone = '', camera = null) { this.zone = zone || ''; this.camera = camera || this.homeCamera; }
  add({ cls, text = '', getPos, maxDist = 90, minDist = 0, zone = '' }) {
    const el = document.createElement('div'); el.className = cls; el.textContent = text;
    this.root.appendChild(el);
    const item = { el, getPos, maxDist, minDist, visible: true, hidden: false, zone };
    this.items.add(item); return item;
  }
  remove(item) { item.el.remove(); this.items.delete(item); }
  update(w, h) {
    const cam = this.camera;
    // [mobile] 가로 폰: 지명·정류장 라벨을 덜 멀리까지, 위쪽 HUD 줄(상단 ~104px) 뒤로는 숨기고, 서로 겹치면 가까운 것만
    const mob = typeof document !== 'undefined' && document.body.classList.contains('mobile');
    const cand = mob ? [] : null;
    for (const it of this.items) {
      if (it.hidden || (it.zone || '') !== this.zone) { // [zone] 다른 구역 항목은 숨김
        if (it.visible) { it.el.style.display = 'none'; it.visible = false; }
        continue;
      }
      const p = it.getPos();
      const d = p ? cam.position.distanceTo(p) : Infinity;
      const kind = it.kind ??= (/^bubble/.test(it.el.className) ? 0 : /^tag/.test(it.el.className) ? 1 : 2); // 0 말풍선 · 1 이름표 · 2 지명 라벨
      const maxD = mob && kind === 2 ? it.maxDist * (/landmark|station/.test(it.el.className) ? 0.8 : 0.55) : it.maxDist;
      let show = p && d < maxD && d >= it.minDist;
      if (show) { v.copy(p).project(cam); show = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2; }
      let x = 0, y = 0;
      if (show) { x = ((v.x + 1) / 2) * w; y = ((1 - v.y) / 2) * h; }
      if (show && mob && kind) {
        if (y < 104) show = false; // 상단 HUD 두 줄 뒤
        else cand.push({ it, d, x, y, kind });
        if (cand.length && cand[cand.length - 1].it === it) continue; // 겹침 검사 뒤에 그린다
      }
      if (show !== it.visible) { it.el.style.display = show ? '' : 'none'; it.visible = show; }
      if (show) it.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    }
    if (!mob) return;
    // 이름표(사람) 먼저, 그다음 가까운 순서. 이미 놓인 것과 겹치면 숨김
    cand.sort((a, b) => a.kind - b.kind || a.d - b.d);
    const placed = [], now = performance.now();
    for (const c of cand) {
      const it = c.it;
      if (!it.visible) { it.el.style.display = ''; it.visible = true; it.mt = 0; }
      if (!it.mt || now - it.mt > 1500) { it.w = it.el.offsetWidth || 40; it.h = it.el.offsetHeight || 16; it.mt = now; }
      const r = { l: c.x - it.w / 2 - 2, r: c.x + it.w / 2 + 2, t: c.y - it.h - 2, b: c.y + 2 };
      const hit = placed.some((q) => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t);
      if (hit && c.kind === 2) { it.el.style.display = 'none'; it.visible = false; continue; }
      placed.push(r);
      it.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -100%)`;
    }
  }
}
// 말풍선 헬퍼: 일정 시간 동안 텍스트 표시
export class Bubble {
  constructor(overlay, cls, getPos, meta = {}) {
    this.overlay = overlay;
    this.cls = cls;
    this.getPos = getPos;
    this.meta = meta;
    this.item = overlay.add({ cls: 'bubble ' + cls, getPos, maxDist: 70 });
    this.item.hidden = true;
    this.until = 0;
  }
  say(text, ms = 4500) {
    const shout = (this.cls === 'me' || this.cls === 'remote') && isShoutText(text);
    this.item.el.textContent = text;
    this.item.el.classList.toggle('shouting', shout);
    this.item.hidden = false;
    this.until = performance.now() + ms;
    this.overlay.onSay?.({ cls: this.cls, text, shout, pos: this.getPos?.(), meta: this.meta });
  }
  tick() { if (!this.item.hidden && performance.now() > this.until) this.item.hidden = true; }
  get showing() { return !this.item.hidden; }
}
