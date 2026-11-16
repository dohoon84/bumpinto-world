// 던전 입장 전에 고르는 다섯 직업. 던전 안에서는 바꾸지 않는다.
// 시민 키는 발바닥(0.04)에서 짧은 머리 끝까지. createAvatar(CITIZEN_LOOK) 가시 메시 기준.
export const CITIZEN_HEIGHT = 1.8856;
export const CLASS_SCALE = {
  warrior: 1,
  mage: 1,
  priest: 1,
  archer: 1,
  assassin: 1,
};
// 디자이너 GLB는 이미 최종 크기. 이름표·카메라 기준은 무기 포함 전체 키가 아니라 투구 정수리.
export const CLASS_GLB = {
  warrior: '/dungeon/chars/warrior.meshopt.glb',
  mage: '/dungeon/chars/mage.meshopt.glb',
  priest: '/dungeon/chars/priest.meshopt.glb',
  archer: '/dungeon/chars/archer.meshopt.glb',
  assassin: '/dungeon/chars/assassin.meshopt.glb',
};
export const CLASS_MARKS = {
  warrior: { crown: 1.8856, head: 1.2483, height: 1.8856 },
  mage: { crown: 1.8856, head: 1.2483, height: 1.8856 },
  priest: { crown: 1.8856, head: 1.2483, height: 1.8856 },
  archer: { crown: 1.8856, head: 1.2483, height: 1.8856 },
  assassin: { crown: 1.8856, head: 1.2483, height: 1.8856 },
};
const lock = (key) => ({ id: 'lock' + key, name: '잠김', key, cd: 0, cost: 0, lock: 0, locked: true, kind: 'lock' });

function skill(partial) {
  return { gain: 0, gainOnCast: 0, cost: 0, range: 8, power: 0, heal: 0, dash: false, sfx: 'slash', color: '#fff', ...partial };
}

export const CLASSES = {
  warrior: {
    id: 'warrior',
    name: '전사',
    role: '탱커',
    blurb: '중갑과 타워 실드. 분노가 오를수록 크게 벤다.',
    seam: '#ff6a22',
    heightMul: CLASS_SCALE.warrior,
    res: 'rage',
    resLabel: '분노',
    resBar: 'rage',
    resStart: 0,
    regen: 0,
    hp: 125,
    skills: [
      skill({ id: 'slash', name: '슬래시', key: '1', cd: 1.45, lock: 0.34, kind: 'melee', power: 62, gain: 8, range: 8.05, sfx: 'slam', color: '#ffe7a0' }),
      skill({ id: 'charge', name: '방패 돌진', key: '2', cd: 7, lock: 0.42, kind: 'dash', power: 100, gain: 12, range: 8.6, dash: true, sfx: 'charge', color: '#9fd6ff' }),
      skill({ id: 'shout', name: '외침', key: '3', cd: 14, lock: 0.4, kind: 'shout', power: 36, gainOnCast: 20, range: 14, sfx: 'shout', color: '#e6c36a' }),
      skill({ id: 'spin', name: '회전베기', key: '4', cd: 9, cost: 22, lock: 0.5, kind: 'spin', power: 128, gain: 4, range: 7.9, sfx: 'whirl', color: '#ffe7a0' }),
      lock('5'),
      lock('6'),
    ],
  },
  mage: {
    id: 'mage',
    name: '마법사',
    role: '원거리',
    blurb: '수정 지팡이와 룬 고리. 마나로 얼음 파편을 던진다.',
    seam: '#6a7bff',
    heightMul: CLASS_SCALE.mage,
    res: 'mana',
    resLabel: '마나',
    resBar: 'mp',
    resStart: 100,
    regen: 9,
    hp: 100,
    skills: [
      skill({ id: 'shard', name: '화염구', key: '1', cd: 0.8, cost: 14, lock: 0.28, kind: 'projectile', power: 64, range: 22, sfx: 'fire', color: '#ff7a1a' }),
      skill({ id: 'nova', name: '서리 고리', key: '2', cd: 6, cost: 26, lock: 0.36, kind: 'nova', power: 96, range: 14, sfx: 'frost', color: '#7fd4ff' }),
      skill({ id: 'freeze', name: '낙뢰', key: '3', cd: 10, cost: 20, lock: 0.32, kind: 'bind', power: 48, range: 18, sfx: 'bolt', color: '#f4fbff' }),
      skill({ id: 'blizzard', name: '한파', key: '4', cd: 12, cost: 42, lock: 0.45, kind: 'rain', power: 170, range: 22, sfx: 'frost', color: '#9fd6ff' }),
      lock('5'),
      lock('6'),
    ],
  },
  priest: {
    id: 'priest',
    name: '사제',
    role: '치유',
    blurb: '금테 갑주와 등불 지팡이. 자신과 동료를 살린다.',
    seam: '#e6c36a',
    heightMul: CLASS_SCALE.priest,
    res: 'holy',
    resLabel: '신성력',
    resBar: 'holy',
    resStart: 2,
    resMax: 5,
    regen: 0,
    hp: 100,
    skills: [
      skill({ id: 'smite', name: '성광', key: '1', cd: 1.05, gain: 1, lock: 0.3, kind: 'projectile', power: 46, range: 20, sfx: 'holy', color: '#ffe7a0' }),
      skill({ id: 'heal', name: '치유', key: '2', cd: 5, cost: 2, lock: 0.34, kind: 'heal', heal: 32, sfx: 'heal', color: '#ffe7a0' }),
      skill({ id: 'circle', name: '보호막', key: '3', cd: 11, cost: 3, lock: 0.4, kind: 'healParty', heal: 18, sfx: 'shield', color: '#ffd27a' }),
      skill({ id: 'holy', name: '빛의 일격', key: '4', cd: 8, cost: 1, lock: 0.4, kind: 'projectile', power: 120, range: 18, sfx: 'holy', color: '#fff1b8' }),
      lock('5'),
      lock('6'),
    ],
  },
  archer: {
    id: 'archer',
    name: '궁수',
    role: '원거리',
    blurb: '후드 장궁. 맞출수록 집중이 오른다.',
    seam: '#3dff9a',
    heightMul: CLASS_SCALE.archer,
    res: 'focus',
    resLabel: '집중',
    resBar: 'focus',
    resStart: 20,
    regen: 6,
    hp: 100,
    skills: [
      skill({ id: 'shot', name: '관통 사격', key: '1', cd: 0.8, lock: 0.26, kind: 'projectile', power: 54, gain: 10, range: 24, sfx: 'pierce', color: '#ffe7a0' }),
      skill({ id: 'volley', name: '다중 사격', key: '2', cd: 5, cost: 18, lock: 0.4, kind: 'rain', power: 108, range: 22, sfx: 'multi', color: '#ffd27a' }),
      skill({ id: 'mark', name: '표식', key: '3', cd: 12, cost: 12, lock: 0.3, kind: 'shout', power: 24, range: 24, sfx: 'pierce', color: '#ffb15a' }),
      skill({ id: 'rain', name: '화살비', key: '4', cd: 10, cost: 36, lock: 0.45, kind: 'rain', power: 155, range: 24, sfx: 'rain', color: '#fff1b8' }),
      lock('5'),
      lock('6'),
    ],
  },
  assassin: {
    id: 'assassin',
    name: '암살자',
    role: '근거리',
    blurb: '가시 갑각과 곡쌍검. 기력으로 파고든다.',
    seam: '#ff3355',
    heightMul: CLASS_SCALE.assassin,
    res: 'energy',
    resLabel: '기력',
    resBar: 'energy',
    resStart: 80,
    regen: 16,
    hp: 100,
    skills: [
      skill({ id: 'daggers', name: '연속 베기', key: '1', cd: 0.5, cost: 12, lock: 0.26, kind: 'melee', power: 40, range: 7.6, sfx: 'combo', color: '#e8eef2' }),
      skill({ id: 'shadow', name: '점멸', key: '2', cd: 6, cost: 22, lock: 0.36, kind: 'dash', power: 96, range: 8.4, dash: true, sfx: 'blink', color: '#9aa6b2' }),
      skill({ id: 'stealth', name: '은신', key: '3', cd: 9, cost: 18, lock: 0.25, kind: 'stealth', sfx: 'dodge', color: '#7aa0c4' }),
      skill({ id: 'tape', name: '맹독', key: '4', cd: 8, cost: 28, lock: 0.34, kind: 'bind', power: 70, range: 12, sfx: 'poison', color: '#7dff6a' }),
      lock('5'),
      lock('6'),
    ],
  },
};

export const CLASS_IDS = ['warrior', 'mage', 'priest', 'archer', 'assassin'];

const ALIAS = {
  warrior: 'warrior', tank: 'warrior', '전사': 'warrior',
  mage: 'mage', '마법사': 'mage',
  priest: 'priest', '사제': 'priest',
  archer: 'archer', '궁수': 'archer',
  assassin: 'assassin', '암살자': 'assassin',
};

export function normalizeClass(raw) {
  if (!raw) return '';
  return ALIAS[String(raw).toLowerCase()] || ALIAS[raw] || '';
}

export function getClass(id) {
  return CLASSES[id] || CLASSES.warrior;
}

const KIND_TIP = {
  melee: ['근접', '전방의 대상을 벤다'],
  dash: ['이동', '뛰어들며 피해를 준다'],
  shout: ['광역', '주변 대상을 흔든다'],
  spin: ['광역', '몸을 돌려 원을 벤다'],
  projectile: ['투사체', '날려 맞춘다'],
  nova: ['광역', '발밑에 고리를 친다'],
  bind: ['제어', '대상을 묶거나 짓누른다'],
  rain: ['장판', '범위 안에 계속 떨어진다'],
  heal: ['치유', '아군의 체력을 회복한다'],
  healParty: ['파티', '아군에게 보호를 건다'],
  stealth: ['생존', '잠시 모습을 감춘다'],
};

export function describeSkill(s, cls) {
  const spec = cls || getClass('warrior');
  const [type, verb] = KIND_TIP[s.kind] || ['기술', '사용한다'];
  let effect = verb;
  if (s.power) effect += `. 피해 ${s.power}`;
  if (s.heal) effect += `. 치유 ${s.heal}`;
  if (s.gain) effect += `. ${spec.resLabel} +${s.gain}`;
  if (s.gainOnCast) effect += `. ${spec.resLabel} +${s.gainOnCast}`;
  const area = ['nova', 'spin', 'rain', 'shout', 'healParty'].includes(s.kind);
  return {
    name: s.name,
    key: s.key,
    type,
    color: spec.seam,
    effect,
    cd: s.cd,
    cost: s.cost || 0,
    res: spec.resLabel,
    range: s.range,
    cast: s.lock || 0,
    area,
  };
}

export const AURAS = {
  buff_power: { name: '힘의 인장', kind: '강화', effect: '가하는 피해가 오른다', color: '#ffb000' },
  buff_shield: { name: '보호막', kind: '보호', effect: '받는 피해를 막는다', color: '#7ec8ff' },
  buff_haste: { name: '가속', kind: '강화', effect: '공격 속도가 오른다', color: '#ffd27a' },
  buff_regen: { name: '재생', kind: '치유', effect: '체력이 조금씩 돌아온다', color: '#7dffb0' },
  debuff_burn: { name: '균열 화상', kind: '약화', effect: '지속 피해를 입는다', color: '#ff7a3a' },
  debuff_armorbreak: { name: '방어 분쇄', kind: '약화', effect: '받는 피해가 늘어난다', color: '#e07070' },
  debuff_slow: { name: '둔화', kind: '약화', effect: '이동이 느려진다', color: '#9fd6ff' },
  debuff_stun: { name: '기절', kind: '제어', effect: '잠시 움직이지 못한다', color: '#f4e2b0' },
};
