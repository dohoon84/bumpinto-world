// [depot-story] 반응 R01–R50 (reactions.json) — 막지 않는 한마디. 빈도 규칙(globalRules.frequency):
//   분당 최대 N(설정 4/3/1/0, 1일차 첫 10분 +1), 반응 사이 10초, 같은 사람 30초, 항목별 cooldownSec · perDayMax, 희귀도 확률,
//   큐 2개(우선순위로 밀어냄, 우선순위별 만료), 조용한 때(대화창·입장 15초·결제 화면=계산원만·방송 4초·사건 중 배경 수다 끔).
//   우선순위 1(안전)은 '끄기'여도 나옴. 자유 장보기는 freeMode=true 만. 트리거는 detect() 가 프레임마다 보내는 신호로 판정.
import DATA from './data/reactions.json';

const BY_ID = Object.fromEntries(DATA.reactions.map((r) => [r.id, r]));
const RARITY = { common: 1, uncommon: 0.5, rare: 0.15, once: 1 };
const EXPIRE = DATA.globalRules?.frequency?.queue?.expireSec || { 1: 8, 2: 8, 3: 6, 4: 5, 5: 3 };

export function pickLines(lines, n, key) {
  if (key && lines[key]) return lines[key];
  if (lines[String(n)]) return lines[String(n)];
  let best = null, bestN = -1;
  for (const k of Object.keys(lines)) { const m = /^(\d+)\+$/.exec(k); if (m && +m[1] <= n && +m[1] > bestN) { best = lines[k]; bestN = +m[1]; } }
  if (best) return best;
  const nums = Object.keys(lines).filter((k) => /^\d+$/.test(k)).map(Number).filter((x) => x <= n).sort((a, b) => b - a);
  return nums.length ? lines[String(nums[0])] : Object.values(lines)[0];
}

export function createReactions({ save, getMode, getDay, getFreq, deliver, cue, lineOk = () => true, getFlag = (k) => save.flags?.[k], now = () => performance.now() / 1000, rnd = Math.random }) {
  const R = { queue: [], last: -99, lastBy: {}, minute: [], lastFire: {}, t0: now(), quietUntil: 0, paUntil: 0, eventCast: null, counts: save.counts || (save.counts = {}), today: save.today || (save.today = {}), once: save.once || (save.once = {}) };
  function allowed(r) {
    if (!r) return false;
    const mode = getMode();
    if (mode === 'free' && !r.freeMode) return false;
    if (mode === 'story' && Array.isArray(r.days) && (getDay() < r.days[0] || getDay() > r.days[r.days.length - 1])) return false;
    if (r.rarity === 'once' && R.once[r.id]) return false;
    if (r.needsFlag && !getFlag(String(r.needsFlag).replace(/^flag\./, ''))) return false; // 예: R59 flag.spyRevealed
    if (r.perDayMax && (R.today[r.id] || 0) >= r.perDayMax) return false;
    const cd = r.cooldownSec || 0, lf = R.lastFire[r.id];
    if (cd && lf != null && now() - lf < cd) return false;
    return true;
  }
  /** 트리거 발생. opts: {key(시간대 키), vars{}, speaker{name,face,pos3}, force} */
  function fire(id, opts = {}) {
    const r = BY_ID[id]; if (!allowed(r)) return false;
    if (!opts.force && rnd() > (RARITY[r.rarity] ?? 1)) { R.lastFire[r.id] = now(); return false; } // 희귀도 — 빗나가도 쿨다운은 돎
    R.lastFire[r.id] = now();
    const item = { r, opts, t: now() };
    // 큐: 우선순위 → 희귀도(rare 먼저) → 발생 순
    R.queue.push(item);
    const rw = (x) => ({ rare: 0, once: 0, uncommon: 1, common: 2 }[x.r.rarity] ?? 2);
    R.queue.sort((a, b) => a.r.priority - b.r.priority || rw(a) - rw(b) || a.t - b.t);
    while (R.queue.length > 2) R.queue.pop();
    return true;
  }
  function maxPerMin() {
    const f = getFreq();
    const boost = getMode() === 'story' && getDay() === 1 && now() - R.t0 < 600 && f > 0 ? 1 : 0;
    return f + boost;
  }
  function quietFor(item, ctx) {
    const r = item.r, t = now();
    if (ctx.dialog) return true; // 대화창 열림: 전부 멈춤(1~2 는 큐에 남김)
    if (t < R.paUntil && r.who !== 'pa') return true;
    if (t - R.t0 < 15 && !['R31', 'R32', 'R33'].includes(r.id) && !item.opts.comeback) return true;
    if (ctx.payPanel && r.who !== 'cashier' && r.priority > 1) return true;
    if (ctx.staffTalking && r.who === 'beomsuk' && r.priority > 1) return true; // 직원 말풍선과 겹치지 않게
    if (R.eventCast && r.priority === 5) return true;
    if (R.eventCast && r.priority > 1 && !R.eventCast.includes(r.who)) return true;
    return false;
  }
  function tick(ctx) {
    const t = now();
    R.minute = R.minute.filter((x) => t - x < 60);
    R.queue = R.queue.filter((q) => t - q.t < (EXPIRE[q.r.priority] || 6) + (ctx.dialog && q.r.priority <= 2 ? 60 : 0));
    if (!R.queue.length) return;
    const item = R.queue[0];
    if (quietFor(item, ctx)) return;
    const p1 = item.r.priority === 1;
    if (!p1) {
      if (getFreq() <= 0) { R.queue.shift(); return; }
      if (R.minute.length >= maxPerMin()) return;
      if (t - R.last < (DATA.globalRules?.frequency?.minGapSec || 10)) return;
    } else if (t - R.last < 3) return;
    const who = item.r.who;
    if (R.lastBy[who] != null && t - R.lastBy[who] < (DATA.globalRules?.frequency?.sameSpeakerGapSec || 30) && !p1) { if (R.queue.length > 1) { R.queue.push(R.queue.shift()); } return; }
    R.queue.shift();
    const n = (R.counts[item.r.id] || 0) + 1;
    const pool = (pickLines(item.r.lines, n, item.opts.key) || []).filter((l) => lineOk(who, l)); // 5일차 전 정체 대사 등 막기
    if (!pool.length) return;
    R.counts[item.r.id] = n;
    R.today[item.r.id] = (R.today[item.r.id] || 0) + 1;
    if (item.r.rarity === 'once') R.once[item.r.id] = 1;
    let line = pool[Math.floor(rnd() * pool.length)] || '';
    for (const [k, v] of Object.entries(item.opts.vars || {})) line = line.split(`{${k}}`).join(String(v));
    R.last = t; R.lastBy[who] = t; R.minute.push(t);
    if (who === 'pa') R.paUntil = t + 4;
    deliver({ r: item.r, line, n, speaker: item.opts.speaker });
    for (const s of item.r.sfx || []) cue(s);
    cue('toast-pop');
  }
  return {
    fire, tick, R, BY_ID,
    setEventCast(c) { R.eventCast = c; },
    paNow() { R.paUntil = now() + 4; },
    resetDay() { for (const k of Object.keys(R.today)) delete R.today[k]; },
    can: (id) => allowed(BY_ID[id]),
  };
}
