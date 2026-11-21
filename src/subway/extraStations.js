// [gyeongbu-bus] 판교·청계산입구 — 신분당선(판교는 경강선도) 게임 역.
//   출입구는 OSM railway=subway_entrance. place 는 판교 랜드마크(인도에 맞춘 dir)와 청계산 OSM 좌표.
//   ext: 'gangnam' 이라 STATIONS_BASE(기존 시각표 오프셋)는 그대로이고, ?gangnam=0 / ?gangnamsub=0 이면 빠진다.
export const EXTRA_STATIONS = [
  {
    id: 'pangyo',
    name: '판교',
    nameEn: 'Pangyo',
    x: 251,
    z: -3080.1,
    osmStations: [5927786493, 8308318738],
    lines: ['shin', 'gg'],
    osmLineColours: { shin: '#B81B30', gg: '#0B318F' },
    osmRoutes: { shin: [6060963], gg: [6462562] },
    route: { line: 'shin', rel: 6060963, stops: ['양재', '양재시민의숲', '청계산입구', '판교', '정자', '미금', '동천'] },
    ext: 'gangnam',
    exits: [
      { ref: '1', osm: 3408315040, lat: 37.3953516, lon: 127.1114934, place: { x: 278.1, z: -3189.3, ry: 1.592 + Math.PI, shift: 0, bad: 0 } },
      { ref: '2', osm: 3408315041, lat: 37.3945674, lon: 127.1118099, place: { x: 306.1, z: -3102.6, ry: -3.131 + Math.PI, shift: 0, bad: 0 } },
      { ref: '3', osm: 3408315042, lat: 37.3941604, lon: 127.1109435, place: { x: 229.5, z: -3057.6, ry: 1.581 + Math.PI, shift: 0, bad: 0 } },
      { ref: '4', osm: 3408315039, lat: 37.3948444, lon: 127.1103588, place: { x: 177.7, z: -3133.2, ry: 3.126 + Math.PI, shift: 0, bad: 0 } },
    ],
  },
  {
    id: 'cheonggyesan',
    name: '청계산입구',
    nameEn: 'Cheonggyesan',
    x: -4758.4,
    z: -9052.4,
    osmStations: [1906756403],
    lines: ['shin'],
    osmLineColours: { shin: '#B81B30' },
    osmRoutes: { shin: [6060963] },
    route: { line: 'shin', rel: 6060963, stops: ['강남', '양재', '양재시민의숲', '청계산입구', '판교', '정자', '미금'] },
    ext: 'gangnam',
    exits: [
      { ref: '1', osm: 3408315043, lat: 37.4489498, lon: 127.0542905, place: { x: -4782.8, z: -9114.0, ry: 0.377, shift: 0, bad: 0 } },
      { ref: '2', osm: 3408315044, lat: 37.4476886, lon: 127.0549909, place: { x: -4720.9, z: -8974.6, ry: -2.692, shift: 0, bad: 0 } },
    ],
  },
  // [seongsu] 성수 — 2호선 지상(고가) 역 (지상 3층: 2층 대합실 · 3층 2면 4선 쌍섬식 승강장). elevated → 출입구는 길에서 올라가는 계단+에스컬레이터,
  //   승강장은 고가 승강장 장면(하늘·아차산로가 보임). 대합실은 다른 역 틀 + 창. 출입구 4곳은 OSM subway_entrance 자리.
  //   ext: 'seongsu' → ?seongsu=0 / ?seongsusub=0 이면 빠진다. 좌표 = public/corridor/seongsu/seongsu.json (scripts/corridor/build-seongsu.py)
  {
    id: 'seongsu',
    name: '성수',
    elevated: true,
    nameEn: 'Seongsu',
    x: -4622.6,
    z: -19683.7,
    osmStations: [5935554450],
    lines: ['l2'],
    osmLineColours: { l2: '#00A23F' },
    osmRoutes: { l2: [4729409] },
    route: { line: 'l2', rel: 4729409, stops: ['한양대', '뚝섬', '성수', '건대입구', '구의', '강변', '잠실나루', '잠실'] },
    ext: 'seongsu',
    exits: [
      // [seongsu-elevated] place = 고가역 출입구: 인도(역 폭 밖 v=±15.9m) 위, OSM 출구 자리(길이 방향 a)에서 역 가운데 쪽으로 올라감
      { ref: '1', osm: 3404887383, lat: 37.5450398, lon: 127.0551237, place: { x: -4710.1, z: -19733.1, ry: 1.215, shift: 0, bad: 0 } },
      { ref: '2', osm: 3404887385, lat: 37.5444263, lon: 127.0570324, place: { x: -4539.6, z: -19669.8, ry: -1.926, shift: 0, bad: 0 } },
      { ref: '3', osm: 3404887386, lat: 37.5441528, lon: 127.0569174, place: { x: -4549.7, z: -19639.7, ry: -1.926, shift: 0, bad: 0 } },
      { ref: '4', osm: 3404887384, lat: 37.5447446, lon: 127.0550065, place: { x: -4719.6, z: -19702.8, ry: 1.215, shift: 0, bad: 0 } },
    ],
  },
];
