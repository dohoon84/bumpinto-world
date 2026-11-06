// [tancheon-amenities] 순수 로직·좌표 (three/DOM 없음 — 노드 테스트용)
export const SASONG_JUNC = { x: 1102.2, z: -5149.7 };
export const DOG_PARK = { x0: 862, x1: 900, z0: -6040, z1: -5935 };
export const TC_STAIRS = [
  {
    id: 'tc-stairs-yeosu-e',
    osm: false,
    river: '탄천',
    name: '여수동 탄천 계단',
    // 동측 제방: 도로(쪽 x↑) → 둔치(쪽 x↓, FLOOR -6)
    top: [908, -5975],
    bottom: [872, -5975],
    flight: [[908, -5975, 0], [872, -5975, -6]],
    steps: 40,
    riser: 0.15,
    tread: 0.9,
    w: 3.2,
    run: 36,
  },
];
export const LT_CYCLE = 72;
export const BRIDGE_DIR = (() => {
  const dx = 1230.1 - 1116.8, dz = -5216.1 - -5157.8, L = Math.hypot(dx, dz) || 1;
  return [dx / L, dz / L];
})();
export const ROAD_DIR = (() => {
  const dx = 990.0 - 1194.1, dz = -5356.8 - -4974.0, L = Math.hypot(dx, dz) || 1;
  return [dx / L, dz / L];
})();

export function tcStairsEnabled(search = '') {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tcstairs') !== '0';
}
export function dogParkEnabled(search = '') {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('dogpark') !== '0';
}
export function ltPhaseEnabled(search = '') {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('ltphase') !== '0';
}

export function withTancheonStairs(T, search) {
  if (!T || !tcStairsEnabled(search ?? '')) return T;
  const extra = TC_STAIRS.map((s) => ({ ...s, flight: s.flight.map((p) => p.slice()) }));
  return { ...T, stairs: (T.stairs || []).concat(extra) };
}

export function vehiclePhase(approach, now, offset = 0) {
  const t = ((now + offset) % LT_CYCLE + LT_CYCLE) % LT_CYCLE;
  if (t < 16) return approach === 'ne' || approach === 'sw' ? 'green' : 'red';
  if (t < 20) return approach === 'ne' || approach === 'sw' ? 'yellow' : 'red';
  if (t < 32) return approach === 'ne' ? 'left' : 'red';
  if (t < 36) return approach === 'ne' ? 'yellow' : 'red';
  if (t < 50) return approach === 'br' ? 'green' : 'red';
  if (t < 54) return approach === 'br' ? 'yellow' : 'red';
  return 'red';
}

export function pedPhase(now, offset = 0) {
  const t = ((now + offset) % LT_CYCLE + LT_CYCLE) % LT_CYCLE;
  if (t >= 54 && t < 70) return t < 68 ? 'green' : 'blink';
  return 'red';
}

export function vehicleAllowed(c, headingX, headingZ) {
  if (!c?.vehSig) return true;
  const ph = vehiclePhase(c.approach, c._now?.() ?? 0, c._off ?? 0);
  if (ph === 'red' || ph === 'yellow') return false;
  if (ph === 'green') {
    if (c.approach === 'ne' && c.leftOnly) return false;
    return true;
  }
  if (ph === 'left') {
    if (c.approach !== 'ne') return false;
    const [lx, lz] = BRIDGE_DIR;
    return headingX * lx + headingZ * lz > 0.35;
  }
  return false;
}

export function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}
