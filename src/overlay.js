// HTML 오버레이: 이름표, 말풍선, 지명 라벨을 3D 위치에 맞춰 화면에 투영
import * as THREE from 'three';
import { isShoutText } from './emotes.js';
const v = new THREE.Vector3();

export class Overlay {
  constructor(root, camera) { this.root = root; this.camera = camera; this.items = new Set(); }
  add({ cls, text = '', getPos, maxDist = 90, minDist = 0 }) {
    const el = document.createElement('div'); el.className = cls; el.textContent = text;
    this.root.appendChild(el);
    const item = { el, getPos, maxDist, minDist, visible: true, hidden: false };
    this.items.add(item); return item;
  }
  remove(item) { item.el.remove(); this.items.delete(item); }
  update(w, h) {
    const cam = this.camera;
    for (const it of this.items) {
      const p = it.getPos();
      const d = p ? cam.position.distanceTo(p) : Infinity;
      let show = !it.hidden && p && d < it.maxDist && d >= it.minDist;
      if (show) { v.copy(p).project(cam); show = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2; }
      if (show !== it.visible) { it.el.style.display = show ? '' : 'none'; it.visible = show; }
      if (show) it.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
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
