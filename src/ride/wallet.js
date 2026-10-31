// [ride] 교통카드(인게임 폰 지갑 아이템). 지금은 재화가 없으므로 '무료 체험 카드'를 자동 발급한다.
//   잔액 0원 · 무제한 무료 탑승. 나중에 충전식 카드가 생기면 kind/balance 만 서버 값으로 바꾸면 된다.
export const WALLET_KEY = 'bw.wallet.v1';

export function createWallet({ storage, key = WALLET_KEY, now = () => Date.now() } = {}) {
  const st = storage || (() => { try { return localStorage; } catch { return null; } })();
  let mem = null;
  const read = () => { if (!st) return mem; try { return JSON.parse(st.getItem(key) || 'null'); } catch { return null; } };
  const write = (v) => { mem = v; try { st?.setItem(key, JSON.stringify(v)); } catch { /* noop */ } };
  function card() {
    let w = read();
    if (!w?.card?.id) {
      const t = now();
      w = { card: { id: `card-${t.toString(36)}-${Math.floor(Math.random() * 46656).toString(36)}`, kind: 'trial', name: { ko: '무료 체험 카드', en: 'Free Trial Card' }, balance: 0, currency: 'KRW', unlimited: true, issuedAt: t } };
      write(w);
    }
    return w.card;
  }
  return { card, key };
}
