// Shared class-role brain for NPC companions and the player's AUTO toggle.
import { getClass } from './classes.js';

export const CLASS_HP = { warrior: 186, priest: 120, mage: 100, archer: 104, assassin: 108 };

export function makeVitals(classId) {
  const hp = CLASS_HP[classId] || 100;
  return {
    hp,
    hpMax: hp,
    down: 0,
    iframe: 0,
    cds: {},
    gcd: 0,
    rezCd: 0,
    skills: {},
    dealt: 0,
    healed: 0,
    deaths: 0,
    distSum: 0,
    distN: 0,
  };
}

export function bossFrame(boss) {
  const yaw = boss.rotation.y;
  return {
    x: boss.position.x,
    z: boss.position.z,
    fx: Math.sin(yaw),
    fz: Math.cos(yaw),
    rx: Math.cos(yaw),
    rz: -Math.sin(yaw),
  };
}

function lowest(allies, self, under) {
  let best = null;
  let hp = under;
  for (const a of allies) {
    if (a === self || a.vitals.down > 0) continue;
    const r = a.vitals.hp / a.vitals.hpMax;
    if (r < hp) {
      hp = r;
      best = a;
    }
  }
  return best;
}

export function roleGoal(actor, ctx) {
  const b = ctx.boss;
  const i = actor.slot || 0;
  const sway = Math.sin(ctx.now * 0.00055 + i * 1.7);
  let gx;
  let gz;
  if (actor.classId === 'warrior') {
    gx = b.x + b.fx * 7.4;
    gz = b.z + b.fz * 7.4;
  } else if (actor.classId === 'assassin') {
    gx = b.x - b.fx * 4.4 + b.rx * (2.6 + sway * 0.7);
    gz = b.z - b.fz * 4.4 + b.rz * (2.6 + sway * 0.7);
  } else if (actor.classId === 'mage') {
    const dist = 12 + Math.sin(ctx.now * 0.00032 + i) * 1.6;
    const side = -3.8 + sway * 2.1;
    gx = b.x + b.fx * dist + b.rx * side;
    gz = b.z + b.fz * dist + b.rz * side;
  } else if (actor.classId === 'archer') {
    const dist = 13 + Math.sin(ctx.now * 0.0004 + 2) * 1.3;
    const side = 4.1 + sway * 2.3;
    gx = b.x + b.fx * dist + b.rx * side;
    gz = b.z + b.fz * dist + b.rz * side;
    const near = (ctx.mobs || []).find((m) => Math.hypot(m.x - actor.x, m.z - actor.z) < 4.2);
    if (near) {
      const dx = actor.x - near.x;
      const dz = actor.z - near.z;
      const len = Math.hypot(dx, dz) || 1;
      gx += (dx / len) * 3.4;
      gz += (dz / len) * 3.4;
    }
  } else {
    gx = b.x + b.fx * 9.2 + b.rx * -1.5;
    gz = b.z + b.fz * 9.2 + b.rz * -1.5;
    const hurt = lowest(ctx.allies, actor, 0.8);
    const downed = ctx.allies.find((a) => a !== actor && a.vitals.down > 0);
    const focus = downed || hurt;
    if (focus) {
      const p = focus.mesh ? focus.mesh.position : focus;
      gx = p.x + b.rx * 1.7;
      gz = p.z + b.rz * 1.7;
    }
  }
  for (const zone of ctx.zones || []) {
    const dx = gx - zone.x;
    const dz = gz - zone.z;
    const d = Math.hypot(dx, dz);
    if (d < zone.r + 1.1) {
      const len = d || 1;
      return { x: zone.x + (dx / len) * (zone.r + 1.8), z: zone.z + (dz / len) * (zone.r + 1.8), dodge: true };
    }
  }
  return { x: gx, z: gz, dodge: false };
}

function ready(actor, id) {
  const skill = getClass(actor.classId).skills.find((s) => s.id === id);
  if (!skill || skill.locked) return false;
  return (actor.vitals.cds[id] || 0) <= 0 && actor.vitals.gcd <= 0;
}

export function chooseSkill(actor, ctx) {
  const v = actor.vitals;
  if (!v || v.down > 0 || v.gcd > 0) return null;
  const downed = ctx.allies.find((a) => a !== actor && a.vitals.down >= 6 && v.rezCd <= 0);
  const hurt = lowest(ctx.allies, actor, 0.96);
  const dist = ctx.distBoss;
  if (actor.classId === 'priest') {
    if (downed) return 'rez';
    if (hurt && ready(actor, 'heal')) return 'heal';
    if (hurt && ready(actor, 'circle')) return 'circle';
    if (ready(actor, 'holy') && dist < 16) return 'holy';
    if (ready(actor, 'smite')) return 'smite';
    return null;
  }
  if (actor.classId === 'warrior') {
    if (dist > 6.2 && ready(actor, 'charge')) return 'charge';
    if (dist < 6 && ready(actor, 'spin')) return 'spin';
    if (ready(actor, 'shout') && (actor.taunt || 0) <= 0) return 'shout';
    if (ready(actor, 'slash')) return 'slash';
    return null;
  }
  if (actor.classId === 'assassin') {
    if (dist > 5.2 && ready(actor, 'shadow')) return 'shadow';
    if (ctx.inDanger && ready(actor, 'stealth')) return 'stealth';
    if (ready(actor, 'daggers')) return 'daggers';
    if (ready(actor, 'tape')) return 'tape';
    return null;
  }
  if (actor.classId === 'mage') {
    if (ready(actor, 'blizzard') && dist < 16) return 'blizzard';
    if (ready(actor, 'nova') && dist < 13) return 'nova';
    if (ready(actor, 'freeze')) return 'freeze';
    if (ready(actor, 'shard')) return 'shard';
    return null;
  }
  if (actor.classId === 'archer') {
    if (ready(actor, 'rain')) return 'rain';
    if (ready(actor, 'volley')) return 'volley';
    if (ready(actor, 'mark')) return 'mark';
    if (ready(actor, 'shot')) return 'shot';
    return null;
  }
  return null;
}

export function hurtVitals(vitals, amount, kind) {
  if (vitals.down > 0 || vitals.iframe > 0) return 0;
  const tank = kind === 'tank';
  const taken = Math.max(1, Math.round(amount * (tank ? 1.08 : kind === 'heal' ? 0.52 : 0.68)));
  vitals.hp = Math.max(0, vitals.hp - taken);
  if (vitals.hp <= 0) {
    vitals.hp = 0;
    vitals.down = 9;
    vitals.deaths += 1;
  }
  return taken;
}
