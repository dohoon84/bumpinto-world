// [titles] 금 이상 칭호를 얻으면 같은 방 사람에게 알림. 가까운 사람은 박수를 한 번 보낼 수 있다.
import { titleById } from './catalog.js';
import { titleLabel } from './nametag.js';
import { tr } from '../i18n.js';

const NEAR_M = 32;

export function createCheer({ enabled, presence, getPos, onClap }) {
  let root = null;
  let lastClap = 0;
  function ensure() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'tb-cheers';
    root.hidden = true;
    document.body.appendChild(root);
    return root;
  }
  function hideIfEmpty() {
    if (root && !root.childElementCount) root.hidden = true;
  }
  function show(msg) {
    if (!enabled || !msg) return;
    const title = titleById(msg.title);
    if (!title) return;
    const box = ensure();
    box.hidden = false;
    const card = document.createElement('div');
    card.className = `tb-cheer g-${title.grade}`;
    const name = String(msg.name || '').slice(0, 24) || tr('누군가', 'Someone');
    const label = titleLabel(title);
    const b = document.createElement('b');
    b.textContent = tr(`${name}님이 ${label} 획득!`, `${name} earned ${label}!`);
    card.appendChild(b);
    const me = getPos?.();
    const near = me && Number.isFinite(msg.x) && Number.isFinite(msg.z) && Math.hypot(me.x - msg.x, me.z - msg.z) <= NEAR_M;
    if (near && msg.id) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-clap';
      btn.textContent = tr('👏 박수', '👏 Clap');
      btn.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastClap < 2500) return;
        lastClap = now;
        btn.disabled = true;
        onClap?.(msg);
        presence?.sendTitleClap?.(msg.id);
      });
      card.appendChild(btn);
    }
    box.appendChild(card);
    setTimeout(() => { card.remove(); hideIfEmpty(); }, 7000);
  }
  return { show };
}
