// 아바타 외형. three.js에 의존하지 않아서 로비와 릴레이가 같이 쓴다.
export const LOOK_CHOICES = [
  { key: 'gender', label: '성별', enLabel: 'Gender', options: [['f', '여성', 'Female'], ['m', '남성', 'Male']] },
  { key: 'face', label: '얼굴', enLabel: 'Face', options: [['round', '둥근 얼굴', 'Round'], ['square', '각진 얼굴', 'Square'], ['long', '긴 얼굴', 'Long']] },
  { key: 'hair', label: '머리', enLabel: 'Hair', options: [['bald', '민머리', 'Bald'], ['short', '짧은 머리', 'Short'], ['medium', '중간 머리', 'Medium'], ['long', '긴 머리', 'Long'], ['pony', '포니테일', 'Ponytail']] },
  { key: 'glasses', label: '안경', enLabel: 'Glasses', options: [['0', '없음', 'None'], ['1', '안경', 'Glasses']] },
  { key: 'beard', label: '수염', enLabel: 'Beard', options: [['none', '없음', 'None'], ['goatee', '짧은 수염', 'Goatee'], ['full', '풀수염', 'Full']] },
  { key: 'top', label: '옷', enLabel: 'Top', options: [['hoodie', '후드티', 'Hoodie'], ['short', '반팔', 'T-Shirt'], ['long', '긴팔', 'Long Sleeve']] },
];

export const OUTFIT_COLORS = ['#4f7cff', '#ff6b6b', '#20c997', '#f59f00', '#845ef7', '#e64980', '#2d3436', '#f4efe4'];

const SETS = {
  gender: ['f', 'm'],
  face: ['round', 'square', 'long'],
  hair: ['bald', 'short', 'medium', 'long', 'pony'],
  beard: ['none', 'goatee', 'full'],
  top: ['hoodie', 'short', 'long'],
};

const hex = (v, fb) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb);

export function sanitizeLook(raw = {}) {
  const l = raw && typeof raw === 'object' ? raw : {};
  const one = (k, fb) => (SETS[k].includes(l[k]) ? l[k] : fb);
  return {
    gender: one('gender', 'm'),
    face: one('face', 'round'),
    hair: l.hair == null ? null : one('hair', 'short'),
    glasses: l.glasses === true || l.glasses === 1 || l.glasses === '1',
    beard: one('beard', 'none'),
    top: one('top', 'long'),
    color: hex(l.color, '#4f7cff'),
    skin: hex(l.skin, '#f2d0b0'),
    pants: hex(l.pants, '#3b4252'),
    hat: typeof l.hat === 'string' ? l.hat : null,
    bag: typeof l.bag === 'string' ? l.bag : null,
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
