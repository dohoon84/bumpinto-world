// node 테스트용 최소 DOM 흉내: 모듈 최상단에서 캔버스 텍스처를 만드는 코드(vehicleLights 등)가 import 시 죽지 않게 한다.
const noop = () => {};
const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4) }) : noop), set: () => true });
const el = () => ({ getContext: () => ctx, width: 0, height: 0, style: {}, classList: { add: noop, remove: noop, toggle: noop }, appendChild: noop, addEventListener: noop, setAttribute: noop });
globalThis.document ??= { createElement: el, body: { appendChild: noop, classList: { contains: () => false } }, getElementById: () => null, addEventListener: noop, hidden: false };
globalThis.window ??= { addEventListener: noop, location: { search: '' }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.performance ??= { now: () => Date.now() };
