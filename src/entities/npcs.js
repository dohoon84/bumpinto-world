// 정자역 주변을 돌아다니는 NPC들 + 가까이 가면 한마디
import * as THREE from 'three';
import { createAvatar, createCat, animateAvatar } from './avatar.js';
import { Bubble } from '../overlay.js';
import {
  STARBASE_NPC_DEFS,
  STARBASE_CROWD_BUILD,
  STARBASE_CROWD_LAUNCH,
  STARBASE_CROWD_VILLAGE,
  STARBASE_CROWD_EXTRA,
  isStarbaseBuildZone,
  isStarbaseLaunchZone,
  isStarbaseVillageZone,
  starbaseCrowdDef,
} from '../regions/starbaseNpcs.js';

// spot/spotKind 는 jeongja.json 라벨·건물 이름. 없으면 역 근처 보도로 떨어진다.
export const NPC_DEFS = [
  { name: '네이버 다니는 민준', look: { color: '#03c75a', bag: '#2d3436', skin: '#f2d0b0', gender: 'm', face: 'round', hair: 'short', top: 'long' }, speed: 1.3, spot: '네이버 그린팩토리',
    lines: ['네이버 1784엔 로봇이 택배 갖다준대요. 저는 아직 로봇보다 늦게 출근해요 🤖', '그린팩토리 1층 도서관 가보셨어요? 앉기만 해도 코드가 잘 짜지는 기분…', '점심 메뉴 고르는 데 회의 2번 했어요. 결론은 또 국밥.'] },
  { name: '탄천 러너 수진', look: { color: '#ff7a59', hat: '#222', pants: '#222', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'pony', top: 'short' }, speed: 2.4, prefer: 'tancheon',
    lines: ['탄천 한 바퀴 뛰고 왔어요! 오리들이 저보다 페이스가 좋아요 🦆', '탄천 자전거길 타면 판교도 금방이에요. 바람만 안 불면요.', '해 질 녘 탄천 산책로는 진짜 정자동 최고 명소예요 🌇'] },
  { name: '신분당선 출근러 지훈', look: { color: '#34495e', bag: '#7f8c8d', skin: '#e8c4a8', pants: '#2c3e50', gender: 'm', face: 'square', hair: 'short', glasses: true, top: 'long' }, speed: 1.6, badge: '1000명돌파',
    lines: ['신분당선 타면 강남 10분대! 요금은… 못 본 걸로 할게요 💸', '8시 반 정자역 개찰구는 마음의 준비가 필요합니다.', '수인분당선 탈까 신분당선 탈까, 매일 아침 인생 최대 고민이에요.'] },
  { name: '카페거리 바리스타 하은', look: { color: '#8e6e53', hat: '#f5f0e6', skin: '#f2d0b0', pants: '#3d342c', gender: 'f', face: 'round', hair: 'long', top: 'long' }, speed: 1.0, prefer: 'cafe', spot: '스타벅스 정자동',
    lines: ['스타벅스 정자동은 평림빌딩 앞에서 줄이 먼저 보여요.', '아이스 아메리카노는 오전이 제일 빨리 나가요.', '정자역에서 이어진 인도로 오면 문이 바로예요.'] },
  { name: '배달 라이더 성호', look: { color: '#ffd32a', hat: '#e84118', pants: '#2f3640', skin: '#d7a888', gender: 'm', face: 'square', hair: 'short', top: 'hoodie' }, speed: 2.0, spot: '백궁프라자1',
    lines: ['정자동 오피스텔 미로는 3년째 공략 중이에요 🛵', '백궁프라자 지하 맛집은 배달보다 직접 가는 게 빨라요.', '비 오는 날 콜이 터지면… 정자역이 제 사무실이에요.'] },
  { name: '산책하는 동네 주민', look: { color: '#a29bfe', hat: '#dfe6e9', pants: '#636e72', skin: '#e8c4a8', gender: 'm', face: 'long', hair: 'short', beard: 'full', top: 'long' }, speed: 0.8, badge: '1000명돌파',
    lines: ['여기 옛날엔 다 논밭이었어~ 지금은 빌딩 숲이지 뭐.', '분당두산타워 불 켜지면 퇴근 시간인 줄 알아.', '젊은이, 밥은 먹고 다니지? 정자동은 맛집이 많아요.'] },
  { name: '정자동 고양이 치즈', cat: true, look: { color: '#f0a050' }, speed: 0.7,
    lines: ['냐옹. (츄르는 행정복지센터 앞 벤치에서 받습니다)', '냥… 여기 화단은 내 구역이다옹 🐾', '…(무시하고 그루밍 중)'] },

  { name: '분당두산타워 퇴근 서연', look: { color: '#2c3e50', bag: '#1f2a36', pants: '#3b4252', skin: '#f6d7c3', gender: 'f', face: 'long', hair: 'long', glasses: true, top: 'long' }, speed: 1.35, spot: '분당두산타워',
    lines: ['분당두산타워 불 꺼지기 전에 나왔어요. 정자역까지만 걸으면 신분당선이에요.', '회의실 예약이 또 겹쳤어요. 복도에서 서서 끝냈습니다.', '점심은 타워 나가서 먹는데, 성남대로 신호가 밥보다 길어요.'] },
  { name: 'SK-U타워 야근 도윤', look: { color: '#1e3a5f', bag: '#4a5568', pants: '#2d3436', skin: '#d7a888', gender: 'm', face: 'square', hair: 'short', glasses: true, top: 'long' }, speed: 1.45, spot: 'SK-U타워',
    lines: ['SK-U타워 야근이면 정자역 막차 시간부터 계산해요.', '오늘 회의는 자료만 세 번 바뀌었어요. 결론은 다음 주.', '킨스타워 쪽 바람은 센데, 그래도 지하보다 걷기가 나아요.'] },
  { name: '킨스타워 출근 하준', look: { color: '#4f7cff', bag: '#2d3436', pants: '#3b4252', skin: '#f2d0b0', gender: 'm', face: 'round', hair: 'medium', top: 'long' }, speed: 1.55, spot: '킨스타워',
    lines: ['킨스타워 출근은 정자역에서 내려 그냥 걷는 게 제일 빨라요.', '수인분당선은 놓쳤고, 다음 칸 기다리는 중이에요.', '가방이 노트북 두 대라 어깨가 먼저 퇴근했어요.'] },
  { name: '젤존타워 점심 수아', look: { color: '#e8d5c4', bag: '#c4a484', pants: '#5c4a3a', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'pony', top: 'long' }, speed: 1.2, spot: '젤존타워1',
    lines: ['젤존타워1 점심시간이 다 같이 쏟아져요. 엘리베이터를 포기했습니다.', '오늘은 도시락이에요. 정자역 쪽까지 나가면 줄이 더 길어서요.', '회의 끝나고 바로 나오면 성남대로 횡단보도가 한 번에 안 건너져요.'] },

  { name: '1784 회의 예린', look: { color: '#3d4c5c', bag: '#222', pants: '#2f3640', skin: '#e8c4a8', gender: 'f', face: 'square', hair: 'medium', glasses: true, top: 'long' }, speed: 1.25, spot: '네이버 1784',
    lines: ['네이버 1784 회의가 길어서 정자역으로 걸어 내려오는 길이에요.', '그린팩토리 쪽이 더 익숙한데, 오늘은 1784에 잡혀 있었어요.', '대왕판교로 쪽으로 바람이 세요. 코트 자락을 잡고 걸어요.'] },
  { name: '금융결제원 나오는 민재', look: { color: '#243044', bag: '#1a1a1a', pants: '#2c3e50', skin: '#c4926e', gender: 'm', face: 'long', hair: 'short', beard: 'goatee', glasses: true, top: 'long' }, speed: 1.15, spot: '금융결제원',
    lines: ['금융결제원 나와서 정자역으로 가는 길이 제일 익숙해요.', '오후 회의가 하나 더 남았는데, 커피만 들고 돌아갈게요.', '서류 봉투가 가방보다 무거워요. 정자역까지만 참는 중입니다.'] },
  { name: '폴라리스 근무 지민', look: { color: '#5c6b7a', bag: '#3d4c5c', pants: '#3b4252', skin: '#f2d0b0', gender: 'f', face: 'long', hair: 'long', top: 'long' }, speed: 1.3, spot: '폴라리스빌딩',
    lines: ['폴라리스빌딩 회의실 에어컨이 세서 겉옷을 챙겼어요.', '정자역까지 걸어가면 수인분당선이 바로 보여요.', '오늘은 외부 미팅이라 가방만 메고 나왔어요.'] },

  { name: 'EDIYA 알바 유진', look: { color: '#c0392b', hat: '#f5e6d3', pants: '#2d3436', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'pony', top: 'short' }, speed: 0.95, spot: 'EDIYA',
    lines: ['EDIYA 오픈 시간에 오피스 손님이 먼저 줄을 서요.', '아이스는 정자역 출근 시간대에 거의 나가요.', '테이크아웃 잔이 오늘따라 빨리 줄어요. 점심 전이라 그래요.'] },
  { name: '봉명동내커피 단골 시우', look: { color: '#6b4f3a', bag: '#3d342c', pants: '#3b4252', skin: '#e8c4a8', gender: 'm', face: 'round', hair: 'medium', glasses: true, top: 'hoodie' }, speed: 1.05, spot: '봉명동내커피',
    lines: ['봉명동내커피는 집 앞에서 한 잔 하고 들어가는 집이에요.', '오늘은 라떼요. 내정로 쪽 바람이 잔에 먼저 닿아요.', '자리 나면 창가예요. 골목이 조용해서 노트북을 펴요.'] },
  { name: '스타벅스 문 여는 채원', look: { color: '#006241', hat: '#1e3932', pants: '#2d3436', skin: '#d7a888', gender: 'f', face: 'square', hair: 'long', top: 'long' }, speed: 1.0, spot: '스타벅스', spotKind: 'cafe',
    lines: ['이 스타벅스는 문 열자마자 아메리카노 줄이에요.', '그린팩토리 쪽이랑 정자역 쪽이 손님이 달라요. 지금은 출근 잔이에요.', '사이즈 고르다 뒤에 줄 서는 거, 매일 보는 풍경이에요.'] },

  { name: '성남대로 점심 현우', look: { color: '#d35400', bag: '#2d3436', pants: '#3b4252', skin: '#f2d0b0', gender: 'm', face: 'square', hair: 'short', top: 'short' }, speed: 1.4, badge: '1000명돌파',
    lines: ['성남대로 점심 시간엔 횡단보도마다 사람이 쌓여요.', '정자역 8시 반은 개찰구가 일이에요. 지금은 밥 먹으러 나온 거예요.', '수인분당선 놓치면 다음 차는 서서 가요. 그래서 걸어 나와요.'] },
  { name: '시그마타워 도시락 나연', look: { color: '#f4efe4', bag: '#c0392b', pants: '#5c5346', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'medium', top: 'long' }, speed: 1.15, spot: '시그마타워',
    lines: ['시그마타워 도시락 먹는 자리가 마땅치 않아서 밖으로 나왔어요.', '회의가 12시 넘어서 끝났어요. 점심이 오후 일정이 됐어요.', '정자역 방향으로 걸으면 바람이라도 쐬어요.'] },
  { name: '제나프라자 식사 건우', look: { color: '#845ef7', pants: '#2d3436', skin: '#c4926e', gender: 'm', face: 'round', hair: 'short', top: 'short' }, speed: 1.25, spot: '제나프라자',
    lines: ['제나프라자 근처는 점심만 되면 복도가 식당이에요.', '메뉴 고르다 회의 시간 됐어요. 그래서 빨리 먹고 돌아가요.', '정자역까지는 밥 먹고 걸으면 딱 소화되는 거리예요.'] },

  { name: '정자역프라자 택배 동혁', look: { color: '#e67e22', hat: '#2d3436', pants: '#1e272e', skin: '#a87556', gender: 'm', face: 'square', hair: 'bald', top: 'short' }, speed: 1.7, spot: '정자역프라자',
    lines: ['정자역프라자 택배는 수령인이 회의에 들어가 있으면 한 바퀴를 더 돌아요.', '오피스텔 호수는 외우고, 엘베는 매번 기다려요.', '비 오기 전에 정자역 쪽 물량만 끝내고 싶어요.'] },
  { name: '백궁프라자 퀵 하늘', look: { color: '#ff6b35', hat: '#f5f0e6', pants: '#2f3640', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'pony', top: 'hoodie' }, speed: 2.1, spot: '백궁프라자2',
    lines: ['백궁프라자2는 출입구가 비슷해서 한 번 더 확인해요.', '퀵은 정자역 일대가 점심에 막혀요. 인도는 또 사람이에요.', '호출 오면 헬멧부터 씁니다. 성남대로는 신호 보고 건너요.'] },

  { name: '백현중 하교 지아', look: { color: '#f4d35e', bag: '#3d5a80', pants: '#2c3e50', skin: '#f2d0b0', gender: 'f', face: 'round', hair: 'medium', top: 'short' }, speed: 1.35, spot: '백현중학교',
    lines: ['백현중학교 하교하면 정자역까지 버스랑 도보를 고민해요.', '가방이 무거워서 수인분당선 타면 앉고 싶어요.', '오늘은 동아리 끝나고 나와서 해가 벌써 기울었어요.'] },
  { name: '급식 먹고 온 준호', look: { color: '#3d5a80', bag: '#f4d35e', pants: '#2d3436', skin: '#e8c4a8', gender: 'm', face: 'round', hair: 'short', top: 'short' }, speed: 1.4, spot: '백현중학교 급식실',
    lines: ['백현중학교 급식실 쪽이 오늘 메뉴가 괜찮았어요.', '집 가는 길에 정자역에서 친구랑 헤어져요.', '숙제보다 배고픈 게 먼저라 하교가 빨라요.'] },
  { name: '분당중 하교 서현', look: { color: '#e64980', bag: '#2d3436', pants: '#3b4252', skin: '#d7a888', gender: 'f', face: 'long', hair: 'long', top: 'hoodie' }, speed: 1.3, spot: '분당중학교',
    lines: ['분당중학교에서 정자역까지, 친구랑 수다 떨면 금세예요.', '수인분당선 학생 시간엔 문이 열리자마자 들어가야 앉아요.', '동아리 끝나고 역에서 시간 보고 있어요.'] },

  { name: '이마트 장보기 정훈', look: { color: '#20c997', bag: '#145c4a', pants: '#2d3436', skin: '#c4926e', gender: 'm', face: 'square', hair: 'short', top: 'short' }, speed: 1.0, spot: '이마트에브리데이 분당정자점',
    lines: ['이마트에브리데이 분당정자점 장바구니가 생각보다 무거워요.', '퇴근하고 들르니 계산대에 직장인 가방이 많아요.', '정자역으로 돌아가기 전에 봉지부터 정리해요.'] },
  { name: '마트 가는 은지', look: { color: '#ff6b6b', bag: '#f4efe4', pants: '#5c4a3a', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'pony', top: 'long' }, speed: 1.1, spot: '이마트에브리데이 분당정자점',
    lines: ['이마트에브리데이는 점심 직후가 덜 붐벼요. 오늘은 타이밍을 놓쳤어요.', '우유랑 김밥이면 저녁은 된 거죠. 회의가 길어서요.', '봉지가 양손이라 정자역 계단이 고민이에요.'] },
  { name: '오피스텔 장바구니 태민', look: { color: '#74b9ff', bag: '#dfe6e9', pants: '#2d3436', skin: '#e8c4a8', gender: 'm', face: 'long', hair: 'medium', top: 'hoodie' }, speed: 1.05, spot: '푸르지오시티오피스텔',
    lines: ['푸르지오시티오피스텔에 올려놓고 다시 정자역으로 나갈 일정이 있어요.', '1인 가구 장보기는 이틀치가 한계예요. 가방이 이미 꽉 찼어요.', '오피스텔 복도에서 택배랑 마주치면 엘베를 한 번 더 기다려요.'] },

  { name: '수인분당선 환승 유나', look: { color: '#f59f00', bag: '#6c4a12', pants: '#3b4252', skin: '#f2d0b0', gender: 'f', face: 'square', hair: 'short', glasses: true, top: 'long' }, speed: 1.5, badge: '1000명돌파',
    lines: ['수인분당선에서 신분당선으로 갈아타는 동선, 아직 눈이 가요.', '정자역 환승 통로가 출근 시간엔 강물이에요.', '판교 가려면 여기서 내리는 사람이 많아서 문이 안 닫혀요.'] },
  { name: '1303 기다리는 재민', look: { color: '#ee2737', pants: '#2c3e50', skin: '#d7a888', gender: 'm', face: 'round', hair: 'short', top: 'long' }, speed: 0.9, badge: '1000명돌파',
    lines: ['1303 직행은 정자역 정류장에서 자리가 갈려요.', '좌석 버스라 서 있으면 아쉽죠. 한 대만 더 기다려 볼게요.', '성남대로 쪽 정류장 패널 보고 나오면 마음이 편해요.'] },
  { name: '행정복지센터 민서', look: { color: '#6c8eae', pants: '#3b4252', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'medium', top: 'long' }, speed: 1.0, spot: '정자1동행정복지센터',
    lines: ['정자1동행정복지센터 민원은 점심 직전에 몰려요.', '도장 하나 받으러 왔다가 번호표가 길어졌어요.', '일 보고 정자역으로 걸어 나가요. 이 길이 제일 단순해요.'] },

  { name: '탄천 자전거 민호', look: { color: '#0984e3', hat: '#d63031', pants: '#2d3436', skin: '#c4926e', gender: 'm', face: 'square', hair: 'short', top: 'short' }, speed: 2.2, prefer: 'tancheon',
    lines: ['탄천 자전거도로는 출퇴근이랑 겹치면 벨을 자주 눌러요.', '정자역 쪽까지 뛰어오면 바람이 달라요.', '저녁에 탄천은 직장인 운동화 소리가 많아요.'] },
  { name: '샘스 앞 유리', look: { color: '#c4a484', hat: '#f4efe4', pants: '#3d342c', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'long', top: 'long' }, speed: 0.95, spot: "Sam's",
    lines: ['샘스는 태남프라자 길가 쪽이에요. 문 앞에서 잠깐 줄 서요.', '케이크는 오후에 빨리 줄어요. 오늘은 커피만 살게요.', '정자역에서 내려온 인도가 이 문 앞까지 이어져요.'] },
  { name: '카페드윤 단골 하린', look: { color: '#6b4c7a', bag: '#2d3436', pants: '#3b4252', skin: '#e8c4a8', gender: 'f', face: 'long', hair: 'medium', top: 'hoodie' }, speed: 1.05, spot: 'Café De Yun',
    lines: ['카페드윤은 백현로 골목이라, 인도가 이어져야 가게가 보여요.', '창가 자리는 노트북 손님이 먼저예요. 저는 테이크아웃이요.', '오늘은 핸드드립이에요. 골목 바람이 잔을 식혀요.'] },

  { name: '정자점 바리스타 소연', look: { color: '#006241', hat: '#1e3932', pants: '#2d3436', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'pony', top: 'short' }, speed: 0.42, spot: '스타벅스 정자동', interior: 0,
    lines: ['1층이 통유리라 샷 내리는 게 밖에서 다 보여요.', '평림빌딩 앞 줄이 유리 너머로 보여서 잔을 미리 꺼내 둬요.', '창가 쪽은 제가 서고, 머신은 안쪽에 있어요.'] },
  { name: '정자점 바리스타 민혁', look: { color: '#1e3932', hat: '#006241', pants: '#2c3338', skin: '#e8c4a8', gender: 'm', face: 'square', hair: 'short', top: 'short' }, speed: 0.32, spot: '스타벅스 정자동', interior: 1,
    lines: ['카운터 안쪽에서 에스프레소를 뽑고 있어요.', '유리가 벽이라 손님 표정이 바로 보여요.', '오늘은 샷을 두 잔씩 내리고 있습니다.'] },
  { name: '창가 바리스타 예나', look: { color: '#006241', pants: '#243038', skin: '#f2d0b0', gender: 'f', face: 'long', hair: 'long', top: 'long' }, speed: 0.4, spot: '스타벅스', interior: 0,
    lines: ['이 스타벅스 1층은 통유리예요. 제조하는 손이 밖으로 보여요.', '창가에 서 있으면 출근길 손님이 먼저 들어와요.', '잔 뚜껑 닫는 소리가 유리에 붙어 들려요.'] },
  { name: '카운터 바리스타 이안', look: { color: '#1e3932', hat: '#d7c4a3', pants: '#2d3436', skin: '#d7a888', gender: 'm', face: 'round', hair: 'medium', top: 'short' }, speed: 0.3, spot: '스타벅스', interior: 1,
    lines: ['머신 앞에 서 있으니 유리 밖 인도가 카페 안처럼 보여요.', '사이즈 묻는 동안 샷이 먼저 떨어져요.', '카운터 안쪽이라 발은 바닥 타일 위예요.'] },
  { name: '홀 바리스타 서아', look: { color: '#006241', hat: '#f4efe4', pants: '#3b4252', skin: '#f6d7c3', gender: 'f', face: 'square', hair: 'medium', top: 'short' }, speed: 0.45, spot: '스타벅스 매장', interior: 0,
    lines: ['이 매장은 벽 대신 유리라 홀이 통째로 보여요.', '창가를 닦고 나면 안이 더 잘 보여요.', '자리 치우는 동안에도 밖이 다 보여요.'] },
  { name: '머신 앞 태경', look: { color: '#16382c', pants: '#2d3436', skin: '#c4926e', gender: 'm', face: 'long', hair: 'short', glasses: true, top: 'long' }, speed: 0.28, spot: '스타벅스 매장', interior: 1,
    lines: ['머신 앞이 유리 안쪽이에요. 추출하는 게 보여요.', '포터필터 털고 바로 다음 샷이에요.', '카운터 너머로 주문이 들어와요.'] },
];

function mountNpcTag(overlay, { text, getPos, maxDist, badge }) {
  const tag = overlay.add({
    cls: badge ? 'tag npc has-badge' : 'tag npc',
    text: badge ? '' : text,
    getPos,
    maxDist,
  });
  if (!badge) return tag;
  const mark = document.createElement('span');
  mark.className = 'npc-badge';
  mark.textContent = badge;
  const name = document.createElement('span');
  name.className = 'npc-name';
  name.textContent = text;
  tag.el.replaceChildren(mark, name);
  return tag;
}
function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function pointAt(path, s, out) {
  const pts = path.pts; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    if (acc + L >= s || i === pts.length - 1) {
      const t = L ? Math.min(1, Math.max(0, (s - acc) / L)) : 0, dx = (bx - ax) / (L || 1), dz = (bz - az) / (L || 1);
      out.x = ax + (bx - ax) * t - dz * path.offset * path.side; out.z = az + (bz - az) * t + dx * path.offset * path.side;
      out.dx = dx; out.dz = dz;
      const y0 = pts[i - 1][2] || 0, y1 = pts[i][2] || 0; out.y = y0 + (y1 - y0) * t;
      return out;
    }
    acc += L;
  }
  return out;
}

function ringCenter(ring) {
  let x = 0, z = 0;
  for (const p of ring) { x += p[0]; z += p[1]; }
  return { x: x / ring.length, z: z / ring.length };
}

// 탄천 동쪽 아파트(어른+아이)와 둔치 산책은 항상 두고, 역 서쪽 오피스는 출퇴근·점심에만 더한다.
export const CROWD_APT = 300;
export const CROWD_RIVER = 40;
export const CROWD_OFFICE = 290;
export const CROWD_BASE = CROWD_APT + CROWD_RIVER;
export const CROWD_RUSH = CROWD_OFFICE;
export const CROWD_EXTRA = CROWD_APT + CROWD_RIVER + CROWD_OFFICE;
const OFFICE_LINES = [
  '점심 먹으러 타워 밖으로 나왔어요. 인도에 사람이 가득해요.',
  '아이스 아메리카노 들고 회의 전에 한 바퀴 도는 중이에요.',
  '정자역 뒤쪽은 12시만 되면 커피 들고 이야기하는 사람들예요.',
  '동료랑 잠깐 서서 이야기하고 들어갈게요.',
  '출근길은 성남대로보다 이 골목이 덜 막혀요.',
  '퇴근하면 여기서 정자역까지 걸어 나가요.',
  '오늘 점심은 백궁 쪽에서 줄이 길어서 걸어서 나왔어요.',
  '사원증 찍고 나와서 바람 좀 쐬고 있어요.',
  '엘리베이터를 포기하고 계단으로 점심을 나왔어요.',
  '커피 한 잔이면 오후 회의가 버텨져요.',
];
const HOME_LINES = [
  '회사에서 단지까지 걸어 들어왔어요.',
  '아이 하교 시간에 맞춰 나왔어요.',
  '탄천 건너 회사까지는 이 길이 익숙해요.',
  '저녁에 단지 한 바퀴 도는 중이에요.',
  '장보고 엘리베이터 기다리는 길이에요.',
  '주말에 탄천으로 산책 나가요.',
  '단지 안은 오후에 아이들이 많아요.',
  '출근할 때는 탄천 쪽으로 걸어 나가요.',
];
const KID_LINES = [
  '학교 끝나고 단지 안에서 친구랑 놀고 있어요.',
  '엄마가 회사 갔다 오시면 같이 저녁 먹어요.',
  '탄천까지 걸어가면 오리 볼 수 있어요.',
  '아파트 놀이터에서 한 바퀴만 더 돌게요.',
  '가방이 무거워서 천천히 걸어가요.',
  '동생이랑 편의점 갔다 오는 길이에요.',
  '학원 가기 전에 친구랑 이야기하는 중이에요.',
];
const RIVER_LINES = [
  '탄천 따라 걷다 보면 바람이 시원해요.',
  '둔치에 산책하는 사람이 많아요.',
  '다리 밑까지 갔다 단지 쪽으로 올라갈게요.',
  '오리들 피해서 천천히 걸어요.',
  '회사에서 나와 강변으로 한 바퀴 돌아요.',
  '아이랑 둔치까지 내려왔어요.',
];
const CUPS = ['iced', 'latte', 'hot'];
const BADGES = ['#03c75a', '#1e3a5f', '#243044', '#006241', '#c0392b'];
const PLAZA_X = -74;
const PLAZA_Z = 34;
const FAMILY = [...'김이박최정강조윤장임한오서신권황안송전홍'];
const GIVEN_M = ['서준', '예준', '도현', '시윤', '주원', '건호', '민성', '현준', '우진', '승우', '지호', '준서', '은우', '준혁', '태양', '민규', '성민', '하율', '윤호', '재원', '승민', '동현', '정우', '시온', '규민', '태윤', '민석', '준영', '승현', '지환', '우빈', '현석', '도하', '시완', '재호', '강민', '성준', '지성', '민찬', '준우', '태현', '서우', '도겸', '시후', '은찬', '주호', '이현', '경민', '승호', '도준'];
const GIVEN_F = ['서윤', '하윤', '지유', '채윤', '수빈', '다은', '예원', '소율', '아린', '윤아', '채아', '하림', '지안', '수연', '예진', '다인', '소민', '하영', '채린', '서희', '윤서', '지혜', '수민', '예빈', '다현', '소희', '채은', '서진', '윤지', '지수', '예슬', '다영', '소윤', '채민', '서영', '윤하', '수현', '예림', '다온', '소이', '서율', '윤채', '지율', '채이', '하빈', '나경', '예서', '다혜', '소정', '주아'];
const SHIRTS = ['#4f7cff', '#ff6b6b', '#20c997', '#f59f00', '#845ef7', '#e64980', '#3d5a80', '#d35400', '#6c8eae', '#2c3e50', '#c0392b', '#0984e3', '#e8d5c4', '#74b9ff', '#f4d35e', '#6b4f3a', '#1e3a5f', '#ff7a59', '#a29bfe', '#16a085'];
const PANTS = ['#2d3436', '#3b4252', '#2c3e50', '#3d342c', '#1e272e', '#5c4a3a', '#243044', '#4a3728'];
const SKINS = ['#f2d0b0', '#f6d7c3', '#e8c4a8', '#d7a888', '#c4926e', '#a87556', '#8d5524'];
const HAIR_M = ['short', 'short', 'medium', 'bald', 'short'];
const HAIR_F = ['long', 'pony', 'medium', 'long', 'short'];
const TOPS = ['long', 'short', 'hoodie'];
const FACES = ['round', 'square', 'long'];

function inPlaza(x, z) {
  const dx = x - PLAZA_X, dz = z - PLAZA_Z;
  return dx * dx + dz * dz < 36 * 36;
}
function isOfficeCore(x, z) {
  return x <= -58 && x >= -230 && z >= -200 && z <= 300;
}
function isBackBlock(x, z) {
  return x <= -48 && x >= -370 && z >= -620 && z <= 920;
}
function crowdDef(i, zone, asChild) {
  const female = i % 2 === 1;
  const office = zone === 'office';
  const apt = zone === 'apt';
  const river = zone === 'river';
  const child = !!asChild || (apt && i % 5 < 2) || (river && i % 4 === 0);
  const given = (child ? (female ? GIVEN_F : GIVEN_M) : (female ? GIVEN_F : GIVEN_M))[Math.floor(i / 2) % 50];
  const coffee = !child && ((office && i % 5 < 2) || (apt && i % 8 === 0)) ? CUPS[i % 3] : null;
  const badge = !child && ((office && i % 3 !== 2) || (apt && i % 5 === 1)) ? BADGES[i % BADGES.length] : null;
  const social = child ? i % 3 !== 2 : office ? i % 4 < 2 : (apt && i % 6 === 0) || (river && i % 5 === 1);
  const lines = child ? KID_LINES : office ? OFFICE_LINES : river ? RIVER_LINES : HOME_LINES;
  return {
    name: FAMILY[i % FAMILY.length] + given,
    crowd: true,
    role: office ? 'office' : zone,
    child,
    social,
    speed: child ? 0.95 + (i % 5) * 0.12 : (social ? 0.78 : 0.9) + (i % 8) * 0.1,
    lines,
    look: {
      color: SHIRTS[i % SHIRTS.length],
      pants: PANTS[(i * 5) % PANTS.length],
      skin: SKINS[(i * 3) % SKINS.length],
      gender: female ? 'f' : 'm',
      face: FACES[i % FACES.length],
      hair: child ? (female ? HAIR_F : HAIR_M)[i % 3] : (female ? HAIR_F : HAIR_M)[i % 5],
      top: child ? (i % 2 ? 'hoodie' : 'short') : TOPS[i % TOPS.length],
      glasses: !child && (i % 6 === 0 || !!badge),
      beard: child || female ? 'none' : i % 11 === 0 ? 'full' : i % 13 === 0 ? 'goatee' : 'none',
      hat: child || badge ? null : (i % 8 === 3 ? SHIRTS[(i + 5) % SHIRTS.length] : null),
      bag: child ? (i % 2 === 0 ? '#3d5a80' : null) : (i % 4 === 0 ? '#2d3436' : null),
      scale: child ? 0.62 + (i % 4) * 0.035 : 0.94 + (i % 5) * 0.03,
      coffee,
      badge,
    },
  };
}

export function getNpcCapForRegion(regionId = 'jeongja') {
  if (regionId === 'starbase') return STARBASE_NPC_DEFS.length + STARBASE_CROWD_EXTRA;
  return NPC_DEFS.length + CROWD_EXTRA;
}

export class NPCs {
  constructor(scene, overlay, world, data, { count, seed = 7, terrain = null, region = null } = {}) {
    const isStarbase = (region?.id === 'starbase') || (data?.station?.name === 'Starbase');
    this.isStarbase = isStarbase;
    this.lang = region?.lang || (isStarbase ? 'en' : 'ko');
    const defs = isStarbase ? STARBASE_NPC_DEFS : NPC_DEFS;
    const defaultCap = isStarbase ? (STARBASE_NPC_DEFS.length + STARBASE_CROWD_EXTRA) : (NPC_DEFS.length + CROWD_EXTRA);
    const totalCount = count == null ? defaultCap : count;
    this.list = []; this.world = world; this.terrain = terrain; this.rush = false; this.shown = 0;
    let sd = seed; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const st = data.station;
    const near = (p, x, z) => Math.min(...p.pts.map(([px, pz]) => Math.hypot(px - x, pz - z)));
    const tc = data.labels.find((l) => l.kind === 'water');
    const cafe = data.labels.filter((l) => l.kind === 'cafe').sort((a, b) => Math.hypot(a.x - st.x, a.z - st.z) - Math.hypot(b.x - st.x, b.z - st.z))[0];
    const spotCache = new Map();
    const spotOf = (name, kind) => {
      const key = (kind || '*') + '\0' + name;
      if (spotCache.has(key)) return spotCache.get(key);
      const label = data.labels.find((l) => l.text === name && (!kind || l.kind === kind));
      let found = label || null;
      if (!found && !kind) {
        const b = data.buildings.find((x) => x.n === name);
        if (b) found = ringCenter(b.o);
      }
      spotCache.set(key, found);
      return found;
    };
    const baseWalkList = isStarbase ? (world.cityWalkPaths || world.walkPaths) : world.walkPaths;
    const candidates = baseWalkList.filter((p) => polyLen(p.pts) > (isStarbase ? 24 : 40) && p.door == null);
    defs.slice(0, totalCount).forEach((def, i) => {
      const named = def.spot ? spotOf(def.spot, def.spotKind) : null;
      const anchor = (def.prefer === 'tancheon' && tc) ? tc : named || (def.prefer === 'cafe' && cafe) || st;
      const room = def.interior != null && world.starbucksRooms?.find((r) => r.spot === def.spot);
      const inside = room?.paths?.[def.interior];
      const linked = !inside && named && world.walkPaths.find((p) => p.name === def.spot && p.door != null);
      let path, len, s0, lo, hi;
      if (inside) {
        path = { pts: inside, offset: 0, side: 1 };
        len = polyLen(path.pts);
        lo = 0; hi = len; s0 = (def.interior === 1 ? len * 0.5 : len * 0.2);
      } else if (linked) {
        path = { ...linked, side: 1 };
        len = polyLen(path.pts);
        const door = Math.max(0, Math.min(len, linked.door));
        lo = Math.max(0, door - 26); hi = Math.min(len, door + 26); s0 = door;
      } else {
        const reach = anchor === st && !def.spot ? 90 + (i % 5) * 18 : def.prefer === 'tancheon' ? 140 : isStarbase ? 240 : 170;
        let pool = candidates.filter((p) => near(p, anchor.x, anchor.z) < reach);
        if (!pool.length) pool = candidates.filter((p) => near(p, anchor.x, anchor.z) < 420);
        if (!pool.length) pool = candidates.filter((p) => near(p, st.x, st.z) < 200);
        if (!pool.length) pool = candidates;
        const base = pool[(Math.floor(rnd() * pool.length) + i) % pool.length] || candidates[0];
        path = { ...base, side: rnd() < 0.5 ? -1 : 1 };
        len = polyLen(path.pts);
        let bestS = 0, bestD = Infinity; const tmp = {};
        for (let s = 0; s < len; s += 4) { pointAt(path, s, tmp); const d = Math.hypot(tmp.x - anchor.x, tmp.z - anchor.z); if (d < bestD) { bestD = d; bestS = s; } }
        const spread = ((i * 19) % 64) - 32;
        lo = 0; hi = len; s0 = Math.max(0, Math.min(len, bestS + spread + (rnd() - 0.5) * 12));
      }
      const mesh = def.cat ? createCat(def.look) : createAvatar(def.look);
      scene.add(mesh);
      const npc = { def, mesh, path, len, lo, hi, s: s0, dir: rnd() < 0.5 ? -1 : 1, pos: new THREE.Vector3(), lineIdx: Math.floor(rnd() * def.lines.length), talking: false, cooldown: 0, pause: 0, active: true };
      const head = () => npc.pos.clone().setY(npc.pos.y + (def.cat ? 0.9 : 2.25)); // [terrain] 높이 상대
      npc.tag = mountNpcTag(overlay, {
        text: def.name,
        badge: def.badge,
        getPos: () => npc.pos.clone().setY(npc.pos.y + (def.cat ? 0.75 : 2.05)),
        maxDist: 45,
      });
      npc.bubble = new Bubble(overlay, 'npc', () => head().setY(head().y + 0.45), { name: def.name });
      this.list.push(npc);
      this._place(npc);
    });
    this._addCrowd(scene, overlay, data, rnd, Math.max(0, totalCount - defs.length));
  }
  _wet(x, z, bridge) {
    if (bridge) return false;
    if (this.world.inWater?.(x, z)) return true;
    const gy = this.world.groundY?.(x, z, 0);
    return gy != null && gy < -6.35;
  }
  // 역 서쪽 오피스 블록은 보행로가 짧아서, 건물 앞 인도 구간을 따로 만든다.
  _frontagePaths(data) {
    const out = [];
    const world = this.world;
    for (const b of data.buildings) {
      if ((b.mh || 0) >= 2.5 || !b.o || b.o.length < 4) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of b.o) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (z < z0) z0 = z;
        if (z > z1) z1 = z;
      }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (this.isStarbase) {
        const inBuildOrLaunch = isStarbaseBuildZone(cx, cz) || isStarbaseLaunchZone(cx, cz);
        if (!inBuildOrLaunch && b.k !== 'industrial' && b.k !== 'warehouse' && b.k !== 'construction') continue;
      } else {
        const back = isBackBlock(cx, cz);
        if (!back && b.k !== 'commercial' && b.k !== 'office' && b.k !== 'retail') continue;
      }
      let cur = [];
      const commit = () => {
        if (polyLen(cur) >= 12) out.push({ pts: cur, offset: 0, side: 1, kind: 'footway', bridge: false, frontage: true });
        cur = [];
      };
      for (let i = 0; i < b.o.length; i++) {
        const [ax, az] = b.o[i], [bx, bz] = b.o[(i + 1) % b.o.length];
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 3) continue;
        const dx = (bx - ax) / L, dz = (bz - az) / L;
        let nx = -dz, nz = dx;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if ((mx + nx - cx) * (mx - cx) + (mz + nz - cz) * (mz - cz) < 0) { nx = -nx; nz = -nz; }
        for (let u = 1.2; u <= L - 1.2; u += 3.6) {
          let placed = null;
          for (const gap of [2.1, 3.1, 1.5]) {
            const px = ax + dx * u + nx * gap, pz = az + dz * u + nz * gap;
            if (inPlaza(px, pz) || world.onRoad(px, pz) || world.isBlocked(px, pz, 0.4) || this._wet(px, pz, false)) continue;
            placed = [px, pz, 0];
            break;
          }
          if (!placed) { commit(); continue; }
          const prev = cur[cur.length - 1];
          if (prev && Math.hypot(placed[0] - prev[0], placed[1] - prev[1]) > 9) commit();
          cur.push(placed);
        }
      }
      commit();
    }
    return out;
  }
  _collectSpots(base, bb, push) {
    const len = polyLen(base.pts);
    if (len < (base.frontage ? 12 : 18)) return;
    const sides = base.offset ? [1, -1] : [1];
    const tmp = {};
    for (const side of sides) {
      const path = { ...base, side };
      const samples = [];
      for (let s = 2; s < len - 2; s += 4) {
        pointAt(path, s, tmp);
        const x = tmp.x, z = tmp.z;
        const inside = x > bb.x0 + 6 && x < bb.x1 - 6 && z > bb.z0 + 6 && z < bb.z1 - 6;
        const inLane = (base.offset > 0 || base.frontage) && this.world.onRoad(x, z);
        let ok = inside && !inPlaza(x, z) && !this.world.isBlocked(x, z, 0.4);
        if (base.river) {
          const gy = this.world.groundY?.(x, z, -6);
          ok = ok && gy != null && gy < -4.2 && gy > -6.45;
        } else ok = ok && !inLane && !this._wet(x, z, base.bridge);
        samples.push({ s, x, z, ok });
      }
      let run = -1;
      const flush = (a, b) => {
        if (a < 0 || samples[b].s - samples[a].s < 8) return;
        const lo = samples[a].s, hi = samples[b].s;
        for (let k = a; k <= b; k += 1) {
          const p = samples[k];
          push({ path, len, lo, hi, s: p.s, x: p.x, z: p.z });
        }
      };
      for (let i = 0; i < samples.length; i++) {
        if (samples[i].ok) { if (run < 0) run = i; }
        else if (run >= 0) { flush(run, i - 1); run = -1; }
      }
      if (run >= 0) flush(run, samples.length - 1);
    }
  }
  _mateSpot(spot) {
    const s = Math.min(spot.hi - 0.25, spot.s + 1.75);
    if (s - spot.s < 1.05) return null;
    const p = pointAt(spot.path, s, {});
    if (spot.path.river) {
      const gy = this.world.groundY?.(p.x, p.z, -6);
      if (this.world.isBlocked(p.x, p.z, 0.35) || gy == null || gy < -6.45 || gy > -4.2) return null;
    } else if (this.world.isBlocked(p.x, p.z, 0.35) || this.world.onRoad(p.x, p.z) || this._wet(p.x, p.z, spot.path.bridge) || inPlaza(p.x, p.z)) return null;
    return { path: spot.path, len: spot.len, lo: spot.lo, hi: spot.hi, s, x: p.x, z: p.z };
  }
  _riverPaths(station) {
    const bank = this.terrain?.bankPath;
    if (!bank || !station) return [];
    const out = [];
    for (const lane of [0.5, 2.2]) {
      const raw = bank(station.x, station.z, lane);
      if (!raw || raw.length < 8) continue;
      out.push({ pts: raw.map(([x, z]) => [x, z, -6]), offset: 0, side: 1, kind: 'path', bridge: false, river: true });
    }
    return out;
  }
  _spawnCrowd(scene, overlay, rnd, spot, zone, buddy, asChild) {
    const def = this.isStarbase
      ? starbaseCrowdDef(this._crowdI++, zone, asChild)
      : crowdDef(this._crowdI++, zone, asChild);
    if (buddy) def.social = true;
    const mesh = createAvatar(def.look);
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    scene.add(mesh);
    const npc = {
      def, mesh, path: spot.path, len: spot.len, lo: spot.lo, hi: spot.hi, s: spot.s,
      dir: rnd() < 0.5 ? -1 : 1, pos: new THREE.Vector3(),
      lineIdx: this._crowdI % def.lines.length, talking: false, cooldown: rnd() * 6,
      pause: def.social ? 2.5 + rnd() * 7 : rnd() * 1.6, active: true, buddy: buddy || null,
    };
    if (buddy) buddy.buddy = npc;
    const top = 2.05 * (def.look.scale || 1);
    const head = () => npc.pos.clone().setY(npc.pos.y + top + 0.2);
    npc.tag = overlay.add({ cls: 'tag npc', text: def.name, getPos: () => npc.pos.clone().setY(npc.pos.y + top), maxDist: 24 });
    npc.tag.hidden = true;
    npc.bubble = new Bubble(overlay, 'npc', () => head().setY(head().y + 0.45), { name: def.name });
    this.list.push(npc);
    this._place(npc);
    return npc;
  }
  _addCrowd(scene, overlay, data, rnd, count) {
    if (!count) return;
    const bb = data.meta.bboxLocal;
    if (this.isStarbase) {
      const spots = { build: [], launch: [], village: [] };
      const pushSb = (spot) => {
        const { x, z } = spot;
        if (isStarbaseBuildZone(x, z)) spots.build.push(spot);
        else if (isStarbaseLaunchZone(x, z)) spots.launch.push(spot);
        else if (isStarbaseVillageZone(x, z)) spots.village.push(spot);
      };
      for (const p of this.world.cityWalkPaths || []) this._collectSpots(p, bb, pushSb);
      for (const p of this._frontagePaths(data)) this._collectSpots(p, bb, pushSb);
      const shuffle = (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
      };
      for (const list of Object.values(spots)) shuffle(list);
      const taken = [];
      for (const n of this.list) taken.push(n.pos.x, n.pos.z);
      const nearTaken = (x, z, gap) => {
        for (let i = 0; i < taken.length; i += 2) if ((taken[i] - x) ** 2 + (taken[i + 1] - z) ** 2 < gap * gap) return true;
        return false;
      };
      this._crowdI = 0;
      let made = 0;
      const fill = (list, limit, gap, zone) => {
        let n = 0;
        for (let i = 0; i < list.length && n < limit; i++) {
          const spot = list[i];
          if (nearTaken(spot.x, spot.z, gap)) continue;
          const npc = this._spawnCrowd(scene, overlay, rnd, spot, zone, null, false);
          taken.push(npc.pos.x, npc.pos.z);
          n++; made++;
          if (n >= limit) break;
          let asChild = false;
          if (zone === 'village' && !npc.def.child && n % 4 === 0) asChild = true;
          else if (!npc.def.social) continue;
          const mate = this._mateSpot(spot);
          if (!mate || nearTaken(mate.x, mate.z, 1.25)) continue;
          const pal = this._spawnCrowd(scene, overlay, rnd, mate, zone, npc, asChild);
          taken.push(pal.pos.x, pal.pos.z);
          n++; made++;
        }
        return n;
      };
      const scale = count / STARBASE_CROWD_EXTRA;
      const buildN = Math.round(STARBASE_CROWD_BUILD * scale);
      const launchN = Math.round(STARBASE_CROWD_LAUNCH * scale);
      const villageN = Math.max(0, count - buildN - launchN);
      const buildMade = fill(spots.build, buildN, 3.0, 'build');
      const launchMade = fill(spots.launch, launchN, 3.2, 'launch');
      const villageMade = fill(spots.village, villageN, 13.5, 'village');
      this.crowdMade = made;
      this.crowdBuild = buildMade;
      this.crowdLaunch = launchMade;
      this.crowdVillage = villageMade;
      return;
    }
    const homes = (data.labels || []).filter((l) => (l.kind === 'apt' || l.kind === 'school') && l.x > 165);
    const nearHome = (x, z, r) => {
      const r2 = r * r;
      for (const h of homes) if ((h.x - x) ** 2 + (h.z - z) ** 2 < r2) return true;
      return false;
    };
    const spots = { office: [], officeOuter: [], apt: [], aptFar: [], river: [] };
    const push = (spot) => {
      if (spot.path.river) { spots.river.push(spot); return; }
      const { x, z } = spot;
      if (isOfficeCore(x, z)) spots.office.push(spot);
      else if (isBackBlock(x, z)) spots.officeOuter.push(spot);
      else if (x > 165 && nearHome(x, z, 110)) spots.apt.push(spot);
      else if (x > 165 && x < 640 && z > -620 && z < 940) spots.aptFar.push(spot);
    };
    for (const p of this.world.cityWalkPaths || []) this._collectSpots(p, bb, push);
    for (const p of this._frontagePaths(data)) this._collectSpots(p, bb, push);
    for (const p of this._riverPaths(data.station)) this._collectSpots(p, bb, push);
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
    };
    for (const list of Object.values(spots)) shuffle(list);
    const taken = [];
    for (const n of this.list) taken.push(n.pos.x, n.pos.z);
    const nearTaken = (x, z, gap) => {
      for (let i = 0; i < taken.length; i += 2) if ((taken[i] - x) ** 2 + (taken[i + 1] - z) ** 2 < gap * gap) return true;
      return false;
    };
    this._crowdI = 0;
    let made = 0;
    const fill = (list, limit, gap, zone) => {
      let n = 0;
      for (let i = 0; i < list.length && n < limit; i++) {
        const spot = list[i];
        if (nearTaken(spot.x, spot.z, gap)) continue;
        const npc = this._spawnCrowd(scene, overlay, rnd, spot, zone, null, false);
        taken.push(npc.pos.x, npc.pos.z);
        n++; made++;
        if (n >= limit) break;
        let asChild = false;
        if (zone === 'apt' && !npc.def.child && n % 3 === 0) asChild = true;
        else if (!npc.def.social) continue;
        const mate = this._mateSpot(spot);
        if (!mate || nearTaken(mate.x, mate.z, 1.15)) continue;
        const pal = this._spawnCrowd(scene, overlay, rnd, mate, zone, npc, asChild);
        taken.push(pal.pos.x, pal.pos.z);
        n++; made++;
      }
      return n;
    };
    const scale = count / CROWD_EXTRA;
    const aptN = Math.round(CROWD_APT * scale);
    const riverN = Math.round(CROWD_RIVER * scale);
    const officeN = Math.max(0, count - aptN - riverN);
    let aptMade = fill(spots.apt, aptN, 4.2, 'apt');
    if (aptMade < aptN) aptMade += fill(spots.aptFar, aptN - aptMade, 5, 'apt');
    const riverMade = fill(spots.river, riverN, 7, 'river');
    let officeMade = fill(spots.office, officeN, 3.3, 'office');
    if (officeMade < officeN) officeMade += fill(spots.officeOuter, officeN - officeMade, 4.6, 'office');
    this.crowdMade = made;
    this.crowdApt = aptMade;
    this.crowdRiver = riverMade;
    this.crowdOffice = officeMade;
  }
  // 특정 NPC에게 새 경로(예: 신호 횡단보도를 왕복하는 길)를 지정
  assignPath(i, pts) {
    const n = this.list[i]; if (!n || pts.length < 2) return;
    n.path = { pts, offset: 0, side: 1 }; n.len = polyLen(pts); n.lo = 0; n.hi = n.len; n.s = 1; n.dir = 1; n.pause = 0; this._place(n);
  }
  _redLight(n) {
    const reach = 2.2 + (n.def?.speed || 1.2) * 0.55;
    const a = pointAt(n.path, n.s + (n.dir || 1) * reach, {});
    let hx = a.x - n.pos.x, hz = a.z - n.pos.z;
    if (Math.hypot(hx, hz) < 0.08) { hx = n.hx || 0; hz = n.hz || 0; }
    return this.guard(n.pos.x, n.pos.z, hx, hz);
  }
  _place(n) {
    const p = pointAt(n.path, n.s, {}); n.hx = p.dx * n.dir; n.hz = p.dz * n.dir;
    // 경로 점이 현재 발보다 높으면(신기교 아치) 그 높이를 기준으로 상판을 고른다. 둔치(음수)는 기존 높이를 유지
    const py = p.y || 0;
    const ref = py < -1 ? py : (py > n.pos.y + 0.05 ? py : n.pos.y);
    n.pos.set(p.x, this.world.groundY ? this.world.groundY(p.x, p.z, ref) : 0, p.z); // [terrain] 지형 높이
    n.mesh.position.copy(n.pos); n.mesh.rotation.y = Math.atan2(p.dx * n.dir, p.dz * n.dir);
  }
  setCrowdLevel(mode) {
    const rush = !!mode && mode !== 'normal';
    if (this._leveled && rush === this.rush) return;
    this.rush = rush;
    this._leveled = true;
    let shown = 0;
    for (const n of this.list) {
      if (!n.def.crowd) { n.active = true; shown++; continue; }
      const on = n.def.role !== 'office' || rush;
      n.active = on;
      if (!on) {
        n.mesh.visible = false;
        if (n.tag) n.tag.hidden = true;
        if (n.bubble) n.bubble.item.hidden = true;
        n.talking = false;
        if (n.mesh.userData) n.mesh.userData.chatting = false;
      } else shown++;
    }
    this.shown = shown;
  }
  update(dt, player, camera) {
    const overview = !!(camera && camera.position.y > 40);
    const viewR2 = (overview ? 220 : 115) ** 2;
    const animR2 = (overview ? 90 : 78) ** 2;
    const tagNear = 24 * 24;
    const tagFar = 45 * 45;
    for (const n of this.list) {
      if (n.active === false) {
        if (n.mesh.visible) n.mesh.visible = false;
        continue;
      }
      const dx = player.x - n.pos.x, dz = player.z - n.pos.z;
      const d2 = dx * dx + dz * dz;
      const shown = d2 < viewR2;
      if (n.mesh.visible !== shown) n.mesh.visible = shown;
      if (n.tag) {
        const hideTag = d2 > (n.def.crowd ? tagNear : tagFar);
        if (n.tag.hidden !== hideTag) n.tag.hidden = hideTag;
      }
      let step = dt;
      if (!shown) {
        n._skip = (n._skip || 0) + dt;
        if (n._skip < 0.5) continue;
        step = n._skip;
        n._skip = 0;
      }
      const close = d2 < 42.25;
      if (close || n.bubble.showing) n.bubble.tick();
      n.cooldown -= step;
      if (close && n.cooldown <= 0 && !n.bubble.showing) {
        n.bubble.say(n.def.lines[n.lineIdx++ % n.def.lines.length], 5000); n.cooldown = 8; n.talking = true;
      }
      if (n.talking && (d2 > 100 || (!n.bubble.showing && !close))) n.talking = false;
      let speed = 0;
      if (n.mesh.userData) n.mesh.userData.chatting = false;
      if (n.talking || n.bubble.showing) {
        const target = Math.atan2(player.x - n.pos.x, player.z - n.pos.z);
        n.mesh.rotation.y += Math.atan2(Math.sin(target - n.mesh.rotation.y), Math.cos(target - n.mesh.rotation.y)) * Math.min(1, step * 6);
      } else if (n.buddy && n.buddy.active !== false && n.buddy.pause > 0.5 && n.pause <= 0) {
        const bx = n.buddy.pos.x - n.pos.x, bz = n.buddy.pos.z - n.pos.z;
        if (bx * bx + bz * bz < 20) n.pause = Math.min(6, n.buddy.pause);
      }
      if (n.talking || n.bubble.showing) {
        // 말 거는 동안은 제자리
      } else if (n.pause > 0) {
        n.pause -= step;
        if (n.def.social && n.mesh.userData) {
          n.mesh.userData.chatting = true;
          const face = n.buddy && n.buddy.active !== false ? n.buddy.pos : null;
          if (face) {
            const target = Math.atan2(face.x - n.pos.x, face.z - n.pos.z);
            n.mesh.rotation.y += Math.atan2(Math.sin(target - n.mesh.rotation.y), Math.cos(target - n.mesh.rotation.y)) * Math.min(1, step * 4);
          }
        }
      } else if (shown && this.guard && this._redLight(n)) {
        if (!n.waiting) {
          n.waiting = true;
          this.waitCount = (this.waitCount || 0) + 1;
          const waitMsg = this.lang === 'en' ? '🚦 Red light — holding here for a sec.' : '🚦 빨간불이네요, 잠깐 기다려요';
          if (close && Math.random() < 0.35 && !n.bubble.showing) n.bubble.say(waitMsg, 2500);
        }
      } else {
        n.waiting = false;
        if (n.def.social && (this.rush || n.def.role !== 'office') && Math.random() < step * 0.04) n.pause = 4 + Math.random() * 8;
        else {
          speed = n.def.speed;
          n.s += n.dir * speed * step;
          const lo = n.lo || 0, hi = n.hi ?? n.len;
          if (n.s > hi || n.s < lo) { n.dir *= -1; n.s = Math.max(lo, Math.min(hi, n.s)); n.pause = n.def.social ? 2 + Math.random() * 5 : 0.6 + Math.random() * 1.6; }
          this._place(n);
        }
      }
      if (d2 < animR2) animateAvatar(n.mesh, speed, step);
    }
  }
}
