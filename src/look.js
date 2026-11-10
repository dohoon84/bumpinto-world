// 아바타 외형. three.js에 의존하지 않아서 로비와 릴레이가 같이 쓴다.
export const LOOK_CHOICES = [
  { tab: 'basic', key: 'gender', label: '성별', enLabel: 'Gender', options: [['f', '여성', 'Female'], ['m', '남성', 'Male']] },
  { tab: 'basic', key: 'face', label: '얼굴', enLabel: 'Face', options: [['round', '둥근 얼굴', 'Round'], ['square', '각진 얼굴', 'Square'], ['long', '긴 얼굴', 'Long']] },
  { tab: 'basic', key: 'hair', label: '머리', enLabel: 'Hair', options: [['bald', '민머리', 'Bald'], ['short', '짧은 머리', 'Short'], ['medium', '중간 머리', 'Medium'], ['long', '긴 머리', 'Long'], ['pony', '포니테일', 'Ponytail']] },
  { tab: 'basic', key: 'beard', label: '수염', enLabel: 'Beard', options: [['none', '없음', 'None'], ['goatee', '짧은 수염', 'Goatee'], ['full', '풀수염', 'Full']] },
  { tab: 'basic', key: 'top', label: '옷', enLabel: 'Top', options: [['hoodie', '후드티', 'Hoodie'], ['short', '반팔', 'T-Shirt'], ['long', '긴팔', 'Long Sleeve']] },
  { tab: 'basic', key: 'pattern', label: '무늬', enLabel: 'Pattern', options: [['none', '없음', 'None'], ['stripe', '줄무늬', 'Stripe'], ['block', '배색', 'Color-block']] },
  { tab: 'face', key: 'eyes', label: '눈', enLabel: 'Eyes', options: [['round', '동그란', 'Round'], ['smile', '웃는', 'Smile'], ['sleepy', '졸린', 'Sleepy'], ['sharp', '날카로운', 'Sharp'], ['sparkle', '반짝', 'Sparkle'], ['wink', '윙크', 'Wink']] },
  { tab: 'face', key: 'brows', label: '눈썹', enLabel: 'Brows', options: [['none', '없음', 'None'], ['straight', '일자', 'Straight'], ['arch', '아치', 'Arched'], ['angry', '찌푸린', 'Angry'], ['worry', '처진', 'Worried']] },
  { tab: 'face', key: 'mouth', label: '입', enLabel: 'Mouth', options: [['none', '없음', 'None'], ['smile', '미소', 'Smile'], ['grin', '활짝', 'Grin'], ['pout', '삐죽', 'Pout'], ['open', '벌린', 'Open'], ['cat', '고양이', 'Cat']] },
  { tab: 'face', key: 'blush', label: '볼터치', enLabel: 'Blush', options: [['0', '없음', 'None'], ['1', '있음', 'On']] },
  { tab: 'face', key: 'freckles', label: '주근깨', enLabel: 'Freckles', options: [['0', '없음', 'None'], ['1', '있음', 'On']] },
  { tab: 'face', key: 'mole', label: '점', enLabel: 'Mole', options: [['none', '없음', 'None'], ['cheek', '볼', 'Cheek'], ['lip', '입가', 'Lip']] },
  { tab: 'item', key: 'hat', label: '모자', enLabel: 'Hat', options: [['none', '없음', 'None'], ['cap', '모자', 'Cap'], ['beanie', '비니', 'Beanie'], ['bucket', '버킷햇', 'Bucket'], ['band', '머리띠', 'Headband'], ['beret', '베레모', 'Beret'], ['helmet', '헬멧', 'Helmet'], ['catear', '고양이귀', 'Cat ears']] },
  { tab: 'item', key: 'glasses', label: '안경', enLabel: 'Glasses', options: [['none', '없음', 'None'], ['round', '둥근 안경', 'Round'], ['square', '사각 안경', 'Square'], ['sun', '선글라스', 'Sunglasses']] },
  { tab: 'item', key: 'mask', label: '마스크', enLabel: 'Mask', options: [['none', '없음', 'None'], ['cloth', '마스크', 'Mask']] },
  { tab: 'item', key: 'earrings', label: '귀걸이', enLabel: 'Earrings', options: [['none', '없음', 'None'], ['stud', '피어싱', 'Stud'], ['hoop', '링', 'Hoop']] },
  { tab: 'item', key: 'neck', label: '목', enLabel: 'Neck', options: [['none', '없음', 'None'], ['scarf', '목도리', 'Scarf'], ['necklace', '목걸이', 'Necklace']] },
  { tab: 'item', key: 'bag', label: '가방', enLabel: 'Bag', options: [['none', '없음', 'None'], ['backpack', '백팩', 'Backpack'], ['crossbody', '크로스백', 'Crossbody'], ['tote', '토트백', 'Tote']] },
  { tab: 'item', key: 'watch', label: '시계', enLabel: 'Watch', options: [['none', '없음', 'None'], ['1', '시계', 'Watch']] },
];

export const OUTFIT_COLORS = ['#4f7cff', '#ff6b6b', '#20c997', '#f59f00', '#845ef7', '#e64980', '#2d3436', '#f4efe4'];
export const SKIN_COLORS = ['#f2d0b0', '#f6d7c3', '#e8c4a8', '#d7a888', '#c4926e', '#a87556', '#8d5524'];
export const HAIR_COLORS = ['#2a211c', '#1a1a1a', '#4a3428', '#6b4423', '#c9a227', '#d76a6a', '#4f7cff', '#f4efe4'];
export const EYE_COLORS = ['#222222', '#3d2914', '#1f4e79', '#2d6a4f', '#5c3d2e', '#844685'];
export const SHOE_COLORS = ['#2d3436', '#1a1a1a', '#8d6e63', '#f4efe4', '#4f7cff', '#ff6b6b'];

export const LOOK_TABS = [
  { id: 'basic', label: '기본', enLabel: 'Basics' },
  { id: 'face', label: '얼굴', enLabel: 'Face' },
  { id: 'item', label: '아이템', enLabel: 'Items' },
  { id: 'color', label: '색', enLabel: 'Colors' },
];

export const COLOR_FIELDS = [
  { key: 'skin', label: '피부 색', enLabel: 'Skin Color', colors: SKIN_COLORS },
  { key: 'hairColor', label: '머리 색', enLabel: 'Hair Color', colors: HAIR_COLORS },
  { key: 'eyeColor', label: '눈 색', enLabel: 'Eye Color', colors: EYE_COLORS },
  { key: 'color', label: '옷 색', enLabel: 'Top Color', colors: OUTFIT_COLORS },
  { key: 'pants', label: '바지 색', enLabel: 'Pants Color', colors: OUTFIT_COLORS },
  { key: 'shoes', label: '신발 색', enLabel: 'Shoe Color', colors: SHOE_COLORS },
  { key: 'hatColor', label: '모자 색', enLabel: 'Hat Color', colors: OUTFIT_COLORS },
  { key: 'bagColor', label: '가방 색', enLabel: 'Bag Color', colors: OUTFIT_COLORS },
];

const SETS = {
  gender: ['f', 'm'],
  face: ['round', 'square', 'long'],
  hair: ['bald', 'short', 'medium', 'long', 'pony'],
  beard: ['none', 'goatee', 'full'],
  top: ['hoodie', 'short', 'long'],
  pattern: ['none', 'stripe', 'block'],
  eyes: ['round', 'smile', 'sleepy', 'sharp', 'sparkle', 'wink'],
  brows: ['none', 'straight', 'arch', 'angry', 'worry'],
  mouth: ['none', 'smile', 'grin', 'pout', 'open', 'cat'],
  blush: ['0', '1'],
  freckles: ['0', '1'],
  mole: ['none', 'cheek', 'lip'],
  hat: ['none', 'cap', 'beanie', 'bucket', 'band', 'beret', 'helmet', 'catear'],
  glasses: ['none', 'round', 'square', 'sun'],
  mask: ['none', 'cloth'],
  earrings: ['none', 'stud', 'hoop'],
  neck: ['none', 'scarf', 'necklace'],
  bag: ['none', 'backpack', 'crossbody', 'tote'],
  watch: ['none', '1'],
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v, fb) => (typeof v === 'string' && HEX.test(v) ? v : fb);

function one(l, k, fb) {
  return SETS[k].includes(l[k]) ? l[k] : fb;
}

function flag01(v) {
  if (v === true || v === 1 || v === '1') return '1';
  return '0';
}

function migrateGlasses(v) {
  if (v === true || v === 1 || v === '1') return 'round';
  if (v === false || v === 0 || v === '0' || v == null || v === 'none') return 'none';
  return SETS.glasses.includes(v) ? v : 'none';
}

// 예전에 hat/bag 은 색 문자열이었다. 색이면 기본 모자/백팩으로 옮긴다.
function migrateWear(l, key, fallbackType) {
  const raw = l[key];
  const colorKey = key === 'hat' ? 'hatColor' : 'bagColor';
  const fbColor = key === 'hat' ? '#243044' : '#6b4f3a';
  if (raw == null || raw === '' || raw === 'none' || raw === false) {
    return { type: 'none', color: hex(l[colorKey], fbColor) };
  }
  if (typeof raw === 'string' && HEX.test(raw)) {
    return { type: fallbackType, color: raw };
  }
  if (SETS[key].includes(raw)) return { type: raw, color: hex(l[colorKey], fbColor) };
  return { type: 'none', color: hex(l[colorKey], fbColor) };
}

export function sanitizeLook(raw = {}) {
  const l = raw && typeof raw === 'object' ? raw : {};
  const hat = migrateWear(l, 'hat', 'cap');
  const bag = migrateWear(l, 'bag', 'backpack');
  return {
    gender: one(l, 'gender', 'm'),
    face: one(l, 'face', 'round'),
    hair: l.hair == null ? null : one(l, 'hair', 'short'),
    glasses: migrateGlasses(l.glasses),
    beard: one(l, 'beard', 'none'),
    top: one(l, 'top', 'long'),
    pattern: one(l, 'pattern', 'none'),
    eyes: one(l, 'eyes', 'round'),
    brows: one(l, 'brows', 'none'),
    mouth: one(l, 'mouth', 'none'),
    blush: SETS.blush.includes(l.blush) ? l.blush : flag01(l.blush),
    freckles: SETS.freckles.includes(l.freckles) ? l.freckles : flag01(l.freckles),
    mole: one(l, 'mole', 'none'),
    hat: hat.type,
    bag: bag.type,
    mask: one(l, 'mask', 'none'),
    earrings: one(l, 'earrings', 'none'),
    neck: one(l, 'neck', 'none'),
    watch: one(l, 'watch', 'none'),
    color: hex(l.color, '#4f7cff'),
    skin: hex(l.skin, '#f2d0b0'),
    pants: hex(l.pants, '#3b4252'),
    shoes: hex(l.shoes, '#2d3436'),
    hairColor: hex(l.hairColor, '#2a211c'),
    eyeColor: hex(l.eyeColor, '#222222'),
    hatColor: hat.color,
    bagColor: bag.color,
  };
}

export const PROFILE_KEY = 'jeongja3d.profile';
export const PASSPORT_ACTIVE_KEY = 'jeongja3d.passport.active';

export function readSavedPassport() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (p && typeof p.name === 'string' && p.name.trim()) {
      return {
        name: p.name.trim().slice(0, 16),
        look: sanitizeLook(p.look || {}),
        phone: p.phone || '',
        display: p.display || '',
      };
    }
  } catch {}
  return null;
}

export function isPassportActive() {
  try {
    return sessionStorage.getItem(PASSPORT_ACTIVE_KEY) === '1' && !!readSavedPassport();
  } catch {
    return false;
  }
}

export function setPassportActive(active) {
  try {
    if (active) sessionStorage.setItem(PASSPORT_ACTIVE_KEY, '1');
    else sessionStorage.removeItem(PASSPORT_ACTIVE_KEY);
  } catch {}
}
