// [roadbike] 선물함 CR·1 에어로 로드바이크. 주인만 소환/탑승. 타거나 세워 두면 다른 사람에게 보임.
//   최고 50 km/h · veh id 902/903 (관리자 바이크 900/901, 트럭 0~59 와 겹치지 않음) · ?roadbike=0 끔
//   꺼내기/탑승/주행/중계는 giftRide 공통 틀, 여기는 CR·1 만의 모델·페달링·사이클 컴퓨터·자세.
import * as THREE from 'three';
import { createRoadBikeModel, drawComputer, RB, prewarmRoadBikeDecals } from './roadBikeModel.js';
import { createRoadHelmetHead } from './helmetHead.js';
import { createGiftRide } from '../giftRide/giftRide.js';
import { buildTuckRider, poseTuckRider } from '../giftRide/riderRig.js';

export { ROADBIKE_GIFT_ID, ROADBIKE_SEED_QTY, ROADBIKE_WHITE_GIFT_ID, ROADBIKE_WHITE_SEED_QTY, giftQtyOf } from './catalog.js';
export const ROADBIKE_VEH_ID = 902;
export const ROADBIKE_WHITE_VEH_ID = 903;
const VMAX = 50 / 3.6;
const RING_R = 0.1011;

const RIDER = {
  hip: new THREE.Vector3(0, 1.08, -0.38),
  torso: 1.12,
  upperScale: [0.7, 0.8, 0.6],
  helmet: createRoadHelmetHead,
  shoe: '#f2f2f0',
  glove: '#1c1d20',
  foot: [0.085, 0.06, 0.24],
  leg: [0.08, 0.064],
  arm: [0.058, 0.05],
};
const _f = new THREE.Vector3();

function poseRider(rider, bike) {
  const U = bike.userData;
  poseTuckRider(rider, {
    frame: U.lean,
    grips: U.grips,
    // pedals[0] = 구동측(-x, 오른쪽), pedals[1] = +x(왼쪽). sx>0 이 왼쪽이다.
    foot: (sx, out) => out.copy(U.lean.worldToLocal(U.pedals[sx > 0 ? 1 : 0].localToWorld(_f.set(sx * 0.03, 0.02, 0)))),
    legLen: [0.54, 0.5],
    armLen: [0.32, 0.31],
    // 무릎은 옆으로 벌리지 않고, 앞(+z)으로 나가며 정강이가 페달 쪽으로 뒤로 접힌다.
    knee: (sx) => new THREE.Vector3(sx * 0.05, 0.2, 1),
    elbow: (sx) => new THREE.Vector3(sx * 0.7, -0.35, -0.6),
  });
}

let hudCss = false;
function cycleComputerHud(b, stats, U) {
  if (!hudCss) {
    hudCss = true;
    const css = document.createElement('style');
    css.textContent = `.rb-hud{position:fixed;right:12px;bottom:calc(var(--minimap-top,226px) + 10px);display:none;width:156px;color:#0b0b0c;font-family:system-ui,sans-serif;z-index:6;pointer-events:none;background:#141518;border-radius:16px;padding:8px 8px 6px;box-shadow:0 3px 14px #0007}
@media (max-width:720px){.rb-hud{width:128px}}
.rb-hud .scr{background:#eef0ea;border-radius:6px;padding:6px 8px 4px}
.rb-hud .lb{font:700 10px system-ui;color:#5b5e63;display:flex;justify-content:space-between}
.rb-hud .v{font:900 44px/1 system-ui;text-align:center;letter-spacing:-1px}
.rb-hud .bar{height:5px;background:#c9ccc5;border-radius:3px;margin:3px 0 5px}.rb-hud .bar i{display:block;height:100%;background:#2f7fd8;border-radius:3px}
.rb-hud .g{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;border-top:2px solid #c9ccc5;padding-top:3px}
.rb-hud .g b{display:block;font:900 18px/1.1 system-ui}.rb-hud .g span{font:700 9px system-ui;color:#5b5e63}
.rb-hud .brand{color:#d8d9dc;font:800 10px system-ui;text-align:center;margin-top:4px;letter-spacing:1px}`;
    document.head.appendChild(css);
  }
  const hud = document.createElement('div');
  hud.className = 'rb-hud';
  hud.innerHTML = `<div class="scr"><div class="lb"><span>SPEED</span><span>km/h</span></div><div class="v">0.0</div><div class="bar"><i style="width:0"></i></div>
<div class="g"><div><span>DIST km</span><b class="d">0.00</b></div><div><span>TIME</span><b class="t">0:00</b></div><div><span>CADENCE rpm</span><b class="c">0</b></div><div><span>AVG km/h</span><b class="a">0.0</b></div></div></div><div class="brand">BUMPINTO</div>`;
  document.body.appendChild(hud);
  const H = Object.fromEntries(['v', 'd', 't', 'c', 'a'].map((k) => [k, hud.querySelector(`.${k}`)]));
  H.bar = hud.querySelector('.bar i');
  let scrT = 0;
  const draw = (dt, riding, active, force) => {
    scrT -= dt;
    if (scrT > 0 && !force) return;
    scrT = 0.1;
    const kmh = Math.min(50, Math.abs(b.v) * 3.6);
    const avg = stats.time > 1 ? (stats.dist / stats.time) * 3.6 : 0;
    const st = { kmh, dist: stats.dist / 1000, time: stats.time, cad: b.cad, avg, riding: active };
    drawComputer(U.screen.ctx, st);
    U.screen.tex.needsUpdate = true;
    if (!riding) return;
    H.v.textContent = kmh.toFixed(1);
    H.bar.style.width = `${(kmh / 50) * 100}%`;
    H.bar.style.background = kmh >= 49.95 ? '#e8333a' : '#2f7fd8';
    H.d.textContent = st.dist.toFixed(2);
    const t = Math.floor(st.time);
    H.t.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    H.c.textContent = Math.round(b.cad);
    H.a.textContent = avg.toFixed(1);
  };
  draw(0, false, false, true);
  return {
    show() { hud.style.display = 'block'; },
    hide() { hud.style.display = 'none'; },
    frame(dt, { riding, active }) { draw(dt, riding, active); },
  };
}

/** 페달링 중인가 (밟는 중이고 뒤로 밀리지 않음) — 크랭크 연출과 중계 p 필드 */
const pedaling = (b) => b.throttle > 0 && b.v >= 0;

export function createRoadBike({ params, vehId = ROADBIKE_VEH_ID, colorway = 'black', name = 'CR·1', ...env }) {
  if (params.get('roadbike') === '0') return null;
  return createGiftRide(env, {
    vehId,
    icon: '🚲',
    name,
    model: (renderer) => createRoadBikeModel(renderer, { colorway }),
    dims: { WB: RB.WB, R: RB.R, HL: 0.87, HW: 0.22 },
    drive: { revV: 3 / 3.6, rMin: 2.2, latG: 0.75, yawK: 5, steerIn: 3.5, leanMax: 0.66, steerMax: 0.55 },
    throttle(b, dt, f, sprint) {
      if (f > 0) b.v += (b.v < -0.05 ? 4 : (sprint ? 3.4 : 2.4) * (1 - 0.8 * (Math.max(0, b.v) / VMAX) ** 2)) * f * dt;
      else if (f < 0) b.v += (b.v > 0.15 ? -6 : -1.2) * -f * dt;
      else b.v -= Math.sign(b.v) * Math.min(Math.abs(b.v), (0.1 + 0.0018 * b.v * b.v) * dt);
      b.v = Math.min(b.v, VMAX);
    },
    animate(b, U, dt, parked) {
      b.cad ??= 0;
      b.crank ??= 0.4;
      const on = !parked && pedaling(b);
      const cadT = on ? 70 + 25 * Math.min(1, Math.abs(b.v) / VMAX) + (b.sprint ? 10 : 0) : 0;
      b.cad += (cadT - b.cad) * Math.min(1, dt * (on ? 4 : 2.5));
      const w = (b.cad / 60) * Math.PI * 2;
      b.crank += w * dt;
      U.crank.rotation.x = b.crank;
      for (const p of U.pedals) p.rotation.x = -b.crank;
      if (b.cad > 1) {
        U.cassette.rotation.x = b.spinR;
        U.chainTex.offset.x -= (w * RING_R * dt) / 0.0254;
      }
    },
    settling: (b) => b.cad > 0.5,
    rider: { build: (src) => buildTuckRider(src, RIDER), pose: poseRider },
    hud: (b, stats) => cycleComputerHud(b, stats, b.mesh.userData),
    cam: { dist: 4.6, pitch: 0.2 },
    netExtra: (b) => ({ p: pedaling(b) ? 1 : 0 }),
    throttleOf: (veh) => (veh.p ? 1 : 0),
    onRemoteVisible: prewarmRoadBikeDecals, // [memory] 다른 사람 바이크가 보이기 시작하면 데칼 미리 그리기
  });
}
