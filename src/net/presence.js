// 프레즌스 어댑터: 같은 인터페이스로 Mock / WebSocket 을 교체할 수 있게 설계
//   presence.on(type, fn)  type: 'welcome' | 'join' | 'leave' | 'state' | 'chat' | 'status'
//   presence.sendState({x,z,ry,moving}) / presence.sendChat(text) / presence.connect(me) / presence.close()
import { STATE_HZ } from './protocol.js';
import { sanitizeLook } from '../look.js';

class Emitter {
  constructor() { this.handlers = {}; }
  on(t, fn) { (this.handlers[t] ||= []).push(fn); return this; }
  emit(t, m) { (this.handlers[t] || []).forEach((fn) => fn(m)); }
}

export const DEFAULT_WS_URL = import.meta.env?.VITE_WS_URL || 'wss://jeongja-phone.xn0texn073.workers.dev/ws';

// 실제 서버용: 기본은 Cloudflare Durable Object(Room) 웹소켓 서버로 연결. ?ws= 로 주소 변경 가능
export class WebSocketPresence extends Emitter {
  constructor(url) {
    super();
    this.url = url;
    this.lastSent = 0;
    this.retry = 1000;
    this.retryTimer = 0;
    this.manualClose = false;
    this.peerIds = new Set();
  }
  _emitCount() {
    this.emit('status', `현재 접속자 ${this.peerIds.size + 1}명`);
  }
  connect(me) {
    this.manualClose = false;
    this.me = me;
    clearTimeout(this.retryTimer);
    this.emit('status', '현재 접속자 확인 중…');
    const ws = (this.ws = new WebSocket(this.url));
    ws.onopen = () => { this.retry = 1000; ws.send(JSON.stringify({ t: 'hello', name: me.name, color: me.color, look: me.look })); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'welcome') {
        this.id = m.id;
        this.peerIds = new Set((m.peers || []).map((p) => p.id).filter(Boolean));
        this._emitCount();
      } else if (m.t === 'join') {
        if (m.peer?.id && m.peer.id !== this.id) this.peerIds.add(m.peer.id);
        this._emitCount();
      } else if (m.t === 'leave') {
        if (m.id) this.peerIds.delete(m.id);
        this._emitCount();
      }
      this.emit(m.t, m);
    };
    ws.onclose = () => {
      if (this.manualClose || this.ws !== ws) return;
      this.peerIds.clear();
      this.emit('status', '연결 끊김 — 재시도 중');
      this.emit('reset');
      this.retryTimer = setTimeout(() => this.connect(me), (this.retry = Math.min(this.retry * 2, 15000)));
    };
  }
  sendState(s) {
    const now = performance.now();
    if (now - this.lastSent < 1000 / STATE_HZ || this.ws?.readyState !== 1) return;
    this.lastSent = now; this.ws.send(JSON.stringify({ t: 'state', ...s }));
  }
  sendChat(text) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'chat', text })); }
  close() {
    this.manualClose = true;
    clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.close(); }
    this.emit('reset');
    this.emit('status', '');
  }
}

// 로컬 목업: 가짜 플레이어 1명이 역 근처를 돌아다니며 가끔 말을 걸고, 내 채팅에 답장함
export class MockPresence extends Emitter {
  constructor({ station }) { super(); this.station = station; this.t = 0; }
  connect(me) {
    clearInterval(this.timer);
    clearTimeout(this.helloTimer);
    this.me = me; this.my = { x: this.station.x, z: this.station.z };
    this.peer = { id: 'mock-1', name: '판교러버', color: '#00b894', look: sanitizeLook({ gender: 'f', face: 'round', hair: 'pony', glasses: true, top: 'hoodie', color: '#00b894' }), x: this.station.x + 12, z: this.station.z - 6, ry: 0 };
    this.helloTimer = setTimeout(() => {
      this.emit('welcome', { t: 'welcome', id: 'me', peers: [] });
      this.emit('join', { t: 'join', peer: this.peer });
      this.emit('status', '현재 접속자 2명');
    }, 300);
    this.timer = setInterval(() => this._tick(), 1000 / STATE_HZ);
    this.lines = ['안녕하세요! 정자역 처음 오셨어요?', '여기 지도 OSM 데이터로 만든 거래요 ㅋㅋ', '탄천 쪽으로 같이 산책 가실래요?', '저는 판교 출근인데 정자에서 놀아요 😎'];
    this.li = 0; this.nextTalk = 4;
  }
  _tick() {
    const dt = 1 / STATE_HZ; this.t += dt;
    // 플레이어 주변을 크게 원을 그리며 서성임
    const R = 9, cx = this.my.x, cz = this.my.z;
    const tx = cx + Math.cos(this.t * 0.25) * R, tz = cz + Math.sin(this.t * 0.25) * R;
    const dx = tx - this.peer.x, dz = tz - this.peer.z, L = Math.hypot(dx, dz);
    const step = Math.min(L, 2.2 * dt);
    const wait = L > 0.05 && this.guard && this.guard(this.peer.x, this.peer.z, dx / L, dz / L);
    if (!wait && L > 0.01) { this.peer.x += (dx / L) * step; this.peer.z += (dz / L) * step; this.peer.ry = Math.atan2(dx, dz); }
    this.emit('state', { t: 'state', id: this.peer.id, x: this.peer.x, z: this.peer.z, ry: this.peer.ry, moving: !wait && step > 0.05 });
    this.nextTalk -= dt;
    if (this.nextTalk <= 0) { this.emit('chat', { t: 'chat', id: this.peer.id, text: this.lines[this.li++ % this.lines.length] }); this.nextTalk = 12; }
  }
  setGuard(fn) { this.guard = fn; }
  sendState(s) { this.my = { x: s.x, z: s.z }; }
  sendChat(text) {
    const reply = /안녕|하이|hi|hello/i.test(text) ? '반가워요! 👋' : /탄천/.test(text) ? '탄천 좋죠! 오리 보러 가요 🦆' : /네이버/.test(text) ? '1784 사옥 로봇 보셨어요?' : 'ㅋㅋㅋ 그러게요!';
    setTimeout(() => this.emit('chat', { t: 'chat', id: this.peer.id, text: reply }), 1200);
  }
  close() {
    clearInterval(this.timer);
    clearTimeout(this.helloTimer);
    this.timer = null;
    this.helloTimer = null;
    this.emit('reset');
    this.emit('status', '');
  }
}

export function createPresence({ station }) {
  const params = new URLSearchParams(location.search);
  const wsParam = params.get('ws');
  if (wsParam === 'mock' || wsParam === 'off' || (params.has('shot') && !wsParam)) {
    return new MockPresence({ station });
  }
  const url = wsParam === 'local' ? 'ws://127.0.0.1:8787' : (wsParam || DEFAULT_WS_URL);
  return new WebSocketPresence(url);
}
