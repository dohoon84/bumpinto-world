// 한강 지형 메시(DEM·수면·호안)를 미리 구워 둔 바이너리. 런타임에 ShapeGeometry / 큰 computeVertexNormals 를 피한다.
import * as THREE from 'three';

export const HANGANG_TERRAIN_BAKE_FILE = 'hangang/s1-terrain-meshes.bin';
export const HAP_TERRAIN_BAKE_FILE = 'hangang/hap-terrain-meshes.bin';
export const HANGANG_MESH_BAKE_MAGIC = 0x48474d42; // HGMB
export const HANGANG_MESH_BAKE_VERSION = 1;

export function hangangTerrainBakeFile(osm) {
  return osm?.meta?.segment === 'hap' ? HAP_TERRAIN_BAKE_FILE : HANGANG_TERRAIN_BAKE_FILE;
}

const MESH_NAMES = new Set([
  'hangang-dem',
  'hangang-water',
  'hangang-revetment',
  'hangang-revetment-risers',
  'hangang-revetment-noses',
  'hangang-revetment-ends',
]);

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

export function encodeHangangTerrainBake(group, { revetmentView = null } = {}) {
  const meshes = collectMeshes(group).map((mesh) => {
    const geo = mesh.geometry;
    const position = attrArray(geo, 'position');
    const normal = attrArray(geo, 'normal');
    const color = attrArray(geo, 'color');
    const uv = attrArray(geo, 'uv');
    let index = null;
    if (geo.index) {
      const arr = geo.index.array;
      index = arr instanceof Uint32Array ? arr : new Uint32Array(arr);
    }
    return {
      name: mesh.name,
      receiveShadow: !!mesh.receiveShadow,
      position,
      normal,
      color,
      uv,
      index,
    };
  });
  const header = {
    version: HANGANG_MESH_BAKE_VERSION,
    revetmentView: revetmentView || null,
    meshes: meshes.map((m) => ({
      name: m.name,
      receiveShadow: m.receiveShadow,
      verts: m.position.length / 3,
      hasNormal: !!m.normal,
      hasColor: !!m.color,
      hasUv: !!m.uv,
      indexCount: m.index ? m.index.length : 0,
    })),
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const pad = (n) => (4 - (n % 4)) % 4;
  let payload = 0;
  const chunks = [];
  const add = (arr) => {
    if (!arr) return;
    const buf = arr.byteLength ? new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength) : new Uint8Array(0);
    chunks.push(buf);
    payload += buf.byteLength;
  };
  for (const m of meshes) {
    add(m.position);
    add(m.normal);
    add(m.color);
    add(m.uv);
    add(m.index);
  }
  const headerBytes = 16 + json.length + pad(json.length);
  const out = new Uint8Array(headerBytes + payload);
  const view = new DataView(out.buffer);
  view.setUint32(0, HANGANG_MESH_BAKE_MAGIC, true);
  view.setUint32(4, HANGANG_MESH_BAKE_VERSION, true);
  view.setUint32(8, json.length, true);
  view.setUint32(12, headerBytes, true);
  out.set(json, 16);
  let off = headerBytes;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export function* decodeHangangTerrainBakeGen(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== HANGANG_MESH_BAKE_MAGIC) throw new Error('hangang terrain bake: bad magic');
  const version = view.getUint32(4, true);
  if (version !== HANGANG_MESH_BAKE_VERSION) throw new Error('hangang terrain bake: unsupported version ' + version);
  const jsonLen = view.getUint32(8, true);
  const dataOff = view.getUint32(12, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(16, 16 + jsonLen)));
  let off = dataOff;
  const takeF32 = (count) => {
    const n = count * 4;
    const slice = bytes.subarray(off, off + n);
    off += n;
    const copy = new Float32Array(slice.length / 4);
    copy.set(new Float32Array(slice.buffer, slice.byteOffset, copy.length));
    return copy;
  };
  const takeU32 = (count) => {
    const n = count * 4;
    const slice = bytes.subarray(off, off + n);
    off += n;
    const copy = new Uint32Array(slice.length / 4);
    copy.set(new Uint32Array(slice.buffer, slice.byteOffset, copy.length));
    return copy;
  };
  const meshes = [];
  for (const m of header.meshes) {
    const rec = {
      name: m.name,
      receiveShadow: !!m.receiveShadow,
      position: takeF32(m.verts * 3),
    };
    if (m.hasNormal) rec.normal = takeF32(m.verts * 3);
    if (m.hasColor) rec.color = takeF32(m.verts * 3);
    if (m.hasUv) rec.uv = takeF32(m.verts * 2);
    if (m.indexCount) rec.index = takeU32(m.indexCount);
    meshes.push(rec);
    yield 'hangang-bake-decode-' + m.name;
  }
  return { revetmentView: header.revetmentView || null, meshes };
}

export function decodeHangangTerrainBake(input) {
  const g = decodeHangangTerrainBakeGen(input);
  let n = g.next();
  while (!n.done) n = g.next();
  return n.value;
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

export function applyBakedMesh(group, rec, { grassMap = null, terraceMat, riserMat, mats, waterMeshes } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(rec.position, 3));
  if (rec.normal) geo.setAttribute('normal', new THREE.BufferAttribute(rec.normal, 3));
  if (rec.color) geo.setAttribute('color', new THREE.BufferAttribute(rec.color, 3));
  if (rec.uv) geo.setAttribute('uv', new THREE.BufferAttribute(rec.uv, 2));
  if (rec.index) geo.setIndex(new THREE.BufferAttribute(rec.index, 1));
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
  const ctx = { grassMap, terraceMat, riserMat, mats, waterMeshes };
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
    const file = path.resolve(process.cwd(), 'public/corridor', hangangTerrainBakeFile(osm));
    if (!fs.existsSync(file)) return null;
    return decodeHangangTerrainBake(fs.readFileSync(file));
  } catch {
    return null;
  }
}

export function decodeHangangTerrainBakeMaybe(input) {
  if (!input) return null;
  if (input.meshes) return input;
  return null;
}
