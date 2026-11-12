// [weekly-titles] 범편의점 주간 칭호. 머리 위 메시 1개 + 획득 연출 + 미리보기.
import { isEn } from '../i18n.js';
import { createTitleClient } from './client.js';
import { titlePreviewEarn, titlePreviewId, titlesEnabled, useHalfAtlas } from './flag.js';
import { createTitleLayer, loadAtlas } from './layer.js';
import { createTitleSfx } from './sfx.js';

export { titlesEnabled, titlePreviewId, titlePreviewEarn } from './flag.js';
export { createTitleClient } from './client.js';

const SELF = 'self';

export function mountTitles({
  renderer, camera, overlay, nameTag, remotes, presence, params,
  getLang = () => (isEn() ? 'en' : 'ko'),
} = {}) {
  const search = params || (typeof location !== 'undefined' ? location.search : '');
  if (!titlesEnabled(search)) return null;
  const sfx = createTitleSfx();
  const layer = createTitleLayer({ renderer, camera, getCamera: () => overlay?.camera || camera, getLang, sfx });
  const api = createTitleClient();
  let myCurrent = null;
  let ready = false;
  let lastError = null;
  const previewId = titlePreviewId(search);
  const wantEarn = titlePreviewEarn(search);

  loadAtlas(useHalfAtlas(search)).then((atlas) => {
    layer.setAtlas(atlas);
    ready = true;
    if (previewId) {
      layer.setTitle(SELF, { titleId: previewId, tag: nameTag, getPos: nameTag?.getPos, local: true, earn: wantEarn });
    }
    bootMine();
  }).catch((e) => { lastError = String(e?.message || e); console.warn('[titles] atlas', e); });

  async function bootMine() {
    if (previewId) return; // 미리보기가 서버 칭호를 덮음
    const data = await api.load();
    const cur = data?.featured || data?.current;
    myCurrent = cur || null;
    const earn = !!(data?.pendingEarn && cur);
    if (cur?.titleId && nameTag) {
      layer.setTitle(SELF, { titleId: cur.titleId, tag: nameTag, getPos: nameTag?.getPos, local: true, earn });
      if (earn && cur.weekKey) api.seen(cur.weekKey).catch(() => {});
      try { presence?.sendTitle?.({ title: cur.titleId, earn: false }); } catch { /* */ }
      if (earn) {
        try { presence?.sendTitle?.({ title: cur.titleId, earn: true }); } catch { /* */ }
      }
    }
  }

  if (presence) {
    presence.on?.('title', (m) => {
      const id = m.id;
      if (!id || id === presence.id) return;
      const peer = remotes?.peers?.get(id);
      if (!peer) return;
      peer.titleId = m.title || m.titleId || null;
      layer.setTitle(id, {
        titleId: peer.titleId,
        tag: peer.tag,
        getPos: peer.tag?.getPos,
        local: false,
        earn: !!m.earn && !!peer.tag?.visible,
      });
    });
    presence.on?.('welcome', (m) => {
      for (const p of m.peers || []) {
        if (p.title) {
          const peer = remotes?.peers?.get(p.id);
          if (peer) {
            peer.titleId = p.title;
            layer.setTitle(p.id, { titleId: p.title, tag: peer.tag, getPos: peer.tag?.getPos, local: false });
          }
        }
      }
    });
    presence.on?.('join', (m) => {
      const p = m.peer;
      if (!p?.title || !p.id) return;
      const peer = remotes?.peers?.get(p.id);
      if (peer) {
        peer.titleId = p.title;
        layer.setTitle(p.id, { titleId: p.title, tag: peer.tag, getPos: peer.tag?.getPos, local: false });
      }
    });
  }

  // 원격 플레이어가 나중에 add 될 때를 위해 remotes 에 훅
  if (remotes) {
    const origAdd = remotes.add.bind(remotes);
    remotes.add = (peer) => {
      origAdd(peer);
      const p = remotes.peers.get(peer.id);
      if (p && peer.title) {
        p.titleId = peer.title;
        layer.setTitle(peer.id, { titleId: peer.title, tag: p.tag, getPos: p.tag?.getPos, local: false });
      }
    };
    const origRemove = remotes.remove.bind(remotes);
    remotes.remove = (id) => { layer.remove(id); origRemove(id); };
  }

  function syncSelf() {
    if (!ready || !nameTag) return;
    const id = previewId || myCurrent?.titleId;
    if (!id) return;
    const w = layer.wearers.get(SELF);
    if (w) { w.tag = nameTag; w.getPos = nameTag.getPos; }
  }

  function render(rendererIn, w, h) {
    if (!ready) return { quads: 0, draws: 0, tris: 0 };
    syncSelf();
    // 원격 칭호 위치는 tag 가 따라가므로 매 프레임 getPos 만 쓰면 됨
    if (remotes?.peers) {
      for (const [id, p] of remotes.peers) {
        if (p.titleId) {
          const wrr = layer.wearers.get(id);
          if (wrr) { wrr.tag = p.tag; wrr.getPos = p.tag?.getPos; }
        }
      }
    }
    return layer.render(rendererIn, w, h);
  }

  const apiOut = {
    render,
    reload: bootMine,
    preview(id, earn = false) { layer.setTitle(SELF, { titleId: id, tag: nameTag, getPos: nameTag?.getPos, local: true, earn }); },
    playEarn(id) { layer.setTitle(SELF, { titleId: id || previewId || myCurrent?.titleId, tag: nameTag, getPos: nameTag?.getPos, local: true, earn: true }); },
    seekEarn(id, tMs) {
      const titleId = id || previewId || myCurrent?.titleId;
      layer.setTitle(SELF, { titleId, tag: nameTag, getPos: nameTag?.getPos, local: true });
      layer.seekEarn(SELF, titleId, tMs);
    },
    get ready() { return ready; },
    get stats() { return layer.stats; },
    get current() { return myCurrent; },
    get error() { return lastError; },
    client: api,
    layer,
  };
  return apiOut;
}
