// 아바타 외형. three.js에 의존하지 않아서 로비와 릴레이가 같이 쓴다.
export const LOOK_CHOICES = [
  { key: 'gender', label: '성별', options: [['f', '여성'], ['m', '남성']] },
  { key: 'face', label: '얼굴', options: [['round', '둥근 얼굴'], ['square', '각진 얼굴'], ['long', '긴 얼굴']] },
  { key: 'hair', label: '머리', options: [['bald', '민머리'], ['short', '짧은 머리'], ['medium', '중간 머리'], ['long', '긴 머리'], ['pony', '포니테일']] },
  { key: 'glasses', label: '안경', options: [['0', '없음'], ['1', '안경']] },
  { key: 'beard', label: '수염', options: [['none', '없음'], ['goatee', '짧은 수염'], ['full', '풀수염']] },
  { key: 'top', label: '옷', options: [['hoodie', '후드티'], ['short', '반팔'], ['long', '긴팔']] },
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
