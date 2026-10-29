// 로컬 개발용 초간단 프레즌스 릴레이 (배포용 아님). src/net/protocol.js 형식을 따름.
//   node server/dev-relay.mjs   ->  ws://localhost:8787
//   브라우저: http://localhost:5173/?ws=ws://localhost:8787  (탭 2개 열어서 서로 마주쳐 보기)
import { WebSocketServer } from 'ws';
import { sanitizeLook } from '../src/look.js';
import { giftItem, giftItemByVeh, giftUnit, qtyOf, seedList, withQty } from '../src/gifts/catalog.js';
const PORT = Number(process.env.PORT || 8787);
const wss = new WebSocketServer({ port: PORT });
const peers = new Map(); // ws -> peer
const giftStock = new Map(); // deviceId -> [{ id, qty }]
let seeded = false;
let seq = 0;
let worldWeather = '';
const send = (ws, m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
const broadcast = (m, except) => { for (const ws of peers.keys()) if (ws !== except) send(ws, m); };
const broadcastAll = (m) => { for (const ws of peers.keys()) send(ws, m); };
wss.on('connection', (ws) => {
  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf); } catch { return; }
    if (m.t === 'hello' && !peers.has(ws)) {
      const look = sanitizeLook({ hair: 'short', top: 'hoodie', ...(m.look || {}), color: m.color || m.look?.color });
      const id = 'p' + (++seq);
      const deviceId = String(m.deviceId || '').slice(0, 64) || id;
      const phone = String(m.phone || '').replace(/\D/g, '');
      if (!seeded) { giftStock.set(deviceId, seedList()); seeded = true; }
      const peer = { id, deviceId, name: String(m.name || '손님').slice(0, 24), color: look.color, look, x: 0, z: 0, ry: 0, gifts: giftStock.get(deviceId) || [], phone: /^010\d{8}$/.test(phone) ? phone : '' };
      const pubPeer = (peerRow) => ({ id: peerRow.id, name: peerRow.name, color: peerRow.color, look: peerRow.look, x: peerRow.x, z: peerRow.z, ry: peerRow.ry });
      send(ws, { t: 'welcome', id: peer.id, peers: [...peers.values()].map(pubPeer), gifts: peer.gifts, weather: worldWeather });
      peers.set(ws, peer); broadcast({ t: 'join', peer: { id: peer.id, name: peer.name, color: peer.color, look: peer.look, x: peer.x, z: peer.z, ry: peer.ry } }, ws);
    }
    const p = peers.get(ws); if (!p) return;
    if (m.t === 'state') {
      const jy = Math.max(0, Math.min(5, +m.jy || 0));
      const emote = typeof m.emote === 'string' ? m.emote.slice(0, 16) : '';
      const sit = typeof m.sit === 'string' ? m.sit.slice(0, 16) : '';
      const afk = !!m.afk;
      const packVeh = (raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const id = raw.id | 0;
        if ((id === 900 || id === 901) && process.env.ALLOW_BIKE_VEH !== '1') return null;
        const gate = giftItemByVeh(id);
        if (gate && qtyOf(p.gifts, gate.id) < 1) return null;
        const body = {
          id,
          ry: +raw.ry || 0,
          v: +raw.v || 0,
          st: +raw.st || 0,
          ...(raw.wh ? { wh: +raw.wh || 0 } : {}),
          ...(raw.p ? { p: 1 } : {}),
        };
        if (raw.pk) {
          body.pk = 1;
          body.v = 0;
          delete body.wh;
          delete body.p;
          body.x = +raw.x || 0;
          body.z = +raw.z || 0;
        }
        return body;
      };
      const veh = packVeh(m.veh);
      const pv = Array.isArray(m.pv) ? m.pv.map((raw) => packVeh({ ...raw, pk: 1 })).filter((v) => v?.pk).slice(0, 4) : [];
      Object.assign(p, { x: +m.x || 0, z: +m.z || 0, ry: +m.ry || 0, riding: !!m.riding, sit, afk, veh, pv });
      broadcast({ t: 'state', id: p.id, x: p.x, z: p.z, ry: p.ry, moving: !!m.moving, riding: p.riding, jy, emote, sit, afk, ...(veh ? { veh } : {}), ...(pv.length ? { pv } : {}) }, ws);
    }
    if (m.t === 'gift') {
      const item = giftItem(m.item)?.id || '';
      const unit = item ? giftUnit(item) : 1;
      const targetWs = item ? [...peers.entries()].find(([, peer]) => peer.id === m.to)?.[0] : null;
      const target = targetWs ? peers.get(targetWs) : null;
      const typed = String(m.phone || '').replace(/\D/g, '');
      if (!item) { send(ws, { t: 'gift', ok: false, error: 'bad_item', item: String(m.item || '') }); }
      else if (!/^010\d{8}$/.test(typed)) send(ws, { t: 'gift', ok: false, error: 'bad_phone', item });
      else if (!target) send(ws, { t: 'gift', ok: false, error: 'offline', item });
      else if (!target.phone || target.phone !== typed) send(ws, { t: 'gift', ok: false, error: 'phone_mismatch', item });
      else if (qtyOf(p.gifts, item) < unit) send(ws, { t: 'gift', ok: false, error: 'not_owner', item });
      else {
        const fromQty = qtyOf(p.gifts, item) - unit;
        const toQty = qtyOf(target.gifts, item) + unit;
        p.gifts = withQty(p.gifts, item, fromQty);
        target.gifts = withQty(target.gifts, item, toQty);
        giftStock.set(p.deviceId, p.gifts);
        giftStock.set(target.deviceId, target.gifts);
        send(ws, { t: 'gift', ok: true, item, mine: false, qty: fromQty, unit, to: target.id, toName: target.name });
        send(targetWs, { t: 'gift', ok: true, item, mine: true, qty: toQty, unit, from: p.id, fromName: p.name });
      }
    }
    if (m.t === 'emote') {
      const kind = String(m.kind || '').trim().slice(0, 16);
      const combo = Math.max(1, Math.min(99, Math.floor(+m.combo || 1)));
      if (kind) broadcast({ t: 'emote', id: p.id, kind, combo }, ws);
    }
    if (m.t === 'chat') broadcast({ t: 'chat', id: p.id, text: String(m.text).slice(0, 120) }, ws);
    if (m.t === 'weather') {
      worldWeather = m.mode === 'rain' ? 'rain' : '';
      broadcastAll({ t: 'weather', mode: worldWeather });
    }
  });
  ws.on('close', () => { const p = peers.get(ws); if (p) { peers.delete(ws); broadcast({ t: 'leave', id: p.id }); } });
});
console.log(`dev-relay listening on ws://localhost:${PORT}`);
