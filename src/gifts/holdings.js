// 내 선물함 보유. welcome / gift 응답이 여기로 들어오고, 화면과 탈것은 구독해서 따라간다.
import { normalizeHoldings, qtyOf, withQty } from './catalog.js';

let rows = [];
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(rows);
}

export function getHoldings() {
  return rows;
}

export function holdingQty(itemId) {
  return qtyOf(rows, itemId);
}

export function replaceHoldings(raw) {
  rows = normalizeHoldings(raw);
  emit();
  return rows;
}

export function setHoldingQty(itemId, qty) {
  rows = withQty(rows, itemId, qty);
  emit();
  return qtyOf(rows, itemId);
}

export function onHoldings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
