// [subway-ja] 안내 방송 일본어: 역 이름 가타카나 (한국어 발음 그대로 — 서울 지하철 일본어 안내 방송처럼)
//   - 한자 역명(예: 亭子)은 일본어 음성이 일본식으로 읽어 버려서(てい し) 쓰지 않음. 가타카나 = 귀로 들리는 역 이름 그대로
//   - JA_NAMES: 규칙으로 옮기면 어색한 이름만 고정 (지금은 노선 방면·순환만). 나머지는 hangulToKana 규칙
//   - 규칙: 첫소리 ㄱㄷㅂㅈ 은 낱말 첫머리·받침 ㄱㄷㅂ 뒤에선 맑게(カ·タ·パ·チャ), 모음·ㄴㄹㅁㅇ 받침 뒤에선 흐리게(ガ·ダ·バ·ジャ)
//           연음(받침 + ㅇ, 와·워·위 앞은 빼고), 둘째 음절부터 의 → イ, 비음화(ㅂ·ㄱ·ㄷ + ㄴㅁ, 받침 뒤 ㄹ → ㄴ), 유음화(ㄴ + ㄹ, ㄹ + ㄴ → ㄹㄹ)
const ROW = { // a i u e o
  k: ['カ', 'キ', 'ク', 'ケ', 'コ'], g: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'], n: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'], t: ['タ', 'ティ', 'トゥ', 'テ', 'ト'],
  d: ['ダ', 'ディ', 'ドゥ', 'デ', 'ド'], r: ['ラ', 'リ', 'ル', 'レ', 'ロ'], m: ['マ', 'ミ', 'ム', 'メ', 'モ'], p: ['パ', 'ピ', 'プ', 'ペ', 'ポ'],
  b: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'], s: ['サ', 'シ', 'ス', 'セ', 'ソ'], c: ['チャ', 'チ', 'チュ', 'チェ', 'チョ'], j: ['ジャ', 'ジ', 'ジュ', 'ジェ', 'ジョ'],
  h: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'], '': ['ア', 'イ', 'ウ', 'エ', 'オ'],
};
// 첫소리 19자: [맑은, 흐린(모음·ㄴㄹㅁㅇ 뒤)]
const INI = [['k', 'g'], ['k', 'k'], ['n', 'n'], ['t', 'd'], ['t', 't'], ['r', 'r'], ['m', 'm'], ['p', 'b'], ['p', 'p'], ['s', 's'], ['s', 's'], ['', ''], ['c', 'j'], ['c', 'c'], ['c', 'c'], ['k', 'k'], ['t', 't'], ['p', 'p'], ['h', 'h']];
// 가운데소리 21자 → [종류, 모음 칸] 종류: '' 홑 · y 이중(야·여·요·유·예) · w (와·워·웨·위) · ui (의)
const MED = [['', 0], ['', 3], ['y', 0], ['y', 3], ['', 4], ['', 3], ['y', 4], ['y', 3], ['', 4], ['w', 0], ['w', 3], ['w', 3], ['y', 4], ['', 2], ['w', 4], ['w', 3], ['w', 1], ['y', 2], ['', 2], ['ui', 1], ['', 1]];
const SMALL_Y = ['ャ', '', 'ュ', 'ェ', 'ョ'], SMALL_W = ['ァ', 'ィ', '', 'ェ', 'ォ'];
const W_BARE = ['ワ', 'ウィ', 'ウ', 'ウェ', 'ウォ'], Y_BARE = ['ヤ', 'イ', 'ユ', 'イェ', 'ヨ'];
// 받침 28자 → 대표음 k n t l m p ng (0 = 없음)
const FIN = [0, 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
// 연음 때 넘어가는 첫소리 번호 (받침 → 다음 ㅇ 자리)
const LIAISON = { 1: 0, 2: 1, 4: 2, 7: 3, 8: 5, 16: 6, 17: 7, 19: 9, 20: 10, 22: 12, 23: 14, 24: 15, 25: 16, 26: 17 };
const FIN_KANA = { k: 'ク', n: 'ン', t: 'ッ', l: 'ル', m: 'ム', p: 'プ', ng: 'ン' };

function kana(con, kind, v) {
  const r = ROW[con];
  if (kind === '') return r[v];
  if (kind === 'ui') return con ? r[1] : 'ウィ';
  if (kind === 'y') {
    if (!con) return Y_BARE[v];
    if (con === 'c' || con === 'j' || con === 's') return r[v === 3 ? 3 : v]; // 쟈=자, 셔=쇼 쪽
    if (v === 3) return r[3]; // 계·혜 → ケ·ヘ
    return r[1].replace('ィ', '') + SMALL_Y[v];
  }
  if (!con) return W_BARE[v]; // w
  const u = con === 'h' ? 'フ' : r[2];
  return v === 2 ? u : u + SMALL_W[v];
}

const DIGIT = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']; // 역 이름 속 숫자(을지로3가) = 한자어 수로 읽음
const ASP = { 0: 15, 3: 16, 7: 17, 12: 14 }; // ㄱㄷㅂㅈ → ㅋㅌㅍㅊ (거센소리되기)
export function hangulToKana(str) {
  const out = [];
  for (const word of String(str || '').replace(/[0-9]/g, (d) => DIGIT[+d]).split(/(\s+|[·・,，()（）-])/)) {
    const syl = [...word].map((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? { i: Math.floor(c / 588), m: Math.floor((c % 588) / 28), f: c % 28 } : { raw: ch }; });
    if (syl.some((s) => s.raw)) { out.push(syl.map((s) => (s.raw ? (s.raw === '·' ? '・' : s.raw) : kana(INI[s.i][0], MED[s.m][0], MED[s.m][1]) + (s.f ? FIN_KANA[FIN[s.f]] : ''))).join('')); continue; }
    // 소리 바뀜 먼저 (앞 받침 ↔ 뒤 첫소리)
    for (let k = 0; k + 1 < syl.length; k++) {
      const a = syl[k], b = syl[k + 1];
      if (a.f && b.i === 11 && LIAISON[a.f] != null && MED[b.m][0] !== 'w') { b.i = LIAISON[a.f]; b.voiced = true; a.f = 0; continue; } // 연음
      const fa = FIN[a.f];
      if (b.i === 18 && (fa === 'k' || fa === 'p' || fa === 't')) { b.i = fa === 'k' ? 15 : fa === 'p' ? 17 : 14; a.f = 0; continue; } // ㄱ·ㅂ·ㄷ + ㅎ → ㅋ·ㅍ·ㅊ
      if (a.f === 27 && ASP[b.i] != null) { b.i = ASP[b.i]; a.f = 0; continue; } // ㅎ 받침 + ㄱㄷㅈ
      if (b.i === 5 && fa && fa !== 'l') { if (fa === 'n') { a.f = 8; } else b.i = 2; } // 받침 뒤 ㄹ → ㄴ (ㄴ+ㄹ → ㄹㄹ)
      if (fa === 'l' && b.i === 2) b.i = 5; // ㄹ+ㄴ → ㄹㄹ
      const fb = FIN[a.f];
      if ((b.i === 2 || b.i === 6) && fb === 'k') a.f = 21; else if ((b.i === 2 || b.i === 6) && fb === 'p') a.f = 16; else if ((b.i === 2 || b.i === 6) && fb === 't') a.f = 4;
    }
    let s = '';
    syl.forEach((q, k) => {
      const prev = k > 0 ? syl[k - 1] : null;
      const soft = q.voiced || (prev && (!prev.f || ['n', 'l', 'm', 'ng'].includes(FIN[prev.f])));
      const con = INI[q.i][soft ? 1 : 0];
      const kind = MED[q.m][0] === 'ui' && k > 0 ? '' : MED[q.m][0]; // 둘째 음절부터 '의' = [이] (여의도 → ヨイド)
      s += kana(con, kind, MED[q.m][1]) + (q.f ? FIN_KANA[FIN[q.f]] : '');
    });
    out.push(s);
  }
  return out.join('');
}

// 규칙만으로는 안 맞는 이름 (방면·순환)
export const JA_NAMES = Object.freeze({ 내선순환: '内回り', 외선순환: '外回り', 학여울: 'ハンニョウル' }); // 학여울 = [항녀울] (ㄴ 덧남)
const jaCache = new Map();
export function jaName(ko) {
  if (!ko) return '';
  if (JA_NAMES[ko]) return JA_NAMES[ko];
  let v = jaCache.get(ko);
  if (v == null) { v = hangulToKana(ko); jaCache.set(ko, v); }
  return v;
}
// '왕십리 방면' → 'ワンシムニ方面', '수원·인천 방면' → 'スウォン・インチョン方面', '내선순환' → '内回り'
export function jaDir(dirKo) {
  const s = String(dirKo || '').trim();
  if (!s) return '';
  if (JA_NAMES[s]) return JA_NAMES[s];
  const m = s.match(/^(.*?)\s*방면$/);
  return m ? m[1].split('·').map((x) => jaName(x.trim())).join('・') + '方面' : jaName(s);
}
