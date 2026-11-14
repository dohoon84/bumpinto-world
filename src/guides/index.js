// [place-guide] 장소 가이드 등록부. 장소마다 JSON 하나(public/guides/<id>.json, schema place-guide/1)와
//   어느 땅(host)에 붙는지만 적는다. 가까이(near.r) 오면 JSON 을 받아 안내판·안내원·패널을 짓는다(한 번).
import { createPlaceGuideWorld } from './placeGuideWorld.js';

export const PLACE_GUIDES = [
  { id: 'namdaemun', url: '/guides/namdaemun.json', host: 'myeongdong', near: { x: -11400, z: -21450, r: 520 } },
];

export function placeGuidesEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  return new URLSearchParams(search || '').get('guide') !== '0';
}

/**
 * @param {{ hosts: Record<string, ()=>any>, parentOf: (host:any)=>any, camera:any, canvas:HTMLElement, getPlayer:()=>any, mobile?:boolean,
 *   setSuppressOthers?: (on:boolean)=>void, track?: (n:string,p?:any)=>void, fetchJson?: (url:string)=>Promise<any> }} o
 */
export function mountPlaceGuides(o) {
  const live = new Map(); const loading = new Set();
  const get = o.fetchJson || ((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); }));
  function tryMount(def) {
    if (live.has(def.id) || loading.has(def.id)) return;
    const host = o.hosts[def.host]?.(); if (!host?.ready) return;
    loading.add(def.id);
    get(def.url).then((guide) => {
      if (guide?.schema !== 'place-guide/1') throw new Error(`bad guide schema ${def.id}`);
      const w = createPlaceGuideWorld({
        guide, parent: o.parentOf(host), camera: o.camera, canvas: o.canvas, getPlayer: o.getPlayer, mobile: o.mobile,
        surfaceY: (x, z) => host.surfaceY?.(x, z) ?? host.heightAt?.(x, z) ?? 0,
        walkLines: () => host.walkWays?.() || [],
        setSuppressOthers: o.setSuppressOthers, track: o.track,
      });
      live.set(def.id, w);
    }).catch((e) => console.warn('[place-guide] off:', def.id, e?.message || e)).finally(() => loading.delete(def.id));
  }
  return {
    update(dt) {
      const p = o.getPlayer?.(); if (!p) return;
      for (const def of PLACE_GUIDES) {
        if (!live.has(def.id) && Math.hypot(p.position.x - def.near.x, p.position.z - def.near.z) < def.near.r) tryMount(def);
      }
      for (const w of live.values()) w.update(dt);
    },
    onKey(e) { for (const w of live.values()) if (w.onKey(e)) return true; return false; },
    get active() { for (const w of live.values()) if (w.canOpen || w.isOpen) return w; return null; },
    get(id) { return live.get(id) || null; },
    get list() { return [...live.keys()]; },
    dispose() { for (const w of live.values()) w.dispose(); live.clear(); },
  };
}
