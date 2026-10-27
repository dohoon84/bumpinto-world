import { DurableObject } from "cloudflare:workers";

const STALE_MS = 35000;

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
  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  #evictSocket(ws, reason = "evicted") {
    const peer = ws.deserializeAttachment();
    ws.serializeAttachment(null);
    try {
      ws.close(1000, reason);
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
      if (
        (duplicateDeviceId && peer.deviceId && peer.deviceId === duplicateDeviceId) ||
        (peer.lastSeen && now - peer.lastSeen > STALE_MS)
      ) {
        this.#evictSocket(ws, duplicateDeviceId ? "replaced" : "stale");
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
        });
      }
    }
    return list;
  }

  #send(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
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
      const deviceId = typeof m.deviceId === "string" ? m.deviceId.slice(0, 64) : "";
      this.#pruneStale(ws, deviceId || null);

      const look = sanitizeLook({
        hair: "short",
        top: "hoodie",
        ...(m.look || {}),
        color: m.color || m.look?.color,
      });
      me = {
        id: "p-" + crypto.randomUUID().slice(0, 8),
        deviceId,
        name: String(m.name || "손님").trim().slice(0, 24) || "손님",
        color: look.color,
        look,
        x: 0,
        z: 0,
        ry: 0,
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
      this.#send(ws, { t: "welcome", id: me.id, peers });
      this.#broadcast({ t: "join", peer: publicMe }, ws);
      return;
    }
    if (!me) return;
    me.lastSeen = now;
    if (m.t === "ping") {
      ws.serializeAttachment(me);
      this.#pruneStale(ws);
      return;
    }
    if (m.t === "state") {
      me.x = Number(m.x) || 0;
      me.z = Number(m.z) || 0;
      me.ry = Number(m.ry) || 0;
      ws.serializeAttachment(me);
      this.#broadcast(
        { t: "state", id: me.id, x: me.x, z: me.z, ry: me.ry, moving: !!m.moving },
        ws,
      );
      return;
    }
    if (m.t === "chat") {
      ws.serializeAttachment(me);
      const text = String(m.text || "").trim().slice(0, 120);
      if (text) this.#broadcast({ t: "chat", id: me.id, text }, ws);
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
