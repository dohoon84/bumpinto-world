// [superbike] 선물함 '슈퍼바이크 RR' — 1000cc 4기통 레플리카 슈퍼스포츠. 주인만 꺼내기/탑승, 타거나 세워 두면 다른 사람에게 보임.
//   veh id 904(카탈로그) · ?superbike=0 끔 · W 270 km/h, Shift 303 km/h(실차 최고속, 트럭 250/280 과 같은 1.12 배)
//   꺼내기/탑승/주행(서브스텝)/중계는 giftRide 공통 틀, 여기는 모델·가감속·숙인 자세·속도계·엔진음.
import * as THREE from 'three';
import { createGiftRide } from '../giftRide/giftRide.js';
import { buildTuckRider, poseTuckRider } from '../giftRide/riderRig.js';
import { createBikeAudio } from '../adminCruiser/bikeAudio.js';
import { createSuperbikeModel, createMotoHelmetHead, SB } from './superbikeModel.js';
import { gearOf, rideGain, rideMix, rideRate } from './engineNote.js';
import { giftItem } from '../../gifts/catalog.js';

/** 선물함 카탈로그 항목 (수량·단위·veh id 는 src/gifts/catalog.js 만 고친다) */
export const SUPERBIKE_GIFT = giftItem('superbike-rr');
const KMH = 1 / 3.6;
/** 가감속 (m/s, m/s²). 0→100 km/h: Shift 3.2 s(실차 3.21 s), W 3.9 s */
export const SB_DRIVE = {
  vmax: 270 * KMH,
  vboost: 303 * KMH,
  acc: 7.5,
  accBoost: 9.0,
  brake: 10.5, // ≈1.07 g
  rev: 3 * KMH, // 뒤로는 발로 미는 정도
};

/** b.v 만 바꾼다. 공기저항·엔진브레이크는 놓았을 때만 (스로틀 중엔 가속 곡선이 이미 최고속에서 0) */
export function superbikeThrottle(b, dt, f, sprint) {
  const D = SB_DRIVE;
  if (f > 0) {
    if (b.v < -0.05) b.v += 6 * f * dt;
    else {
      const V = sprint ? D.vboost : D.vmax;
      b.v += (sprint ? D.accBoost : D.acc) * Math.max(-1, 1 - (Math.max(0, b.v) / V) ** 2) * f * dt;
    }
  } else if (f < 0) b.v += (b.v > 0.15 ? -D.brake : -1.0) * -f * dt;
  else b.v -= Math.sign(b.v) * Math.min(Math.abs(b.v), (0.6 + 0.0006 * b.v * b.v) * dt);
  b.v = Math.min(b.v, D.vboost);
}

const RIDER = {
  hip: new THREE.Vector3(0, 0.95, -0.36),
  torso: 1.05,
  upperScale: [0.7, 0.8, 0.6],
  headScale: 0.78,
  headPitch: -0.45,
  helmet: createMotoHelmetHead,
  shoe: '#1c1d20',
  glove: '#1c1d20',
  foot: [0.09, 0.07, 0.24],
  leg: [0.085, 0.068],
  arm: [0.058, 0.05],
};
const PEG = { x: 0.19, y: 0.43, z: -0.27 };

function poseRider(rider, bike) {
  const U = bike.userData;
  poseTuckRider(rider, {
    frame: U.lean,
    grips: U.grips,
    foot: (sx, out) => out.set(sx * PEG.x, PEG.y, PEG.z + 0.06), // 발 앞꿈치를 리어셋 스텝에
    legLen: [0.5, 0.48],
    armLen: [0.32, 0.31],
    knee: (sx) => new THREE.Vector3(sx * 0.55, 0.35, 1), // 무릎은 앞으로, 탱크를 감싸게 약간 바깥으로
    elbow: (sx) => new THREE.Vector3(sx * 0.8, -0.45, -0.35),
    footPitch: 0.25,
  });
}

let hudCss = false;
function speedoHud(b) {
  if (!hudCss) {
    hudCss = true;
    const css = document.createElement('style');
    css.textContent = `.sb-hud{position:fixed;right:12px;bottom:calc(var(--minimap-top,226px) + 10px);display:none;width:170px;color:#fff;font-family:system-ui,sans-serif;z-index:6;pointer-events:none;background:rgba(14,16,20,.88);border-radius:14px;padding:8px 12px;box-shadow:0 3px 14px #0007;border:1px solid rgba(255,255,255,.14)}
.sb-hud .v{font:900 44px/1 system-ui;text-align:right;letter-spacing:-1px}.sb-hud .u{font:700 11px system-ui;opacity:.8;text-align:right}
.sb-hud .bar{height:5px;background:#2b2f36;border-radius:3px;margin:5px 0 4px;overflow:hidden}.sb-hud .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#2f8fd8,#1d2d6b 60%,#d8262f)}
.sb-hud .k{display:flex;justify-content:space-between;font:700 11px system-ui;opacity:.92}.sb-hud .g{font:900 16px system-ui;color:#7cc4ff}`;
    document.head.appendChild(css);
  }
  const hud = document.createElement('div');
  hud.className = 'sb-hud';
  hud.innerHTML = '<div class="v">0</div><div class="u">km/h</div><div class="bar"><i></i></div><div class="k"><span>GEAR <b class="g">N</b></span><span>RR</span></div>';
  document.body.appendChild(hud);
  const H = { v: hud.querySelector('.v'), bar: hud.querySelector('.bar i'), g: hud.querySelector('.g') };
  let t = 0;
  return {
    show() { hud.style.display = 'block'; },
    hide() { hud.style.display = 'none'; },
    frame(dt, { riding }) {
      if (!riding || (t -= dt) > 0) return;
      t = 0.08;
      const av = Math.abs(b.v);
      const { gear, rev } = gearOf(av);
      H.v.textContent = Math.round(av * 3.6);
      H.g.textContent = av < 0.3 ? 'N' : String(gear);
      H.bar.style.width = `${Math.round(rev * 100)}%`;
    },
  };
}

export function createSuperbike({ params, camera, ...env }) {
  if (params.get('superbike') === '0') return null;
  return createGiftRide(env, {
    vehId: SUPERBIKE_GIFT.vehId,
    icon: '🏍️',
    name: 'Superbike RR',
    labelY: 1.5,
    model: createSuperbikeModel,
    dims: { WB: SB.WB, R: SB.RR, RF: SB.RF, HL: SB.LEN / 2, HW: 0.3 },
    drive: {
      revV: SB_DRIVE.rev, rMin: 3.0, latG: 1.0, yawMin: 0.5, yawK: 4, steerIn: 3.0,
      leanMax: 0.85, steerMax: 0.5, parkSteer: -0.35, parkLean: -0.085,
    },
    throttle: superbikeThrottle,
    rider: { build: (src) => buildTuckRider(src, RIDER), pose: poseRider },
    hud: speedoHud,
    audio: (mesh) => createBikeAudio({
      camera, anchor: mesh.userData.lean, params, volume: 0.8,
      files: { idle: 'superbike/idle', ride: 'superbike/ride', start: 'superbike/start', launch: 'superbike/launch' },
      formats: ['ogg', 'm4a'],
      curves: { mix: rideMix, rideRate, rideGain, idleRate: (av, th) => 1 + 0.12 * Math.min(1, th + av / 3) },
    }),
    cam: { dist: 5.2, pitch: 0.18 },
    netExtra: (b) => ({ th: +b.throttle.toFixed(2) }),
    throttleOf: (veh) => Math.max(0, Math.min(1, +veh.th || 0)),
  });
}
