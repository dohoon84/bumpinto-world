// [econ-ui] 패널 레이어: 한 번에 패널 하나(+토스트). Esc · 닫기 버튼으로 닫힘. DOM 만 쓴다(WebGL 없음).
import { el } from '../kit.js';

let layer = null, cur = null, curKey = '';
function ensure() {
  if (layer) return layer;
  layer = el('div', 've-layer'); layer.id = 've-layer';
  document.body.appendChild(layer);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur && !cur.dataset.sticky) { close(); } });
  return layer;
}
/** opts: { key, dim, cls, sticky, onClose } */
export function show(node, { key = '', dim = false, onClose = null, sticky = false } = {}) {
  ensure(); close(true);
  const wrap = el('div', `ve-wrap${dim ? ' dim' : ''}`);
  wrap.appendChild(node);
  wrap.dataset.key = key;
  if (sticky) wrap.dataset.sticky = '1';
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-ve="close"]')) close(); });
  layer.appendChild(wrap);
  cur = wrap; curKey = key; cur._onClose = onClose;
  return wrap;
}
export function close(silent = false) {
  if (!cur) return;
  const c = cur; cur = null; curKey = '';
  c.remove();
  if (!silent) c._onClose?.();
}
export const openKey = () => curKey;
export function toastLayer() { ensure(); return layer; }
