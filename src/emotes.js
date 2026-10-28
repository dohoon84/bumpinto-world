import * as THREE from 'three';

export const EMOTE_LIST = [
  {
    id: 'cheer',
    digit: '1',
    code: 'Digit1',
    icon: '🙌',
    label: '만세',
    enLabel: 'Cheer',
    emojis: ['🎉', '🙌', '✨', '🎊'],
    colors: ['#ffd43b', '#ff6b6b', '#4dabf7', '#69db7c'],
  },
  {
    id: 'fuss',
    digit: '2',
    code: 'Digit2',
    icon: '🤪',
    label: '호들갑',
    enLabel: 'Hype',
    emojis: ['🚨', '🔥', '😱', '💥', '⚡'],
    colors: ['#ff3b30', '#ff9500', '#ffe169', '#ff2d55'],
  },
  {
    id: 'dance',
    digit: '3',
    code: 'Digit3',
    icon: '💃',
    label: '댄스',
    enLabel: 'Dance',
    emojis: ['🎵', '🪩', '🕺', '💃', '🎶'],
    colors: ['#cc5de8', '#845ef7', '#3bc9db', '#ffe066'],
  },
  {
    id: 'clap',
    digit: '4',
    code: 'Digit4',
    icon: '👏',
    label: '박수',
    enLabel: 'Clap',
    emojis: ['👏', '👍', '💯', '✨'],
    colors: ['#20c997', '#ffd43b', '#38d9a9', '#ffffff'],
  },
  {
    id: 'love',
    digit: '5',
    code: 'Digit5',
    icon: '❤️',
    label: '하트',
    enLabel: 'Love',
    emojis: ['❤️', '💖', '🥰', '😍', '💕'],
    colors: ['#ff4d6d', '#ff758f', '#ffb3c1', '#ffe5ec'],
  },
  {
    id: 'lol',
    digit: '6',
    code: 'Digit6',
    icon: '🤣',
    label: '폭소',
    enLabel: 'LOL',
    emojis: ['🤣', '😂', 'ㅋㅋㅋ', '⚡'],
    colors: ['#fcc419', '#ff922b', '#ffe066', '#fff3bf'],
  },
];

export const EMOTE_BY_ID = Object.fromEntries(EMOTE_LIST.map((e) => [e.id, e]));
export const EMOTE_BY_CODE = Object.fromEntries(EMOTE_LIST.map((e) => [e.code, e]));

export function isShoutText(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  return /!{2,}|！{2,}|\?!|!\?|ㅋ{3,}|ㅎ{3,}|ㄷ{3,}|와아+|대박|미쳤|호들갑|가즈아/.test(s);
}

const confettiGeo = new THREE.BoxGeometry(0.11, 0.11, 0.03);
const matMap = new Map();
function colorMat(hex) {
  if (!matMap.has(hex)) {
    matMap.set(hex, new THREE.MeshBasicMaterial({ color: hex }));
  }
  return matMap.get(hex);
}

export class EmoteFX {
  constructor(scene, overlayRoot, camera) {
    this.scene = scene;
    this.root = overlayRoot;
    this.camera = camera;
    this.particles3d = [];
    this.floaters2d = [];
    this.proj = new THREE.Vector3();
  }

  burst(originPos, emoteId = 'cheer', combo = 1) {
    if (!originPos) return;
    const def = EMOTE_BY_ID[emoteId] || EMOTE_LIST[0];
    const camDist = this.camera.position.distanceTo(originPos);
    if (camDist > 85) return;

    // 1) 3D 컨페티/폭죽 파티클 생성
    const count3d = Math.min(26, 10 + combo * 3);
    for (let i = 0; i < count3d; i++) {
      const col = def.colors[i % def.colors.length];
      const mesh = new THREE.Mesh(confettiGeo, colorMat(col));
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * (2.2 + Math.min(2.5, combo * 0.35));
      mesh.position.set(
        originPos.x + (Math.random() - 0.5) * 0.4,
        originPos.y + 2.0 + Math.random() * 0.35,
        originPos.z + (Math.random() - 0.5) * 0.4,
      );
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(mesh);
      this.particles3d.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 3.2 + Math.random() * (2.6 + Math.min(2.0, combo * 0.3)),
        vz: Math.sin(angle) * speed,
        rx: (Math.random() - 0.5) * 14,
        ry: (Math.random() - 0.5) * 14,
        rz: (Math.random() - 0.5) * 14,
        age: 0,
        life: 0.85 + Math.random() * 0.45,
      });
    }

    // 2) 2D 화면 투영 이모지 분수 생성
    const count2d = Math.min(7, 3 + Math.floor(combo / 2));
    for (let i = 0; i < count2d; i++) {
      const el = document.createElement('div');
      el.className = 'emote-floater';
      const emoji = def.emojis[Math.floor(Math.random() * def.emojis.length)];
      el.textContent = emoji;
      this.root.appendChild(el);
      this.floaters2d.push({
        el,
        pos: new THREE.Vector3(
          originPos.x + (Math.random() - 0.5) * 0.7,
          originPos.y + 2.35 + Math.random() * 0.25,
          originPos.z + (Math.random() - 0.5) * 0.7,
        ),
        vy: 1.4 + Math.random() * 1.1,
        swayAmp: 12 + Math.random() * 16,
        swayFreq: 5 + Math.random() * 4,
        swayPhase: Math.random() * Math.PI * 2,
        scale: (0.95 + Math.random() * 0.35) * (1 + Math.min(0.45, (combo - 1) * 0.08)),
        age: -i * 0.055,
        life: 1.15 + Math.random() * 0.3,
      });
    }

    // 3) 연타 콤보(3연타 이상)일 때 호들갑 콤보 배지 팝업
    if (combo >= 3) {
      const badge = document.createElement('div');
      badge.className = 'emote-combo-pop';
      badge.textContent = `${def.icon} ${def.label} x${combo}!!`;
      this.root.appendChild(badge);
      this.floaters2d.push({
        el: badge,
        pos: new THREE.Vector3(originPos.x, originPos.y + 2.85, originPos.z),
        vy: 0.9,
        swayAmp: 0,
        swayFreq: 0,
        swayPhase: 0,
        scale: Math.min(1.45, 1 + combo * 0.05),
        age: 0,
        life: 0.95,
      });
    }
  }

  spawnZzz(originPos) {
    if (!originPos) return;
    if (this.camera.position.distanceTo(originPos) > 70) return;
    const el = document.createElement('div');
    el.className = 'emote-floater zzz';
    el.textContent = Math.random() < 0.5 ? '💤' : 'Zzz';
    this.root.appendChild(el);
    this.floaters2d.push({
      el,
      pos: new THREE.Vector3(
        originPos.x + (Math.random() - 0.5) * 0.25,
        originPos.y + 1.55,
        originPos.z + (Math.random() - 0.5) * 0.25,
      ),
      vy: 0.55,
      swayAmp: 10,
      swayFreq: 2.6,
      swayPhase: Math.random() * Math.PI * 2,
      scale: 0.78,
      age: 0,
      life: 1.8,
    });
  }

  update(dt, w, h) {
    // 3D 파티클 업데이트
    for (let i = this.particles3d.length - 1; i >= 0; i--) {
      const p = this.particles3d[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.mesh);
        this.particles3d.splice(i, 1);
        continue;
      }
      p.vy -= 9.8 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.y += p.ry * dt;
      p.mesh.rotation.z += p.rz * dt;
      const remain = 1 - p.age / p.life;
      p.mesh.scale.setScalar(Math.max(0.1, remain));
    }

    // 2D 이모지 분수 업데이트
    for (let i = this.floaters2d.length - 1; i >= 0; i--) {
      const f = this.floaters2d[i];
      f.age += dt;
      if (f.age < 0) {
        f.el.style.display = 'none';
        continue;
      }
      if (f.age >= f.life) {
        f.el.remove();
        this.floaters2d.splice(i, 1);
        continue;
      }
      f.pos.y += f.vy * dt;
      this.proj.copy(f.pos).project(this.camera);
      const visible =
        this.proj.z < 1 &&
        this.proj.z > -1 &&
        Math.abs(this.proj.x) < 1.2 &&
        Math.abs(this.proj.y) < 1.2;
      if (!visible) {
        f.el.style.display = 'none';
        continue;
      }
      f.el.style.display = '';
      const k = f.age / f.life;
      const popScale = k < 0.18 ? (k / 0.18) * 1.2 : 1.2 - (k - 0.18) * 0.35;
      const opacity = k > 0.65 ? Math.max(0, 1 - (k - 0.65) / 0.35) : 1;
      const swayX = Math.sin(f.age * f.swayFreq + f.swayPhase) * f.swayAmp;
      const sx = ((this.proj.x + 1) / 2) * w + swayX;
      const sy = ((1 - this.proj.y) / 2) * h;
      f.el.style.opacity = opacity.toFixed(2);
      f.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${(popScale * f.scale).toFixed(2)})`;
    }
  }
}
