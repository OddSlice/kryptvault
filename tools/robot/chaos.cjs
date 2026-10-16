// Chaos robot: plays AND browses the real game in real Chromium the way odd
// players and bad networks do. Per seed it picks an input style (keyboard,
// touch, mouse), a network mood (fine / flaky / broken), save data (clean,
// corrupt, old-format, storage blocked) and keeps resizing the window.
// Reports: errors that escape or get caught, hangs, drafts that never close,
// menus Esc can't leave, game over you can't leave.
// usage: node chaos.cjs <index.html> <firstSeed> <count> [framesPerSeed]
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const [file, seed0s, counts, maxFs] = process.argv.slice(2);
const seed0 = +seed0s || 1, count = +counts || 10, MAXF = +maxFs || 30000;
let html = fs.readFileSync(file, 'utf8');
const cut = html.lastIndexOf('})();');
html = html.slice(0, cut) +
  'window.__kv = { game: game, runData: runData, buttons: function () { return uiButtons; }, hudPause: HUD_PAUSE, ' +
  'st: function () { var p = game.player || {}; return { s: game.gameState, wave: game.wave, lvl: game.level, hp: p.hp, en: (game.enemies || []).length, coins: runData.coins }; } };\n' +
  html.slice(cut);

const BOT = `
(function () {
  var SEED = __SEED__, INPUT = '__INPUT__';
  var s = SEED >>> 0;
  Math.random = function () { s += 0x6D2B79F5; var t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  var R = (function () { var q = (SEED * 7919 + 13) >>> 0; return function () { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; })();
  // save data variants, applied before the game script reads storage
  var STORE = '__STORE__';
  try {
    if (STORE === 'corrupt') { localStorage.setItem('kryptvault_save', '{"coins":12,"shop":'); localStorage.setItem('kryptvault_prefs', 'nope{'); }
    if (STORE === 'old') localStorage.setItem('kryptvault_save', JSON.stringify({ name: 'OLD', bestWave: 7, coins: 300 }));
    if (STORE === 'weird') localStorage.setItem('kryptvault_save', JSON.stringify({ name: 'AB', coins: 'lots', shop: null, classesOwned: 5, equippedTomes: 'x', skinsOwned: [], equippedSkins: null, bestWave: -3 }));
  } catch (e) {}
  if (STORE === 'blocked') {
    var boom = function () { throw new DOMException('blocked', 'SecurityError'); };
    Storage.prototype.getItem = boom; Storage.prototype.setItem = boom; Storage.prototype.removeItem = boom;
  }
  window.__errs = []; var ce = console.error; console.error = function () { window.__errs.push(Array.prototype.map.call(arguments, function (a) { return (a && a.stack) || String(a); }).join(' ')); ce.apply(console, arguments); };
  window.__rafCb = null;
  window.requestAnimationFrame = function (cb) { window.__rafCb = cb; return 1; };
  var now = 1000, frame = 0, held = [], nextMove = 0, pauseAt = -1;
  var canvas = null;
  function cv() { return canvas || (canvas = document.querySelector('canvas')); }
  function toClient(gx, gy) { var r = cv().getBoundingClientRect(); return { x: r.left + gx * r.width / 480, y: r.top + gy * r.height / 270 }; }
  function kd(code, rep) { window.dispatchEvent(new KeyboardEvent('keydown', { code: code, repeat: !!rep })); }
  function ku(code) { window.dispatchEvent(new KeyboardEvent('keyup', { code: code })); }
  function release() { for (var i = 0; i < held.length; i++) ku(held[i]); held = []; }
  var touchesDown = {};
  function touch(type, id, gx, gy) {
    var c = toClient(gx, gy);
    var t = new Touch({ identifier: id, target: cv(), clientX: c.x, clientY: c.y });
    if (type === 'touchstart' || type === 'touchmove') touchesDown[id] = t; else delete touchesDown[id];
    var live = Object.keys(touchesDown).map(function (k) { return touchesDown[k]; });
    cv().dispatchEvent(new TouchEvent(type, { touches: live, targetTouches: live, changedTouches: [t], cancelable: true, bubbles: true }));
  }
  function tap(gx, gy) { touch('touchstart', 50, gx, gy); touch('touchend', 50, gx, gy); }
  function click(gx, gy) { var c = toClient(gx, gy); cv().dispatchEvent(new MouseEvent('mousemove', { clientX: c.x, clientY: c.y, bubbles: true })); cv().dispatchEvent(new MouseEvent('click', { clientX: c.x, clientY: c.y, bubbles: true })); }
  function press(gx, gy) { if (INPUT === 'touch') tap(gx, gy); else click(gx, gy); }
  function pressButton(b) { press(b.x + b.w / 2, b.y + b.h / 2); }
  function findBtn(id) { var bs = window.__kv.buttons(); for (var i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i]; return null; }
  var stick = null;
  var DIRS = [['KeyW'], ['KeyS'], ['KeyA'], ['KeyD'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyS', 'KeyA'], ['KeyS', 'KeyD'], []];
  var menuFrames = 0, goPlay = false, escTries = 0, overFrames = 0, inStuck = 0, waitNet = 0, lastEscState = '';
  function fail(msg) { throw new Error(msg + ' | state ' + JSON.stringify(window.__kv.st())); }
  function steer() {
    var g = window.__kv.game, p = g.player;
    var ang = R() * Math.PI * 2;
    if (p && g.enemies.length && R() < 0.6) {
      var cx = 0, cy = 0;
      for (var i = 0; i < g.enemies.length; i++) { cx += g.enemies[i].x - p.x; cy += g.enemies[i].y - p.y; }
      ang = Math.atan2(-cy, -cx);
    }
    if (INPUT === 'touch') {
      var r = R();
      if (r < 0.05 && stick) { touch('touchcancel', 1, stick.x, stick.y); stick = null; return; }
      if (r < 0.15 && stick) { touch('touchend', 1, stick.x, stick.y); stick = null; return; }
      if (!stick) { stick = { x: 60 + R() * 120, y: 120 + R() * 120 }; touch('touchstart', 1, stick.x, stick.y); }
      touch('touchmove', 1, stick.x + Math.cos(ang) * 30, stick.y + Math.sin(ang) * 30);
    } else {
      release();
      var d = [];
      if (Math.sin(ang) < -0.4) d.push('KeyW'); else if (Math.sin(ang) > 0.4) d.push('KeyS');
      if (Math.cos(ang) < -0.4) d.push('KeyA'); else if (Math.cos(ang) > 0.4) d.push('KeyD');
      if (R() < 0.2) d = DIRS[Math.floor(R() * DIRS.length)];
      for (var k = 0; k < d.length; k++) { kd(d[k]); held.push(d[k]); }
    }
  }
  var MENU_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'Enter', 'Escape', 'Backspace', 'Digit1', 'Digit2', 'Digit3', 'KeyQ', 'KeyE', 'KeyI', 'KeyR', 'KeyT', 'KeyN', 'KeyM', 'KeyF', 'Space', 'KeyA', 'KeyB', 'Digit7'];
  function menuChaos() {
    var r = R(), bs = window.__kv.buttons();
    if (r < 0.45 && bs.length) pressButton(bs[Math.floor(R() * bs.length)]);
    else if (r < 0.8) kd(MENU_KEYS[Math.floor(R() * MENU_KEYS.length)], R() < 0.1);
    else press(R() * 480, R() * 270);
  }
  function brain() {
    var kv = window.__kv, g = kv.game, st = g.gameState;
    var inRun = st === 'playing' || st === 'levelup' || st === 'ascend' || st === 'waveintro' || st === 'paused';
    // drafts or wave intro that never end
    inStuck = (st === 'levelup' || st === 'ascend' || st === 'waveintro') ? inStuck + 1 : 0;
    if (inStuck > 2400) fail('SOFTLOCK in ' + st + ' for 40s');
    if (st === 'playing') {
      menuFrames = 0; goPlay = false; escTries = 0; waitNet = 0;
      if (frame >= nextMove) { steer(); nextMove = frame + 10 + Math.floor(R() * 50); }
      if (R() < 0.015) {
        if (INPUT === 'touch') tap(W0 - 20, H0 - 20); // thumb corner (ability)
        else kd('Space', R() < 0.3);
      }
      if (R() < 0.0005) {
        if (INPUT === 'touch' && kv.hudPause.w) tap(kv.hudPause.x + kv.hudPause.w / 2, kv.hudPause.y + kv.hudPause.h / 2);
        else { release(); kd('Escape'); }
        pauseAt = frame + 5 + Math.floor(R() * 90);
      }
      if (R() < 0.0003) now += 30000 + R() * 300000; // tab hidden for a while, then back
      return;
    }
    if (INPUT !== 'touch') release();
    if (st === 'paused') {
      if (frame >= pauseAt) {
        var r = R();
        if (r < 0.6) { var rb = findBtn('resume'); if (rb && INPUT !== 'key') pressButton(rb); else kd('Escape'); }
        else menuChaos();
        pauseAt = frame + 20;
      }
      return;
    }
    if (st === 'levelup' || st === 'ascend') {
      if (!(g.draftLock > 0) && R() < 0.08) {
        if (INPUT === 'key') kd(R() < 0.7 ? 'Digit' + (1 + Math.floor(R() * 3)) : (R() < 0.5 ? 'ArrowRight' : 'Enter'));
        else if (g.cards.length) { var c = g.cards[Math.floor(R() * g.cards.length)]; press(c.x + c.w / 2, c.y + c.h / 2); }
      } else if (R() < 0.01) menuChaos();
      return;
    }
    if (st === 'waveintro') return;
    if (st === 'gameover') {
      overFrames++;
      if (overFrames > 2400) fail('cannot leave game over for 40s');
      if (!(g.overLock > 0) && R() < 0.05) {
        var r2 = R();
        if (r2 < 0.4) { var ab = findBtn(R() < 0.6 ? 'again' : 'menu'); if (ab) pressButton(ab); }
        else if (r2 < 0.7) kd(R() < 0.5 ? 'Enter' : 'Escape');
        else menuChaos();
      }
      return;
    }
    overFrames = 0;
    // menus: wander for a while, then prove Esc gets home and start a run
    menuFrames++;
    if (!goPlay && menuFrames > 900 + Math.floor(R() * 900)) { goPlay = true; escTries = 0; }
    if (!goPlay) { if (R() < 0.08) menuChaos(); return; }
    if (frame % 15) return;
    if (st === 'nameentry') { var a = document.activeElement; if (a && a.tagName === 'INPUT') { a.value = 'BOT'; a.dispatchEvent(new Event('input', { bubbles: true })); } else { for (var ch = 0; ch < 3; ch++) kd('Key' + 'BOT'[ch]); } kd('Enter'); return; }
    if (st === 'title') { var pb = findBtn('play'); if (pb && R() < 0.5) pressButton(pb); else kd('Enter'); return; }
    if (st === 'classselect') { kd('Digit1'); return; }
    // the account screen wants CONTINUE (it shows the new vault key); while the
    // account is still being created there is nothing to press yet: wait
    if (st === 'accountinfo') { var cb2 = findBtn('continue'); if (cb2) pressButton(cb2); else { waitNet++; if (waitNet > 4000) fail('account creation never finished'); } return; }
    if (st === 'login' && kv.game && window.__kv) { /* Esc from login always works */ }
    if (st !== lastEscState) { lastEscState = st; escTries = 0; }
    escTries++;
    if (escTries > 12) fail('Esc / back cannot get from ' + st + ' to the title');
    var bk = findBtn('back');
    if (bk && R() < 0.5) pressButton(bk); else kd('Escape');
  }
  var W0 = 480, H0 = 270;
  window.__pump = function (n) {
    for (var i = 0; i < n; i++) {
      window.__last = window.__kv.st();
      brain();
      var cb = window.__rafCb; window.__rafCb = null;
      if (!cb) throw new Error('rAF not re-registered');
      now += 16.667; frame++;
      cb(now);
    }
    return frame;
  };
})();
`;

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const INPUTS = ['key', 'touch', 'mouse'], NETS = ['ok', 'flaky', 'broken'], STORES = ['clean', 'corrupt', 'old', 'weird', 'blocked', 'clean'];
  const SIZES = [[480, 270], [960, 540], [390, 844], [844, 390], [320, 180], [1366, 768], [700, 700]];
  let found = 0;
  for (let seed = seed0; seed < seed0 + count; seed++) {
    let q = (seed * 2654435761) >>> 0; const rnd = () => (q = (q * 1103515245 + 12345) >>> 0) / 4294967296;
    const input = INPUTS[seed % 3], net = NETS[Math.floor(seed / 3) % 3], store = STORES[Math.floor(seed / 9) % STORES.length];
    const ctx = await browser.newContext({ viewport: { width: 480, height: 270 }, hasTouch: input === 'touch' });
    const page = await ctx.newPage();
    const problems = [];
    page.on('pageerror', e => problems.push('PAGEERROR ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | ')));
    await page.addInitScript(BOT.split('__SEED__').join(String(seed)).split('__INPUT__').join(input).split('__STORE__').join(store));
    await page.route(u => u.hostname === 'kv.test' && !u.pathname.startsWith('/api'), r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.route('**/api/**', async r => {
      const req = r.request(), url = req.url(), get = req.method() === 'GET';
      const good = () => {
        if (get) return r.fulfill({ contentType: 'application/json', body: JSON.stringify([
          { name: 'ACE', disc: '0001', wave: 51, kills: 9000, cls: 'rogue' }, { name: 'BOT', disc: '1234', wave: 12, kills: 300, cls: 'mage' },
          { name: null, disc: null, wave: null, kills: null, cls: 'nonexistent' }, { name: 'WWWWWWWWWW', disc: '99999', wave: 1e9, kills: -5, cls: 'warrior' }]) });
        if (url.includes('register_player')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', disc: '4321', secret: 'ABCDEFGH' }) });
        if (url.includes('login_player')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify(rnd() < 0.5 ? null : { id: '00000000-0000-0000-0000-000000000001', progress: { coins: 50, shop: { vit: 2 }, classesOwned: { ranger: true }, skinsOwned: { nope: true }, equippedSkins: { warrior: 'missing_skin' }, equippedTomes: ['vit', 'zzz'] } }) });
        return r.fulfill({ status: get ? 200 : 201, contentType: 'application/json', body: 'null' });
      };
      if (net === 'ok') return good();
      const x = rnd();
      if (net === 'broken' || x < 0.5) {
        const y = rnd();
        if (y < 0.25) return r.abort('failed');
        if (y < 0.4) return; // never answers
        if (y < 0.6) return r.fulfill({ status: 500, contentType: 'text/html', body: '<html>500</html>' });
        if (y < 0.8) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"half' });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rnd() < 0.5 ? { error: 'x' } : 42) });
      }
      return good();
    });
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.goto('http://kv.test/');
    await page.waitForFunction(() => window.__kv && window.__rafCb).catch(e => problems.push('BOOT ' + e.message));
    const t0 = Date.now();
    let frames = 0, hung = false;
    while (frames < MAXF && !problems.some(p => p.startsWith('BOOT'))) {
      const step = page.evaluate(() => __pump(900));
      const r = await Promise.race([step.then(v => ({ v }), e => ({ e })), new Promise(res => setTimeout(() => res({ hang: true }), 60000))]);
      if (r.hang) { hung = true; break; }
      if (r.e) { problems.push('STOP ' + r.e.message.split('\n').slice(0, 6).join(' | ')); break; }
      frames = r.v;
      if (rnd() < 0.25) { const [w, h] = SIZES[Math.floor(rnd() * SIZES.length)]; await page.setViewportSize({ width: w, height: h }); }
    }
    const tag = `seed ${seed} ${input}/${net}/${store}`;
    if (hung) problems.push('HANG after ~' + frames + ' frames');
    else {
      const ex = await page.evaluate(() => ({ errs: window.__errs, last: window.__last })).catch(() => ({ errs: [], last: null }));
      for (const e of ex.errs) problems.push('LOGGED ' + e.split('\n').slice(0, 4).join(' | '));
      if (!problems.length) console.log(`ok    ${tag} frames ${frames} last ${JSON.stringify(ex.last)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    for (const p of problems) { found++; console.log(`PROBLEM ${tag}: ${p}`); }
    await ctx.close().catch(() => {});
    if (hung) { await browser.close().catch(() => {}); process.exit(2); }
  }
  console.log(`done: ${found} problem(s)`);
  await browser.close();
})();
