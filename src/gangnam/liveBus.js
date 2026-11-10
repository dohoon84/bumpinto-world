// [livebus] 강남 정류장 실시간 도착 + BRT 버스를 ETA 에 맞춰 운행
//   기본 켬, ?livebus=0 이면 시간표 근사·시뮬 배차만 쓴다.
//   인증키는 여기 없다 — phone worker GET /bus/arrivals?stop=ARS (secret SEOUL_BUS_KEY).
export function formatEta(etaSec) {
  if (etaSec == null) return '';
  if (etaSec < 60) return '곧 도착';
  return `${Math.round(etaSec / 60)}분 후`;
}

export const LIVEBUS_POLL_SEC = 30;
export const LIVEBUS_FOCUS_R = 700;
export const LIVEBUS_MAX_ETA = 1200;
export const LIVEBUS_VAVG = 0.6;

export function liveBusEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search || '');
  return q.get('livebus') !== '0';
}

export const PHONE_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PHONE_URL) || 'https://jeongja-phone.xn0texn073.workers.dev';

export const BRT_ARS = Object.freeze(['22009', '22010', '22011', '22012', '22014']);
export const EXPRESS_ARS = Object.freeze({
  '강남역5번출구': '22654',
  '신논현역.유화빌딩': '22408',
});

export function boardText(arrivals, n = 5) {
  const rows = (arrivals || []).filter((a) => a && a.ref && a.etaSec != null).slice(0, n);
  if (!rows.length) return '';
  return `🚏 ${rows.map((a) => `${a.ref} ${a.msg || formatEta(a.etaSec)}`).join(' · ')}`;
}

export function agedArrivals(data, now = Date.now()) {
  if (!data?.ok || !Array.isArray(data.arrivals)) return null;
  if (now - (data.fetchedAt || now) > 180000) return null; // 3분 넘은 값은 버린다
  const el = Math.max(0, (now - (data.fetchedAt || now)) / 1000);
  return data.arrivals.map((a) => {
    const etaSec = a.etaSec == null ? null : Math.max(0, a.etaSec - el);
    const second = a.second && a.second.etaSec != null
      ? { ...a.second, etaSec: Math.max(0, a.second.etaSec - el), msg: formatEta(Math.max(0, a.second.etaSec - el)) }
      : a.second;
    return { ...a, etaSec, msg: etaSec == null ? (a.msg || '') : formatEta(etaSec), second };
  }).sort((a, b) => (a.etaSec ?? 1e9) - (b.etaSec ?? 1e9));
}

// 정류장 idx 에 eta 초 뒤 도착하려면 지금 경로 위 어디(s)에 있어야 하나
export function upstreamS(P, idx, eta, vAvg = (P.vmax || 11) * LIVEBUS_VAVG, dwell = 15) {
  let t = Math.max(0, eta), s = P.stops[idx].s;
  for (let k = idx - 1; k >= 0; k--) {
    const seg = (s - P.stops[k].s) / vAvg;
    if (seg >= t) return s - t * vAvg;
    t -= seg + dwell; s = P.stops[k].s;
    if (t <= 0) return s;
  }
  return s - t * vAvg;
}

export const LIVEBUS_ATSTOP_SEC = 25;

// 곧 도착(약 25초 안)은 정류장 바로 앞에 세워 안내판과 버스가 맞물린다.
// syncLive 의 atStop 판정은 |s-stop.s|<25 라서, ETA×평균속력만 쓰면 80m 밖에서 지나간다.
export function livePlacement(P, idx, eta, vAvg = (P.vmax || 11) * LIVEBUS_VAVG) {
  const stopS = P.stops[idx].s;
  let s = upstreamS(P, idx, eta, vAvg);
  const atStop = eta < LIVEBUS_ATSTOP_SEC;
  if (atStop) s = Math.max(0, stopS - 6);
  return { s, atStop };
}

export function typeOfArrival(a) {
  return a?.type || (/^M\d/.test(a?.ref) ? 'M' : /^\d{4}/.test(a?.ref) ? 'express' : 'seat');
}

export function createLiveBusFeed({
  base = PHONE_BASE,
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  enabled = true,
} = {}) {
  const cache = new Map(); // ars -> { data, at, error, p }
  const known = new Map(); // ars -> { ref, x, z }
  let timer = 0, inflight = false, focus = null, version = 0;
  const stats = { polls: 0, ok: 0, fail: 0, live: false };

  function register(stops) {
    for (const s of stops || []) {
      const ars = String(s.ref || s.arsId || '');
      if (!ars) continue;
      known.set(ars, { ref: ars, x: s.x, z: s.z });
    }
  }

  function arrivals(ars, t = now()) {
    const c = cache.get(String(ars));
    if (!c?.data) return null;
    return agedArrivals(c.data, t);
  }
  function raw(ars) { return cache.get(String(ars))?.data || null; }

  async function fetchStop(ars) {
    const prev = cache.get(ars) || {};
    if (prev.p) return prev.p;
    prev.at = now();
    cache.set(ars, prev);
    prev.p = (async () => {
      stats.polls++;
      try {
        const r = await fetchImpl(`${String(base).replace(/\/$/, '')}/bus/arrivals?stop=${encodeURIComponent(ars)}`);
        const data = r.ok ? await r.json() : null;
        if (data?.ok && Array.isArray(data.arrivals)) {
          prev.data = data; prev.error = null; stats.ok++; stats.live = true; version++;
        } else {
          prev.error = data?.reason || `http ${r.status}`; stats.fail++;
          if (!prev.data) stats.live = [...cache.values()].some((c) => c.data?.ok);
        }
      } catch (e) {
        prev.error = String(e?.message || e); stats.fail++;
      } finally { prev.p = null; }
    })();
    return prev.p;
  }

  async function poll(nearby) {
    if (!enabled || !base || inflight) return;
    const due = nearby.filter((ars) => {
      const c = cache.get(ars);
      return !c || (now() - (c.at || 0) > LIVEBUS_POLL_SEC * 1000 - 50);
    });
    if (!due.length) return;
    inflight = true;
    try { await Promise.all(due.map((ars) => fetchStop(ars))); }
    finally { inflight = false; }
  }

  function nearbyStops(stops, x, z) {
    return (stops || [])
      .map((s) => ({ ars: String(s.ref || s.arsId || ''), x: s.x, z: s.z, d: Math.hypot((s.x || 0) - x, (s.z || 0) - z) }))
      .filter((s) => s.ars && s.d < LIVEBUS_FOCUS_R)
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
      .map((s) => s.ars);
  }

  // SimulatedBusSource 경로에 실시간 버스를 올려 ETA 시각에 정류장에 닿게 한다
  function syncBrt(sim, brt, t = now()) {
    if (!sim?.syncLive || !brt) return { live: false, n: 0 };
    const stopByRef = new Map((brt.stops || []).map((s) => [String(s.ref), s]));
    const items = [];
    const livePaths = new Set();
    for (const [ars, c] of cache) {
      const list = agedArrivals(c.data, t);
      const st = stopByRef.get(String(ars));
      if (!st || !list) continue;
      for (const a of list) {
        if (a.etaSec == null || a.etaSec > LIVEBUS_MAX_ETA) continue;
        const waves = [{ eta: a.etaSec, veh: a.vehId || '', n: 1 }];
        if (a.second && a.second.etaSec != null && a.second.etaSec <= LIVEBUS_MAX_ETA) {
          waves.push({ eta: a.second.etaSec, veh: a.second.vehId || '', n: 2 });
        }
        for (const w of waves) {
          const P = ensurePath(sim, a.ref, st.id, typeOfArrival(a), w.eta);
          if (!P) continue;
          const idx = P.stops.findIndex((x) => x.stop === st.id);
          if (idx < 0) continue;
          const pose = livePlacement(P, idx, w.eta);
          if (pose.s < 0) continue;
          livePaths.add(P);
          items.push({ id: `L${a.ref}:${w.veh || w.n}:${ars}`, P, s: pose.s, atStop: pose.atStop });
        }
      }
    }
    if (!items.length) return { live: stats.live, n: 0 };
    sim.livePaths = livePaths;
    sim.syncLive(items, livePaths);
    return { live: true, n: items.length };
  }

  return {
    get version() { return version; },
    get stats() { return stats; },
    arrivals, raw, board: (ars, t) => boardText(arrivals(ars, t)),
    register, fetchStop, inject(ars, data) { cache.set(String(ars), { data, at: now(), error: null }); stats.live = !!data?.ok; version++; },
    nearbyStops, syncBrt,
    tick(dt, pos, stops) {
      if (!enabled) return;
      if (stops) register(stops);
      if (pos) focus = pos;
      timer -= dt;
      if (timer > 0 || !focus) return;
      timer = LIVEBUS_POLL_SEC;
      const near = nearbyStops([...known.values()], focus.x, focus.z);
      if (near.length) poll(near);
    },
    release(sim) {
      if (sim?.releaseLive) { sim.livePaths = null; sim.releaseLive(); }
    },
  };
}

function ensurePath(sim, ref, stopId, type, eta = 0) {
  const hits = sim.paths.filter((p) => p.ref === ref && p.stops.some((s) => s.stop === stopId));
  if (hits.length) {
    const scored = hits.map((P) => {
      const idx = P.stops.findIndex((s) => s.stop === stopId);
      return { P, on: upstreamS(P, idx, eta) >= 0, room: P.stops[idx].s };
    });
    const pick = (scored.some((x) => x.on) ? scored.filter((x) => x.on) : scored)
      .sort((a, b) => b.room - a.room)[0];
    return pick.P;
  }
  const tmpl = sim.paths.find((p) => p.stops.some((s) => s.stop === stopId));
  if (!tmpl) return null;
  const dir = String(tmpl.id).split('-').pop();
  const P = Object.assign({}, tmpl, {
    id: `brt-${ref}-${dir}`,
    route: `brt-${ref}`,
    ref: String(ref),
    type: type || tmpl.type,
    name: tmpl.name,
  });
  if (type === 'express' || type === 'M') P.vmax = Math.max(P.vmax || 11, 12);
  sim.paths.push(P);
  if (sim.routes && !sim.routes.has(P.route)) sim.routes.set(P.route, { id: P.route, ref: P.ref, type: P.type, name: P.name });
  return P;
}
