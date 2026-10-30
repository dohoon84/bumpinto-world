// [corridor] 📍 이동(Travel) 버튼 + T 키 패널: 정자 ↔ 코리더 역 / 롯데월드타워로 순간이동. ?at=<역 id>|lotte 로 바로 시작.
import { isEn, onLangChange } from '../i18n.js';

const CSS = `
#corridor-travel { position: absolute; right: 0; top: 40px; z-index: 30; width: 260px; max-height: min(70vh, 560px); overflow-y: auto; padding: 8px; border-radius: 12px; background: rgba(255,255,255,.94); box-shadow: 0 2px 10px rgba(0,0,0,.18); font-size: 13px; }
#corridor-travel[hidden] { display: none; }
#corridor-travel h4 { margin: 2px 4px 6px; font-size: 12px; color: #5c6b82; font-weight: 700; }
#corridor-travel button { display: flex; width: 100%; justify-content: space-between; gap: 8px; margin: 0 0 3px; padding: 6px 8px; border: 0; border-radius: 8px; background: transparent; box-shadow: none; text-align: left; cursor: pointer; font: inherit; }
#corridor-travel button:hover { background: rgba(18,32,51,.07); }
#corridor-travel .ko { color: #5c6b82; font-size: 12px; }
`;

export function mountTravel({ corridor, home, teleport }) {
  const bar = document.getElementById('buttons');
  if (!bar) return null;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const btn = document.createElement('button'); btn.id = 'btn-travel'; btn.type = 'button'; btn.title = 'T';
  const homeEl = document.getElementById('btn-home');
  homeEl ? homeEl.after(btn) : bar.appendChild(btn);
  const panel = document.createElement('div'); panel.id = 'corridor-travel'; panel.hidden = true; bar.appendChild(panel);

  const tower = corridor.landmarks.items.find(({ l }) => l.id === 'lotte-world-tower')?.l;
  const dests = [
    { id: 'jeongja', en: 'Jeongja', ko: '정자', home: true },
    ...corridor.stations.map((s) => ({ id: s.id, en: s.nameEn, ko: s.name, x: (s.exits?.[0] || s).x, z: (s.exits?.[0] || s).z })),
  ];
  if (tower) { const at = tower.fit || tower.pos; dests.push({ id: 'lotte', en: 'Lotte World Tower', ko: '롯데월드타워', x: at.x + 70, z: at.z + 70 }); }

  const render = () => {
    const en = isEn();
    btn.textContent = en ? '📍 Travel' : '📍 이동';
    panel.innerHTML = `<h4>${en ? 'Seongnam-daero → Songpa-daero' : '성남대로 → 송파대로'}</h4>`;
    for (const d of dests) {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<span>${d.id === 'lotte' ? '🏙️' : '🚇'} ${en ? d.en : d.ko}</span><span class="ko">${en ? d.ko : d.en}</span>`;
      b.onclick = () => go(d.id);
      panel.appendChild(b);
    }
  };
  async function go(id) {
    const d = dests.find((x) => x.id === id || x.ko === id || x.en.toLowerCase() === String(id).toLowerCase());
    if (!d) return false;
    panel.hidden = true;
    if (d.home) { home(); return true; }
    await corridor.preload(d.x, d.z);
    const p = corridor.freeSpot(d.x, d.z);
    teleport(p.x, p.z);
    return true;
  }
  const toggle = () => { panel.hidden = !panel.hidden; };
  btn.onclick = toggle;
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    toggle();
  });
  onLangChange(render);
  render();
  return { go, dests, toggle, panel };
}
