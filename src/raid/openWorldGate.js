// 오픈월드 탄천합수부 근처에서만 보이는 균열 개찰. 기본 탐험은 건드리지 않는다.
// 좌표는 landmarkBounds 의 탄천합수부 스폰과 같다.
import * as THREE from 'three';

const HAP = { x: -3685.8, z: -16796.5 };

export function mountOpenWorldRaidGate({ scene, getPlayer }) {
  let gate = null;
  let toast = null;
  let shown = false;

  function ensureToast() {
    if (toast) return toast;
    const el = document.createElement('div');
    el.id = 'bw-raid-gate';
    el.innerHTML = `
      <b>균열 개찰 · 탄천합수부</b>
      <span>등급 C · 홀드</span>
      <button type="button">들어가기</button>
    `;
    // 위치·여백은 style.css 의 #bw-raid-gate (리액션 바 위, 8px). 여기선 문구만.
    document.body.appendChild(el);
    el.querySelector('button').onclick = () => {
      const url = new URL(location.href);
      url.searchParams.set('raid', 'tancheon');
      location.assign(url.toString());
    };
    toast = el;
    return el;
  }

  function ensureGate(y) {
    if (gate) return;
    gate = new THREE.Group();
    gate.name = 'tancheon-rift-gate';
    const mat = new THREE.MeshBasicMaterial({ color: '#ffe14a' });
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.1, 0.18), mat);
    postL.position.set(-1.5, 1.55, 0);
    const postR = postL.clone();
    postR.position.x = 1.5;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.16, 0.16), mat);
    lintel.position.y = 3.05;
    const veil = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 2.8),
      new THREE.MeshBasicMaterial({ color: '#7a4ad4', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    );
    veil.position.y = 1.5;
    gate.add(postL, postR, lintel, veil);
    gate.position.set(HAP.x, y, HAP.z);
    scene.add(gate);
  }

  return {
    tick() {
      const player = getPlayer?.();
      if (!player) return;
      const dx = player.position.x - HAP.x;
      const dz = player.position.z - HAP.z;
      const d = Math.hypot(dx, dz);
      if (d < 80) ensureGate(player.position.y);
      if (d < 14) {
        const el = ensureToast();
        el.hidden = false;
        shown = true;
      } else if (shown && toast) toast.hidden = true;
    },
  };
}
