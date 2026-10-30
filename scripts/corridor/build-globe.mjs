// [corridor] 지구본(월드 게이트)용 코리더 역 좌표 생성: public/corridor/index.json 의 역(OSM station 노드)·롯데월드타워
// 로컬 좌표(x 동, z 남, 원점 정자역)를 같은 등장방형 투영(build-corridor/convert 와 동일 상수)으로 되돌려 위경도로 기록한다.
// 출력: src/corridor/globeStations.js  (지구본은 코리더 타일을 받기 전에 뜨므로 작은 정적 모듈로 둔다)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const index = JSON.parse(readFileSync(resolve(root, 'public/corridor/index.json'), 'utf8'));
const CENTER = { lat: 37.3665, lon: 127.10835 };
const kx = Math.cos((CENTER.lat * Math.PI) / 180) * 111320, kz = 110540;
const unproj = (x, z) => ({ lat: +(CENTER.lat - z / kz).toFixed(6), lon: +(CENTER.lon + x / kx).toFixed(6) });

const stations = index.stations.map((s) => ({ id: s.id, ko: s.name, en: s.nameEn, lines: s.lines, x: s.x, z: s.z, ...unproj(s.x, s.z) }));
const tower = index.landmarks.find((l) => l.id === 'lotte-world-tower');
const at = tower.fit || tower.pos;
const lotte = { id: 'lotte', ko: '롯데월드타워', en: 'Lotte World Tower', x: at.x, z: at.z, ...unproj(at.x, at.z) };

const out = `// [corridor] 자동 생성 — node scripts/corridor/build-globe.mjs (public/corridor/index.json 의 OSM 역 좌표)
// 지구본의 '분당–송파 코리더' 묶음 핀과 펼친 노선도에 쓰인다. id 는 📍 이동(Travel)/?at= 의 역 id 와 같다.
export const CORRIDOR_ORIGIN = ${JSON.stringify({ id: 'jeongja', ko: '정자', en: 'Jeongja', ...CENTER, x: 0, z: 0 })};
export const CORRIDOR_STATIONS = [
${stations.map((s) => '  ' + JSON.stringify(s) + ',').join('\n')}
];
export const CORRIDOR_LANDMARK = ${JSON.stringify(lotte)};
`;
writeFileSync(resolve(root, 'src/corridor/globeStations.js'), out);
console.log('globeStations.js:', stations.length, 'stations +', lotte.id);
