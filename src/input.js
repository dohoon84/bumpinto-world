// 키보드(WASD/방향키)와 마우스 드래그 카메라
// [mobile] 모바일 가상 조이스틱·버튼이 채우는 입력. PC 에선 늘 0/false 라 기존 동작 그대로
export const virtualPad = { f: 0, s: 0, run: false, jump: false };
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
    // 한 손가락(마우스) 드래그 = 카메라 회전. [mobile] 두 손가락 = 핀치 줌 (터치를 identifier 별로 따로 본다 →
    // 조이스틱(#m-joy, 캔버스 밖)을 한 손으로 쓰면서 다른 손으로 핀치해도 된다)
    const pts = new Map();
    let drag = null, pinch = 0;
    const pinchDist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
    canvas.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터 */ }
      if (pts.size === 2) { drag = null; pinch = pinchDist(); } else if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    canvas.addEventListener('pointermove', (e) => {
      const pt = pts.get(e.pointerId);
      if (!pt) return;
      pt.x = e.clientX; pt.y = e.clientY;
      if (pts.size >= 2 && pinch) {
        const d = pinchDist();
        this.zoomDelta += pinch / d - 1; // 벌리면 가까이, 오므리면 멀리 (거리 범위는 휠과 같은 곳에서 자른다)
        pinch = d;
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      this.yawDelta -= (e.clientX - drag.x) * 0.006; this.pitchDelta += (e.clientY - drag.y) * 0.005;
      drag.x = e.clientX; drag.y = e.clientY;
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      // 핀치하다 한 손가락만 남으면 그 손가락으로 다시 회전 (튀지 않게 지금 위치부터)
      if (pts.size === 1) { const [[id, q]] = [...pts.entries()]; drag = { x: q.x, y: q.y, id }; } else drag = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { this.zoomDelta += e.deltaY * 0.002; e.preventDefault(); }, { passive: false });
  }
  // 반환: {f, s, run, jump}
  axes() {
    const k = this.keys; let f = 0, s = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1; if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) s += 1; if (k.has('KeyA') || k.has('ArrowLeft')) s -= 1;
    f += virtualPad.f; s += virtualPad.s; // [mobile]
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || virtualPad.run;
    const jump = k.has('Space') || virtualPad.jump;
    return { f: Math.max(-1, Math.min(1, f)), s: Math.max(-1, Math.min(1, s)), run, jump };
  }
  consumeLook() { const r = [this.yawDelta, this.pitchDelta, this.zoomDelta]; this.yawDelta = this.pitchDelta = this.zoomDelta = 0; return r; }
}
