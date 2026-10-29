import { DurableObject } from "cloudflare:workers";
import { giftItem, giftItemByVeh, normalizeHoldings, qtyOf, withQty } from "../../../src/gifts/catalog.js";

const STALE_MS = 35000;
const BIKE_VEH_BLACK = 900;
const BIKE_VEH_RED = 901;
const BOOK_KEY = "jeongja";

function isBikeVeh(id) {
  return id === BIKE_VEH_BLACK || id === BIKE_VEH_RED;
}

const SETS = {
  gender: ["f", "m"],
  face: ["round", "square", "long"],
  hair: ["bald", "short", "medium", "long", "pony"],
  beard: ["none", "goatee", "full"],
  top: ["hoodie", "short", "long"],
};

const hex = (v, fb) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fb);

function sanitizeLook(raw = {}) {
  const l = raw && typeof raw === "object" ? raw : {};
  const one = (k, fb) => (SETS[k].includes(l[k]) ? l[k] : fb);
  return {
    gender: one("gender", "m"),
    face: one("face", "round"),
    hair: l.hair == null ? null : one("hair", "short"),
    glasses: l.glasses === true || l.glasses === 1 || l.glasses === "1",
    beard: one("beard", "none"),
    top: one("top", "long"),
    color: hex(l.color, "#4f7cff"),
    skin: hex(l.skin, "#f2d0b0"),
    pants: hex(l.pants, "#3b4252"),
    hat: typeof l.hat === "string" ? l.hat : null,
    bag: typeof l.bag === "string" ? l.bag : null,
  };
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
  }

  async #bikeAuth(deviceId) {
    try {
      const book = this.env?.PHONE_BOOK?.getByName(BOOK_KEY);
      if (!book || !deviceId) return { isAdmin: false, bikeTank: null };
      const spec = await book.adminForDevice(deviceId);
      return {
        isAdmin: Boolean(spec?.isAdmin),
        bikeTank: spec?.bikeTank === "red" || spec?.bikeTank === "black" ? spec.bikeTank : null,
      };
    } catch {
      return { isAdmin: false, bikeTank: null };
    }
  }

  #relayVeh(raw, me) {
    if (!raw || typeof raw !== "object") return null;
    const id = raw.id | 0;
    const body = {
      id,
      ry: Number(raw.ry) || 0,
      v: Number(raw.v) || 0,
      st: Number(raw.st) || 0,
      ...(raw.wh ? { wh: Number(raw.wh) || 0 } : {}),
      ...(raw.p ? { p: 1 } : {}),
    };
    const gate = giftItemByVeh(id);
    if (gate) {
      if (qtyOf(me?.gifts, gate.id) < 1) return null;
      if (raw.pk) {
        body.pk = 1;
        body.v = 0;
        delete body.wh;
        delete body.p;
        const x = Number(raw.x);
        const z = Number(raw.z);
        if (Number.isFinite(x)) body.x = x;
        if (Number.isFinite(z)) body.z = z;
      }
      return body;
    }
    if (!isBikeVeh(id)) return body;
    if (!me?.bikeAdmin) return null;
    body.id = me.bikeTank === "red" ? BIKE_VEH_RED : BIKE_VEH_BLACK;
    delete body.p;
    if (raw.pk) {
      body.pk = 1;
      body.v = 0;
      delete body.wh;
      const x = Number(raw.x);
      const z = Number(raw.z);
      if (Number.isFinite(x)) body.x = x;
      if (Number.isFinite(z)) body.z = z;
    }
    return body;
  }

  #relayParked(raw, me) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const item of raw.slice(0, 4)) {
      const body = this.#relayVeh({ ...item, pk: 1 }, me);
      if (body?.pk) out.push(body);
    }
    return out;
  }

  async #loadGifts(deviceId) {
    try {
      const book = this.env?.PHONE_BOOK?.getByName(BOOK_KEY);
      if (!book || !deviceId) return { gifts: [], phone: "" };
      const spec = await book.giftsForDevice(deviceId);
      const gifts = normalizeHoldings(spec?.gifts);
      const phone = String(spec?.phone || "").replace(/\D/g, "");
      return { gifts, phone: /^010\d{8}$/.test(phone) ? phone : "" };
    } catch {
      return { gifts: [], phone: "" };
    }
  }

  #socketByPeerId(id, except) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const peer = ws.deserializeAttachment();
      if (peer?.id === id) return { ws, peer };
    }
    return null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/stats") {
      return Response.json(this.stats());
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  #evictSocket(ws, code = 1000, reason = "evicted") {
    const peer = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    try {
      ws.close(code, reason);
    } catch {}
    if (peer?.id) {
      this.#broadcast({ t: "leave", id: peer.id }, ws);
    }
  }

  #pruneStale(except, duplicateDeviceId = null) {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const peer = ws.deserializeAttachment();
      if (!peer || !peer.id) continue;
      if (duplicateDeviceId && peer.deviceId && peer.deviceId === duplicateDeviceId) {
        this.#evictSocket(ws, 4001, "replaced");
        continue;
      }
      if (!peer.lastSeen || now - peer.lastSeen > STALE_MS) {
        this.#evictSocket(ws, 1000, "stale");
      }
    }
  }

  #peers(except) {
    this.#pruneStale(except);
    const list = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const peer = ws.deserializeAttachment();
      if (peer && peer.id) {
        list.push({
          id: peer.id,
          name: peer.name,
          color: peer.color,
          look: peer.look,
          x: peer.x,
          z: peer.z,
          ry: peer.ry,
          riding: !!peer.riding,
          sit: peer.sit || "",
          afk: !!peer.afk,
          umb: peer.umb || "",
        });
      }
    }
    return list;
  }

  stats() {
    const peers = this.#peers(null);
    return { online: peers.length };
  }

  #send(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }

  async #weatherMode() {
    if (this._weatherLoaded) return this._weather || "";
    const saved = await this.ctx.storage.get("weather");
    this._weather = saved === "rain" ? "rain" : "";
    this._weatherLoaded = true;
    return this._weather;
  }

  #broadcast(msg, except) {
    const raw = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(raw);
      } catch {}
    }
  }

  async webSocketMessage(ws, raw) {
    let m;
    try {
      m = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const now = Date.now();
    let me = ws.deserializeAttachment();
    if (m.t === "hello" && !me) {
      const id = "p-" + crypto.randomUUID().slice(0, 8);
      const rawDevice = typeof m.deviceId === "string" ? m.deviceId.trim().slice(0, 64) : "";
      const deviceId = rawDevice || id;
      this.#pruneStale(ws, rawDevice || null);

      const look = sanitizeLook({
        hair: "short",
        top: "hoodie",
        ...(m.look || {}),
        color: m.color || m.look?.color,
      });
      const auth = await this.#bikeAuth(rawDevice);
      const owned = await this.#loadGifts(rawDevice);
      me = {
        id,
        deviceId,
        name: String(m.name || "손님").trim().slice(0, 24) || "손님",
        color: look.color,
        look,
        x: 0,
        z: 0,
        ry: 0,
        bikeAdmin: auth.isAdmin,
        bikeTank: auth.bikeTank,
        gifts: owned.gifts,
        phone: owned.phone,
        lastSeen: now,
      };
      const peers = this.#peers(ws);
      ws.serializeAttachment(me);
      const publicMe = {
        id: me.id,
        name: me.name,
        color: me.color,
        look: me.look,
        x: me.x,
        z: me.z,
        ry: me.ry,
      };
      this.#send(ws, { t: "welcome", id: me.id, peers, gifts: me.gifts || [], weather: await this.#weatherMode() });
      this.#broadcast({ t: "join", peer: publicMe }, ws);
      return;
    }
    if (!me) return;
    me.lastSeen = now;
    if (!me.deviceId) me.deviceId = me.id;
    if (m.t === "ping") {
      ws.serializeAttachment(me);
      this.#pruneStale(ws);
      return;
    }
    if (m.t === "state") {
      me.x = Number(m.x) || 0;
      me.z = Number(m.z) || 0;
      me.ry = Number(m.ry) || 0;
      me.riding = !!m.riding;
      me.sit = typeof m.sit === "string" ? m.sit.slice(0, 16) : "";
      me.afk = !!m.afk;
      me.umb = typeof m.umb === "string" ? m.umb.slice(0, 16) : (m.umb ? "yellow" : "");
      const jy = Math.max(0, Math.min(5, Number(m.jy) || 0));
      const emote = typeof m.emote === "string" ? m.emote.slice(0, 16) : "";
      const veh = this.#relayVeh(m.veh, me);
      const pv = this.#relayParked(m.pv, me);
      me.veh = veh;
      me.pv = pv;
      ws.serializeAttachment(me);
      this.#broadcast(
        {
          t: "state",
          id: me.id,
          x: me.x,
          z: me.z,
          ry: me.ry,
          moving: !!m.moving,
          riding: me.riding,
          jy,
          emote,
          sit: me.sit,
          afk: me.afk,
          umb: me.umb,
          ...(veh ? { veh } : {}),
          ...(pv.length ? { pv } : {}),
        },
        ws,
      );
      return;
    }
    if (m.t === "gift") {
      const item = giftItem(m.item)?.id || "";
      const typed = String(m.phone || "").replace(/\D/g, "");
      const target = item ? this.#socketByPeerId(String(m.to || ""), ws) : null;
      if (!item) {
        this.#send(ws, { t: "gift", ok: false, error: "bad_item", item: String(m.item || "") });
        return;
      }
      if (!/^010\d{8}$/.test(typed)) {
        this.#send(ws, { t: "gift", ok: false, error: "bad_phone", item });
        return;
      }
      if (!target?.peer?.deviceId) {
        this.#send(ws, { t: "gift", ok: false, error: "offline", item });
        return;
      }
      if (!target.peer.phone || target.peer.phone !== typed) {
        this.#send(ws, { t: "gift", ok: false, error: "phone_mismatch", item });
        return;
      }
      let result = { ok: false, error: "server" };
      try {
        const book = this.env?.PHONE_BOOK?.getByName(BOOK_KEY);
        if (book) result = await book.transferGift({ fromDevice: me.deviceId, toDevice: target.peer.deviceId, item, phone: typed });
      } catch {
        result = { ok: false, error: "server" };
      }
      if (!result?.ok) {
        this.#send(ws, { t: "gift", ok: false, error: result?.error || "server", item });
        return;
      }
      const fromQty = Math.max(0, Math.floor(Number(result.fromQty) || 0));
      const toQty = Math.max(0, Math.floor(Number(result.toQty) || 0));
      me.gifts = withQty(me.gifts, item, fromQty);
      target.peer.gifts = withQty(target.peer.gifts, item, toQty);
      ws.serializeAttachment(me);
      target.ws.serializeAttachment(target.peer);
      this.#send(ws, { t: "gift", ok: true, item, mine: false, qty: fromQty, to: target.peer.id, toName: target.peer.name });
      this.#send(target.ws, { t: "gift", ok: true, item, mine: true, qty: toQty, from: me.id, fromName: me.name });
      return;
    }
    if (m.t === "emote") {
      ws.serializeAttachment(me);
      const kind = String(m.kind || "").trim().slice(0, 16);
      const combo = Math.max(1, Math.min(99, Math.floor(Number(m.combo) || 1)));
      if (kind) this.#broadcast({ t: "emote", id: me.id, kind, combo }, ws);
      return;
    }
    if (m.t === "chat") {
      ws.serializeAttachment(me);
      const text = String(m.text || "").trim().slice(0, 120);
      if (text) this.#broadcast({ t: "chat", id: me.id, text }, ws);
      return;
    }
    if (m.t === "weather") {
      if (!me.bikeAdmin) return;
      const mode = m.mode === "rain" ? "rain" : "";
      this._weather = mode;
      this._weatherLoaded = true;
      await this.ctx.storage.put("weather", mode);
      const notice = { t: "weather", mode };
      for (const sock of this.ctx.getWebSockets()) this.#send(sock, notice);
    }
  }

  async webSocketClose(ws) {
    const me = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    try {
      ws.close(1000, "closed");
    } catch {}
    if (me?.id) this.#broadcast({ t: "leave", id: me.id }, ws);
  }

  async webSocketError(ws) {
    const me = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    try {
      ws.close(1011, "error");
    } catch {}
    if (me?.id) this.#broadcast({ t: "leave", id: me.id }, ws);
  }
}
