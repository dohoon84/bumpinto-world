// 정자역 번호부(Durable Object) 클라이언트. 기기마다 id 하나를 저장하고, 그 id 로 번호가 유지된다.
import { sanitizeLook } from './look.js';

const DEVICE_KEY = 'jeongja3d.device';
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERRORS = {
  bad_id: '기기 번호가 올바르지 않습니다.',
  bad_name: '닉네임을 입력해 주세요.',
  bad_look: '모습 정보를 저장하지 못했습니다.',
  bad_phone: '010으로 시작하는 번호 11자리를 입력해 주세요.',
  bad_pin: '비밀번호(PIN)는 숫자 4~6자리로 입력해 주세요.',
  no_pin: '비밀번호(PIN)가 설정되지 않은 번호입니다.',
  wrong_pin: '번호 또는 비밀번호(PIN)가 일치하지 않습니다.',
  pin_locked: '비밀번호를 5회 틀려 5분 동안 잠겼습니다. 잠시 후 다시 시도해 주세요.',
  bad_place: '위치를 저장하지 못했습니다.',
  unknown_number: '없는 번호입니다.',
  self: '내 번호는 추가할 수 없습니다.',
  blocked: '차단된 번호라 보낼 수 없습니다.',
  empty: '내용을 입력해 주세요.',
  bad_title: '제목을 입력해 주세요.',
  bad_category: '분류를 선택해 주세요.',
  post_not_found: '존재하지 않거나 삭제된 게시글입니다.',
  forbidden: '본인이 작성한 글만 수정·삭제할 수 있습니다.',
  not_found: '번호가 아직 없습니다. 다시 입장해 주세요.',
  full: '더 이상 번호를 발급할 수 없습니다.',
  server: '번호 서버 오류입니다.',
};

export function deviceId() {
  try {
    const cur = localStorage.getItem(DEVICE_KEY);
    if (cur && ID_RE.test(cur)) return cur;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function formatPhone(value) {
  const d = String(value || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d;
}

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

const DEFAULT_SMS_BASE = import.meta.env?.VITE_PHONE_URL || 'https://jeongja-phone.xn0texn073.workers.dev';

function smsBase() {
  const params = new URLSearchParams(location.search);
  if (params.get('sms') === 'off') return '';
  if (params.get('sms') === 'local') return 'http://127.0.0.1:8789';
  if (params.has('sms')) return (params.get('sms') || '').replace(/\/$/, '');
  return DEFAULT_SMS_BASE.replace(/\/$/, '');
}

export function createSms() {
  const base = smsBase();
  let id = deviceId();
  let session = null;

  function toSession(data) {
    return {
      phone: data.phone,
      display: data.display,
      name: data.name,
      look: sanitizeLook(data.look),
      place: data.place,
      unread: data.unread || 0,
      hasPin: !!data.hasPin,
      updatedAt: data.updatedAt,
    };
  }

  async function post(path, body, { keepalive = false } = {}) {
    if (!base) {
      const error = new Error('번호 서버 주소가 없습니다.');
      error.code = 'no_server';
      throw error;
    }
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
        keepalive,
      });
    } catch {
      const error = new Error('번호 서버에 연결되지 않았습니다. npm run phone 을 켠 뒤 다시 시도해 주세요.');
      error.code = 'offline';
      throw error;
    }
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data?.ok) {
      const error = new Error(ERRORS[data?.error] || '요청을 처리하지 못했습니다.');
      error.code = data?.error || 'bad';
      throw error;
    }
    return data;
  }

  return {
    get id() { return id; },
    get off() { return !base; },
    get session() { return session; },
    async enter({ name, look, pin, preview = false }) {
      if (!base) {
        session = { off: true, phone: '', display: '', place: null, unread: 0, hasPin: false, look: sanitizeLook(look), name };
        return session;
      }
      const payload = { name, look: sanitizeLook(look), preview };
      if (pin != null && String(pin).trim() !== '') payload.pin = String(pin).trim();
      const data = await post('/join', payload);
      if (data.id && ID_RE.test(data.id)) {
        id = data.id;
        try { localStorage.setItem(DEVICE_KEY, id); } catch {}
      }
      session = toSession(data);
      return session;
    },
    async login({ phone, pin }) {
      const data = await post('/login', { phone: phoneDigits(phone), pin: String(pin ?? '').trim() });
      if (data.id && ID_RE.test(data.id)) {
        id = data.id;
        try { localStorage.setItem(DEVICE_KEY, id); } catch {}
      }
      session = toSession(data);
      return session;
    },
    async setPin(pin) {
      const data = await post('/pin', { pin: String(pin ?? '').trim() });
      if (session) session.hasPin = true;
      return data;
    },
    savePlace(place) {
      if (!base || !session || session.off) return;
      post('/place', place, { keepalive: true }).catch(() => {});
    },
    threads() { return post('/threads', {}); },
    messages(withPhone) { return post('/messages', { with: withPhone }); },
    send(to, body) { return post('/send', { to, body }); },
    read(withPhone) { return post('/read', { with: withPhone }); },
    contacts(op, extra = {}) { return post('/contacts', { op, ...extra }); },
    board(op, extra = {}) { return post('/board', { op, ...extra }); },
  };
}
