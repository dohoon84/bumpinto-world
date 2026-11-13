import { bossPoint } from './layout.js';
import { getClass } from './classes.js';

function bossFloatPos() {
  const b = bossPoint();
  return { x: b.x + (Math.random() - 0.5) * 1.2, y: 7.2 + Math.random() * 4.5, z: b.z };
}

function distBoss(x, z) {
  const b = bossPoint();
  return Math.hypot(x - b.x, z - b.z);
}

export function createCombat({ audio, vfx, onFloat, onBossHurt, onBind, onHealParty, onImpact }) {
  let cls = getClass('warrior');
  let skills = cls.skills;
  let cds = skills.map(() => 0);
  const state = {
    hp: cls.hp,
    hpMax: cls.hp,
    res: cls.resStart,
    resMax: cls.resMax || 100,
    level: 1,
    xp: 0,
    down: 0,
    debuff: 0,
    dodgeCd: 0,
    dodgeT: 0,
    iframe: 0,
    attack: '',
    attackT: 0,
    attackLock: 0,
    buff: 0,
    nextMul: 1,
    stealth: 0,
    gcd: 0,
    hitT: 0,
    dealt: 0,
    healed: 0,
    reviveGrace: 0,
    dodgeDir: { x: 0, z: 1 },
    hitSent: false,
    cds,
    classId: cls.id,
  };

  function addRes(n) {
    state.res = Math.max(0, Math.min(state.resMax, state.res + n));
  }

  function roll(base) {
    const buff = state.buff > 0 ? 1.18 : 1;
    const deb = state.debuff > 0 ? 0.85 : 1;
    const nxt = state.nextMul || 1;
    const crit = Math.random() < (cls.id === 'assassin' ? 0.22 : 0.15);
    const amount = Math.max(1, Math.round(base * buff * deb * nxt * (crit ? 1.8 : 1)));
    state.nextMul = 1;
    return { amount, crit };
  }

  function strike(skill, x, z, y) {
    if (distBoss(x, z) > skill.range) return false;
    const hit = roll(skill.power);
    onBossHurt(hit.amount);
    state.dealt += hit.amount;
    onFloat(bossFloatPos(), hit.amount, hit.crit ? 'crit' : 'dmg');
    onImpact?.({ amount: hit.amount, crit: hit.crit });
    audio.playSfx('hit', { x: bossFloatPos().x, z: bossFloatPos().z, big: hit.crit || hit.amount > 90 });
    vfx.sparks(x, y, z, hit.crit ? '#ffe14a' : skill.color, hit.crit ? 10 : 5);
    vfx.burst(x, y, z, hit.crit ? '#ffe14a' : skill.color);
    if (skill.gain) addRes(skill.gain);
    return true;
  }

  function flourish(skill, x, z, yaw) {
    const id = skill.id;
    const b = bossPoint();
    const dx = x - b.x;
    const dz = z - b.z;
    const len = Math.hypot(dx, dz) || 1;
    const hx = b.x + (dx / len) * 8;
    const hz = b.z + (dz / len) * 8;
    if (id === 'charge') vfx.charge(x, z, yaw);
    else if (id === 'slash') vfx.weaponSlash(hx, 6.2, hz, yaw, '#FFB000', 1);
    else if (id === 'shout') vfx.ring(x, 0.4, z, '#FFB000', 3.2);
    else if (id === 'daggers') vfx.weaponSlash(hx, 4.6, hz, yaw, '#FF3D8A', 2);
    else if (id === 'spin') vfx.whirl(x, z);
    else if (id === 'shard') vfx.fireball(x, 1.6, z, yaw);
    else if (id === 'nova' || id === 'blizzard') vfx.frost(x, z);
    else if (id === 'freeze') vfx.bolt(x, z, yaw);
    else if (id === 'heal') vfx.pillar(x, z, '#FFC845');
    else if (id === 'circle') vfx.shield(x, z);
    else if (id === 'holy' || id === 'smite') vfx.holyBurst(x, z);
    else if (id === 'volley') vfx.multi(x, z, yaw);
    else if (id === 'shot' || id === 'mark') vfx.pierce(x, z, yaw);
    else if (id === 'rain') vfx.arrowRain(x, z);
    else if (id === 'shadow') vfx.blink(x, z, yaw);
    else if (id === 'tape') vfx.poison(x, z);
    else if (id === 'stealth') vfx.burst(x, 1.1, z, '#9bb7d4');
    else vfx.slash(x, 1.3, z, yaw, skill.color);
    vfx.sparks(x, 1.2, z, skill.color, 5);
  }

  function impact(skill, x, z, yaw) {
    const y = 1.35;
    audio.playSfx(skill.sfx || 'slash', { x, z });
    flourish(skill, x, z, yaw);
    if (skill.kind === 'melee') {
      strike(skill, x, z, y);
    } else if (skill.kind === 'projectile') {
      strike(skill, x, z, y + 0.4);
    } else if (skill.kind === 'nova') {
      strike(skill, x, z, y);
    } else if (skill.kind === 'rain') {
      for (let i = -2; i <= 2; i++) vfx.arrow(x, 2.4, z, yaw + i * 0.15, skill.color);
      strike(skill, x, z, 2);
    } else if (skill.kind === 'dash') {
      strike(skill, x, z, y);
    } else if (skill.kind === 'spin') {
      strike(skill, x, z, y);
    } else if (skill.kind === 'shout') {
      vfx.ring(x, 0.45, z, skill.color, 2.6);
      state.buff = 7;
      if (skill.gainOnCast) addRes(skill.gainOnCast);
      if (distBoss(x, z) <= skill.range && skill.power) {
        const hit = roll(skill.power);
        onBossHurt(hit.amount);
        state.dealt += hit.amount;
        onFloat(bossFloatPos(), hit.amount, hit.crit ? 'crit' : 'dmg');
      }
    } else if (skill.kind === 'heal') {
      vfx.ring(x, 0.2, z, skill.color, 1.3);
      heal(skill.heal);
    } else if (skill.kind === 'healParty') {
      vfx.ring(x, 0.15, z, skill.color, 3.2);
      heal(skill.heal);
      onHealParty?.(skill.heal);
    } else if (skill.kind === 'stealth') {
      state.stealth = 1.15;
      state.iframe = 1.15;
      state.nextMul = 1.7;
      vfx.burst(x, 1.2, z, '#9bb7d4');
    } else if (skill.kind === 'bind') {
      vfx.tape(bossPoint());
      onBind?.(2.2);
      strike(skill, x, z, y);
    }
  }

  function heal(amount) {
    if (state.down > 0 || !amount) return;
    const before = state.hp;
    state.hp = Math.min(state.hpMax, state.hp + amount);
    const got = Math.round(state.hp - before);
    if (got > 0) {
      state.healed += got;
      onFloat(null, `+${got}`, 'heal');
    }
  }

  return {
    state,
    get skills() { return skills; },
    get classId() { return cls.id; },
    skill(id) { return skills.find((s) => s.id === id); },
    heal,
    setClass(id) {
      cls = getClass(id);
      skills = cls.skills;
      cds = skills.map(() => 0);
      state.cds = cds;
      state.classId = cls.id;
      state.hpMax = cls.hp;
      state.hp = cls.hp;
      state.resMax = cls.resMax || 100;
      state.res = Math.min(state.resMax, cls.resStart);
      state.buff = 0;
      state.nextMul = 1;
      state.stealth = 0;
      state.attack = '';
      state.attackLock = 0;
      state.down = 0;
      state.gcd = 0;
      state.dealt = 0;
      state.healed = 0;
      state.hitT = 0;
    },
    moveMul() {
      if (state.down > 0 || state.dodgeT > 0) return 0;
      let m = state.attackLock > 0 ? 0.88 : 1;
      if (state.debuff > 0) m *= 0.85;
      if (state.stealth > 0) m *= 1.15;
      return m;
    },
    tryDodge(dx, dz) {
      if (state.down > 0 || state.dodgeCd > 0 || state.dodgeT > 0) return false;
      const len = Math.hypot(dx, dz) || 1;
      state.dodgeDir.x = dx / len;
      state.dodgeDir.z = dz / len;
      state.dodgeT = 0.28;
      state.dodgeCd = 2;
      state.iframe = 0.35;
      state.attack = '';
      state.attackLock = 0;
      audio.playSfx('dodge');
      return true;
    },
    trySkill(id, allowed) {
      if (!allowed || state.down > 0) return false;
      const i = skills.findIndex((s) => s.id === id);
      const skill = skills[i];
      if (!skill || skill.locked) return false;
      if (state.gcd > 0 || cds[i] > 0 || state.attackLock > 0.05) return false;
      if (skill.cost && state.res < skill.cost) {
        onFloat(null, `${cls.resLabel} 부족`, 'info');
        return false;
      }
      if (skill.cost) addRes(-skill.cost);
      cds[i] = skill.cd;
      state.gcd = 1.2;
      state.attack = id;
      state.attackT = 0;
      state.attackLock = skill.lock;
      state.hitSent = false;
      return true;
    },
    damagePlayer(amount) {
      if (state.down > 0 || state.iframe > 0 || state.reviveGrace > 0 || state.stealth > 0) return;
      const taken = cls.id === 'warrior' ? Math.round(amount * 0.88) : amount;
      state.hp = Math.max(0, state.hp - taken);
      state.hitT = 0.6;
      if (cls.res === 'rage') addRes(10);
      audio.playSfx('hurt');
      if (state.hp <= 0) {
        state.down = 8;
        state.hp = 0;
        state.attack = '';
        state.attackLock = 0;
      }
    },
    heal,
    update(dt, ctx) {
      for (let i = 0; i < cds.length; i++) cds[i] = Math.max(0, cds[i] - dt);
      state.dodgeCd = Math.max(0, state.dodgeCd - dt);
      state.dodgeT = Math.max(0, state.dodgeT - dt);
      state.iframe = Math.max(0, state.iframe - dt);
      state.buff = Math.max(0, state.buff - dt);
      state.debuff = Math.max(0, state.debuff - dt);
      state.stealth = Math.max(0, state.stealth - dt);
      state.gcd = Math.max(0, state.gcd - dt);
      state.hitT = Math.max(0, state.hitT - dt);
      state.reviveGrace = Math.max(0, state.reviveGrace - dt);
      if (cls.regen) addRes(cls.regen * dt);
      if (state.attack) {
        state.attackT += dt;
        const skill = skills.find((s) => s.id === state.attack);
        const spell = skill && ['projectile', 'nova', 'rain', 'heal', 'healParty', 'shout', 'bind'].includes(skill.kind);
        const cues = ctx.clipCues || {};
        const impactAt = (spell ? cues.cast : cues.skill1) || cues.attack || (skill?.kind === 'dash' ? 0.18 : 0.28);
        if (!state.hitSent && state.attackT >= impactAt) {
          state.hitSent = true;
          if (skill) impact(skill, ctx.x, ctx.z, ctx.yaw);
        }
        const hold = Math.max(skill?.lock || 0.3, impactAt + 0.08);
        if (state.attackT >= hold) state.attack = '';
      }
      state.attackLock = Math.max(0, state.attackLock - dt);
      if (state.down > 0) {
        state.down = Math.max(0, state.down - dt);
        if (state.down === 0) {
          state.hp = Math.round(state.hpMax * 0.4);
          state.debuff = 15;
          state.reviveGrace = 1.2;
          state.iframe = 1.2;
          ctx.onRevive?.();
        }
      }
    },
  };
}
