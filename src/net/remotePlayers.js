// 원격 플레이어(다른 접속자)를 아바타로 렌더링 + 근접 채팅 말풍선 + 카카오바이크 탑승 동기화
import * as THREE from 'three';
import { createAvatar, animateAvatar, animateRide, clearRidePose } from '../entities/avatar.js';
import { createKakaoBike } from '../entities/bike.js';
import { sanitizeLook } from '../look.js';
import { Bubble } from '../overlay.js';
import { CHAT_RADIUS } from './protocol.js';

const RIDE_Y = 0.16;
const RIDE_BACK = 0.12;

export class RemotePlayers {
  constructor(scene, overlay, presence, getMe, onMyChat, groundY = null, emoteFx = null) {
    this.groundY = groundY; // [terrain] (x, z, refY) -> 지면 높이 (탄천 둔치/계단/다리)
    this.emoteFx = emoteFx;
    this.scene = scene; this.overlay = overlay; this.peers = new Map(); this.getMe = getMe;
    presence.on('welcome', (m) => { this.myId = m.id; m.peers.forEach((p) => this.add(p)); });
    presence.on('join', (m) => this.add(m.peer));
    presence.on('leave', (m) => this.remove(m.id));
    presence.on('reset', () => [...this.peers.keys()].forEach((id) => this.remove(id)));
    presence.on('state', (m) => {
      const p = this.peers.get(m.id);
      if (!p) return;
      p.target.set(m.x, this.groundY ? this.groundY(m.x, m.z, p.target.y) : 0, m.z); // [terrain]
      p.ry = m.ry;
      p.targetJy = Math.max(0, Number(m.jy) || 0);
      p.riding = !!m.riding;
      p.sit = typeof m.sit === 'string' ? m.sit : '';
      p.afk = !!m.afk;
      p.umb = typeof m.umb === 'string' ? m.umb : (m.umb ? 'yellow' : '');
      if (typeof m.emote === 'string') {
        p.emote = m.emote;
        if (m.emote) p.emoteUntil = performance.now() + 1500;
      }
    });
    presence.on('emote', (m) => {
      const p = this.peers.get(m.id);
      if (!p) return;
      p.emote = m.kind || 'cheer';
      p.emoteUntil = performance.now() + 3400;
      this.emoteFx?.burst(p.mesh.position, p.emote, m.combo || 1);
    });
    presence.on('chat', (m) => {
      if (m.id === this.myId || m.id === 'me') return onMyChat?.(m.text);
      const p = this.peers.get(m.id); if (!p) return;
      const me = getMe();
      if (Math.hypot(me.x - p.mesh.position.x, me.z - p.mesh.position.z) <= CHAT_RADIUS) {
        p.bubble.say(m.text, 6000); // 근접 채팅
        if (p.bubble.item.el.classList.contains('shouting')) {
          this.emoteFx?.burst(p.mesh.position, 'fuss', 2);
        }
      }
    });
  }
  add(peer) {
    if (this.peers.has(peer.id) || peer.id === this.myId) return;
    const look = sanitizeLook({ color: peer.color || '#00b894', hair: 'short', top: 'hoodie', ...(peer.look || {}) });
    if (!peer.look) look.hat = '#ffffff';
    const mesh = createAvatar(look);
    const y0 = this.groundY ? this.groundY(peer.x || 0, peer.z || 0, 0) : 0;
    mesh.position.set(peer.x || 0, y0, peer.z || 0); this.scene.add(mesh); // [terrain]
    const bikeMesh = createKakaoBike();
    bikeMesh.visible = false;
    const stand = bikeMesh.getObjectByName('stand');
    if (stand) stand.visible = false;
    this.scene.add(bikeMesh);
    const p = {
      id: peer.id,
      name: peer.name || '손님',
      color: look.color || '#20c997',
      mesh,
      bikeMesh,
      wheelF: bikeMesh.getObjectByName('wheelF'),
      wheelR: bikeMesh.getObjectByName('wheelR'),
      crank: bikeMesh.getObjectByName('crank'),
      pos: new THREE.Vector3(peer.x || 0, y0, peer.z || 0),
      target: new THREE.Vector3(peer.x || 0, y0, peer.z || 0),
      ry: peer.ry || 0,
      jy: 0,
      targetJy: 0,
      riding: !!peer.riding,
      sit: peer.sit || '',
      afk: !!peer.afk,
      umb: typeof peer.umb === 'string' ? peer.umb : (peer.umb ? 'yellow' : ''),
      wasRiding: false,
    };
    p.tag = this.overlay.add({ cls: 'tag remote', text: peer.name || '손님', getPos: () => mesh.position.clone().setY(mesh.position.y + (p.sit || p.afk ? 1.55 : 2.05)), maxDist: 80 }); // [terrain]
    p.bubble = new Bubble(this.overlay, 'remote', () => mesh.position.clone().setY(mesh.position.y + (p.sit || p.afk ? 2.15 : 2.7)), { name: p.name, color: p.color, id: p.id }); // [terrain]
    this.peers.set(peer.id, p);
  }
  list() {
    const out = [];
    for (const p of this.peers.values()) {
      out.push({
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.pos.x,
        y: p.pos.y,
        z: p.pos.z,
        ry: p.mesh.rotation.y,
        riding: p.riding,
        sit: p.sit,
        afk: p.afk,
      });
    }
    return out;
  }
  remove(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.scene.remove(p.mesh);
    if (p.bikeMesh) this.scene.remove(p.bikeMesh);
    this.overlay.remove(p.tag);
    this.overlay.remove(p.bubble.item);
    this.peers.delete(id);
  }
  update(dt) {
    for (const p of this.peers.values()) {
      const beforeX = p.pos.x, beforeZ = p.pos.z;
      p.pos.lerp(p.target, Math.min(1, dt * 8)); // 10Hz 상태를 부드럽게 보간
      const sp = Math.hypot(p.pos.x - beforeX, p.pos.z - beforeZ) / Math.max(dt, 1e-3);
      p.mesh.rotation.y += Math.atan2(Math.sin(p.ry - p.mesh.rotation.y), Math.cos(p.ry - p.mesh.rotation.y)) * Math.min(1, dt * 8);
      p.jy += ((p.targetJy || 0) - p.jy) * Math.min(1, dt * 14);
      if (p.jy < 0.01) p.jy = 0;

      if (p.riding) {
        p.wasRiding = true;
        const ry = p.mesh.rotation.y;
        p.bikeMesh.visible = true;
        p.bikeMesh.position.set(p.pos.x + Math.sin(ry) * RIDE_BACK, p.pos.y + p.jy, p.pos.z + Math.cos(ry) * RIDE_BACK);
        p.bikeMesh.rotation.y = ry;
        p.mesh.position.set(p.pos.x, p.pos.y + RIDE_Y + p.jy, p.pos.z);
        p.mesh.userData.jumpY = 0;
        animateRide(p.mesh, sp, dt);
        const a = (sp * dt) / 0.34;
        if (p.wheelF) p.wheelF.rotation.x += a;
        if (p.wheelR) p.wheelR.rotation.x += a;
        if (p.crank) p.crank.rotation.x += a * 2.4;
      } else {
        if (p.wasRiding) {
          p.wasRiding = false;
          p.bikeMesh.visible = false;
          clearRidePose(p.mesh);
        }
        p.mesh.position.set(p.pos.x, p.pos.y + p.jy, p.pos.z);
        p.mesh.userData.jumpY = p.jy;
        if (p.emoteUntil && performance.now() > p.emoteUntil) {
          p.emote = '';
          p.emoteUntil = 0;
        }
        p.mesh.userData.emote = p.emote || '';
        p.mesh.userData.sit = p.sit || '';
        p.mesh.userData.afk = !!p.afk;
        p.mesh.userData.umbrella = p.umb || '';
        const wantTag = p.afk ? `${p.name} 💤 자리비움` : p.name;
        if (p.tag.el.textContent !== wantTag) {
          p.tag.el.textContent = wantTag;
          p.tag.el.classList.toggle('is-afk', !!p.afk);
        }
        if (p.afk) {
          p.zzzTimer = (p.zzzTimer || 0) - dt;
          if (p.zzzTimer <= 0) {
            p.zzzTimer = 1.6;
            this.emoteFx?.spawnZzz(p.mesh.position);
          }
        }
        animateAvatar(p.mesh, sp, dt);
      }
      p.bubble.tick();
    }
  }
}
