// [depot-story] 7일차 '본사 감사의 날' — E11 감사(600초, 체크 5칸) 하나 안에서 E09 전설의 아이스크림(녹음 게이지)·E10 200kg 기립박수가 같이 돎.
//   판정·상태는 순수 함수(노드 테스트: scripts/test-depot-day7.mjs), 3D·DOM 소품은 createDay7Props (브라우저).
//   엔딩: events.json endingVitality — 12 + 사건별 활기(성공 = 표 값, 부분 = 절반 내림, 실패·놓침 = 0, 상한 100) → A ≥70 / B ≥45 / C.
import { box, hex, geo } from './day6.js';

export const E09 = Object.freeze({ timeLimitSec: 150, basePct: 0.3, bumpPct: 5, crushPct: 20, pickR: 1.8, alarmPct: 90, dripSec: 12 });
export const E10 = Object.freeze({ targetKg: 200, cartKg: 27 });
export const E11 = Object.freeze({ timeLimitSec: 600, ratio: 0.85, triggerDistM: 15, dodgeSec: 20, beyondM: 4, followM: 6, ramR: 1.3 });
/** 반기철 대형 카트가 막는 칸 (targets spy-block-1/2/3 중심, 통로 폭에 맞춘 사각형 — 랙·매대와 안 겹침) */
export const SPY_RECT = Object.freeze({
  'spy-block-1': { x0: 45.3, x1: 48.7, z0: 25.4, z1: 26.6 }, // 메인 통로 (x 방향으로 가로막음)
  'spy-block-2': { x0: 55.4, x1: 56.6, z0: 42.4, z1: 44.3 }, // 교차 통로 (z 방향)
  'spy-block-3': { x0: 57.75, x1: 59.8, z0: 26.4, z1: 27.6 }, // 통로 02
});
export const LEGEND_AT = Object.freeze({ x: 82.15, y: 0.34, z: 76.6 }); // 냉동 쇼케이스 맨 아래 칸 (freezer-legend 81, 76.6 앞)

// ---------------------------------------------------------------- 판정 ----------------------------------------------------------------
/** E09: 꺼냈는지 + 녹음(%) → checkout.done 때 */
export function evalE09({ picked, melt }) { if (!picked) return 'missed'; return melt >= 100 ? 'fail' : melt >= 50 ? 'partial' : 'success'; }
/** E10: 상품 kg + 카트 27kg ≥ 200, 깨진 알(감사 시작 뒤) */
export function evalE10({ kg, eggs }, t = E10) { return kg + t.cartKg >= t.targetKg ? (eggs > 0 ? 'partial' : 'success') : 'fail'; }
/** 적재율 링 값: 무게(173 kg = 200 − 카트) 와 부피(윗바구니 + 아래 받침대) 중 큰 쪽 */
export function loadRatio(kg, volFill = 0, t = E10) { return Math.round(1000 * Math.max(0, Math.min(1.5, Math.max(kg / (t.targetKg - t.cartKg), volFill)))) / 1000; }
/** 체크 5칸 */
export function auditChecks({ eggs, ratio, kg, blocks, sec }, t = E11) {
  return {
    c1: eggs === 0,
    c2: ratio >= t.ratio,
    c3: kg + E10.cartKg >= E10.targetKg,
    c4: (blocks || []).every((b) => b.state !== 'failed' && b.state !== 'on'), // 아직 안 막힌(못 만난) 방해는 실패 아님
    c5: sec <= t.timeLimitSec,
  };
}
export function evalE11(checks) { const n = Object.values(checks).filter(Boolean).length; return n >= 4 ? 'success' : n >= 2 ? 'partial' : 'fail'; }

/** 엔딩 활기 (endingVitality) — ev: save.ev, table: events.json endingVitality */
export function endingVitality(ev = {}, table = {}) {
  const parts = [];
  let v = table.start ?? 12;
  for (const [grp, tbl] of [['main', table.main || {}], ['side', table.side || {}]]) {
    for (const [id, val] of Object.entries(tbl)) {
      const r = ev[id], g = r === 'success' ? val : r === 'partial' ? Math.floor(val / 2) : 0;
      if (g) parts.push({ id, grp, r, g });
      v += g;
    }
  }
  return { vit: Math.min(table.max ?? 100, v), parts };
}
/** branch ranges [{min, ending, goto}] — 큰 min 부터 */
export function pickRange(v, ranges = []) { return [...ranges].sort((a, b) => b.min - a.min).find((r) => v >= r.min) || ranges[ranges.length - 1] || null; }

/** E09 녹음 게이지: 꺼낸 순간부터 초당 0.3%, cart-bump +5%, 눌림 +20%, 150초 지나면 100% */
export function createMelt(t = E09) {
  const S = { picked: false, t: 0, melt: 0, bumps: 0, crush: 0, alarm: false };
  return {
    S,
    pick() { if (!S.picked) { S.picked = true; S.t = 0; } },
    bump() { if (S.picked && S.melt < 100) { S.bumps++; S.melt = Math.min(100, S.melt + t.bumpPct); } },
    crushed() { if (S.picked && S.melt < 100) { S.crush++; S.melt = Math.min(100, S.melt + t.crushPct); } },
    step(dt) { if (!S.picked) return S; S.t += dt; S.melt = S.t >= t.timeLimitSec ? 100 : Math.min(100, S.melt + t.basePct * dt); return S; },
    get left() { return S.picked ? Math.max(0, t.timeLimitSec - S.t) : t.timeLimitSec; },
    result: () => evalE09(S),
  };
}

/** 사각형의 긴 축이 통로를 가로막는 방향 → 지나가는 축('x'|'z')과 그 축의 가장자리 */
export function passAxis(r) { return (r.x1 - r.x0) >= (r.z1 - r.z0) ? 'z' : 'x'; }
export function rectDist(r, x, z) { const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1); return Math.hypot(dx, dz); }

/**
 * E11 반기철 방해 3번: after 초 뒤 플레이어가 막을 자리 15 m 안에 오면 막음(state 'on').
 *   20초 안에 반기철 카트를 밀면(ram) 실패. 밀지 않고 막힌 곳 너머 4 m 로 빠져나가면 피함.
 *   20초가 지나도 안 밀었고 4 m 넘게 떨어져 있으면(돌아감) 피함, 붙어 있으면 실패.
 */
export function createAudit({ blocks = [], t = E11, onEvent = () => {} } = {}) {
  const B = blocks.map((b, i) => ({ i, id: b.id || `b${i + 1}`, target: b.target, rect: b.rect || SPY_RECT[b.target], after: b.after ?? 45 * (i + 1), trig: b.triggerDistM ?? t.triggerDistM, line: b.line || '', sfx: b.sfx || 'motif.spy', state: 'wait', at: 0, side: 0 }));
  const S = { t: 0, rams: 0 };
  const center = (r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
  const sideOf = (b, p) => { const ax = passAxis(b.rect), c = center(b.rect); return Math.sign((ax === 'z' ? p.z - c.z : p.x - c.x) || 1); };
  const beyond = (b, p) => { const ax = passAxis(b.rect), r = b.rect; return ax === 'z' ? (b.side < 0 ? p.z > r.z1 + t.beyondM : p.z < r.z0 - t.beyondM) : (b.side < 0 ? p.x > r.x1 + t.beyondM : p.x < r.x0 - t.beyondM); };
  function close(b, state, why) { b.state = state; b.why = why; onEvent(state === 'dodged' ? 'dodge' : 'fail', b); }
  return {
    S, B,
    step(dt, p, tAbs) {
      S.t = tAbs ?? S.t + dt;
      for (const b of B) {
        if (b.state === 'wait') {
          const d = rectDist(b.rect, p.x, p.z);
          if (S.t >= b.after && !B.some((x) => x.state === 'on') && d < b.trig && d > 2.5) { // 바로 위·옆(2.5 m 안)에서는 안 막음 — 카트가 갇히지 않게
            b.state = 'on'; b.at = S.t; b.side = sideOf(b, p); onEvent('block', b); }
        } else if (b.state === 'on') {
          if (beyond(b, p)) close(b, 'dodged', 'beyond');
          else if (S.t - b.at >= t.dodgeSec) close(b, rectDist(b.rect, p.x, p.z) >= t.beyondM ? 'dodged' : 'failed', 'timeout');
        }
      }
      return S;
    },
    /** cart-bump 이 막는 카트 근처에서 남 → 그 방해는 실패 */
    ram(p) { const b = B.find((x) => x.state === 'on' && rectDist(x.rect, p.x, p.z) < t.ramR); if (!b) return null; S.rams++; close(b, 'failed', 'ram'); return b; },
    active: () => B.find((b) => b.state === 'on') || null,
    dodged: () => B.filter((b) => b.state === 'dodged').length,
    failed: () => B.filter((b) => b.state === 'failed').length,
  };
}

/** 감사관 따라오기: 플레이어 발자취(0.3 m 간격)에서 6 m 뒤 지점으로 걸어감 (충돌 없음) */
export function createFollower({ start = { x: 66, z: 6 }, distM = E11.followM, speed = 2.6 } = {}) {
  const S = { x: start.x, z: start.z, yaw: 0, v: 0 }, trail = [{ x: start.x, z: start.z }];
  return {
    S,
    step(dt, p) {
      const l = trail[trail.length - 1]; if (Math.hypot(p.x - l.x, p.z - l.z) > 0.3) { trail.push({ x: p.x, z: p.z }); if (trail.length > 400) trail.shift(); }
      let need = distM, goal = trail[trail.length - 1];
      for (let i = trail.length - 1; i > 0; i--) { const a = trail[i], b = trail[i - 1], d = Math.hypot(a.x - b.x, a.z - b.z); if (need <= d) { const k = need / d; goal = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k }; break; } need -= d; goal = b; }
      const dx = goal.x - S.x, dz = goal.z - S.z, d = Math.hypot(dx, dz), far = Math.hypot(p.x - S.x, p.z - S.z);
      const v = d < 0.05 || far < distM - 0.5 ? 0 : Math.min(d / Math.max(dt, 1e-3), d > 4 ? speed * 1.6 : speed);
      S.v = v; if (v > 0) { S.x += dx / d * v * dt; S.z += dz / d * v * dt; S.yaw = Math.atan2(dx, dz); } else if (far > 0.1) S.yaw = Math.atan2(p.x - S.x, p.z - S.z);
      return S;
    },
  };
}

// ---------------------------------------------------------------- 3D·DOM (브라우저) ----------------------------------------------------------------
/**
 * 7일차 소품: 감사관 NPC(정점 색 메시 1) · 반기철 보라 대형 카트(메시 1, 막을 때만) · 전설의 아이스크림(쇼케이스 / 카트 위) ·
 *   체크리스트 HUD(5칸) · 녹음 게이지 · 금도장 연출.
 */
export function createDay7Props({ THREE, scene, keep, cartObj = null, isMobile = false, obstacles = null }) {
  let aud = null, spy = null, spyObs = null, legend = null, legendCart = null, hud = null, melt = null, css = null, gold = null;
  const addObs = (o) => { obstacles?.push(o); return o; };
  const rmObs = (o) => { if (!o || !obstacles) return; const i = obstacles.indexOf(o); if (i >= 0) obstacles.splice(i, 1); };
  function buildAuditor() { // 남색 정장 · 흰 셔츠 · 태블릿 — 상자 몇 개 (얼굴은 피부색 상자)
    const pos = [], col = [], nrm = [], N = hex(0x1e2a4a), W = hex(0xf2f2ee), S = hex(0xf0c8a0), H = hex(0x1a1a1a), T = hex(0x30343a), G = hex(0x8fd0ff), K = hex(0x101418);
    box(pos, col, -0.11, 0.42, 0, 0.16, 0.84, 0.2, N, nrm); box(pos, col, 0.11, 0.42, 0, 0.16, 0.84, 0.2, N, nrm); // 다리
    box(pos, col, -0.11, 0.04, 0.04, 0.17, 0.08, 0.3, K, nrm); box(pos, col, 0.11, 0.04, 0.04, 0.17, 0.08, 0.3, K, nrm); // 구두
    box(pos, col, 0, 1.18, 0, 0.5, 0.7, 0.28, N, nrm); box(pos, col, 0, 1.33, 0.145, 0.12, 0.38, 0.01, W, nrm); // 몸통 · 셔츠
    box(pos, col, -0.31, 1.15, 0.02, 0.12, 0.62, 0.14, N, nrm); box(pos, col, 0.3, 1.1, 0.14, 0.12, 0.5, 0.14, N, nrm); // 팔
    box(pos, col, 0, 1.68, 0, 0.26, 0.3, 0.26, S, nrm); box(pos, col, 0, 1.84, -0.02, 0.28, 0.08, 0.28, H, nrm); // 머리 · 머리카락
    box(pos, col, 0.22, 1.02, 0.3, 0.3, 0.02, 0.22, T, nrm); box(pos, col, 0.22, 1.032, 0.3, 0.26, 0.005, 0.18, G, nrm); // 태블릿
    const m = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), keep(new THREE.MeshLambertMaterial({ vertexColors: true }))); m.name = 'story-auditor'; return m;
  }
  function buildSpyCart() { // 보라 대형 카트 (보통 카트의 1.5배) — 길이 축 = 로컬 x. 반기철은 손님 NPC 'spy' 를 옆에 세움
    const pos = [], col = [], nrm = [], P = hex(0x7a3fc0), D = hex(0x3a2160), K = hex(0x222222);
    box(pos, col, 0, 0.82, 0, 1.6, 0.62, 0.92, P, nrm); box(pos, col, 0, 0.5, 0, 1.5, 0.06, 0.86, D, nrm); box(pos, col, 0.9, 1.15, 0, 0.06, 0.06, 0.9, D, nrm);
    for (const [x, z] of [[-0.68, -0.38], [-0.68, 0.38], [0.68, -0.38], [0.68, 0.38]]) box(pos, col, x, 0.1, z, 0.14, 0.2, 0.14, K, nrm);
    const m = new THREE.Mesh(geo(THREE, keep, pos, col, nrm), keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x140820 }))); m.name = 'story-spy-cart'; return m;
  }
  let legGeo = null, legMat = null;
  function legendMesh() { // '범설빙 왕통': 하늘색 통 + 흰 띠 + 금빛 뚜껑
    if (!legGeo) { const pos = [], col = [], nrm = []; box(pos, col, 0, 0, 0, 0.3, 0.22, 0.3, hex(0x7cc8f0), nrm); box(pos, col, 0, 0.0, 0, 0.31, 0.06, 0.31, hex(0xffffff), nrm); box(pos, col, 0, 0.125, 0, 0.32, 0.03, 0.32, hex(0xf2c230), nrm); legGeo = geo(THREE, keep, pos, col, nrm); legMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a3a50 })); }
    const m = new THREE.Mesh(legGeo, legMat); m.name = 'story-legend-icecream'; return m;
  }
  function ensureCss() {
    if (css || typeof document === 'undefined') return;
    css = document.createElement('style'); css.id = 'dp-d7-css';
    css.textContent = `#dp-d7{position:fixed;right:${isMobile ? 8 : 16}px;top:${isMobile ? 120 : 236}px;z-index:40;background:rgba(14,22,40,.86);color:#fff;border:2px solid #f2c230;border-radius:14px;padding:9px 12px;font:600 12.5px Pretendard,"Noto Sans KR",sans-serif;min-width:${isMobile ? 170 : 220}px;pointer-events:none}
#dp-d7 h5{margin:0 0 5px;font:900 13px Pretendard,sans-serif;color:#f2c230;display:flex;justify-content:space-between}
#dp-d7 li{list-style:none;display:flex;justify-content:space-between;gap:10px;padding:2px 0}#dp-d7 ul{margin:0;padding:0}
#dp-d7 li b{font-weight:900}#dp-d7 li.ok b{color:#7be08a}#dp-d7 li.no b{color:#ff7a6a}#dp-d7 li.no span{opacity:.75;text-decoration:line-through}
#dp-d7 .stp{position:absolute;right:-8px;top:-14px;border:4px solid #e0412f;color:#e0412f;border-radius:10px;padding:2px 8px;font:900 18px Pretendard,sans-serif;transform:rotate(-10deg);background:rgba(255,255,255,.92);animation:dpd7s .35s}
@keyframes dpd7s{0%{transform:rotate(-10deg) scale(2.2);opacity:0}100%{transform:rotate(-10deg) scale(1);opacity:1}}
#dp-d7m{position:fixed;left:50%;transform:translateX(-50%);bottom:${isMobile ? 96 : 26}px;z-index:40;background:rgba(14,22,40,.86);color:#fff;border-radius:12px;padding:8px 13px;font:700 12.5px Pretendard,sans-serif;min-width:${isMobile ? 160 : 240}px;pointer-events:none}
#dp-d7m .bar{height:9px;border-radius:6px;background:#3a4a66;margin-top:5px;overflow:hidden}#dp-d7m .bar i{display:block;height:100%;background:linear-gradient(90deg,#7cc8f0,#ff7a6a);width:0}
#dp-d7g{position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:60;pointer-events:none;text-align:center;font:900 20px Pretendard,sans-serif;color:#7a5200}
#dp-d7g .gs{width:150px;height:150px;margin:0 auto;border-radius:50%;border:8px solid #d9a21a;background:radial-gradient(circle,#fff6c8,#f2c230);display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 0 40px rgba(242,194,48,.8);animation:dpd7s .45s}`;
    document.head.appendChild(css);
  }
  const LBL = { c1: '깨진 알 0개', c2: '적재율 85% 이상', c3: '카트 포함 200kg', c4: '반값 방해 3번 피하기', c5: '10분 안에 계산' };
  const api = {
    /** 감사관: {x,z,yaw} 자리에 세움 · null 치움 */
    auditor(p) { if (!p) { aud?.removeFromParent(); return; } aud ||= buildAuditor(); if (!aud.parent) scene.add(aud); aud.position.set(p.x, 0, p.z); aud.rotation.y = p.yaw || 0; aud.position.y = p.v > 0.1 ? Math.abs(Math.sin(performance.now() / 160)) * 0.03 : 0; },
    /** 반기철 대형 카트: rect 를 막음 (story 장애물) · null 치움. side: 반기철이 서는 쪽(-1|1, 지나가는 축) */
    spyCart(rect, side = 1) {
      rmObs(spyObs); spyObs = null;
      if (!rect) { spy?.removeFromParent(); return; }
      spy ||= buildSpyCart(); if (!spy.parent) scene.add(spy);
      const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2, alongX = (rect.x1 - rect.x0) >= (rect.z1 - rect.z0);
      spy.scale.set(Math.max(1, (alongX ? rect.x1 - rect.x0 : rect.z1 - rect.z0) / 1.6), 1, 1);
      spy.position.set(cx, 0, cz); spy.rotation.y = alongX ? (side > 0 ? 0 : Math.PI) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      spyObs = addObs({ x0: rect.x0, x1: rect.x1, z0: rect.z0, z1: rect.z1, story: 'e11' });
    },
    /** 전설의 아이스크림: 'freezer' 쇼케이스 맨 아래 칸 · 'cart' 카트 위 · null */
    legend(where, melt = 0) {
      if (where === 'freezer') { legend ||= legendMesh(); legend.position.set(LEGEND_AT.x, LEGEND_AT.y, LEGEND_AT.z); scene.add(legend); legendCart?.removeFromParent(); return; }
      legend?.removeFromParent();
      if (where === 'cart' && cartObj) { legendCart ||= legendMesh(); legendCart.position.set(-0.12, 1.02, 0.22); legendCart.scale.set(1, Math.max(0.35, 1 - melt / 140), 1); if (!legendCart.parent) cartObj.add(legendCart); return; }
      legendCart?.removeFromParent();
    },
    legendWorld(v) { if (!legendCart?.parent) return null; legendCart.updateWorldMatrix(true, false); return legendCart.getWorldPosition(v || new THREE.Vector3()); },
    /** 체크리스트 HUD — o: null 치움 · {list:true} 칸만 · {checks, vals, result} */
    checklist(o) {
      if (typeof document === 'undefined') return;
      if (!o) { hud?.remove(); hud = null; return; }
      ensureCss(); if (!hud) { hud = document.createElement('div'); hud.id = 'dp-d7'; document.body.appendChild(hud); }
      const n = o.checks ? Object.values(o.checks).filter(Boolean).length : 0;
      const LB = o.labels || LBL; hud.classList.toggle('w2', !!o.labels);
      hud.innerHTML = `<h5><span>${o.title || '본사 감사 체크리스트'}</span><span>${o.checks ? `${n}/5` : '4개면 통과'}</span></h5><ul>${Object.keys(LB).map((k) => `<li class="${o.checks ? (o.checks[k] ? 'ok' : (o.result || o.lost?.[k]) ? 'no' : (o.pending?.[k] ? 'pd' : '')) : ''}"><span>${LB[k]}</span><b>${o.checks ? (o.checks[k] ? '✓' : (o.result || o.lost?.[k]) ? '✗' : '') : ''} ${o.vals?.[k] ?? ''}</b></li>`).join('')}</ul>${o.result ? `<div class="stp">${o.result === 'success' ? '통과' : o.result === 'partial' ? '보류' : '미달'}</div>` : ''}`;
    },
    /** 녹음 게이지 (null 치움) */
    melt(o) {
      if (typeof document === 'undefined') return;
      if (!o) { melt?.remove(); melt = null; return; }
      ensureCss(); if (!melt) { melt = document.createElement('div'); melt.id = 'dp-d7m'; melt.innerHTML = '<div style="display:flex;justify-content:space-between;gap:12px"><span>🍨 범설빙 왕통 · 녹음</span><b class="v">0%</b></div><div class="bar"><i></i></div>'; document.body.appendChild(melt); }
      melt.querySelector('.v').textContent = `${Math.round(o.melt)}% · ${Math.ceil(o.left)}초`; melt.querySelector('i').style.width = `${Math.min(100, o.melt)}%`;
    },
    /** 금도장 (2.6초) */
    goldStamp(text = '금도장') { if (typeof document === 'undefined') return; ensureCss(); gold?.remove(); gold = document.createElement('div'); gold.id = 'dp-d7g'; gold.innerHTML = `<div class="gs">${text}</div><p>단골 도장 7칸째</p>`; document.body.appendChild(gold); const g = gold; setTimeout(() => { g.remove(); if (gold === g) gold = null; }, 2600); },
    stats() { return { auditor: !!aud?.parent, spyCart: !!spy?.parent, obstacles: spyObs ? 1 : 0, legend: legend?.parent ? 'freezer' : legendCart?.parent ? 'cart' : null, hud: !!hud, melt: !!melt }; },
    clearMission() { api.spyCart(null); api.legend(null); api.melt(null); },
    dispose() { api.auditor(null); api.clearMission(); api.checklist(null); gold?.remove(); gold = null; css?.remove(); css = null; },
  };
  return api;
}
