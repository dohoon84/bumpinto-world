// [subway] 출구·환승 방면 고르기 배지.
//   #subway-chooser .n 이 38×38, line-height 38px 이고 nowrap 이 없으면
//   '신분당'(3) '수인분당'(4) '2호선' 같은 short 가 두 줄로 접히고, 둘째 줄이 배지 아래로 새어
//   다음 줄 배지 옆에 겹친다. 글자 수에 맞춰 크기를 줄이고 한 줄로만 둔다.
//   1–2자: 출구 번호 24px · 환승 노선 15px (지금과 같음). 3자·4자는 더 작게, 칸은 글자만큼 넓어진다.
export const CHOOSER_BADGE_PX = Object.freeze({
  exit: Object.freeze({ short: 24, n3: 16, n4: 13 }),
  line: Object.freeze({ short: 15, n3: 13, n4: 11 }),
});

export function chooserBadgeSpec(label, kind = 'exit') {
  const n = Array.from(String(label ?? '')).length;
  const bucket = Math.min(4, Math.max(1, n));
  const t = CHOOSER_BADGE_PX[kind] || CHOOSER_BADGE_PX.exit;
  const px = bucket <= 2 ? t.short : bucket === 3 ? t.n3 : t.n4;
  return { n, bucket, px, kind: CHOOSER_BADGE_PX[kind] ? kind : 'exit' };
}

export function chooserBadgeSpan(label, { kind = 'exit', bg, color } = {}) {
  const { bucket } = chooserBadgeSpec(label, kind);
  const style = [];
  if (bg) style.push(`background:${bg}`);
  if (color) style.push(`color:${color}`);
  const st = style.length ? ` style="${style.join(';')}"` : '';
  return `<span class="n" data-k="${kind}" data-n="${bucket}"${st}>${label ?? ''}</span>`;
}

// PC 주입 스타일. 모바일(src/mobile/mobile.css)도 같은 크기·nowrap 을 다시 적는다.
export function chooserBadgeCss() {
  const E = CHOOSER_BADGE_PX.exit, L = CHOOSER_BADGE_PX.line;
  return `#subway-chooser .n{flex:0 0 auto;display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-width:38px;width:max-content;max-width:100%;height:38px;padding:0 6px;border-radius:7px;background:#FFC20E;color:#111;font:900 ${E.short}px/38px system-ui,sans-serif;text-align:center;white-space:nowrap;overflow:hidden}`
    + `#subway-chooser .n[data-k=line]{font-size:${L.short}px}`
    + `#subway-chooser .n[data-k=line][data-n="3"]{font-size:${L.n3}px}`
    + `#subway-chooser .n[data-k=line][data-n="4"]{font-size:${L.n4}px}`
    + `#subway-chooser .n[data-k=exit][data-n="3"]{font-size:${E.n3}px}`
    + `#subway-chooser .n[data-k=exit][data-n="4"]{font-size:${E.n4}px}`;
}
