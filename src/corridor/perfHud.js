// [corridor] ` (Backquote) 키: 성능 오버레이 (fps · draw calls · 삼각형 · 코리더 타일 수). ?perf=1 이면 처음부터 표시.
//   renderer.info 와 long task/LoAF 를 같이 보여, 부트·메뉴·이동 구간을 같은 경로로 비교한다.
export function mountPerfHud({ renderer, corridor, params }) {
  const el = document.createElement('div');
  el.id = 'perf-hud';
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:60;padding:4px 8px;border-radius:8px;background:rgba(0,0,0,.6);color:#d8ffe0;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre;pointer-events:none';
  el.hidden = params?.get('perf') !== '1';
  document.body.appendChild(el);
  let frames = 0, t0 = performance.now();
  const long = { max: 0, last: 0, n: 0, label: '' };
  const onLong = (list) => {
    for (const e of list.getEntries()) {
      const dur = e.duration || 0;
      long.n++;
      long.last = dur;
      if (dur > long.max) {
        long.max = dur;
        long.label = (e.name && e.name !== 'self' && e.name !== 'long-animation-frame')
          ? e.name
          : (e.scripts?.[0]?.invoker || e.scripts?.[0]?.sourceURL || e.entryType || '');
      }
    }
  };
  try {
    const po = new PerformanceObserver(onLong);
    try { po.observe({ type: 'long-animation-frame', buffered: true }); } catch { /* 없는 브라우저 */ }
    try { po.observe({ type: 'longtask', buffered: true }); } catch { /* 없는 브라우저 */ }
  } catch { /* PerformanceObserver 없음 */ }
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
      const programs = renderer.info.programs?.length ?? '?';
      const longLine = long.n
        ? `\nlong ${long.last.toFixed(0)}ms (max ${long.max.toFixed(0)} n=${long.n}${long.label ? ' ' + String(long.label).slice(0, 40) : ''})`
        : '';
      el.textContent = `${fps.toFixed(0)} fps · ${r.calls} draws · ${(r.triangles / 1e6).toFixed(2)}M tris\ngeo ${m.geometries} · tex ${m.textures} · prog ${programs}` + longLine + (c ? `\ncorridor detail ${c.detail} · lod ${c.lod} · queue ${c.queue}` : '');
    },
  };
}
