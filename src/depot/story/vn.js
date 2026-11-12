// [depot-story] 대화창(VN) · 모드 선택 · 일차/미션/도장 카드 · 나가기 확인 · 로그 · 설정 · 반응 토스트/말풍선 — DOM 한 겹.
//   ui-spec v0.4: Pretendard, keep-all, 색 토큰(paper/deep/green/cream/yellow/red/amber). PC 1920×1080 기준 수치를 vh 로 비례,
//   모바일 가로(851×393pt)는 스토리 영역 x 216–619 · y 108–360 안에만 대화창·선택지·초상화를 둠(조이스틱·행동 버튼 자리 비움).
const CSS = `
#dp-story{position:fixed;inset:0;z-index:61;pointer-events:none;font-family:'Pretendard','Noto Sans KR',system-ui,sans-serif;word-break:keep-all;color:#22262A;--paper:#FFFDF8;--deep:#123B2D;--green:#1E5A45;--cream:#F3EADA;--yellow:#F2C230;--red:#D9442E;--amber:#E08A2C}
#dp-story *{box-sizing:border-box}
#dp-story .vn{position:absolute;inset:0;display:none;pointer-events:auto;cursor:pointer}
#dp-story.open .vn{display:block}
#dp-story .vn-dim{position:absolute;inset:0;background:linear-gradient(rgba(18,26,24,.55),rgba(18,26,24,.22) 45%,rgba(18,26,24,.66))}
#dp-story .pt{position:absolute;bottom:0;height:86vh;max-width:46vw;object-fit:contain;object-position:bottom;filter:drop-shadow(0 8px 0 rgba(18,59,45,.35));transition:filter .15s,opacity .22s cubic-bezier(.2,.8,.2,1),transform .22s cubic-bezier(.2,.8,.2,1);opacity:0}
#dp-story .pt.l{left:7.8vw;transform:translateX(-60px)}#dp-story .pt.r{right:7.8vw;transform:translateX(60px) scaleX(-1)}
#dp-story .pt.on{opacity:1;transform:none}#dp-story .pt.r.on{transform:scaleX(-1)}
#dp-story .pt.dim{filter:brightness(.55) saturate(.7) drop-shadow(0 8px 0 rgba(18,59,45,.35))}
#dp-story .pt.bump{animation:dpBump .12s}#dp-story .pt.r.bump{animation:dpBumpR .12s}
#dp-story .pt.shake{animation:dpShake .3s}#dp-story .pt.r.shake{animation:dpShakeR .3s}
@keyframes dpBump{50%{transform:translateY(-6px)}}@keyframes dpBumpR{50%{transform:translateY(-6px) scaleX(-1)}}
@keyframes dpShake{25%{transform:translateX(-3px)}50%{transform:translateX(3px)}75%{transform:translateX(-3px)}}@keyframes dpShakeR{25%{transform:translateX(-3px) scaleX(-1)}50%{transform:translateX(3px) scaleX(-1)}75%{transform:translateX(-3px) scaleX(-1)}}
#dp-story .fx{position:absolute;font-size:7vh;animation:dpPop .2s;pointer-events:none;filter:drop-shadow(0 3px 0 rgba(18,59,45,.4))}
@keyframes dpPop{0%{transform:scale(.6)}60%{transform:scale(1.1)}100%{transform:scale(1)}}
#dp-story .box{position:absolute;left:9.4vw;right:9.4vw;bottom:3.7vh;height:23vh;min-height:150px;background:var(--paper);border:4px solid var(--deep);border-radius:26px;box-shadow:0 10px 0 rgba(18,59,45,.45);padding:5vh 3.4vw 2vh;animation:dpUp .18s}
@keyframes dpUp{from{transform:translateY(24px);opacity:0}}
#dp-story .txt{font-size:clamp(16px,3.15vh,34px);font-weight:600;line-height:1.58;max-height:calc(1.58em * 3);overflow:hidden}
#dp-story .txt mark{background:linear-gradient(transparent 58%,var(--yellow) 58%);font-weight:800;color:inherit}
#dp-story .txt.narr{color:#3a4a44;font-style:italic}#dp-story .txt.me{color:#5a3a12}
#dp-story .tag{position:absolute;left:48px;top:calc(-1 * clamp(26px,3.5vh,38px));height:clamp(44px,6.5vh,70px);display:flex;align-items:center;gap:.6em;padding:0 2.2em 0 1.4em;background:var(--green);color:var(--cream);border:4px solid var(--deep);border-radius:12px 36px 36px 12px;font-weight:800;font-size:clamp(15px,2.95vh,32px);animation:dpTag .18s .06s both}
#dp-story .tag::before{content:'';width:.42em;height:.42em;border-radius:50%;background:var(--cream)}
#dp-story .tag small{color:var(--yellow);font-size:.62em;font-weight:700}
#dp-story .tag.me{background:var(--amber)}#dp-story .tag.pa{background:var(--red);left:clamp(150px,15vw,290px)}#dp-story .tag.hide{display:none}
@keyframes dpTag{from{transform:scale(.9);opacity:0}}
#dp-story .box.pa{background:var(--deep);color:var(--cream)}#dp-story .box.pa .txt mark{background:none;color:var(--yellow)}
#dp-story .pa-frame{position:absolute;left:3vw;bottom:calc(3.7vh + 23vh - 70px);width:clamp(110px,21vh,230px);height:clamp(110px,21vh,230px);border-radius:50%;background:var(--cream) center/76% no-repeat;border:6px solid var(--yellow);box-shadow:0 0 0 5px var(--deep);display:none}
#dp-story .pa-chip{position:absolute;left:50%;top:2.4vh;transform:translateX(-50%);background:var(--deep);color:var(--cream);border:3px solid var(--yellow);border-radius:999px;padding:.4em 1.2em;font-weight:800;font-size:clamp(13px,2vh,22px);display:none;animation:dpDown .25s}
#dp-story .pa-chip b{color:var(--red);margin-left:.6em;animation:dpBlink 1s infinite}
@keyframes dpDown{from{transform:translate(-50%,-20px);opacity:0}}@keyframes dpBlink{50%{opacity:.25}}
#dp-story.pa .pa-frame,#dp-story.pa .pa-chip{display:block}
#dp-story .next{position:absolute;right:40px;bottom:26px;width:34px;height:24px;background:var(--green);clip-path:polygon(0 0,100% 0,50% 100%);animation:dpNext .8s infinite;display:none}
#dp-story .box.done .next{display:block}@keyframes dpNext{50%{transform:translateY(4px)}}
#dp-story .ctl{position:absolute;right:9.4vw;bottom:calc(3.7vh + max(23vh,150px) + 12px);display:flex;gap:12px}
#dp-story .ctl button{pointer-events:auto;height:clamp(34px,4.4vh,48px);min-width:48px;border-radius:999px;border:3px solid var(--deep);background:var(--paper);color:var(--deep);font:800 clamp(13px,1.95vh,21px)/1 inherit;font-family:inherit;padding:0 1em;display:flex;align-items:center;gap:.4em;cursor:pointer}
#dp-story .ctl button kbd{font:700 clamp(10px,1.4vh,15px)/1 inherit;font-family:inherit;color:#9A9C98;border:1.5px solid #c9cbc6;border-radius:4px;padding:2px 4px}
#dp-story .ctl button.on{background:var(--yellow)}#dp-story .ctl button.off{opacity:.45}
#dp-story .ctl button.exit{border-color:#b8860b;background:#f6d77a}
#dp-story .tip{position:absolute;right:0;bottom:calc(100% + 8px);background:var(--deep);color:var(--cream);border-radius:10px;padding:.5em .9em;font-size:clamp(12px,1.7vh,18px);font-weight:700;white-space:nowrap}
#dp-story .choices{position:absolute;right:12vw;bottom:calc(3.7vh + max(23vh,150px) + 9vh);width:40.6vw;display:flex;flex-direction:column;gap:16px}
#dp-story .choices.left{right:auto;left:12vw}
#dp-story .ch{pointer-events:auto;display:flex;align-items:center;height:clamp(52px,7.8vh,84px);border:4px solid var(--deep);border-radius:18px;background:var(--paper);font:700 clamp(15px,2.8vh,30px)/1.2 inherit;font-family:inherit;color:#22262A;text-align:left;padding:0;overflow:hidden;cursor:pointer;animation:dpIn .2s both;box-shadow:0 6px 0 rgba(18,59,45,.35)}
#dp-story .ch i{flex:0 0 clamp(48px,6.7vh,72px);align-self:stretch;display:flex;align-items:center;justify-content:center;background:var(--green);color:var(--cream);font-style:normal;font-weight:800;margin-right:.8em}
#dp-story .ch em{margin-left:auto;margin-right:.8em;font-style:normal;font-size:.62em;font-weight:800;padding:.25em .7em;border-radius:999px;background:var(--cream);color:var(--deep)}
#dp-story .ch:hover,#dp-story .ch.sel{background:var(--yellow);transform:translateX(-14px)}
@keyframes dpIn{from{transform:translateX(40px);opacity:0}}
#dp-story .card{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);background:var(--paper);border:4px solid var(--deep);border-radius:22px;box-shadow:0 10px 0 rgba(18,59,45,.45);padding:3vh 4vw;text-align:center;pointer-events:auto;animation:dpPop .25s}
#dp-story .card h2{margin:0;color:var(--green);font-size:clamp(22px,5vh,54px);font-weight:900}
#dp-story .card h3{margin:.3em 0 0;font-size:clamp(16px,3.2vh,34px);font-weight:800}#dp-story .card p{margin:.4em 0 0;color:#5b605c;font-weight:700;font-size:clamp(13px,2.1vh,22px)}
#dp-story .card .miss{display:inline-block;margin-top:.8em;border:3px solid #9A9C98;color:#7d807c;border-radius:10px;padding:.2em .7em;transform:rotate(-4deg);font-weight:900}
#dp-story .card button{margin-top:1.2em;height:clamp(44px,6vh,60px);padding:0 2em;border-radius:999px;border:3px solid var(--deep);background:var(--yellow);font:900 clamp(14px,2.2vh,22px)/1 inherit;font-family:inherit;color:var(--deep);cursor:pointer}
#dp-story .card .stamp{width:clamp(80px,14vh,150px);height:clamp(80px,14vh,150px);margin:1vh auto 0;border:6px solid var(--red);border-radius:50%;color:var(--red);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:clamp(14px,2.6vh,26px);transform:rotate(-12deg);animation:dpStamp .35s}
@keyframes dpStamp{0%{transform:scale(2.2) rotate(-12deg);opacity:0}70%{transform:scale(.92) rotate(-12deg);opacity:1}}
#dp-story .mcard{position:absolute;right:2vw;top:12vh;width:min(560px,40vw);background:var(--paper);border:4px solid var(--deep);border-radius:18px;overflow:hidden;box-shadow:0 8px 0 rgba(18,59,45,.4);animation:dpIn .25s;font-size:clamp(13px,2vh,20px);font-weight:700}
#dp-story .mcard h4{margin:0;background:var(--red);color:#fff;padding:.5em .9em;font-size:1.05em}#dp-story .mcard h5{margin:.5em .9em 0;font-size:clamp(17px,3.1vh,34px);font-weight:800;color:var(--deep)}
#dp-story .mcard dl{margin:.4em .9em .8em;display:grid;grid-template-columns:auto 1fr;gap:.25em .8em}#dp-story .mcard dt{color:var(--green);font-weight:900}#dp-story .mcard dd{margin:0}
#dp-story .chip{position:absolute;left:16px;top:var(--dp-chip-top,150px);display:none;pointer-events:none;background:var(--paper);border:3px solid var(--deep);border-radius:12px;overflow:hidden;font-size:13px;font-weight:800;box-shadow:0 5px 0 rgba(18,59,45,.35);min-width:210px}
#dp-story .chip b{display:block;background:var(--red);color:#fff;padding:3px 10px;font-size:11.5px;letter-spacing:.04em}
#dp-story .chip span{display:block;padding:4px 10px 0;color:var(--deep);font-size:14px}#dp-story .chip em{display:block;padding:0 10px;font-style:normal;color:var(--green)}
#dp-story .chip small{display:block;padding:0 10px 5px;color:#9A9C98;font-weight:700}
#dp-story .chip.shake{animation:dpChip .5s}@keyframes dpChip{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
#dp-story .modal{position:absolute;inset:0;background:rgba(18,59,45,.62);display:flex;align-items:center;justify-content:center;pointer-events:auto}
#dp-story .modal .card{position:static;transform:none;text-align:left;max-width:min(640px,92vw)}
#dp-story .modal ul{list-style:none;padding:0;margin:1em 0 0;font-weight:700;font-size:clamp(13px,2.1vh,20px);line-height:1.7}
#dp-story .modal li::before{content:'●';margin-right:.5em}#dp-story .modal li.g::before{color:#2e8b57}#dp-story .modal li.o::before{color:var(--amber)}#dp-story .modal li.r::before{color:var(--red)}
#dp-story .modal .pick{text-align:center;min-width:min(440px,90vw)}#dp-story .modal .pick .row{justify-content:center;flex-wrap:wrap}
#dp-story .modal .pick .where{display:inline-block;margin-top:.6em;background:var(--cream);color:var(--deep);border-radius:10px;padding:.25em .8em;font-weight:800;font-size:clamp(12px,1.9vh,19px)}
#dp-story .modal .pick button{margin-top:1em}#dp-story .modal .pick button.w{background:#fff}
#dp-story .modal .nd{text-align:center;min-width:min(520px,92vw);background:var(--deep);color:var(--cream);border-color:var(--yellow)}
#dp-story .modal .nd h2{color:var(--yellow)}#dp-story .modal .nd h3{color:var(--cream)}#dp-story .modal .nd p{color:#cfe0d6}
#dp-story .modal .nd canvas{display:block;margin:.8em auto 0;width:min(300px,60vw);height:auto;border-radius:12px;border:3px solid var(--yellow)}
#dp-story .modal .nd .tom{display:inline-block;background:var(--yellow);color:var(--deep);border-radius:999px;padding:.15em .9em;font-weight:900;font-size:clamp(12px,1.8vh,18px)}
#dp-story .cut{position:absolute;right:4vw;top:10vh;width:min(360px,30vw);border:4px solid var(--deep);border-radius:16px;overflow:hidden;box-shadow:0 8px 0 rgba(18,59,45,.4);animation:dpIn .3s;pointer-events:none;z-index:2}
#dp-story .cut canvas{display:block;width:100%;height:auto}
#dp-story.m .cut{top:8px;right:max(59px,env(safe-area-inset-right));width:210px}
#dp-story.m .modal .nd canvas{width:200px}#dp-story.m .modal .pick button,#dp-story.m .modal .nd button{margin-top:.6em;height:40px}
#dp-story .modal .row{display:flex;gap:12px;justify-content:flex-end}#dp-story .modal .row button.w{background:#fff}
#dp-story .log{position:absolute;inset:6vh 12vw;background:var(--paper);border:4px solid var(--deep);border-radius:22px;padding:2vh 2vw;overflow:auto;pointer-events:auto;font-size:clamp(13px,2.1vh,20px);line-height:1.6}
#dp-story .log p{margin:.35em 0}#dp-story .log p b{color:var(--green);margin-right:.6em}#dp-story .log p.sk{color:#9A9C98}
#dp-story .mode{position:absolute;inset:0;background:rgba(18,30,26,.72);display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto;color:#fff;gap:2.4vh}
#dp-story .mode h2{margin:0;font-size:clamp(22px,4.6vh,46px);font-weight:900}#dp-story .mode p.sub{margin:-1.6vh 0 0;font-size:clamp(12px,1.9vh,18px);opacity:.85;font-weight:700}
#dp-story .mode .cards{display:flex;gap:3vw}
#dp-story .mode .mc{width:min(31vw,600px);background:var(--paper);color:#22262A;border:4px solid var(--deep);border-radius:22px;overflow:hidden;cursor:pointer;position:relative;text-align:left;font-family:inherit;padding:0}
#dp-story .mode .mc.focus{border-color:var(--yellow);box-shadow:0 0 0 4px var(--yellow)}
#dp-story .mode .mc img{display:block;width:100%;aspect-ratio:640/300;object-fit:cover}
#dp-story .mode .mc h3{margin:.5em .8em .2em;font-size:clamp(17px,3.2vh,32px);font-weight:900;color:var(--deep)}
#dp-story .mode .mc ul{margin:0 .9em 1em;padding:0;list-style:none;font-size:clamp(12px,1.85vh,18px);font-weight:700;line-height:1.6}#dp-story .mode .mc li::before{content:'';display:inline-block;width:.6em;height:.6em;background:var(--yellow);border:1.5px solid var(--deep);border-radius:2px;margin-right:.5em}
#dp-story .mode .mc .rec{position:absolute;right:10px;top:10px;background:var(--red);color:#fff;font-weight:900;font-size:clamp(11px,1.6vh,15px);padding:.3em .8em;border-radius:999px;border:2px solid #fff}
#dp-story .mode .hint{background:var(--deep);border-radius:999px;padding:.5em 1.2em;font-size:clamp(11px,1.7vh,16px);font-weight:700}
#dp-story .set{position:absolute;right:0;top:0;bottom:0;width:min(760px,48vw);background:var(--paper);border-left:4px solid var(--deep);padding:3vh 2vw;pointer-events:auto;overflow:auto;font-weight:700;font-size:clamp(13px,2vh,19px)}
#dp-story .set h3{margin:0 0 1em;color:var(--deep);font-size:1.4em}#dp-story .set .it{display:flex;align-items:center;justify-content:space-between;gap:1em;padding:.8em 0;border-bottom:2px solid #eee4d2}
#dp-story .set .seg{display:flex;gap:6px}#dp-story .set .seg button,#dp-story .set .tg{font:inherit;font-weight:800;border:3px solid var(--deep);background:#fff;border-radius:999px;padding:.3em .9em;cursor:pointer;min-height:40px}
#dp-story .set .seg button.on,#dp-story .set .tg.on{background:var(--yellow)}#dp-story .set small{display:block;color:#9A9C98;font-size:.8em}
#dp-story .set .close{margin-top:1.4em;width:100%;min-height:48px;border-radius:999px;border:3px solid var(--deep);background:var(--yellow);font:inherit;font-weight:900;cursor:pointer}
#dp-story .gear{position:absolute;left:16px;top:var(--dp-gear-top,140px);pointer-events:auto;height:34px;border-radius:999px;border:2px solid var(--deep);background:var(--paper);font:800 12.5px/1 inherit;font-family:inherit;color:var(--deep);padding:0 12px;cursor:pointer;display:none}
#dp-story.ingame .gear{display:block}
#dp-story .rx{position:absolute;left:16px;top:var(--dp-rx-top,220px);display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(380px,calc(100vw - 32px))}
#dp-story .rt{display:flex;align-items:center;gap:10px;background:var(--paper);border:3px solid var(--deep);border-radius:16px;padding:6px 12px 8px 6px;box-shadow:0 5px 0 rgba(18,59,45,.35);animation:dpIn .2s;position:relative;overflow:hidden}
#dp-story .rt img{width:44px;height:44px;border-radius:50%;background:var(--cream);border:2px solid var(--deep);flex:0 0 auto;object-fit:cover}
#dp-story .rt b{display:block;font-size:12px;color:var(--green)}#dp-story .rt span{display:block;font-size:14.5px;font-weight:700;line-height:1.35}
#dp-story .rt.pa{background:var(--deep);color:var(--cream)}#dp-story .rt.pa b{color:var(--yellow)}
#dp-story .rt i{position:absolute;left:0;bottom:0;height:3px;background:var(--yellow);animation:dpBar linear forwards}@keyframes dpBar{from{width:100%}to{width:0}}
#dp-story .bub{position:absolute;transform:translate(-50%,-100%);background:var(--paper);border:3px solid var(--deep);border-radius:16px;padding:6px 12px;max-width:300px;font-size:14px;font-weight:700;line-height:1.35;pointer-events:none;box-shadow:0 5px 0 rgba(18,59,45,.3)}
#dp-story .bub::after{content:'';position:absolute;left:50%;bottom:-11px;margin-left:-8px;border:8px solid transparent;border-top-color:var(--deep)}
#dp-story .bub b{display:block;font-size:11.5px;color:var(--green)}
#dp-story .lock{position:absolute;left:24px;bottom:150px;background:rgba(18,59,45,.85);color:#fff;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:800;display:none}
#dp-story .tapnote{position:absolute;left:50%;bottom:4px;transform:translateX(-50%);color:#fff;font-size:12px;font-weight:700;text-shadow:0 1px 2px #000;display:none}
/* ---- 모바일 가로: 스토리 영역 x 216–619(403 폭) · 대화창 아래 끝 y 360 ---- */
#dp-story.m .pt{height:min(292px,76vh);max-width:none;bottom:0}
#dp-story.m .pt.l{left:max(4px,env(safe-area-inset-left))}#dp-story.m .pt.r{right:max(4px,env(safe-area-inset-right))}
#dp-story.m .box{left:var(--dp-mside,196px);right:var(--dp-mside,196px);width:auto;bottom:14px;height:100px;min-height:0;border-radius:16px;border-width:3px;padding:20px 18px 8px;box-shadow:0 6px 0 rgba(18,59,45,.45)}
#dp-story.m .txt{font-size:15px;line-height:1.5}
#dp-story.m .tag{left:18px;top:-17px;height:32px;font-size:15px;border-width:3px;padding:0 1.6em 0 1em}
#dp-story.m .tag.pa{left:84px}
#dp-story.m .next{right:16px;bottom:10px;width:20px;height:14px}
#dp-story.m .ctl{position:fixed;right:max(59px,env(safe-area-inset-right));top:12px;bottom:auto;gap:8px}
#dp-story.m .ctl button{height:40px;font-size:14px;position:relative}#dp-story.m .ctl button::after{content:'';position:absolute;inset:-4px}
#dp-story.m .ctl kbd{display:none}
#dp-story.m .choices{left:var(--dp-mside,196px);right:var(--dp-mside,196px);width:auto;bottom:156px;gap:4px}
#dp-story.m .ch{height:32px;font-size:13.5px;border-width:3px;border-radius:11px;box-shadow:0 4px 0 rgba(18,59,45,.35)}#dp-story.m .ch i{flex-basis:36px;margin-right:.6em}#dp-story.m .ch:hover,#dp-story.m .ch.sel{transform:none}
#dp-story.m .pa-frame{width:96px;height:96px;left:calc(var(--dp-mside,196px) - 104px);bottom:14px;border-width:4px}
#dp-story .mchip{display:none}
#dp-story.m .mchip{position:absolute;top:60px;right:max(59px,calc(var(--sa-r,0px) + 12px));width:250px;background:var(--paper);border:3px solid var(--deep);border-radius:14px;overflow:hidden;box-shadow:0 5px 0 rgba(18,59,45,.35);font-size:12px;font-weight:700;pointer-events:auto;cursor:pointer;animation:dpIn .25s}
#dp-story.m .mchip.on{display:block}#dp-story.m .mchip h4{margin:0;display:flex;justify-content:space-between;background:var(--red);color:#fff;padding:3px 10px;font-size:11px;letter-spacing:.04em}#dp-story.m .mchip h4 i{font-style:normal;opacity:.85}
#dp-story.m .mchip h5{margin:4px 10px 0;font-size:14.5px;font-weight:800;color:var(--deep)}#dp-story.m .mchip em{display:block;margin:1px 10px 5px;font-style:normal;color:var(--green);font-weight:800;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#dp-story.m .mchip dl{display:none;margin:0 10px 7px;grid-template-columns:auto 1fr;gap:2px 8px}#dp-story.m .mchip.open dl{display:grid}#dp-story.m .mchip dt{color:var(--green);font-weight:900}#dp-story.m .mchip dd{margin:0}
#dp-story.m .mchip small{display:block;margin:-3px 10px 5px;color:#9A9C98;font-weight:700;font-size:11px}#dp-story.m .mchip.open small:not(.tip):not(.st){display:none}#dp-story.m .mchip small.tip{margin:0 10px 5px;color:var(--deep);font-weight:800;font-size:11.5px}#dp-story.m .mchip small.st{margin:-2px 10px 5px;color:#6a6f6a}#dp-story.m .mchip h4+small.tip{margin-top:5px}
#dp-story.m .gear{left:calc(16px + var(--sa-l,0px))}
#dp-story.m .mcard{top:60px;right:max(59px,env(safe-area-inset-right));width:300px;font-size:12px}#dp-story.m .mcard h5{font-size:17px}
#dp-story.m .lock,#dp-story.m .tapnote{display:block}#dp-story.m .lock{left:auto;right:max(8px,env(safe-area-inset-right));bottom:118px;font-size:11px;padding:3px 9px;opacity:.9}#dp-story.m .tapnote{bottom:0;font-size:11px}
#dp-story.m .card{padding:14px 22px}#dp-story.m .card h2{font-size:26px}#dp-story.m .card h3{font-size:17px}#dp-story.m .card p{font-size:13px}
#dp-story.m .mode{gap:10px}#dp-story.m .mode h2{font-size:22px}#dp-story.m .mode p.sub{margin:-6px 0 0;font-size:12px}#dp-story.m .mode .mc{width:min(300px,36vw)}#dp-story.m .mode .mc h3{font-size:17px}#dp-story.m .mode .mc ul{font-size:12px;margin-bottom:8px}#dp-story.m .mode .mc img{aspect-ratio:640/250}
#dp-story.m .set{left:50%;right:auto;top:12px;bottom:12px;transform:translateX(-50%);width:min(520px,calc(100vw - 144px));border:4px solid var(--deep);border-radius:18px;padding:12px 16px}
#dp-story.m .log{inset:60px max(72px,8vw) 12px}
#dp-story.m .rx{top:var(--dp-rx-top,150px);max-width:330px}
#dp-story.m .pa-chip{left:186px;top:14px;transform:none;animation:none;font-size:12px;padding:.35em .9em}#dp-story.m .pa-chip b{display:none}
#dp-story.m .chip{top:var(--dp-chip-top,108px);min-width:0;max-width:220px}#dp-story.m .chip small{display:none}#dp-story.m .chip em{padding-bottom:4px}
body.dp-chip-m #depot-hud .dh-help{display:none !important}
body.dp-story-lock #phone,body.dp-story-lock #handset,body.dp-story-lock #emote-bar,body.dp-story-lock form#chat,body.dp-story-lock #chat-log-panel,body.dp-story-lock #depot-hud .dh-help,body.dp-story-lock #h3-mm{opacity:0 !important;pointer-events:none !important;transform:translateY(24px);transition:opacity .2s,transform .2s}
body.dp-story-lock #m-joy,body.dp-story-lock .m-actions,body.dp-story-lock .m-talk,body.dp-story-lock #m-hud .m-act{opacity:0 !important;pointer-events:none !important;transition:opacity .2s}
body.dp-story-lock.dp-story-m #m-hud .m-tg[data-tg=bgm],body.dp-story-lock.dp-story-m #m-hud .m-tg[data-tg=phone],body.dp-story-lock.dp-story-m #m-hud .m-tg[data-tg=map],body.dp-story-lock.dp-story-m #m-event-btn,body.dp-story-lock.dp-story-m #depot-hud .dh-panel,body.dp-story-lock.dp-story-m #dp-story .gear,body.dp-story-lock.dp-story-m #dp-story .mchip,body.dp-story-lock.dp-story-m #dp-story .chip{opacity:0 !important;pointer-events:none !important;transition:opacity .2s}
body.dp-story-lock .co-rcpt,body.dp-story-lock .co-chip,body.dp-story-lock #depot-ui .dp-pa,body.dp-story-lock #depot-hud .dh-toast{visibility:hidden !important}
body.dp-story-lock #depot-hud .dh-help,body.dp-story-lock #depot-hud .dh-target,body.dp-story-lock #depot-hud .dh-cross{display:none !important}
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createVN({ assetBase, isMobile = false, getSettings, onCue = () => {}, onLock = () => {} }) {
  const css = document.createElement('style'); css.textContent = CSS; document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'dp-story'; if (isMobile) root.classList.add('m');
  root.innerHTML = `<div class="vn"><div class="vn-dim"></div><img class="pt l" alt=""><img class="pt r" alt=""><div class="pa-chip">♪ 딩동댕 매장 안내 방송<b>● 방송 중</b></div><div class="pa-frame"></div>
  <div class="box"><div class="tag hide"></div><div class="txt"></div><div class="next"></div></div>
  <div class="ctl"><button data-c="log">${isMobile ? '≡ ' : ''}로그<kbd>L</kbd></button><button data-c="auto">자동<kbd>A</kbd></button><button data-c="skip">건너뛰기 ▸▸<kbd>Ctrl</kbd></button><button data-c="exit" class="exit">나가기<kbd>Esc</kbd></button></div>
  <div class="choices"></div><div class="lock">대화 중 · 조작 잠금</div><div class="tapnote">◎ 화면 아무 곳이나 탭</div></div>
  <div class="chip"></div><div class="mchip"></div><div class="rx"></div><button class="gear">⚙ 설정</button>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const vn = $('.vn'), box = $('.box'), tag = $('.tag'), txt = $('.txt'), ptL = $('.pt.l'), ptR = $('.pt.r'), choicesEl = $('.choices'), chip = $('.chip'), mchip = $('.mchip'), rx = $('.rx'), paFrame = $('.pa-frame');
  paFrame.style.backgroundImage = `url(${assetBase}story/pa-speaker.webp)`;
  const S = { open: false, typing: false, full: '', shown: 0, adv: null, auto: false, skip: false, skipHold: false, log: [], choosing: false, modal: null, openedAt: 0, seen: false, tipShown: false, cur: null };
  const portraits = { l: { el: ptL, who: '' }, r: { el: ptR, who: '' } };
  const preload = new Map();
  const img = (who, ex) => `${assetBase}story/${who}-${ex || 'neutral'}.webp`;
  function prefetch(who) { const exs = isMobile ? ['neutral'] : ['neutral', 'angry', 'laugh', 'surprised']; for (const ex of exs) { const u = img(who, ex); if (!preload.has(u)) { const i = new Image(); i.src = u; preload.set(u, i); } } }

  function setOpen(on) {
    if (S.open === on) return;
    S.open = on; root.classList.toggle('open', on); S.openedAt = performance.now();
    document.body.classList.toggle('dp-story-lock', on); document.body.classList.toggle('dp-story-m', !!isMobile && on);
    onLock(on);
    if (!on) { for (const p of Object.values(portraits)) { p.el.classList.remove('on'); p.who = ''; } root.classList.remove('pa'); S.auto = false; S.skip = false; updCtl(); }
  }
  function updCtl() {
    $('[data-c=auto]').classList.toggle('on', S.auto);
    $('[data-c=skip]').classList.toggle('on', S.skip || S.skipHold);
    $('[data-c=skip]').classList.toggle('off', !!getSettings?.().skipSeenOnly && !S.seen);
  }
  function cps() { const sp = getSettings?.().textSpeed || '보통'; return { 느림: 20, 보통: 32, 빠름: 55, 즉시: 9999 }[sp] || 32; }
  function render(n) {
    const t = S.full.slice(0, n), emph = S.cur?.emph || [];
    let h = esc(t);
    for (const e of emph) { const k = esc(e); if (k && h.includes(k)) h = h.split(k).join(`<mark>${k}</mark>`); }
    txt.innerHTML = h;
  }
  async function typeOut() {
    S.typing = true; box.classList.remove('done');
    const speed = cps(); let n = 0;
    while (n < S.full.length && S.typing) {
      if (S.skip || S.skipHold || speed > 999) { n = S.full.length; break; }
      n++; render(n);
      const ch = S.full[n - 1];
      await sleep(1000 / speed + (ch === ',' ? 120 : '.?!'.includes(ch) ? 240 : ch === '…' ? 400 : 0));
    }
    render(S.full.length); S.typing = false; box.classList.add('done');
  }
  function advance() {
    if (!S.open || S.choosing || S.modal) return;
    if (performance.now() - S.openedAt < 300) return; // 대화 뜬 뒤 300ms 무시
    if (S.typing) { S.typing = false; return; }
    const a = S.adv; S.adv = null; a?.();
  }
  vn.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ctl,.choices,.modal,.log')) return;
    e.preventDefault(); advance();
  });
  root.querySelector('.ctl').addEventListener('pointerdown', (e) => {
    const c = e.target.closest('button')?.dataset.c; if (!c) return; e.stopPropagation(); e.preventDefault();
    if (c === 'log') showLog(); else if (c === 'auto') { S.auto = !S.auto; updCtl(); if (S.auto && !S.typing) advance(); } else if (c === 'skip') { if (getSettings?.().skipSeenOnly && !S.seen) return; S.skip = !S.skip; updCtl(); if (S.skip) advance(); } else if (c === 'exit') requestExit();
  });
  let exitHandler = null;
  async function requestExit() { if (S.modal) return; const ok = await confirmExit(); if (ok) exitHandler?.(); }

  /** 한 줄 보여 주고 넘길 때까지 기다림. line: {who, name, title, expression, pos, enter, text, emph, fx, pa, me, narr, seen} */
  async function say(line) {
    setOpen(true); S.cur = line; S.seen = !!line.seen; updCtl();
    root.classList.toggle('pa', !!line.pa); box.classList.toggle('pa', !!line.pa);
    // 이름표
    tag.className = 'tag' + (line.narr ? ' hide' : line.me ? ' me' : line.pa ? ' pa' : '');
    tag.innerHTML = line.narr ? '' : `${esc(line.name || '')}${line.title ? ` <small>${esc(line.title)}</small>` : ''}`;
    txt.className = 'txt' + (line.narr ? ' narr' : line.me ? ' me' : '');
    // 초상화
    if (line.who && line.pos) {
      const p = portraits[line.pos === 'right' ? 'r' : 'l'], other = portraits[line.pos === 'right' ? 'l' : 'r'];
      const src = img(line.who, line.expression);
      const fresh = p.who !== line.who;
      if (p.el.getAttribute('src') !== src) p.el.src = src;
      p.who = line.who; p.el.classList.add('on'); p.el.classList.remove('dim');
      if (other.who) other.el.classList.add('dim');
      if (!fresh) { const k = line.expression === 'angry' ? 'shake' : 'bump'; p.el.classList.remove('shake', 'bump'); void p.el.offsetWidth; p.el.classList.add(k); }
      if (line.fx) showFx(line.fx, line.pos);
    } else for (const p of Object.values(portraits)) if (p.who) p.el.classList.add('dim');
    if (line.pa) for (const p of Object.values(portraits)) if (p.who) p.el.classList.add('dim');
    S.full = line.text || ''; render(0);
    S.log.push({ name: line.narr ? '' : line.name, text: S.full, skipped: S.skip || S.skipHold });
    await typeOut();
    if (S.skip || S.skipHold) { await sleep(60); return; }
    await new Promise((res) => {
      S.adv = res;
      if (S.auto) { const wait = 1200 + S.full.length * 30; const tok = S.full; setTimeout(() => { if (S.adv === res && S.auto && S.full === tok) advance(); }, wait); }
    });
  }
  function showFx(kind, pos) {
    const e = document.createElement('div'); e.className = 'fx'; e.textContent = { anger: '💢', sweat: '💦', sparkle: '✨', exclaim: '❗' }[kind] || '';
    e.style.top = isMobile ? '120px' : '18vh'; e.style[pos === 'right' ? 'right' : 'left'] = isMobile ? 'calc(50% - 150px)' : '24vw';
    vn.appendChild(e); setTimeout(() => e.remove(), 1400);
  }
  function choose(choices) {
    setOpen(true); S.choosing = true; root.classList.add('choosing'); S.skip = false; updCtl();
    const leftSide = portraits.r.who && !portraits.l.who;
    choicesEl.className = 'choices' + (leftSide ? ' left' : '');
    choicesEl.innerHTML = choices.map((c, i) => `<button class="ch" style="animation-delay:${i * 60}ms" data-i="${i}"><i>${i + 1}</i>${esc(c.text)}${c.chip ? `<em>${esc(c.chip)}</em>` : ''}</button>`).join('');
    const t0 = performance.now();
    return new Promise((res) => {
      const pick = (i) => {
        if (performance.now() - t0 < 400) return;
        const b = choicesEl.querySelector(`[data-i="${i}"]`); if (!b) return;
        b.classList.add('sel'); onCue('ui-mode-pick');
        S.log.push({ name: '나', text: `▶ ${choices[i].text}` });
        setTimeout(() => { choicesEl.innerHTML = ''; S.choosing = false; root.classList.remove('choosing'); S.choiceKey = null; res(i); }, 120);
      };
      choicesEl.onpointerdown = (e) => { const b = e.target.closest('.ch'); if (b) { e.stopPropagation(); e.preventDefault(); pick(+b.dataset.i); } };
      S.choiceKey = (n) => pick(n);
    });
  }
  function close() { setOpen(false); box.classList.remove('pa'); }

  function modal(html, wire) {
    const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = html; root.appendChild(m); S.modal = m;
    return new Promise((res) => { wire(m, (v) => { m.remove(); S.modal = null; res(v); }); });
  }

  /** 고르기 카드 (이어서 하기 · 처음부터 · 다시 하기 · 자유 장보기). buttons: [{label, v, w(흰 버튼)}] → v */
  function pickCard({ title, sub, where, buttons, cue = 'ui-pause' }) {
    onCue(cue);
    const html = `<div class="card pick"><h2>${esc(title || '')}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}${where ? `<span class="where">${esc(where)}</span>` : ''}<div class="row">${buttons.map((b, i) => `<button class="${b.w ? 'w' : ''}" data-i="${i}">${esc(b.label)}${!isMobile && i === 0 ? ' <kbd>Enter</kbd>' : ''}</button>`).join('')}</div></div>`;
    return modal(html, (m, done) => {
      m.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (b) { e.stopPropagation(); onCue('ui-mode-pick'); done(buttons[+b.dataset.i].v); } });
      S.modalKey = (k) => { if (k === 'Enter' || k === 'Space') done(buttons[0].v); else if (/^Digit[1-4]$/.test(k) && buttons[+k.slice(5) - 1]) done(buttons[+k.slice(5) - 1].v); };
    });
  }
  /** 다음 날 미리보기 카드 (day.end nextDay) — canvas: 실루엣 그림(자리 표시) */
  function nextDayCard({ day, title, hook, canvas, buttons }) {
    onCue('stinger.nextday');
    const html = `<div class="card nd"><span class="tom">다음 이야기</span><h2>${day}일차</h2><h3>${esc(title || '')}</h3>${hook ? `<p>${esc(hook)}</p>` : ''}<div class="ndc"></div><div class="row" style="justify-content:center">${buttons.map((b, i) => `<button class="${b.w ? 'w' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    return modal(html, (m, done) => {
      if (canvas) m.querySelector('.ndc').appendChild(canvas);
      m.addEventListener('pointerdown', (e) => { const b = e.target.closest('button'); if (b) { e.stopPropagation(); onCue('ui-mode-pick'); done(buttons[+b.dataset.i].v); } });
      S.modalKey = (k) => { if (k === 'Enter' || k === 'Space' || k === 'Escape') done(buttons[0].v); };
    });
  }
  /** 컷 그림(오른쪽 위 작은 액자) — null 이면 닫음 */
  let cutEl = null;
  function cutIn(canvas) {
    if (cutEl) { cutEl.remove(); cutEl = null; }
    if (!canvas) return;
    cutEl = document.createElement('div'); cutEl.className = 'cut'; cutEl.appendChild(canvas); root.appendChild(cutEl);
  }
  function confirmExit() {
    onCue('ui-pause');
    return modal(`<div class="card"><h3>오늘 장보기를 멈출까요?</h3><ul><li class="g">오늘 기록과 일차·단골도는 저장돼요</li><li class="o">다음에 들어오면 같은 일차, 멈춘 곳부터 이어서 해요</li><li class="g">나가는 곳은 계산대 지나 왼쪽 끝 출구 EXIT · 안내선이 켜져요</li><li class="r">계산 안 한 카트는 비워요 · 벌칙 없음</li></ul>
      <div class="row"><button class="w" data-v="0">계속하기${isMobile ? '' : ' <kbd>Esc</kbd>'}</button><button data-v="1">저장하고 출구로${isMobile ? '' : ' <kbd>Enter</kbd>'}</button></div></div>`, (m, done) => {
      m.addEventListener('pointerdown', (e) => { const v = e.target.closest('button')?.dataset.v; if (v != null) { e.stopPropagation(); done(v === '1'); } });
      S.modalKey = (k) => { if (k === 'Escape') done(false); else if (k === 'Enter') done(true); };
    });
  }
  function showLog() {
    if (S.modal) return;
    modal(`<div class="log">${S.log.slice(-60).map((l) => `<p class="${l.skipped ? 'sk' : ''}">${l.name ? `<b>${esc(l.name)}</b>` : ''}${esc(l.text)}</p>`).join('') || '<p>아직 대사가 없어요</p>'}<p style="text-align:center;color:#9A9C98">닫기: 아무 곳이나 ${isMobile ? '탭' : '클릭 · L'}</p></div>`, (m, done) => {
      m.querySelector('.log').scrollTop = 1e6;
      m.addEventListener('pointerdown', (e) => { e.stopPropagation(); done(); });
      S.modalKey = (k) => { if (k === 'KeyL' || k === 'Escape') done(); };
    });
  }
  async function dayCard({ day, title, subtitle, missed }) {
    onCue('stinger.daycard');
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML = `<h2>${day}일차</h2><h3>${esc(title || '')}</h3><p>${esc(subtitle || '')}</p>${missed ? `<span class="miss">어제 놓친 사건 · ${esc(missed)}</span>` : ''}`;
    root.appendChild(c); await sleep(missed ? 2600 : 1600); c.remove();
  }
  // 모바일: 왼쪽 칩 대신 오른쪽 카드 하나 — 다음 할 일(➜ 목적지 · m) 한 줄 + 목표/성공/보상은 처음 몇 초만 펼침, 탭하면 다시 펼침
  const M = { det: null, detName: '', openT: 0, ev: null, sig: '', hint: '', stat: '' };
  function renderM() {
    const hint = M.ev && /^①/.test(M.hint) ? M.hint.replace(/^①[^·]*(· )?/, '') : M.hint; // 사건 카드가 이미 '먼저 카트 ➜' 를 말하면 ① 은 뺌
    const tip = `${hint ? `<small class="tip">${esc(hint)}</small>` : ''}${M.stat ? `<small class="st">${esc(M.stat)}</small>` : ''}`;
    let ev = M.ev;
    if (!ev) { // 사건이 없을 때도 범창고 안내(왼쪽 상자 대신)는 여기
      if (!M.hint && !M.stat) { if (M.sig !== '') { M.sig = ''; mchip.classList.remove('on'); } return; }
      const sig = `hint|${M.hint}|${M.stat}`; if (sig === M.sig) return; M.sig = sig;
      mchip.classList.add('on'); mchip.classList.remove('open');
      mchip.innerHTML = `<h4>범창고</h4>${tip}`; return;
    }
    const det = M.det && M.detName === ev.name ? M.det : null, open = !!det && performance.now() < M.openT;
    const sig = `${ev.head}|${ev.name}|${ev.where}|${ev.note}|${open}|${!!det}|${M.hint}|${M.stat}`; if (sig === M.sig) return; M.sig = sig;
    mchip.classList.add('on'); mchip.classList.toggle('open', open);
    mchip.innerHTML = `<h4>${esc(ev.head || '오늘의 사건')}${det && !open ? '<i>▾ 탭: 자세히</i>' : ''}</h4><h5>${esc(ev.name)}</h5><em>${esc(ev.where || '')}</em>${det ? `<dl>${det}</dl>` : ''}${ev.onTap || !det ? `<small>${esc(ev.note || '')}</small>` : ''}${tip}`;
  }
  mchip.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    if (M.ev?.onTap) { M.ev.onTap(); return; }
    if (M.det) { M.openT = performance.now() < M.openT ? 0 : performance.now() + 6000; M.sig = ''; renderM(); setTimeout(() => { M.sig = ''; renderM(); }, 6100); }
  });
  async function missionCard(ev) {
    onCue('mission-chip');
    if (isMobile) { // 따로 큰 카드 안 띄우고 오른쪽 카드를 4초 펼침
      M.det = `<dt>목표</dt><dd>${esc(ev.goal)}</dd><dt>성공</dt><dd>${esc(ev.success)}</dd><dt>보상</dt><dd>활기 +${ev.reward?.vitality || 0} · 단골 도장</dd>`; M.detName = ev.name; M.openT = performance.now() + 4000;
      if (!M.ev || M.ev.name !== ev.name) M.ev = { name: ev.name, where: '', note: '' };
      M.sig = ''; renderM(); setTimeout(() => { M.sig = ''; renderM(); }, 4100);
      await sleep(3400); return;
    }
    const c = document.createElement('div'); c.className = 'mcard';
    c.innerHTML = `<h4>오늘의 사건</h4><h5>${esc(ev.name)}</h5><dl><dt>목표</dt><dd>${esc(ev.goal)}</dd><dt>성공</dt><dd>${esc(ev.success)}</dd><dt>보상</dt><dd>활기 +${ev.reward?.vitality || 0} · 단골 도장</dd></dl>`;
    root.appendChild(c); await sleep(3400); c.remove();
  }
  function setHint(h) { if (!isMobile) return; const a = h?.hint || '', b = h?.stat || ''; if (a === M.hint && b === M.stat) return; M.hint = a; M.stat = b; renderM(); }
  function setChip(ev) {
    if (isMobile) { M.ev = ev || null; chip.style.display = 'none'; document.body.classList.toggle('dp-chip-m', !!ev); renderM(); return; }
    if (!ev) { chip.style.display = 'none'; document.body.classList.remove('dp-chip-m'); return; }
    chip.style.display = 'block'; document.body.classList.toggle('dp-chip-m', !!isMobile);
    chip.style.pointerEvents = ev.onTap ? 'auto' : 'none'; chip.style.cursor = ev.onTap ? 'pointer' : '';
    chip.onpointerdown = ev.onTap ? (e) => { e.stopPropagation(); e.preventDefault(); ev.onTap(); } : null;
    chip.innerHTML = `<b>${esc(ev.head || '오늘의 사건')}</b><span>${esc(ev.name)}</span><em>${esc(ev.where || '')}</em><small>${esc(ev.note || '안 가도 괜찮아요')}</small>`;
  }
  function shakeChip() { chip.classList.remove('shake'); void chip.offsetWidth; chip.classList.add('shake'); }
  function stampCard({ day, result, vitality, stamps, note }) {
    onCue('stinger.stamp');
    const label = { success: '성공', partial: '부분 성공', fail: '실패', missed: '놓침' }[result] || '';
    return modal(`<div class="card" style="text-align:center"><h2>${day}일차 끝</h2><div class="stamp">참 잘했어요</div><h3>${label ? `오늘의 사건: ${label}` : '오늘 장보기 완료'}</h3><p>활기 ${vitality} · 단골 도장 ${stamps}/7</p>${note ? `<p>${esc(note)}</p>` : ''}<button>확인</button></div>`, (m, done) => {
      m.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) { e.stopPropagation(); done(); } });
      S.modalKey = (k) => { if (k === 'Enter' || k === 'Space' || k === 'Escape') done(); };
    });
  }
  function modeSelect() {
    onLock(true); document.body.classList.add('dp-story-lock'); if (isMobile) document.body.classList.add('dp-story-m');
    const html = `<div class="mode"><div style="font-size:clamp(28px,5vh,52px)">📦</div><h2>어떻게 장 볼까요?</h2><p class="sub">범창고 정자점에 처음 오셨네요</p><div class="cards">
      <button class="mc focus" data-v="story"><span class="rec">처음이면 추천</span><img src="${assetBase}story/mode-story.webp" alt=""><h3>스토리 모드</h3><ul><li>범창고 정자점의 7일 이야기</li><li>매일 터지는 사건 · 소소한 반응 50가지</li><li>한범숙·말순·범이·반값과 단골 되기</li></ul></button>
      <button class="mc" data-v="free"><img src="${assetBase}story/mode-free.webp" alt=""><h3>자유 장보기</h3><ul><li>이야기 없이 마음대로 카트 밀기</li><li>손님 NPC · 직원 잔소리·장난 반응은 그대로</li><li>사건·컷신 없음</li></ul></button>
      </div><div class="hint">⚙ 설정 › 스토리 모드에서 언제든 바꿀 수 있어요</div></div>`;
    return new Promise((res) => {
      const m = document.createElement('div'); m.innerHTML = html; const el = m.firstElementChild; root.appendChild(el); S.modal = el;
      let f = 0; const cards = [...el.querySelectorAll('.mc')];
      const focus = (i) => { f = i; cards.forEach((c, k) => c.classList.toggle('focus', k === i)); onCue('ui-mode-pick'); };
      const done = (v) => { el.remove(); S.modal = null; onLock(false); document.body.classList.remove('dp-story-lock', 'dp-story-m'); res(v); };
      el.addEventListener('pointerdown', (e) => { const c = e.target.closest('.mc'); if (c) { e.stopPropagation(); done(c.dataset.v); } });
      S.modalKey = (k) => { if (k === 'ArrowLeft' || k === 'KeyA') focus(0); else if (k === 'ArrowRight' || k === 'KeyD') focus(1); else if (k === 'Enter' || k === 'Space') done(cards[f].dataset.v); };
    });
  }
  function settings(cur, onChange) {
    const seg = (id, opts) => `<div class="seg" data-id="${id}">${opts.map(([l, v]) => `<button data-v="${v}" class="${String(cur[id]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    return modal(`<div class="set"><h3>⚙ 범창고 설정</h3>
      <div class="it"><span>스토리 모드<small>끄면 자유 장보기 (스토리 하루는 저장)</small></span><button class="tg ${cur.mode === 'story' ? 'on' : ''}" data-id="mode">${cur.mode === 'story' ? '켜짐' : '꺼짐'}</button></div>
      <div class="it"><span>반응 말풍선<small>분당 최대 개수 · 안전 경고는 끄기여도 나와요</small></span>${seg('reactionFreq', [['많이', 4], ['보통', 3], ['적게', 1], ['끄기', 0]])}</div>
      <div class="it"><span>대사 속도</span>${seg('textSpeed', [['느림', '느림'], ['보통', '보통'], ['빠름', '빠름']])}</div>
      <div class="it"><span>본 대사만 건너뛰기</span><button class="tg ${cur.skipSeenOnly ? 'on' : ''}" data-id="skipSeenOnly">${cur.skipSeenOnly ? '켜짐' : '꺼짐'}</button></div>
      <div class="it"><span>배경음악 · 효과음<small>월드 소리 설정(BGM HUD)과 같은 값을 써요</small></span></div>
      <button class="close">닫기</button></div>`, (m, done) => {
      m.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const b = e.target.closest('button'); if (!b) { if (!e.target.closest('.set')) done(); return; }
        if (b.classList.contains('close')) return done();
        if (b.classList.contains('tg')) { const id = b.dataset.id; const v = id === 'mode' ? (cur.mode === 'story' ? 'free' : 'story') : !cur[id]; cur[id] = v; b.classList.toggle('on', id === 'mode' ? v === 'story' : v); b.textContent = (id === 'mode' ? v === 'story' : v) ? '켜짐' : '꺼짐'; onChange(id, v); return; }
        const sg = b.closest('.seg'); if (sg) { const id = sg.dataset.id; const v = id === 'reactionFreq' ? +b.dataset.v : b.dataset.v; cur[id] = v; sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onChange(id, v); }
      });
      S.modalKey = (k) => { if (k === 'Escape') done(); };
    });
  }
  /** 막지 않는 한마디 토스트 (왼쪽, 얼굴 동그라미 + 이름 + 한 줄, 진행 막대) */
  function toast({ face, name, text, ms, pa }) {
    const e = document.createElement('div'); e.className = 'rt' + (pa ? ' pa' : '');
    e.innerHTML = `${face ? `<img src="${face}" alt="">` : ''}<div><b>${esc(name || '')}</b><span>${esc(text)}</span></div><i style="animation-duration:${ms}ms"></i>`;
    rx.appendChild(e); while (rx.children.length > 2) rx.firstElementChild.remove();
    setTimeout(() => e.remove(), ms);
  }
  /** 머리 위 말풍선 (화면 좌표) */
  function bubble({ x, y, name, text, ms }) {
    const e = document.createElement('div'); e.className = 'bub'; e.style.left = `${x}px`; e.style.top = `${y}px`;
    e.innerHTML = `<b>${esc(name || '')}</b>${esc(text)}`; root.appendChild(e);
    const h = { el: e, alive: true }; setTimeout(() => { e.remove(); h.alive = false; }, ms); return h;
  }
  function setOffsets({ chipTop, rxTop, gearTop }) {
    if (chipTop != null) root.style.setProperty('--dp-chip-top', `${chipTop}px`);
    if (rxTop != null) root.style.setProperty('--dp-rx-top', `${rxTop}px`);
    if (gearTop != null) root.style.setProperty('--dp-gear-top', `${gearTop}px`);
  }
  // 키: 대화·모달이 열렸을 때만 가로챔 (캡처 단계에서 멈춤 → 매장 단축키로 안 감)
  function onKeyDown(e) {
    if (S.modal) { S.modalKey?.(e.code); e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (!S.open) return;
    const k = e.code;
    if (S.choosing && /^Digit[1-3]$/.test(k)) S.choiceKey?.(+k.slice(5) - 1);
    else if (k === 'KeyL') showLog();
    else if (k === 'KeyA' && !e.repeat) { S.auto = !S.auto; updCtl(); if (S.auto && !S.typing) advance(); }
    else if ((k === 'ControlLeft' || k === 'ControlRight') && !(getSettings?.().skipSeenOnly && !S.seen)) { S.skipHold = true; updCtl(); if (!S.choosing) advance(); }
    else if (k === 'Escape' && !e.repeat) requestExit();
    else if ((k === 'Space' || k === 'Enter' || k === 'KeyE') && !e.repeat && !S.choosing) advance();
    e.stopImmediatePropagation(); e.preventDefault();
  }
  function onKeyUp(e) { if (e.code === 'ControlLeft' || e.code === 'ControlRight') { S.skipHold = false; updCtl(); } if (S.open || S.modal) e.stopImmediatePropagation(); }
  window.addEventListener('keydown', onKeyDown, true); window.addEventListener('keyup', onKeyUp, true);
  // Ctrl 누르는 동안 계속 넘김
  const skipTimer = setInterval(() => { if (S.open && (S.skipHold || S.skip) && !S.choosing && !S.modal && !S.typing) advance(); }, 90);
  $('.gear').addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); gearHandler?.(); });
  let gearHandler = null;
  return {
    root, say, choose, close, pickCard, nextDayCard, cutIn, dayCard, missionCard, setChip, setHint, shakeChip, stampCard, modeSelect, settings, confirmExit, toast, bubble, prefetch, setOffsets,
    set onExit(f) { exitHandler = f; }, set onGear(f) { gearHandler = f; },
    setInGame(on) { root.classList.toggle('ingame', on); },
    get isOpen() { return S.open || !!S.modal; }, get blocking() { return S.open || !!S.modal; },
    get skipping() { return S.skip || S.skipHold; },
    advance, _S: S,
    dispose() { clearInterval(skipTimer); window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('keyup', onKeyUp, true); document.body.classList.remove('dp-story-lock', 'dp-chip-m', 'dp-story-m'); root.remove(); css.remove(); },
  };
}
