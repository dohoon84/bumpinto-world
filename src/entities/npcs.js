// 정자역 주변을 돌아다니는 NPC들 + 가까이 가면 한마디
import * as THREE from 'three';
import { createAvatar, createCat, animateAvatar } from './avatar.js';
import { Bubble } from '../overlay.js';

// spot/spotKind 는 jeongja.json 라벨·건물 이름. 없으면 역 근처 보도로 떨어진다.
export const NPC_DEFS = [
  { name: '네이버 다니는 민준', look: { color: '#03c75a', bag: '#2d3436', skin: '#f2d0b0', gender: 'm', face: 'round', hair: 'short', top: 'long' }, speed: 1.3, spot: '네이버 그린팩토리',
    lines: ['네이버 1784엔 로봇이 택배 갖다준대요. 저는 아직 로봇보다 늦게 출근해요 🤖', '그린팩토리 1층 도서관 가보셨어요? 앉기만 해도 코드가 잘 짜지는 기분…', '점심 메뉴 고르는 데 회의 2번 했어요. 결론은 또 국밥.'] },
  { name: '탄천 러너 수진', look: { color: '#ff7a59', hat: '#222', pants: '#222', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'pony', top: 'short' }, speed: 2.4, prefer: 'tancheon',
    lines: ['탄천 한 바퀴 뛰고 왔어요! 오리들이 저보다 페이스가 좋아요 🦆', '탄천 자전거길 타면 판교도 금방이에요. 바람만 안 불면요.', '해 질 녘 탄천 산책로는 진짜 정자동 최고 명소예요 🌇'] },
  { name: '신분당선 출근러 지훈', look: { color: '#34495e', bag: '#7f8c8d', skin: '#e8c4a8', pants: '#2c3e50', gender: 'm', face: 'square', hair: 'short', glasses: true, top: 'long' }, speed: 1.6,
    lines: ['신분당선 타면 강남 10분대! 요금은… 못 본 걸로 할게요 💸', '8시 반 정자역 개찰구는 마음의 준비가 필요합니다.', '수인분당선 탈까 신분당선 탈까, 매일 아침 인생 최대 고민이에요.'] },
  { name: '카페거리 바리스타 하은', look: { color: '#8e6e53', hat: '#f5f0e6', skin: '#f2d0b0', pants: '#3d342c', gender: 'f', face: 'round', hair: 'long', top: 'long' }, speed: 1.0, prefer: 'cafe', spot: '스타벅스 정자동',
    lines: ['스타벅스 정자동은 평림빌딩 앞에서 줄이 먼저 보여요.', '아이스 아메리카노는 오전이 제일 빨리 나가요.', '정자역에서 이어진 인도로 오면 문이 바로예요.'] },
  { name: '배달 라이더 성호', look: { color: '#ffd32a', hat: '#e84118', pants: '#2f3640', skin: '#d7a888', gender: 'm', face: 'square', hair: 'short', top: 'hoodie' }, speed: 2.0, spot: '백궁프라자1',
    lines: ['정자동 오피스텔 미로는 3년째 공략 중이에요 🛵', '백궁프라자 지하 맛집은 배달보다 직접 가는 게 빨라요.', '비 오는 날 콜이 터지면… 정자역이 제 사무실이에요.'] },
  { name: '산책하는 동네 주민', look: { color: '#a29bfe', hat: '#dfe6e9', pants: '#636e72', skin: '#e8c4a8', gender: 'm', face: 'long', hair: 'short', beard: 'full', top: 'long' }, speed: 0.8,
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

  { name: '성남대로 점심 현우', look: { color: '#d35400', bag: '#2d3436', pants: '#3b4252', skin: '#f2d0b0', gender: 'm', face: 'square', hair: 'short', top: 'short' }, speed: 1.4,
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

  { name: '수인분당선 환승 유나', look: { color: '#f59f00', bag: '#6c4a12', pants: '#3b4252', skin: '#f2d0b0', gender: 'f', face: 'square', hair: 'short', glasses: true, top: 'long' }, speed: 1.5,
    lines: ['수인분당선에서 신분당선으로 갈아타는 동선, 아직 눈이 가요.', '정자역 환승 통로가 출근 시간엔 강물이에요.', '판교 가려면 여기서 내리는 사람이 많아서 문이 안 닫혀요.'] },
  { name: '1303 기다리는 재민', look: { color: '#ee2737', pants: '#2c3e50', skin: '#d7a888', gender: 'm', face: 'round', hair: 'short', top: 'long' }, speed: 0.9,
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

// 이름 있는 주민 뒤에 붙는 전역 행인. 대사는 짧은 묶음을 나눠 쓰고, 이름은 겹치지 않게 짓는다.
export const CROWD_EXTRA = 100;
const CROWD_LINES = [
  '오늘은 그냥 동네 한 바퀴 도는 중이에요.',
  '이 골목은 오후에 그늘이 좋아서 자주 걸어요.',
  '신호 보고 건너요. 큰길은 차가 빨라요.',
  '탄천 쪽 바람이 여기까지 올라와요.',
  '점심이면 인도에 사람이 많아져요.',
  '버스 시간이 애매해서 걷고 있어요.',
  '편의점 들렀다 집으로 가는 길이에요.',
  '정자동은 블록마다 분위기가 달라요.',
  '해 지면 가로등이 먼저 켜져요.',
  '공원 벤치까지 갔다 돌아올게요.',
  '오피스 쪽은 퇴근 시간에 인도가 붐벼요.',
  '아파트 단지는 안쪽 길이 조용해요.',
];
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

function crowdDef(i) {
  const female = i % 2 === 1;
  const given = (female ? GIVEN_F : GIVEN_M)[Math.floor(i / 2) % 50];
  return {
    name: FAMILY[i % FAMILY.length] + given,
    crowd: true,
    speed: 0.75 + (i % 8) * 0.12,
    lines: CROWD_LINES,
    look: {
      color: SHIRTS[i % SHIRTS.length],
      pants: PANTS[(i * 5) % PANTS.length],
      skin: SKINS[(i * 3) % SKINS.length],
      gender: female ? 'f' : 'm',
      face: FACES[i % FACES.length],
      hair: (female ? HAIR_F : HAIR_M)[i % 5],
      top: TOPS[i % TOPS.length],
      glasses: i % 7 === 0,
      beard: !female && i % 11 === 0 ? 'full' : !female && i % 13 === 0 ? 'goatee' : 'none',
      hat: i % 8 === 3 ? SHIRTS[(i + 5) % SHIRTS.length] : null,
      bag: i % 4 === 0 ? '#2d3436' : null,
      scale: 0.94 + (i % 5) * 0.03,
    },
  };
}

export class NPCs {
  constructor(scene, overlay, world, data, { count = NPC_DEFS.length + CROWD_EXTRA, seed = 7 } = {}) {
    this.list = []; this.world = world;
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
    const candidates = world.walkPaths.filter((p) => polyLen(p.pts) > 40 && p.door == null);
    NPC_DEFS.slice(0, count).forEach((def, i) => {
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
        const reach = anchor === st && !def.spot ? 90 + (i % 5) * 18 : def.prefer === 'tancheon' ? 140 : 170;
        let pool = candidates.filter((p) => near(p, anchor.x, anchor.z) < reach);
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
      const npc = { def, mesh, path, len, lo, hi, s: s0, dir: rnd() < 0.5 ? -1 : 1, pos: new THREE.Vector3(), lineIdx: Math.floor(rnd() * def.lines.length), talking: false, cooldown: 0, pause: 0 };
      const head = () => npc.pos.clone().setY(npc.pos.y + (def.cat ? 0.9 : 2.25)); // [terrain] 높이 상대
      npc.tag = overlay.add({ cls: 'tag npc', text: def.name, getPos: () => npc.pos.clone().setY(npc.pos.y + (def.cat ? 0.75 : 2.05)), maxDist: 45 }); // [terrain]
      npc.bubble = new Bubble(overlay, 'npc', () => head().setY(head().y + 0.45), { name: def.name });
      this.list.push(npc);
      this._place(npc);
    });
    this._addCrowd(scene, overlay, data, rnd, Math.max(0, count - NPC_DEFS.length));
  }
  _wet(x, z, bridge) {
    if (bridge) return false;
    if (this.world.inWater?.(x, z)) return true;
    const gy = this.world.groundY?.(x, z, 0);
    return gy != null && gy < -6.35;
  }
  // 보도 옆으로 비켜 선 점 중, 건물·수면이 아닌 구간만 왕복 범위로 잡는다.
  _crowdSpot(base, rnd, cell, cellOf, bb, minSpan) {
    const len = polyLen(base.pts);
    const step = 5;
    const sides = base.offset ? [1, -1] : [1];
    let best = null;
    for (const side of sides) {
      const path = { ...base, side };
      const samples = [];
      const tmp = {};
      for (let s = 3; s < len - 3; s += step) {
        pointAt(path, s, tmp);
        const x = tmp.x, z = tmp.z;
        const inside = x > bb.x0 + 8 && x < bb.x1 - 8 && z > bb.z0 + 8 && z < bb.z1 - 8;
        const inLane = base.offset > 0 && this.world.onRoad(x, z);
        const ok = inside && !inLane && !this.world.isBlocked(x, z, 0.4) && !this._wet(x, z, base.bridge);
        samples.push({ s, x, z, ok, cell: cellOf(x, z) });
      }
      const good = samples.filter((p) => p.ok);
      if (!good.length) continue;
      const inCell = good.filter((p) => p.cell === cell);
      const pickFrom = inCell.length ? inCell : good;
      const pick = pickFrom[Math.floor(rnd() * pickFrom.length)];
      let lo = pick.s, hi = pick.s, idx = -1;
      for (let i = 0; i < samples.length; i++) if (samples[i].s === pick.s) { idx = i; break; }
      for (let i = idx - 1; i >= 0 && pick.s - samples[i].s <= 40; i--) {
        if (!samples[i].ok) break;
        lo = samples[i].s;
      }
      for (let i = idx + 1; i < samples.length && samples[i].s - pick.s <= 40; i++) {
        if (!samples[i].ok) break;
        hi = samples[i].s;
      }
      if (hi - lo < minSpan) continue;
      const score = (inCell.length ? 100 : 0) + (hi - lo);
      if (!best || score > best.score) best = { path, len, lo, hi, s: (lo + hi) / 2, x: pick.x, z: pick.z, score };
    }
    return best;
  }
  _addCrowd(scene, overlay, data, rnd, count) {
    const all = this.world.cityWalkPaths || [];
    if (!count || !all.length) return;
    const bb = data.meta.bboxLocal;
    const COLS = 10, ROWS = 12;
    const spanX = (bb.x1 - bb.x0) || 1, spanZ = (bb.z1 - bb.z0) || 1;
    const cellOf = (x, z) => {
      if (x < bb.x0 || x > bb.x1 || z < bb.z0 || z > bb.z1) return -1;
      const cx = Math.min(COLS - 1, Math.max(0, Math.floor(((x - bb.x0) / spanX) * COLS)));
      const cz = Math.min(ROWS - 1, Math.max(0, Math.floor(((z - bb.z0) / spanZ) * ROWS)));
      return cz * COLS + cx;
    };
    const bins = Array.from({ length: COLS * ROWS }, () => []);
    const scratch = {};
    for (const p of all) {
      const len = polyLen(p.pts);
      if (len < 22) continue;
      const seen = new Set();
      for (let s = 0; s <= len; s += 24) {
        pointAt({ ...p, side: 1 }, s, scratch);
        const c = cellOf(scratch.x, scratch.z);
        if (c < 0 || seen.has(c)) continue;
        seen.add(c);
        bins[c].push(p);
      }
    }
    const order = [];
    for (let i = 0; i < bins.length; i++) if (bins[i].length) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    if (!order.length) return;
    const taken = [];
    for (const n of this.list) taken.push(n.pos.x, n.pos.z);
    const nearTaken = (x, z, gap) => {
      for (let i = 0; i < taken.length; i += 2) if ((taken[i] - x) ** 2 + (taken[i + 1] - z) ** 2 < gap * gap) return true;
      return false;
    };
    let made = 0, spins = 0, minSpan = 8, gap = 14;
    while (made < count && spins < count * 40) {
      if (spins === count * 14) { minSpan = 4; gap = 6; }
      const cell = order[spins % order.length];
      spins++;
      const pool = bins[cell];
      const base = pool[Math.floor(rnd() * pool.length)];
      const spot = this._crowdSpot(base, rnd, cell, cellOf, bb, minSpan);
      if (!spot || nearTaken(spot.x, spot.z, gap)) continue;
      const def = crowdDef(made);
      const mesh = createAvatar(def.look);
      scene.add(mesh);
      const npc = {
        def, mesh, path: spot.path, len: spot.len, lo: spot.lo, hi: spot.hi, s: spot.s,
        dir: rnd() < 0.5 ? -1 : 1, pos: new THREE.Vector3(),
        lineIdx: made % def.lines.length, talking: false, cooldown: rnd() * 5, pause: rnd() * 2,
      };
      const head = () => npc.pos.clone().setY(npc.pos.y + 2.25);
      npc.tag = overlay.add({ cls: 'tag npc', text: def.name, getPos: () => npc.pos.clone().setY(npc.pos.y + 2.05), maxDist: 40 });
      npc.bubble = new Bubble(overlay, 'npc', () => head().setY(head().y + 0.45), { name: def.name });
      this.list.push(npc);
      this._place(npc);
      taken.push(npc.pos.x, npc.pos.z);
      made++;
    }
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
    const ref = (p.y || 0) > n.pos.y + 0.05 ? p.y : n.pos.y;
    n.pos.set(p.x, this.world.groundY ? this.world.groundY(p.x, p.z, ref) : 0, p.z); // [terrain] 지형 높이
    n.mesh.position.copy(n.pos); n.mesh.rotation.y = Math.atan2(p.dx * n.dir, p.dz * n.dir);
  }
  update(dt, player) {
    for (const n of this.list) {
      const dist = Math.hypot(player.x - n.pos.x, player.z - n.pos.z);
      n.bubble.tick(); n.cooldown -= dt;
      if (dist < 6.5 && n.cooldown <= 0 && !n.bubble.showing) {
        n.bubble.say(n.def.lines[n.lineIdx++ % n.def.lines.length], 5000); n.cooldown = 8; n.talking = true;
      }
      if (n.talking && (dist > 10 || (!n.bubble.showing && dist > 6.5))) n.talking = false;
      let speed = 0;
      if (n.talking || n.bubble.showing) {
        // 플레이어 쪽 바라보기
        const target = Math.atan2(player.x - n.pos.x, player.z - n.pos.z);
        n.mesh.rotation.y += Math.atan2(Math.sin(target - n.mesh.rotation.y), Math.cos(target - n.mesh.rotation.y)) * Math.min(1, dt * 6);
      } else if (n.pause > 0) n.pause -= dt;
      else if (this.guard && this._redLight(n)) {
        // 신호 횡단보도: 빨간불(또는 깜빡이는 초록)이면 건너지 않고 대기
        if (!n.waiting) { n.waiting = true; this.waitCount = (this.waitCount || 0) + 1; if (Math.random() < 0.35 && !n.bubble.showing) n.bubble.say('🚦 빨간불이네요, 잠깐 기다려요', 2500); }
      }
      else {
        n.waiting = false;
        speed = n.def.speed; n.s += n.dir * speed * dt;
        const lo = n.lo || 0, hi = n.hi ?? n.len;
        if (n.s > hi || n.s < lo) { n.dir *= -1; n.s = Math.max(lo, Math.min(hi, n.s)); n.pause = 1 + Math.random() * 2; }
        this._place(n);
      }
      animateAvatar(n.mesh, speed, dt);
    }
  }
}
