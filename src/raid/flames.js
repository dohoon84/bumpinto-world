// Layered flipbook fires. One draw for flames, one for smoke, one for embers.
import * as THREE from 'three';

const TP = '/assets/vfx/thirdparty';

const VERT = `
attribute vec3 iPos;
attribute vec4 iData;
attribute vec3 iColor;
attribute float iFrame;
varying vec2 vUv;
varying vec3 vColor;
varying float vFade;
varying float vY;
uniform float uCols;
uniform float uRows;
uniform float uFps;
void main() {
  float size = iData.x;
  float rot = iData.y;
  float age = iData.z;
  float life = max(iData.w, 0.001);
  float k = clamp(age / life, 0.0, 1.0);
  vFade = smoothstep(0.0, 0.15, k) * (1.0 - smoothstep(0.7, 1.0, k));
  vec2 q = position.xy;
  float c = cos(rot);
  float s = sin(rot);
  vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y) * size;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = iPos + right * r.x + up * r.y;
  float cells = uCols * uRows;
  float cell = mod(iFrame + age * uFps, cells);
  float col = mod(floor(cell), uCols);
  float row = floor(cell / uCols);
  vec2 cellSize = vec2(1.0 / uCols, 1.0 / uRows);
  vec2 inset = cellSize * 0.08;
  vUv = vec2(col, uRows - row - 1.0) * cellSize + inset + uv * (cellSize - inset * 2.0);
  vColor = iColor;
  vY = world.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAG = `
varying vec2 vUv;
varying vec3 vColor;
varying float vFade;
varying float vY;
uniform sampler2D uMap;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  float ground = smoothstep(0.0, 0.5, vY);
  float a = tex.a * vFade * ground;
  if (a < 0.03) discard;
  gl_FragColor = vec4(vColor * tex.rgb * a, a);
}
`;

function loadMap(url) {
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function makePool(scene, map, cols, rows, fps, count) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const pos = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  const color = new Float32Array(count * 3);
  const frame = new Float32Array(count);
  geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
  geo.setAttribute('iData', new THREE.InstancedBufferAttribute(data, 4));
  geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(color, 3));
  geo.setAttribute('iFrame', new THREE.InstancedBufferAttribute(frame, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uCols: { value: cols },
      uRows: { value: rows },
      uFps: { value: fps },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    toneMapped: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.count = count;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  scene.add(mesh);
  const slots = [];
  for (let i = 0; i < count; i++) slots.push({ alive: false });
  return { mesh, pos, data, color, frame, slots, cursor: 0 };
}

function spawn(pool, x, y, z, size, life, tint, rise) {
  const i = pool.cursor;
  pool.cursor = (pool.cursor + 1) % pool.slots.length;
  const slot = pool.slots[i];
  slot.alive = true;
  slot.rise = rise;
  slot.drift = (Math.random() - 0.5) * 0.35;
  pool.pos[i * 3] = x;
  pool.pos[i * 3 + 1] = y;
  pool.pos[i * 3 + 2] = z;
  pool.data[i * 4] = size;
  pool.data[i * 4 + 1] = Math.random() * Math.PI * 2;
  pool.data[i * 4 + 2] = 0;
  pool.data[i * 4 + 3] = life;
  const c = new THREE.Color(tint);
  pool.color[i * 3] = c.r;
  pool.color[i * 3 + 1] = c.g;
  pool.color[i * 3 + 2] = c.b;
  pool.frame[i] = Math.random() * 64;
}

function tickPool(pool, dt) {
  for (let i = 0; i < pool.slots.length; i++) {
    const slot = pool.slots[i];
    if (!slot.alive) {
      pool.data[i * 4] = 0;
      continue;
    }
    pool.data[i * 4 + 2] += dt;
    pool.pos[i * 3 + 1] += slot.rise * dt;
    pool.pos[i * 3] += slot.drift * dt;
    if (pool.data[i * 4 + 2] >= pool.data[i * 4 + 3]) slot.alive = false;
  }
  pool.mesh.geometry.getAttribute('iPos').needsUpdate = true;
  pool.mesh.geometry.getAttribute('iData').needsUpdate = true;
  pool.mesh.geometry.getAttribute('iColor').needsUpdate = true;
  pool.mesh.geometry.getAttribute('iFrame').needsUpdate = true;
}

export function createFlames(scene) {
  const flame = makePool(scene, loadMap(`${TP}/unity/smallflame01.webp?v=fl`), 16, 4, 14, 56);
  const smoke = makePool(scene, loadMap(`${TP}/unity/wispysmoke01.webp?v=fl`), 8, 8, 8, 36);
  const emberGeo = new THREE.BufferGeometry();
  const emberPos = new Float32Array(40 * 3);
  emberPos.fill(-80);
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberMap = loadMap(`${TP}/kenney/circle_05.webp?v=fl`);
  const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({
    map: emberMap,
    color: '#ff9a55',
    size: 11,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    alphaTest: 0.25,
  }));
  embers.frustumCulled = false;
  scene.add(embers);
  const emberSlots = Array.from({ length: 40 }, () => ({ alive: false, vy: 0 }));
  let emberCursor = 0;

  const anchors = [];
  const lights = [];

  function addAnchors(list) {
    for (const a of list || []) {
      anchors.push({
        x: a.x, y: a.y, z: a.z,
        size: a.size || 2.4,
        tint: a.tint || '#e07038',
        cool: 0,
      });
      if (lights.length < 4 && a.light !== false) {
        const light = new THREE.PointLight('#ff8a4a', 5, 8, 2);
        light.position.set(a.x, a.y + 0.6, a.z);
        scene.add(light);
        lights.push(light);
      }
    }
  }

  function burst(x, y, z, opts = {}) {
    const span = opts.span || 3;
    const tint = opts.tint || '#ff8a3a';
    const smokeTint = opts.smoke || '#6a564c';
    const n = Math.max(6, Math.round(span));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * span * 0.42;
      spawn(flame, x + Math.cos(a) * r, y + Math.random() * span * 0.28, z + Math.sin(a) * r, span * (0.22 + Math.random() * 0.16), 0.45 + Math.random() * 0.35, tint, 0.8);
    }
    for (let i = 0; i < 4; i++) {
      spawn(smoke, x + (Math.random() - 0.5) * span * 0.4, y + 0.2, z + (Math.random() - 0.5) * span * 0.4, span * 0.38, 0.9, smokeTint, 1.1);
    }
  }

  function update(dt) {
    for (const a of anchors) {
      a.cool -= dt;
      if (a.cool <= 0) {
        a.cool = 0.14 + Math.random() * 0.1;
        const jx = (Math.random() - 0.5) * a.size * 0.45;
        const jz = (Math.random() - 0.5) * a.size * 0.45;
        spawn(flame, a.x + jx, a.y + Math.random() * a.size * 0.2, a.z + jz, a.size * (0.38 + Math.random() * 0.22), 0.6 + Math.random() * 0.4, a.tint, 0.4 + Math.random() * 0.45);
        if (Math.random() < 0.45) {
          spawn(smoke, a.x + jx * 0.4, a.y + a.size * 0.45, a.z + jz * 0.4, a.size * 0.55, 1.3, '#6a564c', 0.65);
        }
        if (Math.random() < 0.55) {
          const s = emberSlots[emberCursor];
          emberCursor = (emberCursor + 1) % emberSlots.length;
          s.alive = true;
          s.vy = 1.2 + Math.random();
          s.life = 0.8;
          s.age = 0;
          const o = emberCursor * 3;
          emberPos[o] = a.x + jx;
          emberPos[o + 1] = a.y;
          emberPos[o + 2] = a.z + jz;
        }
      }
    }
    tickPool(flame, dt);
    tickPool(smoke, dt);
    for (let i = 0; i < emberSlots.length; i++) {
      const s = emberSlots[i];
      const o = i * 3;
      if (!s.alive) {
        emberPos[o + 1] = -40;
        continue;
      }
      s.age += dt;
      emberPos[o + 1] += s.vy * dt;
      if (s.age > s.life) s.alive = false;
    }
    emberGeo.attributes.position.needsUpdate = true;
    const flick = 0.75 + Math.sin(performance.now() * 0.017) * 0.25;
    lights.forEach((light, i) => {
      light.intensity = 3.5 + flick * 3 + Math.sin(performance.now() * 0.02 + i) * 1.2;
    });
  }

  return { addAnchors, burst, update, anchors };
}
