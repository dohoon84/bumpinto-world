// [pangyo-npc] 판교 IT 직장인 NPC: 직무·대사·시간대 밀도 (순수 데이터/함수 — node 테스트에서 그대로 씀)
//   라벨은 회사 '이니셜'만: "K사 백엔드 개발자" / "K Co. Backend Developer". 실제 회사 이름·로고·브랜드 색은 쓰지 않는다.

// 직무 풀: common 은 모든 회사, 나머지는 회사 업종(kind)별로 더한다
export const ROLES = {
  common: [
    ['PM', 'PM'], ['PO', 'PO'], ['UX 디자이너', 'UX Designer'], ['UI 디자이너', 'UI Designer'], ['프로덕트 디자이너', 'Product Designer'],
    ['프론트엔드 개발자', 'Frontend Developer'], ['백엔드 개발자', 'Backend Developer'], ['DevOps 엔지니어', 'DevOps Engineer'], ['SRE', 'SRE'],
    ['데이터 엔지니어', 'Data Engineer'], ['데이터 분석가', 'Data Analyst'], ['ML 엔지니어', 'ML Engineer'], ['QA 엔지니어', 'QA Engineer'],
    ['보안 엔지니어', 'Security Engineer'], ['iOS 개발자', 'iOS Developer'], ['안드로이드 개발자', 'Android Developer'], ['테크 리드', 'Tech Lead'],
    ['인프라 엔지니어', 'Infra Engineer'], ['테크니컬 라이터', 'Technical Writer'],
  ],
  platform: [['서버 개발자', 'Server Developer'], ['검색 엔지니어', 'Search Engineer'], ['플랫폼 엔지니어', 'Platform Engineer'], ['UX 리서처', 'UX Researcher']],
  game: [['게임 기획자', 'Game Designer'], ['클라이언트 개발자', 'Client Programmer'], ['서버 개발자', 'Server Programmer'], ['테크니컬 아티스트', 'Technical Artist'],
    ['3D 아티스트', '3D Artist'], ['레벨 디자이너', 'Level Designer'], ['게임 QA', 'Game QA'], ['사운드 디자이너', 'Sound Designer']],
  security: [['보안 관제 엔지니어', 'SOC Engineer'], ['악성코드 분석가', 'Malware Analyst'], ['침해사고 대응 엔지니어', 'Incident Responder'], ['보안 연구원', 'Security Researcher']],
};
export const rolePool = (kind) => ROLES.common.concat(ROLES[kind] || []);
export const roleLabel = ({ initial, role }, en) => (en ? `${initial} Co. ${role[1]}` : `${initial}사 ${role[0]}`);

// 가벼운 혼잣말 (KO / EN). 시간대별 + 공통
export const LINES = {
  any: [['배포 끝!', 'Deploy done!'], ['빌드 초록불!', 'Build is green!'], ['코드 리뷰 부탁드려요~', 'PR review, please~'], ['커피 한 잔 더…', 'One more coffee…'],
    ['버그 잡았다!', 'Bug squashed!'], ['회의가 또 잡혔네', 'Another meeting…'], ['스프린트 회고 언제더라', 'When is the retro?'], ['오늘 릴리스 무사히!', 'Ship it, safely!']],
  morning: [['스탠드업 5분 전!', 'Standup in 5!'], ['지각은 아니겠지?', "Hope I'm not late"], ['아아 한 잔 하고 출근', 'Iced americano first']],
  lunch: [['점심 뭐 먹지?', "What's for lunch?"], ['판교 점심 줄 길다…', 'Lunch lines are long…'], ['식후 커피 콜?', 'Coffee after lunch?']],
  evening: [['오늘은 칼퇴!', 'Leaving on time!'], ['퇴근 버스 타러 가자', 'Off to the bus'], ['내일 배포 준비 끝', "Tomorrow's deploy is ready"]],
  night: [['야근은 오늘까지만…', 'Last late night…'], ['장애 없이 평화로운 밤', 'Quiet on-call night']],
};

// 시간대(게임 시계, 소수 시간) → 활성 인원 / 장소 비중 / 커피 비율
//   출근 8–10 · 퇴근 18–20: 역 출구·광장·회사 입구에 몰림 / 점심 11:30–13:30: 광장·식당가 / 그 밖은 적게, 밤은 아주 적게
export const MAX_NPC = 36;
const CURVE = [[0, 2], [6, 2], [7, 8], [8, 34], [10, 34], [10.75, 12], [11.5, 30], [13.5, 30], [14.25, 12], [17, 12], [18, 32], [20, 32], [21, 10], [22.5, 3], [24, 2]];
export function npcCount(h) {
  h = ((h % 24) + 24) % 24;
  for (let i = 1; i < CURVE.length; i++) {
    const [h0, n0] = CURVE[i - 1], [h1, n1] = CURVE[i];
    if (h <= h1) return Math.round(n0 + ((n1 - n0) * (h - h0)) / (h1 - h0));
  }
  return CURVE[CURVE.length - 1][1];
}
export function npcPeriod(h) {
  h = ((h % 24) + 24) % 24;
  if (h >= 7.5 && h < 10.25) return 'morning';
  if (h >= 11.25 && h < 13.75) return 'lunch';
  if (h >= 17.5 && h < 20.5) return 'evening';
  if (h >= 21 || h < 6) return 'night';
  return 'day';
}
// 장소 비중: station(역 출구) · deck(광장 데크 위) · company(회사 입구) · food(식당·카페 앞)
export const MIX = {
  morning: { station: 0.45, deck: 0.15, company: 0.35, food: 0.05 },
  lunch: { station: 0.05, deck: 0.35, company: 0.1, food: 0.5 },
  evening: { station: 0.5, deck: 0.15, company: 0.3, food: 0.05 },
  day: { station: 0.15, deck: 0.25, company: 0.35, food: 0.25 },
  night: { station: 0.55, deck: 0.05, company: 0.4, food: 0 },
};
export const COFFEE = { morning: 0.55, lunch: 0.6, evening: 0.12, day: 0.4, night: 0.05 };
export function densityAt(h) { const period = npcPeriod(h); return { count: Math.min(MAX_NPC, npcCount(h)), period, mix: MIX[period], coffee: COFFEE[period] }; }
