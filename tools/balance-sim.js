// KRYPTVAULT v0.4a headless balance simulator
// Attrition model of the real game formulas (not spatial). Goal: RANK cards
// and archetypes, find dead/dominant picks. Calibration targets from live data:
//   warrior avg death ~w5, mage ~w9, rogue-vampire reaches w100+ (immortal).
// Approximations are flagged ASSUMPTION.

'use strict';

// ---------- game constants (lifted from kryptvault.html v0.4a) ----------
const CLASSES = {
  warrior: { hp: 200, speed: 60,  damage: 32, cooldown: 1.0, pierce: 0, homingBase: 0,    shotSpeed: 200, dr: 0.12 },
  rogue:   { hp: 70,  speed: 125, damage: 14, cooldown: 0.4, pierce: 0, homingBase: 0,    shotSpeed: 200, dr: 0 },
  mage:    { hp: 80,  speed: 70,  damage: 40, cooldown: 1.0, pierce: 1, homingBase: 0.06, shotSpeed: 200, dr: 0 },
  ranger:  { hp: 65,  speed: 90,  damage: 34, cooldown: 0.9, pierce: 2, homingBase: 0,    shotSpeed: 340, dr: 0 },
};

// enemy mix (wave-gated cascading rolls, matching enemyTypeForWave)
function enemyMix(w) {
  const mix = [];
  let used = 0;
  if (w >= 5) { mix.push(['wraith', 0.10]); used = 0.10; } // roll < .10
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
  const elite = w >= 3 ? (0.94 + 0.06 * 3) : 1; // 6% elites at 3x hp
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

// ---------- upgrade pool ----------
// apply(): mutates player exactly like applyUpgrade in the game.
const POOL = {
  multishot:  { max: p => p.projectiles >= 5, apply: p => { p.projectiles = Math.min(5, p.projectiles + 1); p.damage = Math.max(5, Math.round(p.damage * 0.85)); } },
  atkspeed:   { apply: p => { p.cooldown = Math.max(0.2, p.cooldown - 0.1); p.shotSpeed = Math.max(100, Math.round(p.shotSpeed * 0.9)); } },
  damage:     { apply: p => { p.damage += 15; p.cooldown = Math.min(1.6, p.cooldown + 0.05); } },
  health:     { apply: p => { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + Math.round(30 * p.healMult)); p.speed = Math.max(40, p.speed - 5); } },
  movespeed:  { apply: p => { p.speed += 20; p.maxHp = Math.max(30, p.maxHp - 10); p.hp = Math.min(p.hp, p.maxHp); } },
  pierce:     { apply: p => { p.pierce += 1; p.damage = Math.max(5, Math.round(p.damage * 0.9)); } },
  vampire:    { apply: p => { p.vampire += 3; p.maxHp = Math.max(30, p.maxHp - 15); p.hp = Math.min(p.hp, p.maxHp); } },
  xpmagnet:   { apply: (p, g) => { p.xpMult *= 1.2; g.curseSpeedMult *= 1.08; } },
  shotgun:    { apply: p => { p.shotgun += 1; p.cooldown = Math.min(1.6, p.cooldown + 0.1); } },
  homing:     { apply: p => { p.homing += 1; p.shotSpeed = Math.max(100, Math.round(p.shotSpeed * 0.85)); } },
  shield:     { apply: p => { p.shield += 1; p.speed = Math.max(40, p.speed - 8); } },
  frost:      { apply: p => { p.frost += 1; p.damage = Math.max(5, Math.round(p.damage * 0.9)); } },
  ricochet:   { apply: p => { p.ricochet += 1; p.damage = Math.max(5, Math.round(p.damage * 0.9)); } },
  regen:      { apply: p => { p.regen += 1; p.damage = Math.max(5, Math.round(p.damage * 0.9)); } },
  static:     { apply: p => { p.staticLvl += 1; p.cooldown = Math.min(1.6, p.cooldown + 0.05); } },
  // cursed
  greed:      { cursed: true, apply: (p, g) => { g.curseHpMult *= 1.3; } },
  darkpact:   { cursed: true, max: p => p.projectiles >= 6, apply: (p, g) => { p.projectiles = Math.min(6, p.projectiles + 1); g.cultists += 1; } },
  bloodrage:  { cursed: true, apply: (p, g) => { p.damage += 25; g.curseSpeedMult *= 1.25; } },
  glasscannon:{ cursed: true, apply: p => { p.damage = Math.round(p.damage * 1.6); p.maxHp = Math.max(30, p.maxHp - 30); p.hp = Math.min(p.hp, p.maxHp); } },
  hastepact:  { cursed: true, apply: (p, g) => { p.speed *= 1.15; p.cooldown = Math.max(0.2, p.cooldown / 1.15); g.spawnHaste *= 1.15; } },
  bloodaltar: { cursed: true, apply: p => { p.damage = Math.round(p.damage * 1.4); p.healMult *= 0.5; } },
};
// PROPOSED v0.5 cards (enabled with --proposed)
const PROPOSED = {
  crit:      { apply: p => { p.critChance = Math.min(0.6, p.critChance + 0.10); p.damage = Math.max(5, Math.round(p.damage * 0.95)); } },
  projspeed: { apply: p => { p.shotSpeed = Math.round(p.shotSpeed * 1.25); p.maxHp = Math.max(30, p.maxHp - 10); p.hp = Math.min(p.hp, p.maxHp); } },
  projsize:  { apply: p => { p.projSize += 1; p.cooldown = Math.min(1.6, p.cooldown + 0.05); } },
  armor:     { apply: p => { p.armor = Math.min(0.5, p.armor + 0.10); p.speed = Math.max(40, p.speed - 5); } },
};
const EVOS = {
  seekerswarm: { needs: ['shotgun', 'homing'],    apply: p => { p.seekerSwarm = 1; p.shotSpeed = Math.max(100, Math.round(p.shotSpeed * 0.9)); } },
  bladeorbit:  { needs: ['shield', 'damage'],     apply: p => { p.bladeOrbit = 1; p.speed = Math.max(40, p.speed - 5); } },
  railgun:     { needs: ['pierce', 'damage'],     apply: p => { p.railgun = 1; p.damage += 25; p.cooldown = Math.min(1.6, p.cooldown + 0.3); } },
  bulletstorm: { needs: ['multishot', 'atkspeed'],apply: p => { p.bulletstorm = 1; p.projectiles += 1; p.cooldown = Math.max(0.2, p.cooldown - 0.1); p.damage = Math.max(5, Math.round(p.damage * 0.9)); } },
};

// ---------- DPS model ----------
// ASSUMPTION: hit efficiency — fraction of fired damage that lands.
// First fan shot ~always lands (auto-aim). Extra fan shots at 15deg land less
// at range; homing fixes that. Shotgun arc mostly whiffs at range (Martin's
// lived 3%-orb / whiffy-shotgun experience), improves with density.
function playerDps(p, density, wave) {
  const homingStr = p.homing > 0 ? (0.08 + (p.homing - 1) * 0.04) : p.homingBase;
  const speedF = Math.min(1.15, p.shotSpeed / 200);           // fast shots whiff less
  const sizeF = 1 + p.projSize * 0.07;                        // proposed card
  const denseF = Math.min(1, 0.35 + density / 25);            // crowds catch strays
  const critF = 1 + p.critChance * 1.0;                       // crits deal 2x

  const effMain  = Math.min(1, (0.95 * speedF) * sizeF);
  const effExtra = Math.min(1, (0.45 + homingStr * 3.5) * denseF * speedF * sizeF);
  const effPellet= Math.min(1, (0.30 + homingStr * 3.0) * denseF * speedF * sizeF);

  // pierce multiplies landed damage when crowds are thick
  const pierceCount = p.railgun ? 99 : p.pierce;
  const pierceF = 1 + Math.min(pierceCount, density / 8) * 0.55;
  const bounceF = 1 + Math.min(p.ricochet, 3) * 0.30 * Math.min(1, density / 10);

  const shotsPerSec = 1 / p.cooldown;
  let dps = p.damage * (1 * effMain + (p.projectiles - 1) * effExtra) * shotsPerSec * pierceF * bounceF;

  if (p.shotgun > 0) {
    const pellets = 5 + (p.shotgun - 1) * 2 + (p.seekerSwarm ? 4 : 0);
    const pfac = p.seekerSwarm ? 0.8 : 0.6;
    const pEff = p.seekerSwarm ? Math.min(1, effPellet + 0.25) : effPellet;
    dps += p.damage * pfac * pellets * pEff * shotsPerSec * pierceF;
  }
  // orbit shield: contact weapon, only hits what walks into the ring
  if (p.shield > 0) {
    const orbs = 3 + p.shield + (p.bladeOrbit ? 2 : 0);
    const orbDmg = p.bladeOrbit ? 40 : 15;
    const hitCd = 0.3;
    const ringTargets = Math.min(density * 0.35, orbs);        // ASSUMPTION
    const spinF = p.bladeOrbit ? 1.0 : 0.7;                    // slow spin whiffs
    dps += orbDmg * ringTargets * spinF / hitCd;
  }
  if (p.staticLvl > 0) {
    const zap = 70 + (p.staticLvl - 1) * 15;
    const targets = Math.min(2 + p.staticLvl, density);
    dps += zap * targets / 2.5;
  }
  // ascendancy actives, averaged over cooldown
  if (p.asc === 'berserker') dps += 80 * Math.min(density * 0.4, 8) / 10;
  if (p.asc === 'lightmage') dps += 90 * Math.min(density * 0.3, 6) / 8;
  if (p.asc === 'assassin')  dps += p.damage * 1.5 * 12 * 0.35 / 9;
  if (p.asc === 'sniper')    dps += p.damage * 3 * (1 + Math.min(4, density / 8)) / 7;
  if (p.asc === 'trapper')   dps += 25 * Math.min(density * 0.3, 6) / 0.5 * (4 / 9) * 0.4;
  if (p.asc === 'juggernaut')dps += 60 * Math.min(density * 0.4, 6) / 8;
  if (p.asc === 'berserkerLow' ) dps *= 1; // handled via hp check at call site
  return dps * critF;
}

// ---------- incoming damage model ----------
// i-frames cap intake at 2 hits/sec. Pressure grows with density; player
// speed & slows help dodge. ASSUMPTION: skill factor 0.45 (median player).
function incomingDps(p, g, density, wave) {
  const dodge = Math.min(0.85, Math.max(0.2, 0.4 + (p.speed - 60) / 250));
  const slowF = p.frost > 0 ? 1 - Math.min(0.25, 0.1 + p.frost * 0.05) : 1;
  const pressure = Math.min(1, density / 30) * g.curseSpeedFactor();
  const hitsPerSec = 2 * pressure * (1 - dodge) * slowF;
  let dmg = contactDmg(wave) * hitsPerSec;
  if (g.cultists > 0) dmg += 6 * g.cultists * 0.5;             // ranged chip
  let dr = p.dr;                                                // warrior innate
  if (p.asc === 'juggernaut') dr = 1 - (1 - dr) * 0.9;
  dmg *= (1 - dr) * (1 - p.armor);
  return dmg;
}

// ---------- strategies ----------
// priority list: first available offered card wins; 'random' picks randomly.
const STRATEGIES = {
  random:        null,
  dmg_stack:     ['glasscannon', 'bloodaltar', 'bloodrage', 'damage', 'atkspeed', 'health'],
  multishot_fan: ['multishot', 'darkpact', 'atkspeed', 'damage', 'homing', 'health'],
  shotgun_swarm: ['shotgun', 'homing', 'atkspeed', 'multishot', 'damage', 'health'],
  orb_tank:      ['shield', 'damage', 'health', 'regen', 'vampire', 'frost'],
  static_mage:   ['static', 'damage', 'atkspeed', 'frost', 'health', 'movespeed'],
  vamp_sustain:  ['vampire', 'atkspeed', 'multishot', 'movespeed', 'hastepact', 'damage'],
  pierce_rail:   ['pierce', 'damage', 'atkspeed', 'multishot', 'health', 'frost'],
  crit_build:    ['crit', 'atkspeed', 'projspeed', 'damage', 'multishot', 'health'],
  armor_tank:    ['armor', 'health', 'regen', 'damage', 'shield', 'vampire'],
};

// ---------- run simulation ----------
function makePlayer(cls) {
  const c = CLASSES[cls];
  return {
    cls, hp: c.hp, maxHp: c.hp, speed: c.speed, damage: c.damage,
    cooldown: c.cooldown, pierce: c.pierce, homingBase: c.homingBase,
    shotSpeed: c.shotSpeed, dr: c.dr,
    projectiles: 1, shotgun: 0, homing: 0, shield: 0, frost: 0, ricochet: 0,
    regen: 0, staticLvl: 0, vampire: 0, healMult: 1, xpMult: 1,
    seekerSwarm: 0, bladeOrbit: 0, railgun: 0, bulletstorm: 0,
    critChance: 0, projSize: 0, armor: 0, asc: null, taken: {},
  };
}

function offerCards(p, poolIds) {
  // evolution first if unlocked (mirrors triggerLevelUp)
  for (const [id, evo] of Object.entries(EVOS)) {
    if (p.taken[id]) continue;
    if (evo.needs.every(n => p.taken[n])) return [id];
  }
  const avail = poolIds.filter(id => {
    const c = POOL[id] || PROPOSED[id];
    return !(c.max && c.max(p));
  });
  const out = [];
  const bag = avail.slice();
  while (out.length < 3 && bag.length) out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  return out;
}

function pickCard(offered, prio, p, g) {
  let id;
  if (!prio) id = offered[Math.floor(Math.random() * offered.length)];
  else {
    id = offered.find(o => prio.includes(o) && EVOS[o] === undefined)
      ?? offered.find(o => EVOS[o]) ?? offered[0];
    // prefer evolutions always, then priority order
    const evo = offered.find(o => EVOS[o]);
    if (evo) id = evo;
    else {
      for (const want of prio) if (offered.includes(want)) { id = want; break; }
      if (!id) id = offered[0];
    }
  }
  const card = EVOS[id] || POOL[id] || PROPOSED[id];
  card.apply(p, g);
  p.taken[id] = (p.taken[id] || 0) + 1;
}

function ascFor(cls, prio) {
  // strategy-flavored ascendancy pick
  const map = {
    warrior: ['juggernaut', 'berserker'], rogue: ['phantom', 'assassin'],
    mage: ['frostmage', 'lightmage'], ranger: ['sniper', 'trapper'],
  };
  const [a, b] = map[cls];
  return Math.random() < 0.5 ? a : b;
}

function applyAsc(p, id) {
  p.asc = id;
  if (id === 'juggernaut') {/* dr handled in incoming */}
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
    if (t > 3600) break; // hour cap
    const bossWave = wave % 10 === 0;
    // spawns
    density += dt / spawnInterval(wave, g.spawnHaste, bossWave);
    density = Math.min(density, 200);
    // combat
    let dps = playerDps(p, density, wave);
    if (p.asc === 'berserker' && p.hp < p.maxHp * 0.5) dps *= 1.35;
    const eHp = avgEnemyHp(wave, g.curseHpMult);
    let killRate = density > 0.5 ? dps / eHp : 0;
    killRate = Math.min(killRate, density / dt * 0.9);
    if (bossWave && boss > 0) {
      // half the dps focuses the boss
      boss -= dps * 0.5 * dt;
      killRate *= 0.5;
      if (boss <= 0) {
        if (!p.asc) applyAsc(p, ascFor(cls, prio));
        else { level++; const off = offerCards(p, poolIds); pickCard(off, prio, p, g); }
        wave++; waveKills = 0;
        continue;
      }
    }
    const killed = killRate * dt;
    kills += killed; waveKills += killed;
    density = Math.max(0, density - killed);
    // xp + levels
    xp += killed * avgXpPerKill(wave) * p.xpMult;
    while (xp >= xpForNext(level) && level < 99) {
      xp -= xpForNext(level); level++;
      const off = offerCards(p, poolIds);
      pickCard(off, prio, p, g);
    }
    // player hp
    const inc = incomingDps(p, g, density, wave);
    const heal = p.vampire * p.healMult * killRate + p.regen * p.healMult;
    // potions: ~4% of kills drop, heal 25 (rough)
    const potions = killRate * 0.04 * 25 * p.healMult * 0.6;
    p.hp = Math.min(p.maxHp, p.hp + (heal + potions - inc) * dt);
    if (p.hp <= 0) break;
    // wave advance
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

const useProposed = process.argv.includes('--proposed');
const poolIds = Object.keys(POOL).concat(useProposed ? Object.keys(PROPOSED) : []);
const N = 300;

console.log(`KRYPTVAULT balance sim — pool: ${useProposed ? 'CURRENT + PROPOSED' : 'CURRENT'} (${poolIds.length} cards), ${N} runs/cell\n`);
console.log('class    strategy        p25   med   p75   max  (death wave; max 200 = immortal-capped)');
console.log('-'.repeat(88));

const cells = [];
for (const cls of Object.keys(CLASSES)) {
  for (const strat of Object.keys(STRATEGIES)) {
    if (!useProposed && (strat === 'crit_build' || strat === 'armor_tank')) continue;
    const waves = [];
    for (let i = 0; i < N; i++) waves.push(simulateRun(cls, strat, poolIds).wave);
    const q = quantiles(waves);
    cells.push({ cls, strat, ...q });
    console.log(
      cls.padEnd(8) + ' ' + strat.padEnd(14) +
      String(q.p25).padStart(6) + String(q.med).padStart(6) +
      String(q.p75).padStart(6) + String(q.max).padStart(6));
  }
  console.log('-'.repeat(88));
}

// card impact: for random strategy, correlate presence of each card with death wave
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
