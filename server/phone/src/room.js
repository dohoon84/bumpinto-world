import { DurableObject } from "cloudflare:workers";
import { giftItem, giftItemByVeh, normalizeHoldings, qtyOf, withQty } from "../../../src/gifts/catalog.js";
import { accountsReady, moveCreditV2, statsEnabled } from "./account/flags.js"; // [accounts]
import { sessionFromRequest } from "./account/session.js";
import { accountById, accountForSession } from "./account/store.js";
import { MoveStats, classifyMode, flushMoves, logLoginDay } from "./account/stats.js";
import { featureOn } from "./account/flags.js"; // [economy]
import { accountVehicleGifts, settleMoveForDates } from "./account/economy.js";
import { sanitizeLook } from "../../../src/look.js";

const STALE_MS = 35000;
const BIKE_VEH_BLACK = 900;
const BIKE_VEH_RED = 901;
const BOOK_KEY = "jeongja";
const STATS_FLUSH_MS = 60_000; // [accounts] 칭호용 이동 기록을 D1 에 쓰는 간격
const ACCOUNT_TAG = "a:";

// [accounts] 선물 탈것 id → 칭호 기록용 수단
function giftVehMode(veh) {
  const id = giftItemByVeh(veh)?.id || "";
  if (id.startsWith("roadbike")) return "roadbike";
  if (id.startsWith("superbike")) return "superbike";
  return null;
}

function isBikeVeh(id) {
  return id === BIKE_VEH_BLACK || id === BIKE_VEH_RED;
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.moves = new Map(); // [accounts] ws → { stats: MoveStats, flushedAt } (메모리만, 로그인한 연결만)
  }

  // [accounts] 웹소켓 연결 시 세션 쿠키 → 계정 id (없거나 꺼져 있으면 "")
  async #accountFromRequest(request) {
    if (!accountsReady(this.env)) return "";
    try {
      const session = await sessionFromRequest(request, this.env);
      if (!session) return "";
      const acc = await accountForSession(this.env.DB, session);
      return acc?.id || "";
    } catch {
      return "";
    }
  }

  #accountOf(ws) {
    try {
      const tag = this.ctx.getTags(ws).find((t) => t.startsWith(ACCOUNT_TAG));
      return tag ? tag.slice(ACCOUNT_TAG.length) : "";
    } catch {
      return "";
    }
  }

  // 같은 계정이 소켓을 여러 개 열어도 인정 초는 한 연결만 쌓는다.
  // 자리비움이 아닌 연결을 우선하고, 둘 다 움직이면 id 가 작은 쪽만 남긴다.
  #shouldCredit(ws, me, now) {
    let socks = [];
    try { socks = this.ctx.getWebSockets(ACCOUNT_TAG + me.accountId) || []; } catch { return true; }
    const fresh = [];
    for (const s of socks) {
      const p = s.deserializeAttachment();
      if (!p?.id || (p.lastSeen && now - p.lastSeen > STALE_MS)) continue;
      fresh.push({ s, p });
    }
    if (fresh.length <= 1) return true;
    const moving = fresh.filter((x) => !x.p.afk);
    const pool = (moving.length ? moving : fresh).slice().sort((a, b) => (String(a.p.id) < String(b.p.id) ? -1 : 1));
    return pool[0].s === ws;
  }

  #trackMove(ws, me, m, now) {
    if (!me.accountId || !statsEnabled(this.env)) return;
    if (!this.#shouldCredit(ws, me, now)) return;
    let slot = this.moves.get(ws);
    if (!slot) {
      slot = { stats: new MoveStats({ v2: moveCreditV2(this.env) }), flushedAt: now };
      this.moves.set(ws, slot);
    }
    const mode = classifyMode({ riding: me.riding, sit: me.sit, afk: me.afk, veh: me.veh?.id, zone: m.zone }, giftVehMode);
    slot.stats.push({ x: me.x, z: me.z, mode, now });
    if (now - slot.flushedAt >= STATS_FLUSH_MS) {
      slot.flushedAt = now;
      this.#flushMoves(slot, me.accountId);
    }
  }

  #flushMoves(slot, accountId) {
    const rows = slot?.stats.drain() || [];
    if (!rows.length || !accountId) return;
    // [economy] 통계를 쓴 다음, 이동 보상(인정분) 정산 — ECON_FEATURES 에 move 가 있을 때만. 멱등.
    const env = this.env;
    this.ctx.waitUntil(
      flushMoves(env.DB, accountId, rows)
        .then(() => (featureOn(env, "move") ? settleMoveForDates(env.DB, env, accountId, [...new Set(rows.map((r) => r.date))]) : null))
        .catch(() => {}),
    );
  }

  #dropMoves(ws, me) {
    const slot = this.moves.get(ws);
    if (!slot) return;
    this.moves.delete(ws);
    slot.stats.finish(); // [economy] 마지막 창도 순변위 조건으로 닫는다
    if (me?.accountId) this.#flushMoves(slot, me.accountId);
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

  // [economy] 상점에서 산 탈것(계정 귀속, D1). 선물함 보유에 합쳐 같은 #relayVeh 검사로 탈 수 있게 한다. 선물로 넘길 수는 없음(PhoneBook 에 없음)
  async #shopGifts(accountId) {
    if (!accountId || !this.env?.DB || !featureOn(this.env, "shop")) return [];
    try { return normalizeHoldings(await accountVehicleGifts(this.env.DB, accountId)); } catch { return []; }
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
    // [accounts] 로그인 세션이 있으면 계정 id 를 태그로 붙인다(휴면 후에도 남음). 없으면 예전처럼 deviceId 로만.
    const accountId = await this.#accountFromRequest(request);
    this.ctx.acceptWebSocket(server, accountId ? [ACCOUNT_TAG + accountId] : []);
    return new Response(null, { status: 101, webSocket: client });
  }

  #evictSocket(ws, code = 1000, reason = "evicted") {
    const peer = ws.deserializeAttachment();
    this.#dropMoves(ws, peer);
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
    // [subway-sync] 시계 맞추기: { t:'time', c } → { t:'time', c, s } (클라이언트가 NTP 처럼 오프셋 계산). hello 전에도, 상태는 안 건드림
    if (m.t === "time") {
      this.#send(ws, { t: "time", c: Number(m.c) || 0, s: now });
      return;
    }
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
      // [accounts] 로그인한 연결이면 계정의 대표 캐릭터(primary_user_id)로 선물함을 본다. 관리자는 기기·대표 중 하나면.
      const accountId = this.#accountOf(ws);
      let userId = rawDevice;
      if (accountId) {
        try {
          const acc = await accountById(this.env.DB, accountId);
          if (acc?.primary_user_id) userId = acc.primary_user_id;
          if (acc && statsEnabled(this.env)) this.ctx.waitUntil(logLoginDay(this.env.DB, accountId).catch(() => {}));
        } catch {}
      }
      let auth = await this.#bikeAuth(rawDevice);
      if (!auth.isAdmin && userId && userId !== rawDevice) auth = await this.#bikeAuth(userId);
      const owned = await this.#loadGifts(userId);
      const shopGifts = await this.#shopGifts(accountId);
      if (shopGifts.length) owned.gifts = normalizeHoldings([...owned.gifts, ...shopGifts]);
      me = {
        id,
        deviceId: userId || deviceId,
        ...(accountId ? { accountId } : {}),
        name: String(m.name || "손님").trim().slice(0, 24) || "손님",
        color: look.color,
        look,
        x: 0,
        z: 0,
        ry: 0,
        bikeAdmin: auth.isAdmin,
        bikeTank: auth.bikeTank,
        gifts: owned.gifts,
        ...(shopGifts.length ? { shopGifts } : {}), // [economy] 산 탈것(양도 불가) — 선물을 보낸 뒤에도 보유에 남긴다
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
      this.#trackMove(ws, me, m, now); // [accounts] 칭호용 이동 기록 (로그인 + STATS_ENABLED 일 때만)
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
      me.gifts = withQty(me.gifts, item, fromQty + qtyOf(me.shopGifts || [], item));
      target.peer.gifts = withQty(target.peer.gifts, item, toQty + qtyOf(target.peer.shopGifts || [], item));
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
    // [economy] 상점 구매 직후 클라이언트가 보낸다: 재접속 없이 산 탈것을 바로 타도록 서버 쪽 보유(me.gifts)를 다시 읽고 돌려준다.
    //   보유는 D1(account_vehicles) + PhoneBook 에서만 읽는다 — 클라이언트가 보낸 값은 쓰지 않음. 2초에 1번.
    if (m.t === "gifts_sync") {
      if (!me.accountId || now - (me.giftSyncAt || 0) < 2000) return;
      me.giftSyncAt = now;
      const owned = await this.#loadGifts(me.deviceId);
      const shopGifts = await this.#shopGifts(me.accountId);
      me.gifts = normalizeHoldings([...owned.gifts, ...shopGifts]);
      if (shopGifts.length) me.shopGifts = shopGifts;
      else delete me.shopGifts;
      ws.serializeAttachment(me);
      this.#send(ws, { t: "holdings", gifts: me.gifts });
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
    this.#dropMoves(ws, me);
    ws.serializeAttachment(null);
    try {
      ws.close(1000, "closed");
    } catch {}
    if (me?.id) this.#broadcast({ t: "leave", id: me.id }, ws);
  }

  async webSocketError(ws) {
    const me = ws.deserializeAttachment();
    this.#dropMoves(ws, me);
    ws.serializeAttachment(null);
    try {
      ws.close(1011, "error");
    } catch {}
    if (me?.id) this.#broadcast({ t: "leave", id: me.id }, ws);
  }
}
