// [gangnam-ads] 미디어폴·대형 전광판 자리.
//   OSM 에 advertising 태그가 없다(계획서 3절, B안 안 0개). 그래서 강남대로·테헤란로 보도/파사드에
//   출구 번호 기준으로 규칙 배치한다. 실재 광고판 위치가 아니다.
//   화면 내용·교체 방법은 manifest.js 와 README.md.

import { projectOnto } from '../avenues.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

function sideOf(p, x, z) {
  const s = Math.sign(p.nx * (x - p.px) + p.nz * (z - p.pz));
  return s || 1;
}

/** 쿼드 법선(+Z 를 rotY)이 차도 중심을 보게 하는 yaw. */
function yawTowardCenter(p, side) {
  return Math.atan2(-p.nx * side, -p.nz * side);
}

/**
 * exits: [{ref,x,z}]  segs: avenueSegs()
 * 폴은 출구에서 도로 방향으로 alongM 만큼 민 보도(캐노피와 겹치지 않게).
 * 전광판은 중심선에서 인도 바깥(파사드 쪽)으로 더 민 자리. 높이는 건물 벽 중층.
 */
export function designScreens(exits, segs) {
  const by = new Map((exits || []).map((e) => [String(e.ref), e]));
  const screens = [];
  const pole = (id, ref, alongM, note) => {
    const e = by.get(String(ref));
    if (!e) return;
    const p = projectOnto(segs, e.x, e.z);
    if (!p) return;
    const side = sideOf(p, e.x, e.z);
    screens.push({
      id, kind: 'pole',
      x: r1(e.x + p.tx * alongM), z: r1(e.z + p.tz * alongM), y: 0,
      w: 1.2, h: 2.5, poleH: 5.6,
      yaw: r3(yawTowardCenter(p, side)),
      anchor: `exit ${ref}`, road: p.n,
      note,
    });
  };
  const board = (id, ref, backM, y, note) => {
    const e = by.get(String(ref));
    if (!e) return;
    const p = projectOnto(segs, e.x, e.z);
    if (!p) return;
    const side = sideOf(p, e.x, e.z);
    const dist = p.w / 2 + backM;
    screens.push({
      id, kind: 'board',
      x: r1(p.px + p.nx * side * dist), z: r1(p.pz + p.nz * side * dist), y,
      w: 14, h: 7.5, poleH: 0,
      yaw: r3(yawTowardCenter(p, side)),
      anchor: `exit ${ref}`, road: p.n,
      note,
    });
  };
  // 출구 10·11 은 강남대로 남쪽 보도(계획서의 사진 명소). 폴은 출구 점에서 도로 방향으로만 민다.
  pole('pole-e11', '11', 9, '11번 출구 보도. OSM advertising 없음 — 강남대로 보도 규칙 배치, 실제 미디어폴 위치 아님');
  pole('pole-e10', '10', -9, '10번 출구 보도. 같은 규칙');
  pole('pole-e10s', '10', 16, '10번 출구에서 강남대로를 따라 한 칸 더. 같은 규칙');
  pole('pole-e7', '7', -12, '강남역 사거리 서쪽(7번 출구) 보도');
  pole('pole-e2', '2', 11, '사거리 북쪽 강남대로, 2번 출구 보도');
  pole('pole-e12', '12', 9, '테헤란로 12번 출구 보도');
  board('board-cross-w', '7', 10, 18, '강남역 사거리 서쪽 파사드 중층. 실제 전광판 위치 아님, 상표 없음');
  board('board-cross-e', '2', 12, 24, '사거리 동쪽 파사드. 같은 규칙');
  board('board-e11', '11', 14, 16, '11번 출구 뒤 파사드. 같은 규칙');
  board('board-teh', '1', 10, 20, '테헤란로 1번 출구 쪽 파사드. 같은 규칙');
  return screens;
}
