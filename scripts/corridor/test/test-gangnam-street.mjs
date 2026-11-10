import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gangnamStreetEnabled } from '../../../src/gangnam/streetDetail.js';

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
      assert.ok(d >= 2.5, `overlapping shops d=${d.toFixed(2)}`);
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
  const prev = J('public/corridor/gangnam/street.json');
  execFileSync('node', [path.join(ROOT, 'scripts/corridor/build-gangnam-street.mjs')], { cwd: ROOT, stdio: 'pipe' });
  const next = J('public/corridor/gangnam/street.json');
  delete prev.meta.generated; delete next.meta.generated;
  assert.deepEqual(prev, next);
  ok('street.json rebuilds deterministically');
}

console.log(`test-gangnam-street: ${n} ok`);
