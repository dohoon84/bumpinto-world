// [econ-ui] 오늘의 할 일 슬롯 (순수 로직 — node 테스트용). 서버 pickDaily = D-LOGIN + 풀에서 2개(WALK10·WALK20·SUB1·BUS1·RIDE10) + 보너스 D-ALL3.
//   어떤 퀘스트가 배정될지는 계정·날짜마다 다르므로 id 목록을 하드코딩하지 않고, 보너스가 아닌 daily 퀘스트를 그대로 슬롯으로 쓴다.
/** @param {Array<{id:string, state:string, bonus?:boolean}>} quests @returns {{ slots: any[], done: number, total: number }} */
export function dailySlots(quests = []) {
  const slots = (quests || []).filter((q) => !q.bonus && q.id !== 'D-ALL3');
  return { slots, done: slots.filter((q) => q.state !== 'active').length, total: slots.length || 3 };
}
