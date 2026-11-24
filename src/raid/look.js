// 데모의 평범한 시민. 얼굴·머리색은 전생 전사와 같은 look 을 써서 알아볼 수 있게 둔다.
export const CITIZEN_LOOK = {
  gender: 'm',
  face: 'round',
  hair: 'short',
  hairColor: '#2a211c',
  beard: 'none',
  top: 'long',
  pattern: 'none',
  color: '#3d5a80',
  pants: '#2c3338',
  shoes: '#1c1c1e',
  skin: '#f2d0b0',
  eyes: 'round',
  brows: 'straight',
  mouth: 'smile',
  blush: '0',
  freckles: '0',
  mole: 'none',
  hat: 'none',
  glasses: 'none',
  mask: 'none',
  earrings: 'none',
  neck: 'none',
  bag: 'none',
  watch: 'none',
  eyeColor: '#3d2914',
};

export const MAGE_LOOK = {
  ...CITIZEN_LOOK,
  gender: 'f',
  hair: 'medium',
  hairColor: '#1a2744',
  color: '#5b4b8a',
  pants: '#2a2440',
  mouth: 'smile',
};

export const PRIEST_LOOK = {
  ...CITIZEN_LOOK,
  gender: 'f',
  hair: 'pony',
  hairColor: '#4a3428',
  color: '#f4efe4',
  pants: '#d9cfc0',
  shoes: '#8d6e63',
  mouth: 'grin',
};
