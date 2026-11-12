// atlas.json easing. 좌표와 시간의 원본은 아틀라스.
export const EASE = {
  linear: (x) => x,
  step: () => 1,
  inQuad: (x) => x * x,
  outCubic: (x) => 1 - (1 - x) ** 3,
  outBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; },
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outSine: (x) => Math.sin((Math.PI * x) / 2),
  inSine: (x) => 1 - Math.cos((Math.PI * x) / 2),
};

export function easeAt(name, x) {
  const fn = EASE[name] || EASE.linear;
  if (x <= 0) return fn === EASE.step ? 0 : 0;
  if (x >= 1) return 1;
  return fn(x);
}

export function lerpNum(a, b, t) { return a + (b - a) * t; }
export function lerpPair(a, b, t) {
  if (!Array.isArray(a) && !Array.isArray(b)) return lerpNum(Number(a) || 0, Number(b) || 0, t);
  const ax = Array.isArray(a) ? a[0] : Number(a) || 0;
  const ay = Array.isArray(a) ? a[1] : Number(a) || 0;
  const bx = Array.isArray(b) ? b[0] : Number(b) || 0;
  const by = Array.isArray(b) ? b[1] : Number(b) || 0;
  return [lerpNum(ax, bx, t), lerpNum(ay, by, t)];
}
