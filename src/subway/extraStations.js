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
];
