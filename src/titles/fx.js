// [titles] 전설(과 이벤트) 발밑 오라. 가까운 사람만, 모바일은 잔상 없이 한 겹.
const NEAR = 14;

export function createTitleFx({ overlay, enabled, mobile }) {
  if (!enabled || !overlay) return { tick() {} };
  const cap = mobile ? 1 : 3;
  const ghosts = mobile ? 1 : 3;
  const pool = [];
  function make() {
    const parts = [];
    const pos = [null, null, null];
    for (let i = 0; i < ghosts; i++) {
      const item = overlay.add({
        cls: i ? 'tb-aura is-ghost' : 'tb-aura',
        getPos: () => pos[i],
        maxDist: 18,
      });
      parts.push(item);
    }
    return { parts, pos, hist: [] };
  }
  function hide(slot) {
    for (let i = 0; i < slot.pos.length; i++) slot.pos[i] = null;
    for (const item of slot.parts) item.hidden = true;
  }
  return {
    tick(list) {
      const want = (list || []).filter((p) => p && (p.grade === 'legendary' || p.grade === 'event')).slice(0, cap);
      while (pool.length < want.length) pool.push(make());
      for (let i = 0; i < pool.length; i++) {
        const slot = pool[i];
        const p = want[i];
        if (!p) { hide(slot); continue; }
        const here = { x: p.x, y: (p.y || 0) + 0.08, z: p.z };
        slot.hist.push(here);
        if (slot.hist.length > 10) slot.hist.shift();
        const grade = p.grade;
        for (let g = 0; g < slot.parts.length; g++) {
          const item = slot.parts[g];
          const lag = slot.hist[Math.max(0, slot.hist.length - 1 - g * 3)] || here;
          slot.pos[g] = (mobile && g > 0) ? null : { x: lag.x, y: lag.y, z: lag.z };
          item.hidden = !slot.pos[g];
          item.el.className = `tb-aura g-${grade}${g ? ' is-ghost' : ''}`;
        }
      }
    },
    near: NEAR,
  };
}
