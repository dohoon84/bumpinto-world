// [depot] 매장 직원 NPC + 장난(미스치프) 감지 — 벌이 아니라 웃음 포인트.
//   점수(score)는 행동마다 오르고 천천히 식음. 3 / 6 / 10 / 15 를 넘으면 직원이 다가와 말풍선(점점 단호하게),
//   15 이상이면 입구까지 '모셔다' 드림(카트는 그 자리). 업적 토스트: 계란탑 N층 · 오늘 깬 계란 N개 등.
//   길찾기: 랙 사이 가로 통로(z 11 / 44 / 77 / 110) 하나를 골라 ㄷ자 3구간으로 이동. 직원 1명.
import * as THREE from 'three';

const CROSS_Z = [11, 44, 77, 110];
const LINES = {
  1: ['고객님~ 조심해주세요 ^^', '앗 고객님~ 살살 부탁드려요 ^^'],
  2: ['고객님, 계란은 깨지면 변상이에요…', '고객님… 상품은 소중히 다뤄주세요…'],
  3: ['고객님!! 진짜 이러시면 곤란해요 😤', '하아… 고객님, 저 오늘 야근이에요 😤'],
  4: ['…고객님, 입구까지 모셔다 드릴게요 🙂', '네~ 고객님, 잠깐 저랑 같이 가실게요 🙂'],
};
const KIND_LINE = {
  egg: (lv) => (lv >= 2 ? '고객님, 계란은 깨지면 변상이에요…' : '앗, 계란이…! 고객님~ 조심해주세요 ^^'),
  tower: () => '와… 계란탑… 사진은 찍으셔도 되는데 무너뜨리진 마세요',
  stack: () => '그렇게 높이 쌓으시면 무너져요 고객님~',
  floor: (lv) => (lv >= 2 ? '바닥에 떨어진 건… 제가 치울게요… 하아' : '고객님~ 바닥에 뭐 떨어졌어요 ^^'),
  ram: (lv) => (lv >= 2 ? '카트로 랙 들이받으시면 무너져요!!' : '쿵! 고객님 괜찮으세요? 천천히요~'),
  block: () => '고객님~ 카트가 통로를 막고 있어요 ^^;',
};

export function createStaff({ scene, camera, hud, keep, canvasTex, toast, st, onEscort }) {
  // ---------- 모델 (로우폴리 · 초록 앞치마 · 자체 디자인) ----------
  const root = new THREE.Group();
  const skin = keep(new THREE.MeshLambertMaterial({ color: 0xf0c9a0 })), shirt = keep(new THREE.MeshLambertMaterial({ color: 0xf3eada }));
  const pants = keep(new THREE.MeshLambertMaterial({ color: 0x2a3340 })), green = keep(new THREE.MeshLambertMaterial({ color: 0x1e5a45 }));
  const apronTex = keep(canvasTex(256, 320, (g) => {
    g.fillStyle = '#1E5A45'; g.fillRect(0, 0, 256, 320); g.fillStyle = '#F3EADA'; g.textAlign = 'center';
    g.font = '900 54px "Pretendard",sans-serif'; g.fillText('범창고', 128, 120); g.font = '700 26px "Pretendard",sans-serif'; g.fillText('BUMP DEPOT', 128, 160);
    g.fillStyle = '#C8965A'; g.fillRect(40, 196, 176, 6); g.fillStyle = '#F3EADA'; g.fillRect(70, 230, 116, 44); g.fillStyle = '#1E5A45'; g.font = '800 24px "Pretendard",sans-serif'; g.fillText('직원 범돌', 128, 261);
  }));
  const apronM = keep(new THREE.MeshLambertMaterial({ map: apronTex }));
  const G = (g) => keep(g);
  const legG = G(new THREE.BoxGeometry(0.14, 0.82, 0.16)); legG.translate(0, -0.41, 0);
  const legL = new THREE.Mesh(legG, pants), legR = new THREE.Mesh(legG, pants); legL.position.set(-0.1, 0.84, 0); legR.position.set(0.1, 0.84, 0);
  const torso = new THREE.Mesh(G(new THREE.CylinderGeometry(0.2, 0.22, 0.62, 10)), shirt); torso.position.y = 1.15;
  const apron = new THREE.Mesh(G(new THREE.BoxGeometry(0.36, 0.78, 0.02)), [green, green, green, green, apronM, green]); apron.position.set(0, 1.06, 0.215);
  const armG = G(new THREE.BoxGeometry(0.1, 0.6, 0.12)); armG.translate(0, -0.3, 0);
  const armL = new THREE.Mesh(armG, shirt), armR = new THREE.Mesh(armG, shirt); armL.position.set(-0.27, 1.43, 0); armR.position.set(0.27, 1.43, 0);
  const head = new THREE.Mesh(G(new THREE.SphereGeometry(0.15, 14, 10)), skin); head.position.y = 1.62;
  const cap = new THREE.Mesh(G(new THREE.CylinderGeometry(0.155, 0.16, 0.08, 14)), green); cap.position.y = 1.72;
  const brim = new THREE.Mesh(G(new THREE.BoxGeometry(0.22, 0.015, 0.12)), green); brim.position.set(0, 1.69, 0.16);
  root.add(legL, legR, torso, apron, armL, armR, head, cap, brim);
  const HOME = { x: 57, z: 12.5 };
  root.position.set(HOME.x, 0, HOME.z); scene.add(root);

  // ---------- 말풍선 / 업적 (DOM) ----------
  const css = document.createElement('style');
  css.textContent = `#depot-hud .dh-bubble{position:absolute;transform:translate(-50%,-100%);background:#fff;color:#13203d;border:3px solid #1E5A45;border-radius:16px;padding:8px 14px;font-size:15px;font-weight:800;white-space:nowrap;display:none;box-shadow:0 6px 18px rgba(0,0,0,.25)}
#depot-hud .dh-bubble:after{content:'';position:absolute;left:50%;bottom:-12px;margin-left:-9px;border:9px solid transparent;border-top-color:#1E5A45;border-bottom:0}
#depot-hud .dh-bubble.lv3{border-color:#D9442E}#depot-hud .dh-bubble.lv3:after{border-top-color:#D9442E}
#depot-hud .dh-ach{position:absolute;right:16px;top:130px;display:flex;flex-direction:column;gap:6px;align-items:flex-end}
#depot-hud .dh-ach div{background:#F2C230;color:#13203d;border-radius:12px;padding:8px 14px;font-size:14px;font-weight:900;box-shadow:0 6px 16px rgba(0,0,0,.25);animation:dhach .35s ease-out}
@keyframes dhach{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}`;
  document.head.appendChild(css);
  const bubble = document.createElement('div'); bubble.className = 'dh-bubble'; hud.appendChild(bubble);
  const achBox = document.createElement('div'); achBox.className = 'dh-ach'; hud.appendChild(achBox);
  function achieve(text) {
    const d = document.createElement('div'); d.textContent = `🏆 ${text}`; achBox.appendChild(d);
    while (achBox.children.length > 3) achBox.firstChild.remove();
    setTimeout(() => d.remove(), 4200);
    S.ach.push(text);
  }

  // ---------- 상태 ----------
  const S = { score: 0, level: 0, said: 0, mode: 'idle', path: [], talkT: 0, linger: 0, bubbleT: 0, line: '', kind: '', walkPh: 0, escortT: 0,
    eggsToday: 0, eggMilestone: 0, floorDrops: 0, floorMilestone: 0, towerBest: 0, rams: 0, blockT: 0, stackCd: 0, towerT: 0, ach: [], escorts: 0 };
  const lvOf = (s) => (s >= 15 ? 4 : s >= 10 ? 3 : s >= 6 ? 2 : s >= 3 ? 1 : 0);
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];

  function routeTo(tx, tz) {
    const sx = root.position.x, sz = root.position.z;
    let zc = CROSS_Z[0], best = Infinity; for (const z of CROSS_Z) { const c = Math.abs(sz - z) + Math.abs(tz - z); if (c < best) { best = c; zc = z; } }
    S.path = Math.abs(sx - tx) < 1.2 ? [{ x: tx, z: tz }] : [{ x: sx, z: zc }, { x: tx, z: zc }, { x: tx, z: tz }];
  }
  function say(text, lv) {
    S.line = text; S.bubbleT = 4.5; bubble.textContent = text; bubble.classList.toggle('lv3', lv >= 3);
    const v = new THREE.Vector3(root.position.x, 2.0, root.position.z).project(camera);
    if (!(v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1)) toast(`🧑‍💼 직원: ${text}`, 2800, lv >= 3 ? '#D9442E' : '#1E5A45'); // 화면 밖이면 토스트로도
  }
  // 장난 이벤트: kind, 점수
  function mischief(kind, amt) {
    S.score = Math.min(22, S.score + amt); S.kind = kind;
    const lv = lvOf(S.score);
    if (lv >= 1 && (lv > S.said || S.mode === 'idle' || S.mode === 'return')) {
      S.level = lv; S.mode = 'approach'; S.pending = true; S.linger = 0;
    }
  }
  function speakNow() {
    const lv = S.level;
    const text = lv >= 4 ? rnd(LINES[4]) : lv > S.said ? (lv === 1 && KIND_LINE[S.kind] ? KIND_LINE[S.kind](lv) : lv === 2 && S.kind === 'egg' ? LINES[2][0] : rnd(LINES[lv])) : (KIND_LINE[S.kind]?.(lv) || rnd(LINES[lv]));
    say(text, lv); S.said = Math.max(S.said, lv); S.pending = false; S.mode = 'talk'; S.talkT = lv >= 4 ? 2.6 : 4.5;
  }
  function onEggsBroken(n) {
    S.eggsToday += n; mischief('egg', Math.min(4, n * 0.5));
    for (const m of [10, 30, 60, 100, 200]) if (S.eggsToday >= m && S.eggMilestone < m) { S.eggMilestone = m; achieve(`오늘 깬 계란 ${S.eggsToday}개`); }
  }
  function onFloor(fell) {
    S.floorDrops++; mischief('floor', fell ? 0.8 : 0.3);
    for (const m of [5, 10, 20]) if (S.floorDrops >= m && S.floorMilestone < m) { S.floorMilestone = m; achieve(`바닥에 내려놓은 상품 ${S.floorDrops}개`); }
  }
  function onRam(v) { if (S.t - (S.ramAt ?? -9) < 1) return; S.ramAt = S.t; S.rams++; mischief('ram', 1.2 + v); if (S.rams === 3) achieve('범퍼카 3회 — 카트 운전면허 재시험 대상'); }

  // 계란탑: 카트 속 계란판 중 수평으로 겹친 채 쌓인 최대 층수
  function towerHeight(items) {
    const eggs = items.filter((it) => it.p.kind === 'egg'); let best = 0;
    for (const a of eggs) { let n = 1; for (const b of eggs) if (b !== a && b.body.position.y < a.body.position.y - 0.03 && Math.abs(b.body.position.x - a.body.position.x) < 0.16 && Math.abs(b.body.position.z - a.body.position.z) < 0.16) n++; best = Math.max(best, n); }
    return best;
  }
  function checkStacks(items, rimTop) {
    const h = towerHeight(items);
    if (h >= 3 && h > S.towerBest) { S.towerBest = h; achieve(`계란탑 ${h}층!`); if (h >= 5) mischief('tower', 1.5); }
    if (S.stackCd <= 0 && items.some((it) => it.body.position.y > rimTop + 0.75)) { S.stackCd = 20; achieve('하늘까지 쌓기 — 무너지면 책임은…'); mischief('stack', 1.5); }
  }
  const inAisle = (x, z) => ((z > 14 && z < 41) || (z > 47 && z < 74) || (z > 80 && z < 107)) && x > 14 && x < 66;

  function tick(dt, { me, cartObj, items, rimTop, cartHeld, cartVisible }) {
    S.t = (S.t || 0) + dt; S.score = Math.max(0, S.score - dt * 0.12); // 천천히 식음
    if (lvOf(S.score) < S.said && S.mode !== 'talk' && S.mode !== 'escort') S.said = lvOf(S.score);
    S.stackCd -= dt; S.towerT -= dt;
    if (S.towerT <= 0) { S.towerT = 0.5; checkStacks(items, rimTop); }
    // 통로 막기: 손 놓은 카트가 랙 사이 통로에 있고, 플레이어가 4 m 이상 떨어져 20초
    if (cartVisible && !cartHeld && inAisle(cartObj.x, cartObj.z) && Math.hypot(me.x - cartObj.x, me.z - cartObj.z) > 4) { S.blockT += dt; if (S.blockT > 20) { S.blockT = -20; mischief('block', 2.5); } }
    else S.blockT = Math.min(S.blockT, 0) + (S.blockT < 0 ? dt : 0);

    const p = root.position, dToMe = Math.hypot(me.x - p.x, me.z - p.z);
    let moving = false;
    if (S.mode === 'approach' || S.mode === 'return') {
      if (S.mode === 'approach' && (S.path.length === 0 || S.repathT <= 0)) { routeTo(me.x, me.z); S.repathT = 1.2; }
      S.repathT = (S.repathT ?? 0) - dt;
      if (S.mode === 'return' && S.path.length === 0) routeTo(HOME.x, HOME.z);
      if (S.mode === 'approach' && dToMe < 1.7) { S.path = []; speakNow(); }
      else if (S.path.length) {
        const w = S.path[0], dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz), sp = S.mode === 'approach' ? 2.4 : 1.3;
        if (d < 0.15) S.path.shift(); else { const k = Math.min(1, sp * dt / d); p.x += dx * k; p.z += dz * k; root.rotation.y = Math.atan2(dx, dz); moving = true; }
        if (S.mode === 'return' && Math.hypot(HOME.x - p.x, HOME.z - p.z) < 0.2) { S.mode = 'idle'; S.path = []; }
      } else if (S.mode === 'return') S.mode = 'idle';
    } else if (S.mode === 'talk') {
      root.rotation.y = Math.atan2(me.x - p.x, me.z - p.z);
      S.talkT -= dt;
      if (S.talkT <= 0) {
        if (S.level >= 4) { // 입구까지 모셔다 드림
          S.escorts++; onEscort(); p.set(me.x + 1.2, 0, me.z - 0.6); S.score = 5; S.said = 1; S.level = 1;
          say(S.escorts > 1 ? '또 오셨네요 고객님~ 이번엔 살살이요 ^^' : '여기서부터 천천히 다시 쇼핑하세요~ ^^', 1); S.mode = 'linger'; S.linger = 4;
          achieve(S.escorts > 1 ? `입구 에스코트 ${S.escorts}회` : '직원 에스코트 받음');
        } else if (S.pending) speakNow();
        else { S.mode = 'linger'; S.linger = 5; }
      }
      if (dToMe > 3.5 && S.talkT > 0.5) { S.mode = 'approach'; S.path = []; } // 도망가면 쫓아옴
    } else if (S.mode === 'linger') {
      root.rotation.y = Math.atan2(me.x - p.x, me.z - p.z);
      S.linger -= dt; if (S.pending) S.mode = 'approach'; else if (S.linger <= 0) { S.mode = 'return'; S.path = []; }
    }
    // 걷기 모션
    if (moving) S.walkPh += dt * 9; else S.walkPh *= 0.8;
    const sw = Math.sin(S.walkPh) * 0.5 * (moving ? 1 : 0);
    legL.rotation.x = sw; legR.rotation.x = -sw; armL.rotation.x = -sw * 0.8; armR.rotation.x = sw * 0.8;
    if (S.mode === 'talk' && S.level >= 3) { armL.rotation.z = 0.5; armR.rotation.z = -0.5; armL.rotation.x = armR.rotation.x = -0.4; } else { armL.rotation.z = armR.rotation.z = 0; }
    // 말풍선
    if (S.bubbleT > 0) {
      S.bubbleT -= dt;
      const v = new THREE.Vector3(p.x, 2.0, p.z).project(camera);
      const show = S.bubbleT > 0 && v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      bubble.style.display = show ? 'block' : 'none';
      if (show) { bubble.style.left = `${Math.max(8, Math.min(innerWidth - 8, (v.x + 1) / 2 * innerWidth))}px`; bubble.style.top = `${Math.max(40, (1 - v.y) / 2 * innerHeight)}px`; }
    } else bubble.style.display = 'none';
  }
  return {
    S, root, tick, mischief, onEggsBroken, onFloor, onRam, achieve,
    get damageWon() { return S.eggsToday * Math.round(8480 / 30); },
    dispose() { css.remove(); bubble.remove(); achBox.remove(); },
  };
}
