// [namsan] 타워 실내. 층 안내는 일반 이름만 (실제 브랜드명 없음).
//   광장 5층 로비 · 타워 1층 테라스 상점 · 4·5층 전망대 · 7층 프렌치 레스토랑.
//   엘리베이터로 층 사이를 오간다.
import * as THREE from 'three';
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

  // ----- Plaza 5F lobby (inside top of plaza building) -----
  const lobby = new THREE.Group(); lobby.name = 'namsan-plaza5';
  const lobbyY = floors.plaza5;
  const floorM = new THREE.MeshLambertMaterial({ color: '#e6e0d4' });
  const ceilM = new THREE.MeshLambertMaterial({ color: '#f4f1ea' });
  const lobbyFloor = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.16, 24), floorM);
  lobbyFloor.position.set(ox, lobbyY, oz); lobby.add(lobbyFloor);
  const lobbyCeil = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.12, 24), ceilM);
  lobbyCeil.position.set(ox, lobbyY + 3.15, oz); lobby.add(lobbyCeil);
  // info desk
  const desk = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.1, 1.3), new THREE.MeshLambertMaterial({ color: '#2a3340' }));
  desk.position.set(ox + 4.5, lobbyY + 0.55, oz); lobby.add(desk);
  lobby.add(((s) => { s.position.set(ox + 4.5, lobbyY + 1.5, oz + 0.7); return s; })(makeSign('안내데스크', 3.4, 0.55)));
  // ticket machines
  for (let i = 0; i < 4; i++) {
    const tm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.5, 0.45), new THREE.MeshLambertMaterial({ color: '#3a4554' }));
    tm.position.set(ox - 6 + i * 1.1, lobbyY + 0.75, oz + 5.5); lobby.add(tm);
  }
  lobby.add(((s) => { s.position.set(ox - 4.4, lobbyY + 1.85, oz + 5.8); return s; })(makeSign('무인발권기', 3.2, 0.5)));
  // cafe + sweet bar counters
  const cafe = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.15, 1.5), new THREE.MeshLambertMaterial({ color: '#6d4c3d' }));
  cafe.position.set(ox - 7, lobbyY + 0.58, oz - 4); lobby.add(cafe);
  lobby.add(((s) => { s.position.set(ox - 7, lobbyY + 1.55, oz - 3.2); return s; })(makeSign('카페', 2.2, 0.5, '#4e342e')));
  const sweet = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 1.3), new THREE.MeshLambertMaterial({ color: '#8d4a5a' }));
  sweet.position.set(ox + 7.5, lobbyY + 0.55, oz - 5); lobby.add(sweet);
  lobby.add(((s) => { s.position.set(ox + 7.5, lobbyY + 1.5, oz - 4.3); return s; })(makeSign('스위트바', 2.6, 0.5, '#6a303c')));
  // gift
  const gift = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 2.4), new THREE.MeshLambertMaterial({ color: '#345068' }));
  gift.position.set(ox + 8, lobbyY + 0.6, oz + 4.5); lobby.add(gift);
  lobby.add(((s) => { s.position.set(ox + 8, lobbyY + 1.55, oz + 5.8); return s; })(makeSign('기념품샵', 2.6, 0.5, '#243848')));
  lobby.add(((s) => { s.position.set(ox, lobbyY + 2.6, oz - 8); return s; })(makeSign('전망대 입구', 4.4, 0.7, '#102033')));
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

  // ----- Observation decks (4F / 5F) -----
  function buildDeck(y, name, extras) {
    const d = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(NT.drumR - 0.45, NT.drumR - 0.45, 0.18, 48), new THREE.MeshLambertMaterial({ color: '#d9d2c5' }));
    floor.position.set(ox, y, oz); d.add(floor);
    const ceil = new THREE.Mesh(new THREE.CylinderGeometry(NT.drumR - 0.55, NT.drumR - 0.55, 0.12, 48), new THREE.MeshLambertMaterial({ color: '#eef1f4' }));
    ceil.position.set(ox, y + 3.35, oz); d.add(ceil);
    // inner rail
    const rail = new THREE.Mesh(new THREE.TorusGeometry(NT.drumR - 1.15, 0.05, 8, 48), new THREE.MeshLambertMaterial({ color: '#8a9098' }));
    rail.rotation.x = Math.PI / 2; rail.position.set(ox, y + 1.05, oz); d.add(rail);
    // telescopes
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      const tx = ox + Math.cos(a) * (NT.drumR - 1.6), tz = oz + Math.sin(a) * (NT.drumR - 1.6);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.15, 8), new THREE.MeshLambertMaterial({ color: '#2a2e33' }));
      stand.position.set(tx, y + 0.58, tz); d.add(stand);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.7, 10), new THREE.MeshLambertMaterial({ color: '#1a1d22' }));
      tube.rotation.z = Math.PI / 2; tube.rotation.y = -a;
      tube.position.set(tx + Math.cos(a) * 0.2, y + 1.22, tz + Math.sin(a) * 0.2);
      d.add(tube);
    }
    d.add(((s) => { s.position.set(ox, y + 2.7, oz - 3.2); return s; })(makeSign(name, 5.2, 0.6)));
    extras(d, y);
    return d;
  }
  const deck4 = buildDeck(floors.t4, '전망대 · 하늘화장실 · 카페', (d, y) => {
    const cafe = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.15, 1.4), new THREE.MeshLambertMaterial({ color: '#5d4037' }));
    cafe.position.set(ox - 4.2, y + 0.58, oz + 2.2); d.add(cafe);
    d.add(((s) => { s.position.set(ox - 4.2, y + 1.45, oz + 3); return s; })(makeSign('카페', 2, 0.4, '#4e342e')));
    const rest = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.2), new THREE.MeshLambertMaterial({ color: '#d8d4cc' }));
    rest.position.set(ox + 5.2, y + 1.1, oz + 1.4); d.add(rest);
    d.add(((s) => { s.position.set(ox + 5.2, y + 2.35, oz + 2.6); return s; })(makeSign('하늘화장실', 2.4, 0.4, '#54606c')));
  });
  const deck5 = buildDeck(floors.t5, '전망대 · 기념품 · 포토존', (d, y) => {
    const gift = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 1.6), new THREE.MeshLambertMaterial({ color: '#31465c' }));
    gift.position.set(ox + 4.4, y + 0.6, oz - 2.2); d.add(gift);
    d.add(((s) => { s.position.set(ox + 4.4, y + 1.5, oz - 1.3); return s; })(makeSign('기념품샵', 2.4, 0.4, '#243848')));
    const photo = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 0.16), track(new THREE.MeshStandardMaterial({ color: '#f0f4f8', emissive: new THREE.Color('#fff4d0'), emissiveIntensity: 0 }), 0.45));
    photo.position.set(ox - 5, y + 1.3, oz - 1.5); d.add(photo);
    d.add(((s) => { s.position.set(ox - 5, y + 2.65, oz - 1.5); return s; })(makeSign('포토존', 2.2, 0.4, '#3a2a40')));
  });
  g.add(deck4, deck5);

  // ----- 7F French restaurant -----
  const r7 = new THREE.Group(); r7.name = 'namsan-t7';
  const y7 = floors.t7;
  const f7 = new THREE.Mesh(new THREE.CylinderGeometry(12.0, 12.0, 0.18, 40), new THREE.MeshLambertMaterial({ color: '#cfc3b0' }));
  f7.position.set(ox, y7, oz); r7.add(f7);
  const c7 = new THREE.Mesh(new THREE.CylinderGeometry(11.6, 11.6, 0.12, 40), new THREE.MeshLambertMaterial({ color: '#5a4638' }));
  c7.position.set(ox, y7 + 3.2, oz); r7.add(c7);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    tableSet(r7, ox + Math.cos(a) * 8.4, oz + Math.sin(a) * 8.4, y7, i % 2 ? '#f6f1e4' : '#efe6d4');
  }
  const kitchen = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.4, 16), new THREE.MeshLambertMaterial({ color: '#3a3330' }));
  kitchen.position.set(ox, y7 + 0.7, oz); r7.add(kitchen);
  r7.add(((s) => { s.position.set(ox, y7 + 2.55, oz + 3.4); return s; })(makeSign('프렌치 레스토랑', 5.4, 0.6, '#2a2018', '#f3e6c8')));
  // warm pendants
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), track(new THREE.MeshStandardMaterial({ color: '#ffd59a', emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0.55 }), 1.15));
    p.position.set(ox + Math.cos(a) * 6.5, y7 + 2.85, oz + Math.sin(a) * 6.5);
    r7.add(p);
  }
  g.add(r7);

  // ----- Elevator core -----
  const evX = ox + 2.1, evZ = oz;
  const evW = 2.2, evD = 2.2;
  const evMat = new THREE.MeshLambertMaterial({ color: '#c5ccd3' });
  const evShaft = new THREE.Mesh(new THREE.BoxGeometry(evW + 0.2, NT.shaftH + NT.drumH + 8, evD + 0.2), evMat);
  evShaft.position.set(evX, shaftBottom + (NT.shaftH + NT.drumH + 8) / 2, evZ);
  // don't add a solid shaft that fills the view — only door frames at each floor
  const doorFrames = [];
  for (const id of order) {
    const y = floors[id];
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.16), new THREE.MeshLambertMaterial({ color: '#8a929a' }));
    frame.position.set(evX - 1.15, y + 1.15, evZ);
    g.add(frame);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16), new THREE.MeshLambertMaterial({ color: '#4a90c8' }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(evX - 2.3, y + 0.03, evZ);
    g.add(pad);
    g.add(((s) => { s.position.set(evX - 1.15, y + 2.45, evZ - 0.2); return s; })(makeSign('엘리베이터', 1.8, 0.35, '#1c2834')));
    doorFrames.push({ id, y });
  }
  void doorFrames; void evShaft;

  let ride = null; // { fromY, toY, t, dur, x, z }
  function inElevPad(x, z, y) {
    for (const id of order) {
      if (Math.hypot(x - (evX - 2.3), z - evZ) < 1.05 && Math.abs(y - floors[id]) < 1.4) return id;
    }
    return null;
  }
  function nextFloor(id) {
    const i = order.indexOf(id);
    if (i < 0) return null;
    return order[(i + 1) % order.length];
  }

  function insideDrum(x, z) { return Math.hypot(x - ox, z - oz) < NT.drumR - 0.6; }
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
    // keep the elevator core solid except the pad
    if (Math.abs(x - evX) < evW * 0.45 + r && Math.abs(z - evZ) < evD * 0.45 + r) {
      if (Math.hypot(x - (evX - 2.3), z - evZ) > 1.1) return true;
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
          ride = { fromY: floors[pad], toY: floors[dest], t: 0, dur: 3.6 + Math.abs(floors[dest] - floors[pad]) * 0.012, x: evX - 2.3, z: evZ };
          hold = 0;
        }
      }
    } else { hold = 0; lastPad = null; }

    // 동쪽 문으로 광장 건물 1층에 들어오면 로비(광장 5층)로 올라간다.
    if (!ride && Math.hypot(player.position.x - ox, player.position.z - oz) < 30
        && Math.abs(player.position.y - baseY) < 1.7 && player.position.x < ox + 7) {
      if (lastPad === 'enter') hold += dt; else { hold = 0; lastPad = 'enter'; }
      if (hold > 0.55) {
        ride = { fromY: player.position.y, toY: floors.plaza5, t: 0, dur: 4.4, x: evX - 2.3, z: evZ };
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
