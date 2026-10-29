// 프레즌스 어댑터: 같은 인터페이스로 Mock / WebSocket 을 교체할 수 있게 설계
//   presence.on(type, fn)  type: 'welcome' | 'join' | 'leave' | 'state' | 'chat' | 'status'
//   presence.sendState({x,z,ry,moving}) / presence.sendChat(text) / presence.connect(me) / presence.close()
import { STATE_HZ } from './protocol.js';
import { sanitizeLook } from '../look.js';
import { deviceId } from '../sms.js';

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
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try { old.onclose = null; old.close(); } catch {}
    }
    this.manualClose = false;
    this.me = me;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    this.emit('status', '현재 접속자 확인 중…');
    const ws = (this.ws = new WebSocket(this.url));
    ws.onopen = () => {
      this.retry = 1000;
      ws.send(JSON.stringify({ t: 'hello', deviceId: deviceId(), name: me.name, color: me.color, look: me.look }));
      this.pingTimer = setInterval(() => {
        if (this.ws === ws && ws.readyState === 1) {
          try { ws.send(JSON.stringify({ t: 'ping' })); } catch {}
        }
      }, 15000);
    };
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
    ws.onclose = (ev) => {
      clearInterval(this.pingTimer);
      if (this.manualClose || this.ws !== ws) return;
      this.peerIds.clear();
      this.emit('reset');
      // 다른 탭에서 같은 캐릭터로 새로 접속해 대체된 경우(4001): 백그라운드 탭에서 무한 재접속 핑퐁을 막고, 다시 포커스될 때만 재연결
      if (ev?.code === 4001) {
        this.emit('status', '다른 탭에서 접속 중');
        const onFocus = () => {
          removeEventListener('focus', onFocus);
          if (!this.manualClose) this.connect(me);
        };
        addEventListener('focus', onFocus);
        return;
      }
      this.emit('status', '연결 끊김 — 재시도 중');
      this.retryTimer = setTimeout(() => this.connect(me), (this.retry = Math.min(this.retry * 2, 15000)));
    };
  }
  sendState(s, force = false) {
    if (this.ws?.readyState !== 1) return;
    const now = performance.now();
    const jy = Number(s.jy) || 0;
    const em = s.emote || '';
    const sit = s.sit || '';
    const afk = s.afk ? 1 : 0;
    const umb = s.umb || '';
    const vehId = s.veh ? s.veh.id : -1;
    const vehSig = s.veh ? `${s.veh.id},${s.veh.ry},${s.veh.v},${s.veh.st},${s.veh.wh || 0},${s.veh.pk || 0},${s.veh.x ?? ''},${s.veh.z ?? ''}` : '';
    const discreteSig = `${s.riding ? 1 : 0},${em},${sit},${afk},${umb},${vehId},${s.veh?.pk ? 1 : 0}`;
    const discreteChanged = discreteSig !== this.lastDiscreteSig;
    if (!force && !discreteChanged && now - this.lastSent < 1000 / STATE_HZ) return;
    const sig = `${s.x.toFixed(2)},${s.z.toFixed(2)},${s.ry.toFixed(2)},${s.moving ? 1 : 0},${discreteSig},${jy.toFixed(2)},${vehSig}`;
    if (!force && !discreteChanged && sig === this.lastSig && now - this.lastSent < 2500) return;
    this.lastDiscreteSig = discreteSig;
    this.lastSig = sig;
    this.lastSent = now;
    this.ws.send(JSON.stringify({ t: 'state', ...s }));
  }
  sendChat(text) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'chat', text })); }
  sendEmote(kind, combo = 1) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'emote', kind, combo })); }
  sendWeather(mode) {
    if (this.ws?.readyState !== 1) return;
    this.ws.send(JSON.stringify({ t: 'weather', mode: mode === 'rain' ? 'rain' : '' }));
  }
  close() {
    this.manualClose = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.close(); }
    this.emit('reset');
    this.emit('status', '');
  }
}

// 로컬 목업: 가짜 플레이어 1명이 역 근처를 돌아다니며 가끔 말을 걸고, 내 채팅에 답장함
export class MockPresence extends Emitter {
  constructor({ station, region = null }) {
    super();
    this.station = station;
    this.region = region;
    this.isEn = region?.lang === 'en' || station?.name === 'Starbase';
    this.t = 0;
  }
  connect(me) {
    clearInterval(this.timer);
    clearTimeout(this.helloTimer);
    this.me = me; this.my = { x: this.station.x, z: this.station.z };
    this.peer = {
      id: 'mock-1',
      name: this.isEn ? 'StarshipSpotter' : '판교러버',
      color: '#00b894',
      look: sanitizeLook({ gender: 'f', face: 'round', hair: 'pony', glasses: true, top: 'hoodie', color: '#00b894' }),
      x: this.station.x + 12,
      z: this.station.z - 6,
      ry: 0,
    };
    this.helloTimer = setTimeout(() => {
      this.emit('welcome', { t: 'welcome', id: 'me', peers: [] });
      this.emit('join', { t: 'join', peer: this.peer });
      this.emit('status', '현재 접속자 2명');
    }, 300);
    this.timer = setInterval(() => this._tick(), 1000 / STATE_HZ);
    this.lines = this.isEn
      ? [
          'Hey! First time visiting Starbase, TX?',
          'Most of the crew commutes from Brownsville to Starfactory & the Launch Pad!',
          'Press R or head south of Integration Tower 1 to watch the Roadster Jump Show 🚀',
          'Wait until you see Mega Bay and the chopstick arms up close!',
        ]
      : [
          '안녕하세요! 정자역 처음 오셨어요?',
          '여기 지도 OSM 데이터로 만든 거래요 ㅋㅋ',
          '탄천 쪽으로 같이 산책 가실래요?',
          '저는 판교 출근인데 정자에서 놀아요 😎',
        ];
    this.li = 0; this.nextTalk = 4;
  }
  _tick() {
    const dt = 1 / STATE_HZ; this.t += dt;
    // 플레이어 주변을 크게 원을 그리며 서성임 (내 캐릭터가 바이크를 타면 판교러버도 같이 바이크를 타고 달림)
    const riding = !!this.my.riding;
    const sit = riding ? '' : (this.my.sit || '');
    const afk = riding ? false : !!this.my.afk;
    if (this.peerEmoteUntil && performance.now() > this.peerEmoteUntil) {
      this.peerEmote = '';
      this.peerEmoteUntil = 0;
    }
    const R = 9, cx = this.my.x, cz = this.my.z;
    const spd = riding ? 4.8 : 2.2;
    const tx = cx + Math.cos(this.t * (riding ? 0.45 : 0.25)) * R, tz = cz + Math.sin(this.t * (riding ? 0.45 : 0.25)) * R;
    const dx = tx - this.peer.x, dz = tz - this.peer.z, L = Math.hypot(dx, dz);
    const step = (this.peerEmote || sit || afk) && !riding ? 0 : Math.min(L, spd * dt);
    const wait = L > 0.05 && this.guard && this.guard(this.peer.x, this.peer.z, dx / L, dz / L);
    if (!wait && L > 0.01 && step > 0) { this.peer.x += (dx / L) * step; this.peer.z += (dz / L) * step; this.peer.ry = Math.atan2(dx, dz); }
    this.emit('state', { t: 'state', id: this.peer.id, x: this.peer.x, z: this.peer.z, ry: this.peer.ry, moving: !wait && step > 0.05, riding, emote: riding ? '' : (this.peerEmote || ''), sit, afk });
    this.nextTalk -= dt;
    if (this.nextTalk <= 0) { this.emit('chat', { t: 'chat', id: this.peer.id, text: this.lines[this.li++ % this.lines.length] }); this.nextTalk = 12; }
  }
  setGuard(fn) { this.guard = fn; }
  sendState(s) { this.my = { x: s.x, z: s.z, riding: !!s.riding, sit: s.sit || '', afk: !!s.afk }; }
  sendChat(text) {
    let reply;
    if (this.isEn) {
      reply = /hi|hello|hey/i.test(text)
        ? 'Hey there! Welcome to Starbase 👋'
        : /roadster|jump|show/i.test(text)
          ? 'The Roadster Jump Show is 350m south of Integration Tower 1! Press R to watch 🏎️💨'
          : /launch|tower|pad|starship/i.test(text)
            ? 'Orbital Launch Pad 1 & 2 are right down the highway toward Boca Chica Beach 🚀'
            : 'Haha totally!! Starbase vibes are unreal 🔥';
    } else {
      reply = /안녕|하이|hi|hello/i.test(text) ? '반가워요! 👋' : /탄천/.test(text) ? '탄천 좋죠! 오리 보러 가요 🦆' : /네이버/.test(text) ? '1784 사옥 로봇 보셨어요?' : 'ㅋㅋㅋ 그러게요!! 🔥';
    }
    setTimeout(() => this.emit('chat', { t: 'chat', id: this.peer.id, text: reply }), 1200);
  }
  sendEmote(kind, combo = 1) {
    setTimeout(() => {
      if (!this.peer) return;
      this.peerEmote = kind;
      this.peerEmoteUntil = performance.now() + 3400;
      this.emit('emote', { t: 'emote', id: this.peer.id, kind, combo });
      if (combo === 2 || combo === 5) {
        const hypeLines = this.isEn
          ? {
              cheer: 'Woohoo!! Let us go Starbase!! 🙌🎉',
              fuss: 'Full thrust energy!! 🚨🔥',
              dance: 'Dance party under the Starship!! 💃🪩',
              clap: 'Standing ovation!! 👏💯',
              love: 'Sending love from Boca Chica!! ❤️💖',
              lol: 'Hahaha too good!! 🤣',
            }
          : {
              cheer: '와아아!! 만세!! 🙌🎉',
              fuss: '우와아아앙 텐션 미쳤다!! 🚨🔥',
              dance: '오예~ 같이 춤춰요!! 💃🪩',
              clap: '짝짝짝!! 물개박수!! 👏💯',
              love: '하트 받아가세요!! ❤️💖',
              lol: 'ㅋㅋㅋㅋㅋ 아 배아파!! 🤣',
            };
        this.emit('chat', { t: 'chat', id: this.peer.id, text: hypeLines[kind] || (this.isEn ? 'Woohoo!! 🎉' : '와아아!! 🎉') });
      }
    }, 320);
  }
  sendWeather(mode) {
    this.emit('weather', { t: 'weather', mode: mode === 'rain' ? 'rain' : '' });
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

function isLocalHost() {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
}

export function createPresence({ station, region = null }) {
  const params = new URLSearchParams(location.search);
  const wsParam = params.get('ws');
  if (wsParam === 'mock' || wsParam === 'off' || (params.has('shot') && !wsParam) || (!wsParam && isLocalHost())) {
    return new MockPresence({ station, region });
  }
  const base =
    wsParam === 'local'
      ? 'ws://127.0.0.1:8787'
      : wsParam === 'prod' || wsParam === 'live'
        ? DEFAULT_WS_URL
        : (wsParam || DEFAULT_WS_URL);
  const regionId = region?.id || params.get('region') || 'jeongja';
  const sep = base.includes('?') ? '&' : '?';
  const url = `${base}${sep}region=${encodeURIComponent(regionId)}`;
  return new WebSocketPresence(url);
}
