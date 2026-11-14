// [place-guide] 장소 여행 가이드 UI (DOM 만 — 3D draw 0). 데이터 = place-guide/1 JSON (public/guides/<id>.json).
//   디자인 v2 (/workspace/ndm-guide/ui/v2, 도훈 승인): 인쇄 여행안내서 + 지하철 표지. 카드 대신 글자 위계·가는 선·번호.
//   채운 면은 영업시간 표와 지도 둘뿐. 강조색은 하나(#0B63CE), 4호선 하늘색은 교통 표시에만, 상태는 7 px 점 + 글자.
//   - 데스크톱: 오른쪽 패널(488) + 글자 탭. 모바일 가로: 왼쪽 레일(76) + 아래 띠(한 줄 요약). 뒤 게임 화면은 그대로 보인다.
//   - EN/KO 는 가이드 안에서만 바꾼다(게임 언어는 그대로). 모든 버튼 ≥ 44 px.
//   - 출처: 확인일 + 출처 이름을 늘 보이고, 출처가 갈리는 값은 경고 점 + 'Sources differ' → 값마다 출처 목록(sheet).
// 아이콘: Lucide (ISC licence).
import { getLang } from '../i18n.js';

const ICONS = {"info": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"M12 16v-4\"/> <path d=\"M12 8h.01\"/>", "map": "<path d=\"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z\"/> <path d=\"M15 5.764v15\"/> <path d=\"M9 3.236v15\"/>", "utensils": "<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\"/> <path d=\"M7 2v20\"/> <path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\"/>", "train-front": "<path d=\"M8 3.1V7a4 4 0 0 0 8 0V3.1\"/> <path d=\"m9 15-1-1\"/> <path d=\"m15 15 1-1\"/> <path d=\"M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z\"/> <path d=\"m8 19-2 3\"/> <path d=\"m16 19 2 3\"/>", "lightbulb": "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\"/> <path d=\"M9 18h6\"/> <path d=\"M10 22h4\"/>", "toilet": "<path d=\"M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18\"/> <path d=\"M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8\"/>", "x": "<path d=\"M18 6 6 18\"/> <path d=\"m6 6 12 12\"/>", "arrow-up": "<path d=\"m5 12 7-7 7 7\"/> <path d=\"M12 19V5\"/>", "arrow-left": "<path d=\"m12 19-7-7 7-7\"/> <path d=\"M19 12H5\"/>", "corner-up-left": "<polyline points=\"9 14 4 9 9 4\"/> <path d=\"M20 20v-7a4 4 0 0 0-4-4H4\"/>", "corner-up-right": "<polyline points=\"15 14 20 9 15 4\"/> <path d=\"M4 20v-7a4 4 0 0 1 4-4h12\"/>", "chevron-right": "<path d=\"m9 18 6-6-6-6\"/>", "map-pin": "<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/> <circle cx=\"12\" cy=\"10\" r=\"3\"/>"};
const icon = (k, s = 20, w = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ''}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_EN = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const DAY_KO = { sun: '일', mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토' };

/** 현지 시각(장소 시간대). now 를 주면 그 시각 (검사용) */
export function placeClock(tz = 'Asia/Seoul', now = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
    const day = String(p.weekday || 'Mon').slice(0, 3).toLowerCase();
    const hh = String(p.hour === '24' ? '00' : p.hour).padStart(2, '0');
    return { day, hm: `${hh}:${p.minute}` };
  } catch { return { day: DAYS[now.getDay()], hm: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` }; }
}
/** derived open-now 규칙 → 상태 키 (most_open | some_open | closed_mostly | …) */
export function openState(status, clock) {
  for (const r of status?.rules || []) if (r.days.includes(clock.day) && clock.hm >= r.from && clock.hm < r.to) return r.state;
  return 'closed_mostly';
}
const DOT = { most_open: 'ok', some_open: 'warn', night_wholesale: 'warn', closed_mostly: 'stop' };

const CSS = `
#pg-root{position:fixed;inset:0;pointer-events:none;z-index:140;font-family:Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#111418;font-feature-settings:"tnum" 1;-webkit-font-smoothing:antialiased;
 --paper:#FBFAF7;--ink:#111418;--ink-2:#3A4048;--muted:#6E747C;--hair:#E2DFD7;--hair-2:#CFCBC1;--tint:#F2F0EA;--accent:#0B63CE;--accent-p:#0950A8;--l4:#00A5DE;--ok:#1E9E50;--warn:#C98A00;--stop:#C8372D;--sh:0 0 0 1px rgba(0,0,0,.08),0 10px 30px rgba(0,0,0,.16)}
#pg-root *{box-sizing:border-box}
#pg-root button{font:inherit;color:inherit;background:none;border:0;margin:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
#pg-root button:focus-visible,#pg-root a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
#pg-root .sc{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
#pg-root .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:1px;flex:none}
#pg-root .dot.ok{background:var(--ok)}#pg-root .dot.warn{background:var(--warn)}#pg-root .dot.stop{background:var(--stop)}
#pg-root .l4{display:inline-flex;align-items:center;gap:6px}
#pg-root .l4 i{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--l4);color:#fff;font-style:normal;font-size:11px;font-weight:800;flex:none}
#pg-root .src{font-size:11px;color:var(--muted);line-height:1.45}
#pg-root .src b{color:var(--ink-2);font-weight:600}
#pg-root .warnt{color:var(--warn);font-weight:600}
#pg-root .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:3px;font-size:13.5px;font-weight:700;white-space:nowrap}
#pg-root .btn.pri{background:var(--accent);color:#fff}#pg-root .btn.pri:active{background:var(--accent-p)}
#pg-root .btn.sec{box-shadow:inset 0 0 0 1px var(--hair-2)}#pg-root .btn.sec:active{background:var(--tint)}
#pg-root .link{color:var(--accent);font-weight:700;font-size:13px;white-space:nowrap;min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:flex-end}
#pg-root .link:hover{text-decoration:underline;text-underline-offset:3px}
#pg-root .tog{display:flex;align-items:center;font-size:12px;font-weight:600;color:var(--muted)}
#pg-root .tog button{min-width:44px;height:44px;display:flex;align-items:center;justify-content:center}
#pg-root .tog button span{display:inline-block;padding:7px 2px 6px}
#pg-root .tog button.on{color:var(--ink)}#pg-root .tog button.on span{box-shadow:inset 0 -2px 0 var(--ink)}
#pg-root .tog b{color:var(--hair-2);font-weight:400}
#pg-root .x{width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:var(--ink)}
/* ---- 데스크톱 패널 ---- */
#pg-root .pg-panel{position:absolute;top:16px;right:16px;bottom:16px;width:488px;max-width:calc(100vw - 32px);background:var(--paper);border-radius:3px;box-shadow:var(--sh);display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;
 opacity:0;transform:translateX(24px);transition:opacity .16s cubic-bezier(.4,0,1,1),transform .16s cubic-bezier(.4,0,1,1);visibility:hidden}
#pg-root .pg-panel.on{opacity:1;transform:none;visibility:visible;transition:opacity .22s cubic-bezier(.2,.7,.2,1),transform .22s cubic-bezier(.2,.7,.2,1)}
#pg-root .hd{padding:14px 18px 0 28px}
#pg-root .r1{display:flex;align-items:center;justify-content:space-between;height:44px}
#pg-root .r1 .b{display:flex;align-items:center;gap:8px}
#pg-root .r1 .rt{display:flex;align-items:center;gap:4px}
#pg-root .logo{width:16px;height:16px;border-radius:3px;background:var(--accent);color:#fff;font-size:10px;font-weight:900;display:inline-flex;align-items:center;justify-content:center}
#pg-root h1{font-size:30px;font-weight:800;letter-spacing:-.025em;margin:4px 0 0;line-height:1.1}
#pg-root .sub{font-size:14px;color:var(--muted);margin-top:4px}
#pg-root .status{display:flex;gap:18px;align-items:center;margin-top:12px;font-size:13px;color:var(--muted);flex-wrap:wrap}
#pg-root .status .st{font-weight:600;color:var(--ink)}
#pg-root .tabs{display:flex;gap:18px;margin:16px 28px 0;border-top:1px solid var(--ink);border-bottom:1px solid var(--hair);position:relative}
#pg-root .tab{height:44px;min-width:44px;justify-content:center;display:flex;align-items:center;font-size:13px;font-weight:600;color:var(--muted);position:relative;white-space:nowrap}
#pg-root .tab:hover{color:var(--ink)}#pg-root .tab.on{color:var(--ink)}
#pg-root .tabs .rule{position:absolute;bottom:-1px;height:2px;background:var(--accent);left:0;width:0;transition:transform .14s cubic-bezier(.2,.7,.2,1),width .14s}
#pg-root .bd{flex:1;overflow:auto;padding:18px 28px 18px;scrollbar-width:thin;overscroll-behavior:contain}
#pg-root .bd.fade{animation:pgfade .14s ease-out}
@keyframes pgfade{from{opacity:.2}to{opacity:1}}
#pg-root .ft{display:flex;gap:16px;justify-content:space-between;align-items:center;padding:0 28px;min-height:44px;border-top:1px solid var(--hair)}
#pg-root .ft button.src{text-align:left;min-height:44px}
#pg-root .lead{font-size:14.5px;line-height:1.5;color:var(--ink-2);margin:0}
#pg-root .facts{display:grid;grid-template-columns:1fr 1fr 1.4fr;margin-top:14px;border-top:1px solid var(--hair);border-bottom:1px solid var(--hair)}
#pg-root .facts.n2{grid-template-columns:1.3fr 1fr}
#pg-root .facts>div{padding:8px 0 8px 14px;border-left:1px solid var(--hair);min-width:0}#pg-root .facts>div:first-child{padding-left:0;border-left:0}
#pg-root .facts .v{display:flex;align-items:center;gap:6px;font-size:19px;font-weight:700;letter-spacing:-.01em;margin-top:3px;white-space:nowrap}
#pg-root .facts small{display:block;font-size:11.5px;color:var(--muted)}
#pg-root .facts button{text-align:left;display:block;width:100%;min-height:44px}
#pg-root .box{background:var(--tint);padding:10px 16px;margin-top:14px;border-radius:2px}
#pg-root .bh{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px}
#pg-root .bh .sc.k{color:var(--ink)}
#pg-root .bh button.src{min-height:44px;padding:12px 0;margin:-12px 0}
#pg-root table{width:100%;border-collapse:collapse;font-size:13px}
#pg-root th{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:left;padding:4px 0;border-bottom:1px solid var(--hair-2)}
#pg-root td{padding:6px 0;border-bottom:1px solid var(--hair)}
#pg-root td.t,#pg-root th.t{text-align:right;width:96px;font-variant-numeric:tabular-nums}
#pg-root tr:last-child td{border-bottom:0}
#pg-root td.today,#pg-root th.today{font-weight:700;color:var(--ink)}
#pg-root .mapw{margin-top:16px}
#pg-root .mapw svg{display:block;width:100%;height:auto;border-radius:2px}
#pg-root .list{margin-top:2px}
#pg-root .item{display:grid;grid-template-columns:34px minmax(0,1fr) auto;column-gap:8px;padding:12px 0;border-bottom:1px solid var(--hair)}
#pg-root .item.sel{box-shadow:inset 3px 0 0 var(--accent);padding-left:8px}
#pg-root .item .n{font-size:20px;font-weight:300;color:var(--muted);line-height:1.15}
#pg-root .item.sel .n{color:var(--accent)}
#pg-root .item h3{font-size:16px;font-weight:800;letter-spacing:-.01em;margin:0}
#pg-root .item h3 .kr{font-size:12.5px;margin-left:6px;color:var(--muted);font-weight:500}
#pg-root .item p{font-size:13px;line-height:1.45;color:var(--ink-2);margin:3px 0 0}
#pg-root .meta{display:flex;flex-wrap:wrap;row-gap:2px;margin-top:6px;font-size:11.5px;color:var(--ink-2)}
#pg-root .meta>*{white-space:nowrap;padding:0 10px;border-left:1px solid var(--hair-2)}#pg-root .meta>*:first-child{padding-left:0;border-left:0}
#pg-root .meta .mu{color:var(--muted)}
#pg-root .meta button{font-size:11.5px;min-height:44px;margin:-10px 0}
#pg-root .gate{color:var(--warn);font-weight:600;font-size:11px;margin-left:6px}
#pg-root .say{margin-top:16px}
#pg-root .say .q{font-size:19px;font-weight:700;margin-top:4px}
#pg-root .say .r{font-size:13px;color:var(--ink-2);margin-top:2px}
#pg-root .txt{margin-top:16px}
#pg-root .txt p{font-size:13px;line-height:1.5;color:var(--ink-2);margin:4px 0 0}
#pg-root .sheet h3{font-size:16px;font-weight:800;margin:6px 0 10px}
#pg-root .sheet .row{padding:10px 0;border-bottom:1px solid var(--hair)}
#pg-root .sheet .row b{display:block;font-size:13.5px}
#pg-root .sheet a{color:var(--accent);font-size:12px;display:block;margin-top:4px;word-break:break-word}
#pg-root .back{display:inline-flex;align-items:center;gap:6px;min-height:44px;font-size:13px;font-weight:700;color:var(--ink)}
/* ---- 모바일 가로: 레일 + 아래 띠 ---- */
#pg-root .pg-m{position:absolute;inset:0;pointer-events:none;visibility:hidden}
#pg-root .pg-m.on{visibility:visible}
#pg-root .rail{position:absolute;left:0;top:0;bottom:0;width:76px;background:var(--paper);border-right:1px solid var(--hair);display:flex;flex-direction:column;padding-top:calc(8px + env(safe-area-inset-top));pointer-events:auto;transform:translateX(-100%);transition:transform .2s cubic-bezier(.2,.7,.2,1) .04s;padding-left:env(safe-area-inset-left);width:calc(76px + env(safe-area-inset-left))}
#pg-root .pg-m.on .rail{transform:none}
#pg-root .ri{height:56px;width:76px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:10px;font-weight:600;color:var(--muted);position:relative}
#pg-root .ri.on{color:var(--ink);font-weight:800}#pg-root .ri.on:before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;background:var(--accent)}
#pg-root .ri:active{background:var(--tint)}
#pg-root .strip{position:absolute;left:calc(76px + env(safe-area-inset-left));right:0;bottom:0;background:var(--paper);border-top:1px solid var(--hair);padding:0 calc(20px + env(safe-area-inset-right)) 0 20px;pointer-events:auto;transform:translateY(100%);transition:transform .2s cubic-bezier(.2,.7,.2,1);max-height:216px;display:flex;flex-direction:column}
#pg-root .pg-m.on .strip{transform:none}
#pg-root .sh{display:flex;align-items:center;gap:12px;height:44px;border-bottom:1px solid var(--hair);flex:none;min-width:0}
#pg-root .sh h2{font-size:17px;font-weight:800;letter-spacing:-.015em;margin:0;white-space:nowrap}
#pg-root .sh .kr{font-size:12px;color:var(--muted);white-space:nowrap}
#pg-root .sh .st{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#pg-root .sh .sp{flex:1}
#pg-root .sbody{overflow:auto;flex:1;min-height:0;scrollbar-width:none;overscroll-behavior:contain}
#pg-root .mfacts{display:grid;grid-template-columns:1.1fr 1fr 1.25fr 1fr 1fr;padding:10px 0}
#pg-root .mfacts>button{padding:0 12px;border-left:1px solid var(--hair);text-align:left;min-width:0;min-height:44px}
#pg-root .mfacts>button:first-child{padding-left:0;border-left:0}
#pg-root .mfacts .sc{font-size:9.5px}
#pg-root .mfacts b{display:flex;align-items:center;gap:5px;font-size:14px;font-weight:800;margin-top:4px;letter-spacing:-.01em;white-space:nowrap}
#pg-root .mfacts small{display:block;font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#pg-root .fb{display:flex;align-items:center;justify-content:space-between;gap:12px;height:56px;border-top:1px solid var(--hair);flex:none}
#pg-root .fb .src{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;min-height:44px}
#pg-root .mclose{position:absolute;right:calc(12px + env(safe-area-inset-right));top:calc(12px + env(safe-area-inset-top));width:44px;height:44px;background:var(--paper);border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.1);display:flex;align-items:center;justify-content:center;pointer-events:auto;opacity:0;transition:opacity .2s}
#pg-root .pg-m.on .mclose{opacity:1}
#pg-root .zw{display:grid;grid-template-columns:168px minmax(0,1fr);gap:18px;padding-top:8px}
#pg-root .zw.nomap{grid-template-columns:minmax(0,1fr)}
#pg-root .zl{display:grid;grid-template-columns:1fr 1fr;column-gap:20px}
#pg-root .zr{display:grid;grid-template-columns:24px minmax(0,1fr) auto 14px;align-items:center;min-height:44px;border-bottom:1px solid var(--hair);font-size:13px;gap:4px;text-align:left;width:100%}
#pg-root .zr:active{background:var(--tint)}
#pg-root .zr .n{font-size:12px;font-weight:700;color:var(--muted)}
#pg-root .zr .nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#pg-root .zr .tm{font-size:12px;color:var(--ink-2);white-space:nowrap}
#pg-root .zr .tm.mu{color:var(--muted)}
#pg-root .zr .ch{color:var(--muted)}
#pg-root .zr.sel{box-shadow:inset 3px 0 0 var(--accent);padding-left:8px}#pg-root .zr.sel .n{color:var(--accent)}
#pg-root .flt{display:flex;gap:16px;font-size:12.5px;font-weight:600;color:var(--muted)}
#pg-root .flt button{height:44px;display:flex;align-items:center}#pg-root .flt button.on{color:var(--ink);box-shadow:inset 0 -2px 0 var(--ink)}
#pg-root .mdet{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:10px 0}
#pg-root .mdet h3{font-size:15px;font-weight:800;margin:0}
#pg-root .mdet p{font-size:12.5px;line-height:1.45;color:var(--ink-2);margin:3px 0 0}
/* ---- 들어가기 안내 (월드 표지 라벨) ---- */
#pg-root .tag{position:absolute;left:0;top:0;display:flex;align-items:stretch;background:#fff;border-radius:2px;box-shadow:0 1px 0 rgba(0,0,0,.15),0 6px 16px rgba(0,0,0,.18);pointer-events:auto;opacity:0;transition:opacity .18s;will-change:transform;min-height:44px;text-align:left}
#pg-root .tag.on{opacity:1}
#pg-root .tag .i{width:44px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;font-family:Georgia,serif;font-style:italic;border-radius:2px 0 0 2px}
#pg-root .tag .tx{padding:7px 14px 7px 12px}
#pg-root .tag .t{font-size:15px;font-weight:800;letter-spacing:-.01em;white-space:nowrap}
#pg-root .tag .sc{margin-top:3px;display:block}
#pg-root .tag:after{content:"";position:absolute;left:50%;bottom:-7px;margin-left:-7px;border:7px solid transparent;border-bottom:0;border-top-color:#fff}
#pg-root .pghint{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);background:rgba(17,20,24,.82);color:#fff;font-size:12.5px;font-weight:600;border-radius:2px;padding:8px 14px;white-space:nowrap;opacity:0;transition:opacity .18s}
#pg-root .pghint.on{opacity:1}
#pg-root .pghint kbd{display:inline-block;min-width:18px;text-align:center;border:1px solid rgba(255,255,255,.6);border-radius:2px;margin:0 3px;font-size:11px;font-family:inherit}
/* ---- 길 안내 ---- */
#pg-root .nav{position:absolute;left:16px;top:16px;width:392px;background:var(--paper);border-radius:3px;box-shadow:var(--sh);overflow:hidden;pointer-events:auto;display:none}
#pg-root .sign{background:var(--ink);color:#fff;border-radius:2px;display:flex;align-items:center;min-width:0}
#pg-root .nav .sign{height:84px;border-radius:0}
#pg-root .sign .arr{display:flex;align-items:center;justify-content:center;border-right:1px solid rgba(255,255,255,.18);flex:none}
#pg-root .sign .arr svg{transition:transform .12s}
#pg-root .nav .sign .arr{width:84px;height:84px}
#pg-root .sign .ins{padding:0 18px;min-width:0}
#pg-root .sign b{display:block;font-size:17px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#pg-root .sign .sc{color:rgba(255,255,255,.65);margin-top:5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#pg-root .steps{padding:8px 20px 4px}
#pg-root .stp{display:grid;grid-template-columns:28px 1fr auto;align-items:center;min-height:36px;font-size:13px;color:var(--muted);border-bottom:1px solid var(--hair)}
#pg-root .stp:last-child{border-bottom:0}
#pg-root .stp .k{font-weight:800;font-size:12px}
#pg-root .stp.done{text-decoration:line-through;text-decoration-color:var(--hair-2)}
#pg-root .stp.now{color:var(--ink);font-weight:700}#pg-root .stp.now .k{color:var(--accent)}
#pg-root .stp .d{font-size:12px;color:var(--muted);font-weight:500}
#pg-root .nav .src.f{padding:6px 20px 12px;border-top:1px solid var(--hair)}
#pg-root .openg{position:absolute;right:16px;top:96px;min-height:44px;padding:0 14px;display:none;align-items:center;gap:8px;background:var(--paper);border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.1);font-size:13px;font-weight:700;pointer-events:auto}
#pg-root .eta{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:none;align-items:stretch;background:var(--paper);border-radius:3px;box-shadow:var(--sh);min-height:60px;pointer-events:auto}
#pg-root .eta>div{display:flex;flex-direction:column;justify-content:center;padding:0 20px;border-left:1px solid var(--hair)}#pg-root .eta>div:first-child{border-left:0}
#pg-root .eta .big{font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1;white-space:nowrap}
#pg-root .eta .v{font-size:14px;font-weight:700;white-space:nowrap}
#pg-root .eta .e{padding:0 8px}
#pg-root .dest{position:absolute;left:0;top:0;display:none;flex-direction:column;align-items:center;will-change:transform}
#pg-root .dest .lb{background:var(--ink);color:#fff;padding:7px 12px;border-radius:2px;font-size:13px;font-weight:800;white-space:nowrap}
#pg-root .dest .lb span{font-weight:500;color:rgba(255,255,255,.7);margin-left:8px}
#pg-root .dest .stem{width:2px;height:22px;background:var(--ink)}
#pg-root .dest .dia{width:11px;height:11px;background:var(--ink);transform:rotate(45deg);margin-top:-5px}
#pg-root .msign{position:absolute;left:50%;top:calc(8px + env(safe-area-inset-top));transform:translateX(-50%);height:60px;display:none;pointer-events:auto;max-width:calc(100vw - 24px);overflow:hidden}
#pg-root .msign .arr{width:60px;height:60px}
#pg-root .msign .ins{padding:0 14px 0 14px}
#pg-root .msign b{font-size:15px}
#pg-root .msign .sc{font-size:9.5px;margin-top:3px}
#pg-root .msign .cell{width:60px;height:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-left:1px solid rgba(255,255,255,.18);font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#fff;flex:none}
#pg-root .msign .cell:active{background:rgba(255,255,255,.12)}
#pg-root .msign .prog{position:absolute;left:0;bottom:0;height:2px;background:var(--accent);width:0}
#pg-root .pgtoast{position:absolute;left:50%;top:84px;transform:translate(-50%,-6px);opacity:0;transition:opacity .2s,transform .2s;background:var(--ink);color:#fff;padding:10px 16px;border-radius:2px;font-size:14px;font-weight:800;white-space:nowrap}
#pg-root .pgtoast small{display:block;font-size:11.5px;font-weight:600;color:rgba(255,255,255,.7);margin-top:2px}
#pg-root .pgtoast.on{opacity:1;transform:translate(-50%,0)}
@media (prefers-reduced-motion: reduce){#pg-root *{transition-property:opacity !important;animation:none !important}#pg-root .pg-panel,#pg-root .pg-panel.on,#pg-root .rail,#pg-root .strip{transform:none !important}}
`;

const T = (o, L) => (o == null ? '' : typeof o === 'string' ? o : (o[L] ?? o.en ?? ''));

/**
 * @param {{ mobile?: boolean, onRoute?: (spotId:string)=>void, onEndRoute?: ()=>void, onOpenChange?: (open:boolean)=>void, mapData?: ()=>any, distTo?: (spotId:string)=>number|null }} o
 */
export function createPlaceGuideUI(o = {}) {
  if (typeof document === 'undefined') return null;
  const mobile = !!o.mobile;
  if (!document.getElementById('pg-style')) { const st = document.createElement('style'); st.id = 'pg-style'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div'); root.id = 'pg-root'; document.body.appendChild(root);
  root.innerHTML = `<div class="pg-panel" role="dialog" aria-modal="false" aria-label="Travel guide"></div><div class="pg-m" role="dialog" aria-modal="false" aria-label="Travel guide"></div>
   <button class="tag" type="button"><span class="i">i</span><span class="tx"><span class="t"></span><span class="sc"></span></span></button><div class="pghint"></div>
   <div class="nav" role="region" aria-label="Directions"></div><button class="openg" type="button">${icon('info', 16, 2)}<span></span></button><div class="eta"></div>
   <div class="dest"><div class="lb"></div><div class="stem"></div><div class="dia"></div></div><div class="sign msign" role="region" aria-label="Directions"></div><div class="pgtoast" role="status" aria-live="polite"></div>`;
  const $ = (s) => root.querySelector(s);
  const panel = $('.pg-panel'), mroot = $('.pg-m'), tag = $('.tag'), hint = $('.pghint'), nav = $('.nav'), openg = $('.openg'), eta = $('.eta'), dest = $('.dest'), msign = $('.msign'), toastEl = $('.pgtoast');
  let G = null, L = getLang() === 'en' ? 'en' : 'ko', tab = 'overview', isOpen = false, sheet = null, detail = null, filter = 'all', routeOn = false, toastT = 0;
  const t = (x) => T(x, L);
  const clock = () => placeClock(G?.status?.tz);

  // ---------- 공통 조각 ----------
  const statusLine = () => {
    const c = clock(), k = openState(G.status, c);
    const d = (L === 'ko' ? DAY_KO : DAY_EN)[c.day] || c.day;
    return { k, html: `<span class="st"><span class="dot ${DOT[k] || 'warn'}"></span>${esc(t(G.status.labels[k]))}</span><span>${esc(d)} ${c.hm} KST</span><span>${esc(t(G.status.closed))}</span>` };
  };
  const toggle = () => `<div class="tog" role="group" aria-label="Language"><button type="button" data-lang="en" class="${L === 'en' ? 'on' : ''}" aria-pressed="${L === 'en'}"><span>EN</span></button><b>/</b><button type="button" data-lang="ko" class="${L === 'ko' ? 'on' : ''}" aria-pressed="${L === 'ko'}"><span>KO</span></button></div>`;
  const foot = () => `<button type="button" class="src" data-sheet="all">${esc(L === 'ko' ? '확인일' : 'Checked')} <b>${esc(G.checked)}</b> · ${esc(t(G.footer.sources))}</button><span class="src" style="white-space:nowrap">${esc(t(G.footer.soon))}</span>`;
  const valOf = (it) => {
    if (it.value && it.value.$today) {
      const c = clock(); const tb = G.tabs[0].blocks.find((b) => b.type === 'table');
      const ci = tb ? tb.cols.findIndex((cc) => cc.days.includes(c.day)) : -1; const cell = ci >= 0 ? tb.rows[0].cells[ci] : null;
      const end = cell && cell.includes('–') ? cell.split('–')[1] : null;
      return end ? (L === 'ko' ? `~${end}` : `until ${end}`) : (L === 'ko' ? '휴무' : 'closed');
    }
    return t(it.value);
  };
  // 시트(출처 목록·출처별 값) 보관: 렌더마다 id 로 찾는다
  let sheets = [];
  const sheetId = (s) => { sheets.push(s); return sheets.length - 1; };
  const srcSheet = (title, src) => ({ title, rows: [{ value: null, src }] });

  // ---------- 지도 (게임 좌표 개략도) ----------
  function mapSvg(W, H, { compact = false, sel = null } = {}) {
    const md = o.mapData?.() || {};
    const pts = [...(G.spots || []).map((s) => [s.x, s.z])];
    const a = G.anchors?.gate; if (a) pts.push([a.x, a.z]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const pad = 22; x0 -= pad; x1 += pad; z0 -= pad; z1 += pad;
    const s = Math.min(W / (x1 - x0), H / (z1 - z0)); const ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2;
    const P = (x, z) => [ox + (x - x0) * s, oz + (z - z0) * s];
    let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(L === 'ko' ? '개략 지도' : 'Schematic map')}"><rect width="${W}" height="${H}" fill="#ECEAE3"/>`;
    for (const ln of md.lines || []) {
      const ww = Math.max(2.2, Math.min(9, (ln.w || 4) * s * 0.9));
      let d = ''; for (let i = 0; i < ln.pts.length; i++) { const [x, y] = P(ln.pts[i][0], ln.pts[i][1]); d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }
      out += `<path d="${d}" stroke="#fff" stroke-width="${ww.toFixed(1)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (a) { const [gx, gy] = P(a.x, a.z); out += `<rect x="${(gx - 5).toFixed(1)}" y="${(gy - 5).toFixed(1)}" width="10" height="10" fill="#111418"/>${compact ? '' : `<text x="${gx.toFixed(1)}" y="${(gy + 17).toFixed(1)}" font-size="9.5" font-weight="700" text-anchor="middle" fill="#111418">${esc(L === 'ko' ? '시장 게이트' : 'Market gate')}</text>`}`; }
    // 번호 점은 다 그리고, 이름표는 겹치지 않는 쪽(오른쪽 → 왼쪽 → 위 → 아래)에만. 자리가 없으면 번호만
    const boxes = [];
    const hit = (b) => b.x0 < 2 || b.x1 > W - 2 || b.y0 < 2 || b.y1 > H - 2 || boxes.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0);
    const P2 = (G.spots || []).map((sp) => P(sp.x, sp.z));
    for (const [x, y] of P2) boxes.push({ x0: x - 8, x1: x + 8, y0: y - 8, y1: y + 8 });
    if (a) { const [gx, gy] = P(a.x, a.z); boxes.push({ x0: gx - 30, x1: gx + 30, y0: gy - 6, y1: gy + 20 }); }
    (G.spots || []).forEach((sp, i) => {
      const [x, y] = P2[i], on = sel === sp.id;
      let lab = '';
      if (!compact) {
        const tx = t(sp.short || sp.name).replace(/ (Street|Alley)$/, ''), tw = [...tx].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 10 : 5.6), 0);
        const tries = [[10, 4, 'start'], [-10, 4, 'end'], [0, -11, 'middle'], [0, 19, 'middle']];
        for (const [dx, dy, an] of tries) {
          const lx = an === 'start' ? x + dx : an === 'end' ? x + dx - tw : x - tw / 2;
          const b = { x0: lx - 1, x1: lx + tw + 1, y0: y + dy - 10, y1: y + dy + 3 };
          if (!hit(b)) { boxes.push(b); lab = `<text x="${dx}" y="${dy}" font-size="10" font-weight="600" fill="#111418" text-anchor="${an}">${esc(tx)}</text>`; break; }
        }
      }
      out += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="${on ? 9 : 7.5}" fill="${on ? '#0B63CE' : '#111418'}"/><text y="3.2" font-size="${on ? 10 : 9}" font-weight="800" fill="#fff" text-anchor="middle">${i + 1}</text>${lab}</g>`;
    });
    if (md.you) { const [x, y] = P(Math.max(x0, Math.min(x1, md.you.x)), Math.max(z0, Math.min(z1, md.you.z))); out += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="6.5" fill="#00A5DE" stroke="#fff" stroke-width="2"/>${compact ? '' : `<text x="-10" y="4" font-size="10" font-weight="700" text-anchor="end" fill="#111418">${esc(L === 'ko' ? '현재 위치' : 'you')}</text>`}</g>`; }
    return out + '</svg>';
  }

  // ---------- 데스크톱 블록 ----------
  function blockD(b) {
    if (b.only === 'mobile') return '';
    if (b.type === 'lead') return `<p class="lead">${esc(t(b.text))}</p>`;
    if (b.type === 'facts') {
      return `<div class="facts ${b.items.length === 2 ? 'n2' : ''}">${b.items.map((it) => {
        const sh = it.sheet ? sheetId(it.sheet) : it.src?.length ? sheetId(srcSheet(it.label, it.src)) : -1;
        const v = `<span class="sc">${esc(t(it.label))}</span><span class="v">${it.line ? `<span class="l4"><i>${esc(it.line)}</i>${esc(valOf(it))}</span>` : esc(valOf(it))}</span><small>${it.warn ? '<span class="dot warn"></span>' : ''}${esc(t(it.cap))}</small>`;
        return `<div>${sh >= 0 ? `<button type="button" data-sh="${sh}" title="${esc(L === 'ko' ? '출처 보기' : 'Sources')}">${v}</button>` : v}</div>`;
      }).join('')}</div>`;
    }
    if (b.type === 'table') {
      const c = clock(); const ti = b.cols.findIndex((cc) => cc.days.includes(c.day));
      const sh = b.sheet ? sheetId(b.sheet) : -1;
      return `<div class="box"><div class="bh"><span class="sc k">${esc(t(b.title))}</span>${b.warn ? `<button type="button" class="src" data-sh="${sh}"><span class="dot warn"></span>${esc(t(b.warn))}</button>` : ''}</div>
       <table><tr><th>${esc(t(b.head[0]))}</th>${b.cols.map((cc, i) => `<th class="t ${i === ti ? 'today' : ''}">${esc(t(cc.label))}${i === ti ? (L === 'ko' ? ' (오늘)' : ' · today') : ''}</th>`).join('')}</tr>
       ${b.rows.map((r) => `<tr><td>${esc(t(r.label))}</td>${r.cells.map((v, i) => `<td class="t ${i === ti ? 'today' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</table>
       <div class="src" style="margin-top:6px">${esc(t(b.note))} · ${esc(G.checked)}${ti < 0 ? ` · <b>${esc(L === 'ko' ? '오늘(일) 대부분 휴무' : 'Today (Sun): mostly closed')}</b>` : ''}</div></div>`;
    }
    if (b.type === 'map') return `<div class="mapw"><div class="bh"><span class="sc k">${esc(t(b.title))}</span><span class="src">${esc(t(b.note))}</span></div>${mapSvg(432, 190)}</div>`;
    if (b.type === 'list') {
      const aside = b.aside ? `<span class="src">${esc(t(b.aside))}</span>` : b.count ? `<span class="src">${esc(t(b.count))}</span>` : '';
      return `<div class="list"><div class="bh" style="margin-top:${b.mapThumb ? 16 : 0}px"><span class="sc k">${esc(t(b.title))}</span>${aside}</div>${b.items.map((it, i) => {
        const n = it.n ?? i + 1;
        const meta = (it.meta || []).map((m) => m.sheet ? `<button type="button" data-sh="${sheetId(m.sheet)}"><span class="dot warn"></span>${esc(t(m.text))}</button>` : `<span class="${m.muted ? 'mu' : ''}">${esc(t(m.text))}</span>`).join('');
        const go = it.go ? `<button type="button" class="link" data-go="${esc(it.go)}">${esc(L === 'ko' ? '길 안내' : 'Go')} →</button>` : '';
        const dist = it.go && o.distTo ? o.distTo(it.go) : null;
        const gate = it.gate ? `<span class="gate" title="${esc(t(it.gate.note))}">G${esc(it.gate.value)}${it.gate.unverified ? '?' : ''}</span>` : '';
        return `<div class="item ${detail && it.go === detail ? 'sel' : ''}"><div class="n">${it.line ? `<span class="l4"><i>${esc(it.line)}</i></span>` : String(n).padStart(2, '0')}</div><div><h3>${esc(t(it.title))}${it.alt && t(it.alt) ? `<span class="kr">${esc(t(it.alt))}</span>` : ''}${gate}</h3>${it.desc ? `<p>${esc(t(it.desc))}</p>` : ''}${it.tip ? `<p class="src">${esc(t(it.tip))}</p>` : ''}${meta || dist != null ? `<div class="meta">${dist != null ? `<span>≈${Math.round(dist)} m ${esc(L === 'ko' ? '걸어서' : 'walk')}</span>` : ''}${meta}</div>` : ''}</div><div>${go}</div></div>`;
      }).join('')}${b.note ? `<p class="src" style="margin-top:10px">${esc(t(b.note))}</p>` : ''}</div>`;
    }
    if (b.type === 'phrases') return `<div class="say"><span class="sc">${esc(t(b.title))}</span>${b.items.map((p) => `<div class="q">${esc(p.ko)}</div><div class="r"><i>${esc(p.rom)}</i> — ${esc(L === 'ko' ? p.ko : p.en)}</div>`).join('')}</div>`;
    if (b.type === 'text') {
      const sh = b.src?.length ? sheetId(srcSheet(b.title, b.src)) : -1;
      return `<div class="txt"><span class="sc">${esc(t(b.title))}</span><p style="${b.muted ? 'color:var(--muted)' : ''}">${esc(t(b.text))}</p>${sh >= 0 ? `<button type="button" class="src" data-sh="${sh}" style="min-height:44px">${esc(L === 'ko' ? '출처' : 'Source')}: <b>${esc(b.src[0].t.split(' – ')[0])}</b> · ${esc(b.src[0].c)}${b.volatile ? ` <span class="warnt">· ${esc(L === 'ko' ? '바뀔 수 있음' : 'may change')}</span>` : ''}</button>` : ''}</div>`;
    }
    return '';
  }
  const sheetHtml = (s) => `<div class="sheet"><button type="button" class="back" data-back="1">${icon('arrow-left', 16, 2)}${esc(L === 'ko' ? '뒤로' : 'Back')}</button><h3>${esc(t(s.title) || (L === 'ko' ? '출처' : 'Sources'))}</h3>${s.note ? `<p class="src">${esc(t(s.note))}</p>` : ''}${(s.rows || []).map((r) => `<div class="row">${r.value ? `<b>${esc(t(r.value))}</b>` : ''}${(r.src || []).map((x) => `<a href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">${esc(x.t)}${x.c ? ` · ${esc(L === 'ko' ? '확인' : 'checked')} ${esc(x.c)}` : ''}</a>`).join('')}</div>`).join('')}</div>`;
  const allSources = () => ({ title: { en: 'Sources', ko: '출처' }, note: { en: `Checked ${G.checked}. Volatile facts (hours, closed days, tax rules) can change.`, ko: `확인일 ${G.checked}. 영업시간·휴무·환급 규정은 바뀔 수 있습니다.` }, rows: [{ value: null, src: G.sources || [] }] });

  function renderDesktop(anim = false) {
    sheets = [];
    const st = statusLine();
    const tb = G.tabs.find((x) => x.key === tab) || G.tabs[0];
    const body = sheet ? sheetHtml(sheet) : tb.blocks.map(blockD).join('');
    panel.innerHTML = `<div class="hd"><div class="r1"><div class="b"><span class="logo">B</span><span class="sc">${esc(t(G.brand))}</span></div><div class="rt">${toggle()}<button type="button" class="x" data-close="1" aria-label="${esc(L === 'ko' ? '닫기' : 'Close')}">${icon('x', 20, 1.8)}</button></div></div>
     <h1>${esc(t(G.name))}</h1><div class="sub">${esc(L === 'ko' ? G.name.en : G.name.ko)} — ${esc(t(G.sub))}</div><div class="status">${st.html}</div></div>
     <div class="tabs" role="tablist">${G.tabs.map((x, i) => `<button type="button" role="tab" class="tab ${x.key === tab ? 'on' : ''}" aria-selected="${x.key === tab}" data-tab="${x.key}" title="${i + 1}">${esc(t(x.label))}</button>`).join('')}<i class="rule"></i></div>
     <div class="bd ${anim ? 'fade' : ''}">${body}</div><div class="ft">${foot()}</div>`;
    const on = panel.querySelector('.tab.on'), rule = panel.querySelector('.tabs .rule');
    if (on && rule) { rule.style.width = on.offsetWidth + 'px'; rule.style.transform = `translateX(${on.offsetLeft}px)`; }
  }

  // ---------- 모바일 ----------
  function itemsOf(tb) { const l = tb.blocks.find((b) => b.type === 'list'); return l ? l.items : []; }
  function renderMobile() {
    sheets = [];
    const tb = G.tabs.find((x) => x.key === tab) || G.tabs[0];
    const st = statusLine();
    const rail = `<nav class="rail" aria-label="Sections">${G.tabs.map((x) => `<button type="button" class="ri ${x.key === tab ? 'on' : ''}" data-tab="${x.key}" aria-current="${x.key === tab}">${icon(x.icon, 20, 1.8)}${esc(t(x.rail))}</button>`).join('')}</nav>`;
    let head, body, fb = '';
    if (sheet) {
      head = `<div class="sh"><h2>${esc(t(G.name))}</h2><span class="sp"></span>${toggle()}</div>`;
      body = `<div class="sbody">${sheetHtml(sheet)}</div>`;
    } else if (tab === 'overview') {
      const fx = tb.blocks.find((b) => b.type === 'facts' && b.only === 'mobile') || tb.blocks.find((b) => b.type === 'facts');
      head = `<div class="sh"><h2>${esc(t(G.name))}</h2><span class="kr">${esc(L === 'ko' ? G.name.en : G.name.ko)}</span><span class="st"><span class="dot ${DOT[st.k] || 'warn'}"></span>${esc(t(G.status.labels[st.k]))}</span><span class="sp"></span>${toggle()}</div>`;
      body = `<div class="sbody"><div class="mfacts">${fx.items.map((it) => { const sh = it.sheet ? sheetId(it.sheet) : it.src?.length ? sheetId(srcSheet(it.label, it.src)) : -1; return `<button type="button" data-sh="${sh}" data-long="1"><span class="sc">${esc(t(it.label))}${it.label.en === 'Today' ? ` · ${esc((L === 'ko' ? DAY_KO : DAY_EN)[clock().day])}` : ''}</span><b>${it.line ? `<span class="l4"><i>${esc(it.line)}</i></span>` : ''}${esc(valOf(it))}</b><small>${esc(t(it.cap))}</small></button>`; }).join('')}</div></div>`;
      fb = `<div class="fb"><button type="button" class="src" data-sheet="all">${esc(L === 'ko' ? '확인일' : 'Checked')} <b>${esc(G.checked)}</b> · ${esc(t(G.footer.sources))} · <span style="color:var(--ink-2)">${esc(L === 'ko' ? '길게 눌러 출처 보기' : 'long-press for sources')}</span></button><button type="button" class="btn pri" data-go="${esc(G.defaultSpot)}">${esc(t(G.takeMeThere))} →</button></div>`;
    } else {
      const lb = tb.blocks.find((b) => b.type === 'list');
      const items = itemsOf(tb);
      if (detail != null && items[detail]) {
        const it = items[detail]; const dist = it.go && o.distTo ? o.distTo(it.go) : null;
        head = `<div class="sh"><h2>${esc(t(it.title))}</h2>${it.alt && t(it.alt) ? `<span class="kr">${esc(t(it.alt))}</span>` : ''}<span class="sp"></span>${toggle()}</div>`;
        body = `<div class="sbody"><div class="mdet"><div>${it.desc ? `<p>${esc(t(it.desc))}</p>` : ''}<div class="meta">${dist != null ? `<span>≈${Math.round(dist)} m</span>` : ''}${(it.meta || []).map((m) => m.sheet ? `<button type="button" data-sh="${sheetId(m.sheet)}"><span class="dot warn"></span>${esc(t(m.text))}</button>` : `<span class="${m.muted ? 'mu' : ''}">${esc(t(m.text))}</span>`).join('')}${it.gate ? `<span class="warnt">G${esc(it.gate.value)}${it.gate.unverified ? '?' : ''}</span>` : ''}</div></div>
          <div>${it.go ? `<button type="button" class="btn pri" data-go="${esc(it.go)}">${esc(t(G.takeMeThere))} →</button>` : ''}</div></div></div>`;
      } else if (lb) {
        const showMap = !!lb.mapThumb;
        let list = items.map((it, i) => ({ it, i }));
        if (filter === 'near' && o.distTo) list = list.filter((x) => x.it.go).sort((a, b) => (o.distTo(a.it.go) ?? 1e9) - (o.distTo(b.it.go) ?? 1e9));
        head = `<div class="sh"><h2>${esc(t(lb.title))}</h2>${lb.count ? `<span class="sc">${esc(t(lb.count))}</span>` : ''}<span class="sp"></span>${lb.mapThumb ? `<div class="flt"><button type="button" data-flt="all" class="${filter === 'all' ? 'on' : ''}">${esc(L === 'ko' ? '전체' : 'All')}</button><button type="button" data-flt="near" class="${filter === 'near' ? 'on' : ''}">${esc(L === 'ko' ? '가까운 순' : 'Nearby')}</button></div>` : toggle()}</div>`;
        const row = ({ it, i }) => {
          const hrs = (it.meta || []).find((m) => m.num); const dist = it.go && o.distTo ? o.distTo(it.go) : null;
          const right = hrs ? `<span class="tm">${esc(t(hrs.text))}</span>` : dist != null ? `<span class="tm">≈${Math.round(dist)} m</span>` : `<span class="tm mu">${esc(L === 'ko' ? '상점별' : 'by shop')}</span>`;
          return `<button type="button" class="zr" data-det="${i}"><span class="n">${it.line ? `<span class="l4"><i>${esc(it.line)}</i></span>` : it.n ? String(it.n).padStart(2, '0') : '—'}</span><span class="nm">${esc(t(it.title))}${it.gate ? ` <span class="gate" style="margin-left:2px">G${esc(it.gate.value)}${it.gate.unverified ? '?' : ''}</span>` : ''}</span>${right}<span class="ch">›</span></button>`;
        };
        body = `<div class="sbody"><div class="zw ${showMap ? '' : 'nomap'}">${showMap ? `<div><div style="height:132px;overflow:hidden;border-radius:2px">${mapSvg(168, 132, { compact: true })}</div><div class="src" style="margin-top:4px">${esc(L === 'ko' ? '개략도 · 게임 속 배치' : 'Schematic · in-game')}</div></div>` : ''}<div><div class="zl">${list.map(row).join('')}</div><div class="src" style="margin:6px 0 8px">${showMap ? `${esc(L === 'ko' ? '번호 = 지도 핀, — = 게임 속 자리 없음' : 'no. = map pin, — = no in-game spot')} · G? = ${esc(L === 'ko' ? '게이트 미확인' : 'gate unverified')} · ` : ''}${esc(L === 'ko' ? '확인일' : 'Checked')} ${esc(G.checked)}</div></div></div></div>`;
      } else {
        head = `<div class="sh"><h2>${esc(t(tb.label))}</h2><span class="sp"></span>${toggle()}</div>`;
        body = `<div class="sbody">${tb.blocks.map(blockD).join('')}</div>`;
      }
      if (!lb && tb.blocks.length) body = `<div class="sbody">${tb.blocks.map(blockD).join('')}</div>`;
    }
    mroot.innerHTML = `${rail}<button type="button" class="mclose" data-close="1" aria-label="${esc(L === 'ko' ? '닫기' : 'Close')}">${icon('x', 20, 1.8)}</button><section class="strip">${head}${body}${fb}</section>`;
  }
  const render = (anim) => { if (!G || !isOpen) return; if (mobile) renderMobile(); else renderDesktop(anim); };

  // ---------- 입력 (위임: 한 번만 붙인다) ----------
  let pressT = 0, longFired = false;
  function onClick(e) {
    const el = e.target.closest('button,[data-sh]'); if (!el || !root.contains(el)) return;
    if (longFired) { longFired = false; return; }
    const d = el.dataset;
    if (d.close) { close(); return; }
    if (d.lang) { L = d.lang; render(); syncTag(); return; }
    if (d.tab) { tab = d.tab; sheet = null; detail = null; filter = 'all'; render(true); return; }
    if (d.back) { sheet = null; render(); return; }
    if (d.sheet === 'all') { sheet = allSources(); render(); return; }
    if (d.sh != null && d.sh !== '' && +d.sh >= 0 && !d.long) { sheet = sheets[+d.sh]; render(); return; }
    if (d.det != null) { detail = +d.det; render(); return; }
    if (d.flt) { filter = d.flt; render(); return; }
    if (d.go) { const id = d.go; close(); o.onRoute?.(id); return; }
  }
  // 모바일: 사실 칸·확인일 줄을 길게 누르면 출처
  function onDown(e) {
    const el = e.target.closest('[data-long],[data-sheet]'); if (!el) return;
    clearTimeout(pressT); longFired = false;
    pressT = setTimeout(() => { longFired = true; const sh = +el.dataset.sh; sheet = el.dataset.sheet === 'all' ? allSources() : sh >= 0 ? sheets[sh] : allSources(); render(); }, 520);
  }
  const onUp = () => clearTimeout(pressT);
  for (const el of [panel, mroot]) { el.addEventListener('click', onClick); el.addEventListener('pointerdown', onDown); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('pointerleave', onUp); }
  // 짧게 누른 사실 칸(모바일) = 출처 칸이면 아무것도 안 함 → 시트는 길게. 데스크톱 사실 칸은 클릭.
  tag.addEventListener('click', () => open());
  openg.addEventListener('click', () => open());
  eta.addEventListener('click', (e) => { if (e.target.closest('[data-end]')) o.onEndRoute?.(); });
  msign.addEventListener('click', (e) => { const el = e.target.closest('button'); if (!el) return; if (el.dataset.end) o.onEndRoute?.(); else if (el.dataset.open) open(); });
  nav.addEventListener('click', () => {});
  // 패널 위 휠·터치가 게임 카메라로 새지 않게
  const stop = (e) => e.stopPropagation();
  for (const el of [panel, mroot]) for (const ev of ['wheel', 'pointerdown', 'touchstart', 'mousedown']) el.addEventListener(ev, stop, { passive: true });

  function open(tabKey, { focus = false } = {}) {
    if (!G) return;
    if (tabKey) tab = tabKey;
    sheet = null; detail = null;
    isOpen = true; render(true);
    (mobile ? mroot : panel).classList.add('on');
    tag.classList.remove('on'); hint.classList.remove('on');
    o.onOpenChange?.(true);
    if (!mobile && focus) setTimeout(() => panel.querySelector('.tab.on')?.focus({ preventScroll: true }), 30); // 키보드(E)로 열 때만 탭에 초점
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; panel.classList.remove('on'); mroot.classList.remove('on');
    o.onOpenChange?.(false);
    try { if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur(); } catch { /* */ }
  }
  function onKey(e) {
    if (!isOpen) return false;
    if (e.code === 'Escape') { if (sheet) { sheet = null; render(); } else close(); e.preventDefault?.(); return true; }
    const n = /^Digit([1-9])$/.exec(e.code || '');
    if (n && G.tabs[+n[1] - 1]) { tab = G.tabs[+n[1] - 1].key; sheet = null; detail = null; render(true); return true; }
    if ((e.code === 'ArrowRight' || e.code === 'ArrowLeft') && document.activeElement?.classList?.contains('tab')) {
      const i = G.tabs.findIndex((x) => x.key === tab), j = (i + (e.code === 'ArrowRight' ? 1 : G.tabs.length - 1)) % G.tabs.length;
      tab = G.tabs[j].key; render(true); panel.querySelector('.tab.on')?.focus(); return true;
    }
    return false;
  }

  // ---------- 들어가기 표지 ----------
  let tagKey = '';
  function syncTag() { tagKey = ''; }
  function prompt(p) {
    if (!p || isOpen || routeOn) { tag.classList.remove('on'); hint.classList.remove('on'); return; }
    const k = `${L}|${mobile}`;
    if (k !== tagKey) {
      tagKey = k;
      tag.querySelector('.t').textContent = t(G?.prompt?.title || { en: 'Guide', ko: '가이드' });
      tag.querySelector('.sc').textContent = mobile ? (L === 'ko' ? '탭해서 열기' : 'Tap to open') : (L === 'ko' ? 'E 키 · 클릭' : 'Press E · click');
      hint.innerHTML = L === 'ko' ? '안내판·안내원 앞에서 <kbd>E</kbd> 를 누르면 시장 가이드가 열려요' : 'Press <kbd>E</kbd> at the sign or the guide for the market guide';
    }
    const on = !!p.show;
    tag.classList.toggle('on', on && p.x != null);
    if (on && p.x != null) tag.style.transform = `translate(${Math.round(p.x - tag.offsetWidth / 2)}px,${Math.round(p.y - tag.offsetHeight - 10)}px)`;
    hint.classList.toggle('on', on && !mobile && !!p.near);
  }

  // ---------- 길 안내 HUD ----------
  let lastNav = '';
  function routeShow(info) { routeOn = true; lastNav = ''; routeUpdate(info); }
  function routeHide() {
    routeOn = false; nav.style.display = 'none'; openg.style.display = 'none'; eta.style.display = 'none'; dest.style.display = 'none'; msign.style.display = 'none';
  }
  const fmtMin = (m) => { const min = Math.max(1, Math.round(m / (G?.route?.pace || 75))); return L === 'ko' ? `${min}분` : `${min} min`; };
  function routeUpdate(info) {
    if (!routeOn || !info) return;
    const sp = info.spot, name = t(sp.name), rem = info.remaining;
    const st = info.steps || [], cur = Math.min(info.stepIdx || 0, Math.max(0, st.length - 1));
    const ins = st[cur] ? t(st[cur].text) : name;
    const arrow = info.turn === 'left' ? 'corner-up-left' : info.turn === 'right' ? 'corner-up-right' : 'arrow-up';
    const k = [L, sp.id, cur, Math.round(rem / 5), arrow, st.length].join('|');
    if (k !== lastNav) {
      lastNav = k;
      const hrs = sp.hours ? `<div><span class="sc">${esc(L === 'ko' ? '영업' : 'Open')}</span><span class="v">${esc(typeof sp.hours === 'string' ? sp.hours : t(sp.hours))}</span></div>` : '';
      const pl = sp.placement === 'manual' ? (L === 'ko' ? '수동 배치' : 'placed by hand') : (L === 'ko' ? '개략 배치' : 'schematic spot');
      if (mobile) {
        msign.style.display = 'flex';
        msign.innerHTML = `<div class="arr">${icon(arrow, 28, 2.4)}</div><div class="ins"><b>${esc(ins)}</b><span class="sc">${esc(name)} · ≈${Math.round(rem)} m · ${esc(fmtMin(rem))}</span></div><button type="button" class="cell" data-open="1" aria-label="${esc(L === 'ko' ? '가이드' : 'Guide')}">${icon('info', 20, 2)}${esc(L === 'ko' ? '가이드' : 'Guide')}</button><button type="button" class="cell" data-end="1" aria-label="${esc(L === 'ko' ? '종료' : 'End')}">${icon('x', 20, 2.2)}${esc(L === 'ko' ? '종료' : 'End')}</button><i class="prog"></i>`;
      } else {
        nav.style.display = 'block'; openg.style.display = 'flex'; eta.style.display = 'flex';
        openg.querySelector('span').textContent = L === 'ko' ? '가이드 열기' : 'Open guide';
        nav.innerHTML = `<div class="sign"><div class="arr">${icon(arrow, 38, 2.4)}</div><div class="ins"><b>${esc(ins)}</b><span class="sc">${esc(L === 'ko' ? '' : 'To ')}${esc(name)}${sp.street ? ` · ${esc(sp.street)}` : ''}</span></div></div>
          <div class="steps">${st.slice(0, 5).map((s, i) => `<div class="stp ${i < cur ? 'done' : i === cur ? 'now' : ''}"><span class="k">${String(i + 1).padStart(2, '0')}</span><span>${esc(t(s.text))}</span><span class="d">${s.dist ? `${Math.round(s.dist)} m` : ''}</span></div>`).join('')}</div>
          <div class="src f">${esc(L === 'ko' ? '거리 = 게임 속 걷는 길' : 'Distance = walking path in the game')} · ${esc(pl)} · ${esc(L === 'ko' ? '게이트 번호 ≠ 지하철 출구 번호' : 'Gate numbers ≠ subway exit numbers')}</div>`;
        eta.innerHTML = `<div><span class="big">${esc(fmtMin(rem))}</span></div><div><span class="sc">${esc(L === 'ko' ? '거리' : 'Distance')}</span><span class="v">≈${Math.round(rem)} m</span></div>${hrs}<div class="e"><button type="button" class="btn sec" data-end="1">${esc(L === 'ko' ? '종료' : 'End')}</button></div>`;
      }
    }
    const prog = msign.querySelector('.prog'); if (prog && info.total) prog.style.width = `${Math.round(100 * Math.max(0, Math.min(1, 1 - rem / info.total)))}%`;
    // 화살표 방향 = 카메라 기준 다음 길 방향
    const a = (mobile ? msign : nav).querySelector('.arr svg'); if (a && info.rel != null && arrow === 'arrow-up') a.style.transform = `rotate(${Math.round(info.rel)}deg)`;
    // 목적지 라벨
    if (info.destScreen) {
      dest.style.display = 'flex';
      const lb = dest.querySelector('.lb'); const tx = `${esc(name)}<span>≈${Math.round(rem)} m</span>`; if (lb.innerHTML !== tx) lb.innerHTML = tx;
      const dx = Math.round(info.destScreen.x - dest.offsetWidth / 2), dy = Math.round(info.destScreen.y - dest.offsetHeight);
      dest.style.transform = `translate(${dx}px,${dy}px)`;
      // 길 안내 카드·하단 바와 겹치면 숨김
      const b = { l: dx, r: dx + dest.offsetWidth, t: dy, b: dy + dest.offsetHeight };
      const over = [mobile ? msign : nav, eta, openg].some((el) => { if (!el || el.style.display === 'none') return false; const q = el.getBoundingClientRect(); return q.width && b.l < q.right && b.r > q.left && b.t < q.bottom && b.b > q.top; });
      dest.style.visibility = over ? 'hidden' : '';
    } else dest.style.display = 'none';
  }
  function toast(title, sub = '', ms = 3200) {
    toastEl.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`; toastEl.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms);
  }

  return {
    root,
    setGuide(g) { G = g; tagKey = ''; },
    get guide() { return G; },
    open, close, onKey, prompt, toast,
    get isOpen() { return isOpen; },
    get lang() { return L; },
    set lang(v) { L = v === 'ko' ? 'ko' : 'en'; tagKey = ''; lastNav = ''; render(); },
    get tab() { return tab; },
    setTab(k) { tab = k; sheet = null; detail = null; render(true); },
    route: { show: routeShow, update: routeUpdate, hide: routeHide, get on() { return routeOn; } },
    refresh() { render(); },
    dispose() { clearTimeout(toastT); clearTimeout(pressT); root.remove(); },
  };
}
