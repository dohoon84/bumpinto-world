// [perf-memory] traffic.js extraCrowd 훅(register/render)을 지연 로드로 감싼다.
//   factory() 가 진짜 extraCrowd(예: createPangyoNpc)를 만든다. load() 전에는 아무 부품도 등록하지 않고(아바타 풀·JSON·라벨 없음),
//   load() 때 만들고 공유 crowd 에 register → crowd.grow(), unload() 때 dispose → crowd.unregister 하고 참조를 버린다(GC 가 회수).
export function lazyExtraCrowd(factory, { onLoad = null, onUnload = null } = {}) {
  let real = null, crowd = null, lists = [];
  const stats0 = { lazy: 'unloaded' };
  const proxyCrowd = () => ({ register: (root) => { const l = crowd.register(root); lists.push(l); return l; } });
  const w = {
    lazy: true, loads: 0, unloads: 0,
    get loaded() { return !!real; },
    get real() { return real; },
    get actors() { return real?.actors || []; },
    get loading() { return real?.loading || Promise.resolve(null); },
    get stats() { return real ? real.stats : stats0; },
    get deck() { return real?.deck || null; },
    get data() { return real?.data || null; },
    get spots() { return real?.spots || { station: [], company: [], food: [] }; },
    register(c) { crowd = c; if (real) real.register(proxyCrowd()); },
    render(c, dt, fx, fz) { if (real) real.render(c, dt, fx, fz); },
    say: (i) => (real ? real.say(i) : false),
    load() {
      if (real) return real.loading;
      real = factory(); w.loads++;
      if (crowd) { real.register(proxyCrowd()); crowd.grow?.(); }
      onLoad?.(real);
      return real.loading;
    },
    unload() {
      if (!real) return;
      try { real.dispose(); } catch (e) { console.warn('[perf-memory] extraCrowd dispose', e); }
      if (crowd) for (const l of lists) crowd.unregister?.(l);
      lists = []; real = null; w.unloads++;
      onUnload?.();
    },
    dispose() { w.unload(); },
  };
  return w;
}
