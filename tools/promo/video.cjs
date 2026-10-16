// KRYPTVAULT 30s promo: drives the real game frame by frame at 1920x1080 / 60fps
// in Chromium, draws a cursor, captions, pixel wipes and the end card on top,
// pipes every frame into ffmpeg, then renders the game's own music + the sound
// effects that fired (at the frame they fired) offline and muxes them in.
// Needs ffmpeg on the PATH.
// usage: node video.cjs <index.html> <out.mp4> [--stills f1,f2,...]
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const SRC = process.argv[2], OUT = process.argv[3];
const stillsArg = process.argv.indexOf('--stills');
const STILLS = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;
const FPS = 60, S = 4, TOTAL = 30 * FPS;
// Text needs the real Press Start 2P. It loads from Google Fonts; with no network,
// set KV_FONT_DIR to a folder holding Google's ps2p.css and its .woff2 files.
const FONT = process.env.KV_FONT_DIR ? path.resolve(process.env.KV_FONT_DIR) + '/' : null;
const TMP = path.join(require('os').tmpdir(), 'kryptvault-promo');
fs.mkdirSync(TMP, { recursive: true });

// ---------- the game, with hooks and a sound-effect log ----------
let html = fs.readFileSync(SRC, 'utf8');
html = html.replace(/  function (play(?!UiTone)[A-Za-z]+)\(([^)]*)\) \{/g, (m, n) => m + `\n    if (window.__sfx) window.__sfx('${n}', Array.prototype.slice.call(arguments));`);
const cut = html.lastIndexOf('})();');
html = html.slice(0, cut) + `window.__kv = { game: game, runData: runData, startGame: startGame, beginWave: beginWave, spawnEnemyAt: spawnEnemyAt,
  enemyTypeForWave: enemyTypeForWave, applyUpgrade: applyUpgrade, applyAscendancy: applyAscendancy, ASCENDANCIES: ASCENDANCIES,
  triggerLevelUp: triggerLevelUp, upgradeById: upgradeById, castAbility: castAbility, killBoss: killBoss, keys: keys, xpForNext: xpForNext,
  setClass: function (id) { currentClass = id; }, buttons: function () { return uiButtons; }, music: music, scheduleMusic: scheduleMusic,
  setAudio: function (c, m) { audioCtx = c; masterGain = m; }, setMaster: function (m) { masterGain = m; },
  setMuted: function (m, s) { musicMuted = m; sfxMuted = s; }, boxHitsWall: boxHitsWall,
  sfx: { playShoot: playShoot, playHit: playHit, playLevelUp: playLevelUp, playPickup: playPickup, playUiMove: playUiMove, playUiSelect: playUiSelect, playBossDeath: playBossDeath } };\n` + html.slice(cut);

const LEADERBOARD = [
  ['ACE', '0001', 61, 15890, 'rogue'], ['NYX', '4410', 48, 9921, 'bombardier'], ['KAI', '2077', 39, 6204, 'ranger'],
  ['VEX', '1313', 33, 4471, 'mage'], ['ROX', '0808', 27, 2988, 'warrior'], ['ZED', '5150', 24, 2410, 'rogue'],
  ['ORB', '3141', 21, 1874, 'mage'], ['JIN', '9000', 19, 1502, 'ranger'], ['BEA', '1999', 17, 1288, 'warrior'], ['LUX', '6262', 15, 1010, 'bombardier']
].map(([name, disc, wave, kills, cls]) => ({ name, disc, wave, kills, cls }));

// ---------- in-page director ----------
const DIRECTOR = () => {
  var seed = 20261016 >>> 0;
  Math.random = function () { seed += 0x6D2B79F5; var t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.__rafCb = null;
  window.requestAnimationFrame = function (cb) { window.__rafCb = cb; return 1; };
  var now = 1000;
  window.__frame = 0;
  window.__sfxLog = [];
  window.__sfx = function (n, a) { window.__sfxLog.push({ n: n, a: a, f: window.__frame }); };
  window.__ctl = { bot: false, god: false, xp: null, bossFloor: null, freezeWave: false };
  function bot() {
    var g = __kv.game, p = g.player, k = __kv.keys;
    ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach(function (c) { k[c] = false; });
    if (!p || g.gameState !== 'playing') return;
    var fx = 0, fy = 0;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i], dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 95) { var w = (95 - d) / 95; fx -= dx / d * w * 1.4; fy -= dy / d * w * 1.4; }
    }
    var t = g.time, wx = 240 + Math.cos(t * 0.55) * 95, wy = 140 + Math.sin(t * 0.85) * 55;
    fx += (wx - p.x) / 110; fy += (wy - p.y) / 110;
    if (fx < -0.22) k.KeyA = true; else if (fx > 0.22) k.KeyD = true;
    if (fy < -0.22) k.KeyW = true; else if (fy > 0.22) k.KeyS = true;
  }
  window.__tick = function (f) {
    var c = window.__ctl, g = __kv.game, p = g.player;
    window.__frame = f;
    if (c.bot) bot();
    if (p && c.god && p.hp < p.maxHp * 0.55) p.hp = Math.round(p.maxHp * 0.86);
    if (c.god) g.damageFlash = 0;
    if (c.freezeWave) g.waveKills = 0;
    if (p && c.xp !== null) { g.xp = Math.max(0, Math.min(0.995, c.xp(f))) * __kv.xpForNext(); g.pendingLevelUps = 0; }
    if (g.boss && c.bossFloor) g.boss.hp = Math.max(g.boss.hp, c.bossFloor(f) * g.boss.maxHp);
    if (g.gameState === 'paused') g.gameState = 'playing'; // never let a stray blur pause the shoot
    var cb = window.__rafCb; window.__rafCb = null; now += 1000 / 60; cb(now);
  };
  // ----- overlay: cursor, click ring, captions, pixel wipe, end card -----
  window.__buildOverlay = function () {
  var css = document.createElement('style');
  css.textContent = [
    '#ov{position:fixed;inset:0;pointer-events:none;z-index:10;font-family:"Press Start 2P",monospace;image-rendering:pixelated}',
    '#cur{position:absolute;width:36px;height:57px;transform-origin:0 0}',
    '#ring{position:absolute;border:6px solid #FFD700;border-radius:50%;opacity:0;box-shadow:0 0 0 3px #000}',
    '#cap{position:absolute;left:64px;bottom:120px;padding:26px 34px 24px;background:#0e0e1b;border:6px solid #FFD700;box-shadow:12px 12px 0 rgba(0,0,0,.55),inset 0 0 0 6px #000;color:#fff;font-size:34px;letter-spacing:2px;white-space:nowrap;opacity:0}',
    '#cap b{color:#FFD700;font-weight:normal}',
    '#wipe{position:absolute;inset:0}',
    '#veil{position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(8,4,14,.55) 0%, rgba(4,2,8,.92) 75%);opacity:0}',
    '#end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:1}',
    '#logo{font-size:148px;color:#FFD700;letter-spacing:4px;text-shadow:12px 12px 0 #a00000,16px 16px 0 #000,0 0 60px rgba(255,170,0,.35);opacity:0}',
    '#cta{margin-top:70px;font-size:56px;color:#fff;text-shadow:6px 6px 0 #000;opacity:0;letter-spacing:2px}',
    '#badge{margin-top:46px;padding:22px 34px 18px;font-size:40px;color:#1a0b00;background:#FFD700;border:6px solid #000;box-shadow:10px 10px 0 #a00000,inset 0 -6px 0 #c9a227;opacity:0;letter-spacing:2px}',
    '#url{margin-top:44px;font-size:30px;color:#e8d9a8;text-shadow:4px 4px 0 #000;opacity:0;letter-spacing:2px}'
  ].join('\n');
  document.head.appendChild(css);
  var ov = document.createElement('div'); ov.id = 'ov';
  // pixel-art arrow, 12x19 cells at 3px
  var A = ['X...........', 'XX..........', 'XWX.........', 'XWWX........', 'XWWWX.......', 'XWWWWX......', 'XWWWWWX.....', 'XWWWWWWX....', 'XWWWWWWWX...', 'XWWWWWWWWX..',
           'XWWWWWWWWWX.', 'XWWWWWWXXXXX', 'XWWWXWWX....', 'XWWXXWWX....', 'XWX..XWWX...', 'XX...XWWX...', 'X.....XWWX..', '......XWWX..', '.......XX...'];
  var r = '';
  A.forEach(function (row, y) { for (var x = 0; x < row.length; x++) if (row[x] !== '.') r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + (row[x] === 'X' ? '#000' : '#fff') + '"/>'; });
  ov.innerHTML = '<svg id="cur" viewBox="0 0 12 19" shape-rendering="crispEdges">' + r + '</svg><div id="ring"></div><div id="cap"></div>' +
    '<canvas id="wipe" width="1920" height="1080"></canvas><div id="veil"></div><div id="end"><div id="logo">KRYPTVAULT</div><div id="cta">PLAY KRYPTVAULT NOW</div>' +
    '<div id="badge">UPDATE 1.2.1 LIVE!</div><div id="url">ODDSLICE.ITCH.IO</div></div>';
  document.body.appendChild(ov);
  var $ = function (id) { return document.getElementById(id); };
  var wctx = $('wipe').getContext('2d');
  window.__overlay = function (o) {
    var cur = $('cur');
    cur.style.display = o.cursor ? 'block' : 'none';
    if (o.cursor) { cur.style.left = o.cursor.x + 'px'; cur.style.top = o.cursor.y + 'px'; cur.style.transform = 'scale(' + (o.cursor.down ? 0.86 : 1) + ')'; cur.style.opacity = o.cursor.a == null ? 1 : o.cursor.a; }
    var ring = $('ring');
    if (o.ring) { var rr = 14 + o.ring.t * 60; ring.style.left = (o.ring.x - rr) + 'px'; ring.style.top = (o.ring.y - rr) + 'px'; ring.style.width = ring.style.height = (rr * 2) + 'px'; ring.style.opacity = 1 - o.ring.t; }
    else ring.style.opacity = 0;
    var cap = $('cap');
    if (o.cap) { cap.innerHTML = o.cap.html; cap.style.opacity = 1; cap.style.transform = 'translateX(' + (-(1 - o.cap.k) * 900) + 'px)'; }
    else cap.style.opacity = 0;
    wctx.clearRect(0, 0, 1920, 1080);
    if (o.wipe > 0) {
      var cell = 60, cols = 32, rows = 18;
      for (var cy = 0; cy < rows; cy++) for (var cx = 0; cx < cols; cx++) {
        var th = (cx + cy * 1.2) / (cols + rows * 1.2) + ((cx * 7 + cy * 13) % 5) * 0.012;
        if (o.wipe * 1.12 > th) { wctx.fillStyle = '#06040a'; wctx.fillRect(cx * cell, cy * cell, cell, cell); }
        else if (o.wipe * 1.12 > th - 0.04) { wctx.fillStyle = '#FFD700'; wctx.fillRect(cx * cell + 18, cy * cell + 18, 24, 24); }
      }
    }
    $('veil').style.opacity = o.veil || 0;
    var e = o.end || {};
    var logo = $('logo'); logo.style.opacity = e.logo == null ? 0 : Math.min(1, e.logo * 3); logo.style.transform = 'scale(' + (e.logoScale || 1) + ')';
    $('cta').style.opacity = e.cta || 0; $('cta').style.transform = 'translateY(' + ((1 - (e.cta || 0)) * 30) + 'px)';
    var b = $('badge'); b.style.opacity = e.badge ? 1 : 0; b.style.transform = 'scale(' + (e.badgeScale || 1) + ') rotate(-2deg)';
    $('url').style.opacity = e.url || 0;
  };
  };
};

// ---------- timeline helpers ----------
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.max(0, Math.min(1, t));

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('KRYPTVAULT') !== -1) console.log('FRAME ERROR', m.text()); });
  await page.addInitScript(DIRECTOR);
  await page.route(u => u.hostname === 'kv.test' && !u.pathname.startsWith('/api'), r => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: r.request().method() === 'GET' ? JSON.stringify(LEADERBOARD) : 'null' }));
  if (FONT) {
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(FONT + 'ps2p.css', 'utf8') }));
    await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(FONT + r.request().url().split('/').pop()) }));
  }
  await page.goto('http://kv.test/');
  await page.waitForFunction(() => window.__kv && window.__rafCb);
  await page.evaluate(() => document.fonts.load('8px "Press Start 2P"'));
  await page.evaluate(() => window.__buildOverlay());
  await page.evaluate(() => {
    var kv = __kv, d = kv.runData;
    kv.setMuted(true, true);
    d.name = 'YOU'; d.playerDisc = '0121'; d.playerSecret = 'AAAAAAAA'; d.playerId = 'promo';
    d.classesOwned = { ranger: true, bombardier: true }; d.coins = 2480; d.coinsEarned = 2480; d.coinsSpent = 0;
    d.shop = { vit: 2, mig: 2, swf: 1, wis: 1, frt: 0 }; d.equippedTomes = ['vit', 'mig'];
    kv.game.gameState = 'title';
  });
  for (let k = 0; k < 90; k++) await page.evaluate(() => __tick(0)); // settle: leaderboard loaded, critters wandering

  const cdp = await page.context().newCDPSession(page);
  let ff = null;
  if (!STILLS) {
    ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(TMP, 'video.mp4')]);
  }
  let f = 0;
  const ovState = { cursor: null, ring: null, cap: null, wipe: 0, veil: 0, end: null };
  const btn = id => page.evaluate(id => { var b = __kv.buttons().find(x => x.id === id); return b && { x: (b.x + b.w / 2) * 4, y: (b.y + b.h / 2) * 4 }; }, id);
  let curX = 1560, curY = 880, ringStart = -1, ringAt = null, cap = null;
  async function frame(extra) {
    if (extra) await extra();
    await page.evaluate(f => __tick(f), f);
    // overlay for this frame
    ovState.ring = ringStart >= 0 && f - ringStart < 18 ? { x: ringAt.x, y: ringAt.y, t: (f - ringStart) / 18 } : null;
    if (cap) {
      const t = f - cap.from, len = cap.to - cap.from;
      ovState.cap = t >= 0 && t < len ? { html: cap.html, k: ease(clamp01(Math.min(t / 14, (len - t) / 14))) } : null;
    } else ovState.cap = null;
    await page.evaluate(o => __overlay(o), ovState);
    if (STILLS) {
      if (STILLS.includes(f)) fs.writeFileSync(path.join(TMP, 'still-' + String(f).padStart(4, '0') + '.png'), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    } else {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
      if (!ff.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    }
    f++;
    if (f % 300 === 0) console.log('frame', f);
  }
  async function moveTo(x, y, frames) {
    const x0 = curX, y0 = curY;
    for (let k = 1; k <= frames; k++) {
      const t = ease(k / frames);
      curX = lerp(x0, x, t); curY = lerp(y0, y, t);
      ovState.cursor = { x: curX, y: curY };
      await page.mouse.move(curX, curY);
      await frame();
    }
  }
  async function click() {
    ovState.cursor = { x: curX, y: curY, down: true };
    await page.mouse.click(curX, curY);
    ringStart = f; ringAt = { x: curX, y: curY };
    await frame();
    ovState.cursor = { x: curX, y: curY };
  }
  async function hold(frames) { for (let k = 0; k < frames; k++) await frame(); }
  async function until(target, fn) { while (f < target) { if (fn) await fn(); await frame(); } }
  async function wipe(setup) {
    for (let k = 1; k <= 21; k++) { ovState.wipe = k / 21; await frame(); }
    await setup();
    for (let k = 20; k >= 0; k--) { ovState.wipe = k / 21; await frame(); }
  }
  const caption = (from, to, text) => { cap = { from, to, html: text }; };

  // ===== S1: title -> hero select -> start (0 - 6s) =====
  ovState.cursor = { x: curX, y: curY };
  await hold(18);
  let b = await btn('play');
  await moveTo(b.x - 40, b.y + 6, 46);
  await hold(10);
  await click();                                   // PLAY
  await hold(14);
  b = await btn('roster_ranger');
  await moveTo(b.x + 10, b.y + 8, 44);
  await hold(6);
  await click();                                   // Ranger's sheet
  await hold(18);
  b = await btn('start');
  await moveTo(b.x - 30, b.y + 6, 40);
  await hold(8);
  await click();                                   // START RUN -> wave 1 intro
  const runStart = f;
  await page.evaluate(() => { var g = __kv.game; g.player.xpMult = 0; __ctl.god = true; __ctl.bot = true; });
  for (let k = 0; k < 16; k++) { ovState.cursor = { x: curX, y: curY, a: 1 - k / 16 }; await frame(); }
  ovState.cursor = null;
  // more company than a real wave 1: a few already closing in, faster spawns
  await page.evaluate(() => { var kv = __kv, g = kv.game; g.spawnHaste = 4;
    for (var k = 0; k < 14; k++) { var a = k / 14 * Math.PI * 2; kv.spawnEnemyAt(k % 3 ? 'skeleton' : 'slime', 240 + Math.cos(a) * 230, 135 + Math.sin(a) * 150); } });

  // ===== S2: wave 1 + a level-up pick (to ~12.6s) =====
  const lvlAt = 560;
  await page.evaluate(([s, l]) => { __ctl.xp = function (f) { return (f - s) / (l - s); }; }, [runStart + 120, lvlAt]);
  await until(lvlAt);
  await page.evaluate(() => { var kv = __kv, g = kv.game; __ctl.xp = null; g.xp = 0; g.level++; kv.triggerLevelUp();
    g.cards[0].upgrade = kv.upgradeById('multishot'); g.cards[1].upgrade = kv.upgradeById('pierce'); g.cards[2].upgrade = kv.upgradeById('shield'); });
  caption(f + 2, f + 125, 'EVERY POWER <b>HAS A PRICE</b>');
  const card = await page.evaluate(() => { var c = __kv.game.cards[0]; return { x: (c.x + c.w / 2) * 4, y: (c.y + c.h * 0.62) * 4 }; });
  curX = 1180; curY = 900; ovState.cursor = { x: curX, y: curY, a: 0 };
  for (let k = 0; k < 8; k++) { ovState.cursor = { x: curX, y: curY, a: k / 8 }; await frame(); }
  await moveTo(card.x, card.y, 30);
  await hold(6);
  await click();                                   // take MULTI-SHOT
  await page.evaluate(([f]) => { __ctl.xp = function (x) { return 0.08 + (x - f) / 600; }; }, [f]);
  for (let k = 0; k < 14; k++) { ovState.cursor = { x: curX, y: curY, a: 1 - k / 14 }; await frame(); }
  ovState.cursor = null;
  await until(690);
  await page.evaluate(() => { __kv.game.waveKills = 0; __kv.beginWave(2); });
  await until(756);

  // ===== S3: the Warden in the Inferno (13.3 - 20s) =====
  let killAt = 1150;
  await wipe(async () => {
    await page.evaluate((killAt) => {
      var kv = __kv, g = kv.game; kv.setClass('mage'); kv.startGame();
      ['multishot', 'multishot', 'damage', 'damage', 'damage', 'atkspeed', 'atkspeed', 'homing', 'frost', 'crit'].forEach(function (id) { kv.applyUpgrade({ id: id }); });
      kv.applyAscendancy(kv.ASCENDANCIES.mage[0]);
      g.level = 38; g.score = 2412; g.coinsEarned = 3150; g.time = 1062;
      kv.beginWave(40); g.gameState = 'playing'; g.waveBanner = 0;
      var b = g.boss; b.x = 240; b.y = 70; b.entered = true; b.aiTimer = 0.4;
      var p = g.player; p.x = 240; p.y = 205; p.xpMult = 0;
      for (var k = 0; k < 10; k++) { var a = k / 10 * Math.PI * 2; kv.spawnEnemyAt(kv.enemyTypeForWave(40), 240 + Math.cos(a) * 200, 135 + Math.sin(a) * 120); }
      g.spawnHaste = 1.4;
      var f0 = window.__frame;
      __ctl.xp = function (f) { return 0.35 + (f - f0) / 900; };
      __ctl.bossFloor = function (f) { return Math.max(0.06, 1 - 0.94 * (f - f0) / (killAt - f0)); };
    }, killAt);
  });
  caption(f + 4, f + 130, 'BEAT THE <b>BOSSES</b>');
  await until(killAt);
  await page.evaluate(() => { var kv = __kv, g = kv.game, b = g.boss; __ctl.bossFloor = null;
    if (b) { kv.killBoss(g.enemies.indexOf(b), b); }
    g.gameState = 'playing'; g.cards = []; g.pendingLevelUps = 0; g.advanceAfterLevel = false; });
  await until(1200);

  // ===== S4: endgame Bombardier in the Vault (20.7 - 26.6s) =====
  const boomAt = 1440;
  await wipe(async () => {
    await page.evaluate(() => {
      var kv = __kv, g = kv.game; kv.setClass('bombardier'); kv.startGame();
      var picks = { multishot: 5, atkspeed: 4, damage: 6, pierce: 2, shield: 4, static: 3, crit: 3, movespeed: 2, health: 6 };
      Object.keys(picks).forEach(function (id) { for (var k = 0; k < picks[id]; k++) kv.applyUpgrade({ id: id }); });
      ['bladeorbit', 'bulletstorm'].forEach(function (id) { kv.applyUpgrade({ id: id }); });
      kv.applyAscendancy(kv.ASCENDANCIES.bombardier[1]);
      g.level = 64; g.score = 38452; g.coinsEarned = 52310; g.time = 1534;
      kv.beginWave(46); g.gameState = 'playing'; g.waveBanner = 0; __ctl.freezeWave = true;
      var p = g.player; p.x = 240; p.y = 140; p.xpMult = 0; p.maxHp = 690; p.hp = 640;
      for (var k = 0; k < 150; k++) {
        var x, y, n = 0;
        do { x = 12 + Math.random() * 456; y = 12 + Math.random() * 246; n++; } while ((Math.abs(x - 240) < 70 && Math.abs(y - 140) < 55 || kv.boxHitsWall(x, y, 14, 14)) && n < 40);
        kv.spawnEnemyAt(kv.enemyTypeForWave(46), x, y);
      }
      g.spawnHaste = 5;
      var f0 = window.__frame;
      __ctl.xp = function (f) { return 0.2 + (f - f0) / 500; };
    });
  });
  caption(f + 4, f + 140, 'HOW FAR <b>CAN YOU GO?</b>');
  await until(boomAt);
  await page.evaluate(() => { var p = __kv.game.player; p.abilityCd = 0; __kv.castAbility(); });  // DETONATE
  await until(1478);
  await page.evaluate(() => { var kv = __kv; for (var k = 0; k < 70; k++) { var a = Math.random() * Math.PI * 2; kv.spawnEnemyAt(kv.enemyTypeForWave(46), 240 + Math.cos(a) * 250, 135 + Math.sin(a) * 160); } });
  await until(1596);

  // ===== S5: end card over the fight (26.6 - 30s) =====
  const e0 = 1596;
  const endEv = [];
  while (f < TOTAL) {
    const t = f - e0;
    ovState.veil = clamp01(t / 24) * 0.97;
    const lt = (t - 10) / 12;
    const logoScale = lt < 0 ? 1.7 : (lt < 1 ? lerp(1.7, 0.94, ease(lt)) : (lt < 1.6 ? lerp(0.94, 1, (lt - 1) / 0.6) : 1));
    if (t === 16) endEv.push({ n: 'playBossDeath', a: [], f });
    if (t === 82) endEv.push({ n: 'playLevelUp', a: [], f });
    const bt = (t - 80) / 10;
    ovState.end = {
      logo: t >= 10 ? clamp01((t - 10) / 6) : null, logoScale,
      cta: clamp01((t - 46) / 16),
      badge: t >= 80, badgeScale: bt < 0 ? 0 : (bt < 1 ? lerp(0.3, 1.12, ease(bt)) : 1 + 0.04 * Math.sin((t - 90) / 7)),
      url: clamp01((t - 112) / 16)
    };
    await frame();
  }

  // ---------- audio ----------
  const sfxLog = (await page.evaluate(() => window.__sfxLog)).concat(endEv);
  if (STILLS) { console.log('stills written'); await browser.close(); return; }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log('video frames done; sfx events', sfxLog.length);
  const segments = [
    { track: 'lobby', t0: 0, t1: runStart / FPS + 0.2 },
    { track: 'combat0', t0: runStart / FPS, t1: 13.0 },
    { track: 'combat2', t0: 13.0, t1: 20.35 },
    { track: 'combat3', t0: 20.35, t1: 30 }
  ];
  const wav = await page.evaluate(async ({ segments, sfxLog }) => {
    var kv = __kv, SR = 48000, LEN = 30;
    var off = new OfflineAudioContext(2, SR * LEN, SR);
    var fake = 0;
    Object.defineProperty(off, 'currentTime', { get: function () { return fake; }, configurable: true });
    var master = off.createGain(); master.gain.value = 0.4; master.connect(off.destination);
    kv.setAudio(off, master); kv.setMuted(false, false);
    segments.forEach(function (s) {
      var g = off.createGain(); g.connect(master);
      g.gain.setValueAtTime(0, s.t0); g.gain.linearRampToValueAtTime(1, s.t0 + 0.12);
      var out = s.track === 'combat3' ? 28.6 : s.t1;
      g.gain.setValueAtTime(1, out); g.gain.linearRampToValueAtTime(0, Math.min(LEN, out + (s.track === 'combat3' ? 1.3 : 0.25)));
      kv.setMaster(g);
      kv.music.track = s.track; kv.music.step = 0; kv.music.nextTime = s.t0; kv.music.playing = true;
      for (fake = s.t0; fake < s.t1; fake += 0.1) kv.scheduleMusic();
    });
    var sg = off.createGain(); sg.gain.value = 0.75; sg.connect(master); kv.setMaster(sg);
    var shots = {};
    sfxLog.forEach(function (ev) {
      if (ev.n === 'playShoot') { var bucket = Math.floor(ev.f / 6); if (shots[bucket]) return; shots[bucket] = 1; } // one shot sound per 0.1s
      fake = ev.f / 60;
      if (kv.sfx[ev.n]) kv.sfx[ev.n].apply(null, ev.a || []);
    });
    var buf = await off.startRendering();
    var L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    var bytes = new Uint8Array(44 + n * 4), dv = new DataView(bytes.buffer);
    function str(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
    dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 4, true);
    for (var i = 0, o = 44; i < n; i++, o += 4) {
      dv.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(o + 2, Math.max(-1, Math.min(1, R[i])) * 32767, true);
    }
    var s = '', CH = 0x8000;
    for (var j = 0; j < bytes.length; j += CH) s += String.fromCharCode.apply(null, bytes.subarray(j, j + CH));
    return btoa(s);
  }, { segments, sfxLog });
  fs.writeFileSync(path.join(TMP, 'audio.wav'), Buffer.from(wav, 'base64'));
  await browser.close();
  const mux = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(TMP, 'video.mp4'), '-i', path.join(TMP, 'audio.wav'),
    '-c:v', 'copy', '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], { stdio: 'inherit' });
  console.log(mux.status === 0 ? 'wrote ' + OUT : 'mux failed');
})().catch(e => { console.error(e); process.exit(1); });
