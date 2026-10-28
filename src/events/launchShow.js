// [launch] 스타베이스 발사 → 핫스테이징 → 부스터 귀환 → 젓가락 캐치 연출 (Tower 2 = OLM 탑만, Tower 1 은 정적 그대로)
// 모든 상태는 쇼 시간 t(초)의 결정적 함수(파티클 포함) → seek(t) 로 같은 장면 재현, 접속자 간 벽시계 동기.
// 시간은 크게 압축(실제 ~7분 → 81 s, 고도 수 km 이내). 실제 물리 시뮬레이션 아님.
import * as THREE from 'three';
import { BOOSTER, SHIP, PIN_HALF } from '../entities/starshipModel.js';

export const DUR = 81;
const T0 = 10, TS = 28;                 // 이륙, 핫스테이징
const OPEN = 0.32;                      // 젓가락 열림 각(rad)
const CATCH_ARM = 100;                  // 캐치 높이(팔 상부 레일)
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const sm = (u) => u * u * (3 - 2 * u);
const ramp = (t, a, b) => sm(seg(t, a, b));
const herm1 = (u, p0, v0, p1, v1, T) => { const u2 = u * u, u3 = u2 * u; return p0 * (2 * u3 - 3 * u2 + 1) + v0 * T * (u3 - 2 * u2 + u) + p1 * (-2 * u3 + 3 * u2) + v1 * T * (u3 - u2); };
const hermV = (out, u, p0, v0, p1, v1, T) => out.set(herm1(u, p0.x, v0.x, p1.x, v1.x, T), herm1(u, p0.y, v0.y, p1.y, v1.y, T), herm1(u, p0.z, v0.z, p1.z, v1.z, T));
const hr = (k, i) => { let h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const UP = new THREE.Vector3(0, 1, 0);

const PHASES = [
  [0, 'Terminal count — QD arm retracting'], [3, 'Chopsticks opening'], [7.5, 'Engine chill'], [9, 'Ignition sequence'],
  [10, 'LIFTOFF!'], [13, 'Tower cleared — gravity turn'], [21, 'Max-Q (time-compressed)'], [27.4, 'HOT STAGING'],
  [29, 'Ship continues to orbit · booster flip'], [31, 'Boostback burn'], [36, 'Booster returning — grid fins steering'],
  [50, 'Landing burn'], [55, 'Chopsticks closing'], [58, 'CATCH! 🥢'], [61, 'Booster lowered onto the launch mount'],
  [68, 'Release · carriage raising'], [73.5, 'Next ship stacked (time-lapse)'], [79, 'Ready for the next launch'],
];
const phaseAt = (t) => { let p = PHASES[0][1]; for (const [a, s] of PHASES) if (t >= a) p = s; return p; };

// ---------- 텍스처/셰이더 ----------
function puffTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const cx = 64 + (r() - 0.5) * 50, cy = 64 + (r() - 0.5) * 50, rad = 18 + r() * 26;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); const b = 215 + r() * 40;
    g.addColorStop(0, `rgba(${b},${b},${b},0.30)`); g.addColorStop(1, `rgba(${b},${b},${b},0)`); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }
  const m = x.createRadialGradient(64, 64, 20, 64, 64, 64); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = m; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,225,170,1)'); g.addColorStop(0.25, 'rgba(255,160,70,0.6)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const FLAME_VS = `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying float vF;
void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vec3 n=normalize(normalMatrix*normal); vF=abs(dot(n,normalize(-mv.xyz))); gl_Position=projectionMatrix*mv;
#include <logdepthbuf_vertex>
}`;
const FLAME_FS = `#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uInt; uniform float uTime; uniform vec3 uCore; uniform vec3 uEdge; varying vec2 vUv; varying float vF;
void main(){
#include <logdepthbuf_fragment>
  float v=vUv.y; float flick=0.82+0.18*sin(uTime*53.+v*37.+vUv.x*31.)*sin(uTime*29.+v*11.);
  float diamonds=0.85+0.15*sin(v*60.);
  float a=pow(v,1.1)*pow(vF,0.9)*uInt*flick*diamonds*1.6;
  gl_FragColor=vec4(mix(uEdge,uCore,pow(v,2.5)),clamp(a,0.,0.92));
}`;
function flameMat(core, edge) {
  return new THREE.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, // 밝은 하늘에서도 주황색이 보이도록 일반 블렌딩
    uniforms: { uInt: { value: 0 }, uTime: { value: 0 }, uCore: { value: new THREE.Color(core) }, uEdge: { value: new THREE.Color(edge) } } });
}
// 노즐 출구(y=0)에서 -Y 로 길이 1 인 원뿔 묶음
function plumeGeo(list, r0, r1) {
  const gs = list.map(([x, z]) => { const g = new THREE.CylinderGeometry(r0, r1, 1, 14, 6, true); g.translate(x, -0.5, z); return g; });
  const out = gs.length === 1 ? gs[0] : mergeSimple(gs); return out;
}
function mergeSimple(gs) {
  const pos = [], nor = [], uv = [], idx = []; let off = 0;
  for (const g of gs) { const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv; pos.push(...p.array); nor.push(...n.array); uv.push(...u.array); for (const i of g.index.array) idx.push(i + off); off += p.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
const ring = (n, r, off = 0) => Array.from({ length: n }, (_, i) => [Math.cos(off + (i * 2 * Math.PI) / n) * r, Math.sin(off + (i * 2 * Math.PI) / n) * r]);

const PUFF_VS = `#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSR; varying vec2 vUv; varying vec4 vCol;
void main(){ vUv=uv; vCol=iCol; vec4 mvPosition=modelViewMatrix*vec4(iPos,1.); float c=cos(iSR.y), s=sin(iSR.y);
  mvPosition.xy += mat2(c,s,-s,c)*position.xy*iSR.x; gl_Position=projectionMatrix*mvPosition;
#include <logdepthbuf_vertex>
#include <fog_vertex>
}`;
const PUFF_FS = `#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main(){
#include <logdepthbuf_fragment>
  vec4 t=texture2D(map,vUv); gl_FragColor=vec4(vCol.rgb*t.rgb, t.a*vCol.a*2.2);
  if(gl_FragColor.a<0.004) discard;
#include <fog_fragment>
}`;

// 결정적 빌보드 파티클 풀(인스턴싱). 이미터 = {t0,t1,rate,life,spawn(k,tb,o)} — 슬롯 k 가 바뀔 때만 spawn(캐시)
class Puffs {
  constructor(emitters, tex, additive) {
    this.em = emitters; let n = 0; for (const e of emitters) { e.N = Math.ceil(e.rate * e.life) + 1; e.base = n; n += e.N; e.ks = new Int32Array(e.N).fill(-1); e.c = new Float32Array(e.N * 20); }
    this.n = n;
    const pl = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = pl.index; g.setAttribute('position', pl.attributes.position); g.setAttribute('uv', pl.attributes.uv);
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.sr = new Float32Array(n * 2);
    for (const [k, a, s] of [['iPos', this.pos, 3], ['iCol', this.col, 4], ['iSR', this.sr, 2]]) { const at = new THREE.InstancedBufferAttribute(a, s); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, at); }
    g.instanceCount = n; this.g = g;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]); uniforms.map.value = tex;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: PUFF_FS, uniforms, transparent: true, depthWrite: false, fog: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 3 : 2;
  }
  update(t) {
    const { pos, col, sr } = this;
    for (const e of this.em) {
      let kmax = Math.floor((Math.min(t, e.t1) - e.t0) * e.rate);
      for (let j = 0; j < e.N; j++) {
        const i = e.base + j; let alive = false;
        if (kmax >= 0 && t >= e.t0) {
          const k = kmax - ((((kmax - j) % e.N) + e.N) % e.N);
          if (k >= 0) {
            const tb = e.t0 + k / e.rate, age = t - tb;
            if (age >= 0 && age < e.life) {
              const c = e.c, o = j * 20;
              if (e.ks[j] !== k) { e.ks[j] = k; e.spawn(k, tb, c, o); }
              if (c[o + 11] > 0.001) {
                alive = true;
                const tau = c[o + 14], d = tau * (1 - Math.exp(-age / tau)), u = age / e.life;
                pos[i * 3] = c[o] + c[o + 3] * d + c[o + 16] * age; pos[i * 3 + 1] = c[o + 1] + c[o + 4] * d + c[o + 15] * age * age + c[o + 17] * age; pos[i * 3 + 2] = c[o + 2] + c[o + 5] * d + c[o + 18] * age;
                sr[i * 2] = c[o + 6] + (c[o + 7] - c[o + 6]) * (1 - Math.exp(-age * 1.6 / e.life * 2)); sr[i * 2 + 1] = c[o + 12] + c[o + 13] * age;
                col[i * 4] = c[o + 8]; col[i * 4 + 1] = c[o + 9]; col[i * 4 + 2] = c[o + 10];
                col[i * 4 + 3] = c[o + 11] * Math.min(1, age / 0.25) * (1 - u) * (1 - u * 0.3);
              }
            }
          }
        }
        if (!alive) { sr[i * 2] = 0; col[i * 4 + 3] = 0; }
      }
    }
    for (const k of ['iPos', 'iCol', 'iSR']) this.g.attributes[k].needsUpdate = true;
  }
}

// ---------- 메인 ----------
export function createLaunchShow({ scene, overlay, player, camera, sun, params, tower, roadster, world }) {
  const t2 = tower.towers.find((t) => t.onOLM && t.booster && t.tower?.userData.rig);
  if (!t2) return null;
  const { booster, ship, veh, OLM_TOP } = t2, rig = t2.tower.userData.rig;
  const SHIP_ARM = rig.yT0, OLM_ARM = OLM_TOP + BOOSTER.pinY - PIN_HALF;
  const CATCH_BASE = CATCH_ARM + PIN_HALF - BOOSTER.pinY;
  const STACK_H = BOOSTER.h + BOOSTER.hsr;
  // 다운레인지 = 월드 동쪽(멕시코만) → veh 로컬
  const DR = new THREE.Vector3(Math.cos(veh.rotation.y), 0, Math.sin(veh.rotation.y));
  const base0 = new THREE.Vector3(0, OLM_TOP, 0);

  // 연출 전용 재질 복제(Tower 1 부스터와 공유하지 않도록): 링 발광/엔진 발광/우주선 페이드
  const shipMats = [], glow = { hsr: [], eng: [] };
  for (const [g, list] of [[booster, null], [ship, shipMats]]) g.traverse((m) => {
    if (!m.isMesh) return; m.material = m.material.clone(); list?.push(m.material);
  });
  booster.traverse((m) => { if (m.isMesh && m.material.side === THREE.BackSide && m.material.color?.getHexString() === '8a6a4a') glow.eng.push(m.material); });
  ship.traverse((m) => { if (m.isMesh && m.material.side === THREE.BackSide && m.material.color?.getHexString() === '8a6a4a') glow.eng.push(m.material); });
  booster.traverse((m) => { if (m.isMesh && m.geometry.parameters?.height === BOOSTER.hsr && m.geometry.parameters?.radiusTop === 4.5) glow.hsr.push(m.material); });
  for (const m of [...glow.eng, ...glow.hsr]) { m.emissive = new THREE.Color(0xff7a2a); m.emissiveIntensity = 0; }

  // 화염: 부스터(중앙3/내측10/외측20) + 코어 + 우주선 6기 + 글로우 스프라이트
  const bFl = {}, cA = ring(3, 0.95, 0.3), cB = ring(10, 2.35), cC = ring(20, 3.78, Math.PI / 20);
  const mkFl = (parent, list, r0, r1, y, core = '#fff2c4', edge = '#ff7418') => { const m = new THREE.Mesh(plumeGeo(list, r0, r1), flameMat(core, edge)); m.position.y = y; m.frustumCulled = false; m.renderOrder = 4; m.visible = false; parent.add(m); return m; };
  bFl.a = mkFl(booster, cA, 0.55, 1.4, 0.5); bFl.b = mkFl(booster, cB, 0.55, 1.4, 0.5); bFl.c = mkFl(booster, cC, 0.55, 1.4, 0.5);
  bFl.core = mkFl(booster, [[0, 0]], 3.6, 7.5, 0.5, '#fff0c8', '#ff6a20');
  const sFl = [mkFl(ship, ring(3, 1.0, Math.PI / 2), 0.6, 1.3, 0.3), mkFl(ship, ring(3, 3.0, -Math.PI / 2), 1.1, 2.2, 0.1)];
  const gTex = glowTexture();
  const mkGlow = (parent) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.renderOrder = 5; s.visible = false; parent.add(s); return s; };
  const bGlow = mkGlow(booster), sGlow = mkGlow(ship);
  const light = new THREE.PointLight('#ffb070', 0, 0, 2); veh.add(light);

  // ---------- 결정적 궤적 ----------
  const S = base0.clone().addScaledVector(UP, 1000).addScaledVector(DR, 400);
  const V1 = DR.clone().multiplyScalar(1200 / 18).addScaledVector(UP, 2000 / 18), dir1 = V1.clone().normalize();
  const B1 = S.clone().addScaledVector(UP, 220).addScaledVector(DR, 180), VB1 = DR.clone().multiplyScalar(-60).addScaledVector(UP, 15);
  const H1 = new THREE.Vector3(0, CATCH_BASE + 420, 0), VH1 = new THREE.Vector3(0, -95, 0), H2 = new THREE.Vector3(0, CATCH_BASE + 1.5, 0), ZERO = new THREE.Vector3();
  const dirBB = DR.clone().multiplyScalar(-1).addScaledVector(UP, 0.35).normalize();
  const q1 = new THREE.Quaternion().setFromUnitVectors(UP, dir1), qBB = new THREE.Quaternion().setFromUnitVectors(UP, dirBB), qI = new THREE.Quaternion();
  const shipSep = S.clone().addScaledVector(dir1, STACK_H);
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  const mkState = () => ({ bp: new THREE.Vector3(), bq: new THREE.Quaternion(), bd: new THREE.Vector3(), sp: new THREE.Vector3(), sq: new THREE.Quaternion(), sd: new THREE.Vector3(), arm: 0, open: 0, qd: 0, nA: 0, nB: 0, nC: 0, thr: 0, sThr: 0, hsr: 0, sOp: 1, plumeL: 40 });
  const armAt = (t) => t < 30 ? SHIP_ARM : t < 45 ? SHIP_ARM + (CATCH_ARM - SHIP_ARM) * ramp(t, 30, 45) : t < 61 ? CATCH_ARM : t < 68 ? CATCH_ARM + (OLM_ARM - CATCH_ARM) * ramp(t, 61, 68) : t < 70 ? OLM_ARM : OLM_ARM + (SHIP_ARM - OLM_ARM) * ramp(t, 70, 75);
  function stateAt(t, o) {
    // 부스터 위치/자세
    if (t < T0) { o.bp.copy(base0); o.bq.identity(); }
    else if (t < TS) { const u = (t - T0) / 18; o.bp.copy(base0).addScaledVector(UP, 1000 * u * u).addScaledVector(DR, 400 * u * u * u); tv.copy(UP).multiplyScalar(2000 * u).addScaledVector(DR, 1200 * u * u); if (u < 1e-4) o.bq.identity(); else o.bq.setFromUnitVectors(UP, tv.normalize()); }
    else {
      if (t < 36) hermV(o.bp, (t - TS) / 8, S, V1, B1, VB1, 8);
      else if (t < 50) hermV(o.bp, (t - 36) / 14, B1, VB1, H1, VH1, 14);
      else if (t < 56) hermV(o.bp, (t - 50) / 6, H1, VH1, H2, ZERO, 6);
      else if (t < 58) o.bp.set(0, CATCH_BASE + 1.5 * (1 - sm(seg(t, 56, 58))), 0);
      else if (t < 68) o.bp.set(0, armAt(t) + PIN_HALF - BOOSTER.pinY, 0);
      else o.bp.copy(base0); // 마운트에 내려놓음(이후 캐리지만 상승)
      if (t < 36) o.bq.copy(q1).slerp(qBB, ramp(t, 28.6, 31.4));
      else o.bq.copy(qBB).slerp(qI, ramp(t, 36.5, 45));
    }
    o.bd.copy(UP).applyQuaternion(o.bq);
    // 우주선
    if (t < TS) { o.sp.copy(o.bp).addScaledVector(o.bd, STACK_H); o.sq.copy(o.bq); }
    else if (t < 60) { const d = t - TS; o.sp.copy(shipSep).addScaledVector(dir1, 130 * d + 10 * d * d).addScaledVector(DR, 2 * d * d); tv.copy(dir1).multiplyScalar(130 + 20 * d).addScaledVector(DR, 4 * d); o.sq.setFromUnitVectors(UP, tv.normalize()); }
    else { o.sp.copy(base0).addScaledVector(UP, STACK_H); o.sq.identity(); }
    o.sd.copy(UP).applyQuaternion(o.sq);
    o.sOp = t < 36 ? 1 : t < 42 ? 1 - seg(t, 36, 42) : t < 73.5 ? 0 : seg(t, 73.5, 76.5);
    // 타워
    o.arm = armAt(t);
    o.open = t < 3 ? 0 : t < 55 ? ramp(t, 3, 7) : t < 68 ? 1 - ramp(t, 55, 57.3) : t < 76.5 ? ramp(t, 68, 70) : 1 - ramp(t, 76.5, 79);
    o.qd = t < 77 ? ramp(t, 1, 5) : 1 - ramp(t, 77, 80);
    // 엔진(스로틀 0..1, 그룹별)
    const ign = (d) => seg(t, 9 + d, 9.5 + d);
    let nA = 0, nB = 0, nC = 0;
    if (t >= 9 && t < 27.6) { nA = ign(0); nB = ign(0.25); nC = ign(0.5); }
    else if (t >= 27.6 && t < 28.2) { nA = nB = 1 - seg(t, 27.6, 28.2); }
    else if (t >= 31 && t < 36) { const k = seg(t, 31, 31.5) * (1 - seg(t, 35.5, 36)); nA = nB = k; }
    else if (t >= 50 && t < 57.8) { const k = seg(t, 50, 50.6) * (1 - seg(t, 57.4, 57.8)); nA = k; nB = k * (1 - seg(t, 53, 54)); }
    o.nA = nA; o.nB = nB; o.nC = nC; o.thr = Math.max(nA, nB, nC);
    o.sThr = t >= 27.4 && t < 42 ? seg(t, 27.4, 27.8) : 0;
    o.hsr = t < 27.4 ? 0 : t < 28.2 ? seg(t, 27.4, 28) : Math.max(0, 1 - (t - 28.2) / 10);
    const alt = o.bp.y; o.plumeL = (t > 9 && t < 12 ? 30 + 20 * seg(t, 10, 12) : 50) * (1 + Math.min(1.6, alt / 600));
    return o;
  }

  // ---------- 파티클 이미터 (veh 로컬) ----------
  const sp = mkState(), sp2 = mkState(), ivel = new THREE.Vector3();
  const setC = (c, o, ox, oy, oz, vx, vy, vz, s0, s1, r, g, b, a, rot, rs, tau, buoy, iv = null) => { c[o + 16] = iv ? iv.x : 0; c[o + 17] = iv ? iv.y : 0; c[o + 18] = iv ? iv.z : 0; c[o] = ox; c[o + 1] = oy; c[o + 2] = oz; c[o + 3] = vx; c[o + 4] = vy; c[o + 5] = vz; c[o + 6] = s0; c[o + 7] = s1; c[o + 8] = r; c[o + 9] = g; c[o + 10] = b; c[o + 11] = a; c[o + 12] = rot; c[o + 13] = rs; c[o + 14] = tau; c[o + 15] = buoy; };
  const padSteam = (t0, t1, rate, gain) => ({ t0, t1, rate, life: 7, spawn(k, tb, c, o) {
    stateAt(tb, sp); const near = clamp01(1 - (sp.bp.y - OLM_TOP) / 90); const a = sp.thr * near * gain(tb);
    const ang = hr(k, 1) * Math.PI * 2, r0 = 4 + hr(k, 2) * 8, spd = 14 + hr(k, 3) * 22, gr = 0.86 + hr(k, 4) * 0.12;
    setC(c, o, Math.cos(ang) * r0, 2 + hr(k, 5) * 6, Math.sin(ang) * r0, Math.cos(ang) * spd, 1 + hr(k, 6) * 5, Math.sin(ang) * spd, 7 + hr(k, 7) * 5, 26 + hr(k, 8) * 18, gr, gr, gr * 0.98, 0.8 * a, hr(k, 9) * 6, (hr(k, 10) - 0.5) * 0.4, 1.8, 0.35);
  } });
  const trail = (t0, t1, rate, life, gain, size) => ({ t0, t1, rate, life, spawn(k, tb, c, o) {
    stateAt(tb, sp); const L = sp.plumeL * 0.9;
    const x = sp.bp.x - sp.bd.x * L, y = sp.bp.y - sp.bd.y * L, z = sp.bp.z - sp.bd.z * L, a = sp.thr * gain;
    const j = 6; const gr = 0.8 + hr(k, 4) * 0.15;
    setC(c, o, x + (hr(k, 1) - 0.5) * j, y + (hr(k, 2) - 0.5) * j, z + (hr(k, 3) - 0.5) * j, -sp.bd.x * 12 + (hr(k, 5) - 0.5) * 6, -sp.bd.y * 12 + (hr(k, 6) - 0.5) * 6, -sp.bd.z * 12 + (hr(k, 7) - 0.5) * 6, size * 0.5, size * (1.4 + hr(k, 8)), gr, gr, gr, 0.55 * a, hr(k, 9) * 6, (hr(k, 10) - 0.5) * 0.3, 2.5, 0.2);
  } });
  const vent = (t0, t1, rate, life, fire) => ({ t0, t1, rate, life, spawn(k, tb, c, o) {
    stateAt(tb + 0.05, sp2); stateAt(tb, sp); ivel.subVectors(sp2.bp, sp.bp).multiplyScalar(20 * 0.85); // 기체 속도 상속(링에서 분출)
    const ang = hr(k, 1) * Math.PI * 2; tv2.set(Math.cos(ang), 0, Math.sin(ang)).applyQuaternion(sp.bq);
    tv.copy(sp.bp).addScaledVector(sp.bd, BOOSTER.h + BOOSTER.hsr * 0.5).addScaledVector(tv2, 4.6);
    const spd = fire ? 28 + hr(k, 2) * 20 : 18 + hr(k, 2) * 14;
    if (fire) setC(c, o, tv.x, tv.y, tv.z, tv2.x * spd, tv2.y * spd, tv2.z * spd, 2.5, 9 + hr(k, 3) * 5, 1, 0.55 + hr(k, 4) * 0.2, 0.22, 0.9, hr(k, 5) * 6, 1, 0.5, 0, ivel);
    else setC(c, o, tv.x, tv.y, tv.z, tv2.x * spd, tv2.y * spd, tv2.z * spd, 6, 30 + hr(k, 3) * 14, 0.82, 0.8, 0.78, 0.6, hr(k, 5) * 6, 0.2, 1.5, -0.4, ivel.multiplyScalar(0.6));
  } });
  const steam = (t0, t1, rate) => ({ t0, t1, rate, life: 4, spawn(k, tb, c, o) { // 캐치 후 부스터 상단 벤팅
    stateAt(tb, sp); const ang = hr(k, 1) * Math.PI * 2; const y = sp.bp.y + BOOSTER.h - 2 - hr(k, 2) * 8;
    setC(c, o, Math.cos(ang) * 4.8, y, Math.sin(ang) * 4.8, Math.cos(ang) * 3, -0.5, Math.sin(ang) * 3, 1.5, 7, 0.95, 0.95, 0.95, 0.5 * (1 - seg(tb, 60, 66)), hr(k, 3) * 6, 0.2, 2, 0.15);
  } });
  const ONE = () => 1;
  const smoke = new Puffs([
    padSteam(8.6, 20, 34, (tb) => (tb < 9 ? 0.35 : 1)),            // 점화~이륙 스팀/연기 (디류즈 + 화염 트렌치)
    trail(10.6, 27.6, 22, 6, 1, 18),                                 // 상승 배기 트레일
    vent(27.4, 29, 40, 4, false),                                    // 핫스테이징 연기
    trail(31.1, 36, 14, 5, 0.8, 16),                                 // 부스트백
    trail(50.1, 57.6, 22, 5, 0.9, 12),                               // 착륙 연소
    padSteam(54, 58.5, 26, () => 0.7),                               // 착륙 연소가 OLM 을 때림
    steam(58.2, 66, 7),
  ], puffTexture(), false);
  const fire = new Puffs([vent(27.4, 28.7, 70, 1.3, true)], gTex, true);
  veh.add(smoke.mesh, fire.mesh);

  // ---------- 적용 ----------
  const cur = mkState();
  let shipTransparent = false;
  function apply(t, time) {
    const o = stateAt(t, cur);
    booster.position.copy(o.bp); booster.quaternion.copy(o.bq);
    ship.position.copy(o.sp); ship.quaternion.copy(o.sq); ship.visible = o.sOp > 0.002;
    const tr = o.sOp < 0.999; if (tr !== shipTransparent) { shipTransparent = tr; for (const m of shipMats) { m.transparent = tr; m.needsUpdate = true; } }
    if (tr) for (const m of shipMats) m.opacity = o.sOp;
    // 타워 리그
    rig.carriage.position.y = o.arm - rig.yT0;
    const ct = rig.ct0 + (o.arm - rig.yT0); rig.cable.position.y = ct; rig.cable.scale.y = Math.max(0.1, rig.cableTop - ct);
    for (const a of rig.arms) a.pivot.rotation.y = a.s * OPEN * o.open;
    if (rig.qd) rig.qd.pivot.rotation.y = rig.qd.retractYaw * o.qd;
    // 화염/발광
    const L = o.plumeL, flick = 1 + 0.06 * Math.sin(time * 40);
    for (const [m, n, len] of [[bFl.a, o.nA, 1], [bFl.b, o.nB, 1], [bFl.c, o.nC, 1], [bFl.core, Math.max(o.nA, o.nB * 0.9, o.nC), 0.85]]) {
      m.visible = n > 0.01; m.material.uniforms.uInt.value = n * (m === bFl.core ? 0.32 : m === bFl.c ? 0.3 : m === bFl.b ? 0.38 : 0.5); m.material.uniforms.uTime.value = time;
      m.scale.set(1 + (o.bp.y / 1500), L * len * (0.4 + 0.6 * n) * flick, 1 + (o.bp.y / 1500));
    }
    for (const m of sFl) { m.visible = o.sThr > 0.01 && ship.visible; m.material.uniforms.uInt.value = o.sThr * o.sOp; m.material.uniforms.uTime.value = time; m.scale.set(1.3, 28 * flick, 1.3); }
    bGlow.visible = o.thr > 0.01; bGlow.position.y = -6; bGlow.scale.setScalar(16 * o.thr * flick); bGlow.material.opacity = 0.55 * o.thr;
    sGlow.visible = o.sThr > 0.01 && ship.visible; sGlow.position.y = -3; sGlow.scale.setScalar(14 * o.sThr); sGlow.material.opacity = 0.8 * o.sThr * o.sOp;
    for (const m of glow.eng) m.emissiveIntensity = 0; // 개별 설정 아래
    glow.eng.forEach((m) => { m.emissiveIntensity = 2.5 * o.thr; });
    for (const m of glow.hsr) m.emissiveIntensity = 1.6 * o.hsr;
    const near = clamp01(1 - (o.bp.y - OLM_TOP) / 400);
    light.intensity = 9e4 * o.thr * near * flick; light.position.copy(o.bp).addScaledVector(o.bd, -18);
    smoke.update(t); fire.update(t);
    return o;
  }

  // ---------- 시네마틱 카메라 (veh 로컬) ----------
  const cP = new THREE.Vector3(), cL = new THREE.Vector3(), pP = new THREE.Vector3(), pL = new THREE.Vector3(), bc = new THREE.Vector3();
  const SHOTS = [
    [0, (o, P, Lk) => { P.set(150, 18, 230); Lk.set(0, 72, -12); }],
    [8.5, (o, P, Lk) => { P.set(52, 7, 62); Lk.set(0, 16 + Math.max(0, o.bp.y - OLM_TOP) * 0.8, 0); }],
    [12.5, (o, P, Lk) => { P.set(170, 12, 240); Lk.copy(o.bp).addScaledVector(o.bd, 40); }],
    [18.5, (o, P, Lk) => { bc.copy(o.bp).addScaledVector(o.bd, 55); P.copy(bc).add(tv.set(-60, -70, 170)); Lk.copy(bc); }],
    [26.5, (o, P, Lk) => { bc.copy(o.bp).addScaledVector(o.bd, BOOSTER.h); P.copy(bc).add(tv.set(80, -45, 140)); Lk.copy(bc); }],
    [33, (o, P, Lk) => { bc.copy(o.bp).addScaledVector(o.bd, 35); P.copy(bc).add(tv.set(70, -35, 170)); Lk.copy(bc); }],
    [47, (o, P, Lk) => { P.set(110, 125, 150); bc.copy(o.bp).addScaledVector(o.bd, 35); Lk.copy(bc); Lk.y = Math.max(Lk.y, 95); }],
    [54.5, (o, P, Lk) => { P.set(42, 112, 40); Lk.set(0, 97, -6); }],
    [61, (o, P, Lk) => { P.set(110, 60, 140); Lk.set(0, 55, -12); }],
    [70.5, (o, P, Lk) => { P.set(150, 75, 190); Lk.set(0, 72, -12); }],
  ];
  function camAt(t, o) {
    let i = 0; while (i + 1 < SHOTS.length && t >= SHOTS[i + 1][0]) i++;
    SHOTS[i][1](o, cP, cL);
    const k = i > 0 ? sm(seg(t, SHOTS[i][0], SHOTS[i][0] + 1.4)) : 1;
    if (k < 1) { SHOTS[i - 1][1](o, pP, pL); cP.lerpVectors(pP, cP, k); cL.lerpVectors(pL, cL, k); }
    // 점화~이륙 진동
    const sh = (t > 9 && t < 16 ? o.thr * (1 - seg(t, 12, 16)) * 0.35 : 0);
    if (sh) { cP.x += Math.sin(t * 61) * sh; cP.y += Math.sin(t * 47 + 1) * sh; }
  }

  // ---------- UI ----------
  const css = document.createElement('style');
  css.textContent = `#ls-hud{position:fixed;top:56px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;font-family:system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000a;z-index:5}
#ls-hud .t{font-size:13px;letter-spacing:.08em;opacity:.85}#ls-hud .k{font-size:44px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1.1}#ls-hud .p{font-size:20px;font-weight:700}
#ls-fade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:4;transition:opacity .2s}`;
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'ls-hud'; hud.style.display = 'none';
  hud.innerHTML = `<div class="t">STARBASE LAUNCH &amp; CATCH · time-compressed</div><div class="k"></div><div class="p"></div>`;
  document.body.appendChild(hud);
  const $k = hud.querySelector('.k'), $p = hud.querySelector('.p');
  let btnBox = document.getElementById('rs-btns');
  if (!btnBox) { btnBox = document.createElement('div'); btnBox.id = 'rs-btns'; btnBox.style.cssText = 'position:fixed;right:12px;top:100px;display:flex;flex-direction:column;gap:6px;z-index:6'; document.body.appendChild(btnBox); }
  const btn = document.createElement('button'); btn.id = 'ls-start'; btn.title = 'L'; btn.style.cssText = 'font:13px system-ui;padding:6px 10px;border-radius:8px;border:0;background:#fffe;cursor:pointer;box-shadow:0 1px 4px #0003';
  btnBox.appendChild(btn);
  const vehWorld = (v, out = new THREE.Vector3()) => out.copy(v).applyMatrix4(veh.matrixWorld);
  overlay.add({ cls: 'label landmark', text: '🛰️ Launch & Catch Show', getPos: () => vehWorld(new THREE.Vector3(0, 160, 0)), maxDist: 3000, minDist: 300 });

  // ---------- 스케줄 (벽시계 동기, 로드스터 쇼와 겹치지 않게 뒤로 미룸) ----------
  const period = Math.max(120, Number(params.get('launchEvery')) || 300), OFFSET = 90;
  const autoOn = params.get('launch') !== '0';
  const RP = Math.max(60, Number(params.get('showEvery')) || 180), RD = roadster?.DUR ?? 46, rAuto = !!roadster && params.get('show') !== '0';
  const startOf = (k) => { let s = k * period + OFFSET; for (let i = 0; i < 6 && rAuto; i++) { const m = Math.floor((s + DUR + 5) / RP); let moved = false; for (let mm = m; mm >= m - 2; mm--) { const a = mm * RP, b = a + RD; if (s < b + 5 && s + DUR + 5 > a) { s = b + 5; moved = true; break; } } if (!moved) break; } return s; };
  const nowS = () => Date.now() / 1000, perf = () => performance.now() / 1000;
  const roadsterActive = () => { if (!roadster) return false; const r = roadster.state; if (r.seek != null) return true; if (r.manualStart != null && perf() - r.manualStart < RD) return true; return rAuto && nowS() % RP < RD; };
  const st = { manualStart: null, pending: false, cinematic: false, seek: null };
  const setCine = (v) => { st.cinematic = v; };
  const goView = () => { // 관람 위치(OLM 남동쪽 ~350 m 빈 땅)로 플레이어 이동
    const p = vehWorld(new THREE.Vector3(150, 0, 230));
    for (let r = 0, a = 0; world?.isBlocked?.(p.x, p.z) && r < 120; a += 0.7, r += 0.5) p.copy(vehWorld(new THREE.Vector3(150 + Math.cos(a) * r, 0, 230 + Math.sin(a) * r)));
    player.position.set(p.x, player.position.y, p.z);
  };
  const start = () => { if (roadsterActive()) { st.pending = true; return; } st.pending = false; st.manualStart = perf(); setCine(true); goView(); };
  const stop = () => {
    st.manualStart = null;
    st.seek = null;
    st.pending = false;
    setCine(false);
    hud.style.display = 'none';
  };
  btn.onclick = start;
  addEventListener('keydown', (e) => {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    if (e.code === 'KeyL') start();
    if (e.code === 'KeyV' && showTime() != null) { setCine(!st.cinematic); if (!roadsterActive()) roadster?.setCinematic(false); }
    if (e.code === 'Escape') setCine(false);
  });
  if (params.get('launch') === 'now') start();

  const autoTime = () => { const n = nowS(), k = Math.floor((n - OFFSET) / period); for (const kk of [k, k - 1]) { const s = startOf(kk); if (n >= s && n < s + DUR) return n - s; } return null; };
  const nextAuto = () => { const n = nowS(), k = Math.floor((n - OFFSET) / period); for (const kk of [k, k + 1, k + 2]) { const s = startOf(kk); if (s > n) return s - n; } return null; };
  function showTime() {
    if (st.seek != null) return st.seek;
    if (st.manualStart != null) { const t = perf() - st.manualStart; if (t < DUR) return t; st.manualStart = null; setCine(false); }
    if (autoOn) return autoTime();
    return null;
  }
  const dome = scene.children.find((c) => c.isMesh && c.geometry?.parameters?.radius === 3000);
  let wasActive = false, lastBtn = '';
  function update(dt) {
    if (st.pending && !roadsterActive()) start();
    const t = showTime(), active = t != null, time = performance.now() / 1000;
    if (active || wasActive) apply(active ? t : 0, time);
    wasActive = active;
    const label = active ? (st.cinematic ? '✖ Exit launch cam (V/Esc)' : '🎥 Launch LIVE · Cam (V)') : st.pending ? '⏳ Launch queued…' : (() => { const n = autoOn ? nextAuto() : null; return n != null ? `🛰️ Launch (L) · next ${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}` : '🛰️ Launch (L)'; })();
    if (label !== lastBtn) { btn.textContent = label; lastBtn = label; }
    btn.onclick = active ? () => setCine(!st.cinematic) : start;
    if (!active) { hud.style.display = 'none'; if (dome) dome.position.set(0, 0, 0); return; }
    const nearLaunchSite = player.position.x > 1600;
    const showHud = st.cinematic || st.manualStart != null || st.seek != null || nearLaunchSite;
    hud.style.display = showHud ? '' : 'none';
    const T = t - T0; $k.textContent = `T${T < 0 ? '−' : '+'}${String(Math.floor(Math.abs(T) / 60)).padStart(2, '0')}:${String(Math.floor(Math.abs(T) % 60)).padStart(2, '0')}`;
    $p.textContent = phaseAt(t);
    // 로드스터 시네마틱이 켜져 있으면 카메라 양보
    if (st.cinematic && roadster?.state.cinematic && roadsterActive()) setCine(false);
    if (st.cinematic) {
      veh.updateMatrixWorld(true);
      camAt(t, cur); camera.position.copy(vehWorld(cP)); camera.lookAt(vehWorld(cL, tv2));
      if (sun) sun.target.position.copy(vehWorld(tv.set(0, 0, -t2.D * 0.5)));
      if (dome) dome.position.copy(camera.position);
    } else if (dome) dome.position.set(0, 0, 0);
  }
  return { update, start, stop, setCinematic: setCine, seek: (t) => { st.seek = t; }, state: st, DUR, stateAt: (t) => stateAt(t, mkState()), startOf, period };
}
