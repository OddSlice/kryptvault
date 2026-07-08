// KRYPTVAULT v0.5 headless balance simulator
// Attrition model of the real game formulas (not spatial). Goal: RANK cards
// and archetypes, find dead/dominant picks. Calibration targets from live data:
//   warrior avg death ~w5, mage ~w9, vampire builds reach w100+ (immortal).
// Approximations are flagged ASSUMPTION.

'use strict';

// ---------- game constants (lifted from kryptvault.html v0.5) ----------
const CLASSES = {
  warrior: { hp: 200, speed: 60,  damage: 32, cooldown: 1.0, pierce: 0, homingBase: 0,    shotSpeed: 200, dr: 0.12 },
  rogue:   { hp: 70,  speed: 125, damage: 14, cooldown: 0.4, pierce: 0, homingBase: 0,    shotSpeed: 200, dr: 0 },
  mage:    { hp: 80,  speed: 70,  damage: 40, cooldown: 1.0, pierce: 1, homingBase: 0.06, shotSpeed: 200, dr: 0 },
  ranger:  { hp: 65,  speed: 90,  damage: 34, cooldown: 0.9, pierce: 2, homingBase: 0,    shotSpeed: 340, dr: 0 },
};

function enemyMix(w) {
  const mix = [];
  let used = 0;
  if (w >= 5) { mix.push(['wraith', 0.10]); used = 0.10; }
  if (w >= 3) { mix.push(['bomber', 0.22 - used]); used = 0.22; }
  if (w >= 2) { mix.push(['splitter', 0.36 - used]); used = 0.36; }
  if (w >= 4) { mix.push(['orc', 0.55 - used]); used = 0.55; }
  mix.push(['skeleton', 0.75 - used]);
  mix.push(['slime', 0.25]);
  return mix;
}
const BASE_HP = { skeleton: 30, slime: 50, orc: 120, splitter: 70, mini: 16, bomber: 35, wraith: 25 };

function avgEnemyBaseHp(w) {
  let s = 0;
  for (const [t, p] of enemyMix(w)) s += BASE_HP[t] * p;
  return s;
}
function avgEnemyHp(w, curseHpMult) {
  const ease = 1 - Math.max(0, 6 - w) * 0.01;
  const elite = w >= 3 ? (0.94 + 0.06 * 3) : 1;
  return avgEnemyBaseHp(w) * (1 + (w - 1) * 0.3) * curseHpMult * ease * elite;
}
function avgXpPerKill(w) { return (avgEnemyBaseHp(w) / 5) * (1 + (w - 1) * 0.1); }
function spawnInterval(w, haste, bossWave) {
  let si = Math.max(0.25, 1.5 - w * 0.1) / haste;
  if (bossWave) si *= 1.8;
  return si;
}
function contactDmg(w) { return 10 + Math.floor(w / 3) * 3; }
function xpForNext(level) { return 30 + level * 45 + level * level * 8; }
function bossHp(w, curseHpMult) { return (600 + w * 80) * 1.3 * curseHpMult; }

// ---------- v0.5 upgrade pool ----------
const POOL = {
  multishot:  { max: p => p.projectiles >= 5, apply: p => { p.projectiles = Math.min(5, p.projectiles + 1); p.damage = Math.max(5, Math.round(p.damage * 0.88)); } },
  atkspeed:   { apply: p => { p.cooldown = Math.max(0.2, p.cooldown - 0.1); p.shotSpeed = Math.max(100, Math.round(p.shotSpeed * 0.9)); } },
  damage:     { apply: p => { p.damage += 15; p.cooldown = Math.min(1.6, p.cooldown + 0.05); } },
  health:     { apply: p => { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - p.hp) * 0.5 * p.healMult); p.speed = Math.max(40, p.speed - 5); } },
  movespeed:  { apply: p => { p.speed += 20; p.maxHp = Math.max(30, p.maxHp - 10); p.hp = Math.min(p.hp, p.maxHp); } },
  pierce:     { apply: p => { p.pierce += 1; p.damage = Math.max(5, Math.round(p.damage * 0.9)); } },
  vampire:    { apply: p => { p.vampire += 3; p.maxHp = Math.max(30, p.maxHp - 15); p.hp = Math.min(p.hp, p.maxHp); } },
  xpmagnet:   { apply: (p, g) => { p.xpMult *= 1.2; g.curseSpeedMult *= 1.04; } },
  shotgun:    { apply: p => { p.shotgun += 1; p.cooldown = Math.min(1.6, p.cooldown + 0.1); } },
  homing:     { apply: p => { p.homing += 1; p.shotSpeed = Math.max(100, Math.round(p.shotSpeed * 0.85)); } },
  shield:     { apply: p => { p.shield += 1; p.speed = Math.max(40, p.speed - 8); } },
  frost:      { apply: p => { p.frost += 1; p.damage = Math.max(5, Math.round(p.damage * 0.9)); } },
  crit:       { apply: p => { p.critChance = Math.min(0.6, p.critChance + 0.10); p.damage = Math.max(5, Math.round(p.damage * 0.95)); } },
  armor:      { apply: p => { p.armor = Math.min(0.5, p.armor + 0.10); p.speed = Math.max(40, p.speed - 5); } },
  static:     { apply: p => { p.staticLvl += 1; p.cooldown = Math.min(1.6, p.cooldown + 0.05); } },
  velocity:   { apply: p => { p.shotSpeed = Math.round(p.shotSpeed * 1.25); p.maxHp = Math.max(30, p.maxHp - 10); p.hp = Math.min(p.hp, p.maxHp); } },
  heavyshot:  { apply: p => { p.projSize += 1; p.cooldown = Math.min(1.6, p.cooldown + 0.05); } },
  // cursed
  lucky:      { cursed: true, apply: (p, g) => { p.lucky += 1; g.curseHpMult *= 1.2; } },
  darkpact:   { cursed: true, apply: (p, g) => { p.pactLvl += 1; g.cultists += 1; } },
  executioner:{ cursed: true, apply: (p, g) => { p.critMult += 0.5; g.curseSpeedMult *= 1.10; } },
  glasscannon:{ cursed: true, apply: p => { p.damage = Math.round(p.damage * 1.25); p.maxHp = Math.max(30, p.maxHp - 20); p.hp = Math.min(p.hp, p.maxHp); } },
  hastepact:  { cursed: true, apply: (p, g) => { p.speed *= 1.15; p.cooldown = Math.max(0.2, p.cooldown / 1.15); g.spawnHaste *= 1.15; } },
  retribution:{ cursed: true, apply: p => { p.retribution += 1; p.maxHp = Math.max(30, p.maxHp - 15); p.hp = Math.min(p.hp, p.maxHp); } },
};
const EVOS = {
  seekerswarm: { needs: ['shotgun', 'homing'],    apply: p => { p.seekerSwarm = 1; p.shotSpeed = Math.max(100, Math.round(p.shotSpeed * 0.9)); } },
  bladeorbit:  { needs: ['shield', 'damage'],     apply: p => { p.bladeOrbit = 1; p.speed = Math.max(40, p.speed - 5); } },
  railgun:     { needs: ['pierce', 'damage'],     apply: p => { p.railgun = 1; p.damage += 25; p.cooldown = Math.min(1.9, p.cooldown + 0.3); } },
  bulletstorm: { needs: ['multishot', 'atkspeed'],apply: p => { p.bulletstorm = 1; p.projectiles += 1; p.cooldown = Math.max(0.15, p.cooldown - 0.1); p.damage = Math.max(5, Math.round(p.damage * 0.9)); } },
  deathseeker: { needs: ['crit', 'homing'],       apply: p => { p.deathseeker = 1; p.critChance = Math.min(0.75, p.critChance + 0.15); p.shotSpeed = Math.max(100, Math.round(p.shotSpeed * 0.9)); } },
};

// ---------- DPS model ----------
function playerDps(p, density, wave) {
  const homingStr = p.homing > 0 ? (0.08 + (p.homing - 1) * 0.04) : p.homingBase;
  const speedF = Math.min(1.35, Math.max(0.7, p.shotSpeed / 200)); // fast shots whiff less
  const sizeF = 1 + p.projSize * 0.08;                             // heavy shot hitbox
  const denseF = Math.min(1, 0.35 + density / 25);
  // crit: chance x (mult-1) expected extra damage
  const critF = 1 + p.critChance * (p.critMult - 1);
  // deathseeker: crit shots bounce once = extra landed hit in crowds
  const seekF = p.deathseeker ? 1 + p.critChance * 0.6 * Math.min(1, density / 10) : 1;

  const effMain  = Math.min(1, 0.95 * speedF * sizeF);
  const effExtra = Math.min(1, (0.45 + homingStr * 3.5) * denseF * speedF * sizeF);
  const effPellet= Math.min(1, (0.35 + homingStr * 3.0) * denseF * speedF * sizeF);

  const pierceCount = p.railgun ? 99 : p.pierce;
  const pierceF = 1 + Math.min(pierceCount, density / 8) * 0.55;

  const shotsPerSec = 1 / p.cooldown;
  let dps = p.damage * (1 * effMain + (p.projectiles - 1) * effExtra) * shotsPerSec * pierceF;

  if (p.shotgun > 0) {
    // v0.5: 4 fat knockback pellets at 0.75x (+1/stack; seeker +3 at 0.85x)
    const pellets = 4 + (p.shotgun - 1) + (p.seekerSwarm ? 3 : 0);
    const pfac = p.seekerSwarm ? 0.85 : 0.75;
    const fatF = 1.15; // fat pellets land more often
    const pEff = Math.min(1, (p.seekerSwarm ? effPellet + 0.25 : effPellet) * fatF);
    dps += p.damage * pfac * pellets * pEff * shotsPerSec * pierceF;
  }
  if (p.shield > 0) {
    // v0.5: 5 base orbs, 190deg/s
    const orbs = 4 + p.shield + (p.bladeOrbit ? 2 : 0);
    const orbDmg = p.bladeOrbit ? 40 : 15;
    const hitCd = 0.3;
    const ringTargets = Math.min(density * 0.35, orbs);
    const spinF = p.bladeOrbit ? 1.0 : 0.8; // faster base spin than v0.4
    dps += orbDmg * ringTargets * spinF / hitCd;
  }
  if (p.staticLvl > 0) {
    const zap = 70 + (p.staticLvl - 1) * 15;
    const targets = Math.min(2 + p.staticLvl, density);
    dps += zap * targets / 2.5;
  }
  // dark pact: kill-explosions chain into crowds (ASSUMPTION: multiplier)
  if (p.pactLvl > 0) {
    dps *= 1 + Math.min(0.35, 0.12 * p.pactLvl) * Math.min(1, density / 15);
  }
  // ascendancy actives, averaged over cooldown
  if (p.asc === 'berserker') dps += 80 * Math.min(density * 0.4, 8) / 10;
  if (p.asc === 'lightmage') dps += 90 * Math.min(density * 0.3, 6) / 8;
  if (p.asc === 'assassin')  dps += p.damage * 1.5 * 12 * 0.35 / 9;
  if (p.asc === 'sniper')    dps += p.damage * 3 * (1 + Math.min(4, density / 8)) / 7;
  if (p.asc === 'trapper')   dps += 25 * Math.min(density * 0.3, 6) / 0.5 * (4 / 9) * 0.4;
  if (p.asc === 'juggernaut')dps += 60 * Math.min(density * 0.4, 6) / 8;
  return dps * critF * seekF;
}

function incomingHitsPerSec(p, g, density) {
  const dodge = Math.min(0.85, Math.max(0.2, 0.4 + (p.speed - 60) / 250));
  const slowF = p.frost > 0 ? 1 - Math.min(0.25, 0.1 + p.frost * 0.05) : 1;
  // shotgun knockback thins the melee press a little
  const kbF = p.shotgun > 0 ? 1 - Math.min(0.15, 0.05 * p.shotgun) : 1;
  const pressure = Math.min(1, density / 30) * g.curseSpeedFactor();
  return 2 * pressure * (1 - dodge) * slowF * kbF;
}

function incomingDps(p, g, density, wave, hitsPerSec) {
  let dmg = contactDmg(wave) * hitsPerSec;
  if (g.cultists > 0) dmg += 6 * g.cultists * 0.5;
  let dr = p.dr;
  if (p.asc === 'juggernaut') dr = 1 - (1 - dr) * 0.9;
  dmg *= (1 - dr) * (1 - p.armor);
  return dmg;
}

// ---------- strategies ----------
const STRATEGIES = {
  random:        null,
  dmg_stack:     ['glasscannon', 'damage', 'atkspeed', 'heavyshot', 'health', 'armor'],
  multishot_fan: ['multishot', 'atkspeed', 'damage', 'homing', 'velocity', 'health'],
  shotgun_swarm: ['shotgun', 'homing', 'atkspeed', 'heavyshot', 'damage', 'health'],
  orb_tank:      ['shield', 'damage', 'health', 'armor', 'vampire', 'frost'],
  static_mage:   ['static', 'damage', 'atkspeed', 'frost', 'health', 'movespeed'],
  vamp_sustain:  ['vampire', 'atkspeed', 'multishot', 'movespeed', 'hastepact', 'damage'],
  pierce_rail:   ['pierce', 'damage', 'atkspeed', 'velocity', 'health', 'frost'],
  crit_build:    ['crit', 'executioner', 'homing', 'atkspeed', 'velocity', 'damage'],
  armor_tank:    ['armor', 'health', 'shield', 'damage', 'vampire', 'static'],
  thorns_tank:   ['retribution', 'armor', 'health', 'vampire', 'damage', 'shield'],
  pact_bomber:   ['darkpact', 'damage', 'atkspeed', 'multishot', 'lucky', 'static'],
};

// ---------- run simulation ----------
function makePlayer(cls) {
  const c = CLASSES[cls];
  return {
    cls, hp: c.hp, maxHp: c.hp, speed: c.speed, damage: c.damage,
    cooldown: c.cooldown, pierce: c.pierce, homingBase: c.homingBase,
    shotSpeed: c.shotSpeed, dr: c.dr,
    projectiles: 1, shotgun: 0, homing: 0, shield: 0, frost: 0,
    staticLvl: 0, vampire: 0, healMult: 1, xpMult: 1,
    seekerSwarm: 0, bladeOrbit: 0, railgun: 0, bulletstorm: 0, deathseeker: 0,
    critChance: 0, critMult: 2, projSize: 0, armor: 0, lucky: 0,
    pactLvl: 0, retribution: 0, asc: null, taken: {},
  };
}

function offerCards(p, poolIds) {
  for (const [id, evo] of Object.entries(EVOS)) {
    if (p.taken[id]) continue;
    if (evo.needs.every(n => p.taken[n])) return [id];
  }
  const avail = poolIds.filter(id => {
    const c = POOL[id];
    return !(c.max && c.max(p));
  });
  const out = [];
  const bag = avail.slice();
  while (out.length < 3 && bag.length) out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  return out;
}

function pickCard(offered, prio, p, g) {
  let id;
  const evo = offered.find(o => EVOS[o]);
  if (evo) id = evo;
  else if (!prio) id = offered[Math.floor(Math.random() * offered.length)];
  else {
    for (const want of prio) if (offered.includes(want)) { id = want; break; }
    if (!id) id = offered[0];
  }
  const card = EVOS[id] || POOL[id];
  card.apply(p, g);
  p.taken[id] = (p.taken[id] || 0) + 1;
}

function ascFor(cls) {
  const map = {
    warrior: ['juggernaut', 'berserker'], rogue: ['phantom', 'assassin'],
    mage: ['frostmage', 'lightmage'], ranger: ['sniper', 'trapper'],
  };
  const [a, b] = map[cls];
  return Math.random() < 0.5 ? a : b;
}

function applyAsc(p, id) {
  p.asc = id;
  if (id === 'phantom') p.speed += 15;
  if (id === 'assassin') p.critChance = Math.max(p.critChance, 0.2);
  if (id === 'frostmage') p.frost = Math.max(p.frost, 1);
  if (id === 'lightmage') p.homingBase = Math.max(p.homingBase, 0.10);
  if (id === 'sniper') p.shotSpeed = Math.round(p.shotSpeed * 1.25);
  if (id === 'trapper') p.pierce += 1;
}

function simulateRun(cls, stratName, poolIds, maxWave = 200) {
  const p = makePlayer(cls);
  const prio = STRATEGIES[stratName];
  const g = {
    curseHpMult: 1, curseSpeedMult: 1, spawnHaste: 1, cultists: 0,
    curseSpeedFactor() { return Math.min(1.5, this.curseSpeedMult); },
  };
  let wave = 1, level = 1, xp = 0, kills = 0, density = 0, t = 0;
  const dt = 0.25;
  let waveKills = 0, boss = 0;

  while (wave <= maxWave) {
    t += dt;
    if (t > 3600) break;
    const bossWave = wave % 10 === 0;
    density += dt / spawnInterval(wave, g.spawnHaste, bossWave);
    density = Math.min(density, 200);
    let dps = playerDps(p, density, wave);
    if (p.asc === 'berserker' && p.hp < p.maxHp * 0.5) dps *= 1.35;
    const eHp = avgEnemyHp(wave, g.curseHpMult);
    const hitsPerSec = incomingHitsPerSec(p, g, density);
    // retribution converts hits taken into kills
    let thornKills = 0;
    if (p.retribution > 0) {
      const thorns = 60 + (p.retribution - 1) * 40;
      thornKills = Math.min(hitsPerSec, 2) * Math.min(1, thorns / eHp);
    }
    let killRate = (density > 0.5 ? dps / eHp : 0) + thornKills;
    killRate = Math.min(killRate, density / dt * 0.9);
    if (bossWave && boss > 0) {
      boss -= dps * 0.5 * dt;
      killRate *= 0.5;
      if (boss <= 0) {
        if (!p.asc) applyAsc(p, ascFor(cls));
        else { level++; const off = offerCards(p, poolIds); pickCard(off, prio, p, g); }
        wave++; waveKills = 0;
        continue;
      }
    }
    const killed = killRate * dt;
    kills += killed; waveKills += killed;
    density = Math.max(0, density - killed);
    xp += killed * avgXpPerKill(wave) * p.xpMult;
    while (xp >= xpForNext(level) && level < 99) {
      xp -= xpForNext(level); level++;
      const off = offerCards(p, poolIds);
      pickCard(off, prio, p, g);
    }
    const inc = incomingDps(p, g, density, wave, hitsPerSec);
    const heal = p.vampire * p.healMult * killRate;
    // potions: ~4% base drop doubled per lucky stack (capped), heal 25
    const luckyF = Math.min(4, Math.pow(2, p.lucky));
    const potions = killRate * 0.04 * luckyF * 25 * p.healMult * 0.6;
    p.hp = Math.min(p.maxHp, p.hp + (heal + potions - inc) * dt);
    if (p.hp <= 0) break;
    if (!bossWave && waveKills >= 15 + wave * 5) {
      wave++; waveKills = 0;
      if (wave % 10 === 0) boss = bossHp(wave, g.curseHpMult);
    } else if (bossWave && boss === 0) {
      boss = bossHp(wave, g.curseHpMult);
    }
  }
  return { wave, kills: Math.round(kills), level, taken: p.taken, timedOut: t > 3600 };
}

// ---------- experiment harness ----------
function quantiles(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const q = f => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  return { p25: q(0.25), med: q(0.5), p75: q(0.75), max: s[s.length - 1] };
}

const poolIds = Object.keys(POOL);
const N = 300;

console.log(`KRYPTVAULT balance sim — v0.5 pool (${poolIds.length} cards), ${N} runs/cell\n`);
console.log('class    strategy        p25   med   p75   max  (death wave; max 200 = immortal-capped)');
console.log('-'.repeat(88));

for (const cls of Object.keys(CLASSES)) {
  for (const strat of Object.keys(STRATEGIES)) {
    const waves = [];
    for (let i = 0; i < N; i++) waves.push(simulateRun(cls, strat, poolIds).wave);
    const q = quantiles(waves);
    console.log(
      cls.padEnd(8) + ' ' + strat.padEnd(14) +
      String(q.p25).padStart(6) + String(q.med).padStart(6) +
      String(q.p75).padStart(6) + String(q.max).padStart(6));
  }
  console.log('-'.repeat(88));
}

console.log('\nCARD IMPACT (random-pick runs, all classes): avg death wave WITH vs WITHOUT card');
const withW = {}, withoutW = {};
for (const cls of Object.keys(CLASSES)) {
  for (let i = 0; i < 600; i++) {
    const r = simulateRun(cls, 'random', poolIds);
    for (const id of poolIds) {
      if (r.taken[id]) (withW[id] = withW[id] || []).push(r.wave);
      else (withoutW[id] = withoutW[id] || []).push(r.wave);
    }
  }
}
const rows = [];
for (const id of poolIds) {
  const a = withW[id] || [], b = withoutW[id] || [];
  if (!a.length || !b.length) continue;
  const avg = x => x.reduce((s, v) => s + v, 0) / x.length;
  rows.push({ id, with: avg(a), without: avg(b), delta: avg(a) - avg(b), picked: a.length });
}
rows.sort((x, y) => y.delta - x.delta);
for (const r of rows) {
  console.log(r.id.padEnd(12) + ' with ' + r.with.toFixed(1).padStart(6) +
    '  without ' + r.without.toFixed(1).padStart(6) +
    '  delta ' + (r.delta >= 0 ? '+' : '') + r.delta.toFixed(1).padStart(5) +
    '  (in ' + r.picked + ' runs)');
}
