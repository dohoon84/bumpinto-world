// [corridor] 자동 생성 — node scripts/corridor/build-globe.mjs (public/corridor/index.json 의 OSM 역 좌표)
// 지구본의 '분당–잠실 구간' 묶음 핀과 펼친 노선도에 쓰인다. id 는 📍 이동(Travel)/?at= 의 역 id 와 같다.
export const CORRIDOR_ORIGIN = {"id":"jeongja","ko":"정자","en":"Jeongja","lines":["수인분당선","신분당선"],"lat":37.3665,"lon":127.10835,"x":0,"z":0};
export const CORRIDOR_STATIONS = [
  {"id":"sunae","ko":"수내","en":"Sunae","lines":["수인분당선"],"x":522,"z":-1316.5,"lat":37.37841,"lon":127.11425},
  {"id":"seohyeon","ko":"서현","en":"Seohyeon","lines":["수인분당선"],"x":1325.3,"z":-2035,"lat":37.38491,"lon":127.12333},
  {"id":"imae","ko":"이매","en":"Imae","lines":["수인분당선","경강선"],"x":1766.8,"z":-3147.1,"lat":37.39497,"lon":127.12832},
  {"id":"yatap","ko":"야탑","en":"Yatap","lines":["수인분당선"],"x":1801.3,"z":-4952.2,"lat":37.4113,"lon":127.12871},
  {"id":"moran","ko":"모란","en":"Moran","lines":["수인분당선","8호선"],"x":1837.6,"z":-7348.7,"lat":37.43298,"lon":127.12912},
  {"id":"taepyeong","ko":"태평","en":"Taepyeong","lines":["수인분당선"],"x":1715.5,"z":-8092.6,"lat":37.43971,"lon":127.12774},
  {"id":"gachon","ko":"가천대","en":"Gachon Univ.","lines":["수인분당선"],"x":1625.3,"z":-9086.4,"lat":37.4487,"lon":127.12672},
  {"id":"bokjeong","ko":"복정","en":"Bokjeong","lines":["수인분당선","8호선"],"x":1625.3,"z":-11523.8,"lat":37.47075,"lon":127.12672},
  {"id":"jangji","ko":"장지","en":"Jangji","lines":["8호선"],"x":1567.8,"z":-12423.6,"lat":37.47889,"lon":127.126071},
  {"id":"munjeong","ko":"문정","en":"Munjeong","lines":["8호선"],"x":1253.7,"z":-13191.8,"lat":37.48584,"lon":127.12252},
  {"id":"garak","ko":"가락시장","en":"Garak Market","lines":["3호선","8호선"],"x":910.4,"z":-13931.4,"lat":37.49253,"lon":127.11864},
  {"id":"songpa","ko":"송파","en":"Songpa","lines":["8호선"],"x":338.9,"z":-14726.1,"lat":37.49972,"lon":127.112181},
  {"id":"seokchon","ko":"석촌","en":"Seokchon","lines":["8호선","9호선"],"x":-109.7,"z":-15343,"lat":37.5053,"lon":127.10711},
  {"id":"jamsil","ko":"잠실","en":"Jamsil","lines":["2호선","8호선"],"x":-726.4,"z":-16218.4,"lat":37.51322,"lon":127.10014},
];
export const CORRIDOR_LANDMARK = {"id":"lotte","ko":"롯데월드타워","en":"Lotte World Tower","x":-503.5,"z":-16143.4,"lat":37.512541,"lon":127.102659};
// [pangyo] 정자에서 갈라지는 신분당선 지선 역 (?pangyo=0 이면 지구본에서 뺀다)
export const PANGYO_GLOBE_STATIONS = [
  {"id":"pangyo","ko":"판교","en":"Pangyo","lines":["신분당선","경강선"],"x":264.7,"z":-3100.4,"lat":37.394548,"lon":127.111342,"branch":"jeongja"},
];
// [migeum] 정자에서 남쪽으로 이어지는 미금역 (?migeum=0 이면 지구본에서 뺀다)
export const MIGEUM_GLOBE_STATIONS = [
  {"id":"migeum","ko":"미금","en":"Migeum","lines":["수인분당선","신분당선"],"x":58.9,"z":1845,"lat":37.349809,"lon":127.109016,"branch":"jeongja"},
];
// [gyeongbu] 청계산입구. extraStations / OSM 1906756403. 신분당선으로 판교에서 이어진다.
export const CHEONGGYESAN_GLOBE_STATIONS = [
  {"id":"cheonggyesan","ko":"청계산입구","en":"Cheonggyesan","lines":["신분당선"],"x":-4758.4,"z":-9052.4,"lat":37.448392,"lon":127.054567,"branch":"pangyo"},
];
// 신분당선 통과 역(입장·하차 없음). 노선도에만 실제 OSM 좌표로 점을 찍는다.
export const SHINBUNDANG_PASS_STATIONS = [
  {"id":"yangjaeforest","ko":"양재시민의숲","en":"Yangjae Citizen's Forest","lines":["신분당선"],"x":-6192.3,"z":-11456.7,"lat":37.470143,"lon":127.038359,"branch":"cheonggyesan","pass":true,"pin":"dot"},
  {"id":"yangjae","ko":"양재","en":"Yangjae","lines":["신분당선"],"x":-6517.1,"z":-12968.1,"lat":37.483816,"lon":127.034688,"branch":"yangjaeforest","pass":true,"pin":"dot"},
];
// [gangnam] 강남역. 좌표는 public/corridor/gangnam/index.json 역(x,z) · regions 핀(lat,lon).
//   2호선으로 잠실에서 갈라지고, 신분당선은 양재(통과)를 거쳐 청계산입구·판교와 잇는다.
export const GANGNAM_GLOBE_STATIONS = [
  {"id":"gangnam","ko":"강남","en":"Gangnam","lines":["2호선","신분당선"],"x":-7097.7,"z":-14453.3,"lat":37.4979,"lon":127.0276,"branch":"jamsil","links":["yangjae"],"pin":"dot"},
];
