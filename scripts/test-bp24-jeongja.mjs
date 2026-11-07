// 정자 칼튼호텔 BUMP24 배치 + 시청점 틀이 그대로인지. three 없이 해석만 한다.
import fs from 'fs';
import { bp24DoorInfo, bp24TileKey, prepareJeongjaBp24, recessFront, resolveBp24 } from '../src/corridor/bp24.js';
import { BP24_LOCATIONS, BP24_PLACEMENTS, jeongjaBump24On } from '../src/corridor/bp24Locations.js';

const jeongja = JSON.parse(fs.readFileSync(new URL('../public/jeongja.json', import.meta.url)));
const hallSpec = BP24_LOCATIONS.find((s) => s.id === 'seongnam-cityhall');
const tileKey = bp24TileKey(hallSpec);
const tile = JSON.parse(fs.readFileSync(new URL(`../public/corridor/tiles/${tileKey}.json`, import.meta.url)));
const hall = resolveBp24(hallSpec, tile);
if (!hall) throw new Error('시청점 resolve 실패');
if (hall.W < 15 || hall.W > 16.5) throw new Error(`시청점 폭 ${hall.W}`);
if (hall.D < 10 || hall.D > 11) throw new Error(`시청점 깊이 ${hall.D}`);
if (!hall.side) throw new Error('시청점 옆유리가 꺼짐');
if (hall.apron === false) throw new Error('시청점 앞마당이 빠짐');
if (hall.b[1] < 0.9) throw new Error(`시청점 안쪽 방향이 +z 가 아님 ${hall.b}`); // front '-z' → 안쪽은 +z
const hallDoor = bp24DoorInfo(hall);
if (Math.abs(hallDoor.x - 1600.6) > 3 || hallDoor.z > -5758) throw new Error(`시청점 문 ${hallDoor.x},${hallDoor.z}`);

const b135 = jeongja.buildings[135];
let maxX = -Infinity;
for (const p of b135.o) maxX = Math.max(maxX, p[0]);
const recessed = recessFront(b135.o, '+x', 1.55);
let recMax = -Infinity;
for (const p of recessed) recMax = Math.max(recMax, p[0]);
if (Math.abs((maxX - recMax) - 1.55) > 0.05) throw new Error(`들이기 ${maxX - recMax}`);

const on = prepareJeongjaBp24(jeongja, '');
if (on.length !== 1 || on[0].id !== 'bump24-jeongja') throw new Error(`정자 매장 ${on.map((s) => s.id)}`);
const st = on[0];
if (st.side || !st.sealEnds) throw new Error('정자점 끝면은 막아야 함');
if (hall.sealEnds) throw new Error('시청점 옆면이 막힘');
if (st.apron !== false) throw new Error('정자점 앞마당이 차도로 나감');
if (st.b[0] > -0.9) throw new Error(`정자점 앞면이 동쪽이 아님 ${st.b}`);
if (st.W < 16 || st.W > 18.2) throw new Error(`정자점 폭 ${st.W}`);
if (st.D < 10.5 || st.D > 11.2) throw new Error(`정자점 깊이 ${st.D}`);
if ((b135.mh || 0) < 4) throw new Error('위층 mh 가 안 올라감');
const door = bp24DoorInfo(st);
if (!(door.x < maxX - 0.05)) throw new Error(`문이 건물 밖으로 나감 door ${door.x} wall ${maxX}`);
if (!(door.x > recMax - 0.2)) throw new Error(`문이 유리보다 안쪽 door ${door.x} glass ${recMax}`);
const skipped = jeongja.buildings.filter((b) => b._skip && b.lm === 'bp24');
if (skipped.length !== 1) throw new Error('1층 충돌 건물이 없음');
const worldAt = (x, z) => [st.o[0] + st.ax[0] * x + st.b[0] * z, st.o[1] + st.ax[1] * x + st.b[1] * z];
const pip = (x, z, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi) inside = !inside;
  }
  return inside;
};
const foot = jeongja.buildings[135].o;
for (let x = 0.2; x < st.W; x += 0.8) for (let z = 0.2; z < st.D; z += 0.8) {
  const [wx, wz] = worldAt(x, z);
  if (!pip(wx, wz, foot)) throw new Error(`매장 내부가 건물 밖 ${x.toFixed(1)},${z.toFixed(1)} → ${wx.toFixed(2)},${wz.toFixed(2)}`);
}

const offData = JSON.parse(fs.readFileSync(new URL('../public/jeongja.json', import.meta.url)));
const off = prepareJeongjaBp24(offData, '?bump24jeongja=0');
if (off.length) throw new Error('플래그 0 인데 정자점이 켜짐');
if (offData.buildings[135].mh) throw new Error('플래그 0 인데 건물을 비움');
if (!jeongjaBump24On('')) throw new Error('기본은 켜짐');
if (jeongjaBump24On('?bump24jeongja=0')) throw new Error('0 인데 켜짐으로 판정');
if (!jeongjaBump24On('?bump24jeongja=1')) throw new Error('1 인데 꺼짐');

const ids = BP24_PLACEMENTS.map((s) => s.id);
if (ids[0] !== 'seongnam-cityhall' || !ids.includes('bump24-jeongja')) throw new Error(ids.join(','));

console.log('bp24 jeongja ok', {
  hall: { W: +hall.W.toFixed(2), D: +hall.D.toFixed(2), door: [+hallDoor.x.toFixed(1), +hallDoor.z.toFixed(1)] },
  jeongja: { W: +st.W.toFixed(2), D: +st.D.toFixed(2), door: [+door.x.toFixed(2), +door.z.toFixed(2)], wall: +maxX.toFixed(2), glass: +recMax.toFixed(2), b: st.b.map((n) => +n.toFixed(2)) },
});
