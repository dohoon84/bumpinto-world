import './hud.css';
import { CLASS_IDS, getClass } from './classes.js';
import { toFrame, ALONG_MIN, ALONG_MAX, SAFE_ALONG, SAFE_R, BOSS_ALONG } from './layout.js';

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
    <div class="flash" data-flash></div>
    <section class="party panel" data-party></section>
    <div class="minimap-wrap">
      <canvas class="minimap" width="168" height="168" data-map></canvas>
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
    <div class="dock">
      <div class="skills" data-skills></div>
      <div class="cluster panel">
        <div class="boss-row">
          <div class="medallion">홀</div>
          <div><span class="boss-name">홀드</span><span class="boss-grade">C · 지역</span></div>
          <div class="boss-num" data-boss-num>100%</div>
        </div>
        <div class="bar hp"><span data-boss-fill></span></div>
        <div class="bar cast"><span data-cast-fill></span></div>
        <div class="cast-label"><span data-cast-name></span><span data-cast-time></span></div>
        <div class="label"><span>생명</span><span data-player-num>100 / 100</span></div>
        <div class="bar thin hp"><span data-player-fill></span></div>
        <div class="label"><span data-res-label>분노</span><span data-rage>0 / 100</span></div>
        <div class="bar thin rage"><span data-rage-fill></span></div>
      </div>
      <div class="help">WASD 이동 · 휠 줌 · Space 회피 · 1–4 스킬 · 글로벌 쿨 1.2초</div>
    </div>
    <div class="warn" data-warn hidden>
      <strong data-warn-name></strong>
      <em data-warn-time></em>
    </div>
    <aside class="meter panel">
      <div>피해 <b data-dealt>0</b></div>
      <div>치유 <b data-healed>0</b></div>
    </aside>
    <div class="floats" data-floats></div>
    <div class="banner panel" data-banner hidden></div>
    <div class="card-wrap" data-victory>
      <div class="card panel">
        <div class="kicker">클리어</div>
        <h2>균열이 걷혔습니다</h2>
        <div class="xp">경험치 <b>+1,240</b> · Lv.1 → Lv.2</div>
        <div class="bar hp"><span style="width:100%;background:linear-gradient(90deg,#e6c36a,#fff1b8)"></span></div>
        <div class="drops">
          <div class="drop r-rare"><span>안개 우산</span><i>희귀</i></div>
          <div class="drop r-common"><span>합수 자전거 벨</span><i>일반</i></div>
          <div class="drop r-key"><span>보딩패스 조각 STB-???</span><i>키</i></div>
        </div>
        <div class="title-chip">칭호 『첫 출동』</div>
        <button type="button" class="primary" data-peace>평온한 탄천으로</button>
        <button type="button" class="ghost" data-world>오픈 월드에서 합수부 보기</button>
      </div>
    </div>
    <div class="peace-note panel">탄천이 다시 고요합니다 · 칭호 『첫 출동』
      <button type="button" data-repick>다른 이력으로 다시 출동</button>
    </div>
    <div class="pick" data-pick hidden>
      <div class="pick-card panel">
        <p class="kicker">전생의 이력</p>
        <h2>어느 손을 먼저 읽으시겠습니까</h2>
        <p class="pick-note">던전에 들어간 뒤에는 바꿀 수 없습니다. 평온한 탄천으로 나온 뒤에 다시 고릅니다.</p>
        <div class="pick-grid" data-pick-grid></div>
        <button type="button" class="primary" data-pick-go>이 이력으로 출동</button>
      </div>
    </div>
    <button type="button" class="mute" data-mute>소리 켜짐</button>
  `;
  document.body.appendChild(root);

  const party = root.querySelector('[data-party]');

  const skillsEl = root.querySelector('[data-skills]');
  let active = getClass('warrior');
  let picked = 'warrior';
  function paintSkills(list) {
    skillsEl.innerHTML = list.map((s) => `
      <button type="button" class="skill${s.locked ? ' locked' : ''}" data-skill="${s.id}" ${s.locked ? 'disabled' : ''}>
        <div class="ico">${ICONS[s.id] || ICONS.lock}</div>
        <div class="sweep" style="--p:0"></div>
        <span class="key">${s.key}</span>
        <span class="cd"></span>
      </button>
    `).join('');
    skillsEl.querySelectorAll('[data-skill]').forEach((btn) => {
      btn.addEventListener('click', () => hud.onSkill?.(btn.getAttribute('data-skill')));
    });
  }
  paintSkills(active.skills);
  const grid = root.querySelector('[data-pick-grid]');
  grid.innerHTML = CLASS_IDS.map((id) => {
    const c = getClass(id);
    return `<button type="button" class="class-card" data-class="${id}"><b>${c.name}</b><small>${c.role} · ${c.resLabel}</small><span>${c.blurb}</span></button>`;
  }).join('');

  const map = root.querySelector('[data-map]');
  const ctx = map.getContext('2d');
  const floats = [];
  let bannerT = 0;

  function setWidth(el, pct) {
    if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function drawMap(snap) {
    const w = map.width;
    const h = map.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.strokeStyle = '#16343a';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 62);
    ctx.lineTo(0, -62);
    ctx.stroke();
    ctx.strokeStyle = '#3ecfc6';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = '#e15cff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-34, 28);
    ctx.quadraticCurveTo(-16, 8, 0, -8);
    ctx.stroke();
    ctx.fillStyle = '#0b1218';
    for (const y of [48, 16, -16, -48]) {
      ctx.beginPath();
      ctx.arc(0, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e6c36a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
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
    ctx.fillStyle = '#7ef0e4';
    ctx.beginPath();
    ctx.moveTo(px, py - 7);
    ctx.lineTo(px + 5, py + 5);
    ctx.lineTo(px - 5, py + 5);
    ctx.fill();
    if (!snap.bossDead) {
      const [bx, by] = project(BOSS_ALONG, 0);
      ctx.fillStyle = '#ff7a3a';
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e6c36a';
    ctx.font = '700 11px sans-serif';
    ctx.fillText('N', -4, -64);
    ctx.restore();
  }

  function tickFloats(dt, camera) {
    const w = innerWidth;
    const h = innerHeight;
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
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h + f.y;
      f.el.style.left = `${x}px`;
      f.el.style.top = `${y}px`;
      f.el.style.opacity = String(Math.max(0, f.life / 0.35));
    }
  }

  const hud = {
    root,
    onSkill: null,
    onPeace: null,
    onWorld: null,
    onMute: null,
    onPick: null,
    onRepick: null,
    bind() {
      root.querySelector('[data-peace]').addEventListener('click', () => this.onPeace?.());
      root.querySelector('[data-world]').addEventListener('click', () => this.onWorld?.());
      root.querySelector('[data-mute]').addEventListener('click', () => this.onMute?.());
      root.querySelector('[data-repick]').addEventListener('click', () => this.onRepick?.());
      root.querySelector('[data-pick-go]').addEventListener('click', () => this.onPick?.(picked));
      grid.querySelectorAll('[data-class]').forEach((btn) => {
        btn.addEventListener('click', () => {
          picked = btn.getAttribute('data-class');
          grid.querySelectorAll('.class-card').forEach((el) => el.classList.toggle('is-on', el === btn));
        });
      });
    },
    setClass(id) {
      active = getClass(id);
      picked = active.id;
      root.querySelector('[data-res-label]').textContent = active.resLabel;
      const roleEl = root.querySelector('[data-my-role]');
      if (roleEl) roleEl.textContent = active.name;
      const fill = root.querySelector('[data-rage-fill]');
      fill.parentElement.className = `bar thin ${active.resBar}`;
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
    setParty(frames) {
      party.innerHTML = frames.map((m) => `
        <div class="mate${m.isMe ? ' is-me' : ''}" data-mate="${m.id}">
          <div class="portrait">${ICONS[m.icon] || ICONS.lock}</div>
          <div>
            <div class="mate-top"><span class="lv">Lv.${m.lv || 1}</span><span>${m.name}</span><span class="role"${m.isMe ? ' data-my-role' : ''}>${m.role}</span></div>
            <div class="bar thin hp"><span data-hp></span></div>
          </div>
        </div>
      `).join('');
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
    float(pos, text, kind) {
      const el = document.createElement('div');
      el.className = `float ${kind || 'dmg'}`;
      if (kind === 'crit') el.innerHTML = `${text}<small>CRITICAL</small>`;
      else el.textContent = String(text);
      root.querySelector('[data-floats]').appendChild(el);
      floats.push({ el, pos: pos.clone(), life: kind === 'crit' ? 1.05 : 0.85, y: 0 });
    },
    showVictory() {
      root.querySelector('[data-victory]').classList.add('show');
    },
    hideVictory() {
      root.querySelector('[data-victory]').classList.remove('show');
    },
    setPeace() {
      root.classList.add('is-peace');
      this.hideVictory();
    },
    update(dt, camera, snap) {
      const pct = snap.bossHp / snap.bossMax;
      setWidth(root.querySelector('[data-boss-fill]'), pct * 100);
      root.querySelector('[data-boss-num]').textContent = `${Math.ceil(pct * 100)}%  (${Math.ceil(snap.bossHp).toLocaleString('ko-KR')} / ${snap.bossMax.toLocaleString('ko-KR')})`;
      const castPct = snap.castMax > 0 ? (snap.cast / snap.castMax) * 100 : 0;
      setWidth(root.querySelector('[data-cast-fill]'), castPct);
      root.querySelector('[data-cast-name]').textContent = snap.castName ? `${snap.castName} 시전 중` : '';
      const castLeft = snap.castMax > 0 ? Math.max(0, snap.castMax - snap.cast) : 0;
      root.querySelector('[data-cast-time]').textContent = snap.castMax > 0 ? `${castLeft.toFixed(1)}초` : '';
      const warn = root.querySelector('[data-warn]');
      if (snap.castName) {
        warn.hidden = false;
        root.querySelector('[data-warn-name]').textContent = snap.castName;
        root.querySelector('[data-warn-time]').textContent = castLeft.toFixed(1);
      } else warn.hidden = true;
      setWidth(root.querySelector('[data-player-fill]'), (snap.hp / snap.hpMax) * 100);
      root.querySelector('[data-player-num]').textContent = `${Math.ceil(snap.hp)} / ${snap.hpMax}`;
      root.querySelector('[data-dealt]').textContent = Math.round(snap.dealt || 0).toLocaleString('ko-KR');
      root.querySelector('[data-healed]').textContent = Math.round(snap.healed || 0).toLocaleString('ko-KR');
      root.querySelector('[data-kills]').textContent = snap.kills;
      const t = Math.max(0, Math.ceil(snap.timeLeft));
      root.querySelector('[data-time]').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      root.querySelector('[data-rage]').textContent = `${Math.round(snap.res)} / 100`;
      setWidth(root.querySelector('[data-rage-fill]'), snap.res);

      for (const row of snap.party || []) {
        const el = root.querySelector(`[data-mate="${row.id}"]`);
        if (!el) continue;
        el.classList.toggle('is-down', row.down);
        setWidth(el.querySelector('[data-hp]'), row.hp * 100);
      }
      active.skills.forEach((s, i) => {
        const btn = root.querySelector(`[data-skill="${s.id}"]`);
        if (!btn) return;
        const cd = snap.cds[i] || 0;
        const remain = Math.max(cd, snap.gcd || 0);
        const denom = Math.max(s.cd || 0, 1.2);
        const p = denom > 0 ? remain / denom : 0;
        btn.querySelector('.sweep').style.setProperty('--p', String(p));
        btn.querySelector('.cd').textContent = cd > 0.05 ? cd.toFixed(1) : '';
        btn.style.filter = !s.locked && s.cost && snap.res < s.cost ? 'brightness(0.55)' : '';
      });
      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0) root.querySelector('[data-banner]').hidden = true;
      }
      if (snap.down > 0) {
        root.querySelector('[data-banner]').hidden = false;
        root.querySelector('[data-banner]').textContent = `쓰러졌습니다 · 노란 선에서 기상 ${Math.ceil(snap.down)}초`;
        bannerT = 0.2;
      }
      drawMap(snap);
      tickFloats(dt, camera);
    },
  };
  return hud;
}
