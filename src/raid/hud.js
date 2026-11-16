import './hud.css';
import './mobile-hud.css';
import { virtualPad } from '../input.js';
import { AURAS, CLASS_IDS, describeSkill, getClass } from './classes.js';
import { toFrame, ALONG_MIN, ALONG_MAX, SAFE_ALONG, SAFE_R, BOSS_ALONG } from './layout.js';

const VN_LINES = [
  { name: '안내', text: '탄천 합수부 하늘이 갈라집니다. 이 장면은 이 화면에서만, 처음 한 번만 보입니다.' },
  { name: '도훈', text: '익숙한 손놀림이 돌아옵니다. 평소의 몸은 잠시 뒤에 둡니다.' },
  { name: '하린', text: '장판이 깔리기 전에 자리를 잡으세요. 기둥은 길을 따라 옵니다.' },
  { name: '지우', text: '쓰러져도 노란 선에서 다시 일어납니다. 늦게 들어와도 보스가 살아 있으면 합류할 수 있습니다.' },
  { name: '안내', text: '준비가 되면 출동을 누르세요.' },
];

const SKILL_ICON = {
  slash: 'slash', charge: 'charge', shout: 'shout', spin: 'spin',
  shard: 'shard', nova: 'nova', freeze: 'freeze', blizzard: 'blizzard',
  smite: 'smite', heal: 'heal', circle: 'circle', holy: 'holy',
  shot: 'shot', volley: 'volley', mark: 'mark', rain: 'rain',
  daggers: 'daggers', shadow: 'shadow', stealth: 'stealth', tape: 'tape',
};
const BASIC_ATTACK = new Set(['slash', 'shard', 'smite', 'shot', 'daggers']);
function roundIcon(id, large = false) {
  return `/dungeon/hud/round/${id}${large ? '-lg' : ''}.webp`;
}
// HUD C 전사 바. 불꽃(warrior_cast)은 마법사 전용이라 여기 두지 않는다.
const WARRIOR_BAR = [
  { key: '1', id: 'slash', icon: 'slash' },
  { key: '2', id: 'charge', icon: 'charge' },
  { key: '3', id: 'shout', icon: 'shout' },
  { key: '4', id: 'spin', icon: 'spin' },
  { key: 'Q', aura: 'buff_power', icon: 'buff_power' },
  { key: 'E', aura: 'buff_shield', icon: 'buff_shield' },
  { key: 'R', icon: 'buff_haste' },
  { key: 'F', icon: 'hud_star' },
  { key: 'G', icon: 'buff_regen' },
  { key: 'T', icon: 'lock', empty: true },
];
const EXTRA_KEYS = ['Q', 'E', 'R', 'F', 'G', 'T'];
const GEM = { 전사: '#FF7A1A', 마법사: '#8C7FFF', 사제: '#FFC845', 궁수: '#3DDC84', 암살자: '#E5383B' };

const ICONS = {
  slash: '<svg viewBox="0 0 64 64"><path d="M12 50 L46 12" stroke="#ffe7a3" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M40 10 h12 v12" stroke="#e6c36a" stroke-width="4" fill="none"/></svg>',
  charge: '<svg viewBox="0 0 64 64"><path d="M14 12 h22 l8 10 v24 l-8 8 H14 z" fill="#4e5966" stroke="#e6c36a" stroke-width="3"/><path d="M18 32 h16" stroke="#3ecfc6" stroke-width="4"/></svg>',
  shout: '<svg viewBox="0 0 64 64"><circle cx="26" cy="34" r="8" fill="#e6c36a"/><path d="M36 26 q12 8 0 18 M42 20 q18 14 0 28" stroke="#7ef0e4" stroke-width="3" fill="none"/></svg>',
  spin: '<svg viewBox="0 0 64 64"><path d="M32 10 a22 22 0 1 1 -8 4" stroke="#ffe7a3" stroke-width="4" fill="none"/><path d="M18 16 l8 -8 l2 10 z" fill="#e6c36a"/></svg>',
  lock: '<svg viewBox="0 0 64 64"><rect x="18" y="28" width="28" height="22" rx="3" fill="#243040" stroke="#8a6a32"/><path d="M24 28 v-6 a8 8 0 0 1 16 0 v6" stroke="#e6c36a" stroke-width="3" fill="none"/></svg>',
  shard: '<svg viewBox="0 0 64 64"><path d="M32 8 L44 36 L32 56 L20 36 Z" fill="#b9ecff" stroke="#e6c36a"/></svg>',
  nova: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="16" fill="none" stroke="#7fd4ff" stroke-width="4"/></svg>',
  freeze: '<svg viewBox="0 0 64 64"><path d="M32 10 V54 M14 22 L50 42 M14 42 L50 22" stroke="#d7f6ff" stroke-width="3"/></svg>',
  blizzard: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="18" fill="none" stroke="#9fd6ff" stroke-width="4"/><circle cx="32" cy="32" r="6" fill="#fff"/></svg>',
  smite: '<svg viewBox="0 0 64 64"><path d="M34 8 L18 36 H30 L26 56 L48 26 H34 Z" fill="#ffe7a0"/></svg>',
  heal: '<svg viewBox="0 0 64 64"><rect x="26" y="12" width="12" height="40" fill="#ffe7a0"/><rect x="12" y="26" width="40" height="12" fill="#ffe7a0"/></svg>',
  circle: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="16" fill="none" stroke="#ffd27a" stroke-width="4"/></svg>',
  holy: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="10" fill="#fff1b8"/><path d="M32 8 V56 M8 32 H56" stroke="#e6c36a" stroke-width="3"/></svg>',
  shot: '<svg viewBox="0 0 64 64"><path d="M12 46 L50 16" stroke="#ffe7a0" stroke-width="4"/><path d="M44 14 L54 16 L48 26" fill="#e6c36a"/></svg>',
  volley: '<svg viewBox="0 0 64 64"><path d="M10 50 L40 16 M18 52 L48 18 M26 54 L56 20" stroke="#ffd27a" stroke-width="3"/></svg>',
  mark: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="14" fill="none" stroke="#ffb15a" stroke-width="3"/><circle cx="32" cy="32" r="3" fill="#ffb15a"/></svg>',
  rain: '<svg viewBox="0 0 64 64"><path d="M16 14 L22 40 M32 10 L38 42 M48 16 L52 40" stroke="#fff1b8" stroke-width="3"/></svg>',
  daggers: '<svg viewBox="0 0 64 64"><path d="M16 50 L30 14 M48 50 L34 14" stroke="#e8eef2" stroke-width="4"/></svg>',
  shadow: '<svg viewBox="0 0 64 64"><path d="M10 40 H40 L54 24" stroke="#9aa6b2" stroke-width="4" fill="none"/></svg>',
  stealth: '<svg viewBox="0 0 64 64"><ellipse cx="32" cy="36" rx="16" ry="10" fill="#243040" stroke="#7aa0c4"/></svg>',
  tape: '<svg viewBox="0 0 64 64"><rect x="10" y="28" width="44" height="8" fill="#ffe14a"/><rect x="28" y="10" width="8" height="44" fill="#ffe14a"/></svg>',
};

function bar(cls) {
  return `<div class="bar ${cls}"><span></span></div>`;
}

export function createHud() {
  const root = document.createElement('div');
  root.id = 'bw-raid';
  root.innerHTML = `
    <div class="c-stage" data-cstage>
      <div class="c-toast">
        <i></i>
        <b>균열 · 탄천교</b>
        <span data-stage>레이드 진행 중 · 1단계</span>
        <em>J</em>
      </div>
      <div class="c-boss">
        <div class="c-boss-top">
          <b>홀드</b>
          <span data-boss-sub>2장 · 탄천 보스</span>
          <span class="c-pips" data-boss-pips><b class="on">◆</b><b class="on">◆</b><b>◇</b></span>
          <em data-boss-pct>100%</em>
        </div>
        <div class="c-boss-line">
          <svg class="c-cap" viewBox="0 0 96 40" aria-hidden="true"><g stroke-linecap="round"><path d="M78 20 L8 3" stroke="#6a4010" stroke-width="3.4"/><path d="M78 20 L3 9" stroke="#6a4010" stroke-width="3.2"/><path d="M78 20 L0 20" stroke="#6a4010" stroke-width="3.4"/><path d="M78 20 L3 31" stroke="#6a4010" stroke-width="3.2"/><path d="M78 20 L8 37" stroke="#6a4010" stroke-width="3.4"/><path d="M76 20 L14 6" stroke="#f6d78a" stroke-width="1.7"/><path d="M76 20 L8 12" stroke="#f6d78a" stroke-width="1.6"/><path d="M76 20 L6 20" stroke="#ffe7a8" stroke-width="1.8"/><path d="M76 20 L8 28" stroke="#f6d78a" stroke-width="1.6"/><path d="M76 20 L14 34" stroke="#f6d78a" stroke-width="1.7"/></g><path d="M82 20 H92" stroke="#f0c45a" stroke-width="2"/><path d="M84 11 l7 9 -7 9 -7 -9 z" fill="#e8b64a" stroke="#fff1c2" stroke-width="0.7"/><path d="M84 15.5 l2.6 4.5 -2.6 4.5 -2.6 -4.5 z" fill="#b4232c"/></svg>
          <div class="c-hp">
            <span class="ghost" data-boss-ghost></span>
            <span class="fill" data-boss-fill></span>
            <i class="tick" style="left:33.33%"></i>
            <i class="tick" style="left:66.66%"></i>
            <b data-boss-num>0 / 0</b>
          </div>
          <svg class="c-cap flip" viewBox="0 0 96 40" aria-hidden="true"><g stroke-linecap="round"><path d="M78 20 L8 3" stroke="#6a4010" stroke-width="3.4"/><path d="M78 20 L3 9" stroke="#6a4010" stroke-width="3.2"/><path d="M78 20 L0 20" stroke="#6a4010" stroke-width="3.4"/><path d="M78 20 L3 31" stroke="#6a4010" stroke-width="3.2"/><path d="M78 20 L8 37" stroke="#6a4010" stroke-width="3.4"/><path d="M76 20 L14 6" stroke="#f6d78a" stroke-width="1.7"/><path d="M76 20 L8 12" stroke="#f6d78a" stroke-width="1.6"/><path d="M76 20 L6 20" stroke="#ffe7a8" stroke-width="1.8"/><path d="M76 20 L8 28" stroke="#f6d78a" stroke-width="1.6"/><path d="M76 20 L14 34" stroke="#f6d78a" stroke-width="1.7"/></g><path d="M82 20 H92" stroke="#f0c45a" stroke-width="2"/><path d="M84 11 l7 9 -7 9 -7 -9 z" fill="#e8b64a" stroke="#fff1c2" stroke-width="0.7"/><path d="M84 15.5 l2.6 4.5 -2.6 4.5 -2.6 -4.5 z" fill="#b4232c"/></svg>
        </div>
        <div class="c-castrow">
          <img data-aura="debuff_burn" data-remain="6" src="/dungeon/hud/round/debuff_burn.webp" alt="" />
          <img data-aura="debuff_armorbreak" data-remain="6" src="/dungeon/hud/round/debuff_armorbreak.webp" alt="" />
          <span data-cast-name></span>
          <div class="c-cast"><span data-cast-fill></span></div>
          <em data-cast-time></em>
        </div>
      </div>
      <section class="c-party" data-party></section>
      <div class="c-warn" data-warn hidden>
        <i>!</i>
        <strong data-warn-name></strong>
        <em data-warn-time></em>
      </div>
      <div class="c-vitals">
        <div class="c-buffs">
          <img data-aura="buff_power" data-remain="8" src="/dungeon/hud/round/buff_power.webp" alt="" />
          <img data-aura="buff_shield" data-remain="8" src="/dungeon/hud/round/buff_shield.webp" alt="" />
          <img data-aura="buff_haste" data-remain="8" src="/dungeon/hud/round/buff_haste.webp" alt="" />
          <span>8s</span>
        </div>
        <div class="c-vname"><b data-player-name>도훈</b><span data-my-role>전사</span><em data-player-num>100 / 100</em></div>
        <div class="c-hp thin"><span class="ghost" data-player-ghost></span><span class="fill" data-player-fill></span></div>
        <div class="c-res" data-res="rage"><span data-rage-fill></span></div>
        <span class="c-resread" data-res-read>분노 0</span>
      </div>
      <div class="c-portrait">
        <img data-portrait alt="" />
        <span data-form>변신 42%</span>
        <b data-level>1</b>
      </div>
      <div class="c-skills" data-skills></div>
      <button type="button" class="c-auto" data-auto aria-pressed="false">AUTO</button>
      <div class="c-map">
        <canvas class="c-minimap" width="152" height="152" data-map></canvas>
        <div class="c-clock" data-clock>00:00</div>
        <div class="c-clocksub">탄천교 · 제한 10:00</div>
        <button type="button" class="c-dps" data-dps-toggle>피해량 ▸</button>
      </div>
    </div>
    <div class="flash" data-flash></div>
    <div class="raid-chip" data-raid-chip><i></i><b>균열 · 탄천</b><span data-stage>1단계</span></div>
    <section class="party panel"></section>
    <div class="minimap-wrap">
      <canvas class="minimap" width="168" height="168"></canvas>
      <div class="map-cap">탄천 자전거길</div>
      <div class="map-sub">합수부 · 균열</div>
    </div>
    <aside class="quest panel">
      <h3>균열 레이드: 탄천</h3>
      <div class="row"><span>홀드 처치</span><b data-kills>0 / 1</b></div>
      <div class="row"><span>레이드 진행</span><b>1 단계</b></div>
      <div class="dim">남은 시간 <b data-time>15:00</b></div>
      <div class="tip">TIP: 노란 선 안에서 열풍을 피하세요.</div>
    </aside>
    <section class="boss panel" data-boss>
      <div class="boss-row">
        <div class="medallion">홀</div>
        <div><span class="boss-name">홀드</span><span class="boss-grade">C · 지역</span></div>
        <div class="boss-num">100%</div>
      </div>
      <div class="bar hp"><span></span></div>
      <div class="bar cast"><span></span></div>
      <div class="cast-label"><span></span><span></span></div>
    </section>
    <div class="dock">
      <div class="face" data-face>초</div>
      <div class="plates">
        <div class="plate panel">
          <div class="plate-name">도훈 <span>전사</span> <b>100 / 100</b></div>
          <div class="bar thin hp"><span></span></div>
          <div class="label"><span data-res-label>분노</span><span>0 / 100</span></div>
          <div class="bar thin rage"><span></span></div>
          <div class="pips" data-pips hidden></div>
        </div>
        <div class="plate panel">
          <div class="plate-name">홀드 <span>대상</span></div>
          <div class="bar thin hp"><span></span></div>
          <div class="label"><span>대상 체력</span><span>100%</span></div>
        </div>
      </div>
      <div class="skills"></div>
      <div class="help">WASD 이동 · 휠 줌 · Space 회피 · 1–4 스킬 · 전역 재사용 대기 1.2초 · Z 자동전투</div>
    </div>
    <div class="away" data-away hidden>탄천 합수부에 균열이 열렸습니다</div>
    <section class="alert panel" data-alert hidden>
      <p class="kicker">탄천 균열 경보</p>
      <h2 data-alert-title>하늘이 갈라집니다</h2>
      <p class="count" data-alert-count>01:30</p>
      <div class="alert-actions">
        <button type="button" class="primary" data-deploy>출동</button>
        <button type="button" class="ghost" data-open-pick>직업 바꿔 출동</button>
      </div>
    </section>
    <div class="alert-line" data-alert-line hidden></div>
    <div class="vn" data-vn hidden>
      <div class="vn-card panel">
        <div class="vn-portrait" data-vn-who>초</div>
        <div>
          <div class="vn-name" data-vn-name>안내</div>
          <p data-vn-text></p>
        </div>
      </div>
      <button type="button" class="ghost vn-skip" data-vn-skip>건너뛰기</button>
      <div class="vn-hint">클릭 · Space 로 다음</div>
    </div>
    <div class="warn" hidden>
      <strong></strong>
      <em></em>
    </div>
    <aside class="meter panel">
      <div>피해 <b data-dealt>0</b></div>
      <div>치유 <b data-healed>0</b></div>
    </aside>
    <div class="floats" data-floats></div>
    <div class="banner panel" data-banner hidden></div>
    <div class="card-wrap" data-victory>
      <div class="card panel">
        <div class="kicker" data-result-kicker>클리어</div>
        <h2 data-result-title>균열 봉인 완료</h2>
        <p class="result-sub" data-result-sub>탄천교에 다시 평화가 찾아왔습니다</p>
        <div class="result-actions">
          <button type="button" class="primary" data-redeploy>다시 출동</button>
          <button type="button" class="ghost" data-repick>직업 바꿔 출동</button>
          <button type="button" class="ghost" data-peace>일상으로 돌아가기</button>
        </div>
        <div class="xp" data-result-xp>경험치 <b>+1,240</b> · Lv.1 → Lv.2</div>
        <div class="drops" data-result-drops>
          <div class="drop r-rare"><span>안개 우산</span><i>희귀</i></div>
          <div class="drop r-common"><span>합수 자전거 벨</span><i>일반</i></div>
          <div class="drop r-key"><span>보딩패스 조각 STB-???</span><i>키</i></div>
        </div>
        <div class="title-chip" data-result-titlechip>칭호 『첫 출동』</div>
      </div>
    </div>
    <div class="peace-note panel">탄천교에 다시 평화가 찾아왔습니다 · 칭호 『첫 출동』</div>
    <div class="pick" data-pick hidden>
      <div class="pick-card panel">
        <p class="kicker">직업 선택</p>
        <h2>어떤 직업으로 출동할까요</h2>
        <p class="pick-note">전투가 끝나면 직업을 다시 고를 수 있습니다.</p>
        <div class="pick-grid" data-pick-grid></div>
        <button type="button" class="primary" data-pick-go>이 직업으로 출동</button>
      </div>
    </div>
    <div class="mix">
      <button type="button" class="mute" data-mute>소리 켜짐</button>
      <label>음악 <input type="range" min="0" max="1" step="0.01" value="0.72" data-vol-bgm></label>
      <label>효과 <input type="range" min="0" max="1" step="0.01" value="0.9" data-vol-sfx></label>
    </div>
    <div class="c-tip" data-tip hidden></div>
    <div class="m-joy" data-joy>
      <i></i>
    </div>
  `;
  document.body.appendChild(root);
  const joy = root.querySelector('[data-joy]');
  const knob = joy.querySelector('i');
  let joyId = null;
  let joyX = 0;
  let joyY = 0;
  const joyR = 46;
  const setJoy = (dx, dy) => {
    const dist = Math.hypot(dx, dy) || 1;
    const k = dist > joyR ? joyR / dist : 1;
    dx *= k;
    dy *= k;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(1, dist / joyR);
    virtualPad.s = mag < 0.14 ? 0 : dx / joyR;
    virtualPad.f = mag < 0.14 ? 0 : -dy / joyR;
  };
  const armJoy = (id, cx, cy, px, py) => {
    joyId = id;
    joyX = cx;
    joyY = cy;
    joy.style.left = `${cx}px`;
    joy.style.top = `${cy}px`;
    joy.classList.add('is-on');
    try { joy.setPointerCapture(id); } catch { /* the touch already landed on the world */ }
    setJoy(px - cx, py - cy);
  };
  joy.addEventListener('pointerdown', (e) => {
    const r = joy.getBoundingClientRect();
    armJoy(e.pointerId, r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
    e.preventDefault();
  });
  window.addEventListener('pointerdown', (e) => {
    if (!root.classList.contains('is-handheld') || joyId != null) return;
    if (e.target.closest('button, a, input, textarea, .m-side, .m-player, .rchat, .c-slot, .m-menu, .c-map, .m-boss, .c-warn')) return;
    if (e.clientX > window.innerWidth * 0.48 || e.clientY < window.innerHeight * 0.42) return;
    e.stopPropagation();
    armJoy(e.pointerId, e.clientX, e.clientY, e.clientX, e.clientY);
  }, true);
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyId) return;
    setJoy(e.clientX - joyX, e.clientY - joyY);
  });
  const endJoy = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    joy.classList.remove('is-on');
    knob.style.transform = '';
    virtualPad.f = 0;
    virtualPad.s = 0;
  };
  joy.addEventListener('pointerup', endJoy);
  joy.addEventListener('pointercancel', endJoy);

  const party = root.querySelector('[data-party]');
  let vnIndex = 0;
  let cutscene = false;

  const skillsEl = root.querySelector('[data-skills]');
  let active = getClass('warrior');
  let picked = 'warrior';
  function paintSkills(list) {
    const live = list.filter((s) => !s.locked);
    const byId = Object.fromEntries(live.map((s) => [s.id, s]));
    let cells;
    if (active.id === 'warrior') {
      cells = WARRIOR_BAR.map((c) => ({
        key: c.key,
        icon: c.icon,
        empty: !!c.empty,
        aura: c.aura || '',
        skill: c.id ? byId[c.id] : null,
      }));
    } else {
      const extras = ['buff_power', 'buff_shield', 'buff_haste', 'buff_regen', `class_${active.id}`];
      cells = [];
      live.slice(0, 4).forEach((s) => cells.push({ skill: s, icon: SKILL_ICON[s.id], key: s.key }));
      while (cells.length < 4) cells.push({ key: String(cells.length + 1) });
      extras.forEach((icon, i) => cells.push({
        icon,
        key: EXTRA_KEYS[i],
        aura: icon.startsWith('buff_') || icon.startsWith('debuff_') ? icon : '',
      }));
      cells.push({ key: 'T', icon: 'lock', empty: true });
    }
    if (root.classList.contains('is-handheld')) cells = cells.filter((c) => !c.empty && (c.skill || c.icon));
    skillsEl.dataset.mode = 'live';
    skillsEl.dataset.klass = active.id;
    skillsEl.innerHTML = cells.map((c) => `
      <button type="button" class="c-slot${c.empty ? ' is-empty' : ''}${c.skill?.locked ? ' locked' : ''}" ${c.skill ? `data-skill="${c.skill.id}"` : ''} ${c.aura ? `data-aura="${c.aura}" data-remain="8"` : ''}>
        ${c.icon ? `<img src="${roundIcon(c.icon, BASIC_ATTACK.has(c.icon))}" alt="" />` : ''}
        <span class="sweep" style="--p:0"></span>
        <span class="gcd" style="--g:0"></span>
        <b class="key">${c.key}</b>
        <b class="cd"></b>
      </button>
    `).join('');
    skillsEl.querySelectorAll('[data-skill]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tipHold === '1') {
          btn.dataset.tipHold = '';
          return;
        }
        hud.onSkill?.(btn.getAttribute('data-skill'));
      });
    });
    if (root.classList.contains('is-handheld')) layoutWheel();
  }
  let wheelPage = 0;
  const INNER_ANGLES = [102, 130, 158, 186];
  const OUTER_ANGLES = [142, 164, 186];
  function placeOnArc(btn, size, deg, radius, attack) {
    const rad = deg * Math.PI / 180;
    const cx = attack / 2 - Math.cos(rad) * radius;
    const cy = attack / 2 + Math.sin(rad) * radius;
    btn.style.width = `${size}px`;
    btn.style.height = `${size}px`;
    btn.style.right = `${cx - size / 2}px`;
    btn.style.bottom = `${cy - size / 2}px`;
  }
  function layoutWheel() {
    const buttons = [...skillsEl.querySelectorAll('.c-slot')];
    const main = buttons[0];
    const rest = buttons.slice(1);
    const short = Math.min(window.innerWidth, window.innerHeight);
    const scale = short / 366;
    const attack = Math.round(80 * scale);
    const innerSize = Math.round(52 * scale);
    const outerSize = Math.round(42 * scale);
    const util = Math.round(36 * scale);
    const rIn = Math.round(100 * scale);
    const rOut = Math.round(150 * scale);
    const pageSize = INNER_ANGLES.length + OUTER_ANGLES.length;
    const page = rest.slice(wheelPage * pageSize, wheelPage * pageSize + pageSize);
    const inner = page.slice(0, INNER_ANGLES.length);
    const outer = page.slice(INNER_ANGLES.length);
    buttons.forEach((btn) => {
      btn.classList.remove('m-main', 'm-in', 'm-out');
      btn.classList.add('m-off');
    });
    if (main) {
      main.classList.remove('m-off');
      main.classList.add('m-main');
      main.style.width = `${attack}px`;
      main.style.height = `${attack}px`;
      main.style.right = '0px';
      main.style.bottom = '0px';
    }
    inner.forEach((btn, i) => {
      btn.classList.remove('m-off');
      btn.classList.add('m-in');
      placeOnArc(btn, innerSize, INNER_ANGLES[i], rIn, attack);
    });
    outer.forEach((btn, i) => {
      btn.classList.remove('m-off');
      btn.classList.add('m-out');
      placeOnArc(btn, outerSize, OUTER_ANGLES[i], rOut, attack);
    });
    const more = root.querySelector('.m-more');
    if (more) {
      more.hidden = rest.length <= pageSize;
      more.innerHTML = '<img src="/dungeon/hud/round/page.webp" alt="" />';
      placeOnArc(more, util, 78, Math.round(70 * scale), attack);
    }
    const box = skillsEl.parentElement;
    if (box) {
      const w = Math.ceil(rOut + outerSize / 2 + attack / 2 + 8);
      const h = Math.ceil(rOut + outerSize / 2 + attack / 2 + 8);
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
      skillsEl.style.width = `${w}px`;
      skillsEl.style.height = `${h}px`;
    }
  }
  paintSkills(active.skills);
  const tip = root.querySelector('[data-tip]');
  let tipTimer = 0;
  function tipHtmlSkill(s, cls) {
    const d = describeSkill(s, cls);
    return `<div class="c-tip-top"><b>${d.name}</b><span>${d.key}</span></div>
      <em style="color:${d.color}">${d.type}</em>
      <p>${d.effect}</p>
      <small>재사용 ${d.cd}초 · ${d.cost ? `${d.res} ${d.cost}` : `${d.res} 없음`} · ${d.area ? '범위' : '사거리'} ${d.range}m · 시전 ${d.cast}초</small>`;
  }
  function tipHtmlAura(id, remain) {
    const a = AURAS[id];
    if (!a) return '';
    return `<div class="c-tip-top"><b>${a.name}</b></div>
      <em style="color:${a.color}">${a.kind}</em>
      <p>${a.effect}</p>
      <small>남은 시간 ${remain || '—'}</small>`;
  }
  function placeTip(anchor) {
    if (root.classList.contains('is-handheld')) {
      tip.style.width = '220px';
      const w = 220;
      const h = tip.offsetHeight || 96;
      const x = Math.max(12, Math.min((window.innerWidth - w) / 2, window.innerWidth - w - 12));
      const y = Math.max(112, Math.min(window.innerHeight * 0.4, window.innerHeight - h - 176));
      tip.style.left = `${Math.round(x)}px`;
      tip.style.top = `${Math.round(y)}px`;
      root.classList.add('is-tip');
      return;
    }
    tip.style.width = '300px';
    const r = anchor.getBoundingClientRect();
    const w = tip.offsetWidth || 300;
    const h = tip.offsetHeight || 120;
    const blocks = ['.c-warn', '.rchat', '.c-party', '.c-portrait', '.c-vitals', '.c-boss', '.c-map', '.c-skills', '.c-auto']
      .map((sel) => root.querySelector(sel)?.getBoundingClientRect())
      .filter((o) => o && o.width > 4 && o.height > 4);
    const hits = (o, box) => box.left < o.right - 1 && box.right > o.left + 1 && box.top < o.bottom - 1 && box.bottom > o.top + 1;
    const warn = root.querySelector('.c-warn')?.getBoundingClientRect();
    const aboveWarn = warn && warn.height > 4 ? warn.top - h - 12 : r.top - h - 14;
    const spots = [
      { x: r.left + r.width / 2 - w / 2, y: aboveWarn },
      { x: r.left - w - 14, y: Math.min(r.top, aboveWarn) },
      { x: r.right + 14, y: Math.min(r.top, aboveWarn) },
      { x: r.left + r.width / 2 - w / 2, y: 640 },
    ];
    let placed = null;
    for (const spot of spots) {
      const x = Math.max(12, Math.min(window.innerWidth - w - 12, spot.x));
      const y = Math.max(12, Math.min(window.innerHeight - h - 12, spot.y));
      const box = { left: x, top: y, right: x + w, bottom: y + h };
      if (!blocks.some((o) => hits(o, box))) {
        placed = { x, y };
        break;
      }
    }
    if (!placed) {
      const y = Math.max(12, aboveWarn);
      placed = {
        x: Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)),
        y: Math.max(12, Math.min(window.innerHeight - h - 12, y)),
      };
    }
    tip.style.left = `${placed.x}px`;
    tip.style.top = `${placed.y}px`;
  }
  function fillTip(anchor) {
    const skillId = anchor.getAttribute('data-skill');
    const auraId = anchor.getAttribute('data-aura');
    let html = '';
    if (skillId) {
      const owned = active.skills.find((s) => s.id === skillId) || getClass('warrior').skills.find((s) => s.id === skillId) || getClass('assassin').skills.find((s) => s.id === skillId) || getClass('priest').skills.find((s) => s.id === skillId);
      if (owned && !owned.locked) html = tipHtmlSkill(owned, skillId === 'heal' ? getClass('priest') : skillId === 'daggers' ? getClass('assassin') : active);
    } else if (auraId) {
      const remain = anchor.getAttribute('data-remain') || anchor.parentElement?.querySelector('span')?.textContent || '';
      html = tipHtmlAura(auraId, remain);
    }
    if (!html) return false;
    tip.innerHTML = html;
    tip.hidden = false;
    placeTip(anchor);
    return true;
  }
  function hideTip() {
    tip.hidden = true;
    root.classList.remove('is-tip');
    window.clearTimeout(tipTimer);
  }
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  root.addEventListener('pointerover', (e) => {
    if (coarse) return;
    const anchor = e.target.closest?.('[data-skill], [data-aura]');
    if (!anchor || !root.contains(anchor)) return;
    fillTip(anchor);
  });
  root.addEventListener('pointerout', (e) => {
    const anchor = e.target.closest?.('[data-skill], [data-aura]');
    if (!anchor) return;
    if (anchor.contains(e.relatedTarget)) return;
    hideTip();
  });
  root.addEventListener('pointerdown', (e) => {
    const anchor = e.target.closest?.('.c-slot, [data-aura]');
    if (!anchor) return;
    window.clearTimeout(tipTimer);
    tipTimer = window.setTimeout(() => {
      if (fillTip(anchor)) anchor.dataset.tipHold = '1';
    }, 350);
  });
  root.addEventListener('pointerup', () => window.clearTimeout(tipTimer));
  root.addEventListener('pointercancel', () => { window.clearTimeout(tipTimer); hideTip(); });
  const grid = root.querySelector('[data-pick-grid]');
  grid.innerHTML = CLASS_IDS.map((id) => {
    const c = getClass(id);
    return `<button type="button" class="class-card" data-class="${id}"><b>${c.name}</b><small>${c.role} · ${c.resLabel}</small><span>${c.blurb}</span></button>`;
  }).join('');

  const map = root.querySelector('[data-map]');
  const ctx = map.getContext('2d');
  let mapMode = 'live';
  const floats = [];
  let bannerT = 0;

  function setWidth(el, pct) {
    if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function drawMap(snap) {
    root.querySelectorAll('[data-map]').forEach((canvas) => paintMap(canvas, snap));
  }
  function paintMap(mapCanvas, snap) {
    const ctx = mapCanvas.getContext('2d');
    const w = mapCanvas.width;
    const h = mapCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0e121e';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.55);
    ctx.fillStyle = '#243e60';
    ctx.fillRect(-w, -10, w * 2, 22);
    ctx.fillStyle = '#c8c4bc';
    ctx.fillRect(-w, -7, w * 2, 14);
    ctx.rotate(0.55);
    ctx.fillStyle = '#2c3040';
    for (let i = 0; i < 5; i++) ctx.fillRect(-58 + i * 22, -50 + (i % 2) * 10, 12, 16);
    if (mapMode === 'show') {
      const dots = ['#FF7A1A', '#8C7FFF', '#FFC845', '#3DDC84', '#E5383B'];
      dots.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(-16 + i * 7, 2 + i * 2, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = '#ff463c';
      ctx.beginPath();
      ctx.arc(28, 14, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-22, -10);
      ctx.lineTo(-30, 2);
      ctx.lineTo(-14, 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.strokeStyle = 'rgba(214,176,98,.85)';
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2 - Math.PI / 2;
        const r0 = w / 2 - 2;
        const r1 = w / 2 - (k % 6 === 0 ? 8 : 5);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    const span = ALONG_MAX - ALONG_MIN;
    const project = (along, across) => {
      const y = ((ALONG_MAX - along) / span) * 116 - 58;
      const x = across * 4.2;
      return [x, y];
    };
    const [sx, sy] = project(SAFE_ALONG, 0);
    ctx.strokeStyle = '#ffe14a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 8, 0, Math.PI * 2);
    ctx.stroke();
    const pf = toFrame(snap.x, snap.z);
    const [px, py] = project(pf.along, pf.across);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(px, py - 7);
    ctx.lineTo(px + 5, py + 5);
    ctx.lineTo(px - 5, py + 5);
    ctx.fill();
    if (!snap.bossDead) {
      const [bx, by] = project(BOSS_ALONG, 0);
      ctx.fillStyle = '#ff463c';
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const HUD_OCCLUDERS = '.c-boss, .c-party, .rchat, .c-vitals, .c-portrait, .c-skills, .c-map, .c-auto, .c-warn';
  function coversHud(x, y, w, h) {
    const nodes = root.querySelectorAll(HUD_OCCLUDERS);
    for (const el of nodes) {
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const pad = el.matches('.c-skills, .c-vitals, .c-portrait, .c-auto, .c-warn, .rchat') ? 72 : 18;
      if (x < r.right + pad && x + w > r.left - pad && y < r.bottom + pad && y + h > r.top - pad) return true;
    }
    const chat = document.querySelector('.rchat');
    if (chat) {
      const r = chat.getBoundingClientRect();
      const pad = 72;
      if (r.width > 8 && r.height > 8 && x < r.right + pad && x + w > r.left - pad && y < r.bottom + pad && y + h > r.top - pad) return true;
    }
    return false;
  }

  function tickFloats(dt, camera) {
    const vv = window.visualViewport;
    const w = vv?.width || innerWidth;
    const h = vv?.height || innerHeight;
    const placed = [];
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      f.y -= dt * 28;
      if (f.life <= 0) {
        f.el.remove();
        floats.splice(i, 1);
        continue;
      }
      const v = f.pos.clone().project(camera);
      let x = (v.x * 0.5 + 0.5) * w + (f.x || 0) + (f.ox || 0);
      let y = (-v.y * 0.5 + 0.5) * h + f.y + (f.oy || 0);
      const mine = f.kind === 'crit' ? { w: 168, h: 72 } : { w: 64, h: 30 };
      for (const p of placed) {
        if (Math.abs(x - p.x) < (mine.w + p.w) / 2 && Math.abs(y - p.y) < (mine.h + p.h) / 2) {
          f.oy = (f.oy || 0) - 34;
          y -= 34;
        }
      }
      if (coversHud(x - mine.w / 2, y - mine.h / 2, mine.w, mine.h)) {
        f.el.style.visibility = 'hidden';
        continue;
      }
      f.el.style.visibility = 'visible';
      placed.push({ x, y, w: mine.w, h: mine.h });
      f.el.style.left = `${x}px`;
      f.el.style.top = `${y}px`;
      f.el.style.opacity = String(Math.max(0, f.life / 0.35));
      let scale = 1;
      if (f.kind === 'crit') {
        const u = Math.min(1, (1.15 - f.life) / 0.28);
        scale = 1.05 + Math.sin(u * Math.PI) * 0.45;
      }
      f.el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }

  const hud = {
    root,
    onSkill: null,
    onPeace: null,
    onWorld: null,
    onRedeploy: null,
    onMute: null,
    onVolume: null,
    onPick: null,
    onRepick: null,
    onDeploy: null,
    cutsceneOpen: () => cutscene,
    bind() {
      root.querySelector('[data-peace]').addEventListener('click', () => this.onPeace?.());
      root.querySelector('[data-redeploy]').addEventListener('click', () => this.onRedeploy?.());
      root.querySelector('[data-auto]').addEventListener('click', () => this.onAuto?.());
      root.querySelector('[data-mute]').addEventListener('click', () => this.onMute?.());
      const pushVol = () => this.onVolume?.({
        bgm: Number(root.querySelector('[data-vol-bgm]').value),
        sfx: Number(root.querySelector('[data-vol-sfx]').value),
      });
      root.querySelector('[data-vol-bgm]').addEventListener('input', pushVol);
      root.querySelector('[data-vol-sfx]').addEventListener('input', pushVol);
      root.querySelector('[data-repick]').addEventListener('click', () => this.onRepick?.());
      root.querySelector('[data-pick-go]').addEventListener('click', () => this.onPick?.(picked));
      root.querySelector('[data-deploy]').addEventListener('click', () => this.onDeploy?.());
      root.querySelector('[data-open-pick]').addEventListener('click', () => this.showPick());
      root.querySelector('[data-vn]').addEventListener('click', (e) => {
        if (e.target.closest('[data-vn-skip]')) return;
        this.advanceCutscene();
      });
      root.querySelector('[data-vn-skip]').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeCutscene();
      });
      grid.querySelectorAll('[data-class]').forEach((btn) => {
        btn.addEventListener('click', () => {
          picked = btn.getAttribute('data-class');
          grid.querySelectorAll('.class-card').forEach((el) => el.classList.toggle('is-on', el === btn));
        });
      });
    },
    setPortrait(url) {
      const portrait = root.querySelector('[data-portrait]');
      if (!portrait || !url) return;
      this.playerPortrait = url;
      portrait.dataset.lock = '1';
      portrait.src = url;
      const row = root.querySelector('.c-mate[data-mate="me"]');
      if (!row) return;
      let face = row.querySelector('.me-face');
      if (!face) {
        face = document.createElement('img');
        face.className = 'me-face';
        face.alt = '';
        row.querySelector('.gem')?.remove();
        row.prepend(face);
      }
      face.src = url;
    },
    setClass(id) {
      active = getClass(id);
      picked = active.id;
      root.style.setProperty('--accent', active.seam);
      const label = root.querySelector('[data-res-label]');
      if (label) label.textContent = active.resLabel;
      const roleEl = root.querySelector('[data-my-role]');
      if (roleEl && !this.caption) roleEl.textContent = active.name;
      const fill = root.querySelector('[data-rage-fill]');
      if (fill) fill.parentElement.dataset.res = active.resBar === 'mp' ? 'mana' : active.resBar;
      const portrait = root.querySelector('[data-portrait]');
      if (portrait && portrait.dataset.klass && portrait.dataset.klass !== id) portrait.dataset.klass = id;
      const nameEl = root.querySelector('[data-player-name]');
      if (nameEl && !this.caption) nameEl.textContent = '도훈';
      paintSkills(active.skills);
      grid.querySelectorAll('.class-card').forEach((el) => el.classList.toggle('is-on', el.getAttribute('data-class') === active.id));
    },
    showPick() {
      root.classList.add('is-pick');
      root.querySelector('[data-pick]').hidden = false;
      grid.querySelectorAll('.class-card').forEach((el) => el.classList.toggle('is-on', el.getAttribute('data-class') === picked));
    },
    hidePick() {
      root.classList.remove('is-pick');
      root.querySelector('[data-pick]').hidden = true;
    },
    clearPeace() {
      root.classList.remove('is-peace');
    },
    setMode(mode) {
      root.classList.remove('is-calm', 'is-alert', 'is-fight');
      if (mode === 'calm') root.classList.add('is-calm');
      else if (mode === 'alert') root.classList.add('is-alert');
      else if (mode === 'fight' || mode === 'intro' || mode === 'victory') root.classList.add('is-fight');
    },
    paintVn() {
      const line = VN_LINES[Math.min(vnIndex, VN_LINES.length - 1)];
      root.querySelector('[data-vn-name]').textContent = line.name;
      root.querySelector('[data-vn-text]').textContent = line.text;
      root.querySelector('[data-vn-who]').textContent = line.name.slice(0, 1);
    },
    openCutscene() {
      cutscene = true;
      vnIndex = 0;
      root.classList.add('is-cutscene');
      root.querySelector('[data-vn]').hidden = false;
      this.paintVn();
    },
    advanceCutscene() {
      if (!cutscene) return;
      vnIndex += 1;
      if (vnIndex >= VN_LINES.length) this.closeCutscene();
      else this.paintVn();
    },
    closeCutscene() {
      if (!cutscene) return;
      cutscene = false;
      root.classList.remove('is-cutscene');
      root.querySelector('[data-vn]').hidden = true;
      this.onIntroDone?.();
    },
    syncAlert(view) {
      const box = root.querySelector('[data-alert]');
      const away = root.querySelector('[data-away]');
      if (!view.show) {
        box.hidden = true;
        root.querySelector('[data-alert-line]').hidden = true;
        if (!view.away) away.hidden = true;
        return;
      }
      if (!view.inRegion) {
        box.hidden = true;
        away.hidden = false;
        return;
      }
      away.hidden = true;
      box.hidden = !!view.covered;
      const line = root.querySelector('[data-alert-line]');
      line.hidden = !!view.covered || !view.line;
      line.textContent = view.line || '';
      const sec = Math.max(0, Math.ceil(view.remaining || 0));
      root.querySelector('[data-alert-count]').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      root.querySelector('[data-alert-title]').textContent = sec > 0 ? '하늘이 갈라집니다' : '보스가 살아 있는 동안 합류할 수 있습니다';
    },
    setParty(frames) {
      const rows = frames.slice(0, 5);
      party.innerHTML = `<header><b>파티</b><span>${rows.length}/5</span><button type="button" class="m-fold" aria-label="파티 접기">▾</button></header>` + rows.map((m) => {
        const dead = !!(m.down || (m.hp ?? 1) <= 0);
        const gem = dead ? '#5a5c64' : (m.gem || GEM[m.role] || '#8C7FFF');
        const hp = dead ? 0 : Math.round((m.hp ?? 1) * 100);
        const mine = m.isMe && this.playerPortrait
          ? `<img class="me-face" src="${this.playerPortrait}" alt="" />`
          : `<i class="gem" style="--gem:${gem}"></i>`;
        return `
        <div class="c-mate${dead ? ' is-dead' : ''}${m.aggro ? ' is-aggro' : ''}" data-mate="${m.id}" data-gem="${GEM[m.role] || '#8C7FFF'}">
          ${mine}
          <b>${m.name}</b>
          <span class="role" style="color:${gem}">${m.role}</span>
          <em data-pct>${dead ? '부활 대기' : `${hp}%`}</em>
          <div class="hp"><span data-hp style="width:${hp}%"></span></div>
          <div class="rs" style="--res:${gem}"><span data-sub style="width:${dead ? 0 : Math.round((m.sub ?? 0.5) * 100)}%"></span></div>
        </div>`;
      }).join('');
      const fold = party.querySelector('.m-fold');
      fold?.addEventListener('click', () => {
        party.classList.toggle('is-folded');
        fold.textContent = party.classList.contains('is-folded') ? '▸' : '▾';
      });
    },
    useMobileLayout() {
      if (root.querySelector('.m-shell')) return;
      root.classList.add('is-handheld');
      const stage = root.querySelector('.c-stage');
      const shell = document.createElement('div');
      shell.className = 'm-shell';
      shell.innerHTML = `
        <div class="m-player"></div>
        <aside class="m-side" data-tab="gate">
          <div class="m-tabs">
            <button type="button" data-tab="gate">관문</button>
            <button type="button" data-tab="party">파티</button>
          </div>
          <div class="m-side-body">
            <button type="button" class="m-side-fold" aria-label="패널 접기">‹</button>
            <div data-pane="gate"></div>
            <div data-pane="party" hidden></div>
          </div>
        </aside>
        <div class="m-boss"></div>
        <div class="m-corner">
          <div class="m-region">탄천교</div>
          <div class="m-menu"></div>
        </div>
        <div class="m-autofight">자동 전투</div>
        <div class="m-skills"></div>
      `;
      const side = shell.querySelector('.m-side');
      const showTab = (id) => {
        side.dataset.tab = id;
        side.querySelectorAll('[data-pane]').forEach((pane) => {
          pane.hidden = pane.dataset.pane !== id;
        });
        side.querySelectorAll('.m-tabs button').forEach((btn) => {
          btn.classList.toggle('is-on', btn.dataset.tab === id);
        });
      };
      side.querySelectorAll('.m-tabs button').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (side.classList.contains('is-folded') || side.dataset.tab !== btn.dataset.tab) {
            side.classList.remove('is-folded');
            showTab(btn.dataset.tab);
          } else side.classList.add('is-folded');
        });
      });
      side.querySelector('.m-side-fold').addEventListener('click', () => side.classList.add('is-folded'));
      showTab('gate');
      side.classList.add('is-folded');
      const quest = root.querySelector('.quest');
      const heading = quest.querySelector('h3');
      if (heading) heading.textContent = '현재 관문';
      const reward = document.createElement('div');
      reward.className = 'm-reward';
      reward.innerHTML = `<span class="m-sec">보상</span>
        <div class="m-rslots">
          <img src="/dungeon/hud/round/debuff_rift.webp" alt="" />
          <img src="/dungeon/hud/round/hud_star.webp" alt="" />
          <img src="/dungeon/hud/round/buff_shield.webp" alt="" />
        </div>
        <em>균열 봉인</em>`;
      quest.append(reward);
      shell.querySelector('[data-pane="gate"]').append(quest);
      shell.querySelector('[data-pane="party"]').append(stage.querySelector('.c-party'));
      const boss = stage.querySelector('.c-boss');
      const clock = stage.querySelector('[data-clock]');
      const bossTop = boss.querySelector('.c-boss-top');
      const capsule = document.createElement('div');
      capsule.className = 'm-boss-cap';
      capsule.append(bossTop.querySelector('.c-pips'), clock);
      bossTop.append(capsule);
      shell.querySelector('.m-boss').append(boss, stage.querySelector('.c-warn'), root.querySelector('.banner'));
      const player = shell.querySelector('.m-player');
      const vitals = stage.querySelector('.c-vitals');
      vitals.querySelectorAll('.c-buffs img').forEach((img) => {
        const wrap = document.createElement('span');
        wrap.className = 'm-buff';
        const ico = document.createElement('span');
        ico.className = 'm-buffico';
        const time = document.createElement('i');
        time.className = 'm-bufftime';
        time.textContent = `${img.dataset.remain || 8}s`;
        img.replaceWith(wrap);
        ico.append(img);
        wrap.append(ico, time);
      });
      const power = document.createElement('div');
      power.className = 'm-power';
      power.innerHTML = '<span>전투력</span><b>24,860</b>';
      vitals.querySelector('.c-vname').after(power);
      player.append(stage.querySelector('.c-portrait'), vitals);
      shell.querySelector('.m-corner').prepend(stage.querySelector('.c-map'));
      const auto = stage.querySelector('.c-auto');
      auto.innerHTML = '<img src="/dungeon/hud/round/auto.webp" alt="" />';
      auto.setAttribute('aria-label', '자동');
      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'm-icon';
      info.innerHTML = '<img src="/dungeon/hud/round/info.webp" alt="" />';
      info.setAttribute('aria-label', '정보');
      info.addEventListener('click', () => {
        side.classList.remove('is-folded');
        showTab('gate');
      });
      const gear = document.createElement('button');
      gear.type = 'button';
      gear.className = 'm-icon';
      gear.innerHTML = '<img src="/dungeon/hud/round/settings.webp" alt="" />';
      gear.setAttribute('aria-label', '설정');
      gear.addEventListener('click', () => hud.onMute?.());
      const exit = document.createElement('button');
      exit.type = 'button';
      exit.className = 'm-icon m-exit';
      exit.innerHTML = '<img src="/dungeon/hud/round/exit.webp" alt="" />';
      exit.addEventListener('click', () => hud.onWorld?.());
      const menuFold = document.createElement('button');
      menuFold.type = 'button';
      menuFold.className = 'm-menu-fold';
      menuFold.innerHTML = '<img src="/dungeon/hud/round/menu.webp" alt="" />';
      menuFold.setAttribute('aria-label', '메뉴');
      const menu = shell.querySelector('.m-menu');
      const pack = (btn, label) => {
        const wrap = document.createElement('div');
        wrap.className = 'm-util';
        const cap = document.createElement('span');
        cap.textContent = label;
        wrap.append(btn, cap);
        return wrap;
      };
      menu.append(pack(auto, '자동'), pack(info, '정보'), pack(gear, '설정'), pack(exit, '나가기'));
      if (window.innerHeight > window.innerWidth) {
        menu.classList.add('is-folded');
        menu.append(menuFold);
        menuFold.addEventListener('click', () => menu.classList.toggle('is-folded'));
      }
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'm-more';
      more.textContent = '2';
      more.setAttribute('aria-label', '다른 기술');
      more.addEventListener('click', () => {
        wheelPage = wheelPage ? 0 : 1;
        layoutWheel();
      });
      const skills = shell.querySelector('.m-skills');
      skills.append(skillsEl, more);
      const chat = root.querySelector('.rchat');
      if (chat) {
        chat.classList.add('is-ghost');
        chat.classList.remove('is-collapsed');
        const body = chat.querySelector('.rchat-body');
        if (body) body.hidden = false;
        const chip = chat.querySelector('[data-chip]');
        if (chip) chip.hidden = true;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'm-chat-toggle';
        toggle.innerHTML = '<img src="/dungeon/hud/round/chat.webp" alt="" />';
        toggle.setAttribute('aria-label', '채팅');
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          chat.classList.toggle('is-open');
        });
        chat.prepend(toggle);
        const pill = shell.querySelector('.m-autofight');
        const log = chat.querySelector('.rchat-log');
        if (pill && log) log.before(pill);
        shell.append(chat);
      }
      root.append(shell);
      paintSkills(active.skills);
    },
    setMuted(muted) {
      root.querySelector('[data-mute]').textContent = muted ? '소리 꺼짐' : '소리 켜짐';
    },
    flash(amount) {
      const el = root.querySelector('[data-flash]');
      el.style.opacity = String(amount);
      el.style.background = `radial-gradient(circle at 50% 55%, rgba(190,230,255,${amount}), rgba(80,140,255,0))`;
    },
    banner(text, sec = 2.2) {
      const el = root.querySelector('[data-banner]');
      el.hidden = false;
      el.textContent = text;
      bannerT = sec;
    },
    coversHud,
    float(pos, text, kind) {
      const numeric = typeof text === 'number' || /^-?\d+$/.test(String(text));
      const amount = numeric ? Number(text) : 0;
      const key = `${Math.round(pos.x / 1.5)}:${Math.round(pos.z / 1.5)}:${kind === 'heal' ? 'heal' : 'hit'}`;
      const now = performance.now();
      if (numeric) {
        const prev = floats.find((f) => f.key === key && now - f.born < 140 && f.life > 0.35);
        if (prev) {
          prev.total += amount;
          prev.born = now;
          prev.life = Math.max(prev.life, prev.kind === 'crit' ? 0.95 : 0.75);
          if (kind === 'crit') prev.kind = 'crit';
          prev.el.className = `float ${prev.kind}`;
          prev.el.innerHTML = prev.kind === 'crit' ? `${prev.total}<small>CRITICAL</small>` : String(prev.total);
          return;
        }
      }
      while (floats.length >= 12) {
        const old = floats.shift();
        old?.el.remove();
      }
      const siblings = floats.filter((f) => f.key === key).length;
      const el = document.createElement('div');
      const shown = kind || 'dmg';
      el.className = `float ${shown}`;
      if (shown === 'crit') el.innerHTML = `${text}<small>CRITICAL</small>`;
      else el.textContent = String(text);
      root.querySelector('[data-floats]').appendChild(el);
      floats.push({
        el,
        pos: pos.clone(),
        life: shown === 'crit' ? 1.15 : 0.9,
        y: -siblings * 34,
        x: (Math.random() - 0.5) * 72,
        kind: shown,
        key,
        total: amount,
        born: now,
      });
    },
    showResult(kind = 'victory') {
      const card = root.querySelector('[data-victory]');
      card.classList.add('show');
      card.dataset.kind = kind;
      root.classList.add('is-result');
      const win = kind !== 'defeat';
      root.querySelector('[data-result-kicker]').textContent = win ? '클리어' : '패배';
      root.querySelector('[data-result-title]').textContent = win ? '균열 봉인 완료' : '파티가 전멸했습니다';
      root.querySelector('[data-result-sub]').textContent = win
        ? '탄천교에 다시 평화가 찾아왔습니다'
        : '다시 출동하면 같은 직업으로 돌아옵니다';
      root.querySelector('[data-result-xp]').hidden = !win;
      root.querySelector('[data-result-drops]').hidden = !win;
      root.querySelector('[data-result-titlechip]').hidden = !win;
    },
    showVictory() { this.showResult('victory'); },
    showDefeat() { this.showResult('defeat'); },
    hideVictory() {
      root.querySelector('[data-victory]').classList.remove('show');
      root.classList.remove('is-result');
    },
    setAuto(on) {
      const btn = root.querySelector('[data-auto]');
      root.classList.toggle('is-auto', !!on);
      if (!btn) return;
      btn.classList.toggle('is-on', !!on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (root.classList.contains('is-handheld')) btn.innerHTML = '<img src="/dungeon/hud/round/auto.webp" alt="" />';
    },
    setPeace() {
      root.classList.add('is-peace');
      this.hideVictory();
    },
    caption: null,
    update(dt, camera, snap) {
      const cap = this.caption;
      const pct = cap ? cap.bossFill : snap.bossHp / snap.bossMax;
      setWidth(root.querySelector('[data-boss-fill]'), pct * 100);
      setWidth(root.querySelector('[data-boss-ghost]'), Math.min(100, pct * 100 + (cap ? 6 : 4)));
      root.querySelector('[data-boss-pct]').textContent = cap ? cap.bossPct : `${Math.ceil(pct * 100)}%`;
      root.querySelector('[data-boss-num]').textContent = cap
        ? cap.bossNum
        : `${Math.ceil(snap.bossHp).toLocaleString('ko-KR')} / ${snap.bossMax.toLocaleString('ko-KR')}`;
      const stage = snap.bossDead ? 3 : pct <= 0.25 ? 3 : pct <= 0.6 ? 2 : 1;
      const sub = root.querySelector('[data-boss-sub]');
      if (sub && !cap) sub.textContent = `${stage}장 · 탄천 보스`;
      root.querySelectorAll('[data-boss-pips] b').forEach((pip, i) => pip.classList.toggle('on', i < (cap ? 2 : stage)));
      const castPct = cap ? cap.castPct : (snap.castMax > 0 ? (snap.cast / snap.castMax) * 100 : 0);
      setWidth(root.querySelector('[data-cast-fill]'), castPct);
      const castLeft = snap.castMax > 0 ? Math.max(0, snap.castMax - snap.cast) : 0;
      root.querySelector('[data-cast-name]').textContent = cap ? cap.cast : (snap.castName || '');
      root.querySelector('[data-cast-time]').textContent = cap ? cap.castTime : (snap.castMax > 0 ? castLeft.toFixed(1) : '');
      const warn = root.querySelector('[data-warn]');
      if (snap.down > 0) {
        warn.hidden = true;
      } else if (cap?.warn || snap.castName) {
        warn.hidden = false;
        root.querySelector('[data-warn-name]').textContent = cap?.warn || `${snap.castName} · 머리 앞 60°에서 벗어나기`;
        root.querySelector('[data-warn-time]').textContent = cap?.warnTime || castLeft.toFixed(1);
      } else warn.hidden = true;
      const hpPct = cap ? cap.playerPct : (snap.hp / snap.hpMax) * 100;
      setWidth(root.querySelector('[data-player-fill]'), hpPct);
      setWidth(root.querySelector('[data-player-ghost]'), Math.min(100, hpPct + 8));
      root.querySelector('[data-player-num]').textContent = cap ? cap.playerNum : `${Math.ceil(snap.hp).toLocaleString('ko-KR')} / ${snap.hpMax.toLocaleString('ko-KR')}`;
      const dealt = root.querySelector('[data-dealt]');
      if (dealt) dealt.textContent = Math.round(snap.dealt || 0).toLocaleString('ko-KR');
      const healed = root.querySelector('[data-healed]');
      if (healed) healed.textContent = Math.round(snap.healed || 0).toLocaleString('ko-KR');
      const stageEl = root.querySelector('[data-stage]');
      if (stageEl) stageEl.textContent = snap.bossDead ? '토벌 완료' : (cap ? '레이드 진행 중 · 2단계' : `레이드 진행 중 · ${stage}단계`);
      const clock = root.querySelector('[data-clock]');
      if (clock) {
        const elapsed = cap ? cap.elapsed : Math.max(0, 600 - (snap.timeLeft || 0));
        const sec = Math.floor(elapsed);
        clock.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      }
      const lv = root.querySelector('[data-level]');
      if (lv) lv.textContent = cap ? cap.level : String(snap.level || 1);
      if (cap) {
        const nameEl = root.querySelector('[data-player-name]');
        if (nameEl) nameEl.textContent = cap.name;
        const roleEl = root.querySelector('[data-my-role]');
        if (roleEl) roleEl.textContent = cap.role;
      }
      root.querySelector('[data-kills]').textContent = snap.kills;
      const t = Math.max(0, Math.ceil(snap.timeLeft));
      root.querySelector('[data-time]').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      const resMax = snap.resMax || 100;
      const resPct = cap ? cap.resPct : (snap.res / resMax) * 100;
      setWidth(root.querySelector('[data-rage-fill]'), resPct);
      const resRead = root.querySelector('[data-res-read]');
      if (resRead) resRead.textContent = cap ? cap.resRead : `${active.resLabel} ${Math.round(snap.res)}`;
      const pips = root.querySelector('[data-pips]');
      if (pips && resMax <= 6) {
        pips.hidden = false;
        const key = `${snap.res}/${resMax}`;
        if (pips.dataset.n !== key) {
          pips.dataset.n = key;
          pips.innerHTML = Array.from({ length: resMax }, (_, i) => `<i class="${i < snap.res ? 'on' : ''}"></i>`).join('');
        }
      } else if (pips) pips.hidden = true;

      if (!cap) {
        for (const row of snap.party || []) {
          const el = root.querySelector(`[data-mate="${row.id}"]`);
          if (!el) continue;
          const dead = !!(row.down || row.hp <= 0);
          el.classList.toggle('is-dead', dead);
          const gem = el.querySelector('.gem');
          if (gem) gem.style.setProperty('--gem', dead ? '#5a5c64' : (el.dataset.gem || '#8C7FFF'));
          setWidth(el.querySelector('[data-hp]'), dead ? 0 : row.hp * 100);
          const sub = el.querySelector('[data-sub]');
          if (sub) setWidth(sub, dead ? 0 : (row.sub ?? 0) * 100);
          const pctEl = el.querySelector('[data-pct]');
          if (pctEl) pctEl.textContent = dead ? '부활 대기' : `${Math.round(row.hp * 100)}%`;
        }
      }
      if (cap?.slots) {
        if (skillsEl.dataset.mode !== 'live' || skillsEl.dataset.klass !== active.id) paintSkills(active.skills);
        const slots = skillsEl.querySelectorAll('.c-slot');
        const look = [
          ['', '', 0],
          ['is-cd', '8', 0.62],
          ['is-hot', '', 0],
          ['is-proc', '', 0],
          ['is-cd', '45', 0.82],
        ];
        slots.forEach((btn, i) => {
          btn.classList.remove('is-gcd', 'is-cd', 'is-nores', 'is-proc');
          const row = look[i];
          if (!row) return;
          if (row[0]) btn.classList.add(row[0]);
          btn.querySelector('.cd').textContent = row[1];
          btn.querySelector('.sweep').style.setProperty('--p', String(row[2]));
        });
      } else {
        active.skills.forEach((s, i) => {
          const btn = root.querySelector(`[data-skill="${s.id}"]`);
          if (!btn) return;
          const cd = snap.cds[i] || 0;
          const own = s.cd > 0 ? cd / s.cd : 0;
          btn.querySelector('.sweep').style.setProperty('--p', String(own));
          const gcdEl = btn.querySelector('.gcd');
          if (gcdEl) gcdEl.style.setProperty('--g', String(Math.min(1, (snap.gcd || 0) / 1.2)));
          btn.querySelector('.cd').textContent = cd > 0.05 ? (cd >= 10 ? Math.ceil(cd) : cd.toFixed(1)) : '';
          btn.classList.toggle('is-cd', cd > 0.05);
          btn.classList.toggle('is-nores', !s.locked && s.cost > 0 && snap.res < s.cost);
        });
      }
      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0) root.querySelector('[data-banner]').hidden = true;
      }
      if (snap.down > 0) {
        root.querySelector('[data-banner]').hidden = false;
        root.querySelector('[data-banner]').textContent = `쓰러졌습니다. 노란 선에서 ${Math.ceil(snap.down)}초 뒤에 일어납니다`;
        bannerT = 0.2;
      }
      mapMode = cap ? 'show' : 'live';
      drawMap(snap);
      tickFloats(dt, camera);
    },
  };
  return hud;
}
