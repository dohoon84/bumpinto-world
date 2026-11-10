import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gangnamStreetEnabled, STREET_DECAL_Y } from '../../../src/gangnam/streetDetail.js';
import { segmentCoveredByWiderRoad } from '../../../src/corridor/tileMesh.js';
import { carSegs, onCarriageway } from '../../../src/gangnam/avenues.js';
import { POLES } from '../../../src/gangnam/billboards/clearance.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let n = 0;
const ok = (m) => console.log(`ok ${++n} ${m}`);

{
  assert.equal(gangnamStreetEnabled(''), true);
  assert.equal(gangnamStreetEnabled('?gstreet=0'), false);
  assert.equal(gangnamStreetEnabled('?gangnam=0'), false);
  ok('flags gstreet / gangnam');
}

{
  assert.ok(STREET_DECAL_Y.zebra > STREET_DECAL_Y.paint, `zebra ${STREET_DECAL_Y.zebra} must sit above paint ${STREET_DECAL_Y.paint}`);
  assert.ok(STREET_DECAL_Y.paint > 0.10, `paint ${STREET_DECAL_Y.paint} must sit above cycleway/footway 0.10`);
  const src = fs.readFileSync(path.join(ROOT, 'src/gangnam/streetDetail.js'), 'utf8');
  assert.match(src, /zebraMat[\s\S]*?depthTest:\s*true/);
  assert.match(src, /paintMat[\s\S]*?depthTest:\s*true/);
  const wide = { n: '강남대로', k: 'primary', w: 26.4, p: [[0, 0], [0, 40]] };
  const narrow = { n: '강남대로', k: 'primary', w: 16, p: [[1, 5], [1, 35]] };
  assert.equal(segmentCoveredByWiderRoad(1, 5, 1, 35, 16, [wide, narrow], narrow), true);
  const beside = { n: '옆길', k: 'residential', w: 6, p: [[30, 0], [30, 40]] };
  assert.equal(segmentCoveredByWiderRoad(30, 0, 30, 40, 6, [wide, beside], beside), false);
  ok(`decal stack paint ${STREET_DECAL_Y.paint} < zebra ${STREET_DECAL_Y.zebra}; cover-filter synthetic ok`);
}

{
  const j = J('public/corridor/gangnam/street.json');
  assert.ok(j.stops.length >= 20 && j.stops.length <= 80, `stops ${j.stops.length}`);
  const med = j.stops.filter((s) => s.kind === 'median');
  assert.ok(med.length >= 2 && med.length <= 12, `median ${med.length}`);
  assert.ok(med.some((s) => /강남역/.test(s.name) && s.toward === '신논현역'));
  assert.ok(med.some((s) => /강남역/.test(s.name) && s.toward === '강남역'));
  const brand = /스타벅스|나이키|삼성전자|애플|현대|cgv|뉴욕제과|GS타워|포스코|하나은행|교보|아가방|수협/i;
  for (const s of j.stops) {
    assert.ok(!brand.test(s.name), s.name);
    assert.ok(!/\d+\s*분/.test(s.routes.join(' ')));
    for (const r of s.routes) assert.ok(/^\d{2,5}$|^[가-힣]{1,2}\d{1,2}$/.test(r), r);
  }
  assert.ok(j.props.length >= 80 && j.props.length <= 520, `props ${j.props.length}`);
  assert.ok(j.waiters.length >= 20 && j.waiters.length <= 280, `waiters ${j.waiters.length}`);
  const medMods = (j.modules || []).filter((m) => m.kind === 'median');
  assert.ok(medMods.length >= 10, `median modules ${medMods.length}`);
  const g12 = j.stops.find((s) => s.ref === '22012');
  if (g12) {
    const ms = medMods.filter((m) => m.si === j.stops.indexOf(g12));
    const span = Math.hypot(ms[0].x - ms[ms.length - 1].x, ms[0].z - ms[ms.length - 1].z);
    assert.ok(span >= 26 && span <= 42, `22012 span ${span}`);
  }
  assert.ok((j.platforms || []).some((p) => p[3] >= 30 && p[3] <= 42), 'platform length');
  assert.ok((j.zebras || []).length >= 20, `zebras ${j.zebras.length}`);
  assert.ok((j.shops || []).length >= 40, `shops ${j.shops.length}`);
  for (let i = 0; i < j.shops.length; i++) {
    for (let k = i + 1; k < j.shops.length; k++) {
      const d = Math.hypot(j.shops[i][0] - j.shops[k][0], j.shops[i][1] - j.shops[k][1]);
      assert.ok(d >= 2.15, `overlapping shops d=${d.toFixed(2)}`);
    }
  }
  assert.ok((j.benches || []).length >= 8, `benches ${(j.benches || []).length}`);
  assert.ok((j.tents || []).length >= 10, `tents ${j.tents.length}`);
  const shopBrand = /스타벅스|GS25|CU|세븐일레븐|배스킨|맥도날드|이디야|투썸/i;
  for (const name of ['골목24', '나인마트', '오후커피', '한그릇', '노을포차']) assert.ok(!shopBrand.test(name));
  assert.ok((j.meta?.alleyRoads || []).includes('강남대로94길'));
  ok(`stops ${j.stops.length} median ${med.length} modules ${j.modules.length} shops ${j.shops.length}`);
}

{
  const j = J('public/corridor/gangnam/street.json');
  const index = J('public/corridor/gangnam/index.json');
  const tiles = Object.keys(index.tiles).sort().map((k) => J(`public/corridor/gangnam/tiles/${k}.json`));
  const roads = tiles.flatMap((t) => t.r || []);
  const daeroRoads = roads.filter((r) => r.n === '강남대로' && r.k !== 'service');
  const busways = roads.filter((r) => r.k === 'busway');
  const hypot = Math.hypot;
  const projectOn = (seq, p) => {
    let best = Infinity, pt = seq[0], yaw = 0;
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
      const q = [a[0] + dx * t, a[1] + dz * t];
      const d = hypot(q[0] - p[0], q[1] - p[1]);
      if (d < best) { best = d; pt = q; yaw = Math.atan2(dx, dz); }
    }
    return { d: best, pt, yaw };
  };
  const onLane = (x, z, pad = 0.35) => {
    for (const r of daeroRoads) {
      if (!r.p || r.p.length < 2) continue;
      if (projectOn(r.p, [x, z]).d < (r.w || 16) / 2 + pad) return true;
    }
    for (const r of busways) {
      if (!r.p || r.p.length < 2) continue;
      if (projectOn(r.p, [x, z]).d < (r.w || 4) / 2 + pad) return true;
    }
    return false;
  };
  const inZebra = (x, z, pad = 0.25) => {
    for (const zd of j.zebras || []) {
      const [cx, cz, yaw, sx, sz] = zd;
      const dx = x - cx, dz = z - cz;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.max(0, Math.abs(lx) - sx / 2) ** 2 + Math.max(0, Math.abs(lz) - sz / 2) ** 2 <= pad * pad) return true;
    }
    return false;
  };
  const twoBus = (x, z) => {
    const hits = [];
    for (const r of busways) {
      if (!r.p || r.p.length < 2) continue;
      const hit = projectOn(r.p, [x, z]);
      if (hit.d <= 45 && !hits.some((o) => hypot(o.pt[0] - hit.pt[0], o.pt[1] - hit.pt[1]) < 5.5)) hits.push({ ...hit, road: r });
    }
    for (let i = 0; i < hits.length; i++) {
      for (let k = i + 1; k < hits.length; k++) {
        const c2c = hypot(hits[i].pt[0] - hits[k].pt[0], hits[i].pt[1] - hits[k].pt[1]);
        if (c2c >= 6.2 && c2c <= 15.5) return [hits[i], hits[k]];
      }
    }
    return hits.slice(0, 1);
  };
  const islandW = (x, z) => {
    const pair = twoBus(x, z);
    if (pair.length < 2) return 3.6;
    const c2c = hypot(pair[0].pt[0] - pair[1].pt[0], pair[0].pt[1] - pair[1].pt[1]);
    const gap = c2c - (pair[0].road.w || 4) / 2 - (pair[1].road.w || 4) / 2;
    return Math.max(3.2, Math.min(4.0, gap - 0.35));
  };
  const MED_N = 5, MED_GAP = 7.2, span = (MED_N - 1) * MED_GAP;
  const targets = (j.stops || []).filter((st) => st.kind === 'median' && st.road === '강남대로' && /강남역/.test(st.name));
  assert.ok(targets.length >= 2, `강남역 median stops ${targets.length}`);
  let checked = 0, missed = 0;
  const samples = [];
  for (const st of targets) {
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    const rx = Math.cos(st.yaw), rz = -Math.sin(st.yaw);
    for (const along of [-span / 2, 0, span / 2]) {
      const ix = st.x + rx * along, iz = st.z + rz * along;
      const inner = islandW(ix, iz) * 0.5 + 0.2;
      for (const side of [-1, 1]) {
        let lane = 0, hit = 0;
        for (let d = inner; d <= 34; d += 0.6) {
          const x = ix + fx * side * d, z = iz + fz * side * d;
          if (!onLane(x, z)) continue;
          lane++;
          checked++;
          if (inZebra(x, z)) hit++;
          else {
            missed++;
            if (samples.length < 8) samples.push(`${st.ref} along=${along} side=${side} d=${d.toFixed(1)} @${x.toFixed(1)},${z.toFixed(1)}`);
          }
        }
        assert.ok(lane >= 8, `${st.ref} side ${side} along ${along} only ${lane} carriageway samples`);
      }
    }
  }
  assert.equal(missed, 0, `zebra gaps ${missed}/${checked} ${samples.join(' | ')}`);
  ok(`zebra covers full 강남역 carriageway ${checked - missed}/${checked} at ${targets.length} median stops`);
}


{
  const j = J('public/corridor/gangnam/street.json');
  const index = J('public/corridor/gangnam/index.json');
  const tiles = Object.keys(index.tiles).sort().map((k) => J(`public/corridor/gangnam/tiles/${k}.json`));
  const roads = tiles.flatMap((t) => t.r || []);
  const busways = roads.filter((r) => r.k === 'busway');
  const avenues = roads.filter((r) => r.n === '강남대로' || r.n === '테헤란로');
  const hypot = Math.hypot;
  function projectOn(seq, p) {
    let best = Infinity, pt = seq[0];
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
      const q = [a[0] + dx * t, a[1] + dz * t];
      const d = hypot(q[0] - p[0], q[1] - p[1]);
      if (d < best) { best = d; pt = q; }
    }
    return { d: best, pt };
  }
  function nearest(x, z, list) {
    let best = null;
    for (const r of list) {
      if (!r.p || r.p.length < 2) continue;
      const hit = projectOn(r.p, [x, z]);
      if (!best || hit.d < best.d) best = { ...hit, road: r };
    }
    return best;
  }
  function twoBus(x, z) {
    const hits = [];
    for (const r of busways) {
      if (!r.p || r.p.length < 2) continue;
      const hit = projectOn(r.p, [x, z]);
      if (hit.d <= 40 && !hits.some((o) => hypot(o.pt[0] - hit.pt[0], o.pt[1] - hit.pt[1]) < 5.5)) hits.push({ ...hit, road: r });
    }
    hits.sort((a, b) => a.d - b.d);
    let best = null, score = Infinity;
    for (let i = 0; i < hits.length; i++) {
      for (let j = i + 1; j < hits.length; j++) {
        const c2c = hypot(hits[i].pt[0] - hits[j].pt[0], hits[i].pt[1] - hits[j].pt[1]);
        if (c2c < 6.2 || c2c > 15.5) continue;
        const mx = (hits[i].pt[0] + hits[j].pt[0]) / 2, mz = (hits[i].pt[1] + hits[j].pt[1]) / 2;
        const sc = hypot(mx - x, mz - z);
        if (sc < score) { score = sc; best = [hits[i], hits[j]]; }
      }
    }
    return best || hits.slice(0, 1);
  }
  const med = j.stops.filter((s) => s.kind === 'median');
  for (const st of med) {
    const pair = twoBus(st.x, st.z);
    assert.ok(pair.length >= 1, `median ${st.ref} missing busway`);
    const plat = (j.platforms || []).find((p) => hypot(p[0] - st.x, p[1] - st.z) < 1);
    const islandW = plat ? plat[4] : 3.6;
    assert.ok(islandW >= 3 && islandW <= 4.05, `islandW ${st.ref} ${islandW}`);
    if (pair.length >= 2) {
      const mx = (pair[0].pt[0] + pair[1].pt[0]) / 2;
      const mz = (pair[0].pt[1] + pair[1].pt[1]) / 2;
      const dMid = hypot(st.x - mx, st.z - mz);
      assert.ok(dMid < 1.8, `median ${st.ref} not on island mid ${dMid.toFixed(2)}`);
    }
    for (const bw of pair) {
      const clear = bw.d - (bw.road.w || 4) / 2 - islandW / 2;
      assert.ok(clear >= -0.25, `median ${st.ref} overlaps busway clear=${clear.toFixed(2)} d=${bw.d.toFixed(2)}`);
    }
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw);
    const mods = (j.modules || []).filter((m) => m.kind === 'median' && hypot(m.x - st.x, m.z - st.z) < 30);
    assert.ok(mods.length >= 3, `median ${st.ref} modules ${mods.length}`);
    for (const m of mods) {
      const cross = Math.abs((m.x - st.x) * fx + (m.z - st.z) * fz);
      assert.ok(cross < 1.3, `median module off island centerline cross=${cross.toFixed(2)} ${st.ref}`);
    }
  }
  for (const p of j.paints || []) {
    let md = Infinity, sd = Infinity;
    for (const m of (j.modules || []).filter((m) => m.kind === 'median')) md = Math.min(md, hypot(m.x - p[0], m.z - p[1]));
    for (const st of med) sd = Math.min(sd, hypot(st.x - p[0], st.z - p[1]));
    assert.ok(md > 1.6, `paint under shelter d=${md.toFixed(2)}`);
    assert.ok(sd > 2.3 && sd < 7, `paint not beside island d=${sd.toFixed(2)}`);
  }
  const side = j.stops.filter((s) => s.kind === 'side');
  assert.equal(side.length + med.length, j.stops.length);
  const offLanes = (x, z, label) => {
    for (const r of avenues) {
      if (!r.p || r.p.length < 2) continue;
      const hit = projectOn(r.p, [x, z]);
      const half = (r.w || 16) / 2;
      if (hit.d < half - 0.45) assert.fail(`${label} in ${r.n} w=${r.w} d=${hit.d.toFixed(2)} half=${half.toFixed(2)}`);
    }
    for (const r of busways) {
      if (!r.p || r.p.length < 2) continue;
      const hit = projectOn(r.p, [x, z]);
      if (hit.d < (r.w || 4) / 2 + 0.6) assert.fail(`${label} on busway d=${hit.d.toFixed(2)}`);
    }
  };
  for (const st of side) offLanes(st.x, st.z, `side ${st.ref || st.name}`);
  for (const m of (j.modules || []).filter((m) => m.kind !== 'median')) offLanes(m.x, m.z, 'side module');
  let gn = 0, th = 0;
  for (const sh of j.shops || []) {
    const g = nearest(sh[0], sh[1], roads.filter((r) => r.n === '강남대로'));
    const te = nearest(sh[0], sh[1], roads.filter((r) => r.n === '테헤란로'));
    if (g && g.d < (g.road.w || 16) / 2 + 16) gn++;
    if (te && te.d < (te.road.w || 16) / 2 + 16) th++;
  }
  assert.ok(gn >= 20, `강남대로 shops ${gn}`);
  assert.ok(th >= 12, `테헤란로 shops ${th}`);
  ok(`island clear ${med.length} median, sidewalk ${side.length} side, paints ${j.paints.length} aveShops ${gn}/${th}`);
}

{
  const j = J('public/corridor/gangnam/street.json');
  const index = J('public/corridor/gangnam/index.json');
  const tiles = Object.keys(index.tiles).sort().map((k) => J(`public/corridor/gangnam/tiles/${k}.json`));
  const roads = tiles.flatMap((t) => t.r || []);
  const WALK = new Set(['footway', 'steps', 'pedestrian', 'path']);
  const carRoads = roads.filter((r) => r.p?.length >= 2 && !WALK.has(r.k));
  const hypot = Math.hypot;
  function projectOn(seq, p) {
    let best = Infinity, pt = seq[0], yaw = 0;
    for (let i = 1; i < seq.length; i++) {
      const a = seq[i - 1], b = seq[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2));
      const q = [a[0] + dx * t, a[1] + dz * t];
      const d = hypot(q[0] - p[0], q[1] - p[1]);
      if (d < best) { best = d; pt = q; yaw = Math.atan2(dx, dz); }
    }
    return { d: best, pt, yaw };
  }
  function onCarriage(x, z, radius) {
    for (const r of carRoads) {
      const hit = projectOn(r.p, [x, z]);
      if (hit.d < (r.w || 6) * 0.5 + radius) return { ...hit, road: r };
    }
    for (const zd of j.zebras || []) {
      const [cx, cz, yaw, sx, sz] = zd;
      const dx = x - cx, dz = z - cz;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const ox = Math.max(0, Math.abs(lx) - sx / 2);
      const oz = Math.max(0, Math.abs(lz) - sz / 2);
      if (hypot(ox, oz) < radius) return { kind: 'zebra' };
    }
    return null;
  }
  const PROP_R = [0.72, 0.55, 0.48, 0.22, 0.28, 0.5, 0.58];
  const KIND = ['kiosk', 'bike', 'planter', 'bollard', 'pole', 'scooter', 'vending'];
  const lists = [
    ['props', (j.props || []).map((p) => ({ x: p[1], z: p[2], r: (PROP_R[p[0]] || 0.55) * (p[4] || 1), label: KIND[p[0]] || `k${p[0]}` }))],
    ['poles', (j.poles || []).map((p) => ({ x: p[0], z: p[1], r: 0.28, label: 'pole' }))],
    ['benches', (j.benches || []).map((p) => ({ x: p[0], z: p[1], r: 0.85, label: 'bench' }))],
    ['tables', (j.tables || []).map((p) => ({ x: p[0], z: p[1], r: 0.5, label: 'table' }))],
    ['stools', (j.stools || []).map((p) => ({ x: p[0], z: p[1], r: 0.25, label: 'stool' }))],
    ['tents', (j.tents || []).map((p) => ({ x: p[0], z: p[1], r: 1.35, label: 'tent' }))],
    ['aframes', (j.aframes || []).map((p) => ({ x: p[0], z: p[1], r: 0.42, label: 'aframe' }))],
    ['trash', (j.trash || []).map((p) => ({ x: p[0], z: p[1], r: 0.28, label: 'trash' }))],
    ['bins', (j.bins || []).map((p) => ({ x: p[0], z: p[1], r: 0.38, label: 'bin' }))],
  ];
  const byList = {};
  let overlap = 0, total = 0;
  const samples = [];
  for (const [name, items] of lists) {
    let n = 0;
    for (const it of items) {
      total++;
      const hit = onCarriage(it.x, it.z, it.r);
      if (hit) {
        n++; overlap++;
        if (samples.length < 8) samples.push(`${name}:${it.label} @${it.x},${it.z} ${hit.road ? `${hit.road.n||hit.road.k} d=${hit.d.toFixed(2)}` : 'zebra'}`);
      }
    }
    byList[name] = `${n}/${items.length}`;
  }
  assert.equal(overlap, 0, `furniture on carriageway ${overlap}/${total} ${JSON.stringify(byList)} ${samples.join(' | ')}`);
  const islandHits = [];
  for (const st of (j.stops || []).filter((s) => s.kind === 'median')) {
    for (const [name, items] of lists) {
      for (const it of items) {
        if (hypot(it.x - st.x, it.z - st.z) <= 2.2) islandHits.push(`${name} near ${st.ref || st.name}`);
      }
    }
  }
  assert.equal(islandHits.length, 0, `non-shelter furniture on BRT island: ${islandHits.join(', ')}`);
  ok(`furniture off carriageway 0/${total} ${JSON.stringify(byList)}`);
}

{
  const index = J('public/corridor/gangnam/index.json');
  const tiles = Object.keys(index.tiles).sort().map((k) => J(`public/corridor/gangnam/tiles/${k}.json`));
  const cars = carSegs(tiles);
  const night = J('public/corridor/gangnam/night.json');
  const lamps = night.lamps || [];
  let lampHit = 0;
  for (let i = 0; i < lamps.length; i += 5) {
    if (onCarriageway(cars, lamps[i], lamps[i + 1], 0.4)) lampHit++;
  }
  assert.equal(lampHit, 0, `night.json lamps on carriageway ${lampHit}/${lamps.length / 5}`);

  let poleHit = 0;
  for (const p of POLES) {
    if (onCarriageway(cars, p.x, p.z, 0.45)) poleHit++;
  }
  assert.equal(poleHit, 0, `billboard poles on carriageway ${poleHit}/${POLES.length}`);

  const TREE_KINDS = new Set(['primary', 'secondary', 'tertiary']);
  const treePts = [];
  for (const t of tiles) {
    for (const r of t.r || []) {
      if (!TREE_KINDS.has(r.k) || !r.p || r.p.length < 2) continue;
      for (let i = 1; i < r.p.length; i++) {
        const a = r.p[i - 1], b = r.p[i];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1e-3) continue;
        const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        for (let s = 6; s < L; s += 14) for (const side of [-1, 1]) {
          const x = a[0] + ((b[0] - a[0]) * s) / L + nx * side * (r.w / 2 + 1.6);
          const z = a[1] + ((b[1] - a[1]) * s) / L + nz * side * (r.w / 2 + 1.6);
          if (!onCarriageway(cars, x, z, 0.8)) treePts.push([x, z]);
        }
      }
    }
  }
  let treeHit = 0;
  for (const [x, z] of treePts) if (onCarriageway(cars, x, z, 0.8)) treeHit++;
  assert.equal(treeHit, 0, `trees on carriageway ${treeHit}/${treePts.length}`);
  ok(`lamps 0/${lamps.length / 5} poles 0/${POLES.length} trees 0/${treePts.length} on carriageway`);
}

{
  const prev = J('public/corridor/gangnam/street.json');
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-gangnam-street.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const next = J('public/corridor/gangnam/street.json');
  delete prev.meta.generated; delete next.meta.generated;
  assert.deepEqual(prev, next);
  ok('street.json rebuilds deterministically');
}

console.log(`test-gangnam-street: ${n} ok`);
