// [ssg-facade] 신세계 본관을 감싸는 우리만의 크리스마스 미디어 파사드 (Bumpinto World 오리지널 쇼).
//   화면 = 본관 정면 + 양옆 면을 하나로 감싼 LED 면(메시 1, 절차 셰이더) · 광장 바닥 빛 번짐(메시 1). 진짜 조명 없음.
//   78 초 반복: 눈 오는 마을 → 선물 상자 행진 → 크리스마스 기차 → 자라나는 트리 → 빛 불꽃놀이 → 'Merry Christmas from Bumpinto World'.
//   시간은 실제 시계(Date.now) 기준이라 모든 플레이어가 같은 장면을 본다. 밤엔 밝게, 낮엔 은은하게.
import * as THREE from 'three';

export const SHOW = { scene: 13, scenes: 6, names: ['snow', 'gifts', 'train', 'tree', 'fireworks', 'finale'] };
SHOW.loop = SHOW.scene * SHOW.scenes;

const VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

const FS = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uW;       // 감싼 화면 전체 폭 / 높이
uniform vec2 uFront;    // 정면이 차지하는 u 범위
uniform float uScene, uLt, uNextMix, uNight, uClock;
uniform sampler2D uText;
varying vec2 vUv;
const float PI2 = 6.2831853;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
float box(vec2 p, vec2 c, vec2 hs, float aa) { vec2 d = abs(p - c) - hs; return 1.0 - smoothstep(-aa, aa, max(d.x, d.y)); }
float disc(vec2 p, vec2 c, float r, float aa) { return 1.0 - smoothstep(r - aa, r + aa, length(p - c)); }
float snow(vec2 p, float t, float sc, float sp, float sz, float seed) {
  vec2 q = p * sc; q.y += t * sp; q.x += sin(q.y * 0.6 + seed) * 0.35 + t * 0.12;
  vec2 id = floor(q), f = fract(q) - 0.5;
  float h = h2(id + seed); vec2 o = (vec2(h2(id + seed + 1.3), h2(id + seed + 7.1)) - 0.5) * 0.55;
  return step(0.45, h) * (1.0 - smoothstep(sz * 0.35, sz, length(f - o)));
}
float star5(vec2 d, float r) { float a = atan(d.y, d.x), k = 0.55 + 0.45 * cos(5.0 * a + 1.5708); return 1.0 - smoothstep(r * k * 0.92, r * k * 1.08, length(d)); }

// ---- 0 눈 오는 마을
vec3 sSnow(vec2 p, float t, float fc, float fw) {
  vec3 c = mix(vec3(0.03, 0.06, 0.2), vec3(0.16, 0.28, 0.6), p.y);
  vec2 m = vec2(fc + fw * 0.32, 0.78); float md = length(p - m);
  c += vec3(1.0, 0.95, 0.8) * (smoothstep(0.075, 0.065, md) + 0.25 * exp(-md * 9.0));
  float back = 0.36 + 0.04 * sin(p.x * 1.7 + 0.4) + 0.025 * sin(p.x * 4.3);
  if (p.y < back) c = mix(vec3(0.5, 0.6, 0.85), vec3(0.75, 0.82, 0.97), p.y / back);
  // 언덕 위 작은 집들(창에 따뜻한 불)
  float cw = 0.42, ci = floor(p.x / cw), cx = (ci + 0.5) * cw; float hb = 0.36 + 0.04 * sin(cx * 1.7 + 0.4) + 0.025 * sin(cx * 4.3);
  if (h1(ci) > 0.3) {
    float bw = 0.11 + 0.05 * h1(ci + 2.0), bh = 0.08 + 0.05 * h1(ci + 5.0);
    float body = box(p, vec2(cx, hb + bh * 0.5 - 0.01), vec2(bw, bh * 0.5), 0.003);
    float ry = p.y - (hb + bh - 0.01), roof = step(0.0, ry) * step(abs(p.x - cx), bw * 1.2 - ry * 1.5);
    c = mix(c, vec3(0.24, 0.18, 0.3), body); c = mix(c, vec3(0.92, 0.95, 1.0), roof);
    float win = box(p, vec2(cx - bw * 0.4, hb + bh * 0.45), vec2(0.022, 0.02), 0.003) + box(p, vec2(cx + bw * 0.4, hb + bh * 0.45), vec2(0.022, 0.02), 0.003);
    c = mix(c, vec3(1.0, 0.78, 0.35) * (0.85 + 0.15 * sin(t * 3.0 + ci)), clamp(win, 0.0, 1.0) * body);
  }
  float front = 0.2 + 0.035 * sin(p.x * 2.3 + 2.0) + 0.02 * sin(p.x * 6.1);
  if (p.y < front) c = mix(vec3(0.72, 0.8, 0.96), vec3(0.95, 0.97, 1.0), p.y / front);
  c += vec3(0.95) * snow(p, t, 9.0, 0.9, 0.22, 1.0) + vec3(0.8) * snow(p, t, 16.0, 1.4, 0.2, 5.0) * 0.8 + vec3(0.7) * snow(p, t, 28.0, 2.2, 0.22, 9.0) * 0.6;
  return c;
}
// ---- 1 선물 상자 행진
vec3 sGifts(vec2 p, float t) {
  vec3 c = mix(vec3(0.42, 0.02, 0.07), vec3(0.78, 0.1, 0.14), p.y);
  c *= 0.9 + 0.1 * step(0.5, fract((p.x + p.y) * 6.0));
  float fl = 0.17; if (p.y < fl) c = mix(vec3(0.55, 0.36, 0.08), vec3(0.98, 0.78, 0.3), p.y / fl);
  float cw = 0.6, qx = p.x - t * 0.38, id = floor(qx / cw), fx = (fract(qx / cw) - 0.5) * cw;
  float w = 0.13 + 0.07 * h1(id), hh = 0.12 + 0.14 * h1(id + 3.0), b = abs(sin(t * 3.4 + id * 1.7)) * 0.05;
  vec2 bc = vec2(0.0, fl + b + hh); vec2 q = vec2(fx, p.y);
  float bx = box(q, bc, vec2(w, hh), 0.003);
  float k = mod(id, 4.0);
  vec3 col = k < 1.0 ? vec3(0.1, 0.55, 0.3) : k < 2.0 ? vec3(0.98, 0.82, 0.3) : k < 3.0 ? vec3(0.96, 0.96, 0.92) : vec3(0.15, 0.35, 0.8);
  vec3 rib = k < 1.0 ? vec3(0.95, 0.15, 0.2) : k < 2.0 ? vec3(0.85, 0.1, 0.15) : k < 3.0 ? vec3(0.85, 0.12, 0.18) : vec3(0.98, 0.85, 0.4);
  float r = max(box(q, bc, vec2(0.018, hh), 0.002), box(q, bc + vec2(0.0, hh * 0.2), vec2(w, 0.016), 0.002));
  c = mix(c, mix(col, rib, r), bx);
  float bow = max(disc(q, bc + vec2(-0.035, hh + 0.03), 0.032, 0.003), disc(q, bc + vec2(0.035, hh + 0.03), 0.032, 0.003));
  c = mix(c, rib, bow);
  c = mix(c, vec3(0.08, 0.04, 0.02), 0.35 * (1.0 - smoothstep(0.0, 0.04, abs(p.y - fl + 0.01))) * step(abs(fx), w * 1.1));
  // 색종이
  float cf = snow(p, t, 14.0, 0.7, 0.2, 3.0); c = mix(c, hsv(h2(floor(p * 14.0 + vec2(0.0, t * 0.7))), 0.6, 1.0), cf);
  return c;
}
// ---- 2 크리스마스 기차
vec3 sTrain(vec2 p, float t) {
  vec3 c = mix(vec3(0.02, 0.03, 0.12), vec3(0.14, 0.12, 0.34), p.y);
  vec2 sq = floor(p * 40.0); float st = step(0.985, h2(sq)) * (0.5 + 0.5 * sin(uClock * 3.0 + h2(sq + 1.0) * 30.0));
  c += vec3(0.9) * st * step(0.45, p.y);
  // 소나무 실루엣 (천천히 흐름)
  float tw = 0.22, tx = p.x + t * 0.05, ti = floor(tx / tw), tf = (fract(tx / tw) - 0.5) * tw, th = 0.18 + 0.16 * h1(ti);
  float tree = step(0.16, p.y) * step(abs(tf), (0.16 + th - p.y) * 0.32);
  c = mix(c, vec3(0.04, 0.16, 0.16), tree);
  float gnd = 0.16; if (p.y < gnd) c = mix(vec3(0.6, 0.68, 0.9), vec3(0.88, 0.92, 1.0), p.y / gnd);
  c = mix(c, vec3(0.25, 0.2, 0.22), 1.0 - smoothstep(0.004, 0.008, abs(p.y - 0.168)));
  float hx = -1.2 + (t / 13.0) * (uW + 4.6);
  float x = hx - p.x; // 기관차 머리에서 뒤로
  vec3 red = vec3(0.82, 0.08, 0.1), grn = vec3(0.06, 0.45, 0.25), gold = vec3(1.0, 0.8, 0.32);
  if (x > 0.0 && x < 0.55) {
    float body = box(vec2(x, p.y), vec2(0.22, 0.27), vec2(0.2, 0.08), 0.003);
    float cab = box(vec2(x, p.y), vec2(0.45, 0.31), vec2(0.1, 0.12), 0.003);
    float chim = box(vec2(x, p.y), vec2(0.1, 0.39), vec2(0.03, 0.05), 0.003);
    c = mix(c, red, max(body, cab)); c = mix(c, vec3(0.12), chim);
    c = mix(c, gold, box(vec2(x, p.y), vec2(0.22, 0.27), vec2(0.2, 0.008), 0.002) * body);
    c = mix(c, vec3(1.0, 0.85, 0.45), box(vec2(x, p.y), vec2(0.45, 0.35), vec2(0.05, 0.035), 0.003));
    c += vec3(1.0, 0.9, 0.6) * exp(-length(vec2(x - 0.01, p.y - 0.27)) * 18.0) * 0.9;
  }
  float cx = x - 0.6, ci = floor(cx / 0.55), cf = cx - ci * 0.55;
  if (cx > 0.0 && ci < 5.0) {
    float car = box(vec2(cf, p.y), vec2(0.25, 0.28), vec2(0.23, 0.095), 0.003);
    c = mix(c, mod(ci, 2.0) < 1.0 ? grn : red, car);
    float wi = box(vec2(fract(cf / 0.115) * 0.115, p.y), vec2(0.057, 0.3), vec2(0.032, 0.035), 0.003) * step(0.04, cf) * step(cf, 0.46);
    c = mix(c, vec3(1.0, 0.82, 0.4), wi * car);
    float lights = step(abs(p.y - 0.385), 0.006) * step(0.5, fract(cf * 30.0 + uClock * 2.0)) * step(cf, 0.48);
    c = mix(c, hsv(fract(cf * 3.0 + ci * 0.3), 0.5, 1.0), lights);
  }
  // 바퀴
  float wx = x > 0.0 && x < 3.4 ? fract(x / 0.14) * 0.14 : 1.0; c = mix(c, vec3(0.1), disc(vec2(wx, p.y), vec2(0.07, 0.19), 0.03, 0.003));
  // 연기
  for (int i = 0; i < 6; i++) { float fi = float(i), sx = hx - 0.1 - fi * 0.13, sy = 0.46 + fi * 0.045 + 0.01 * sin(uClock * 2.0 + fi); c = mix(c, vec3(0.92, 0.94, 1.0), disc(p, vec2(sx, sy), 0.035 + fi * 0.014, 0.01) * (0.75 - fi * 0.11)); }
  c += vec3(0.85) * snow(p, t, 12.0, 1.0, 0.2, 2.0) * 0.7;
  return c;
}
// ---- 3 자라나는 트리
vec3 sTree(vec2 p, float t, float fc) {
  vec2 d = p - vec2(fc, 0.45);
  vec3 c = mix(vec3(0.02, 0.07, 0.1), vec3(0.04, 0.16, 0.2), p.y) + vec3(0.25, 0.22, 0.08) * exp(-length(d) * 2.4) * smoothstep(0.0, 6.0, t);
  float g = smoothstep(0.0, 7.0, t) * (1.0 + 0.04 * sin(t * 2.0) * step(7.0, t)), H = 0.78 * g, base = 0.1;
  float y = (p.y - base) / max(H, 1e-3), ax = abs(p.x - fc);
  float wTier = (1.0 - fract(y * 3.2)) * 0.07;
  float hw = ((1.0 - y) * 0.36 + wTier) * H;
  float inT = step(0.0, y) * step(y, 1.0) * step(ax, hw);
  vec3 grn = mix(vec3(0.03, 0.3, 0.14), vec3(0.12, 0.55, 0.25), y);
  c = mix(c, grn * (0.8 + 0.2 * fract(y * 3.2)), inT);
  float gar = 1.0 - smoothstep(0.006, 0.014, abs(fract(y * 5.0 + (p.x - fc) / max(H, 1e-3) * 1.4 - t * 0.3) - 0.5) * 0.12);
  c = mix(c, vec3(1.0, 0.85, 0.4) * (0.8 + 0.2 * sin(t * 4.0 + y * 20.0)), gar * inT * 0.85);
  vec2 cell = floor(p * 26.0); vec2 cp = (cell + 0.5) / 26.0; float ho = h2(cell);
  float cy = (cp.y - base) / max(H, 1e-3), inC = step(0.03, cy) * step(cy, 0.95) * step(abs(cp.x - fc), ((1.0 - cy) * 0.36) * H * 0.9);
  float orn = step(0.55, ho) * disc(p, cp, 0.011, 0.002) * inC;
  c = mix(c, hsv(ho * 3.0, 0.75, 0.6 + 0.4 * sin(uClock * 3.0 + ho * 40.0)), orn);
  c = mix(c, vec3(0.35, 0.2, 0.08), box(p, vec2(fc, base - 0.03), vec2(0.03, 0.03), 0.002));
  float sOn = smoothstep(6.5, 7.5, t); vec2 sp = p - vec2(fc, base + H + 0.035);
  float ra = atan(sp.y, sp.x) + t * 0.4, rays = pow(max(0.0, cos(ra * 8.0)), 16.0) * exp(-length(sp) * 7.0);
  c = mix(c, vec3(1.0, 0.9, 0.45), star5(sp, 0.07) * sOn); c += vec3(1.0, 0.85, 0.4) * (rays * 0.6 + exp(-length(sp) * 14.0) * 0.7) * sOn;
  c += vec3(1.0, 0.86, 0.5) * snow(p, t, 18.0, 0.5, 0.16, 4.0) * 0.6 * (1.0 - inT);
  return c;
}
// ---- 4 빛 불꽃놀이
vec3 sFire(vec2 p, float t, float fc) {
  vec3 c = mix(vec3(0.01, 0.01, 0.05), vec3(0.06, 0.04, 0.14), p.y);
  float sk = floor(p.x / 0.09), skH = 0.06 + 0.1 * h1(sk); if (p.y < skH) c = vec3(0.02, 0.02, 0.05) + vec3(1.0, 0.8, 0.4) * step(0.85, h2(floor(p * vec2(60.0, 80.0)))) * 0.5;
  for (int i = 0; i < 8; i++) {
    float fi = float(i), tb = t - fi * 1.4; if (tb < 0.0 || tb > 2.8) continue;
    vec2 ce = vec2(fc + (h1(fi + 11.0) - 0.5) * uW * 0.8, 0.55 + 0.3 * h1(fi + 3.0));
    vec3 col = hsv(h1(fi + 21.0), 0.55, 1.0);
    if (tb < 0.55) { float k = tb / 0.55; c += col * disc(p, vec2(ce.x, mix(0.05, ce.y, k)), 0.012, 0.006) * 1.2; continue; }
    float e = tb - 0.55, r = (0.34 + 0.1 * h1(fi + 31.0)) * (1.0 - exp(-e * 2.6)), fade = pow(max(0.0, 1.0 - e / 2.25), 1.5);
    vec2 dd = p - ce + vec2(0.0, 0.05 * e * e);
    float a = atan(dd.y, dd.x), N = 26.0, k = floor(a / PI2 * N + 0.5), ak = k / N * PI2;
    float rk = r * (0.82 + 0.18 * h1(k + fi * 7.0));
    vec2 pp = vec2(cos(ak), sin(ak)) * rk;
    float dot1 = 1.0 - smoothstep(0.006, 0.024, length(dd - pp));
    float L = length(dd), tr = (1.0 - smoothstep(0.0025, 0.006, abs(L * sin(a - ak)))) * smoothstep(rk * 0.3, rk, L) * step(L, rk) * 0.9;
    float tw = 0.7 + 0.3 * sin(uClock * 20.0 + k);
    c += col * (dot1 * 2.2 + tr) * fade * tw + col * exp(-length(dd) * 6.0) * 0.35 * fade + col * 0.12 * fade * step(e, 0.35);
  }
  return c;
}
// ---- 5 마지막 인사
vec3 sFinale(vec2 p, float t, float fc, float fw) {
  vec3 c = mix(vec3(0.26, 0.01, 0.05), vec3(0.5, 0.04, 0.1), p.y);
  vec2 cell = floor(p * 7.0 + vec2(0.0, t * 0.15)); vec2 cp = (cell + 0.5 + (vec2(h2(cell), h2(cell + 3.0)) - 0.5) * 0.6) / 7.0 - vec2(0.0, t * 0.15 / 7.0);
  c += vec3(1.0, 0.75, 0.35) * disc(p, cp, 0.03 + 0.03 * h2(cell + 9.0), 0.02) * 0.35 * step(0.5, h2(cell + 5.0));
  c += vec3(1.0, 0.9, 0.7) * snow(p, t, 20.0, 0.6, 0.16, 6.0) * 0.7;
  float tw = fw * 0.9, th = min(tw / 4.0, 0.62); tw = th * 4.0;
  vec2 tuv = vec2((p.x - (fc - tw * 0.5)) / tw, (p.y - (0.52 - th * 0.5)) / th);
  if (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) {
    vec4 tx = texture2D(uText, tuv);
    float rev = smoothstep(0.0, 1.8, t - tuv.x * 1.2); // 왼쪽부터 써지듯
    c = mix(c, tx.rgb, tx.a * rev);
  }
  return c;
}
vec3 scene(float id, vec2 p, float t, float fc, float fw) {
  if (id < 0.5) return sSnow(p, t, fc, fw);
  if (id < 1.5) return sGifts(p, t);
  if (id < 2.5) return sTrain(p, t);
  if (id < 3.5) return sTree(p, t, fc);
  if (id < 4.5) return sFire(p, t, fc);
  return sFinale(p, t, fc, fw);
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vec2(vUv.x * uW, vUv.y);
  float fc = (uFront.x + uFront.y) * 0.5 * uW, fw = (uFront.y - uFront.x) * uW;
  vec3 c = scene(uScene, p, uLt, fc, fw);
  if (uNextMix > 0.0) c = mix(c, scene(mod(uScene + 1.0, ${SHOW.scenes}.0), p, uLt - ${SHOW.scene}.0, fc, fw), uNextMix);
  // 철골 틀(세로·가로 멀리언) — 화면을 칸으로 나누는 짙은 선
  vec2 g = vec2(p.x / 0.26, p.y / 0.25); vec2 fg = abs(fract(g) - 0.5); vec2 w = fwidth(g) * 1.2;
  float mull = max(1.0 - smoothstep(0.0, 0.007 + w.x, 0.5 - fg.x), 1.0 - smoothstep(0.0, 0.006 + w.y, 0.5 - fg.y));
  c *= 1.0 - 0.26 * mull; // 철골 칸 선은 은은하게
  float edge = smoothstep(0.0, 0.012, vUv.y) * smoothstep(1.0, 0.988, vUv.y); c *= edge;
  float b = mix(0.6, 1.0, uNight);
  gl_FragColor = vec4(c * b + (1.0 - uNight) * vec3(0.035), 1.0);
}`;

const SP_VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const SP_FS = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 uCol; uniform float uK;
varying vec2 vUv; // x: 정면 가로 0..1, y: 화면에서 멀어지는 거리 0..1
void main() {
  #include <logdepthbuf_fragment>
  float a = pow(1.0 - vUv.y, 2.2) * smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  gl_FragColor = vec4(uCol * a * uK, 1.0);
}`;

// 장면별 바닥 빛 색 (화면 평균색에 가깝게)
const SPILL = [[0.35, 0.5, 1.0], [1.0, 0.28, 0.25], [0.55, 0.45, 0.85], [0.45, 0.9, 0.45], [0.8, 0.6, 1.0], [1.0, 0.55, 0.3]];

function textTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(255,200,120,.9)'; g.shadowBlur = 18;
  g.fillStyle = '#fff8ec'; g.font = 'italic 700 118px Georgia,"Times New Roman",serif'; g.fillText('Merry Christmas', 512, 136);
  g.shadowBlur = 10; g.fillStyle = '#ffd36e'; g.font = '700 50px Pretendard,"Noto Sans KR",system-ui,sans-serif'; g.fillText('from  Bumpinto World', 512, 214);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  t.userData.textRects = [[0, 0, 1, 1]];
  return t;
}

/** sec → { scene, lt, mix } */
export function showClock(sec) {
  const s = ((sec % SHOW.loop) + SHOW.loop) % SHOW.loop, i = Math.floor(s / SHOW.scene), lt = s - i * SHOW.scene;
  return { scene: i, lt, mix: Math.max(0, Math.min(1, (lt - (SHOW.scene - 1)) / 1)), name: SHOW.names[i] };
}

/**
 * @param {{ parent: THREE.Object3D, faces: {path:number[][], y0:number, y1:number, front:{p:number[],q:number[],nx:number,nz:number,L:number}}[], heightAt:(x:number,z:number)=>number }} o
 *   path = 화면 바닥선(밖에서 볼 때 왼→오, 이미 벽에서 띄운 점들). 모서리는 둥근 꺾은선 → 하나의 곡면 · u 는 호 길이로 이어진다
 */
export function createShinsegaeShow({ parent, faces, heightAt }) {
  const group = new THREE.Group(); group.name = 'md-ssg-show'; parent.add(group);
  const F = faces[0], path = F.path, fe = F.front, rx = fe.nz, rz = -fe.nx; // 정면을 바라볼 때 오른쪽
  const H = F.y1 - F.y0;
  const acc = [0]; for (let k = 1; k < path.length; k++) acc.push(acc[k - 1] + Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]));
  const totalW = acc[acc.length - 1];
  // 정면 변의 호 길이 범위: 정면 변 양 끝에 가장 가까운 점
  const near = (pt) => { let bi = 0, bd = Infinity; path.forEach((q, k) => { const d = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (d < bd) { bd = d; bi = k; } }); return acc[bi]; };
  const s0 = near(fe.p), s1 = near(fe.q), uF = [Math.min(s0, s1) / totalW, Math.max(s0, s1) / totalW];
  const pos = [], uv = [], idx = [];
  for (let k = 0; k < path.length; k++) {
    const u = acc[k] / totalW;
    pos.push(path[k][0], F.y0, path[k][1], path[k][0], F.y1, path[k][1]); uv.push(u, 0, u, 1);
    if (k) { const b = (k - 1) * 2; idx.push(b, b + 2, b + 3, b, b + 3, b + 1); } // 밖에서 보면 반시계(앞면): 왼아래→오아래→오위
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  geo.computeBoundingSphere();
  const tex = textTexture();
  const uniforms = { uW: { value: totalW / H }, uFront: { value: new THREE.Vector2(uF[0], uF[1]) }, uScene: { value: 0 }, uLt: { value: 0 }, uNextMix: { value: 0 }, uNight: { value: 0 }, uClock: { value: 0 }, uText: { value: tex } };
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms, toneMapped: false, fog: false });
  mat.name = 'ssg-show'; mat.map = tex; // 글씨 거울 검사(auditTextMeshes)가 볼 수 있게 — 셰이더는 uText 를 쓴다
  const screen = new THREE.Mesh(geo, mat); screen.name = 'md-ssg-screen'; screen.renderOrder = 1; group.add(screen);

  // 광장 바닥 빛 번짐: 정면 앞 부채꼴 띠(바닥 높이를 따라 깐 격자)
  const SPD = 26, NX = 16, NZ = 14;
  const sp = [], su = [], si = [];
  const wide = 1.25, cxF = (fe.p[0] + fe.q[0]) / 2 + fe.nx * 0.35, czF = (fe.p[1] + fe.q[1]) / 2 + fe.nz * 0.35, half = fe.L * wide / 2;
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const a = i / NX, d = j / NZ, sx = (a - 0.5) * 2 * half * (1 + d * 0.35), dd = 1.0 + d * SPD;
    const x = cxF + rx * sx + fe.nx * dd, z = czF + rz * sx + fe.nz * dd;
    sp.push(x, heightAt(x, z) + 0.32, z); su.push(a, d);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; si.push(a, c, b, b, c, d); }
  const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sgeo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); sgeo.setIndex(si); sgeo.computeBoundingSphere();
  const su2 = { uCol: { value: new THREE.Color(1, 1, 1) }, uK: { value: 0 } };
  const smat = new THREE.ShaderMaterial({ vertexShader: SP_VS, fragmentShader: SP_FS, uniforms: su2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  smat.name = 'ssg-spill';
  const spill = new THREE.Mesh(sgeo, smat); spill.name = 'md-ssg-spill'; spill.renderOrder = 2; group.add(spill);

  let night = 0, nightT = 0;
  const cA = new THREE.Color(), cB = new THREE.Color();
  let clockOverride = null;
  return {
    group, screen, spill,
    info: { width: +totalW.toFixed(1), height: +H.toFixed(1), area: Math.round(totalW * H), segments: path.length - 1 },
    setNight(v) { nightT = v > 0.5 ? 1 : 0; },
    /** 테스트·스크린샷: 쇼 시각 고정 (초, null = 실제 시계) */
    setClock(sec) { clockOverride = sec; },
    get clock() { return showClock(clockOverride ?? Date.now() / 1000); },
    update(dt = 0) {
      night += (nightT - night) * Math.min(1, dt * 1.5);
      if (!group.visible) return;
      const sec = clockOverride ?? Date.now() / 1000;
      const k = showClock(sec);
      uniforms.uScene.value = k.scene; uniforms.uLt.value = k.lt; uniforms.uNextMix.value = k.mix; uniforms.uNight.value = night; uniforms.uClock.value = (sec % 600);
      cA.setRGB(...SPILL[k.scene]); cB.setRGB(...SPILL[(k.scene + 1) % SHOW.scenes]); cA.lerp(cB, k.mix);
      const flick = k.scene === 4 ? 0.65 + 0.35 * Math.abs(Math.sin(k.lt * 2.3)) : 1;
      su2.uCol.value.copy(cA); su2.uK.value = (0.08 + night * 0.62) * flick;
    },
    dispose() { parent.remove(group); geo.dispose(); mat.dispose(); tex.dispose(); sgeo.dispose(); smat.dispose(); },
  };
}
