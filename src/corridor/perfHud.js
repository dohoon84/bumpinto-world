// [corridor] ` (Backquote) 키: 성능 오버레이 (fps · draw calls · 삼각형 · 코리더 타일 수). ?perf=1 이면 처음부터 표시.
export function mountPerfHud({ renderer, corridor, params }) {
  const el = document.createElement('div');
  el.id = 'perf-hud';
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:60;padding:4px 8px;border-radius:8px;background:rgba(0,0,0,.6);color:#d8ffe0;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre;pointer-events:none';
  el.hidden = params?.get('perf') !== '1';
  document.body.appendChild(el);
  let frames = 0, t0 = performance.now();
  addEventListener('keydown', (e) => {
    if (e.code !== 'Backquote' || e.repeat) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    el.hidden = !el.hidden;
  });
  return {
    tick() {
      frames++;
      const now = performance.now();
      if (el.hidden || now - t0 < 500) return;
      const fps = (frames * 1000) / (now - t0); frames = 0; t0 = now;
      const r = renderer.info.render, m = renderer.info.memory, c = corridor?.counts();
      el.textContent = `${fps.toFixed(0)} fps · ${r.calls} draws · ${(r.triangles / 1e6).toFixed(2)}M tris\ngeo ${m.geometries} · tex ${m.textures}` + (c ? `\ncorridor detail ${c.detail} · lod ${c.lod} · queue ${c.queue}` : '');
    },
  };
}
