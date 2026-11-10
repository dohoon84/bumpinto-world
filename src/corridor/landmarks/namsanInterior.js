// [namsan] 타워 실내. 층 안내는 일반 이름만 (실제 브랜드명 없음).
//   광장 5층 로비 · 타워 1층 테라스 상점 · 4·5층 링형 전망대(전면 유리) · 7층 프렌치 레스토랑.
//   엘리베이터 코어는 가운데에 두고 창을 가리지 않는다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NT } from './namsanCoords.js';

function makeSign(text, w = 3.2, h = 0.7, bg = '#1e2936', fg = '#f4f7fa') {
  const c = document.createElement('canvas'); c.width = 768; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 768, 192);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 64px sans-serif';
  x.fillText(text, 384, 96);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return m;
}

function dirLabel(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 192;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 1024, 192);
  x.fillStyle = 'rgba(8,12,18,0.42)';
  x.fillRect(40, 36, 944, 120);
  x.strokeStyle = 'rgba(230,236,242,0.55)';
  x.lineWidth = 3;
  x.strokeRect(40, 36, 944, 120);
  x.fillStyle = '#f4f7fb';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 64px sans-serif';
  x.fillText(text, 512, 96);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.72), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
}

function tableSet(parent, x, z, y, cloth = '#f3efe6') {
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12), new THREE.MeshLambertMaterial({ color: cloth }));
  top.position.set(x, y + 0.76, z); parent.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.74, 8), new THREE.MeshLambertMaterial({ color: '#6b5344' }));
  leg.position.set(x, y + 0.37, z); parent.add(leg);
  for (const [dx, dz] of [[0.7, 0.15], [-0.55, 0.35], [0.15, -0.7]]) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), new THREE.MeshLambertMaterial({ color: '#5c4033' }));
    ch.position.set(x + dx, y + 0.22, z + dz); parent.add(ch);
  }
}

function ringShape(outerR, innerR) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

export function createNamsanInterior({ parent, baseY, tower }) {
  const g = new THREE.Group();
  g.name = 'namsan-interior';
  parent.add(g);

  const ox = NT.tx, oz = NT.tz;
  const PH = NT.plazaH;
  const shaftBottom = baseY + PH;
  const drumBottom = shaftBottom + NT.shaftH;
  const floors = {
    plaza1: baseY + 0.12,
    plaza5: baseY + PH - 3.4,
    t1: shaftBottom + 0.12,
    t4: drumBottom + 13.2,
    t5: drumBottom + 17.6,
    t7: drumBottom + 24.2,
  };
  const labels = {
    plaza1: '광장 1층 · 입구',
    plaza5: '광장 5층 · 전망대 입구',
    t1: '타워 1층 · 매표 · 상점',
    t4: '타워 4층 · 전망대',
    t5: '타워 5층 · 전망대',
    t7: '타워 7층 · 프렌치 레스토랑',
  };
  const order = ['plaza1', 'plaza5', 't1', 't4', 't5', 't7'];

  const nightMats = [];
  const track = (mat, nightE = 0.8) => { nightMats.push({ mat, nightE }); return mat; };

  const CORE_R = 3.15;
  const evX = ox, evZ = oz;
  const padR = CORE_R + 1.35;

  // ----- Plaza 5F lobby (inside top of plaza building) -----
  const lobby = new THREE.Group(); lobby.name = 'namsan-plaza5';
  const lobbyY = floors.plaza5;
  const floorM = new THREE.MeshLambertMaterial({ color: '#e6e0d4' });
  const ceilM = new THREE.MeshLambertMaterial({ color: '#f4f1ea' });
  const lobbyFloor = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.16, 24), floorM);
  lobbyFloor.position.set(ox, lobbyY, oz); lobby.add(lobbyFloor);
  const lobbyCeil = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.12, 24), ceilM);
  lobbyCeil.position.set(ox, lobbyY + 3.15, oz); lobby.add(lobbyCeil);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.1, 1.3), new THREE.MeshLambertMaterial({ color: '#2a3340' }));
  desk.position.set(ox + 6.5, lobbyY + 0.55, oz); lobby.add(desk);
  lobby.add(((s) => { s.position.set(ox + 6.5, lobbyY + 1.5, oz + 0.7); return s; })(makeSign('안내데스크', 3.4, 0.55)));
  for (let i = 0; i < 4; i++) {
    const tm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.45), new THREE.MeshLambertMaterial({ color: '#3a4554' }));
    tm.position.set(ox - 8 + i * 1.1, lobbyY + 0.75, oz + 7.2); lobby.add(tm);
  }
  lobby.add(((s) => { s.position.set(ox - 6.4, lobbyY + 1.85, oz + 7.5); return s; })(makeSign('무인발권기', 3.2, 0.5)));
  const cafe = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.15, 1.5), new THREE.MeshLambertMaterial({ color: '#6d4c3d' }));
  cafe.position.set(ox - 8, lobbyY + 0.58, oz - 6); lobby.add(cafe);
  lobby.add(((s) => { s.position.set(ox - 8, lobbyY + 1.55, oz - 5.2); return s; })(makeSign('카페', 2.2, 0.5, '#4e342e')));
  const sweet = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 1.3), new THREE.MeshLambertMaterial({ color: '#8d4a5a' }));
  sweet.position.set(ox + 8.2, lobbyY + 0.55, oz - 6.4); lobby.add(sweet);
  lobby.add(((s) => { s.position.set(ox + 8.2, lobbyY + 1.5, oz - 5.7); return s; })(makeSign('스위트바', 2.6, 0.5, '#6a303c')));
  const gift = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 2.4), new THREE.MeshLambertMaterial({ color: '#345068' }));
  gift.position.set(ox + 8.4, lobbyY + 0.6, oz + 6.2); lobby.add(gift);
  lobby.add(((s) => { s.position.set(ox + 8.4, lobbyY + 1.55, oz + 7.5); return s; })(makeSign('기념품샵', 2.6, 0.5, '#243848')));
  lobby.add(((s) => { s.position.set(ox, lobbyY + 2.6, oz - 10); return s; })(makeSign('전망대 입구', 4.4, 0.7, '#102033')));
  g.add(lobby);

  // ----- Tower 1F shops around shaft on the terrace -----
  const t1 = new THREE.Group(); t1.name = 'namsan-t1';
  const t1Y = floors.t1;
  const shops = [
    { a: 0.4, name: '매표소', col: '#2c3a4a' },
    { a: 1.3, name: '테라스 카페', col: '#5c4033' },
    { a: 2.2, name: '수제버거', col: '#6b3a2a' },
    { a: 3.2, name: '편의점', col: '#2e4a38' },
    { a: 4.1, name: '기념품샵', col: '#33465c' },
    { a: 5.1, name: '분식', col: '#6a3d2e' },
  ];
  for (const s of shops) {
    const x = ox + Math.cos(s.a) * 11.5, z = oz + Math.sin(s.a) * 11.5;
    const k = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.6, 2.4), new THREE.MeshLambertMaterial({ color: s.col }));
    k.position.set(x, t1Y + 1.3, z);
    k.rotation.y = -s.a;
    t1.add(k);
    const sign = makeSign(s.name, 2.8, 0.45, s.col);
    sign.position.set(x + Math.cos(s.a) * 1.3, t1Y + 2.5, z + Math.sin(s.a) * 1.3);
    sign.rotation.y = -s.a + Math.PI;
    t1.add(sign);
  }
  g.add(t1);

  const glassMat = new THREE.MeshStandardMaterial({
    color: '#c5dceb', transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0.18,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const darkCeil = new THREE.MeshLambertMaterial({ color: '#161a20' });
  const floorWood = new THREE.MeshLambertMaterial({ color: '#cbb89a' });
  const coreMat = new THREE.MeshLambertMaterial({ color: '#2a3038' });
  const mullMat = new THREE.MeshLambertMaterial({ color: '#1c2228' });
  const DIRS = [
    { a: -Math.PI / 2, text: '북쪽 · 북한산 방향' },
    { a: 0, text: '동쪽 · 남산 아래' },
    { a: Math.PI / 2, text: '남쪽 · 한강 방향' },
    { a: Math.PI, text: '서쪽 · 서울역 방향' },
  ];

  function addDownlights(d, y, r, n = 16) {
    const mat = track(new THREE.MeshStandardMaterial({
      color: '#fff4d6', emissive: new THREE.Color('#ffe7b0'), emissiveIntensity: 0.7,
    }), 1.25);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.06, 10), mat);
      lamp.position.set(ox + Math.cos(a) * r, y + 3.22, oz + Math.sin(a) * r);
      d.add(lamp);
    }
  }

  function addCore(d, y, h = 3.28) {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(CORE_R, CORE_R, h, 24), coreMat);
    core.position.set(ox, y + h / 2, oz);
    d.add(core);
    // elevator door on the east face of the core — does not block the outer glass
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 1.15), new THREE.MeshLambertMaterial({ color: '#8a929a' }));
    door.position.set(ox + CORE_R + 0.02, y + 1.15, oz);
    d.add(door);
  }

  function addGlassRing(d, y, r, h = 3.15) {
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true), glassMat);
    glass.position.set(ox, y + h / 2, oz);
    d.add(glass);
    const mull = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const mg = new THREE.BoxGeometry(0.1, h, 0.1);
      mg.translate(ox + Math.cos(a) * r, y + h / 2, oz + Math.sin(a) * r);
      mull.push(mg);
    }
    d.add(new THREE.Mesh(mergeGeometries(mull), mullMat));
    const sill = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 48), new THREE.MeshLambertMaterial({ color: '#2b333a' }));
    sill.rotation.x = Math.PI / 2;
    sill.position.set(ox, y + 1.05, oz);
    d.add(sill);
  }

  function addTelescopes(d, y, r) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.18;
      const tx = ox + Math.cos(a) * r, tz = oz + Math.sin(a) * r;
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.15, 8), new THREE.MeshLambertMaterial({ color: '#2a2e33' }));
      stand.position.set(tx, y + 0.58, tz); d.add(stand);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.7, 10), new THREE.MeshLambertMaterial({ color: '#1a1d22' }));
      tube.rotation.z = Math.PI / 2; tube.rotation.y = -a;
      tube.position.set(tx + Math.cos(a) * 0.2, y + 1.22, tz + Math.sin(a) * 0.2);
      d.add(tube);
    }
  }

  function addDirectionLabels(d, y, r) {
    for (const dir of DIRS) {
      const lab = dirLabel(dir.text);
      lab.position.set(ox + Math.cos(dir.a) * r, y + 2.15, oz + Math.sin(dir.a) * r);
      lab.lookAt(ox, y + 2.15, oz);
      d.add(lab);
    }
  }

  function buildDeck(y, name, extras) {
    const d = new THREE.Group();
    const outerR = NT.drumR - 0.28;
    const innerR = CORE_R + 0.12;
    const floorGeo = new THREE.ExtrudeGeometry(ringShape(outerR, innerR), { depth: 0.16, bevelEnabled: false });
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorWood);
    floor.position.set(ox, y, oz); d.add(floor);
    const ceilGeo = new THREE.ExtrudeGeometry(ringShape(outerR - 0.1, innerR), { depth: 0.1, bevelEnabled: false });
    ceilGeo.rotateX(-Math.PI / 2);
    const ceil = new THREE.Mesh(ceilGeo, darkCeil);
    ceil.position.set(ox, y + 3.28, oz); d.add(ceil);
    addCore(d, y);
    addGlassRing(d, y, outerR);
    addDownlights(d, y, (outerR + innerR) * 0.5);
    addTelescopes(d, y, outerR - 1.15);
    addDirectionLabels(d, y, outerR - 0.12);
    d.add(((s) => { s.position.set(ox + CORE_R + 1.6, y + 2.55, oz); s.rotation.y = -Math.PI / 2; return s; })(makeSign(name, 4.6, 0.48)));
    extras(d, y);
    return d;
  }

  const deck4 = buildDeck(floors.t4, '전망대 · 하늘화장실 · 카페', (d, y) => {
    // extras sit against the core so they never fill the window
    const cafe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.15, 0.9), new THREE.MeshLambertMaterial({ color: '#5d4037' }));
    cafe.position.set(ox - 0.2, y + 0.58, oz - CORE_R - 0.7); d.add(cafe);
    d.add(((s) => { s.position.set(ox - 0.2, y + 1.4, oz - CORE_R - 1.15); return s; })(makeSign('카페', 1.6, 0.32, '#4e342e')));
    const rest = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.1, 0.85), new THREE.MeshLambertMaterial({ color: '#9aa2aa' }));
    rest.position.set(ox + 0.1, y + 1.05, oz + CORE_R + 0.65); d.add(rest);
    d.add(((s) => { s.position.set(ox + 0.1, y + 2.25, oz + CORE_R + 1.15); return s; })(makeSign('하늘화장실', 2.0, 0.32, '#54606c')));
  });
  const deck5 = buildDeck(floors.t5, '전망대 · 기념품 · 포토존', (d, y) => {
    const gift = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.15, 0.85), new THREE.MeshLambertMaterial({ color: '#31465c' }));
    gift.position.set(ox + CORE_R + 0.7, y + 0.58, oz - 0.2); d.add(gift);
    d.add(((s) => { s.position.set(ox + CORE_R + 1.2, y + 1.4, oz - 0.2); s.rotation.y = -Math.PI / 2; return s; })(makeSign('기념품샵', 1.8, 0.32, '#243848')));
    const photo = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.12), track(new THREE.MeshStandardMaterial({
      color: '#f0f4f8', emissive: new THREE.Color('#fff4d0'), emissiveIntensity: 0,
    }), 0.45));
    photo.position.set(ox - CORE_R - 0.55, y + 1.15, oz + 0.2); d.add(photo);
    d.add(((s) => { s.position.set(ox - CORE_R - 0.7, y + 2.2, oz + 0.2); s.rotation.y = Math.PI / 2; return s; })(makeSign('포토존', 1.6, 0.32, '#3a2a40')));
  });
  g.add(deck4, deck5);

  // ----- 7F French restaurant: window tables, glass ring, kitchen core -----
  const r7 = new THREE.Group(); r7.name = 'namsan-t7';
  const y7 = floors.t7;
  const r7outer = 12.15;
  const f7geo = new THREE.ExtrudeGeometry(ringShape(r7outer, CORE_R + 0.1), { depth: 0.16, bevelEnabled: false });
  f7geo.rotateX(-Math.PI / 2);
  const f7 = new THREE.Mesh(f7geo, new THREE.MeshLambertMaterial({ color: '#cfc3b0' }));
  f7.position.set(ox, y7, oz); r7.add(f7);
  const c7geo = new THREE.ExtrudeGeometry(ringShape(r7outer - 0.15, CORE_R + 0.1), { depth: 0.1, bevelEnabled: false });
  c7geo.rotateX(-Math.PI / 2);
  const c7 = new THREE.Mesh(c7geo, darkCeil);
  c7.position.set(ox, y7 + 3.2, oz); r7.add(c7);
  addCore(r7, y7, 3.2);
  addGlassRing(r7, y7, r7outer, 3.1);
  addDirectionLabels(r7, y7, r7outer - 0.12);
  addDownlights(r7, y7, 8.6, 14);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    tableSet(r7, ox + Math.cos(a) * 10.35, oz + Math.sin(a) * 10.35, y7, i % 2 ? '#f6f1e4' : '#efe6d4');
  }
  r7.add(((s) => { s.position.set(ox + CORE_R + 1.5, y7 + 2.5, oz); s.rotation.y = -Math.PI / 2; return s; })(makeSign('프렌치 레스토랑', 4.4, 0.5, '#2a2018', '#f3e6c8')));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), track(new THREE.MeshStandardMaterial({
      color: '#ffd59a', emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0.55,
    }), 1.15));
    p.position.set(ox + Math.cos(a) * 7.2, y7 + 2.85, oz + Math.sin(a) * 7.2);
    r7.add(p);
  }
  g.add(r7);

  // elevator pads (outside the core, east side) — cycle plaza1 → … → t7 → plaza1
  for (const id of order) {
    const y = floors[id];
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), new THREE.MeshLambertMaterial({ color: '#4a90c8' }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(ox + padR, y + 0.03, oz);
    g.add(pad);
    g.add(((s) => { s.position.set(ox + padR, y + 2.35, oz); return s; })(makeSign('엘리베이터', 1.8, 0.32, '#1c2834')));
  }

  let ride = null;
  function inElevPad(x, z, y) {
    for (const id of order) {
      if (Math.hypot(x - (ox + padR), z - oz) < 1.05 && Math.abs(y - floors[id]) < 1.4) return id;
    }
    return null;
  }
  function nextFloor(id) {
    const i = order.indexOf(id);
    if (i < 0) return null;
    return order[(i + 1) % order.length];
  }

  function insideDrum(x, z) {
    const d = Math.hypot(x - ox, z - oz);
    return d < NT.drumR - 0.45 && d > CORE_R + 0.15;
  }
  function insideLobby(x, z) { return Math.hypot(x - ox, z - oz) < 15.5; }

  function floorY(x, z, refY) {
    if (insideDrum(x, z)) {
      const cands = [floors.t4, floors.t5, floors.t7];
      let best = null, bestD = 1e9;
      for (const y of cands) {
        const d = Number.isFinite(refY) ? Math.abs(refY - y) : 0;
        if (d < 3.2 && d < bestD) { best = y; bestD = d; }
      }
      return best;
    }
    if (insideLobby(x, z) && Number.isFinite(refY) && Math.abs(refY - floors.plaza5) < 2.8) return floors.plaza5;
    return null;
  }

  function isBlocked(x, z, r = 0.35) {
    const d = Math.hypot(x - ox, z - oz);
    if (d < CORE_R + r && d > 0.2) {
      // leave a door gap on the east
      if (x > ox && Math.abs(z - oz) < 0.7) return false;
      return true;
    }
    return false;
  }

  let hold = 0, lastPad = null;
  function tickPlayer(dt, player) {
    if (!player) return;
    if (ride) {
      ride.t += dt;
      const u = Math.min(1, ride.t / ride.dur);
      const s = u * u * (3 - 2 * u);
      player.position.x = ride.x;
      player.position.z = ride.z;
      player.position.y = ride.fromY + (ride.toY - ride.fromY) * s;
      if (u >= 1) ride = null;
      return;
    }
    const pad = inElevPad(player.position.x, player.position.z, player.position.y);
    if (pad) {
      if (lastPad === pad) hold += dt; else { hold = 0; lastPad = pad; }
      if (hold > 0.7) {
        const dest = nextFloor(pad);
        if (dest) {
          ride = { fromY: floors[pad], toY: floors[dest], t: 0, dur: 3.6 + Math.abs(floors[dest] - floors[pad]) * 0.012, x: ox + padR, z: oz };
          hold = 0;
        }
      }
    } else { hold = 0; lastPad = null; }

    if (!ride && Math.hypot(player.position.x - ox, player.position.z - oz) < 30
        && Math.abs(player.position.y - baseY) < 1.7 && player.position.x < ox + 7) {
      if (lastPad === 'enter') hold += dt; else { hold = 0; lastPad = 'enter'; }
      if (hold > 0.55) {
        ride = { fromY: player.position.y, toY: floors.plaza5, t: 0, dur: 4.4, x: ox + padR, z: oz };
        hold = 0; lastPad = null;
      }
    }
  }

  return {
    floors, labels,
    get riding() { return !!ride; },
    floorY,
    isBlocked,
    tickPlayer,
    update() {},
    setNight(v) {
      for (const { mat, nightE } of nightMats) mat.emissiveIntensity = 0.15 + nightE * v;
    },
  };
}
