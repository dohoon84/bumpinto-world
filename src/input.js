// 키보드(WASD/방향키)와 마우스 드래그 카메라
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.yawDelta = 0; this.pitchDelta = 0; this.zoomDelta = 0;
    this.onKey = null;
    addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      this.keys.add(e.code); this.onKey?.(e);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      this.yawDelta -= (e.clientX - drag.x) * 0.006; this.pitchDelta += (e.clientY - drag.y) * 0.005;
      drag.x = e.clientX; drag.y = e.clientY;
    });
    canvas.addEventListener('pointerup', () => (drag = null));
    canvas.addEventListener('wheel', (e) => { this.zoomDelta += e.deltaY * 0.002; e.preventDefault(); }, { passive: false });
  }
  // 반환: {fx, fz(앞=+), run}
  axes() {
    const k = this.keys; let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1; if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1; if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    return { f: Math.max(-1, Math.min(1, f)), s: Math.max(-1, Math.min(1, s)), run };
  }
  consumeLook() { const r = [this.yawDelta, this.pitchDelta, this.zoomDelta]; this.yawDelta = this.pitchDelta = this.zoomDelta = 0; return r; }
}
