// [night-buildings] 분당두산타워 야간 조명 (정자일로 155, OSM way 985748308, 27층·120 m, KPF+간삼 2020).
// 실제 건물은 남·북 두 타워가 꼭대기에서 4개 층 스카이브리지로 이어진 문(門) 모양 — 형상은 doosanGate.js.
// 밤 무늬는 파사드 셰이더(nightLights.js kind 5)로만 그린다 — 추가 메시·텍스처·draw call 없음. 참고 사진 기준:
//   · 두 타워: 세로 핀 사이 창 열(1.5 m) + 층별 점등(통째 켜짐/꺼짐/부분)
//   · 브리지 아래쪽(약 102–113.5 m): 어두운 루버 사이 3줄 창 띠
//   · 크라운(브리지 위쪽 약 6.5 m): 밝은 금색 가로 루버 선
//   · 브리지 밑면(틈 위 천장): 은은한 빛
// ?doosanGate=0 (원래 L자 덩어리) 이어도 같은 높이 구분으로 타워·브리지·크라운 무늬가 들어간다 (밑면만 없음).
import * as THREE from 'three';
import { GATE } from './doosanGate.js';

export const doosanUniforms = {
  uDsY: { value: new THREE.Vector4(GATE.yB, GATE.yC, 120.0, 120.0 / 27.0) }, // 브리지 밑, 크라운 시작, 꼭대기, 타워 층고
};

export const DOOSAN_GLSL = /* glsl */ `
uniform vec4 uDsY;
vec3 nlDoosan(vec3 P, vec3 N, inout vec3 dc) {
  if (uNight < 0.001) return vec3(0.0);
  float yB = uDsY.x, yC = uDsY.y, fh = uDsY.w;
  if (N.y < -0.5) {                                                       // 브리지 밑면: 은은한 빛 + 옅은 격자
    float grid = min(step(0.93, fract(P.x / 4.0)) + step(0.93, fract(P.z / 4.0)), 1.0);
    dc *= 1.0 - 0.6 * uNight;                                             // 회색 밑면 + 은은한 조명 격자(사진처럼)
    return vec3(0.95, 0.86, 0.70) * (0.11 + 0.16 * grid);
  }
  float along = abs(N.x) > 0.5 ? P.z : P.x;
  vec3 warm = vec3(1.0, 0.62, 0.26);
  dc *= 1.0 - 0.45 * uNight;                                             // 무늬가 읽히게 벽은 조금 어둡게
  if (P.y >= yC) {                                                        // 크라운: 금색 가로 루버 선
    float line = step(0.45, fract((P.y - yC) / 0.8));
    return vec3(1.0, 0.86, 0.48) * (0.22 + 0.78 * line);
  }
  if (P.y >= yB) {                                                        // 브리지: 어두운 루버 + 층마다 창 띠
    float fy = (P.y - yB) / ((yC - yB) / 3.0), f = fract(fy);
    float strip = step(0.32, f) * step(f, 0.64);
    float on = step(0.3, nlHash(vec3(floor(fy), floor(along / 6.0), 91.0)));
    return warm * strip * on * 0.9 + vec3(0.07, 0.05, 0.025) * step(0.6, fract(P.y / 0.75));
  }
  float fy = P.y / fh, fl = floor(fy), f = fract(fy);                     // 타워: 세로 창 열
  float cf = fract(along / 1.5);
  float win = step(0.22, cf) * step(cf, 0.78) * step(0.1, f) * step(f, 0.9);
  float fs = nlHash(vec3(fl, 2.0, 53.0));
  float on = fs > 0.72 ? 1.0 : fs < 0.25 ? 0.0 : step(0.5, nlHash(vec3(fl, floor(along / 10.5), 37.0)));
  if (fl < 1.0) on = 1.0;                                                 // 1층 로비
  return warm * win * on * (0.7 + 0.3 * nlHash(vec3(floor(along / 1.5), fl, 7.0)));
}
`;
