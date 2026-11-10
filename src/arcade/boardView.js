// [arcade] 순위판 행 매칭 — 같은 사람은 한 줄만. 목록에 있으면 그 자리를 강조하고, 없을 때만 아래를 고정한다.
export function sameRankPlayer(a, b) {
  if (!a || !b) return false;
  if (a.playerKey && b.playerKey) return String(a.playerKey) === String(b.playerKey);
  if (a.accountId && b.accountId) return String(a.accountId) === String(b.accountId);
  return String(a.name || '') === String(b.name || '') && Number(a.score) === Number(b.score);
}

export function splitBoardMine(rows, me) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && (r.name != null || r.score != null)) : [];
  const mine = me && (me.name != null || me.score != null) ? me : null;
  const isMine = (r) => !!(mine && (sameRankPlayer(r, mine) || r.me || r.self));
  const inList = !!(mine && list.some(isMine));
  return { list, mine, inList, pinMine: !!(mine && !inList), isMine };
}
