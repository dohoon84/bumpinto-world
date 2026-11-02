// [camera] 뉴스 제보 — 번호 서버(server/phone)의 POST /news-tip 으로 사진+캡션을 보낸다.
// 서버는 받은 제보를 '검토 대기(pending)'로만 쌓고 자동으로 게시하지 않는다(가짜 뉴스 방지).
// 번호 서버가 없는 로컬 모드이거나 서버가 아직 이 경로를 모르면(배포 전 404) 알기 쉬운 오류를 낸다.
import { encodeTip } from './media.js';
import { tr } from '../i18n.js';

export const TIP_CAPTION_MIN = 2;
export const TIP_CAPTION_MAX = 120;

const MESSAGES = {
  no_server: ['번호 서버 없이 접속한 상태라 제보를 보낼 수 없어요. 사진은 저장하거나 내려받을 수 있어요.', 'News tips need the phone server, which is off in this session. You can still save or download the photo.'],
  offline: ['서버에 연결되지 않았어요. 잠시 후 다시 시도해 주세요.', 'Could not reach the server. Please try again later.'],
  not_deployed: ['뉴스 제보 서버가 아직 준비되지 않았어요. 사진은 저장해 두고 나중에 다시 제보해 주세요.', 'The news tip server is not ready yet. Save the photo and try again later.'],
  empty: [`캡션을 ${TIP_CAPTION_MIN}자 이상 적어 주세요.`, `Please write a caption (at least ${TIP_CAPTION_MIN} characters).`],
  tip_rate: ['제보는 하루 5건까지 보낼 수 있어요.', 'You can send up to 5 tips per day.'],
  tip_full: ['검토 대기 중인 제보가 많아 잠시 받지 않아요. 나중에 다시 시도해 주세요.', 'Too many tips are waiting for review. Please try again later.'],
  too_big: ['사진 용량이 너무 커요.', 'The photo is too large.'],
  bad_image: ['사진 형식이 올바르지 않아요.', 'The photo format is not supported.'],
  not_found: ['번호가 아직 없어요. 다시 입장해 주세요.', 'No phone number yet. Please re-enter the world.'],
  bad_id: ['기기 정보가 올바르지 않아요. 다시 입장해 주세요.', 'Device ID is invalid. Please re-enter the world.'],
};

export function tipErrorText(code) {
  const m = MESSAGES[code];
  return m ? tr(m[0], m[1]) : tr('제보를 보내지 못했어요.', 'Could not send the tip.');
}

function fail(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

export function cleanCaption(text, max = TIP_CAPTION_MAX) {
  return String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** @returns {Promise<{ tipId: number }>} */
export async function sendNewsTip({ sms, blob, caption, takenAt, info }) {
  const text = cleanCaption(caption);
  if (text.length < TIP_CAPTION_MIN) throw fail('empty');
  const base = sms?.base;
  if (!base || !sms?.session || sms.session.off) throw fail('no_server');
  const { image, w, h } = await encodeTip(blob);
  let res;
  try {
    res = await fetch(`${base}/news-tip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'submit', id: sms.id, region: info?.region || 'jeongja',
        caption: text, image, w, h, takenAt: takenAt || Date.now(),
        x: Number.isFinite(info?.x) ? Math.round(info.x) : null,
        z: Number.isFinite(info?.z) ? Math.round(info.z) : null,
      }),
    });
  } catch {
    throw fail('offline');
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 404) throw fail('not_deployed'); // 서버 오류는 400/500, 404 는 아직 이 경로가 없는 옛 서버뿐
  if (!res.ok || !data?.ok) throw fail(data?.error || 'server');
  return { tipId: data.tipId };
}
