// [accounts] /auth/* 호출. 세션은 HttpOnly 쿠키라 JS 가 읽지 못한다 — credentials:'include' 로만 실어 보낸다.
import { smsBase } from '../sms.js';
import { accountApiOverride } from './flags.js';

export function accountBase() {
  return accountApiOverride() || smsBase();
}

async function call(path, { method = 'GET', body } = {}) {
  const base = accountBase();
  if (!base) return { ok: false, error: 'offline' };
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data, ok: !!data.ok && res.ok };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export const accountApi = {
  config: () => call('/auth/config'),
  me: (deviceId) => call(`/auth/me?deviceId=${encodeURIComponent(deviceId || '')}`),
  google: (credential, deviceId) => call('/auth/google', { method: 'POST', body: { credential, deviceId } }),
  link: (deviceId) => call('/auth/link', { method: 'POST', body: { deviceId } }),
  logout: (all = false) => call('/auth/logout', { method: 'POST', body: { all: !!all } }),
};
