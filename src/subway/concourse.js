// [subway] 지하철역 지하 대합실 (별도 Scene). 들어갈 때 만들고 나올 때 dispose.
//   정자역 대합실 틀 하나를 모든 역이 같이 쓴다: theme(stations.js stationTheme) 으로 역 이름·노선 색·방면·노선도·광고만 바뀜
//   (기본 theme = 정자역 1단계 문자열 그대로)
//
//   draw call 예산 (실측은 보고서): 정적 구조 1 · 간판/조명(아틀라스) 1 · 개찰구 날개 1 · 카드 단말 LED 1 · 에스컬레이터 디딤판 1
//                                + 아바타 인스턴싱 부품 수(≈20, 사람 수와 무관, 플레이어 포함)
//   그림자·안개 없음. 조명은 반구광 + 약한 평행광(그림자 X).
import * as THREE from 'three';
import { createBuilder, createAtlas, FONT, fitText, lineBadge, roundRect } from './geom.js';
import { JEONGJA_THEME } from './stations.js';
import { HALL, CEIL, GATE, GATE_X, OFFICE, WELLS, DROP, RUN, COLUMNS, PASSAGE_LEN, passageFor, staticBlockers, walkable, passageAt, laneAt, gateTapSide, nearWellTop, wellMouth, WELL_INTO, WELL_REARM, northGaps, cutSpans } from './layout.js';
import { buildCrowd } from '../entities/avatarCrowd.js';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { LOOKS } from './looks.js';

const ESC_SPEED = 0.55, STEP_GAP = 0.42;
const ESC_HALF = 0.5;
export const TRANSFER = { x: 0, z: HALL.z1 - 1.3, hw: 2.2 }; // 갈아타는 곳 (남쪽 벽 안내판 앞)
const SLOPE = Math.atan2(DROP, RUN);

// 에스컬레이터 경로 (위 평지 1m → 경사 → 아래 평지 1m). s(0..len) → {x,y,z}
function escPath(w) {
  const pts = [[w.cx, 0, w.z0 - 1], [w.cx, 0, w.z0], [w.cx, -DROP, w.z0 + RUN], [w.cx, -DROP, w.z0 + RUN + 1]];
  const seg = []; let len = 0;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const l = Math.hypot(b[1] - a[1], b[2] - a[2]); seg.push({ a, b, l, s0: len }); len += l; }
  const at = (s) => {
    s = Math.max(0, Math.min(len, s));
    for (const g of seg) if (s <= g.s0 + g.l + 1e-6) { const t = (s - g.s0) / g.l; return { x: g.a[0], y: g.a[1] + (g.b[1] - g.a[1]) * t, z: g.a[2] + (g.b[2] - g.a[2]) * t, slope: g.a[1] !== g.b[1] }; }
    return { x: pts[3][0], y: pts[3][1], z: pts[3][2], slope: false };
  };
  return { len, at, top: pts[0], bot: pts[3] };
}



export function buildConcourse({ exits, groups, entryId, look, renderer, onToast, theme = JEONGJA_THEME, board = null, spawn = null }) {
  const P = theme.primary, X = theme.transfer;
  const wellTxt = (w) => ({ ...w, ...(theme.wells[WELLS.indexOf(w)] || {}) }); // 승강장 계단 방면 = 주 노선 방면
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2c30');
  scene.add(new THREE.HemisphereLight('#ffffff', '#9a9184', 2.1));
  const dl = new THREE.DirectionalLight('#fff6e8', 0.6); dl.position.set(8, 20, 6); scene.add(dl);
  const disposables = [];
  const S = createBuilder(), G = createBuilder();
  const atlas = createAtlas(2048, 1024, 'concourse'); // 대합실 글자 전부 한 장 (안에 있을 때만, 나가면 dispose)
  const white = atlas.add(8, 8, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); });
  const passages = groups.map((g) => ({ ...passageFor(g.dir), exits: g.exits }));
  const blockers = staticBlockers(passages);

  // ---------- 바닥 (1m 타일, 계단 구멍 제외) + 점자 블록 ----------
  const inWell = (x, z) => WELLS.some((w) => x >= w.x0 && x < w.x1 && z >= w.z0 && z < w.z1);
  for (let x = HALL.x0; x < HALL.x1; x++) for (let z = HALL.z0; z < HALL.z1; z++) {
    if (inWell(x + 0.5, z + 0.5)) continue;
    const odd = (x + z) & 1;
    S.quad(x + 0.5, 0, z + 0.5, 0.985, 0.985, odd ? '#d6d0c3' : '#cbc4b6', { rx: -Math.PI / 2 });
  }
  // 줄눈 (타일 사이로 보이는 바닥판) — 계단 구멍은 비움
  const slab = (x0, x1, z0, z1) => S.box((x0 + x1) / 2, -0.06, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, '#6b665e');
  slab(HALL.x0, HALL.x1, HALL.z0, WELLS[0].z0);
  { let x = HALL.x0; for (const w of [...WELLS].sort((a, b) => a.x0 - b.x0)) { slab(x, w.x0, WELLS[0].z0, HALL.z1); x = w.x1; } slab(x, HALL.x1, WELLS[0].z0, HALL.z1); }
  const YEL = '#e8b800';
  const tactile = (x0, z0, x1, z1) => { const l = Math.hypot(x1 - x0, z1 - z0); S.box((x0 + x1) / 2, 0.012, (z0 + z1) / 2, 0.3, 0.02, l, YEL, { ry: Math.atan2(x1 - x0, z1 - z0) }); };
  for (const p of passages) { tactile(p.mouth.x, p.mouth.z, p.mouth.x, -2.5); tactile(p.mouth.x, -2.5, 0, -2.5); }
  tactile(0, -2.5, 0, -1.2); tactile(0, 1.2, 0, 2.4);
  for (const w of WELLS) tactile(0, 2.4, w.cx - 2.2, 2.4);
  // ---------- 벽·천장 ----------
  const wallX = (x, z0, z1, gaps = []) => { // x 고정 벽, gaps: [z0,z1]
    let z = z0; for (const [a, b] of [...gaps, [z1, z1]].sort((p, q) => p[0] - q[0])) { if (a > z) { S.block(x, 0, (z + a) / 2, 0.3, 1.3, a - z, '#6f7a85'); S.block(x, 1.3, (z + a) / 2, 0.3, CEIL - 1.3, a - z, '#e6e1d6'); } z = Math.max(z, b); }
  };
  const wallZ = (z, x0, x1, gaps = []) => {
    let x = x0; for (const [a, b] of [...gaps, [x1, x1]].sort((p, q) => p[0] - q[0])) { if (a > x) { S.block((x + a) / 2, 0, z, a - x, 1.3, 0.3, '#6f7a85'); S.block((x + a) / 2, 1.3, z, a - x, CEIL - 1.3, 0.3, '#e6e1d6'); } x = Math.max(x, b); }
  };
  const gapsOf = (wall) => passages.filter((p) => p.wall === wall).map((p) => [p.c - p.half, p.c + p.half]);
  wallX(HALL.x0 - 0.15, HALL.z0, HALL.z1, gapsOf('w'));
  wallX(HALL.x1 + 0.15, HALL.z0, HALL.z1, gapsOf('e'));
  wallZ(HALL.z0 - 0.15, HALL.x0, HALL.x1, gapsOf('n'));
  wallZ(HALL.z1 + 0.15, HALL.x0, HALL.x1, WELLS.map((w) => [w.x0, w.x1]));
  for (const w of WELLS) S.block((w.x0 + w.x1) / 2, 0, HALL.z1 + 0.15, w.x1 - w.x0, CEIL, 0.3, '#e6e1d6'); // 계단 위 남쪽 벽 (아래로 통로)
  S.box(0, CEIL + 0.05, 0, HALL.x1 - HALL.x0 + 1, 0.1, HALL.z1 - HALL.z0 + 1, '#f1efe9');
  // 천장 조명 줄 + 천장 패널 이음
  for (const z of [-9.5, -5.5, -1.5, 2.5, 6.5, 10]) for (let x = HALL.x0 + 2; x < HALL.x1 - 2; x += 6) G.quad(x + 2, CEIL - 0.02, z, 4.6, 0.32, '#fffaf0', { rx: Math.PI / 2, uv: white });
  for (let x = HALL.x0; x <= HALL.x1; x += 2) S.box(x, CEIL - 0.02, 0, 0.04, 0.03, HALL.z1 - HALL.z0, '#d5d1c8');
  // 기둥 (타일 + 아래 띠 + 기둥 광고)
  for (const c of COLUMNS) {
    S.block(c.x, 0, c.z, 0.8, CEIL, 0.8, '#ece8df'); S.block(c.x, 0, c.z, 0.84, 0.25, 0.84, '#5c6670');
  }

  // ---------- 출구 통로 (계단은 보기만, 끝에 밝은 바깥 빛) ----------
  for (const p of passages) {
    const R = p.rect, horiz = p.wall !== 'n';
    const along = (t, y0, h, thick, color, side = 0) => { // t: 벽에서 바깥으로 거리, side: 통로 가로 오프셋
      if (p.wall === 'w') S.block(HALL.x0 - t, y0, p.c + side, thick, h, p.half * 2, color);
      else if (p.wall === 'e') S.block(HALL.x1 + t, y0, p.c + side, thick, h, p.half * 2, color);
      else S.block(p.c + side, y0, HALL.z0 - t, p.half * 2, h, thick, color);
    };
    const sideWall = (sgn, t0, t1, y0, h, color) => {
      const m = (t0 + t1) / 2, len = t1 - t0;
      if (p.wall === 'w') S.block(HALL.x0 - m, y0, p.c + sgn * (p.half + 0.15), len, h, 0.3, color);
      else if (p.wall === 'e') S.block(HALL.x1 + m, y0, p.c + sgn * (p.half + 0.15), len, h, 0.3, color);
      else S.block(p.c + sgn * (p.half + 0.15), y0, HALL.z0 - m, 0.3, h, len, color);
    };
    const STAIRS = 24, RISE = 0.17, TREAD = 0.3;
    // 바닥
    for (let t = 0; t < PASSAGE_LEN; t += 1) along(t + 0.5, -0.1, 0.1, 1.0, (t & 1) ? '#cbc4b6' : '#d6d0c3');
    for (let i = 0; i < STAIRS; i++) along(PASSAGE_LEN + i * TREAD + TREAD / 2, -0.1, (i + 1) * RISE + 0.1, TREAD, i % 2 ? '#c9c2b3' : '#d2cbbd');
    const tEnd = PASSAGE_LEN + STAIRS * TREAD;
    for (const sgn of [-1, 1]) { sideWall(sgn, 0, PASSAGE_LEN, 0, CEIL, '#e6e1d6'); sideWall(sgn, 0, PASSAGE_LEN, 0, 1.3, '#6f7a85'); sideWall(sgn, PASSAGE_LEN, tEnd + 1, 0, STAIRS * RISE + CEIL, '#e6e1d6'); }
    // 천장 (평지 + 계단 위 계단식)
    along(PASSAGE_LEN / 2, CEIL, 0.1, PASSAGE_LEN, '#f1efe9');
    for (let i = 0; i < STAIRS; i += 4) along(PASSAGE_LEN + (i + 2) * TREAD, CEIL + (i + 2) * RISE, 0.1, 4 * TREAD + 0.05, '#f1efe9');
    // 바깥 빛
    const lightT = tEnd + 0.4, ly = STAIRS * RISE + CEIL / 2;
    if (p.wall === 'w') G.quad(HALL.x0 - lightT, ly, p.c, p.half * 2, CEIL, '#dff1ff', { ry: Math.PI / 2, uv: white });
    else if (p.wall === 'e') G.quad(HALL.x1 + lightT, ly, p.c, p.half * 2, CEIL, '#dff1ff', { ry: -Math.PI / 2, uv: white });
    else G.quad(p.c, ly, HALL.z0 - lightT, p.half * 2, CEIL, '#dff1ff', { uv: white });
    // 계단 난간 (가운데)
    for (let t = 1; t < PASSAGE_LEN; t += 3) if (p.wall === 'n') G.quad(p.c, CEIL - 0.03, HALL.z0 - t, 0.3, 2.2, '#fffaf0', { rx: Math.PI / 2, uv: white }); else G.quad(p.wall === 'w' ? HALL.x0 - t : HALL.x1 + t, CEIL - 0.03, p.c, 2.2, 0.3, '#fffaf0', { rx: Math.PI / 2, uv: white });
    // 출구 번호 간판 (통로 입구 위, 대합실 쪽을 봄)
    const refs = p.exits.map((e) => e.ref).filter(Boolean);
    const hints = [...new Set(p.exits.flatMap((e) => e.hints))].slice(0, 3);
    const sign = atlas.add(512, 112, (c, w, h) => {
      c.fillStyle = '#FFC20E'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111'; c.textBaseline = 'middle'; c.textAlign = 'left';
      c.font = `800 30px ${FONT}`; c.fillText('나가는 곳', 14, 30);
      c.font = `700 18px ${FONT}`; c.fillText('Way Out', 16, 62);
      let x = 168;
      for (const r of refs) { c.fillStyle = '#111'; roundRect(c, x, 10, 52, 52, 7); c.fill(); c.fillStyle = '#FFC20E'; c.font = `900 40px ${FONT}`; c.textAlign = 'center'; c.fillText(r, x + 26, 38); c.textAlign = 'left'; x += 60; }
      if (!refs.length) { c.fillStyle = '#111'; c.font = `800 26px ${FONT}`; c.fillText('출구', x, 36); }
      c.fillStyle = '#222'; fitText(c, hints.join(' · '), w - 30, 22, 700); c.fillText(hints.join(' · '), 14, 92);
    });
    const sw = 3.6, sh = sw * 112 / 512;
    if (p.wall === 'w') { S.box(HALL.x0 + 0.22, 3.05, p.c, 0.08, sh + 0.08, sw + 0.08, '#222'); G.quad(HALL.x0 + 0.3, 3.05, p.c, sw, sh, '#ffffff', { ry: Math.PI / 2, uv: sign }); }
    else if (p.wall === 'e') { S.box(HALL.x1 - 0.22, 3.05, p.c, 0.08, sh + 0.08, sw + 0.08, '#222'); G.quad(HALL.x1 - 0.3, 3.05, p.c, sw, sh, '#ffffff', { ry: -Math.PI / 2, uv: sign }); }
    else { S.box(p.c, 3.05, HALL.z0 + 0.22, sw + 0.08, sh + 0.08, 0.08, '#222'); G.quad(p.c, 3.05, HALL.z0 + 0.3, sw, sh, '#ffffff', { uv: sign }); }
    void horiz; void R;
  }

  // ---------- 북쪽 상가: 편의점 · 분식점 · 화장실 · 물품보관함 ----------
  const shopSign = (x, w, draw, z = HALL.z0 + 3.42) => { const r = atlas.add(Math.round(w * 90), 64, draw); G.quad(x, 3.25, z, w, 0.62, '#ffffff', { uv: r }); };
  // 편의점 (x -26 ~ -17)
  {
    const x0 = -26, x1 = -17, zf = -8.6, cx = (x0 + x1) / 2;
    S.block(cx, 0, HALL.z0 + 0.1, x1 - x0, CEIL, 0.2, '#f8f9fa');
    for (const x of [x0, x1]) S.block(x, 0, (HALL.z0 + zf) / 2, 0.2, CEIL, zf - HALL.z0, '#dee2e6');
    S.block(cx, 2.9, zf, x1 - x0, CEIL - 2.9, 0.2, '#ffffff');
    for (let i = 0; i < 3; i++) { // 진열대
      const sx = x0 + 1.6 + i * 2.6;
      S.block(sx, 0, -10.6, 1.8, 1.6, 0.6, '#ced4da');
      for (let k = 0; k < 3; k++) for (let j = 0; j < 5; j++) S.block(sx - 0.72 + j * 0.36, 0.3 + k * 0.48, -10.28, 0.28, 0.26, 0.06, ['#ff6b6b', '#4dabf7', '#ffd43b', '#51cf66', '#f783ac', '#ffa94d'][(i + j + k) % 6]);
    }
    S.block(x1 - 2.2, 0, -9.2, 2.8, 1.0, 0.6, '#495057'); S.block(x1 - 2.2, 1.0, -9.2, 2.9, 0.06, 0.7, '#adb5bd'); // 계산대
    S.block(x0 + 0.6, 0, -10.6, 0.8, 1.9, 0.7, '#e9ecef'); G.quad(x0 + 0.6, 1.0, -10.24, 0.62, 1.5, '#d0ebff', { uv: white }); // 음료 냉장고
    for (let x = x0 + 1; x < x1; x += 2.5) G.quad(x + 1, 2.86, -10.3, 2, 0.25, '#ffffff', { rx: Math.PI / 2, uv: white });
    shopSign(cx, 8, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#12b886'); gr.addColorStop(1, '#0ca678');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'center';
      c.font = `800 38px ${FONT}`; c.fillText('편의점 24시', w * 0.38, h / 2);
      c.font = `700 22px ${FONT}`; c.fillText('CONVENIENCE STORE', w * 0.78, h / 2);
    }, -8.48);
  }
  // 분식점 (x -15 ~ -8)
  {
    const x0 = -15, x1 = -8, zf = -8.6, cx = (x0 + x1) / 2;
    S.block(cx, 0, HALL.z0 + 0.1, x1 - x0, CEIL, 0.2, '#fff4e6');
    for (const x of [x0, x1]) S.block(x, 0, (HALL.z0 + zf) / 2, 0.2, CEIL, zf - HALL.z0, '#ffe8cc');
    S.block(cx, 2.9, zf, x1 - x0, CEIL - 2.9, 0.2, '#ffffff');
    S.block(cx, 0, -9.1, x1 - x0 - 0.6, 1.0, 0.7, '#d9480f'); S.block(cx, 1.0, -9.1, x1 - x0 - 0.5, 0.06, 0.8, '#f1f3f5');
    S.block(cx - 1.5, 1.06, -9.15, 1.2, 0.14, 0.55, '#343a40'); S.block(cx - 1.5, 1.2, -9.15, 1.1, 0.02, 0.48, '#e03131'); // 떡볶이 판
    S.cyl(cx + 0.4, 1.06, -9.15, 0.28, 0.32, '#adb5bd', 10); S.cyl(cx + 0.4, 1.38, -9.15, 0.26, 0.01, '#e8c48a', 10); // 어묵 국물
    for (let i = 0; i < 4; i++) S.block(cx + 1.4 + (i % 2) * 0.35, 1.06, -9.3 + (i >> 1) * 0.3, 0.3, 0.06, 0.22, '#2b2b2b'); // 김밥
    const menu = atlas.add(320, 120, (c, w, h) => {
      c.fillStyle = '#212529'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = `700 22px ${FONT}`;
      [['떡볶이', '4,500'], ['김밥', '3,500'], ['어묵', '1,000'], ['순대', '4,500']].forEach(([a, b], i) => { const y = 22 + i * 26; c.fillText(a, 18, y); c.textAlign = 'right'; c.fillText(b, w - 18, y); c.textAlign = 'left'; });
    });
    G.quad(cx, 2.1, -11.78, 2.6, 0.98, '#ffffff', { uv: menu });
    shopSign(cx, 6.6, (c, w, h) => {
      c.fillStyle = '#f76707'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'center';
      c.font = `800 36px ${FONT}`; c.fillText('분식', w * 0.2, h / 2);
      c.font = `700 24px ${FONT}`; c.fillText('떡볶이 · 김밥 · 어묵', w * 0.62, h / 2);
    }, -8.48);
  }
  // 화장실 (x 4 ~ 11) + 물품보관함 (x 13 ~ 19) + 광고 (x 21 ~ 28)
  {
    const gaps = northGaps(passages); // 남쪽 출구(s 슬롯) 통로가 이 벽 뒤로 나 있으면 그 앞을 틔움
    for (const [x0, x1] of cutSpans(0, 30, gaps)) { S.block((x0 + x1) / 2, 0, -10.75, x1 - x0, CEIL, 0.3, '#e6e1d6'); if (x1 > 3.5) S.block((Math.max(x0, 0) + x1) / 2, 0, -10.58, x1 - Math.max(x0, 0), 1.3, 0.05, '#6f7a85'); }
    for (const [g0, g1] of gaps) if (g1 > 0) { for (const sx of [g0, g1]) S.block(sx, 0, (HALL.z0 - 10.6) / 2, 0.3, CEIL, -10.6 - HALL.z0, '#e6e1d6'); } // 틈 양옆 벽 (보관함 뒤 빈 공간 가림)
    const inGap = (x0, x1) => gaps.some(([g0, g1]) => x1 > g0 && x0 < g1);
    for (const [x, col, ko, en] of [[5.8, '#1c7ed6', '남자', 'Men'], [9.2, '#e03131', '여자', 'Women']]) {
      S.block(x, 0, -10.56, 1.3, 2.3, 0.06, '#495057'); // 문틀(어두운 통로)
      const icon = atlas.add(96, 128, (c, w, h) => {
        c.fillStyle = col; c.fillRect(0, 0, w, h); c.fillStyle = '#fff';
        c.beginPath(); c.arc(w / 2, 26, 13, 0, Math.PI * 2); c.fill();
        if (en === 'Men') c.fillRect(w / 2 - 15, 44, 30, 40); else { c.beginPath(); c.moveTo(w / 2, 42); c.lineTo(w / 2 + 22, 86); c.lineTo(w / 2 - 22, 86); c.fill(); }
        c.fillRect(w / 2 - 12, 84, 9, 22); c.fillRect(w / 2 + 3, 84, 9, 22);
        c.font = `800 18px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ko, w / 2, h - 10);
      });
      G.quad(x, 2.75, -10.55, 0.6, 0.8, '#ffffff', { uv: icon });
    }
    const wc = atlas.add(360, 72, (c, w, h) => { c.fillStyle = '#1f2a36'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = `800 30px ${FONT}`; c.fillText('화장실  Restroom', w / 2, h / 2); });
    G.quad(7.5, 3.35, -10.55, 3.2, 0.64, '#ffffff', { uv: wc });
    let lkN = 0; for (let i = 0; i < 4; i++) { if (inGap(13.6 + i * 1.3 - 0.6, 13.6 + i * 1.3 + 0.6)) continue; lkN++; for (let j = 0; j < 4; j++) S.block(13.6 + i * 1.3, 0.2 + j * 0.55, -10.45, 1.2, 0.5, 0.25, ['#74c0fc', '#4dabf7', '#a5d8ff'][(i + j) % 3]); }
    const lk = atlas.add(300, 60, (c, w, h) => { c.fillStyle = '#1f2a36'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = `700 26px ${FONT}`; c.fillText('물품보관함  Lockers', w / 2, h / 2); });
    G.quad(lkN < 4 ? 14.2 : 15.5, 2.75, -10.55, lkN < 4 ? 2.4 : 3.0, lkN < 4 ? 0.48 : 0.6, '#ffffff', { uv: lk });
    const ad = atlas.add(420, 180, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#845ef7'); g.addColorStop(1, '#22b8cf'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.font = `800 40px ${FONT}`; c.fillText(theme.ad.title, 24, 80);
      c.font = `600 22px ${FONT}`; fitText(c, theme.ad.sub, w - 40, 22, 600); c.fillText(theme.ad.sub, 26, 120); c.font = `600 22px ${FONT}`; c.fillText('Bumpinto World', 26, 156);
    });
    G.quad(24.5, 1.8, -10.55, 5.6, 2.4, '#ffffff', { uv: ad });
  }
  // 서쪽 벽: 노선도 (일반 그림, 공식 노선도 아님)
  {
    const map = atlas.add(700, 150, (c, w, h) => {
      c.fillStyle = '#f8f9fa'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#212529'; c.font = `800 22px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(theme.map.title, 16, 22);
      const st = theme.map.stops, M = theme.map;
      const y = 84, x0 = 40, dx = (w - 80) / (st.length - 1);
      c.strokeStyle = M.color; c.lineWidth = 10; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + dx * (st.length - 1), y); c.stroke();
      if (M.branch) { const b = M.branch.at; c.strokeStyle = M.branch.color; c.lineWidth = 6; c.beginPath(); c.moveTo(x0 + dx * b, y + 30); c.lineTo(x0 + dx * (b + 1), y + 30); c.moveTo(x0 + dx * b, y); c.lineTo(x0 + dx * b, y + 30); c.stroke(); }
      st.forEach((n, i) => {
        const x = x0 + dx * i, me = n === M.me;
        c.fillStyle = '#fff'; c.strokeStyle = me ? '#212529' : M.color; c.lineWidth = me ? 5 : 3; c.beginPath(); c.arc(x, y, me ? 11 : 8, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = me ? '#d6336c' : '#212529'; c.font = `${me ? 900 : 700} ${me ? 20 : 16}px ${FONT}`; c.textAlign = 'center'; fitText(c, n, dx - 4, me ? 20 : 16, me ? 900 : 700); c.fillText(n, x, y - 26);
      });
      c.font = `600 14px ${FONT}`; c.fillStyle = '#868e96'; c.textAlign = 'right'; c.fillText('일부 역만 표시 · 실제 노선도 아님', w - 12, h - 14);
    });
    G.quad(HALL.x0 + 0.32, 2.0, 4.5, 7.0, 1.5, '#ffffff', { ry: Math.PI / 2, uv: map });
  }

  // ---------- 개찰구 줄 · 펜스 · 역무실 · 발매기 ----------
  for (const x of GATE.cab) {
    S.block(x, 0, 0, 0.3, 0.98, 1.8, '#adb5bd'); S.block(x, 0.98, 0, 0.32, 0.05, 1.82, '#495057');
    for (const sz of [-1, 1]) S.box(x, 1.02, sz * 0.62, 0.22, 0.03, 0.26, '#1c7ed6'); // 카드 단말
  }
  const fence = (x0, x1) => { const cx = (x0 + x1) / 2; S.block(cx, 0, 0, x1 - x0, 0.08, 0.12, '#868e96'); S.block(cx, 1.05, 0, x1 - x0, 0.06, 0.1, '#ced4da'); S.block(cx, 0.08, 0, x1 - x0, 0.97, 0.03, '#a5b4c3'); for (let x = x0; x <= x1 + 0.01; x += 2) S.block(x, 0, 0, 0.08, 1.08, 0.08, '#868e96'); };
  fence(HALL.x0, GATE_X[0]); fence(GATE_X[1], OFFICE.x0); fence(OFFICE.x1, HALL.x1);
  {
    const { x0, x1, z0, z1 } = OFFICE, cx = (x0 + x1) / 2, zc = (z0 + z1) / 2;
    S.block(cx, 0, z1, x1 - x0, CEIL, 0.2, '#dee2e6'); S.block(x0, 0, zc, 0.2, CEIL, z1 - z0, '#dee2e6'); S.block(x1, 0, zc, 0.2, CEIL, z1 - z0, '#dee2e6');
    S.block(cx, 0, z0, x1 - x0, 1.05, 0.25, '#495057'); S.block(cx, 1.05, z0 - 0.05, x1 - x0, 0.06, 0.4, '#ced4da'); // 창구 아래·선반
    S.block(cx, 2.3, z0, x1 - x0, CEIL - 2.3, 0.2, '#dee2e6'); for (const x of [x0 + 0.1, cx, x1 - 0.1]) S.block(x, 1.05, z0, 0.1, 1.25, 0.1, '#868e96');
    S.block(cx + 1.2, 0, z0 + 1.1, 1.6, 0.75, 0.7, '#8d6e63'); S.block(cx + 1.2, 0.75, z0 + 1.25, 0.5, 0.35, 0.05, '#212529'); // 책상·모니터
    S.block(cx - 1.6, 0, z1 - 0.5, 1.2, 1.9, 0.5, '#868e96'); // 캐비닛
    S.box(cx, -0.03, zc, x1 - x0, 0.02, z1 - z0, '#9c9486');
    G.quad(cx, CEIL - 0.03, zc, 2.4, 0.3, '#ffffff', { rx: Math.PI / 2, uv: white });
    const so = atlas.add(380, 72, (c, w, h) => { c.fillStyle = '#1f2a36'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = `800 28px ${FONT}`; c.fillText('역무실  Station Office', w / 2, h / 2); });
    G.quad(cx, 2.75, z0 - 0.11, 4.2, 0.8, '#ffffff', { ry: Math.PI, uv: so });
    const help = atlas.add(200, 60, (c, w, h) => { c.fillStyle = '#ffd43b'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = `700 20px ${FONT}`; c.fillText('도움이 필요하세요?', w / 2, h / 2); });
    G.quad(x1 - 0.8, 0.8, z0 - 0.13, 1.0, 0.3, '#ffffff', { ry: Math.PI, uv: help });
  }
  for (const x of [-11.6, -9.9]) { S.block(x, 0, -0.6, 1.2, 1.75, 0.7, '#dee2e6'); S.block(x, 1.75, -0.6, 1.25, 0.08, 0.75, '#1c7ed6'); G.quad(x, 1.25, -0.96, 0.7, 0.45, '#a5d8ff', { ry: Math.PI, uv: white }); }
  const tk = atlas.add(320, 60, (c, w, h) => { c.fillStyle = '#1c7ed6'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'center'; c.font = `700 24px ${FONT}`; c.fillText('승차권 발매 · 교통카드 충전', w / 2, h / 2); });
  G.quad(-10.75, 2.2, -0.96, 2.6, 0.5, '#ffffff', { ry: Math.PI, uv: tk });

  // ---------- 방면 안내 (매달린 간판) ----------
  const hang = (x, z, w, region, ry = 0) => {
    const h = w * (region.h / region.w);
    S.box(x, 3.25, z, w + 0.1, h + 0.1, 0.1, '#1d2228', { ry });
    for (const dx of [-w / 3, w / 3]) S.box(x + dx * Math.cos(ry), (3.25 + h / 2 + CEIL) / 2, z - dx * Math.sin(ry), 0.03, CEIL - 3.25 - h / 2, 0.03, '#868e96');
    G.quad(x, 3.25, z + 0.06 * Math.cos(ry), w, h, '#ffffff', { ry, uv: region.uv });
    G.quad(x, 3.25, z - 0.06 * Math.cos(ry), w, h, '#ffffff', { ry: ry + Math.PI, uv: region.back || region.uv });
  };
  const mkHang = (w, h, draw) => ({ w, h, uv: atlas.add(w, h, draw) });
  const toPlat = mkHang(640, 90, (c, w, h) => {
    c.fillStyle = '#1d2228'; c.fillRect(0, 0, w, h); c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillStyle = '#fff'; c.font = `800 30px ${FONT}`; c.fillText('타는 곳', 16, 32); c.font = `600 18px ${FONT}`; c.fillStyle = '#c9d1d9'; c.fillText('Platforms', 18, 64);
    let x = 150; x += lineBadge(c, x, 14, 30, P.color, P.short) + 10;
    const dirTxt = `← ${theme.wells[0].ko.replace(/ 방면$/, '')}    ${theme.wells[1].ko.replace(/ 방면$/, '')} →`;
    c.textAlign = 'left'; c.fillStyle = '#fff'; fitText(c, dirTxt, w - x - 10, 22, 700); c.fillText(dirTxt, x, 30);
    if (X) { const bw = lineBadge(c, 150, 50, 28, X.color, X.short); c.textAlign = 'left'; c.fillStyle = '#ffa8a8'; c.font = `700 18px ${FONT}`; c.fillText(`갈아타는 곳 ${X.dirs[0].ko.replace(/ 방면$/, '')} · ${X.dirs[1].ko.replace(/ 방면$/, '')} · Transfer`, Math.max(260, 162 + bw), 64); }
  });
  const wayOut = mkHang(640, 90, (c, w, h) => {
    c.fillStyle = '#FFC20E'; c.fillRect(0, 0, w, h); c.fillStyle = '#111'; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = `800 30px ${FONT}`; c.fillText('나가는 곳', 16, 32); c.font = `600 18px ${FONT}`; c.fillText('Way Out', 18, 64);
    let x = 170;
    const refs = exits.map((e) => e.ref).filter(Boolean), sz = Math.min(54, Math.floor((w - 176) / Math.max(1, refs.length)) - 6), y0 = 18 + (54 - sz) / 2; // 출구가 많으면 (잠실 14개) 칸을 줄인다
    for (const r of refs) { c.fillStyle = '#111'; roundRect(c, x, y0, sz, sz, 7); c.fill(); c.fillStyle = '#FFC20E'; fitText(c, r, sz - 4, Math.round(sz * 0.74), 900); c.textAlign = 'center'; c.fillText(r, x + sz / 2, y0 + sz / 2 + 2); c.textAlign = 'left'; x += sz + 6; }
  });
  hang(0, 0, 4.8, { ...toPlat, back: wayOut.uv }, Math.PI); // 앞(북, 들어오는 쪽) 타는 곳 · 뒤(남, 나오는 쪽) 나가는 곳
  for (const w0 of WELLS) {
    const w = wellTxt(w0);
    const s = mkHang(560, 96, (c, ww, h) => {
      c.fillStyle = '#1d2228'; c.fillRect(0, 0, ww, h); c.textBaseline = 'middle';
      const bw = lineBadge(c, 14, 14, 34, P.color, P.short);
      c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = `800 34px ${FONT}`; c.fillText(w.ko, 28 + bw, 33);
      c.font = `600 20px ${FONT}`; c.fillStyle = '#c9d1d9'; c.fillText(w.en + '  ↓', 30 + bw, 70);
    });
    hang(w.cx, 3.4, 4.2, s, Math.PI);
    // 아래 끝: 준비 중 안내판
    const soon = atlas.add(420, 160, (c, ww, h) => {
      c.fillStyle = '#1d2228'; c.fillRect(0, 0, ww, h); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = P.color; c.fillRect(0, 0, ww, 14);
      c.fillStyle = '#fff'; c.font = `800 34px ${FONT}`; c.fillText(`${w.ko} 승강장`, ww / 2, 54);
      c.font = `700 24px ${FONT}`; c.fillStyle = '#ffd43b'; c.fillText('타는 곳 ↓', ww / 2, 96);
      c.font = `600 20px ${FONT}`; c.fillStyle = '#c9d1d9'; c.fillText(`Platform · ${w.en}`, ww / 2, 132);
    });
    G.quad(w.cx, -2.6, HALL.z1 + 4.85, 4.4, 1.68, '#ffffff', { ry: Math.PI, uv: soon });
    // 위쪽 A형 안내판 (계단 앞 차단선)
    const aSign = atlas.add(240, 150, (c, ww, h) => { c.fillStyle = '#ffd43b'; c.fillRect(0, 0, ww, h); c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 28px ${FONT}`; c.fillText('타는 곳 ↓', ww / 2, 48); c.font = `600 20px ${FONT}`; c.fillText('To platform', ww / 2, 92); c.font = `600 16px ${FONT}`; c.fillText('↓ ' + w.ko, ww / 2, 126); });
    const ax = w.escDir < 0 ? w.x0 - 0.9 : w.x1 + 0.9; // 계단 옆 (사람 다니는 길 밖)
    S.box(ax, 0.55, 3.25, 0.9, 1.1, 0.06, '#495057', { rx: 0.12 });
    G.quad(ax, 0.6, 3.2, 0.8, 0.5, '#ffffff', { ry: Math.PI, rx: -0.12, uv: aSign });

    // ---------- 계단 구덩이 ----------
    const len = w.z1 - w.z0;
    for (const x of [w.x0, w.x1]) {
      S.block(x, -DROP - 0.1, (w.z0 + HALL.z1 + 5) / 2, 0.3, DROP + 0.1, HALL.z1 + 5 - w.z0, '#d8d2c6');
      S.block(x, 0, (w.z0 + w.z1) / 2, 0.08, 1.05, len, '#a5b4c3'); S.block(x, 1.05, (w.z0 + w.z1) / 2, 0.14, 0.06, len, '#ced4da');
    }
    S.block(w.cx, -DROP - 0.1, w.z0 - 0.15, w.x1 - w.x0, DROP, 0.3, '#d8d2c6');
    const sx0 = w.x0 + 0.15, sx1 = w.cx - 0.9, sx2 = w.cx + 0.9, sx3 = w.x1 - 0.15;
    const N = 28, rise = DROP / N, run = RUN / N;
    for (let i = 0; i < N; i++) {
      const yt = -(i + 1) * rise, z = w.z0 + i * run + run / 2;
      for (const [a, b] of [[sx0, sx1], [sx2, sx3]]) { S.box((a + b) / 2, yt - 0.25, z, b - a, 0.5, run, i % 2 ? '#c9c2b3' : '#d2cbbd'); S.box((a + b) / 2, yt + 0.004, z - run / 2 + 0.03, b - a, 0.01, 0.05, '#e0a800'); }
    }
    for (const [a, b] of [[sx0, sx1], [sx2, sx3]]) S.block((a + b) / 2, -DROP - 0.1, HALL.z1 + 2.6, b - a, 0.1, HALL.z1 + 5.4 - (w.z0 + RUN), '#cbc4b6');
    S.block(w.cx, -DROP - 0.1, (w.z0 + RUN + HALL.z1 + 5) / 2, 1.8, 0.1, HALL.z1 + 5 - (w.z0 + RUN), '#cbc4b6');
    S.block(w.cx, -1.4, HALL.z1 + 2.5, w.x1 - w.x0, 1.35, 5.0, '#e6e1d6'); // 아래 통로 천장(대합실 바닥 밑)
    S.block(w.cx, -DROP - 0.1, HALL.z1 + 5.0, w.x1 - w.x0, DROP, 0.2, '#e6e1d6');
    G.quad(w.cx, -1.45, HALL.z1 + 2.5, 3.2, 0.3, '#fffaf0', { rx: Math.PI / 2, uv: white });
    // 에스컬레이터 옆판(경사 박스) + 손잡이
    const hyp = Math.hypot(RUN, DROP);
    for (const sgn of [-1, 1]) {
      const x = w.cx + sgn * 0.72;
      S.box(x, -DROP / 2 + 0.45, w.z0 + RUN / 2, 0.3, 1.0, hyp + 0.2, '#c5ccd3', { rx: SLOPE });
      S.box(x, -DROP / 2 + 1.0, w.z0 + RUN / 2, 0.1, 0.08, hyp + 0.4, '#212529', { rx: SLOPE });
      S.block(x, 0, w.z0 - 0.5, 0.3, 1.0, 1.4, '#c5ccd3'); S.block(x, -DROP, w.z0 + RUN + 0.5, 0.3, 1.0, 1.4, '#c5ccd3');
      S.block(x, 1.0, w.z0 - 0.5, 0.1, 0.06, 1.5, '#212529'); S.block(x, -DROP + 1.0, w.z0 + RUN + 0.5, 0.1, 0.06, 1.5, '#212529');
    }
    S.box(w.cx, -DROP / 2 - 0.25, w.z0 + RUN / 2, 1.2, 0.3, hyp, '#495057', { rx: SLOPE }); // 디딤판 아래 트러스
    S.block(w.cx, -0.02, w.z0 - 1.05, 1.15, 0.03, 0.4, '#adb5bd'); S.block(w.cx, -DROP - 0.02, w.z0 + RUN + 1.05, 1.15, 0.03, 0.4, '#adb5bd'); // 콤 플레이트
  }
  // 두 번째 노선 갈아타는 곳 (남쪽 벽, 가까이 가면 방면 고르기) — 정자 신분당, 이매 경강, 모란·복정·가락시장·석촌·잠실 …
  if (X) {
    const sh = atlas.add(420, 80, (c, w, h) => { c.fillStyle = '#1d2228'; c.fillRect(0, 0, w, h); c.textBaseline = 'middle'; const bw = lineBadge(c, 14, 20, 40, X.color, X.short); c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = `700 24px ${FONT}`; c.fillText('갈아타는 곳 ↓', 28 + bw, 30); c.fillStyle = '#c9d1d9'; const tt = `${X.dirs[0].ko.replace(/ 방면$/, '')} · ${X.dirs[1].ko.replace(/ 방면$/, '')} · ${X.en} transfer`; fitText(c, tt, w - 36 - bw, 16, 600); c.fillText(tt, 28 + bw, 60); });
    G.quad(0, 2.4, HALL.z1 - 0.01, 4.2, 0.8, '#ffffff', { ry: Math.PI, uv: sh });
    S.block(TRANSFER.x, 0, TRANSFER.z + 0.55, TRANSFER.hw * 2, 0.008, 1.1, X.color); // 바닥 색 띠 (여기로 오면 방면 고르기)
  }

  // ---------- 메시 ----------
  const tex = atlas.texture(); disposables.push(tex);
  const staticMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: tex, toneMapped: false });
  const sm = new THREE.Mesh(S.build(), staticMat); sm.name = 'subwayStatic';
  const gm = new THREE.Mesh(G.build(), glowMat); gm.name = 'subwayGlow';
  scene.add(sm, gm); disposables.push(sm.geometry, gm.geometry, staticMat, glowMat);

  // [subway] 도착 안내판 (실시간 또는 시간표 근사). 캔버스 1장 + 평면 1개 = draw call +1. 들어오는 쪽(북)을 본다
  let boardTick = () => {};
  if (board) {
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 200;
    const bt = new THREE.CanvasTexture(cv); bt.colorSpace = THREE.SRGBColorSpace; bt.anisotropy = 4;
    const bg = new THREE.PlaneGeometry(3.2, 1.0), bm = new THREE.MeshBasicMaterial({ map: bt, toneMapped: false });
    const bmesh = new THREE.Mesh(bg, bm); bmesh.name = 'subwayBoard'; bmesh.position.set(-7.5, 3.0, -3.6); bmesh.rotation.y = Math.PI;
    scene.add(bmesh); disposables.push(bt, bg, bm);
    let seen = -1, acc = 1;
    const draw = (b) => {
      const c = cv.getContext('2d'); if (!c) return;
      c.fillStyle = '#0b0d10'; c.fillRect(0, 0, 640, 200);
      c.textBaseline = 'middle'; c.textAlign = 'left';
      c.fillStyle = '#fff'; c.font = `800 22px ${FONT}`; c.fillText(`${theme.name}역 열차 도착`, 14, 20);
      c.textAlign = 'right'; c.fillStyle = b.live ? '#69db7c' : '#ffd43b'; fitText(c, `${b.note} · ${b.noteEn}`, 380, 15, 600); c.fillText(`${b.note} · ${b.noteEn}`, 626, 20);
      b.rows.slice(0, 4).forEach((r, i) => {
        const y = 60 + i * 38;
        c.textAlign = 'left'; const bw = lineBadge(c, 14, y - 14, 28, r.color, r.short);
        c.textAlign = 'left'; c.fillStyle = '#ffe066'; fitText(c, r.dest + (r.kind ? ` (${r.kind})` : ''), 300 - bw, 22, 700); c.fillText(r.dest + (r.kind ? ` (${r.kind})` : ''), 26 + bw, y);
        c.textAlign = 'right'; c.fillStyle = r.last ? '#ff8787' : '#ffa94d'; fitText(c, (r.last ? '막차 · ' : '') + r.msg, 250, 22, 700); c.fillText((r.last ? '막차 · ' : '') + r.msg, 626, y);
      });
      bt.needsUpdate = true;
    };
    boardTick = (dt) => { acc += dt; if (acc < 1) return; acc = 0; board.tick?.(1); const b = board.get(); if (board.version !== seen) { seen = board.version; draw(b); } };
    boardTick(1);
  }

  // 개찰구 날개 (통로마다 2장) + LED
  const flapGeo = new THREE.BoxGeometry(0.42, 0.55, 0.04);
  const flapMat = new THREE.MeshLambertMaterial({ color: '#dbe4ff', transparent: true, opacity: 0.82 });
  const flaps = new THREE.InstancedMesh(flapGeo, flapMat, GATE.lanes.length * 2); flaps.name = 'subwayFlaps';
  const ledGeo = new THREE.BoxGeometry(0.1, 0.03, 0.1), ledMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const leds = new THREE.InstancedMesh(ledGeo, ledMat, GATE.lanes.length * 2); leds.name = 'subwayLeds';
  scene.add(flaps, leds); disposables.push(flapGeo, flapMat, ledGeo, ledMat);
  const lanes = GATE.lanes.map((x) => ({ x, open: 0, t: 0, ok: 0 }));
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1), YAX = new THREE.Vector3(0, 1, 0);
  const cRed = new THREE.Color('#ff3b3b'), cGreen = new THREE.Color('#2bff88'), cIdle = new THREE.Color('#ffb020');
  function drawGates() {
    lanes.forEach((ln, i) => {
      for (const sgn of [-1, 1]) {
        const k = i * 2 + (sgn > 0 ? 1 : 0);
        const hx = ln.x + sgn * 0.5; // 경첩 = 몸체 옆면
        const ang = sgn * (Math.PI / 2) * ln.open * 0.95;
        Q.setFromAxisAngle(YAX, ang);
        V.set(-sgn * 0.21, 0, 0).applyQuaternion(Q).add(new THREE.Vector3(hx, 0.75, 0));
        M4.compose(V, Q, SC); flaps.setMatrixAt(k, M4);
        M4.compose(V.set(GATE.cab[i + 1], 1.06, sgn * 0.62), Q.identity(), SC); leds.setMatrixAt(k, M4); // 단말: 통로 오른쪽 몸체, 앞(-z)·뒤(+z)
        leds.setColorAt(k, ln.ok > 0 ? cGreen : ln.open > 0.05 ? cGreen : cIdle);
      }
    });
    flaps.instanceMatrix.needsUpdate = true; leds.instanceMatrix.needsUpdate = true; if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
  }
  drawGates();

  // 에스컬레이터 디딤판
  const escs = WELLS.map((w) => ({ w, path: escPath(w), dir: w.escDir, off: 0 }));
  const perEsc = Math.ceil(escs[0].path.len / STEP_GAP);
  const stepGeo = new THREE.BoxGeometry(1.0, 0.06, STEP_GAP - 0.03), stepMat = new THREE.MeshLambertMaterial({ color: '#6c757d' });
  const steps = new THREE.InstancedMesh(stepGeo, stepMat, perEsc * escs.length); steps.name = 'subwaySteps';
  scene.add(steps); disposables.push(stepGeo, stepMat);
  function drawSteps(dt) {
    let k = 0;
    for (const e of escs) {
      e.off = (e.off + ESC_SPEED * dt) % STEP_GAP;
      for (let i = 0; i < perEsc; i++) {
        let s = i * STEP_GAP + e.off; if (e.dir > 0) s = e.path.len - s; // 올라가는 쪽은 아래→위
        const p = e.path.at(s);
        M4.compose(V.set(p.x, p.y - 0.03, p.z), Q.identity(), SC); steps.setMatrixAt(k++, M4);
      }
    }
    steps.instanceMatrix.needsUpdate = true;
  }
  drawSteps(0);

  // ---------- 사람 (인스턴싱) ----------
  const crowdGroup = new THREE.Group(); scene.add(crowdGroup);
  const crowd = buildCrowd(crowdGroup, { name: 'subwayCrowd', cast: () => false });
  const me = createAvatar(look || {}); me.userData.sit = ''; const meParts = crowd.register(me);
  let rr = 9137; const rnd = () => ((rr = (rr * 16807) % 2147483647) / 2147483647);
  const npcs = [];
  const fixed = [
    { look: { color: '#12b886', top: 'short', hair: 'short', hat: '#0ca678' }, x: -19.2, z: -9.75, ry: Math.PI, sit: '' },    // 편의점 점원
    { look: { color: '#f8f9fa', top: 'short', hair: 'medium', gender: 'f', hat: '#ffffff' }, x: -11.5, z: -9.85, ry: Math.PI * 0, sit: '' }, // 분식 사장님
    { look: { color: '#1c3d5a', top: 'long', hair: 'short', glasses: true, hat: '#1c3d5a' }, x: 11.2, z: -1.2, ry: Math.PI, sit: 'bench' }, // 역무원
  ];
  for (const f of fixed) { const m = createAvatar(f.look); m.position.set(f.x, 0, f.z); m.rotation.y = f.ry; m.userData.sit = f.sit; npcs.push({ mesh: m, parts: crowd.register(m), fixed: true }); }
  const N_WALK = 14;
  for (let i = 0; i < N_WALK; i++) { const m = createAvatar(LOOKS[i % LOOKS.length]); npcs.push({ mesh: m, parts: crowd.register(m), fixed: false, route: null, i: 0, wait: rnd() * 6 }); }
  crowd.finalize();
  for (const P of crowd.parts.values()) { disposables.push(P.im); if (P.lam) disposables.push(P.im.material); } // 인스턴스 버퍼·전용 재질만 (아바타 공유 지오메트리·재질은 그대로)

  // 경로 만들기: 점 배열 [{x,y,z,ride?}] — ride 구간은 에스컬레이터 위에 서서 이동
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const lane = () => GATE.lanes[1 + Math.floor(rnd() * 5)];
  const mouthOf = (p) => ({ x: p.mouth.x + (p.wall === 'n' ? (rnd() - 0.5) * 3 : 0), y: 0, z: p.mouth.z + (p.wall !== 'n' ? (rnd() - 0.5) * 3 : 0) });
  const deep = (p) => ({ x: p.mouth.x + p.out.x * 5, y: 0, z: p.mouth.z + p.out.z * 5 });
  const shops = [{ x: -19.2, y: 0, z: -8.0 }, { x: -12.4, y: 0, z: -8.0 }, { x: -24, y: 0, z: -7.8 }];
  const AISLE = -3.0, PAID = 2.8; // 기둥·발매기·역무실을 피해 다니는 가로 통로 z
  const toAisle = (q) => ({ x: q.x, y: 0, z: AISLE });
  function makeRoute() {
    const r = rnd();
    const P = pick(passages);
    const shopVisit = () => { const sh = pick(shops); return [toAisle(sh), sh, toAisle(sh)]; };
    if (r < 0.42) { // 내려가기: 출구 → 개찰구 → 계단/에스컬레이터 → 아래 통로
      const w = pick(WELLS), lx = lane(), byEsc = w.escDir < 0 && rnd() < 0.75;
      const m = mouthOf(P);
      const route = [deep(P), m, toAisle(m), ...(rnd() < 0.3 ? shopVisit() : []), { x: lx, y: 0, z: -2.0 }, { x: lx, y: 0, z: 1.6 }, { x: lx, y: 0, z: PAID }];
      if (byEsc) { const e = escs.find((q) => q.w === w); const t = e.path.top; route.push({ x: t[0], y: 0, z: PAID }, { x: t[0], y: 0, z: t[2] }, { ride: e }, { x: w.cx, y: -DROP, z: HALL.z1 + 4.4 }); }
      else { const sx = w.cx + (rnd() < 0.5 ? -2.0 : 2.0); route.push({ x: sx, y: 0, z: PAID }, { x: sx, y: 0, z: w.z0 }, { x: sx, y: -DROP, z: w.z0 + RUN }, { x: sx, y: -DROP, z: HALL.z1 + 4.4 }); }
      return route;
    }
    if (r < 0.84) { // 올라오기: 아래 통로 → 에스컬레이터/계단 → 개찰구 → 출구
      const w = pick(WELLS), lx = lane(), byEsc = w.escDir > 0 && rnd() < 0.75;
      let route;
      if (byEsc) { const e = escs.find((q) => q.w === w); const b = e.path.bot; route = [{ x: w.cx, y: -DROP, z: HALL.z1 + 4.4 }, { x: b[0], y: b[1], z: b[2] }, { ride: e }, { x: w.cx, y: 0, z: PAID }]; }
      else { const sx = w.cx + (rnd() < 0.5 ? -2.0 : 2.0); route = [{ x: sx, y: -DROP, z: HALL.z1 + 4.4 }, { x: sx, y: -DROP, z: w.z0 + RUN }, { x: sx, y: 0, z: w.z0 }, { x: sx, y: 0, z: PAID }]; }
      const m = mouthOf(P);
      route.push({ x: lx, y: 0, z: PAID }, { x: lx, y: 0, z: 1.6 }, { x: lx, y: 0, z: -2.0 }, ...(rnd() < 0.25 ? shopVisit() : []), toAisle(m), m, deep(P));
      return route;
    }
    const Q2 = pick(passages); // 대합실만 지나가기 (가게 들렀다 다른 출구)
    const m1 = mouthOf(P), m2 = mouthOf(Q2);
    return [deep(P), m1, toAisle(m1), ...shopVisit(), toAisle(m2), m2, deep(Q2)];
  }
  const startNpc = (n, warm) => {
    n.route = makeRoute(); n.i = 1; n.rideS = null; n.stop = 0;
    const a = n.route[0]; n.mesh.position.set(a.x, a.y, a.z);
    if (warm) { // 처음엔 경로 중간에서 시작
      const k = 1 + Math.floor(rnd() * Math.max(1, n.route.length - 2));
      const b = n.route[k].ride ? n.route[k - 1] : n.route[k];
      n.mesh.position.set(b.x, b.y, b.z); n.i = n.route[k].ride ? k : k + 1;
    }
  };
  npcs.filter((n) => !n.fixed).forEach((n, i) => (i < 11 ? startNpc(n, true) : (n.route = null, n.wait = 1 + i)));

  // 개찰구: 근처에 사람이 있으면 열림
  const tapLane = (i, who, dir = 'in') => {
    const ln = lanes[i];
    // 대합실(z<0)에서 처음 닿으면 승차, 유료 구역에서 닿으면 하차. 하차 요금은 승차에 포함.
    if (ln.open < 0.5 && ln.t <= 0) { ln.ok = 0.9; if (who === 'me') onToast?.('tap', ln, { gate: gateTapSide(me.position.z) }); }
    ln.t = 1.1;
  };
  function updateNpc(n, dt) {
    if (n.fixed) { animateAvatar(n.mesh, 0, dt); return; }
    if (!n.route) { n.wait -= dt; n.mesh.visible = false; if (n.wait <= 0) startNpc(n, false); return; }
    n.mesh.visible = true;
    const tgt = n.route[n.i];
    if (!tgt) { n.route = null; n.wait = 0.5 + rnd() * 3; return; }
    const p = n.mesh.position;
    if (tgt.ride) { // 에스컬레이터: 디딤판 속도로 서서 이동
      const e = tgt.ride;
      if (n.rideS == null) n.rideS = e.dir < 0 ? 0 : e.path.len; // 경로는 위→아래. 내려가면 s 증가, 올라가면 감소
      n.rideS += (e.dir < 0 ? 1 : -1) * ESC_SPEED * dt;
      const q = e.path.at(n.rideS); p.set(q.x, q.y, q.z);
      n.mesh.rotation.y = e.dir < 0 ? 0 : Math.PI;
      animateAvatar(n.mesh, 0, dt);
      if ((e.dir < 0 && n.rideS >= e.path.len) || (e.dir > 0 && n.rideS <= 0)) { n.rideS = null; n.i++; }
      return;
    }
    const dx = tgt.x - p.x, dy = tgt.y - p.y, dz = tgt.z - p.z, d = Math.hypot(dx, dz);
    const sp = 1.25;
    if (d < 0.08) { p.set(tgt.x, tgt.y, tgt.z); n.i++; animateAvatar(n.mesh, 0, dt); return; }
    const st = Math.min(d, sp * dt);
    p.x += (dx / d) * st; p.z += (dz / d) * st; p.y += dy * (st / d);
    const want = Math.atan2(dx, dz); n.mesh.rotation.y += Math.atan2(Math.sin(want - n.mesh.rotation.y), Math.cos(want - n.mesh.rotation.y)) * Math.min(1, dt * 10);
    const li = laneAt(p.x, p.z, 1.5); if (li >= 0) tapLane(li, 'npc');
    animateAvatar(n.mesh, sp, dt);
  }

  // ---------- 플레이어 ----------
  const entryPass = passages.find((p) => p.exits.some((e) => e.id === entryId)) || passages[0];
  me.position.set(entryPass.mouth.x - entryPass.out.x * 0.5, 0, entryPass.mouth.z - entryPass.out.z * 0.5);
  me.rotation.y = Math.atan2(-entryPass.out.x, -entryPass.out.z);
  const cam = { yaw: Math.atan2(entryPass.out.x, entryPass.out.z), pitch: 0.28, dist: 6.5 };
  // [subway] 승강장에서 올라온 경우: 그 계단 위(유료 구역)에 북쪽을 보고 선다. transfer = 갈아타는 곳 앞
  if (spawn?.well != null && WELLS[spawn.well]) { const w = WELLS[spawn.well]; me.position.set(w.cx, 0, 2.6); me.rotation.y = Math.PI; cam.yaw = 0; }
  else if (spawn?.transfer && X) { me.position.set(0, 0, TRANSFER.z - 0.4); me.rotation.y = Math.PI; cam.yaw = 0; }
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
  const laneOpen = (i) => lanes[i].open > 0.6;
  const canStand = (x, z) => walkable(x, z, 0.3, { passages, blockers, laneOpen });
  const inRoom = (x, z) => walkable(x, z, 0.12, { passages, blockers: [] }) || (x > HALL.x0 && x < HALL.x1 && z > HALL.z0 && z < HALL.z1);
  let speed = 0, lastPass = null, lastWell = wellMouth(me.position.x, me.position.z), lastTr = !!spawn?.transfer;
  // [subway] feedback-12: 승강장에서 올라온 직후엔 계단 트리거를 끈다 → 스폰에서 WELL_REARM m 벗어나거나 계단 앞 구역을 나가야 다시 켜짐
  const wellSpawn = spawn?.well != null && WELLS[spawn.well] ? { x: me.position.x, z: me.position.z } : null;
  let wellArmed = !wellSpawn;

  function update(dt, { look: [dy, dp, dz], axes, allowMove, self = null }) {
    cam.yaw += dy; cam.pitch = THREE.MathUtils.clamp(cam.pitch + dp, -0.6, 1.3); cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + dz), 2.2, 11);
    const p = me.position;
    let { f, s, run } = allowMove ? axes : { f: 0, s: 0, run: false };
    speed = 0; let towardWell = false;
    if ((f || s) && me.userData.sit) me.userData.sit = ''; // [subway-pose] 걸으면 일어남 (바깥과 같게)
    if (f || s) {
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = -fz, rz = fx;
      let mx = fx * f + rx * s, mz = fz * f + rz * s; const L = Math.hypot(mx, mz); mx /= L; mz /= L;
      const sp = (run ? 7.5 : 4.0) * Math.min(1, Math.hypot(f, s)), step = sp * dt;
      // 0.1m 씩 나눠 움직여 벽·차단선에 딱 붙는다 (느린 프레임에서 한 번에 0.4m 씩 뛰면 계단 입구 띠(0.25m)를 건너뛰고 멈춤)
      const nSub = Math.max(1, Math.ceil(step / 0.1)), sx = (mx * step) / nSub, sz = (mz * step) / nSub;
      for (let k = 0; k < nSub; k++) {
        const nx = p.x + sx, nz = p.z + sz;
        const stuck = !canStand(p.x, p.z);
        if (canStand(nx, p.z) || stuck) p.x = nx;
        if (canStand(p.x, nz) || stuck) p.z = nz;
      }
      towardWell = mz > WELL_INTO; // 남쪽(계단 아래쪽)으로 곧장 걸어 들어가는 중 (옆걸음·제자리 돌기는 아님)
      const want = Math.atan2(mx, mz); me.rotation.y += Math.atan2(Math.sin(want - me.rotation.y), Math.cos(want - me.rotation.y)) * Math.min(1, dt * 12);
      speed = sp;
    }
    const li = laneAt(p.x, p.z, 1.3); if (li >= 0) tapLane(li, 'me', mz < -0.2 ? 'out' : 'in');
    if (self) { me.userData.emote = speed > 0 ? '' : (self.emote || ''); me.userData.afk = !!self.afk; me.userData.jumpY = me.userData.sit ? 0 : (self.jy || 0); } // [zone] 리액션·자리비움·점프도 안에서 보이게
    animateAvatar(me, speed, dt);
    for (const ln of lanes) { ln.t -= dt; ln.ok -= dt; const want = ln.t > 0 ? 1 : 0; ln.open += Math.sign(want - ln.open) * Math.min(Math.abs(want - ln.open), dt * 4); }
    for (const n of npcs) updateNpc(n, dt);
    drawGates(); drawSteps(dt); boardTick(dt);
    crowd.begin();
    crowd.add(me, meParts, false);
    for (const n of npcs) if (n.fixed || n.route) crowd.add(n.mesh, n.parts, false);
    crowd.end();
    // 카메라: 방·통로 밖으로 나가면 당겨온다, 천장 아래
    const eye = p.y + 1.55, bx = Math.sin(cam.yaw), bz = Math.cos(cam.yaw), cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch);
    let d = cam.dist;
    for (; d > 1.2; d -= 0.25) { const cx = p.x + bx * d * cp, cz = p.z + bz * d * cp; if (inRoom(cx, cz)) break; }
    camera.position.set(p.x + bx * d * cp, THREE.MathUtils.clamp(eye + d * spp, 0.4, CEIL - 0.25), p.z + bz * d * cp);
    camera.lookAt(p.x - bx * 3 * cp, eye - 3 * spp, p.z - bz * 3 * cp);
    // 상태 신호
    const pass = passageAt(p.x, p.z, passages);
    const entered = pass && pass !== lastPass ? pass : null; lastPass = pass;
    // 승강장 계단 / 갈아타는 곳: 밖에서 걸어 들어올 때만 (올라온 직후엔 한 번 벗어나야)
    const well = nearWellTop(p.x, p.z), mouth = wellMouth(p.x, p.z);
    if (!wellArmed && (!well || Math.hypot(p.x - wellSpawn.x, p.z - wellSpawn.z) > WELL_REARM)) wellArmed = true;
    const wellEnter = wellArmed && mouth && mouth !== lastWell && towardWell ? WELLS.indexOf(mouth) : -1;
    if (!mouth || wellEnter >= 0) lastWell = mouth;
    const tr = !!X && Math.abs(p.x - TRANSFER.x) < TRANSFER.hw && p.z > TRANSFER.z;
    const transferEnter = tr && !lastTr; lastTr = tr;
    return { enteredPassage: entered, wellEnter, transferEnter, wellHint: well ? wellTxt(well) : null };
  }
  function render() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.render(scene, camera); }
  function dispose() {
    for (const d of disposables) d.dispose?.();
    scene.clear();
  }
  // 스크린샷/디버그
  function setView(x, z, yaw, pitch = 0.3, dist = 6) { me.position.set(x, 0, z); cam.yaw = yaw; cam.pitch = pitch; cam.dist = dist; }
  // [subway-pose] 대합실엔 앉을 의자가 없어 바닥에 앉는다 (바깥 '바닥 앉기'와 같은 자세)
  function sitDown() { if (!me.userData.sit) me.userData.sit = 'ground'; return me.userData.sit; }
  function standUp() { me.userData.sit = ''; }
  return { get sitKind() { return me.userData.sit || ''; }, sitDown, standUp, get lastPass() { return lastPass; }, get wellArmed() { return wellArmed; }, get speed() { return speed; }, scene, camera, player: me, cam, passages, lanes, update, render, dispose, setView, npcs, stats: () => ({ tris: S.count + G.count, parts: crowd.parts.size, npcs: npcs.length }) };
}
