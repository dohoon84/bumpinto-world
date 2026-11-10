// [gangnam-night] 강남대로·테헤란로 가로등·창·상가 빛·빛줄기 → public/corridor/gangnam/night.json
//   전광판 자리 → src/gangnam/billboards/placements.json
//   OSM street_lamp / advertising 는 쓰지 않는다(박스 안 0개 — docs/gangnam-night.md).
//   사용: node scripts/corridor/build-gangnam-night.mjs
import fs from 'node:fs';
import path from 'node:path';
import { avenueSegs, carSegs, placeLamps, placeWindows, placeGlow, placeStreaks } from '../../src/gangnam/avenues.js';
import { designScreens } from '../../src/gangnam/billboards/rules.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const G = path.join(ROOT, 'public/corridor/gangnam');
const idx = JSON.parse(fs.readFileSync(path.join(G, 'index.json'), 'utf8'));
const tiles = Object.keys(idx.tiles).map((k) => JSON.parse(fs.readFileSync(path.join(G, 'tiles', k + '.json'), 'utf8')));
const segs = avenueSegs(tiles);
const buildings = tiles.flatMap((t) => t.b || []);
const exits = (idx.stations?.[0]?.exits || []).map((e) => ({ ref: e.ref, x: e.x, z: e.z }));
const cars = carSegs(tiles);
const lamps = placeLamps(segs, { exits, buildings, step: 40, sides: 2, box: idx.meta.box, carSegs: cars });
const windows = placeWindows(segs, buildings, { minH: 48, max: 240 });
const glow = placeGlow(segs, { step: 28 });
const streaks = placeStreaks(segs, { step: 90 });
const night = {
  v: 1,
  attribution: '© OpenStreetMap contributors (ODbL) — road centerlines only. Lamp and screen positions are a design rule, not surveyed street furniture.',
  meta: {
    generated: 'scripts/corridor/build-gangnam-night.mjs',
    rule: '강남대로·테헤란로(이름 완전 일치) 인도에 40m 간격 양쪽 가로등. 겹친 대로 폭·교차로 차도·버스차로·BRT 섬은 피한다. OSM highway=street_lamp 는 강남 박스에 없어 규칙 배치(미금 가로등과 같은 이유). 출구 7m·건물 안은 제외. 고층(48m+) 창은 대로 45m 안만, 상한 240개.',
    avenues: ['강남대로', '테헤란로'],
    osmStreetLamps: 0,
    counts: { lamps: lamps.length / 5, windows: windows.length / 4, glow: glow.length / 4, streaks: streaks.length / 4 },
  },
  boxes: idx.meta.boxes || [idx.meta.box],
  lamps, windows, glow, streaks,
};
const screens = designScreens(exits, segs);
const placements = {
  v: 1,
  design: true,
  notSurveyed: true,
  note: 'OSM advertising 태그 0개(계획서 3절). 출구 10·11·사거리·테헤란로 보도/파사드 규칙 배치. 실제 미디어폴·전광판 좌표가 아니다. 화면 내용은 manifest.js.',
  screens,
};
fs.writeFileSync(path.join(G, 'night.json'), JSON.stringify(night));
const pj = path.join(ROOT, 'src/gangnam/billboards/placements.js');
fs.writeFileSync(pj, '// 생성: node scripts/corridor/build-gangnam-night.mjs\n// OSM advertising 없음 — 출구 기준 규칙 배치. 화면 내용은 manifest.js. 설명은 README.md.\nexport default ' + JSON.stringify(placements, null, 2) + ';\n');
console.log(`gangnam night: lamps ${night.meta.counts.lamps}, windows ${night.meta.counts.windows}, glow ${night.meta.counts.glow}, streaks ${night.meta.counts.streaks}, screens ${screens.length}`);
