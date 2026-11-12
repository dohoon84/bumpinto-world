// 한강 지형 메시(DEM·수면·호안)를 양자화·gzip 으로 구워 둔다.
// 위치는 메시 bbox 기준 Int16, 법선은 올리지 않고 로드 때 다시 계산, 인덱스는 델타 varint.
// DEM UV 는 (x - origin) / 28 로 복원하므로 파일에 넣지 않는다.
import * as THREE from 'three';

export const HANGANG_TERRAIN_BAKE_FILE = 'hangang/s1-terrain-meshes.bin.gz';
export const HAP_TERRAIN_BAKE_FILE = 'hangang/hap-terrain-meshes.bin.gz';
export const HANGANG_MESH_BAKE_MAGIC = 0x48474d42; // HGMB
export const HANGANG_MESH_BAKE_VERSION = 2;
export const HANGANG_DEM_UV_SCALE = 28;
const I16 = 32767;
const MAX_U16_VERTS = 65535;
const SMALL_F32_VERTS = 4000;

const MESH_NAMES = new Set([
  'hangang-dem',
  'hangang-water',
  'hangang-revetment',
  'hangang-revetment-risers',
  'hangang-revetment-noses',
  'hangang-revetment-ends',
]);

export function hangangTerrainBakeFile(osm) {
  return osm?.meta?.segment === 'hap' ? HAP_TERRAIN_BAKE_FILE : HANGANG_TERRAIN_BAKE_FILE;
}

function collectMeshes(group) {
  const list = [];
  group.traverse((o) => {
    if (o.isMesh && MESH_NAMES.has(o.name) && o.geometry?.attributes?.position) list.push(o);
  });
  return list;
}

function attrArray(geo, name) {
  const a = geo.attributes[name];
  if (!a) return null;
  const src = a.array;
  return src instanceof Float32Array ? src : new Float32Array(src);
}

function asBytes(arr) {
  if (!arr) return null;
  return arr.byteLength ? new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength) : new Uint8Array(0);
}

function zigzagEncode(n) {
  return ((n << 1) ^ (n >> 31)) >>> 0;
}
function zigzagDecode(u) {
  return (u >>> 1) ^ -(u & 1);
}
function writeUvarint(bytes, n) {
  n = n >>> 0;
  while (n >= 0x80) {
    bytes.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  bytes.push(n);
}
function readUvarint(bytes, i) {
  let n = 0, shift = 0;
  for (;;) {
    const b = bytes[i++];
    n |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [n >>> 0, i];
    shift += 7;
    if (shift > 35) throw new Error('hangang terrain bake: bad varint');
  }
}

export function encodeDeltaIndices(index) {
  const bytes = [];
  let prev = 0;
  for (let i = 0; i < index.length; i++) {
    writeUvarint(bytes, zigzagEncode(index[i] - prev));
    prev = index[i];
  }
  return Uint8Array.from(bytes);
}

export function decodeDeltaIndices(bytes, count, typ = 'u16') {
  const out = typ === 'u32' ? new Uint32Array(count) : new Uint16Array(count);
  let i = 0, prev = 0;
  for (let k = 0; k < count; k++) {
    const [u, ni] = readUvarint(bytes, i);
    i = ni;
    prev = prev + zigzagDecode(u);
    out[k] = prev;
  }
  if (i !== bytes.length && i !== bytes.byteLength) {
    // trailing pad is ok
  }
  return out;
}

function componentBounds(arr, dim) {
  const min = new Array(dim).fill(Infinity);
  const max = new Array(dim).fill(-Infinity);
  for (let i = 0; i < arr.length; i += dim) {
    for (let k = 0; k < dim; k++) {
      const v = arr[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

function quantizeI16(arr, dim) {
  const { min, max } = componentBounds(arr, dim);
  const q = new Int16Array(arr.length);
  const scale = min.map((mn, k) => {
    const span = max[k] - mn;
    return span === 0 ? 1 : span / I16;
  });
  for (let i = 0; i < arr.length; i += dim) {
    for (let k = 0; k < dim; k++) {
      let t = Math.round((arr[i + k] - min[k]) / scale[k]);
      if (t < 0) t = 0;
      if (t > I16) t = I16;
      q[i + k] = t;
    }
  }
  return { q, min, max };
}

function dequantizeI16(q, min, max, dim) {
  const out = new Float32Array(q.length);
  const scale = min.map((mn, k) => {
    const span = max[k] - mn;
    return span === 0 ? 1 : span / I16;
  });
  for (let i = 0; i < q.length; i += dim) {
    for (let k = 0; k < dim; k++) out[i + k] = min[k] + q[i + k] * scale[k];
  }
  return out;
}

function colorsToU8(arr) {
  const q = new Uint8Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    q[i] = Math.round(Math.min(1, Math.max(0, v)) * 255);
  }
  return q;
}
function colorsFromU8(q) {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] / 255;
  return out;
}

function splitForU16(pos, color, index, maxVerts = MAX_U16_VERTS) {
  if (!index) return [{ pos, color, index: null }];
  if (pos.length / 3 <= maxVerts) return [{ pos, color, index }];
  const out = [];
  let map = new Map(), cPos = [], cCol = color ? [] : null, cIdx = [];
  const flush = () => {
    if (!cIdx.length) return;
    out.push({
      pos: new Float32Array(cPos),
      color: cCol ? new Float32Array(cCol) : null,
      index: cIdx,
    });
    map = new Map();
    cPos = [];
    cCol = color ? [] : null;
    cIdx = [];
  };
  const vertCount = () => cPos.length / 3;
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    let need = 0;
    for (const v of tri) if (!map.has(v)) need++;
    if (vertCount() + need > maxVerts) flush();
    for (const v of tri) {
      let nv = map.get(v);
      if (nv == null) {
        nv = vertCount();
        map.set(v, nv);
        cPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        if (cCol) cCol.push(color[v * 3], color[v * 3 + 1], color[v * 3 + 2]);
      }
      cIdx.push(nv);
    }
  }
  flush();
  return out;
}

export function encodeHangangTerrainBake(group, { revetmentView = null, uvOrigin = null, uvScale = HANGANG_DEM_UV_SCALE } = {}) {
  const collected = collectMeshes(group);
  const headerMeshes = [];
  const chunks = [];
  const add = (arr) => {
    const buf = arr instanceof Uint8Array ? arr : asBytes(arr);
    if (!buf) return;
    chunks.push(buf);
  };
  for (const mesh of collected) {
    const geo = mesh.geometry;
    const position = attrArray(geo, 'position');
    const color = attrArray(geo, 'color');
    let index = null;
    if (geo.index) {
      const arr = geo.index.array;
      index = Array.from(arr, (v) => v);
    }
    const pieces = splitForU16(position, color, index);
    for (const p of pieces) {
      const verts = p.pos.length / 3;
      const posCodec = verts >= SMALL_F32_VERTS ? 'i16' : 'f32';
      let posMin = null, posMax = null;
      if (posCodec === 'i16') {
        const q = quantizeI16(p.pos, 3);
        posMin = q.min;
        posMax = q.max;
        add(q.q);
      } else {
        add(p.pos instanceof Float32Array ? p.pos : new Float32Array(p.pos));
      }
      const hasColor = !!p.color;
      if (hasColor) add(colorsToU8(p.color));
      const indexBytes = p.index ? encodeDeltaIndices(p.index) : new Uint8Array(0);
      add(indexBytes);
      headerMeshes.push({
        name: mesh.name,
        receiveShadow: !!mesh.receiveShadow,
        verts,
        indexCount: p.index ? p.index.length : 0,
        indexBytes: indexBytes.byteLength,
        indexType: verts <= MAX_U16_VERTS ? 'u16' : 'u32',
        posCodec,
        posMin,
        posMax,
        hasColor,
      });
    }
  }
  const header = {
    version: HANGANG_MESH_BAKE_VERSION,
    revetmentView: revetmentView || null,
    uvOrigin: uvOrigin || null,
    uvScale: uvScale || HANGANG_DEM_UV_SCALE,
    meshes: headerMeshes,
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const pad = (4 - (json.length % 4)) % 4;
  const dataOff = 16 + json.length + pad;
  let payload = 0;
  for (const c of chunks) payload += c.byteLength;
  const out = new Uint8Array(dataOff + payload);
  const view = new DataView(out.buffer);
  view.setUint32(0, HANGANG_MESH_BAKE_MAGIC, true);
  view.setUint32(4, HANGANG_MESH_BAKE_VERSION, true);
  view.setUint32(8, json.length, true);
  view.setUint32(12, dataOff, true);
  out.set(json, 16);
  let off = dataOff;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function isGzip(bytes) {
  return bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export function gunzipSync(input) {
  const bytes = toU8(input);
  if (!isGzip(bytes)) return bytes;
  if (typeof process !== 'undefined' && process.getBuiltinModule) {
    const zlib = process.getBuiltinModule('zlib');
    const out = zlib.gunzipSync(bytes);
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  }
  throw new Error('hangang terrain bake: sync gunzip needs zlib');
}

export async function gunzipAsync(input) {
  const bytes = toU8(input);
  if (!isGzip(bytes)) return bytes;
  if (typeof DecompressionStream === 'function') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return gunzipSync(bytes);
}

function toU8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input?.buffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new Error('hangang terrain bake: expected bytes');
}

export function* decodeHangangTerrainBakeGen(input) {
  let bytes = toU8(input);
  if (isGzip(bytes)) bytes = gunzipSync(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== HANGANG_MESH_BAKE_MAGIC) throw new Error('hangang terrain bake: bad magic');
  const version = view.getUint32(4, true);
  if (version !== 1 && version !== 2) throw new Error('hangang terrain bake: unsupported version ' + version);
  const jsonLen = view.getUint32(8, true);
  const dataOff = view.getUint32(12, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(16, 16 + jsonLen)));
  let off = dataOff;
  const copyTyped = (slice, Ctor, bytesPer) => {
    const n = slice.byteLength / bytesPer;
    if (slice.byteOffset % bytesPer === 0) {
      const copy = new Ctor(n);
      copy.set(new Ctor(slice.buffer, slice.byteOffset, n));
      return copy;
    }
    const tmp = new Uint8Array(slice.byteLength);
    tmp.set(slice);
    return new Ctor(tmp.buffer);
  };
  const take = (n, typ) => {
    const slice = bytes.subarray(off, off + n);
    off += n;
    if (typ === 'u8') {
      const c = new Uint8Array(n);
      c.set(slice);
      return c;
    }
    if (typ === 'i16') return copyTyped(slice, Int16Array, 2);
    if (typ === 'u16') return copyTyped(slice, Uint16Array, 2);
    if (typ === 'u32') return copyTyped(slice, Uint32Array, 4);
    return copyTyped(slice, Float32Array, 4);
  };

  if (version === 1) {
    const takeF32 = (count) => take(count * 4, 'f32');
    const takeU32 = (count) => take(count * 4, 'u32');
    const meshes = [];
    for (const m of header.meshes) {
      const rec = {
        name: m.name,
        receiveShadow: !!m.receiveShadow,
        position: takeF32(m.verts * 3),
      };
      if (m.hasNormal) takeF32(m.verts * 3); // skip, recompute
      if (m.hasColor) rec.color = takeF32(m.verts * 3);
      if (m.hasUv) rec.uv = takeF32(m.verts * 2);
      if (m.indexCount) rec.index = takeU32(m.indexCount);
      meshes.push(rec);
      yield 'hangang-bake-decode-' + m.name;
    }
    return { revetmentView: header.revetmentView || null, uvOrigin: header.uvOrigin || null, uvScale: header.uvScale || HANGANG_DEM_UV_SCALE, meshes };
  }

  const meshes = [];
  for (const m of header.meshes) {
    let position;
    if (m.posCodec === 'i16') {
      const q = take(m.verts * 3 * 2, 'i16');
      position = dequantizeI16(q, m.posMin, m.posMax, 3);
    } else {
      position = take(m.verts * 3 * 4, 'f32');
    }
    let color = null;
    if (m.hasColor) color = colorsFromU8(take(m.verts * 3, 'u8'));
    let index = null;
    if (m.indexCount) {
      const raw = take(m.indexBytes, 'u8');
      index = decodeDeltaIndices(raw, m.indexCount, m.indexType || 'u16');
    }
    meshes.push({
      name: m.name,
      receiveShadow: !!m.receiveShadow,
      position,
      color,
      index,
    });
    yield 'hangang-bake-decode-' + m.name;
  }
  return {
    revetmentView: header.revetmentView || null,
    uvOrigin: header.uvOrigin || null,
    uvScale: header.uvScale || HANGANG_DEM_UV_SCALE,
    meshes,
  };
}

export function decodeHangangTerrainBake(input) {
  const g = decodeHangangTerrainBakeGen(input);
  let n = g.next();
  while (!n.done) n = g.next();
  return enrichBakeMeshes(n.value);
}

export async function decodeHangangTerrainBakeBytes(input) {
  const unzipped = await gunzipAsync(input);
  return decodeHangangTerrainBake(unzipped);
}

function demUvFromPositions(position, origin, scale) {
  if (!origin || !position) return null;
  const n = position.length / 3;
  const uv = new Float32Array(n * 2);
  const s = scale || HANGANG_DEM_UV_SCALE;
  for (let i = 0; i < n; i++) {
    uv[i * 2] = (position[i * 3] - origin[0]) / s;
    uv[i * 2 + 1] = (position[i * 3 + 2] - origin[1]) / s;
  }
  return uv;
}

export async function fetchHangangTerrainBake(url, fetchFn = fetch) {
  if (!url || typeof fetchFn !== 'function') return null;
  try {
    const r = await fetchFn(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function fetchAndDecodeHangangTerrainBake(url, fetchFn = fetch) {
  try {
    if (url && typeof Worker === 'function') {
      const bake = await decodeInWorker({ url });
      if (bake) return bake;
    }
    const bytes = await fetchHangangTerrainBake(url, fetchFn);
    if (!bytes) return null;
    if (typeof Worker === 'function') {
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const bake = await decodeInWorker({ buffer: copy, transfer: [copy] });
      if (bake) return bake;
    }
    return await decodeHangangTerrainBakeBytes(bytes);
  } catch (e) {
    console.warn('[hangang] terrain bake decode failed:', e?.message || e);
    return null;
  }
}

function decodeInWorker(msg) {
  return new Promise((resolve) => {
    let worker;
    const fail = () => resolve(null);
    try {
      worker = new Worker(new URL('./hangangMeshBakeWorker.js', import.meta.url), { type: 'module' });
    } catch {
      fail();
      return;
    }
    const t = setTimeout(() => { try { worker.terminate(); } catch {} fail(); }, 60000);
    worker.onmessage = (e) => {
      clearTimeout(t);
      try { worker.terminate(); } catch {}
      if (e.data?.ok && e.data.bake?.meshes) resolve(e.data.bake);
      else fail();
    };
    worker.onerror = () => { clearTimeout(t); try { worker.terminate(); } catch {} fail(); };
    const xfer = msg.transfer || (msg.buffer ? [msg.buffer] : []);
    const payload = { url: msg.url, buffer: msg.buffer };
    worker.postMessage(payload, xfer);
  });
}

function waterMat() {
  return new THREE.MeshPhongMaterial({
    color: '#1c5c6e',
    transparent: true,
    opacity: 0.90,
    shininess: 44,
    specular: '#4e8a96',
    side: THREE.DoubleSide,
    emissive: '#000000',
  });
}

export function materialForBakedMesh(name, { grassMap = null, terraceMat, riserMat } = {}) {
  if (name === 'hangang-dem') {
    return new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: grassMap,
      side: THREE.FrontSide,
    });
  }
  if (name === 'hangang-water') return waterMat();
  if (name === 'hangang-revetment') return terraceMat || new THREE.MeshLambertMaterial({ color: '#9a9b95', side: THREE.DoubleSide });
  return riserMat || new THREE.MeshLambertMaterial({ color: '#4e4f49', side: THREE.DoubleSide });
}


/** 워커(메인 스레드 밖)에서 법선·바운딩 스피어를 미리 계산한다. apply 때는 붙이기만 한다. */
export function computeNormalsAndBounds(position, index) {
  const nVert = (position?.length || 0) / 3;
  const normal = new Float32Array(Math.max(0, nVert * 3));
  if (nVert > 0) {
    const triCount = index ? (index.length / 3) : (nVert / 3);
    for (let t = 0; t < triCount; t++) {
      const ia = index ? index[t * 3] : t * 3;
      const ib = index ? index[t * 3 + 1] : t * 3 + 1;
      const ic = index ? index[t * 3 + 2] : t * 3 + 2;
      const ax = position[ia * 3], ay = position[ia * 3 + 1], az = position[ia * 3 + 2];
      const bx = position[ib * 3], by = position[ib * 3 + 1], bz = position[ib * 3 + 2];
      const cx = position[ic * 3], cy = position[ic * 3 + 1], cz = position[ic * 3 + 2];
      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      normal[ia * 3] += nx; normal[ia * 3 + 1] += ny; normal[ia * 3 + 2] += nz;
      normal[ib * 3] += nx; normal[ib * 3 + 1] += ny; normal[ib * 3 + 2] += nz;
      normal[ic * 3] += nx; normal[ic * 3 + 1] += ny; normal[ic * 3 + 2] += nz;
    }
    for (let i = 0; i < nVert; i++) {
      const o = i * 3;
      const x = normal[o], y = normal[o + 1], z = normal[o + 2];
      const len = Math.hypot(x, y, z);
      if (len > 1e-12) { normal[o] = x / len; normal[o + 1] = y / len; normal[o + 2] = z / len; }
      else { normal[o] = 0; normal[o + 1] = 1; normal[o + 2] = 0; }
    }
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < nVert; i++) {
    const x = position[i * 3], y = position[i * 3 + 1], z = position[i * 3 + 2];
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  if (!nVert) return { normal, boundingSphere: { cx: 0, cy: 0, cz: 0, r: 0 } };
  const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5, cz = (minZ + maxZ) * 0.5;
  let r2 = 0;
  for (let i = 0; i < nVert; i++) {
    const dx = position[i * 3] - cx, dy = position[i * 3 + 1] - cy, dz = position[i * 3 + 2] - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r2) r2 = d2;
  }
  return { normal, boundingSphere: { cx, cy, cz, r: Math.sqrt(r2) } };
}

export function enrichBakeMeshes(bake) {
  if (!bake?.meshes) return bake;
  for (const m of bake.meshes) {
    if (!m.position) continue;
    if (m.normal && m.boundingSphere) continue;
    const e = computeNormalsAndBounds(m.position, m.index);
    if (!m.normal) m.normal = e.normal;
    if (!m.boundingSphere) m.boundingSphere = e.boundingSphere;
  }
  return bake;
}

export function applyBakedMesh(group, rec, { grassMap = null, terraceMat, riserMat, mats, waterMeshes, uvOrigin = null, uvScale = HANGANG_DEM_UV_SCALE } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(rec.position, 3));
  if (rec.color) geo.setAttribute('color', new THREE.BufferAttribute(rec.color, 3));
  let uv = rec.uv;
  if (!uv && rec.name === 'hangang-dem') uv = demUvFromPositions(rec.position, uvOrigin, uvScale);
  if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (rec.index) geo.setIndex(new THREE.BufferAttribute(rec.index, 1));
  if (rec.normal) geo.setAttribute('normal', new THREE.BufferAttribute(rec.normal, 3));
  else geo.computeVertexNormals();
  if (rec.boundingSphere) {
    const s = rec.boundingSphere;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(s.cx, s.cy, s.cz), s.r);
  } else geo.computeBoundingSphere();
  let mat;
  if (rec.name === 'hangang-revetment') mat = terraceMat;
  else if (rec.name.startsWith('hangang-revetment')) mat = riserMat;
  else mat = materialForBakedMesh(rec.name, { grassMap, terraceMat, riserMat });
  if (mats && !mats.includes(mat)) mats.push(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = rec.name;
  mesh.receiveShadow = !!rec.receiveShadow;
  group.add(mesh);
  if (rec.name === 'hangang-water' && waterMeshes) waterMeshes.push(mesh);
  return mesh;
}

export function* applyHangangTerrainBakeGen(group, bake, { grassMap = null } = {}) {
  const terraceMat = new THREE.MeshLambertMaterial({ color: '#9a9b95', side: THREE.DoubleSide });
  const riserMat = new THREE.MeshLambertMaterial({ color: '#4e4f49', side: THREE.DoubleSide });
  const mats = [];
  const waterMeshes = [];
  const ctx = { grassMap, terraceMat, riserMat, mats, waterMeshes, uvOrigin: bake.uvOrigin || null, uvScale: bake.uvScale || HANGANG_DEM_UV_SCALE };
  for (const rec of bake.meshes) {
    applyBakedMesh(group, rec, ctx);
    yield 'hangang-bake-apply-' + rec.name;
  }
  return { mats, waterMeshes, terraceMat, riserMat, revetmentView: bake.revetmentView || null };
}

export function applyHangangTerrainBake(group, bake, opts) {
  const g = applyHangangTerrainBakeGen(group, bake, opts);
  let n = g.next();
  while (!n.done) n = g.next();
  return n.value;
}

export function loadHangangTerrainBakeSync(osm) {
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    const fs = process.getBuiltinModule('fs');
    const path = process.getBuiltinModule('path');
    const base = path.resolve(process.cwd(), 'public/corridor', hangangTerrainBakeFile(osm));
    const candidates = [base];
    if (base.endsWith('.gz')) candidates.push(base.slice(0, -3));
    else candidates.push(base + '.gz');
    for (const file of candidates) {
      if (!fs.existsSync(file)) continue;
      return decodeHangangTerrainBake(gunzipSync(fs.readFileSync(file)));
    }
    return null;
  } catch {
    return null;
  }
}

export function decodeHangangTerrainBakeMaybe(input) {
  if (!input) return null;
  if (input.meshes) return input;
  return null;
}
