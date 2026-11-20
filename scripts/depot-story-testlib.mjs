// [depot-story] 10~14일차 테스트 공용: 대본 경로 걷기 · 참조 검사 · 소리 검사 · THREE 소품 메시/삼각형 세기. DOM 없음.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CUES from '../src/depot/story/data/audio-cues.json' with { type: 'json' };

export const idx = readFileSync(new URL('../src/depot/story/index.js', import.meta.url), 'utf8');
const sfxSrc = readFileSync(new URL('../src/depot/story/sfx.js', import.meta.url), 'utf8');
const syn = new Set([...sfxSrc.matchAll(/^\s+'([\w.-]+)': \[\[/gm)].map((m) => m[1]));
const moods = new Set([...sfxSrc.matchAll(/^\s+'(bgm\.[\w-]+)': \{ bpm/gm)].map((m) => m[1]));
export const haveSfx = (n) => (CUES.existing?.audioPlay || []).includes(n) || syn.has(n);

export const refs = (b) => [b.next, b.resume, b.onMissed, b.onCheckout, b.default, ...(b.choices || []).map((c) => c.goto), ...Object.values(b.cases || {}), ...(b.ranges || []).map((r) => r.goto)].flat().filter((x) => typeof x === 'string' && /^[dw]\d+_\d+/.test(x));
/** 대본 참조: 모든 next/goto 가 같은 날 안이거나 allow 목록(다음 날 첫 노드) */
export function checkRefs(D, allow = []) { const ids = new Set(D.map((b) => b.id)); for (const b of D) for (const r of refs(b)) assert.ok(ids.has(r) || allow.includes(r), `${b.id} → ${r}`); }
/** 소리: 대본 sfx · timed sfx · bgm · nextDay sfx 가 합성/기존에 있음 */
export function checkSfx(D, events = []) {
  for (const b of D) {
    if (b.sfx) assert.ok(haveSfx(String(b.sfx).split(/[|\s(]/)[0]), `${b.id} sfx ${b.sfx}`);
    for (const x of b.timed || []) if (x.sfx) assert.ok(haveSfx(x.sfx), `${b.id} timed ${x.sfx}`);
    if (b.bgm && b.bgm !== 'hold' && b.bgm !== 'bgm.shop') assert.ok(moods.has(b.bgm), `${b.id} bgm ${b.bgm}`);
    if (b.nextDay?.sfx) assert.ok(haveSfx(b.nextDay.sfx), `${b.id} nextDay sfx`);
  }
  for (const e of events) for (const x of e.audio?.sfx || []) for (const n of x.split('|').map((y, i) => (i ? `stinger.${y}` : y).split(/[\s(]/)[0])) assert.ok(haveSfx(n) || /^stinger\.(success|partial|comicfail)$/.test(n), `${e.id} sfx ${n}`);
}
/** 대본 걷기: ev/flags/aff/mission 값으로 분기, 선택지는 pick[id] 번째(없으면 0) — {seen, end, stage} */
export function walk(L, start, { ev = {}, flags = {}, aff = {}, mission = {}, pick = {}, meter = 0 } = {}) {
  const val = (on) => { const [k, ...r] = on.split('.'); const id = r.join('.'); return k === 'flag' ? flags[id] : k === 'ev' ? ev[id] : k === 'aff' ? aff[id] || 0 : k === 'mission' ? mission[id.split('.')[0]] : null; };
  const seen = [], stage = {}, set = {}; let cur = start, n = 0;
  while (cur && L[cur] && n++ < 400) {
    const b = L[cur]; seen.push(cur); if (b.stage) Object.assign(stage, b.stage);
    if (b.cmd === 'day.end') break;
    if (b.cmd === 'branch' && b.ranges) { cur = [...b.ranges].sort((a, c) => c.min - a.min).find((r) => meter >= r.min).goto; continue; }
    if (b.cmd === 'branch' && b.gte != null) { cur = (val(b.on) >= b.gte ? b.cases.true : null) || b.default; continue; }
    if (b.cmd === 'branch') { const v = val(b.on); cur = (v != null && b.cases[String(v)]) || b.default; continue; }
    if (b.cmd === 'mission.start') { cur = mission[b.event] === 'missed' ? b.onMissed : b.resume; continue; }
    if (b.choices) { const c = b.choices[pick[cur] || 0]; Object.assign(set, c.set || {}); cur = c.goto; continue; }
    cur = b.next;
  }
  return { seen, end: cur, stage, set };
}
/** 장면의 메시 수 · 삼각형 수 */
export function countScene(scene) { let m = 0, t = 0; scene.traverse((o) => { if (o.isMesh && o.visible) { m++; const tri = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; t += tri * (o.isInstancedMesh ? o.count : 1); } }); return { m, t }; }
/** 사각형 겹침 */
export const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
/** 매장 앞쪽 실제 장애물(쇼 스냅샷 /artifacts/day1014/probe-obs 결과 중 고정 랙·진열대) — 소품·칸 자리 검사용 */
export const FRONT_OBS = [
  { x0: 41.75, x1: 43.95, z0: 14, z1: 41 }, { x0: 50, x1: 52.2, z0: 14, z1: 41 }, { x0: 55.55, x1: 57.75, z0: 14, z1: 41 }, { x0: 61.1, x1: 63.3, z0: 14, z1: 41 },
  { x0: 56, x1: 57.38, z0: 10.08, z1: 10.72 }, { x0: 58.5, x1: 59.88, z0: 10.08, z1: 10.72 }, { x0: 56, x1: 57.38, z0: 6.88, z1: 7.52 },
  { x0: 65.09, x1: 67.41, z0: 13.5, z1: 14.82 }, { x0: 67.64, x1: 69.67, z0: 13.5, z1: 14.83 }, { x0: 69.89, x1: 71.71, z0: 13.5, z1: 14.96 }, { x0: 71.96, x1: 73.55, z0: 13.5, z1: 14.89 },
  { x0: 74.35, x1: 80.85, z0: 13.45, z1: 14.55 }, { x0: 74.35, x1: 76.95, z0: 14.7, z1: 15.8 }, { x0: 45.25, x1: 46.55, z0: 43.45, z1: 44.55 }, { x0: 68.85, x1: 70.35, z0: 25.95, z1: 26.45 },
];
