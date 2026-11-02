// [night-buildings] 분당두산타워 야간 조명 (정자일로 155, OSM way 985748308, 27층·120 m, KPF+간삼 2020).
// 실제 건물은 남·북 두 타워가 꼭대기에서 4개 층 스카이브리지로 이어진 문(門) 모양이다. 데이터 형상은 L자 덩어리 하나라
// 낮 모습은 그대로 두고, 밤에만 파사드 셰이더(nightLights.js kind 5)로 아래를 그린다 — 추가 메시·텍스처·draw call 없음.
//   · 두 타워: 세로 핀 사이 창 열(1.5 m) + 층별 점등(통째 켜짐/꺼짐/부분)
//   · 브리지(약 101–114 m): 전체가 밝은 금색, 가는 가로 루버 선
//   · 크라운(꼭대기 약 5.5 m): 밝은 가로 조명 선
//   · 브리지 아래 빈 공간(서쪽 블록 가운데): 밤엔 벽 대신 밤하늘 색, 브리지 하부 쪽으로 은은한 빛, 바닥은 로비 빛
// 빈 공간 위치는 층 면적(타워 약 1,500 m² ×2, 브리지 약 4,000 m²)으로 추정한 근사치다.
import * as THREE from 'three';

export const DOOSAN_NAME = '분당두산타워';
export const isDoosan = (b) => b?.n === DOOSAN_NAME;

// jeongja.json 외곽선 x -286.2..-225.8, z 202.5..317.7 (서쪽 블록 x ≤ -252 가 남북 115 m 로 길다)
export const doosanUniforms = {
  uDsVoid: { value: new THREE.Vector4(-287.5, -251.0, 246.5, 273.7) }, // 브리지 아래 비는 곳 x0,x1,z0,z1 (서쪽 블록 가운데 27 m)
  uDsY: { value: new THREE.Vector4(101.0, 114.5, 120.0, 120.0 / 27.0) }, // 브리지 밑, 크라운 시작, 꼭대기, 층고
};

export const DOOSAN_GLSL = /* glsl */ `
uniform vec4 uDsVoid, uDsY;
vec3 nlDoosan(vec3 P, vec3 N, inout vec3 dc) {
  if (uNight < 0.001) return vec3(0.0);
  float along = abs(N.x) > 0.5 ? P.z : P.x;
  vec3 warm = vec3(1.0, 0.62, 0.26);
  float yB = uDsY.x, yC = uDsY.y, fh = uDsY.w;
  if (P.x > uDsVoid.x && P.x < uDsVoid.y && P.z > uDsVoid.z && P.z < uDsVoid.w && P.y < yB) {
    dc *= 1.0 - 0.95 * uNight;                                           // 비어 있는 문 자리: 벽 대신 밤하늘 빛
    float s = smoothstep(yB - 14.0, yB, P.y);
    float lobby = (1.0 - smoothstep(5.0, 6.5, P.y)) * (0.55 + 0.45 * step(0.25, fract(along / 3.0)));
    return mix(vec3(0.011, 0.02, 0.055), warm * 0.8, s * s) + warm * 0.5 * lobby;
  }
  dc *= 1.0 - 0.45 * uNight;                                             // 무늬가 읽히게 벽은 조금 어둡게
  if (P.y >= yC) {                                                        // 크라운: 촘촘한 가로 조명 선
    float line = step(0.5, fract((P.y - yC) / 0.9));
    return mix(vec3(0.55, 0.36, 0.16), vec3(1.0, 0.86, 0.55), line);
  }
  if (P.y >= yB) {                                                        // 브리지: 층 띠 + 루버
    float fy = (P.y - yB) / fh;
    float on = 0.7 + 0.3 * step(0.15, nlHash(vec3(floor(fy), floor(along / 8.0), 91.0)));
    float louvre = step(0.4, fract(P.y / 0.7));
    return vec3(1.0, 0.66, 0.28) * on * (0.22 + 0.78 * louvre);
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
