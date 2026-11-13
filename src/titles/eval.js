// 아틀라스 키프레임을 시각 t(ms)의 쿼드 목록으로 풀어 준다. three 없음.
import { easeAt, lerpNum, lerpPair } from './easing.js';

const has = (k, prop) => k && k[prop] !== undefined;

function clonePair(v, d = 0) {
  if (Array.isArray(v)) return [Number(v[0]) || 0, Number(v[1]) || 0];
  if (v == null) return [d, d];
  const n = Number(v);
  return [n, n];
}

function keysWith(keys, prop) {
  const out = [];
  for (const k of keys) if (has(k, prop)) out.push(k);
  return out;
}

// 속성마다 그 속성을 가진 키끼리만 보간. 도착 키의 ease(없으면 linear).
// ease === 'step' 이면 도착 시각 전까지 이전 값을 유지하고, 도착하면 바로 바꿈.
export function interpProp(keys, t, prop, fallback, { easeScale = false } = {}) {
  const ks = keysWith(keys, prop);
  if (!ks.length) return fallback;
  if (t < ks[0].t) return undefined; // 이 속성의 첫 키 이전 — 호출 쪽에서 기본값을 씀
  if (t >= ks[ks.length - 1].t) {
    const last = ks[ks.length - 1][prop];
    return Array.isArray(last) ? clonePair(last) : last;
  }
  let a = ks[0], b = ks[1];
  for (let i = 0; i < ks.length - 1; i++) {
    if (t >= ks[i].t && t < ks[i + 1].t) { a = ks[i]; b = ks[i + 1]; break; }
  }
  const easeName = (easeScale && prop === 'scale' && b.easeScale) ? b.easeScale : (b.ease || 'linear');
  if (easeName === 'step') {
    const v = a[prop];
    return Array.isArray(v) ? clonePair(v) : v;
  }
  const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
  const e = easeAt(easeName, u);
  if (prop === 'alpha') return lerpNum(Number(a.alpha), Number(b.alpha), e);
  return lerpPair(a[prop], b[prop], e);
}

function evalKeys(keys, t, base = {}) {
  if (!keys?.length) return null;
  const t0 = keys[0].t;
  if (t < t0) return null; // 첫 키 이전에는 그리지 않음
  const pos = interpProp(keys, t, 'pos', clonePair(base.pos || [0, 0])) ?? clonePair(base.pos || [0, 0]);
  const dpos = interpProp(keys, t, 'dpos', [0, 0]);
  const scale = interpProp(keys, t, 'scale', clonePair(base.scale || [1, 1]), { easeScale: true }) ?? clonePair(base.scale || [1, 1]);
  let alpha = interpProp(keys, t, 'alpha', base.alpha ?? 1);
  if (alpha === undefined) alpha = base.alpha ?? 1;
  const dx = Array.isArray(dpos) ? dpos[0] : 0;
  const dy = Array.isArray(dpos) ? dpos[1] : 0;
  return {
    pos: [pos[0] + dx, pos[1] + dy],
    scale: Array.isArray(scale) ? scale : [scale, scale],
    alpha: Number(alpha),
  };
}

function evalLoop(quad, nowMs, phaseMs) {
  const loop = quad.loop;
  if (!loop?.periodMs || !loop.keys?.length) {
    return { pos: clonePair(quad.pos), scale: clonePair(quad.scale || [1, 1]), alpha: quad.alpha ?? 1, sprite: quad.sprite, layer: quad.layer, id: quad.id };
  }
  const period = loop.periodMs;
  const phase = (loop.phaseMs || 0) + (phaseMs || 0);
  let t = (nowMs + phase) % period;
  if (t < 0) t += period;
  const ev = evalKeys(loop.keys, t, quad);
  if (!ev) {
    return { pos: clonePair(quad.pos), scale: clonePair(quad.scale || [1, 1]), alpha: quad.alpha ?? 1, sprite: quad.sprite, layer: quad.layer, id: quad.id };
  }
  return { ...ev, sprite: quad.sprite, layer: quad.layer, id: quad.id };
}

const LITE_IDS = new Set(['pill', 'medal']);
const LOOP_FX = new Set(['shine', 'spark0', 'spark1']);

export function langPack(atlas, titleId, lang = 'ko') {
  const t = atlas?.titles?.[titleId];
  if (!t) return null;
  return t.lang?.[lang] || t.lang?.ko || null;
}

/**
 * @param {'rest'|'restLite'|'earn'|'reduced'} mode
 * @param {number} t  연출 시작 후 ms (rest 는 절대 시각)
 * @param {number} phase 사람마다 다른 루프 위상
 */
export function composeTitle(pack, mode, t, { phase = 0, reducedRest = false } = {}) {
  if (!pack) return [];
  const rest = pack.rest?.quads || [];
  if (mode === 'restLite') {
    return rest.filter((q) => LITE_IDS.has(q.id)).map((q) => ({
      id: q.id, sprite: q.sprite, layer: q.layer,
      pos: clonePair(q.pos), scale: clonePair(q.scale || [1, 1]), alpha: q.alpha ?? 1,
    }));
  }
  if (mode === 'rest') {
    const out = [];
    for (const q of rest) {
      if (reducedRest && LOOP_FX.has(q.id)) continue;
      if (reducedRest) {
        out.push({ id: q.id, sprite: q.sprite, layer: q.layer, pos: clonePair(q.pos), scale: clonePair(q.scale || [1, 1]), alpha: q.alpha ?? 1 });
      } else {
        out.push(evalLoop(q, t, phase));
      }
    }
    return out.filter((q) => (q.alpha ?? 1) > 0.001);
  }
  const packAnim = mode === 'reduced' ? pack.earnReducedMotion : pack.earn;
  if (!packAnim) return composeTitle(pack, 'rest', t, { phase, reducedRest });
  const duration = packAnim.durationMs || 0;
  if (t >= duration) return composeTitle(pack, 'rest', t, { phase, reducedRest: mode === 'reduced' || reducedRest });

  const byId = new Map(rest.map((q) => [q.id, q]));
  const hiddenUntil = new Set(pack.earn?.hiddenUntilLoopStart || []);
  const loopStart = pack.earn?.loopStartMs || {};
  const overrides = new Map();
  const extras = [];
  for (const tr of packAnim.tracks || []) {
    if (tr.override) overrides.set(tr.id, tr);
    else extras.push(tr);
  }

  const out = [];
  for (const q of rest) {
    const ov = overrides.get(q.id);
    if (ov) {
      const ev = evalKeys(ov.keys, t, q);
      if (ev) out.push({ id: q.id, sprite: ov.sprite || q.sprite, layer: ov.layer ?? q.layer, ...ev });
      continue;
    }
    if (hiddenUntil.has(q.id) || loopStart[q.id] != null) {
      const start = loopStart[q.id] ?? 0;
      if (t < start) continue;
      if (reducedRest && LOOP_FX.has(q.id)) continue;
      out.push(evalLoop(q, t - start, 0));
      continue;
    }
    out.push({ id: q.id, sprite: q.sprite, layer: q.layer, pos: clonePair(q.pos), scale: clonePair(q.scale || [1, 1]), alpha: q.alpha ?? 1 });
  }
  for (const tr of extras) {
    const ev = evalKeys(tr.keys, t, { pos: [0, 0], scale: [1, 1], alpha: 1 });
    if (ev) out.push({ id: tr.id, sprite: tr.sprite, layer: tr.layer, ...ev });
  }
  return out.filter((q) => (q.alpha ?? 1) > 0.001);
}

export function sortQuads(quads) {
  const layerOf = (q) => (q.layer == null ? 0 : q.layer);
  return quads.slice().sort((a, b) => layerOf(a) - layerOf(b));
}

export function sfxCues(pack, reduced) {
  const anim = reduced ? pack?.earnReducedMotion : pack?.earn;
  return anim?.sfx || [];
}

export function earnDuration(pack, reduced) {
  const anim = reduced ? pack?.earnReducedMotion : pack?.earn;
  return anim?.durationMs || 0;
}

export function restQuadCount(pack) { return pack?.rest?.quadCount || (pack?.rest?.quads || []).length; }
