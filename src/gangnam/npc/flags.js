// [gangnam-npc] ?gangnamnpc=0 이면 보행·차량·횡단보도 전부 없음. ?gangnam=0 이면 지상과 함께 꺼진다.

export function gangnamNpcEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search || '');
  return q.get('gangnam') !== '0' && q.get('gangnamnpc') !== '0';
}

export function gangnamNpcForce(search = typeof location !== 'undefined' ? location.search : '') {
  const n = parseInt(new URLSearchParams(search || '').get('gangnamnpcn'), 10);
  return n > 0 ? Math.min(n, 120) : 0;
}
