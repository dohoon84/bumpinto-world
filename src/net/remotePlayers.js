// 원격 플레이어(다른 접속자)를 아바타로 렌더링 + 근접 채팅 말풍선
import * as THREE from 'three';
import { createAvatar, animateAvatar } from '../entities/avatar.js';
import { sanitizeLook } from '../look.js';
import { Bubble } from '../overlay.js';
import { CHAT_RADIUS } from './protocol.js';

export class RemotePlayers {
  constructor(scene, overlay, presence, getMe, onMyChat, groundY = null) {
    this.groundY = groundY; // [terrain] (x, z, refY) -> 지면 높이 (탄천 둔치/계단/다리)
    this.scene = scene; this.overlay = overlay; this.peers = new Map(); this.getMe = getMe;
    presence.on('welcome', (m) => { this.myId = m.id; m.peers.forEach((p) => this.add(p)); });
    presence.on('join', (m) => this.add(m.peer));
    presence.on('leave', (m) => this.remove(m.id));
    presence.on('reset', () => [...this.peers.keys()].forEach((id) => this.remove(id)));
    presence.on('state', (m) => { const p = this.peers.get(m.id); if (p) { p.target.set(m.x, this.groundY ? this.groundY(m.x, m.z, p.target.y) : 0, m.z); /* [terrain] */ p.ry = m.ry; } });
    presence.on('chat', (m) => {
      if (m.id === this.myId || m.id === 'me') return onMyChat?.(m.text);
      const p = this.peers.get(m.id); if (!p) return;
      const me = getMe();
      if (Math.hypot(me.x - p.mesh.position.x, me.z - p.mesh.position.z) <= CHAT_RADIUS) p.bubble.say(m.text, 6000); // 근접 채팅
    });
  }
  add(peer) {
    if (this.peers.has(peer.id) || peer.id === this.myId) return;
    const look = sanitizeLook({ color: peer.color || '#00b894', hair: 'short', top: 'hoodie', ...(peer.look || {}) });
    if (!peer.look) look.hat = '#ffffff';
    const mesh = createAvatar(look);
    mesh.position.set(peer.x || 0, this.groundY ? this.groundY(peer.x || 0, peer.z || 0, 0) : 0, peer.z || 0); this.scene.add(mesh); // [terrain]
    const p = { id: peer.id, name: peer.name || '손님', color: look.color || '#20c997', mesh, target: mesh.position.clone(), ry: peer.ry || 0 };
    p.tag = this.overlay.add({ cls: 'tag remote', text: peer.name || '손님', getPos: () => mesh.position.clone().setY(mesh.position.y + 2.05), maxDist: 80 }); // [terrain]
    p.bubble = new Bubble(this.overlay, 'remote', () => mesh.position.clone().setY(mesh.position.y + 2.7), { name: p.name, color: p.color, id: p.id }); // [terrain]
    this.peers.set(peer.id, p);
  }
  list() {
    const out = [];
    for (const p of this.peers.values()) {
      out.push({
        id: p.id,
        name: p.name,
        color: p.color,
        x: p.mesh.position.x,
        y: p.mesh.position.y,
        z: p.mesh.position.z,
        ry: p.mesh.rotation.y,
      });
    }
    return out;
  }
  remove(id) { const p = this.peers.get(id); if (!p) return; this.scene.remove(p.mesh); this.overlay.remove(p.tag); this.overlay.remove(p.bubble.item); this.peers.delete(id); }
  update(dt) {
    for (const p of this.peers.values()) {
      const before = p.mesh.position.clone();
      p.mesh.position.lerp(p.target, Math.min(1, dt * 8)); // 10Hz 상태를 부드럽게 보간
      const sp = before.distanceTo(p.mesh.position) / Math.max(dt, 1e-3);
      p.mesh.rotation.y += Math.atan2(Math.sin(p.ry - p.mesh.rotation.y), Math.cos(p.ry - p.mesh.rotation.y)) * Math.min(1, dt * 8);
      animateAvatar(p.mesh, sp, dt); p.bubble.tick();
    }
  }
}
