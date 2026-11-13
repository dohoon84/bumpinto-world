// [weekly-titles] /bump24/titles 조회. 계정 API 쿠키를 실어 보낸다.
import { accountBase } from '../account/api.js';
import { deviceId } from '../sms.js';

async function cfetch(url, opts = {}) {
  try { return await fetch(url, { ...opts, credentials: 'include' }); } catch (e) {
    if ((opts.method || 'GET') !== 'GET') throw e;
    return fetch(url, opts);
  }
}

const empty = () => ({ ok: true, guest: true, current: null, history: [], pendingEarn: false, featured: null });

export function createTitleClient({ base, device } = {}) {
  const root = () => (base || accountBase() || '').replace(/\/$/, '');
  const dev = () => { try { return device?.() || deviceId(); } catch { return ''; } };
  return {
    async load() {
      const b = root();
      if (!b) return empty();
      try {
        const r = await cfetch(`${b}/bump24/titles?deviceId=${encodeURIComponent(dev())}`);
        if (!r.ok) return empty();
        const j = await r.json();
        return j?.ok ? j : empty();
      } catch { return empty(); }
    },
    async seen(weekKey) {
      const b = root();
      if (!b || !weekKey) return empty();
      try {
        const r = await cfetch(`${b}/bump24/titles/seen`, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ deviceId: dev(), weekKey }),
        });
        if (!r.ok) return empty();
        return await r.json();
      } catch { return empty(); }
    },
    async setFeatured({ titleId, weekKey, source } = {}) {
      const b = root();
      if (!b) return empty();
      try {
        const r = await cfetch(`${b}/bump24/titles/featured`, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ deviceId: dev(), titleId, weekKey, source }),
        });
        if (!r.ok) return empty();
        return await r.json();
      } catch { return empty(); }
    },
  };
}
