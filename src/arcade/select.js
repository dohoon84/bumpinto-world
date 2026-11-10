// [arcade] 오락실 안 게임 선택 — 범핑팡 / 범편의점
export function mountGameSelect({ root, onPick, onClose } = {}) {
  const el = document.createElement('div');
  el.className = 'arc-pick';
  el.innerHTML = `
    <div class="arc-pick-panel" role="dialog" aria-label="게임 선택">
      <p class="arc-pick-kicker">BUMP 오락실</p>
      <h2>어떤 게임을 할까요?</h2>
      <p class="arc-pick-sub">둘 다 PC와 모바일에서 바로 할 수 있어요</p>
      <div class="arc-pick-grid">
        <button type="button" class="arc-pick-game" data-pick="pang">
          <img class="arc-pick-logo pang" src="/arcade/pang/logo/logo-bumpingpang.svg" alt="범핑팡" />
          <span class="arc-pick-desc">같은 블록 3개를 맞춰 팡!</span>
        </button>
        <button type="button" class="arc-pick-game" data-pick="merge">
          <img class="arc-pick-logo merge" src="/arcade/merge/logo/logo-bumstore.png" alt="범편의점" />
          <span class="arc-pick-desc">같은 물건을 합쳐 보세요</span>
        </button>
      </div>
      <button type="button" class="arc-pick-back" data-close>오락실로</button>
    </div>
  `;
  const pick = (id) => { dispose(); onPick?.(id); };
  el.querySelectorAll('[data-pick]').forEach((b) => {
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); pick(b.getAttribute('data-pick')); });
  });
  el.querySelector('[data-close]')?.addEventListener('click', (e) => { e.preventDefault(); dispose(); onClose?.(); });
  root?.appendChild(el);

  function dispose() { el.remove(); }
  return { dispose, el };
}
