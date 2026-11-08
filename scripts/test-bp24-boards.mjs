// 전광판 슬롯은 켜진 매장 id 마다. 기록이 없으면 빈 문구만. 가짜 순위는 없다.
import { bp24BoardStoreIds, bp24BoardsAll, BP24_PLACEMENTS } from '../src/corridor/bp24Locations.js';
import { BOARD_MODES, emptyRankMessage, leaderboard } from '../src/bump24game/leaderboard.js';

if (!bp24BoardsAll('')) throw new Error('전광판 기본은 켜짐');
if (bp24BoardsAll('?bp24boards=0')) throw new Error('bp24boards=0 인데 켜짐');
if (!bp24BoardsAll('?bp24boards=1')) throw new Error('bp24boards=1 인데 꺼짐');

const ids = bp24BoardStoreIds('');
const set = new Set(ids);
if (set.size !== ids.length) throw new Error('전광판 id 가 겹침');
if (ids.length < 160) throw new Error(`전광판 슬롯이 너무 적음 ${ids.length}`);
if (!ids.includes('bump24-jeongja') || !ids.includes('jz649')) throw new Error('정자 매장 슬롯이 빠짐');
if (ids.includes('seongnam-cityhall')) throw new Error('시청점이 기본 슬롯에 들어감');
for (const s of BP24_PLACEMENTS) {
  if (s.enabled === false || s.id === 'seongnam-cityhall') continue;
  if (s.world !== 'jeongja' && !s.defaultOn) continue;
  if (!set.has(s.id)) throw new Error(`${s.id} 전광판 슬롯이 없음`);
}
const legacy = bp24BoardStoreIds('?bp24boards=0');
if (legacy.length !== 1 || legacy[0] !== 'bump24-jeongja') throw new Error(`예전 전광판이 아님 ${legacy}`);
const explicit = bp24BoardStoreIds('?bp24boards=0', true);
if (explicit.join(',') !== 'bump24-jeongja,seongnam-cityhall') throw new Error(`명시 게임 전광판 ${explicit}`);

if (!BOARD_MODES.includes('rank') || !BOARD_MODES.includes('notice')) throw new Error('전광판 모드 슬롯이 없음');
if (emptyRankMessage('today') !== '오늘 첫 도전자를 기다리는 중') throw new Error(emptyRankMessage('today'));
if (!emptyRankMessage('week').includes('기다리는 중')) throw new Error(emptyRankMessage('week'));

const rows = await leaderboard.top({ storeId: 'jz649-empty-test', period: 'today', limit: 5 });
if (rows.length) throw new Error(`데이터 없는데 순위 ${rows.length}`);
const week = await leaderboard.top({ storeId: 'jz649-empty-test', period: 'week', limit: 5 });
if (week.length) throw new Error('이번 주 가짜 순위');

console.log('bp24 boards ok', { slots: ids.length });
