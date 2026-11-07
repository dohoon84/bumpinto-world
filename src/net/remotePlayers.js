// 원격 플레이어(다른 접속자)를 아바타로 렌더링 + 근접 채팅 말풍선 + 카카오바이크 탑승 동기화
import * as THREE from 'three';
import { createAvatar, animateAvatar, animateRide, clearRidePose } from '../entities/avatar.js';
import { createKakaoBike } from '../entities/bike.js';
import { sanitizeLook } from '../look.js';
import { Bubble } from '../overlay.js';
import { paintTitleTag } from '../titles/nametag.js'; // [titles]
import { CHAT_RADIUS } from './protocol.js';
import { decodeZone } from './zones.js';

const RIDE_Y = 0.16;
const RIDE_BACK = 0.12;
// [zone] 바깥에서 본 사람이 역으로 들어가거나 나올 때: 그 자리에서 계단으로 내려가듯 가라앉거나 올라온다
const ZONE_FX_SEC = 0.7;
const ZONE_FX_DEPTH = 1.9;
const ELSEWHERE = '#elsewhere'; // 오버레이 구역과 절대 같지 않은 값 → 이름표·말풍선 숨김

export class RemotePlayers {
  constructor(scene, overlay, presence, getMe, onMyChat, groundY = null, emoteFx = null) {
    this.groundY = groundY; // [terrain] (x, z, refY) -> 지면 높이 (탄천 둔치/계단/다리)
    this.emoteFx = emoteFx;
    this.scene = scene; this.overlay = overlay; this.peers = new Map(); this.getMe = getMe;
    // [zone] 내가 있는 구역('' = 바깥)과 그 구역 Scene. 같은 구역 사람만 보이고, 말풍선·리액션도 같은 구역끼리만.
    this.zone = '';
    this.homeScene = scene;
    this.viewScene = scene;
    presence.on('welcome', (m) => { this.myId = m.id; m.peers.forEach((p) => this.add(p)); });
    presence.on('join', (m) => this.add(m.peer));
    presence.on('leave', (m) => this.remove(m.id));
    presence.on('reset', () => [...this.peers.keys()].forEach((id) => this.remove(id)));
    presence.on('state', (m) => {
      const p = this.peers.get(m.id);
      if (!p) return;
      const at = decodeZone(m.x, m.z, m.zone); // [zone] 실내면 실내 좌표
      p.target.set(at.x, at.zone ? 0 : (this.groundY ? this.groundY(at.x, at.z, p.target.y) : 0), at.z); // [terrain]
      p.ry = m.ry;
      if (at.zone !== p.zone) this._zoneChanged(p, at.zone); // [zone]
      p.targetJy = Math.max(0, Number(m.jy) || 0);
      p.riding = !!m.riding;
      p.sit = typeof m.sit === 'string' ? m.sit : '';
      p.afk = !!m.afk;
      p.umb = typeof m.umb === 'string' ? m.umb : (m.umb ? 'yellow' : '');
      if (typeof m.title === 'string') p.title = m.title;
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
      if (p.zone === this.zone) this.emoteFx?.burst(p.mesh.position, p.emote, m.combo || 1); // [zone]
    });
    presence.on('chat', (m) => {
      if (m.id === this.myId || m.id === 'me') return onMyChat?.(m.text);
      const p = this.peers.get(m.id); if (!p) return;
      if (p.zone !== this.zone) return; // [zone] 다른 구역(역 안 ↔ 바깥) 말은 안 들림
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
    const at = decodeZone(peer.x, peer.z, peer.zone); // [zone]
    const y0 = !at.zone && this.groundY ? this.groundY(at.x, at.z, 0) : 0;
    mesh.position.set(at.x, y0, at.z); // [terrain]
    this.scene.add(mesh); // 씬 추가는 주석 줄에 붙이지 않는다. 주석에 가려지면 원격 아바타가 안 보인다.
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
      pos: new THREE.Vector3(at.x, y0, at.z),
      target: new THREE.Vector3(at.x, y0, at.z),
      zone: at.zone, // [zone]
      fx: null,
      ry: peer.ry || 0,
      jy: 0,
      targetJy: 0,
      riding: !!peer.riding,
      sit: peer.sit || '',
      afk: !!peer.afk,
      umb: typeof peer.umb === 'string' ? peer.umb : (peer.umb ? 'yellow' : ''),
      title: typeof peer.title === 'string' ? peer.title : '',
      wasRiding: false,
    };
    p.tag = this.overlay.add({ cls: 'tag remote', text: peer.name || '손님', getPos: () => mesh.position.clone().setY(mesh.position.y + (p.sit || p.afk ? 1.55 : 2.05)), maxDist: 80 }); // [terrain]
    p.bubble = new Bubble(this.overlay, 'remote', () => mesh.position.clone().setY(mesh.position.y + (p.sit || p.afk ? 2.15 : 2.7)), { name: p.name, color: p.color, id: p.id }); // [terrain]
    this.peers.set(peer.id, p);
    this._place(p);
  }
  // [zone] 내 구역이 바뀜 (지하철 대합실에 들어가면 그 Scene, 나오면 '' + 바깥 Scene)
  setZone(zone = '', scene = null) {
    this.zone = zone || '';
    this.viewScene = (this.zone && scene) || this.homeScene;
    for (const p of this.peers.values()) {
      p.fx = null;
      p.pos.copy(p.target);
      this._place(p);
    }
  }
  _zoneChanged(p, zone) {
    const from = p.zone;
    p.zone = zone;
    // 바깥에서 지켜보던 사람: 들어가는 사람은 그 자리(입구 계단)에서 가라앉고, 나오는 사람은 출구 앞에서 올라온다
    p.fx = !this.zone && (!from || !zone)
      ? { t: 0, down: !!zone, x: zone ? p.mesh.position.x : p.target.x, y: zone ? p.pos.y : p.target.y, z: zone ? p.mesh.position.z : p.target.z }
      : null;
    if (p.fx && !p.fx.down) p.mesh.rotation.y = p.ry;
    p.pos.copy(p.target); // 구역이 바뀌면 보간 없이 순간이동 (바깥 ↔ 실내 좌표가 섞이지 않게)
    this._place(p);
  }
  // 구역에 맞춰 Scene·보이기·이름표/말풍선 구역 정리
  _place(p) {
    const here = p.zone === this.zone;
    const parent = here ? this.viewScene : this.homeScene;
    if (p.mesh.parent !== parent) parent.add(p.mesh);
    p.mesh.visible = here || !!p.fx;
    if (!here && p.bikeMesh) p.bikeMesh.visible = false;
    const tagZone = here ? this.zone : ELSEWHERE;
    p.tag.zone = tagZone;
    p.bubble.item.zone = tagZone;
  }
  // 기본: 나와 같은 구역 사람만 (바깥 시스템들 — 문, 고양이, 미니맵, 버스 — 이 실내 좌표를 바깥 좌표로 오해하지 않게).
  // { all: true } 이면 모두 (zone 포함, 실내 사람은 실내 좌표)
  list({ all = false } = {}) {
    const out = [];
    for (const p of this.peers.values()) {
      if (!all && p.zone !== this.zone) continue;
      out.push({
        zone: p.zone,
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
        title: p.title || '',
        tagY: p.mesh.position.y + (p.sit || p.afk ? 1.55 : 2.05),
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
      if (p.fx) { this._tickZoneFx(p, dt); p.bubble.tick(); continue; } // [zone]
      if (p.zone !== this.zone) { p.bubble.tick(); continue; } // [zone] 다른 구역: 안 보이니 애니메이션도 생략
      const beforeX = p.pos.x, beforeZ = p.pos.z;
      p.pos.lerp(p.target, Math.min(1, dt * 8)); // 10Hz 상태를 부드럽게 보간
      const sp = Math.hypot(p.pos.x - beforeX, p.pos.z - beforeZ) / Math.max(dt, 1e-3);
      p.mesh.rotation.y += Math.atan2(Math.sin(p.ry - p.mesh.rotation.y), Math.cos(p.ry - p.mesh.rotation.y)) * Math.min(1, dt * 8);
      p.jy += ((p.targetJy || 0) - p.jy) * Math.min(1, dt * 14);
      if (p.jy < 0.01) p.jy = 0;
      if (!p.zone && this.rideHook && this.rideHook(p, dt, sp)) { p.bubble.tick(); continue; } // [ride] 버스·택시 좌석(코리더에서만 설정됨)

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
        paintTitleTag(p.tag.el, {
          name: p.name,
          afk: !!p.afk,
          titleId: p.title || '',
          afkText: '자리비움',
          lite: Math.hypot((this.getMe()?.x || 0) - p.mesh.position.x, (this.getMe()?.z || 0) - p.mesh.position.z) > 16,
        });
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
  _tickZoneFx(p, dt) {
    const f = p.fx;
    f.t += dt;
    const k = Math.min(1, f.t / ZONE_FX_SEC);
    const e = f.down ? k * k : 1 - (1 - k) * (1 - k);
    p.mesh.position.set(f.x, f.y - ZONE_FX_DEPTH * (f.down ? e : 1 - e), f.z);
    p.mesh.userData.emote = '';
    p.mesh.userData.sit = '';
    p.mesh.userData.afk = false;
    animateAvatar(p.mesh, 1.2, dt);
    if (k >= 1) {
      p.fx = null;
      this._place(p);
    }
  }
}
