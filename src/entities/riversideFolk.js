// 탄천 둔치에서 뛰는 사람과 자전거를 탄 사람.
import * as THREE from 'three';
import { createAvatar, animateAvatar, animateRide } from './avatar.js';
import { Bubble } from '../overlay.js';

const RUNNERS = [
  { name: '탄천 러닝 하준', look: { color: '#ff6b6b', pants: '#222', skin: '#f2d0b0', gender: 'm', face: 'round', hair: 'short', top: 'short' }, speed: 3.3, line: '오늘 페이스는 둔치 기준으로 잡았어요.' },
  { name: '탄천 러닝 서윤', look: { color: '#ffd43b', pants: '#2d3436', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'pony', top: 'short' }, speed: 3.1, line: '다리 밑 그늘이 제일 달리기 좋아요.' },
  { name: '탄천 러닝 민재', look: { color: '#74b9ff', pants: '#1e272e', skin: '#e8c4a8', gender: 'm', face: 'square', hair: 'short', top: 'short' }, speed: 3.5, line: '한 바퀴만 더 뛰고 올라갈게요.' },
  { name: '탄천 러닝 지아', look: { color: '#ff9ff3', pants: '#2d3436', skin: '#f6d7c3', gender: 'f', face: 'long', hair: 'pony', top: 'short' }, speed: 2.9, line: '오리들이 옆에서 같이 뛰는 것 같아요.' },
  { name: '탄천 러닝 도윤', look: { color: '#55efc4', pants: '#222', skin: '#d7a888', gender: 'm', face: 'round', hair: 'medium', top: 'short' }, speed: 3.2, line: '퇴근하고 여기 내려오는 길이 제일 시원해요.' },
];

const RIDERS = [
  { name: '탄천 라이딩 수아', look: { color: '#e17055', hat: '#d63031', pants: '#2d3436', skin: '#f2d0b0', gender: 'f', face: 'round', hair: 'pony', top: 'short' }, bike: '#e74c3c', speed: 5.2, line: '자전거길은 보행이랑 겹치면 벨을 눌러요.' },
  { name: '탄천 라이딩 건우', look: { color: '#0984e3', hat: '#2d3436', pants: '#1e272e', skin: '#e8c4a8', gender: 'm', face: 'square', hair: 'short', top: 'short' }, bike: '#0984e3', speed: 5.8, line: '둔치 바람 맞으면 페달이 가벼워요.' },
  { name: '탄천 라이딩 예린', look: { color: '#00b894', hat: '#ffffff', pants: '#2d3436', skin: '#f6d7c3', gender: 'f', face: 'round', hair: 'long', top: 'short' }, bike: '#00b894', speed: 4.8, line: '다리 지나서 한 번 더 밟을게요.' },
  { name: '탄천 라이딩 시우', look: { color: '#fdcb6e', hat: '#2d3436', pants: '#2d3436', skin: '#c4926e', gender: 'm', face: 'long', hair: 'short', top: 'short' }, bike: '#2d3436', speed: 5.4, line: '출근 전에 여기만 왕복하고 올라가요.' },
];

function tube(mat, a, b, r = 0.03) {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length() || 0.001;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

function createBicycle(color) {
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: '#1c1c1c' });
  const silver = new THREE.MeshLambertMaterial({ color: '#d5d8de' });
  const wheels = [];
  const wheel = (z) => {
    const w = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 6, 16), dark);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8), silver);
    hub.rotation.z = Math.PI / 2;
    w.add(tire, hub);
    w.position.set(0, 0.34, z);
    wheels.push(w);
    return w;
  };
  const rear = [0, 0.34, -0.55], front = [0, 0.34, 0.62];
  const seat = [0, 0.96, -0.16], head = [0, 0.9, 0.48];
  g.add(wheel(-0.55), wheel(0.62));
  g.add(tube(frame, rear, seat, 0.035), tube(frame, rear, [0, 0.42, 0.05], 0.032), tube(frame, [0, 0.42, 0.05], head, 0.038), tube(frame, head, front, 0.03));
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.28), dark);
  saddle.position.set(0, 1.0, -0.16);
  saddle.castShadow = true;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), dark);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.08, 0.5);
  g.add(saddle, bar);
  g.userData.wheels = wheels;
  return g;
}

function pathLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

function pointAt(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + L >= s || i === pts.length - 1) {
      const t = L ? Math.max(0, Math.min(1, (s - acc) / L)) : 0;
      const dx = (pts[i][0] - pts[i - 1][0]) / (L || 1);
      const dz = (pts[i][1] - pts[i - 1][1]) / (L || 1);
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, dx, dz };
    }
    acc += L;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 0, dz: 1 };
}

function onBank(world, pts) {
  let ok = 0, n = 0;
  const step = Math.max(1, Math.floor(pts.length / 8));
  for (let i = 0; i < pts.length; i += step) {
    const y = world.groundY ? world.groundY(pts[i][0], pts[i][1], -6) : 0;
    n++;
    if (y < -4.8 && y > -6.4) ok++;
  }
  return ok >= Math.max(1, n * 0.55);
}

export function addRiversideFolk(scene, overlay, terrain, world, station) {
  const runPath = terrain.bankPath?.(station.x, station.z, 0);
  let ridePath = terrain.bankPath?.(station.x, station.z, 1.6);
  if (!runPath || !onBank(world, runPath)) return { update() {} };
  if (!ridePath || !onBank(world, ridePath)) ridePath = runPath;
  const people = [];
  const place = (who, pts, side, ride) => {
    const len = pathLen(pts);
    const mesh = ride ? new THREE.Group() : createAvatar(who.look);
    let rider = null, bike = null;
    if (ride) {
      bike = createBicycle(who.bike);
      rider = createAvatar(who.look);
      rider.position.y = 0.16;
      mesh.add(bike, rider);
      scene.add(mesh);
    } else scene.add(mesh);
    const tag = overlay.add({ cls: 'tag npc', text: who.name, getPos: () => mesh.position.clone().setY(mesh.position.y + 2.15), maxDist: 48 });
    const bubble = new Bubble(overlay, 'npc', () => mesh.position.clone().setY(mesh.position.y + 2.55), { name: who.name });
    people.push({ who, pts, len, side, ride, mesh, rider, bike, tag, bubble, s: (people.length + 0.5) / (RUNNERS.length + RIDERS.length) * len, dir: people.length % 2 ? 1 : -1, said: 0 });
  };
  RUNNERS.forEach((w) => place(w, runPath, w.speed > 3.2 ? 0.55 : -0.55, false));
  RIDERS.forEach((w, i) => place(w, ridePath, i % 2 ? 0.4 : -0.35, true));

  return {
    update(dt, player) {
      for (const p of people) {
        p.bubble.tick();
        p.said = Math.max(0, p.said - dt);
        const a = pointAt(p.pts, p.s);
        const nx = -a.dz, nz = a.dx;
        const x = a.x + nx * p.side, z = a.z + nz * p.side;
        const y = world.groundY ? world.groundY(x, z, p.mesh.position.y || -6) : 0;
        p.mesh.position.set(x, y, z);
        p.mesh.rotation.y = Math.atan2(a.dx * p.dir, a.dz * p.dir);
        const near = player && Math.hypot(player.x - x, player.z - z) < 6.5;
        if (near && p.said === 0 && !p.bubble.showing) { p.bubble.say(p.who.line, 4200); p.said = 14; }
        if (!near) {
          p.s += p.dir * p.who.speed * dt;
          if (p.s > p.len || p.s < 0) { p.dir *= -1; p.s = Math.max(0, Math.min(p.len, p.s)); }
        }
        if (p.ride) {
          animateRide(p.rider, near ? 0 : p.who.speed, dt);
          const spin = (near ? 0 : p.who.speed) * dt / 0.34;
          for (const w of p.bike.userData.wheels) w.rotation.x -= spin;
        } else animateAvatar(p.mesh, near ? 0 : p.who.speed, dt);
      }
    },
  };
}
