// 정자역 번호부(Durable Object) 클라이언트. 기기마다 id 하나를 저장하고, 그 id 로 번호가 유지된다.
import { sanitizeLook } from './look.js';
import { NOTICE_POSTS } from './notices.js';

const DEVICE_KEY = 'jeongja3d.device';
const LOCAL_PLACE_KEY = 'jeongja3d.place';
const LOCAL_BOARD_KEY = 'jeongja3d.board.v1';
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOARD_PAGE_SIZE = 20;
const BOARD_CATS = new Set(['notice', 'intro', 'feedback', 'food', 'free']);
const WRITABLE_BOARD_CATS = new Set(['intro', 'feedback', 'food', 'free']);

function isLocalHost() {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
}

function readLocalPlace() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_PLACE_KEY) || 'null');
    if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.z)) {
      return { x: Number(raw.x), y: Number(raw.y) || 0, z: Number(raw.z), ry: Number(raw.ry) || 0 };
    }
  } catch {}
  return null;
}

function writeLocalPlace(place) {
  if (!place || !Number.isFinite(place.x) || !Number.isFinite(place.z)) return;
  try {
    localStorage.setItem(
      LOCAL_PLACE_KEY,
      JSON.stringify({ x: Number(place.x), y: Number(place.y) || 0, z: Number(place.z), ry: Number(place.ry) || 0 }),
    );
  } catch {}
}

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
  comment_not_found: '존재하지 않거나 삭제된 댓글입니다.',
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
const DEFAULT_REGION = 'jeongja';

export function currentRegion() {
  try {
    const params = new URLSearchParams(location.search);
    return (params.get('region') || DEFAULT_REGION).trim().toLowerCase() || DEFAULT_REGION;
  } catch {
    return DEFAULT_REGION;
  }
}

function smsBase() {
  const params = new URLSearchParams(location.search);
  const smsParam = params.get('sms');
  if (smsParam === 'off') return '';
  if (smsParam === 'local') return 'http://127.0.0.1:8789';
  if (smsParam === 'prod' || smsParam === 'live') return DEFAULT_SMS_BASE.replace(/\/$/, '');
  if (params.has('sms')) return (smsParam || '').replace(/\/$/, '');
  if (isLocalHost()) return '';
  return DEFAULT_SMS_BASE.replace(/\/$/, '');
}

function loadLocalBoardStore() {
  const now = Date.now();
  let store = null;
  try {
    store = JSON.parse(localStorage.getItem(LOCAL_BOARD_KEY) || 'null');
  } catch {
    store = null;
  }
  if (!store || !Array.isArray(store.posts)) {
    store = {
      nextPostId: 4,
      nextCommentId: 3,
      posts: [
        {
          id: 1,
          category: 'intro',
          title: 'Bumpinto World 정자역 오픈월드에 오신 것을 환영합니다!',
          body: '안녕하세요! Bumpinto World의 첫 번째 지역인 성남시 분당구 정자역 월드입니다.\n\n• WASD / 방향키로 이동하고, E 키로 길가의 카카오바이크를 탈 수 있습니다.\n• 정류장 근처에 다가가면 실시간 경기도 버스 도착 정보를 볼 수 있습니다.\n• 우측 하단 스마트폰으로 다른 접속자와 문자/연락처를 주고받고, 재입장 PIN을 설정할 수 있습니다.\n• 이 게시판에서 자기소개, 피드백, 정자역 주변 맛집 정보를 자유롭게 나눠 보세요!',
          authorId: 'system',
          authorPhone: '01020000000',
          authorName: '크레이지랩스',
          views: 5,
          createdAt: now - 180000,
          updatedAt: now - 180000,
        },
        {
          id: 2,
          category: 'food',
          title: '정자역 카페거리·탄천 산책로 주변 숨은 맛집을 추천해 주세요',
          body: '정자역 3·4번 출구 먹자골목이나 정자동 카페거리, 네이버 1784 근처에서 자주 가는 맛집이나 카페가 있다면 이 카테고리에 공유해 주세요!',
          authorId: 'system',
          authorPhone: '01020000000',
          authorName: '정자동주민',
          views: 3,
          createdAt: now - 120000,
          updatedAt: now - 120000,
        },
        {
          id: 3,
          category: 'feedback',
          title: '월드 이용 피드백 및 건의사항을 남겨 주세요',
          body: '이동, 버스/택시, 지형, 멀티플레이, 편의기능 등 어떤 의견이든 환영합니다. 남겨주신 피드백은 다음 업데이트에 반영됩니다.',
          authorId: 'system',
          authorPhone: '01020000000',
          authorName: '크레이지랩스',
          views: 2,
          createdAt: now - 60000,
          updatedAt: now - 60000,
        },
      ],
      likes: [],
      comments: [
        {
          id: 1,
          postId: 2,
          authorId: 'mock-1',
          authorPhone: '',
          authorName: '판교러버',
          body: '정자동 카페거리 쪽 브런치 카페들 분위기 진짜 좋아요 ☕',
          createdAt: now - 45000,
        },
      ],
    };
  }
  store.likes ||= [];
  store.comments ||= [];
  store.nextPostId = Math.max(store.nextPostId || 1, ...store.posts.map((p) => (p.id || 0) + 1));
  store.nextCommentId = Math.max(store.nextCommentId || 1, ...store.comments.map((c) => (c.id || 0) + 1));

  for (const item of NOTICE_POSTS || []) {
    if (!item?.key || !item?.title || !item?.body) continue;
    const found = store.posts.find((p) => p.noticeKey === item.key);
    const createdAt = Number.isFinite(item.createdAt) ? Number(item.createdAt) : now;
    if (!found) {
      store.posts.push({
        id: store.nextPostId++,
        noticeKey: item.key,
        category: 'notice',
        title: item.title,
        body: item.body,
        authorId: 'system',
        authorPhone: '01020000000',
        authorName: item.authorName || '크레이지랩스',
        views: 1,
        createdAt,
        updatedAt: createdAt,
      });
    } else {
      found.category = 'notice';
      found.title = item.title;
      found.body = item.body;
      found.authorName = item.authorName || '크레이지랩스';
      found.createdAt = createdAt;
    }
  }
  saveLocalBoardStore(store);
  return store;
}

function saveLocalBoardStore(store) {
  try {
    localStorage.setItem(LOCAL_BOARD_KEY, JSON.stringify(store));
  } catch {}
}

function runLocalBoard(id, session, op, extra = {}) {
  const store = loadLocalBoardStore();
  const fail = (code) => {
    const err = new Error(ERRORS[code] || '요청을 처리하지 못했습니다.');
    err.code = code;
    throw err;
  };
  const toPostDto = (p, includeBody = false) => {
    const likesCount = store.likes.filter((l) => l.postId === p.id).length;
    const commentsCount = store.comments.filter((c) => c.postId === p.id).length;
    const liked = store.likes.some((l) => l.postId === p.id && l.userId === id);
    const item = {
      id: p.id,
      category: p.category,
      title: p.title,
      authorName: p.authorName,
      authorDisplay: p.authorPhone ? formatPhone(p.authorPhone) : '',
      mine: p.authorId === id,
      views: p.views || 0,
      likesCount,
      commentsCount,
      liked,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
    if (includeBody) item.body = p.body;
    return item;
  };
  const toCommentDto = (c) => ({
    id: c.id,
    postId: c.postId,
    authorName: c.authorName,
    authorDisplay: c.authorPhone ? formatPhone(c.authorPhone) : '',
    body: c.body,
    createdAt: c.createdAt,
    mine: c.authorId === id,
  });

  if (op === 'list') {
    const cat = String(extra.category || 'all');
    const filterCat = BOARD_CATS.has(cat) ? cat : null;
    const filtered = store.posts
      .filter((p) => (!filterCat ? true : p.category === filterCat))
      .sort((a, b) => {
        if (!filterCat) {
          const na = a.category === 'notice' ? 0 : 1;
          const nb = b.category === 'notice' ? 0 : 1;
          if (na !== nb) return na - nb;
        }
        return b.id - a.id;
      });
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / BOARD_PAGE_SIZE));
    const page = Math.min(Math.max(1, Math.floor(Number(extra.page) || 1)), totalPages);
    const offset = (page - 1) * BOARD_PAGE_SIZE;
    const items = filtered.slice(offset, offset + BOARD_PAGE_SIZE).map((p) => toPostDto(p, false));
    return { ok: true, category: filterCat || 'all', page, pageSize: BOARD_PAGE_SIZE, total, totalPages, items };
  }

  if (op === 'get') {
    const postId = Math.floor(Number(extra.postId) || 0);
    const post = store.posts.find((p) => p.id === postId);
    if (!post) fail('post_not_found');
    if (!extra.noView) {
      post.views = (post.views || 0) + 1;
      saveLocalBoardStore(store);
    }
    const comments = store.comments
      .filter((c) => c.postId === postId)
      .sort((a, b) => a.id - b.id)
      .map(toCommentDto);
    return { ok: true, post: toPostDto(post, true), comments };
  }

  if (op === 'like') {
    const postId = Math.floor(Number(extra.postId) || 0);
    const post = store.posts.find((p) => p.id === postId);
    if (!post) fail('post_not_found');
    const idx = store.likes.findIndex((l) => l.postId === postId && l.userId === id);
    let liked = false;
    if (idx >= 0) {
      store.likes.splice(idx, 1);
      liked = false;
    } else {
      store.likes.push({ postId, userId: id, createdAt: Date.now() });
      liked = true;
    }
    saveLocalBoardStore(store);
    const likesCount = store.likes.filter((l) => l.postId === postId).length;
    return { ok: true, postId, liked, likesCount };
  }

  if (op === 'comment_create') {
    const postId = Math.floor(Number(extra.postId) || 0);
    const post = store.posts.find((p) => p.id === postId);
    if (!post) fail('post_not_found');
    const body = String(extra.body || '').trim().slice(0, 500);
    if (!body) fail('empty');
    const authorName = String(extra.name || session?.name || '로컬테스터').trim().slice(0, 16) || '로컬테스터';
    const comment = {
      id: store.nextCommentId++,
      postId,
      authorId: id,
      authorPhone: session?.phone || '',
      authorName,
      body,
      createdAt: Date.now(),
    };
    store.comments.push(comment);
    saveLocalBoardStore(store);
    const commentsCount = store.comments.filter((c) => c.postId === postId).length;
    return { ok: true, comment: toCommentDto(comment), commentsCount };
  }

  if (op === 'comment_delete') {
    const commentId = Math.floor(Number(extra.commentId) || 0);
    const idx = store.comments.findIndex((c) => c.id === commentId);
    if (idx < 0) fail('comment_not_found');
    const target = store.comments[idx];
    if (target.authorId !== id) fail('forbidden');
    store.comments.splice(idx, 1);
    saveLocalBoardStore(store);
    const commentsCount = store.comments.filter((c) => c.postId === target.postId).length;
    return { ok: true, postId: target.postId, commentsCount };
  }

  if (op === 'create') {
    const cat = String(extra.category || 'free');
    if (!WRITABLE_BOARD_CATS.has(cat)) fail('bad_category');
    const title = String(extra.title || '').trim().slice(0, 80);
    if (!title) fail('bad_title');
    const body = String(extra.body || '').trim().slice(0, 2000);
    if (!body) fail('empty');
    const authorName = String(extra.name || session?.name || '로컬테스터').trim().slice(0, 16) || '로컬테스터';
    const now = Date.now();
    const post = {
      id: store.nextPostId++,
      category: cat,
      title,
      body,
      authorId: id,
      authorPhone: session?.phone || '',
      authorName,
      views: 0,
      createdAt: now,
      updatedAt: now,
    };
    store.posts.push(post);
    saveLocalBoardStore(store);
    return { ok: true, post: toPostDto(post, true), comments: [] };
  }

  if (op === 'update') {
    const postId = Math.floor(Number(extra.postId) || 0);
    const post = store.posts.find((p) => p.id === postId);
    if (!post) fail('post_not_found');
    if (post.authorId !== id) fail('forbidden');
    const cat = post.category === 'notice' ? 'notice' : String(extra.category || post.category);
    if (cat !== 'notice' && !WRITABLE_BOARD_CATS.has(cat)) fail('bad_category');
    const title = String(extra.title || '').trim().slice(0, 80);
    if (!title) fail('bad_title');
    const body = String(extra.body || '').trim().slice(0, 2000);
    if (!body) fail('empty');
    post.category = cat;
    post.title = title;
    post.body = body;
    post.updatedAt = Date.now();
    saveLocalBoardStore(store);
    const comments = store.comments
      .filter((c) => c.postId === postId)
      .sort((a, b) => a.id - b.id)
      .map(toCommentDto);
    return { ok: true, post: toPostDto(post, true), comments };
  }

  if (op === 'delete') {
    const postId = Math.floor(Number(extra.postId) || 0);
    const idx = store.posts.findIndex((p) => p.id === postId);
    if (idx < 0) fail('post_not_found');
    if (store.posts[idx].authorId !== id) fail('forbidden');
    store.posts.splice(idx, 1);
    store.likes = store.likes.filter((l) => l.postId !== postId);
    store.comments = store.comments.filter((c) => c.postId !== postId);
    saveLocalBoardStore(store);
    return { ok: true };
  }

  fail('server');
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
        body: JSON.stringify({ id, region: currentRegion(), ...body }),
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
        session = { off: true, phone: '', display: '', place: readLocalPlace(), unread: 0, hasPin: false, look: sanitizeLook(look), name };
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
      if (!session) return;
      if (!base || session.off) {
        writeLocalPlace(place);
        return;
      }
      post('/place', place, { keepalive: true }).catch(() => {});
    },
    threads() { return post('/threads', {}); },
    messages(withPhone) { return post('/messages', { with: withPhone }); },
    send(to, body) { return post('/send', { to, body }); },
    read(withPhone) { return post('/read', { with: withPhone }); },
    contacts(op, extra = {}) { return post('/contacts', { op, ...extra }); },
    async board(op, extra = {}) {
      if (!base) return runLocalBoard(id, session, op, extra);
      return post('/board', { op, ...extra });
    },
  };
}
