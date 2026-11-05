// [snowpile] 지면·도로·녹지 재질 색만 lerp 해 눈이 쌓인 것처럼 보이게 한다.
//   기본 꺼짐. ?snowpile=1|=ramp 이면 눈이 올 때 쌓이고 그치면 녹음(미리보기용 빠른 램프).
//   ?snowpile=0.5 처럼 0 < v < 1 이면 그 비율로 고정(스크린샷용). ?snowpile=full 은 고정 1.0.
//   새 텍스처·메시·onBeforeCompile 없음. Starbase 는 스킵.
import * as THREE from 'three';

const GROUND_SNOW = new THREE.Color('#eef3f8');
const ROAD_SNOW = new THREE.Color('#cfd6de');
const PARK_SNOW = new THREE.Color('#eef4f9');
const PLAZA_SNOW = new THREE.Color('#eef2f6');

const SNOW_OF = {
  ground: GROUND_SNOW,
  road: ROAD_SNOW,
  park: PARK_SNOW,
  plaza: PLAZA_SNOW,
  sidewalk: GROUND_SNOW,
};

// 미리보기: 눈이면 ~2.5초에 가득, 그치면 ~12초에 녹음
const ACCUM_PER_S = 0.4;
const MELT_PER_S = 0.08;

function parseOpt(search = typeof location !== 'undefined' ? location.search : '') {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  if (!q.has('snowpile')) return { enabled: false, force: null, ramp: false };
  const raw = (q.get('snowpile') ?? '').trim().toLowerCase();
  if (raw === '' || raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes'
      || raw === 'ramp' || raw === 'auto' || raw === 'live') {
    // ?snowpile / =1 / =ramp → 눈올 때 쌓임(미리보기 빠른 램프). 고정값은 0<v<1 또는 =full
    return { enabled: true, force: null, ramp: true };
  }
  if (raw === 'full' || raw === 'max') {
    return { enabled: true, force: 1, ramp: false };
  }
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') {
    return { enabled: false, force: null, ramp: false };
  }
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n <= 0) return { enabled: false, force: null, ramp: false };
    return { enabled: true, force: Math.min(1, n), ramp: false };
  }
  return { enabled: false, force: null, ramp: false };
}

function targetColor(kind) {
  return SNOW_OF[kind] || GROUND_SNOW;
}

/** @param {{ mat: THREE.Material, kind: string }[]} entries */
function bindEntries(entries) {
  const out = [];
  const seen = new Set();
  for (const e of entries || []) {
    const m = e?.mat;
    if (!m?.color || seen.has(m)) continue;
    if (m.vertexColors) continue; // 지붕·수로 채널 등
    seen.add(m);
    out.push({
      mat: m,
      kind: e.kind || m.userData?.snowPile || 'ground',
      base: m.color.clone(),
    });
  }
  return out;
}

function collectFromScene(scene, into) {
  if (!scene) return into;
  const seen = new Set(into.map((x) => x.mat));
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const kind = m?.userData?.snowPile;
      if (!kind || !m.color || m.vertexColors || seen.has(m)) continue;
      seen.add(m);
      into.push({ mat: m, kind, base: m.color.clone() });
    }
  });
  return into;
}

/**
 * @param {{ world, scene, region, params, getPrecipKind: () => string }} opts
 */
export function mountSnowPile({ world, scene, region, params, getPrecipKind }) {
  const opt = parseOpt(params || (typeof location !== 'undefined' ? location.search : ''));
  if (!opt.enabled) {
    return { enabled: false, amount: 0, update() {}, entries: [], opt };
  }
  if (region?.id === 'starbase') {
    return { enabled: false, amount: 0, update() {}, entries: [], opt, skipped: 'starbase' };
  }

  let entries = bindEntries(world?.snowPileEntries || []);
  // 광장 분수 패드 등 world 밖에서 태깅된 재질
  entries = collectFromScene(scene, entries);

  let amount = opt.force != null ? opt.force : 0;
  const tmp = new THREE.Color();

  function apply(a) {
    const t = Math.max(0, Math.min(1, a));
    for (const e of entries) {
      tmp.copy(e.base).lerp(targetColor(e.kind), t);
      e.mat.color.copy(tmp);
    }
  }

  apply(amount);

  function update(dt) {
    if (!entries.length) return amount;
    if (opt.force != null) {
      if (amount !== opt.force) {
        amount = opt.force;
        apply(amount);
      }
      return amount;
    }
    // ramp 모드
    const kind = getPrecipKind?.() || 'clear';
    const snowing = kind === 'snow';
    const next = snowing
      ? Math.min(1, amount + (dt || 0) * ACCUM_PER_S)
      : Math.max(0, amount - (dt || 0) * MELT_PER_S);
    if (Math.abs(next - amount) > 1e-4) {
      amount = next;
      apply(amount);
    }
    return amount;
  }

  return {
    enabled: true,
    get amount() { return amount; },
    entries,
    opt,
    update,
    setAmount(a) { amount = Math.max(0, Math.min(1, a)); apply(amount); },
  };
}

export { parseOpt as parseSnowPileOpt, GROUND_SNOW, ROAD_SNOW };
