// Freeze hunter: plays seeded random runs of the real game in real Chromium
// (real canvas, so canvas API errors count) and reports any exception that
// escapes a frame -- the exact thing that stops the rAF loop for good.
// usage: node fuzz.cjs <index.html> <firstSeed> <count> [maxFrames]
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const [file, seed0s, counts, maxFs] = process.argv.slice(2);
const seed0 = +seed0s || 1, count = +counts || 10, MAXF = +maxFs || 60000;
let html = fs.readFileSync(file, 'utf8');
const cut = html.lastIndexOf('})();');
html = html.slice(0, cut) +
  'window.__kv = { game: game, runData: runData, setClass: function (id) { currentClass = id; }, startGame: startGame, ' +
  'CLASSES: CLASSES, triggerLevelUp: triggerLevelUp, pickDraftCard: pickDraftCard, applyAscendancy: applyAscendancy, ASCENDANCIES: ASCENDANCIES, beginWave: beginWave, st: function () { var p = game.player || {}; return { s: game.gameState, wave: game.wave, lvl: game.level, cls: currentClass, asc: p.ascendancy && p.ascendancy.id, hp: p.hp, maxHp: p.maxHp, ups: p.upgradesTaken, en: (game.enemies || []).length, pr: (game.projectiles || []).length, boss: game.boss && game.boss.kind, parts: (game.particles || []).length, shots: (game.enemyShots || []).length, ft: (game.floatTexts || []).length }; } };\n' +
  html.slice(cut);

const BOT = `
(function () {
  var s = ${'__SEED__'} >>> 0;
  Math.random = function () { s += 0x6D2B79F5; var t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  var R = (function () { var q = (${'__SEED__'} * 7919 + 13) >>> 0; return function () { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; })();
  window.__errs = []; var ce = console.error; console.error = function () { window.__errs.push(Array.prototype.map.call(arguments, function (a) { return (a && a.stack) || String(a); }).join(' ')); ce.apply(console, arguments); };
  window.__rafCb = null;
  window.requestAnimationFrame = function (cb) { window.__rafCb = cb; return 1; };
  var now = 1000, frame = 0, held = [], nextMove = 0, pauseAt = -1, god = false, deaths = 0, maxDeaths = 3;
  function kd(code, rep) { window.dispatchEvent(new KeyboardEvent('keydown', { code: code, repeat: !!rep })); }
  function ku(code) { window.dispatchEvent(new KeyboardEvent('keyup', { code: code })); }
  function release() { for (var i = 0; i < held.length; i++) ku(held[i]); held = []; }
  var DIRS = [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyS', 'KeyA'], ['KeyS', 'KeyD'], []];
  function brain() {
    var kv = window.__kv, g = kv.game, st = g.gameState, p = g.player;
    if (st === 'playing') {
      if (god && p && p.hp < p.maxHp * 0.5) p.hp = p.maxHp;
      if (frame >= nextMove) {
        release();
        var d;
        if (R() < 0.6 && p && g.enemies.length) {
          // flee the crowd's centre of mass
          var cx = 0, cy = 0, n = 0;
          for (var i = 0; i < g.enemies.length; i++) { var e = g.enemies[i]; var dx = e.x - p.x, dy = e.y - p.y; if (dx * dx + dy * dy < 90 * 90) { cx += dx; cy += dy; n++; } }
          if (n) { d = []; if (cy > 0) d.push('KeyW'); else d.push('KeyS'); if (cx > 0) d.push('KeyA'); else d.push('KeyD'); }
        }
        if (!d) d = DIRS[Math.floor(R() * DIRS.length)];
        for (var k = 0; k < d.length; k++) { kd(d[k]); held.push(d[k]); }
        nextMove = frame + 10 + Math.floor(R() * 60);
      }
      if (R() < 0.02) kd('Space', R() < 0.3);
      if (R() < 0.0004) { release(); kd('Escape'); pauseAt = frame + 5 + Math.floor(R() * 60); }
    } else if (st === 'paused') {
      if (frame >= pauseAt) kd(R() < 0.5 ? 'Escape' : 'KeyP');
    } else if (st === 'levelup' || st === 'ascend') {
      release();
      if (!(g.draftLock > 0) && R() < 0.1) {
        var r = R();
        if (r < 0.7) kd('Digit' + (1 + Math.floor(R() * 3)));
        else if (r < 0.85) { kd('ArrowRight'); kd('Enter'); }
        else kd('Space');
      }
    } else if (st === 'gameover') {
      release();
      if (!(g.overLock > 0) && R() < 0.05) {
        deaths++;
        if (deaths >= maxDeaths) { window.__done = true; return; }
        kd('Enter'); // PLAY AGAIN is the default button
      }
    } else if (st === 'classselect') {
      if (R() < 0.05) kd('Enter');
    } else if (st === 'title') {
      if (R() < 0.05) kd('Enter');
    } else if (st === 'feedback' || st === 'nameentry') {
      if (R() < 0.05) kd('Escape');
    }
  }
  var stuck = 0; window.__peak = { en: 0, pr: 0, parts: 0, shots: 0, wave: 0 };
  window.__pump = function (n) {
    for (var i = 0; i < n && !window.__done; i++) {
      var L = window.__last = window.__kv.st();
      for (var pk in window.__peak) if (L[pk] > window.__peak[pk]) window.__peak[pk] = L[pk];
      stuck = (L.s === 'levelup' || L.s === 'ascend' || L.s === 'waveintro') ? stuck + 1 : 0;
      if (stuck > 1800) throw new Error('SOFTLOCK in ' + L.s + ' for 30s');
      brain();
      var cb = window.__rafCb; window.__rafCb = null;
      if (!cb) throw new Error('rAF not re-registered');
      now += 16.667; frame++;
      cb(now);
    }
    return frame;
  };
  window.__setup = function (opts) {
    god = !!opts.god; maxDeaths = opts.deaths || 3;
    var kv = window.__kv;
    kv.runData.name = 'BOT'; kv.runData.coins = 99999;
    for (var c = 0; c < kv.CLASSES.length; c++) { kv.runData.unlockedClasses = kv.runData.unlockedClasses || []; }
    kv.setClass(opts.cls);
    kv.startGame();
    if (opts.jump) {
      // a built late-game hero: real draft picks (caps + evolutions respected)
      var g = kv.game, picks = 10 + Math.floor(R() * 45);
      for (var k = 0; k < picks; k++) {
        g.gameState = 'playing'; g.pendingLevelUps = 0;
        kv.triggerLevelUp(); g.draftLock = 0;
        kv.pickDraftCard(Math.floor(R() * g.cards.length));
        g.level++;
      }
      var asc = kv.ASCENDANCIES[opts.cls];
      kv.applyAscendancy(asc[Math.floor(R() * asc.length)]);
      g.cards = []; g.pendingLevelUps = 0; g.advanceAfterLevel = false;
      kv.beginWave(opts.jump);
    }
    if (god) { var gp = kv.game.player; gp.maxHp *= 40; gp.hp = gp.maxHp; }
  };
})();
`;

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const classes = ['warrior', 'rogue', 'mage', 'ranger', 'bombardier'];
  let found = 0;
  for (let seed = seed0; seed < seed0 + count; seed++) {
    const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
    const page = await ctx.newPage();
    const asyncErrs = [];
    page.on('pageerror', e => asyncErrs.push(e.stack || e.message));
    await page.addInitScript(BOT.split('__SEED__').join(String(seed)));
    await page.route(u => u.hostname === 'kv.test' && !u.pathname.startsWith('/api'), r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: r.request().method() === 'GET' ? '[]' : 'null' }));
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.goto('http://kv.test/');
    await page.waitForFunction(() => window.__kv && window.__rafCb);
    const cls = classes[seed % classes.length], mode = process.argv[6] ? +process.argv[6] : Math.floor(seed / 5) % 4, god = mode % 2 === 1;
    const jump = mode >= 2 ? 8 + (seed * 37) % 58 : 0;
    await page.evaluate(o => __setup(o), { cls, god, jump, deaths: god ? 1 : 3 });
    const t0 = Date.now();
    let frames = 0, err = null, hung = false;
    while (frames < MAXF) {
      const step = page.evaluate(() => window.__done ? -1 : __pump(1200));
      const r = await Promise.race([step.then(v => ({ v }), e => ({ e })), new Promise(res => setTimeout(() => res({ hang: true }), 60000))]);
      if (r.hang) { hung = true; break; }
      if (r.e) { err = r.e; break; }
      if (r.v === -1) break;
      frames = r.v;
    }
    let last = null;
    if (!hung) last = await page.evaluate(() => window.__last).catch(() => null);
    const tag = `seed ${seed} ${cls}${god ? ' god' : ''}${jump ? ' jump' + jump : ''}`;
    const extra = hung ? null : await page.evaluate(() => ({ errs: window.__errs, peak: window.__peak })).catch(() => null);
    if (extra) for (const e of extra.errs) asyncErrs.push('console.error: ' + e);
    if (hung) { found++; console.log(`HANG  ${tag} after ~${frames} frames`); }
    else if (err) { found++; console.log(`CRASH ${tag} frame ~${frames}: ${err.message.split('\n')[0]}\n${(err.stack || '').split('\n').slice(0, 8).join('\n')}\n  state: ${JSON.stringify(last)}`); }
    else console.log(`ok    ${tag} frames ${frames} wave ${last && last.wave} lvl ${last && last.lvl} peak ${JSON.stringify(extra && extra.peak)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    for (const a of asyncErrs) { found++; console.log(`ASYNC ${tag}: ${a.split('\n').slice(0, 4).join(' | ')}`); }
    await ctx.close().catch(() => {});
    if (hung) { await browser.close().catch(() => {}); process.exit(2); }
  }
  console.log(`done: ${found} problem(s)`);
  await browser.close();
})();
