// [bump24game] ?bp24game=1 이고 매장 플래그(?bp24/?bump24)가 켜져 있을 때만 미니게임 활성
export function bump24GameEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const p = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  if (p.get('bp24game') === '0') return false;
  if (p.get('bp24game') !== '1' && p.get('bp24game') !== 'demo') return false;
  const store = p.get('bp24') ?? p.get('bump24');
  return !!store && store !== '0';
}

export function bump24GameMode(search = typeof location !== 'undefined' ? location.search : '') {
  if (!bump24GameEnabled(search)) return null;
  const p = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  return p.get('bp24game') === 'demo' ? 'demo' : '1';
}
