// CR·1 은 선물함 카탈로그의 한 항목이다. 수량·전달 단위는 src/gifts/catalog.js 만 고친다.
import { giftItem, qtyOf } from '../../gifts/catalog.js';

export const ROADBIKE_GIFT = giftItem('roadbike-cr1');
export const ROADBIKE_GIFT_ID = ROADBIKE_GIFT.id;
export const ROADBIKE_SEED_QTY = ROADBIKE_GIFT.seedQty;
export const ROADBIKE_WHITE_GIFT = giftItem('roadbike-cr1-white');
export const ROADBIKE_WHITE_GIFT_ID = ROADBIKE_WHITE_GIFT.id;
export const ROADBIKE_WHITE_SEED_QTY = ROADBIKE_WHITE_GIFT.seedQty;

export function giftQtyOf(list, itemId = ROADBIKE_GIFT_ID) {
  return qtyOf(list, itemId);
}
