// [econ-ui] 이동 할 일 칩. 하루 상한(60분)이 아니라 실제 목표(걷기 10·20분, 자전거 10분)를 보여 준다.
import { n, tr, esc, EI, bar } from './kit.js';

export const MOVE_GOALS = Object.freeze([
  { id: 'D-WALK10', kind: 'walk', target: 10, ko: '걷기 10분', en: 'Walk 10 min' },
  { id: 'D-WALK20', kind: 'walk', target: 20, ko: '걷기 20분', en: 'Walk 20 min' },
  { id: 'D-RIDE10', kind: 'bike', target: 10, ko: '자전거 10분', en: 'Bike 10 min' },
]);
const GOAL_IDS = new Set(MOVE_GOALS.map((g) => g.id));
export const isMoveGoal = (id) => GOAL_IDS.has(id);

export function moveGoalStates(quests, travel) {
  const list = quests || [];
  const minutes = Math.max(0, Math.floor(+travel?.minutes || 0));
  return MOVE_GOALS.map((g) => {
    const q = list.find((x) => x.id === g.id);
    const assigned = !!q;
    const fromQuest = q ? Math.round(+q.progress?.value || 0) : null;
    const value = Math.max(0, Math.min(g.target, fromQuest != null ? fromQuest : (g.kind === 'walk' ? minutes : 0)));
    return { ...g, assigned, value, done: !!(q && q.state !== 'active'), bum: q?.reward?.bum ?? null };
  });
}

/** 메인 문구는 쌓인 인정 분. 하루 상한은 상한에 가까울 때만. */
export function moveMinuteLabel(travel) {
  const m = Math.max(0, Math.floor(+travel?.minutes || 0));
  const cap = Math.max(1, Math.floor(+travel?.capMinutes || 60));
  const near = m >= Math.max(1, cap - 10);
  return {
    m,
    cap,
    near,
    main: tr(`오늘 이동 ${m}분 인정`, `${m} counted min today`),
    short: tr(`${m}분 인정`, `${m} min`),
    capText: tr(`하루 상한 ${cap}분`, `Daily cap ${cap} min`),
  };
}

export function moveGoalsHtml(quests, travel) {
  const goals = moveGoalStates(quests, travel);
  return `<div class="ve-goals">${goals.map((g) => {
    const icon = g.kind === 'bike' ? EI.bike(16) : EI.walk(16);
    const hue = g.kind === 'bike' ? '#3b82f6' : '#20c997';
    const title = tr(g.ko, g.en);
    const note = tr(`${n(g.value)}/${n(g.target)}분`, `${n(g.value)}/${n(g.target)} min`);
    const tip = !g.assigned && !g.done ? ` title="${esc(tr('오늘은 이 할 일이 아니에요', 'Not assigned today'))}"` : '';
    return `<div class="ve-goal${g.done ? ' done' : ''}${g.assigned ? ' on' : ' off'}" data-ve="all" data-goal="${g.id}"${tip}><span class="ve-tile" style="--c:${hue}">${icon}</span><span class="ve-goal-t"><b>${esc(title)}</b><em>${esc(note)}</em></span>${g.done ? '<span class="ve-goal-stamp" aria-hidden="true">완료</span>' : bar(g.value, g.target, { w: 64, h: 6, cls: g.kind === 'bike' ? 'blue' : 'mint' })}</div>`;
  }).join('')}</div>`;
}
