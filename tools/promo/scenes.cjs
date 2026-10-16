// Renders clean promo scenes straight from the game (world only, no HUD), plus
// transparent hero portraits. Seeded, so the same command gives the same picture.
// usage: node scenes.cjs <index.html> <outdir> [WxH] [scene-name]
//   node tools/promo/scenes.cjs index.html /tmp/kv/scenes
//   node tools/promo/scenes.cjs index.html /tmp/kv/scenes/og 1200x675 scene-keyart   (og.png's scene)
// A scene's picture depends on the scenes rendered before it in the same run, so
// the promo images were made one scene at a time: pass the scene name
// (or "portraits" for the hero portraits alone, "shots" for the itch.io
// screenshots: the full game frame with its HUD). Add "-wide" to a scene name
// (scene-keyart-wide) for the same scene showing the whole arena, unzoomed:
// the itch.io cover, banner and wide cover crop from those.
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');
const SRC = process.argv[2], OUT = process.argv[3];
const [VW, VH] = (process.argv[4] || '1920x1080').split('x').map(Number), ONLY = process.argv[5];
fs.mkdirSync(OUT, { recursive: true });
// Text needs the real Press Start 2P. It loads from Google Fonts; with no network,
// set KV_FONT_DIR to a folder holding Google's ps2p.css and its .woff2 files.
const FONT = process.env.KV_FONT_DIR ? path.resolve(process.env.KV_FONT_DIR) + '/' : null;
let html = fs.readFileSync(SRC, 'utf8');
html = html.replace('function drawEnemyHpBar(e) {', 'function drawEnemyHpBar(e) { if (window.__cleanBars && !e.elite && e.hp >= e.maxHp) return;');
const cut = html.lastIndexOf('})();');
html = html.slice(0, cut) + `window.__kv = { game: game, runData: runData, startGame: startGame, beginWave: beginWave, spawnEnemyAt: spawnEnemyAt,
  enemyTypeForWave: enemyTypeForWave, applyUpgrade: applyUpgrade, applyAscendancy: applyAscendancy, ASCENDANCIES: ASCENDANCIES, castAbility: castAbility,
  update: update, renderWorld: renderWorld, render: render, triggerLevelUp: triggerLevelUp, enterClassSelect: enterClassSelect, drawHeroIcon: drawHeroIcon, boxHitsWall: boxHitsWall, CLASSES: CLASSES, setMuted: function (m, s) { musicMuted = m; sfxMuted = s; },
  setClass: function (id) { currentClass = id; }, ctx: function () { return ctx; } };\n` + html.slice(cut);

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.addInitScript(() => {
    var s = 7357 >>> 0;
    Math.random = function () { s += 0x6D2B79F5; var t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    window.__rafCb = null; window.requestAnimationFrame = function (cb) { window.__rafCb = cb; return 1; };
  });
  await page.route(u => u.hostname === 'kv-test.vercel.app' && !u.pathname.startsWith('/api'), r => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  if (FONT) {
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(FONT + 'ps2p.css', 'utf8') }));
    await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(FONT + r.request().url().split('/').pop()) }));
  }
  await page.goto('https://kv-test.vercel.app/');
  await page.waitForFunction(() => window.__kv && window.__rafCb);
  await page.evaluate(() => document.fonts.load('8px "Press Start 2P"'));
  await page.evaluate(() => { __kv.setMuted(true, true); __kv.runData.name = 'YOU'; });

  // step the simulation (world only), then draw just the world at 1920x1080
  const WIDE = !!ONLY && ONLY.endsWith('-wide');
  const shoot = async (name, setup, steps, keep, view) => {
    if (ONLY && name !== ONLY && !(WIDE && name + '-wide' === ONLY)) return;
    view = WIDE ? { x: 0, y: 0, z: 1 } : (view || { x: 0, y: 0, z: 1 });
    if (WIDE) name += '-wide';
    await page.evaluate(({ setup, steps, keep, view }) => {
      var kv = __kv, g = kv.game;
      window.__cleanBars = true;
      (new Function('kv', 'g', setup))(kv, g);
      for (var k = 0; k < steps; k++) {
        g.spawnTimer = 999; g.hitStop = 0;
        var p = g.player; if (p) { p.hp = p.maxHp; p.invuln = 0; }
        kv.update(1 / 60);
        if (keep) (new Function('kv', 'g', keep))(kv, g);
      }
      g.gameState = 'paused'; g.shakeTimer = 0; g.damageFlash = 0; g.whiteFlash = 0; g.waveBanner = 0; g.endlessBanner = 0;
      g.floatTexts = [];
      g.enemies.forEach(function (e) { e.hitFlash = 0; e.slowT = 0; e.telegraph = 0; if (e.maxHp >= 1e8) e.hp = e.maxHp; });
      var c = kv.ctx(), cv = document.querySelector('canvas'), z = cv.width / 480 * view.z;
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
      c.setTransform(z, 0, 0, z, -view.x * z, -view.y * z);
      kv.renderWorld();
    }, { setup, steps, keep: keep || '', view });
    const data = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    console.log('scene', name);
  };
  const ring = (type, n, cx, cy, rx, ry, jitter) => `for (var k = 0; k < ${n}; k++) { var a = k / ${n} * Math.PI * 2 + Math.random() * ${jitter}; var rr = 0.75 + Math.random() * 0.5;
    var x = ${cx} + Math.cos(a) * ${rx} * rr, y = ${cy} + Math.sin(a) * ${ry} * rr; if (!kv.boxHitsWall(x, y, 14, 14) && x > 6 && x < 474 && y > 6 && y < 264) kv.spawnEnemyAt(${type}, x, y); }`;
  const build = (cls, picks, evos, asc) => `kv.setClass('${cls}'); kv.startGame();
    var picks = ${JSON.stringify(picks)}; Object.keys(picks).forEach(function (id) { for (var k = 0; k < picks[id]; k++) kv.applyUpgrade({ id: id }); });
    ${JSON.stringify(evos)}.forEach(function (id) { kv.applyUpgrade({ id: id }); }); kv.applyAscendancy(kv.ASCENDANCIES['${cls}'][${asc}]);`;

  const freeze = 'g.enemies.forEach(function (e) { if (!e.isBoss) { e.speed = 0; e.kx = e.ky = 0; } });';
  // A. key art: a Bombardier holding the Vault against a horde, the Keeper looming over it
  await shoot('scene-keyart', build('bombardier', { multishot: 4, atkspeed: 3, damage: 3, crit: 2 }, [], 1) + `
    kv.beginWave(50); g.gameState = 'playing';
    var b = g.boss; b.x = 240; b.y = 46; b.entered = true; b.aiTimer = 99; b.speed = 0;
    var p = g.player; p.x = 240; p.y = 92;
    for (var k = 0; k < 110; k++) { var a = Math.random() * Math.PI * 2, r = 26 + Math.random() * 62; var x = 240 + Math.cos(a) * r * 1.6, y = 92 + Math.sin(a) * r * 0.8;
      if (Math.abs(x - 240) < 32 && y < 70 || x > 266 && y < 66) continue; if (!kv.boxHitsWall(x, y, 14, 14)) kv.spawnEnemyAt(k % 4 ? kv.enemyTypeForWave(48) : 'skeleton', x, y); }
    ${freeze}`, 26, freeze + ' kv.game.enemies.forEach(function (e) { if (!e.isBoss && e.hp < e.maxHp * 0.35) e.hp = e.maxHp * 0.35; }); var b = kv.game.boss; if (b) { b.aiTimer = 99; b.speed = 0; }', { x: 120, y: 18, z: 2 });
  // B. the Vault Keeper unloads its ring at a Mage
  await shoot('scene-boss', build('mage', { multishot: 2, damage: 3, atkspeed: 2, homing: 2, pierce: 1, frost: 1 }, [], 0) + `
    kv.beginWave(50); g.gameState = 'playing';
    var b = g.boss; b.x = 280; b.y = 72; b.entered = true; b.aiTimer = 99; b.speed = 0; b.dashTimer = 0.02; b.dashVx = 0; b.dashVy = 0;
    var p = g.player; p.x = 196; p.y = 128; p.attackTimer = 0;
    for (var k = 0; k < 8; k++) { var a = k / 8 * Math.PI * 2; kv.spawnEnemyAt(kv.enemyTypeForWave(50), 240 + Math.cos(a) * 105, 85 + Math.sin(a) * 60); }
    ${freeze}`, 20, freeze + ' var b = kv.game.boss; if (b) { b.aiTimer = 99; b.speed = 0; }', { x: 96, y: 20, z: 2 });
  // C. endgame: a maxed Berserker Warrior, axes flying, the horde closing in from every side
  await shoot('scene-horde', build('warrior', { multishot: 5, atkspeed: 4, damage: 6, pierce: 3, static: 3, crit: 3 }, ['bulletstorm'], 1) + `
    kv.beginWave(46); g.gameState = 'playing';
    var p = g.player; p.x = 240; p.y = 136;
    for (var k = 0; k < 130; k++) { var x, y, n = 0; do { var a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 90; x = 240 + Math.cos(a) * r * 1.6; y = 136 + Math.sin(a) * r * 0.8; n++; } while ((x < 112 || x > 368 || y < 70 || y > 206 || kv.boxHitsWall(x, y, 14, 14)) && n < 80);
      if (n < 80) { var e = kv.spawnEnemyAt(kv.enemyTypeForWave(46), x, y); } }
    g.enemies.forEach(function (e) { e.maxHp = e.hp = 1e9; });
    window.__step = 0; ${freeze}`, 40, freeze + ` window.__step++; var p = kv.game.player; if (window.__step === 26) p.attackTimer = 0;
    if (window.__step === 40) kv.game.enemies.forEach(function (e) { e.maxHp = e.hp = 1e9; if (Math.random() < 0.07) { e.maxHp = 100; e.hp = 25 + Math.random() * 60; } });`, { x: 120, y: 68, z: 2 });
  // D. the Warden in the Inferno, winding up its charge at a Rogue (action sits right of centre: the update card puts text on the left)
  await shoot('scene-warden', build('rogue', { multishot: 3, atkspeed: 3, damage: 2, crit: 3 }, [], 1) + `
    kv.beginWave(40); g.gameState = 'playing';
    var b = g.boss; b.x = 252; b.y = 94; b.entered = true; b.aiTimer = 99; b.speed = 0; b.telegraph = 0.6;
    var p = g.player; p.x = 196; p.y = 150; p.attackTimer = 0;
    for (var k = 0; k < 40 && g.enemies.length < 24; k++) { var x = 168 + Math.random() * 122, y = 72 + Math.random() * 122;
      if (Math.hypot(x - p.x, y - p.y) < 24 || Math.hypot(x - b.x, y - b.y) < 34 || kv.boxHitsWall(x, y, 14, 14)) continue; kv.spawnEnemyAt(kv.enemyTypeForWave(40), x, y); }
    g.enemies.forEach(function (e) { if (!e.isBoss) e.maxHp = e.hp = 1e9; });
    ${freeze}`, 24, freeze + ' var b = kv.game.boss; if (b) { b.aiTimer = 99; b.speed = 0; if (b.telegraph <= 0.05) b.telegraph = 0.5; }', { x: 46, y: 60, z: 2 });
  // F. THE REVENANT throws its spiral at a Ranger in the Frost Depths
  await shoot('scene-frost', build('ranger', { multishot: 3, atkspeed: 3, damage: 3, pierce: 2, crit: 2 }, [], 0) + `
    kv.beginWave(30); g.gameState = 'playing';
    var b = g.boss; b.x = 282; b.y = 112; b.entered = true; b.aiTimer = 0; b.speed = 0; b.blinkTimer = 99; b.blinkPhase = 0;
    var p = g.player; p.x = 190; p.y = 150; p.attackTimer = 0;
    for (var k = 0; k < 14; k++) { var a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 40; kv.spawnEnemyAt(kv.enemyTypeForWave(30), 240 + Math.cos(a) * r * 1.6, 135 + Math.sin(a) * r * 0.75); }
    window.__step = 0; ${freeze}`, 50, freeze + ' var b = kv.game.boss; window.__step++; if (b) { b.speed = 0; b.blinkTimer = 99; b.aiTimer = (window.__step === 20 || window.__step === 40) ? 0 : 99; }', { x: 120, y: 58, z: 2 });

  // Real screenshots for the itch page: the whole game frame with its HUD,
  // monsters moving, damage numbers showing. "shots" renders all of them.
  const snap = async (name, setup, steps, after) => {
    if (ONLY !== name && ONLY !== 'shots') return;
    await page.evaluate(({ setup, steps, after }) => {
      var kv = __kv, g = kv.game;
      window.__cleanBars = false;
      (new Function('kv', 'g', setup))(kv, g);
      for (var k = 0; k < steps; k++) {
        g.spawnTimer = 999; g.hitStop = 0;
        var p = g.player; if (p) { p.hp = Math.max(p.hp, p.maxHp * 0.7); p.invuln = 0; }
        kv.update(1 / 60);
      }
      if (after) (new Function('kv', 'g', after))(kv, g);
      g.shakeTimer = 0; g.damageFlash = 0; g.whiteFlash = 0; g.waveBanner = 0; g.endlessBanner = 0;
      g.enemies.forEach(function (e) { e.hitFlash = 0; });
      kv.render();
    }, { setup, steps, after: after || '' });
    const data = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    console.log('shot', name);
  };
  const hud = (level, kills, coins, mins) => `g.level = ${level}; g.score = ${kills}; g.coinsEarned = ${coins}; g.time = ${mins * 60}; g.xp = 0;`;
  const around = (n, cx, cy, rmin, rmax, wave) => `for (var k = 0; k < ${n}; k++) { var a = Math.random() * Math.PI * 2, r = ${rmin} + Math.random() * ${rmax - rmin};
    var x = ${cx} + Math.cos(a) * r * 1.5, y = ${cy} + Math.sin(a) * r * 0.85; if (x > 20 && x < 460 && y > 20 && y < 250 && !kv.boxHitsWall(x, y, 14, 14)) kv.spawnEnemyAt(kv.enemyTypeForWave(${wave}), x, y); }`;
  await snap('shot-1-heroes', `kv.runData.classesOwned = { ranger: true, bombardier: true }; kv.runData.coins = 1840; kv.setClass('mage'); kv.enterClassSelect();`, 0);
  const early = build('rogue', { multishot: 2, atkspeed: 1, crit: 1 }, [], 0).replace(/kv\.applyAscendancy\([^;]*\);/, '') + `
    kv.beginWave(4); g.gameState = 'playing'; var p = g.player; p.x = 240; p.y = 140; p.attackTimer = 0; ${around(24, 240, 140, 70, 150, 4)} ${hud(7, 143, 96, 3.2)}`;
  const healthy = 'var p = g.player; p.hp = Math.round(p.maxHp * 0.8);';
  await snap('shot-2-catacombs', early, 20, healthy);
  await snap('shot-3-levelup', early, 20, healthy + ' kv.triggerLevelUp(); g.draftLock = 0; g.cardFocus = 1;');
  await snap('shot-4-warden', build('mage', { multishot: 2, damage: 3, atkspeed: 2, homing: 2, pierce: 1 }, [], 1) + `
    kv.beginWave(40); g.gameState = 'playing'; var b = g.boss; b.x = 300; b.y = 110; b.entered = true;
    var p = g.player; p.x = 170; p.y = 150; ${around(14, 240, 135, 70, 130, 40)} ${hud(46, 3120, 2650, 24.5)}`, 40, healthy);
  await snap('shot-5-horde', build('warrior', { multishot: 5, atkspeed: 4, damage: 6, pierce: 3, static: 3, crit: 3, shield: 2 }, ['bulletstorm'], 1) + `
    kv.beginWave(46); g.gameState = 'playing'; var p = g.player; p.x = 240; p.y = 140; ${around(110, 240, 140, 48, 150, 46)}
    g.enemies.forEach(function (e) { e.speed = 0; e.maxHp = e.hp = 1e9; }); ${hud(64, 5210, 4870, 31)}`, 30,
    healthy + ' g.enemies.forEach(function (e) { e.hp = e.maxHp; }); g.floatTexts = g.floatTexts.slice(-12);');
  await snap('shot-6-keeper', build('bombardier', { multishot: 4, atkspeed: 3, damage: 4, crit: 2, shield: 2 }, ['bladeorbit'], 1) + `
    kv.beginWave(50); g.gameState = 'playing'; var b = g.boss; b.x = 240; b.y = 80; b.entered = true;
    var p = g.player; p.x = 240; p.y = 170; ${around(20, 240, 140, 70, 130, 50)} ${hud(71, 6040, 5920, 35)}`, 70, healthy);

  // E. hero portraits, transparent, 64px game-size each
  if (!ONLY || ONLY === 'portraits') for (const c of await page.evaluate(() => __kv.CLASSES.map(c => c.id))) {
    const data = await page.evaluate(id => {
      var kv = __kv, c = kv.ctx(), cv = document.querySelector('canvas');
      c.setTransform(cv.width / 480, 0, 0, cv.height / 270, 0, 0); c.clearRect(0, 0, 480, 270);
      if (id === 'bombardier') kv.drawHeroIcon(id, 8, 16, 48); else kv.drawHeroIcon(id, 0, 0, 64);
      var o = document.createElement('canvas'); o.width = 256; o.height = 256;
      o.getContext('2d').drawImage(cv, 0, 0, 256, 256, 0, 0, 256, 256);
      return o.toDataURL('image/png');
    }, c);
    fs.writeFileSync(path.join(OUT, 'hero-' + c + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log('portraits done');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
