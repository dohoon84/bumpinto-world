// 로컬 개발용 초간단 프레즌스 릴레이 (배포용 아님). src/net/protocol.js 형식을 따름.
//   node server/dev-relay.mjs   ->  ws://localhost:8787
//   브라우저: http://localhost:5173/?ws=ws://localhost:8787  (탭 2개 열어서 서로 마주쳐 보기)
import { WebSocketServer } from 'ws';
import { sanitizeLook } from '../src/look.js';
const PORT = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port: PORT });
const peers = new Map(); // ws -> peer
let seq = 0;
const send = (ws, m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
const broadcast = (m, except) => { for (const ws of peers.keys()) if (ws !== except) send(ws, m); };
wss.on('connection', (ws) => {
  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (m.t === 'hello' && !peers.has(ws)) {
      const look = sanitizeLook({ hair: 'short', top: 'hoodie', ...(m.look || {}), color: m.color || m.look?.color });
      const peer = { id: 'p' + ++seq, name: String(m.name || '손님').slice(0, 24), color: look.color, look, x: 0, z: 0, ry: 0 };
      send(ws, { t: 'welcome', id: peer.id, peers: [...peers.values()] });
      peers.set(ws, peer); broadcast({ t: 'join', peer }, ws);
    }
    const p = peers.get(ws); if (!p) return;
    if (m.t === 'state') {
      const jy = Math.max(0, Math.min(5, +m.jy || 0));
      const emote = typeof m.emote === 'string' ? m.emote.slice(0, 16) : '';
      const sit = typeof m.sit === 'string' ? m.sit.slice(0, 16) : '';
      const afk = !!m.afk;
      Object.assign(p, { x: +m.x || 0, z: +m.z || 0, ry: +m.ry || 0, riding: !!m.riding, sit, afk });
      broadcast({ t: 'state', id: p.id, x: p.x, z: p.z, ry: p.ry, moving: !!m.moving, riding: p.riding, jy, emote, sit, afk }, ws);
    }
    if (m.t === 'emote') {
      const kind = String(m.kind || '').trim().slice(0, 16);
      const combo = Math.max(1, Math.min(99, Math.floor(+m.combo || 1)));
      if (kind) broadcast({ t: 'emote', id: p.id, kind, combo }, ws);
    }
    if (m.t === 'chat') broadcast({ t: 'chat', id: p.id, text: String(m.text).slice(0, 120) }, ws);
  });
  ws.on('close', () => { const p = peers.get(ws); if (p) { peers.delete(ws); broadcast({ t: 'leave', id: p.id }); } });
});
console.log(`dev-relay listening on ws://localhost:${PORT}`);
