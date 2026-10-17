// KRYPTVAULT vertical videos for TikTok, Reels and Shorts: 1080x1920, 60fps,
// with the game's own music and sounds. Same approach as video.cjs: the real
// game, stepped frame by frame in Chromium. The world is drawn again on a tall
// canvas, zoomed in, with a camera that follows the hero; the game's own
// screens (the level-up cards) are cropped in from its normal 16:9 frame,
// which is kept at 1920x1080 so text stays sharp. Captions stay inside the
// area TikTok doesn't cover (its tabs on top, caption and buttons at the
// bottom and right). Needs ffmpeg on the PATH.
// usage: node tiktok.cjs <index.html> <outdir> [pov|bosses|heroes ...] [--stills f1,f2]
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const SRC = process.argv[2], OUTDIR = path.resolve(process.argv[3]);
const stillsArg = process.argv.indexOf('--stills');
const STILLS = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;
const WANT = process.argv.slice(4).filter((a, i, all) => a !== '--stills' && all[i - 1] !== '--stills');
const FPS = 60, VW = 1080, VH = 1920;
// Text needs the real Press Start 2P. It loads from Google Fonts; with no network,
// set KV_FONT_DIR to a folder holding Google's ps2p.css and its .woff2 files.
const FONT = process.env.KV_FONT_DIR ? path.resolve(process.env.KV_FONT_DIR) + '/' : null;
const TMP = path.join(require('os').tmpdir(), 'kryptvault-tiktok');
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUTDIR, { recursive: true });

// ---------- the game, with hooks and a sound-effect log ----------
let html = fs.readFileSync(SRC, 'utf8');
html = html.replace(/  function (play(?!UiTone)[A-Za-z]+)\(([^)]*)\) \{/g, (m, n) => m + `\n    if (window.__sfx) window.__sfx('${n}', Array.prototype.slice.call(arguments));`);
const cut = html.lastIndexOf('})();');
html = html.slice(0, cut) + `window.__kv = { game: game, runData: runData, startGame: startGame, beginWave: beginWave, spawnEnemyAt: spawnEnemyAt,
  enemyTypeForWave: enemyTypeForWave, applyUpgrade: applyUpgrade, applyAscendancy: applyAscendancy, ASCENDANCIES: ASCENDANCIES,
  triggerLevelUp: triggerLevelUp, pickCard: pickCard, upgradeById: upgradeById, castAbility: castAbility, killBoss: killBoss, keys: keys,
  xpForNext: xpForNext, renderWorld: renderWorld, getCtx: function () { return ctx; }, setCtx: function (c) { ctx = c; },
  setClass: function (id) { currentClass = id; }, music: music, scheduleMusic: scheduleMusic,
  setAudio: function (c, m) { audioCtx = c; masterGain = m; }, setMaster: function (m) { masterGain = m; },
  setMuted: function (m, s) { musicMuted = m; sfxMuted = s; }, boxHitsWall: boxHitsWall,
  sfx: { playShoot: playShoot, playHit: playHit, playLevelUp: playLevelUp, playPickup: playPickup, playUiMove: playUiMove, playUiSelect: playUiSelect, playBossDeath: playBossDeath } };\n` + html.slice(cut);

// ---------- in-page director ----------
const DIRECTOR = () => {
  var seed = 20261017 >>> 0;
  Math.random = function () { seed += 0x6D2B79F5; var t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.__rafCb = null;
  window.requestAnimationFrame = function (cb) { window.__rafCb = cb; return 1; };
  var now = 1000;
  window.__frame = 0;
  window.__sfxLog = [];
  window.__sfx = function (n, a) { window.__sfxLog.push({ n: n, a: a, f: window.__frame }); };
  // bot: keeps away from monsters while drifting around a point the camera likes
  window.__ctl = { bot: false, god: false, xp: null, bossFloor: null, freezeWave: false, wander: { x: 240, y: 150, ax: 60, ay: 40 } };
  function bot() {
    var g = __kv.game, p = g.player, k = __kv.keys, w = window.__ctl.wander;
    ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach(function (c) { k[c] = false; });
    if (!p || g.gameState !== 'playing') return;
    var fx = 0, fy = 0;
    for (var i = 0; i < g.enemies.length; i++) {
      var e = g.enemies[i], dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 70) { var wt = (70 - d) / 70; fx -= dx / d * wt * 1.4; fy -= dy / d * wt * 1.4; }
    }
    var t = g.time, wx = w.x + Math.cos(t * 0.7) * w.ax, wy = w.y + Math.sin(t * 1.1) * w.ay;
    fx += (wx - p.x) / 60; fy += (wy - p.y) / 60;
    if (fx < -0.22) k.KeyA = true; else if (fx > 0.22) k.KeyD = true;
    if (fy < -0.22) k.KeyW = true; else if (fy > 0.22) k.KeyS = true;
  }
  window.__tick = function (f) {
    var c = window.__ctl, g = __kv.game, p = g.player;
    window.__frame = f;
    if (c.bot) bot();
    if (p && c.god && p.hp < p.maxHp * 0.6) p.hp = Math.round(p.maxHp * 0.9);
    if (c.god) g.damageFlash = 0;
    if (c.freezeWave) g.waveKills = 0;
    if (p && c.xp !== null) { g.xp = Math.max(0, Math.min(0.995, c.xp(f))) * __kv.xpForNext(); g.pendingLevelUps = 0; }
    if (g.boss && c.bossFloor) g.boss.hp = Math.max(g.boss.hp, c.bossFloor(f) * g.boss.maxHp);
    if (g.gameState === 'paused') g.gameState = 'playing';
    var cb = window.__rafCb; window.__rafCb = null; now += 1000 / 60; cb(now);
  };

  // ----- the tall picture: the world through a camera, plus cropped game screens -----
  var cam = { x: 0, y: 0, ready: false };
  window.__compose = function (v) {
    var kv = __kv, g = kv.game, vc = document.getElementById('vc'), x = vc.getContext('2d'), gc = document.getElementById('game');
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#06040a'; x.fillRect(0, 0, 1080, 1920);
    var s = v.s || 6, vw = 1080 / s, vh = 1920 / s, p = g.player;
    var fx = p ? p.x : 240, fy = p ? p.y : 135;
    if (v.focus === 'mid' && g.boss && p) { fx = (p.x + g.boss.x) / 2; fy = (p.y + g.boss.y) / 2; }
    var tx = Math.max(0, Math.min(480 - vw, fx - vw / 2));
    var ty = vh >= 270 ? 0 : Math.max(0, Math.min(270 - vh, fy - vh / 2));
    if (!cam.ready || v.snap) { cam.x = tx; cam.y = ty; cam.ready = true; }
    else { cam.x += (tx - cam.x) * 0.1; cam.y += (ty - cam.y) * 0.1; }
    // when the whole arena height fits, it sits a little above centre, clear of TikTok's bottom bar
    var oy = vh >= 270 ? Math.round((1920 - 270 * s) / 2) - 40 : 0;
    x.imageSmoothingEnabled = false;
    x.setTransform(s, 0, 0, s, -Math.round(cam.x * s), -Math.round(cam.y * s) + oy);
    var old = kv.getCtx(); kv.setCtx(x);
    try { kv.renderWorld(); } finally { kv.setCtx(old); }
    // (the game's own white flash, on every bomb pickup, would strobe in a big
    // horde; the director flashes on the big moments instead)
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (v.cards && g.cards && g.cards.length) {
      // the game's own level-up screen, from its 1920x1080 frame
      var c0 = g.cards[0], cN = g.cards[g.cards.length - 1];
      var sx = c0.x - 8, sw = cN.x + cN.w + 8 - sx, sy = 4, sh = c0.y + c0.h + 8 - sy;
      x.fillStyle = 'rgba(6,4,10,0.7)'; x.fillRect(0, 0, 1080, 1920);
      var dw = 1032, dh = dw * sh / sw, dx = 24, dy = v.cardsY || 600;
      x.fillStyle = '#000'; x.fillRect(dx - 8, dy - 8, dw + 16, dh + 16);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(gc, sx * 4, sy * 4, sw * 4, sh * 4, dx, dy, dw, dh);
      window.__cardRect = { sx: sx, sy: sy, k: dw / sw, dx: dx, dy: dy };
    }
  };

  // ----- overlay: captions, stamps, tap ripple, pixel wipe, flash, end card -----
  window.__buildOverlay = function () {
    var css = document.createElement('style');
    var outline = [];
    for (var a = 0; a < 16; a++) outline.push((Math.cos(a / 8 * Math.PI) * 6).toFixed(1) + 'px ' + (Math.sin(a / 8 * Math.PI) * 6).toFixed(1) + 'px 0 #000');
    outline.push('8px 10px 0 #000');
    css.textContent = [
      'html,body{margin:0;background:#06040a;overflow:hidden}',
      '#game{position:fixed;left:0;top:0;opacity:0}',
      '#vc{position:fixed;left:0;top:0;width:1080px;height:1920px;z-index:5}',
      '#ov{position:fixed;inset:0;pointer-events:none;z-index:10;font-family:"Press Start 2P",monospace}',
      '#hook{position:absolute;left:40px;right:40px;top:250px;text-align:center;color:#fff;font-size:54px;line-height:1.35;letter-spacing:2px;text-shadow:' + outline.join(',') + ';opacity:0}',
      '#hook b{color:#FFD700;font-weight:normal}',
      '#stamp{position:absolute;left:0;right:0;top:1150px;text-align:center;opacity:0}',
      '#stampT{display:inline-block;color:#FFD700;letter-spacing:3px;text-shadow:6px 6px 0 #a00000,9px 9px 0 #000,' + outline.join(',') + '}',
      '#stampS{margin-top:26px;color:#fff;font-size:32px;letter-spacing:2px;text-shadow:' + outline.join(',') + '}',
      '#tap{position:absolute;border-radius:50%;border:8px solid #fff;box-shadow:0 0 0 4px #000, inset 0 0 0 4px #000;opacity:0}',
      '#tapDot{position:absolute;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:0 0 0 4px #000;opacity:0}',
      '#wipe{position:absolute;inset:0}',
      '#flash{position:absolute;inset:0;background:#fff;opacity:0}',
      '#veil{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, rgba(8,4,14,.6) 0%, rgba(4,2,8,.94) 70%);opacity:0}',
      '#end{position:absolute;left:0;right:0;top:470px;display:flex;flex-direction:column;align-items:center}',
      '#logo{font-size:96px;color:#FFD700;letter-spacing:2px;text-shadow:8px 8px 0 #a00000,11px 11px 0 #000,0 0 50px rgba(255,170,0,.35);opacity:0}',
      '#tag{margin-top:46px;font-size:34px;color:#fff;text-shadow:5px 5px 0 #000;opacity:0;letter-spacing:2px}',
      '#badge{margin-top:60px;padding:22px 30px 18px;font-size:38px;color:#1a0b00;background:#FFD700;border:6px solid #000;box-shadow:10px 10px 0 #a00000,inset 0 -6px 0 #c9a227;opacity:0;letter-spacing:2px}',
      '#cta{margin-top:70px;font-size:44px;color:#fff;text-shadow:' + outline.join(',') + ';opacity:0;letter-spacing:2px}',
      '#url{margin-top:34px;font-size:46px;color:#FFD700;text-shadow:' + outline.join(',') + ';opacity:0;letter-spacing:2px}',
      '#bio{margin-top:40px;font-size:30px;color:#e8d9a8;text-shadow:4px 4px 0 #000;opacity:0;letter-spacing:2px}'
    ].join('\n');
    document.head.appendChild(css);
    var vc = document.createElement('canvas'); vc.id = 'vc'; vc.width = 1080; vc.height = 1920; document.body.appendChild(vc);
    var ov = document.createElement('div'); ov.id = 'ov';
    ov.innerHTML = '<div id="hook"></div><div id="stamp"><div id="stampT"></div><div id="stampS"></div></div><div id="tap"></div><div id="tapDot"></div>' +
      '<canvas id="wipe" width="1080" height="1920"></canvas><div id="flash"></div><div id="veil"></div>' +
      '<div id="end"><div id="logo">KRYPTVAULT</div><div id="tag">FREE IN YOUR BROWSER</div><div id="badge">UPDATE 1.2.1 LIVE!</div>' +
      '<div id="cta"></div><div id="url">ODDSLICE.ITCH.IO</div><div id="bio">LINK IN BIO</div></div>';
    document.body.appendChild(ov);
    // the game's canvas stays at 1920x1080 (4x) for crisp crops; it's drawn on, never shown
    var gc = document.getElementById('game'); gc.width = 1920; gc.height = 1080;
    var $ = function (id) { return document.getElementById(id); };
    var wctx = $('wipe').getContext('2d');
    window.__overlay = function (o) {
      var h = $('hook');
      if (o.hook) { h.innerHTML = o.hook.html; h.style.opacity = o.hook.k; h.style.transform = 'translateY(' + (-(1 - o.hook.k) * 60) + 'px) scale(' + (0.9 + 0.1 * o.hook.k) + ')'; }
      else h.style.opacity = 0;
      var st = $('stamp');
      if (o.stamp) {
        var T = $('stampT'); T.textContent = o.stamp.text; T.style.fontSize = Math.min(84, Math.floor(980 / o.stamp.text.length)) + 'px';
        $('stampS').textContent = o.stamp.sub || ''; st.style.top = (o.stamp.top || 1150) + 'px'; st.style.opacity = o.stamp.a; st.style.transform = 'scale(' + o.stamp.scale + ')';
      } else st.style.opacity = 0;
      var tap = $('tap'), dot = $('tapDot');
      if (o.tap) {
        var r = 30 + o.tap.t * 90; tap.style.left = (o.tap.x - r) + 'px'; tap.style.top = (o.tap.y - r) + 'px'; tap.style.width = tap.style.height = (r * 2) + 'px'; tap.style.opacity = 1 - o.tap.t;
        dot.style.left = (o.tap.x - 22) + 'px'; dot.style.top = (o.tap.y - 22) + 'px'; dot.style.opacity = o.tap.t < 0.5 ? 1 : 0;
      } else { tap.style.opacity = 0; dot.style.opacity = 0; }
      wctx.clearRect(0, 0, 1080, 1920);
      if (o.wipe > 0) {
        var cell = 90, cols = 12, rows = 22;
        for (var cy = 0; cy < rows; cy++) for (var cx = 0; cx < cols; cx++) {
          var th = (cy + cx * 0.6) / (rows + cols * 0.6) + ((cx * 7 + cy * 13) % 5) * 0.012;
          if (o.wipe * 1.12 > th) { wctx.fillStyle = '#06040a'; wctx.fillRect(cx * cell, cy * cell, cell, cell); }
          else if (o.wipe * 1.12 > th - 0.04) { wctx.fillStyle = '#FFD700'; wctx.fillRect(cx * cell + 27, cy * cell + 27, 36, 36); }
        }
      }
      $('flash').style.opacity = o.flash || 0;
      $('veil').style.opacity = o.veil || 0;
      var e = o.end || {};
      var logo = $('logo'); logo.style.opacity = e.logo == null ? 0 : Math.min(1, e.logo * 3); logo.style.transform = 'scale(' + (e.logoScale || 1) + ')';
      $('tag').style.opacity = e.tag || 0;
      var b = $('badge'); b.style.opacity = e.badge ? 1 : 0; b.style.transform = 'scale(' + (e.badgeScale || 1) + ') rotate(-2deg)';
      var c = $('cta'); c.textContent = e.ctaText || ''; c.style.opacity = e.cta || 0; c.style.transform = 'translateY(' + ((1 - (e.cta || 0)) * 30) + 'px)';
      $('url').style.opacity = e.url || 0;
      $('bio').style.opacity = e.bio || 0;
    };
  };
};

// ---------- timeline helpers ----------
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.max(0, Math.min(1, t));
const sec = s => Math.round(s * FPS);

async function record(name, LEN, music, direct) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: VW, height: VH } })).newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error' && m.text().indexOf('KRYPTVAULT') !== -1) console.log('FRAME ERROR', m.text()); });
  await page.addInitScript(DIRECTOR);
  await page.route(u => u.hostname === 'kv-test.vercel.app' && !u.pathname.startsWith('/api'), r => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: r.request().method() === 'GET' ? '[]' : 'null' }));
  if (FONT) {
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(FONT + 'ps2p.css', 'utf8') }));
    await page.route('https://fonts.gstatic.com/**', r => r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(FONT + r.request().url().split('/').pop()) }));
  }
  await page.goto('https://kv-test.vercel.app/');
  await page.waitForFunction(() => window.__kv && window.__rafCb);
  await page.evaluate(() => document.fonts.load('8px "Press Start 2P"'));
  await page.evaluate(() => window.__buildOverlay());
  await page.evaluate(() => {
    var kv = __kv, d = kv.runData;
    kv.setMuted(true, true);
    d.name = 'YOU'; d.classesOwned = { ranger: true, bombardier: true };
  });
  const cdp = await page.context().newCDPSession(page);
  const vfile = path.join(TMP, name + '-video.mp4');
  const ff = STILLS ? null : spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', vfile]);

  // what the director controls; frame() turns it into one picture
  const st = { f: 0, view: { s: 6 }, hook: null, stamp: null, tap: null, wipe: 0, flash: 0, veil: 0, end: null, extraSfx: [] };
  async function frame() {
    const f = st.f;
    const ov = { wipe: st.wipe, flash: st.flash, veil: st.veil, end: st.end };
    if (st.hook) { const t = f - st.hook.from, len = st.hook.to - st.hook.from; ov.hook = t >= 0 && t < len ? { html: st.hook.html, k: ease(clamp01(Math.min(t / 10, (len - t) / 10))) } : null; }
    if (st.stamp) {
      const t = f - st.stamp.from, len = st.stamp.to - st.stamp.from;
      if (t >= 0 && t < len) { const pop = clamp01(t / 9); ov.stamp = { text: st.stamp.text, sub: st.stamp.sub, top: st.stamp.top, a: clamp01(Math.min(t / 4, (len - t) / 8)), scale: pop < 1 ? lerp(1.8, 1, ease(pop)) : 1 }; }
    }
    if (st.tap) { const t = (f - st.tap.from) / 20; ov.tap = t >= 0 && t < 1 ? { x: st.tap.x, y: st.tap.y, t } : null; }
    await page.evaluate(({ f, view, ov }) => { __tick(f); __compose(view); __overlay(ov); }, { f, view: st.view, ov });
    st.view.snap = false;
    if (STILLS) {
      if (STILLS.includes(f)) fs.writeFileSync(path.join(OUTDIR, name + '-still-' + String(f).padStart(4, '0') + '.png'), Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    } else {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
      if (!ff.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    }
    st.f++;
    if (st.f % 300 === 0) console.log(name, 'frame', st.f);
  }
  const api = {
    st, page, sec,
    eval: (fn, arg) => page.evaluate(fn, arg),
    hold: async n => { for (let k = 0; k < n; k++) await frame(); },
    until: async target => { while (st.f < target) await frame(); },
    hook: (html, from, to) => { st.hook = { html, from, to }; },
    stamp: (text, sub, from, to, top) => { st.stamp = { text, sub, from, to, top }; },
    sfx: n => st.extraSfx.push({ n, a: [], f: st.f }),
    // quick pixel wipe; the next scene is set up while the screen is covered
    wipe: async setup => {
      for (let k = 1; k <= 10; k++) { st.wipe = k / 10; await frame(); }
      await setup(); st.view.snap = true;
      for (let k = 9; k >= 0; k--) { st.wipe = k / 10; await frame(); }
    },
    flash: async n => { for (let k = n; k > 0; k--) { st.flash = 0.85 * k / n; await frame(); } st.flash = 0; },
    // a finger tap on level-up card i (in the cropped card view)
    tapCard: async i => {
      const pos = await page.evaluate(i => { var c = __kv.game.cards[i], r = window.__cardRect; return { x: r.dx + (c.x + c.w / 2 - r.sx) * r.k, y: r.dy + (c.y + c.h * 0.55 - r.sy) * r.k }; }, i);
      st.tap = { x: pos.x, y: pos.y, from: st.f };
      await api.hold(8); api.sfx('playUiSelect');
      await page.evaluate(i => __kv.pickCard(i), i);
    },
    endCard: async (ctaText, n) => {
      const e0 = st.f;
      st.hook = null; st.stamp = null;
      while (st.f < e0 + n) {
        const t = st.f - e0;
        st.veil = clamp01(t / 18) * 0.96;
        const lt = (t - 6) / 12;
        const logoScale = lt < 0 ? 1.8 : (lt < 1 ? lerp(1.8, 0.94, ease(lt)) : (lt < 1.6 ? lerp(0.94, 1, (lt - 1) / 0.6) : 1));
        if (t === 12) api.sfx('playBossDeath');
        if (t === 56) api.sfx('playLevelUp');
        const bt = (t - 54) / 10;
        st.end = {
          logo: t >= 6 ? clamp01((t - 6) / 6) : null, logoScale,
          tag: clamp01((t - 30) / 14),
          badge: t >= 54, badgeScale: bt < 0 ? 0 : (bt < 1 ? lerp(0.3, 1.12, ease(bt)) : 1 + 0.04 * Math.sin((t - 64) / 7)),
          ctaText, cta: clamp01((t - 80) / 14),
          url: clamp01((t - 100) / 14),
          bio: t < 116 ? 0 : (0.55 + 0.45 * Math.sin((t - 116) / 6))
        };
        await frame();
      }
    }
  };

  await direct(api);
  while (st.f < LEN * FPS) await api.hold(1);

  // ---------- audio: the game's music for each section plus every sound that fired ----------
  const sfxLog = (await page.evaluate(() => window.__sfxLog)).concat(st.extraSfx);
  if (STILLS) { console.log(name, 'stills written'); await browser.close(); return; }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  const wav = await page.evaluate(async ({ music, sfxLog, LEN }) => {
    var kv = __kv, SR = 48000;
    var off = new OfflineAudioContext(2, SR * LEN, SR);
    var fake = 0;
    Object.defineProperty(off, 'currentTime', { get: function () { return fake; }, configurable: true });
    var master = off.createGain(); master.gain.value = 0.4; master.connect(off.destination);
    kv.setAudio(off, master); kv.setMuted(false, false);
    music.forEach(function (s, i) {
      var g = off.createGain(); g.connect(master);
      g.gain.setValueAtTime(0, s.t0); g.gain.linearRampToValueAtTime(1, s.t0 + 0.08);
      var last = i === music.length - 1, out = last ? LEN - 1.2 : s.t1;
      g.gain.setValueAtTime(1, out); g.gain.linearRampToValueAtTime(0, Math.min(LEN, out + (last ? 1.1 : 0.15)));
      kv.setMaster(g);
      kv.music.track = s.track; kv.music.step = 0; kv.music.nextTime = s.t0; kv.music.playing = true;
      for (fake = s.t0; fake < s.t1; fake += 0.1) kv.scheduleMusic();
    });
    var sg = off.createGain(); sg.gain.value = 0.75; sg.connect(master); kv.setMaster(sg);
    var shots = {};
    sfxLog.forEach(function (ev) {
      if (ev.n === 'playShoot') { var bucket = Math.floor(ev.f / 6); if (shots[bucket]) return; shots[bucket] = 1; } // one shot sound per 0.1s
      fake = ev.f / 60;
      if (fake < LEN && kv.sfx[ev.n]) kv.sfx[ev.n].apply(null, ev.a || []);
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
  }, { music, sfxLog, LEN });
  const afile = path.join(TMP, name + '-audio.wav');
  fs.writeFileSync(afile, Buffer.from(wav, 'base64'));
  await browser.close();
  const out = path.join(OUTDIR, 'kryptvault-tiktok-' + name + '.mp4');
  const mux = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', vfile, '-i', afile,
    '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log(mux.status === 0 ? 'wrote ' + out : 'mux failed');
}

// ---------- scene setups (run in the page) ----------
// build a hero: picks is { upgradeId: times }, asc is the ascendancy index (or -1)
const BUILD = `function (cls, picks, evos, asc) { var kv = __kv; kv.setClass(cls); kv.startGame();
  Object.keys(picks).forEach(function (id) { for (var k = 0; k < picks[id]; k++) kv.applyUpgrade({ id: id }); });
  evos.forEach(function (id) { kv.applyUpgrade({ id: id }); });
  if (asc >= 0) kv.applyAscendancy(kv.ASCENDANCIES[cls][asc]); kv.game.player.xpMult = 0; }`;
const setup = (body, arg) => `(function () { var kv = __kv, g = kv.game, build = ${BUILD};
  var ring = function (n, cx, cy, rx, ry, type) { for (var k = 0; k < n; k++) { var a = k / n * Math.PI * 2 + Math.random() * 0.4, r = 0.8 + Math.random() * 0.4;
    var x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r; if (x > 14 && x < 466 && y > 14 && y < 256 && !kv.boxHitsWall(x, y, 14, 14)) kv.spawnEnemyAt(type || kv.enemyTypeForWave(g.wave), x, y); } };
  ${body} })()`;
const run = (api, body) => api.eval(setup(body));

// 1. POV: wave 46 — the power fantasy first, then where it started
async function pov(api) {
  const { st, sec } = api;
  st.view = { s: 6 };
  await run(api, `build('bombardier', { multishot: 5, atkspeed: 4, damage: 6, pierce: 2, shield: 3, static: 3, crit: 3, movespeed: 2, health: 6 }, ['bladeorbit', 'bulletstorm'], 1);
    kv.beginWave(46); g.gameState = 'playing'; g.waveBanner = 0; __ctl.freezeWave = true; __ctl.god = true; __ctl.bot = true;
    __ctl.wander = { x: 240, y: 140, ax: 40, ay: 30 };
    var p = g.player; p.x = 240; p.y = 140; p.maxHp = 690; p.hp = 650; g.spawnHaste = 5;
    ring(70, 240, 140, 90, 70); ring(60, 240, 140, 150, 110);`);
  api.hook('POV: YOU MADE IT<br>TO <b>WAVE 46</b>', 0, sec(2.6));
  await api.until(sec(2.7));
  await api.eval(() => { var p = __kv.game.player; p.abilityCd = 0; __kv.castAbility(); });   // DETONATE
  api.stamp('DETONATE!', '', sec(2.75), sec(4.3));
  await api.flash(6);
  await api.until(sec(4.5));
  // flashback: wave 1, one weak bombardier
  await api.wipe(() => run(api, `build('bombardier', {}, [], -1);
    kv.beginWave(1); g.gameState = 'playing'; g.waveBanner = 0; __ctl.freezeWave = true; __ctl.god = true; __ctl.bot = true;
    __ctl.wander = { x: 240, y: 150, ax: 30, ay: 20 }; g.spawnHaste = 0;
    var p = g.player; p.x = 240; p.y = 150; ring(4, 240, 150, 80, 60, 'slime'); ring(3, 240, 150, 110, 80, 'skeleton');
    var f0 = window.__frame; __ctl.xp = function (f) { return 0.55 + (f - f0) / 180; };`));
  api.hook('IT STARTED AT<br><b>WAVE 1</b>', st.f, st.f + sec(1.8));
  await api.hold(sec(1.6));
  // a level-up: every card has a catch
  await api.eval(() => { var kv = __kv, g = kv.game; __ctl.xp = null; g.xp = 0; g.level++; kv.triggerLevelUp(); g.draftLock = 0;
    g.cards[0].upgrade = kv.upgradeById('multishot'); g.cards[1].upgrade = kv.upgradeById('damage'); g.cards[2].upgrade = kv.upgradeById('shield'); });
  st.view = { s: 6, cards: true, cardsY: 640 };
  api.hook('EVERY POWER<br><b>HAS A PRICE</b>', st.f, st.f + sec(2.2));
  await api.hold(sec(1.2));
  await api.tapCard(0);
  st.view = { s: 6 };
  await api.hold(sec(0.5));
  // fast climb: wave 20, wave 40
  await api.wipe(() => run(api, `build('bombardier', { multishot: 3, atkspeed: 2, damage: 3, health: 2 }, [], 0);
    kv.beginWave(20); g.gameState = 'playing'; g.waveBanner = 0; __ctl.freezeWave = true; g.spawnHaste = 2;
    var p = g.player; p.x = 240; p.y = 150; ring(30, 240, 150, 110, 80);`));
  api.stamp('WAVE 20', 'THE DUNES', st.f, st.f + sec(1.1));
  await api.hold(sec(1.1));
  await api.wipe(() => run(api, `build('bombardier', { multishot: 4, atkspeed: 3, damage: 5, pierce: 1, health: 4, crit: 2 }, ['bulletstorm'], 1);
    kv.beginWave(40); g.gameState = 'playing'; g.waveBanner = 0; __ctl.freezeWave = true; g.spawnHaste = 3;
    var p = g.player; p.x = 240; p.y = 150; ring(55, 240, 150, 120, 90);`));
  api.stamp('WAVE 40', 'THE INFERNO', st.f, st.f + sec(1.1));
  await api.hold(sec(1.1));
  // back to wave 46, more of them than ever
  await api.wipe(() => run(api, `build('bombardier', { multishot: 5, atkspeed: 4, damage: 6, pierce: 2, shield: 3, static: 3, crit: 3, movespeed: 2, health: 6 }, ['bladeorbit', 'bulletstorm'], 1);
    kv.beginWave(46); g.gameState = 'playing'; g.waveBanner = 0; __ctl.freezeWave = true; g.spawnHaste = 6;
    var p = g.player; p.x = 240; p.y = 140; p.maxHp = 690; p.hp = 650; ring(90, 240, 140, 100, 80); ring(80, 240, 140, 170, 115);`));
  api.hook('HOW FAR<br><b>CAN YOU GO?</b>', st.f, st.f + sec(2.8));
  await api.hold(sec(1.6));
  await api.eval(() => { var p = __kv.game.player; p.abilityCd = 0; __kv.castAbility(); });
  await api.flash(5);
  await api.hold(sec(1.0));
  await api.endCard('START YOUR RUN', sec(3.6));
}

// 2. Four bosses, back to back, each in its own biome with its own music
async function bosses(api) {
  const { st, sec } = api;
  const boss = (cls, picks, asc, wave, label, sub, at) => run(api, `build('${cls}', ${JSON.stringify(picks)}, [], ${asc});
    kv.beginWave(${wave}); g.gameState = 'playing'; g.waveBanner = 0; __ctl.god = true; __ctl.bot = true; __ctl.freezeWave = true; g.spawnHaste = 0.5;
    var b = g.boss; b.x = 240; b.y = 78; b.entered = true; b.aiTimer = ${at};
    var p = g.player; p.x = 240; p.y = 196; __ctl.wander = { x: 240, y: 196, ax: 45, ay: 14 };
    ring(8, 240, 140, 150, 110);
    var f0 = window.__frame; __ctl.bossFloor = function (f) { return Math.max(0.35, 1 - (f - f0) / 600); };`);
  st.view = { s: 6, focus: 'mid' };
  await boss('warrior', { multishot: 3, damage: 3, atkspeed: 2, health: 3 }, 1, 10, 'THE WARDEN', 'WAVE 10', 0.35);
  api.hook('4 BOSSES<br><b>STAND IN YOUR WAY</b>', 0, sec(2.4));
  api.stamp('THE WARDEN', 'WAVE 10', sec(0.4), sec(2.2), 840);
  await api.until(sec(3.6));
  await api.wipe(() => boss('ranger', { multishot: 3, damage: 3, atkspeed: 2, pierce: 2 }, 0, 20, '', '', 0.2));
  api.stamp('THE NECROMANCER', 'WAVE 20', st.f + 4, st.f + sec(1.8), 840);
  await api.until(sec(7.2));
  await api.wipe(() => boss('mage', { multishot: 2, damage: 4, atkspeed: 2, homing: 2 }, 1, 30, '', '', 0.15));
  api.stamp('THE REVENANT', 'WAVE 30', st.f + 4, st.f + sec(1.8), 840);
  await api.until(sec(10.8));
  await api.wipe(() => run(api, `build('bombardier', { multishot: 4, atkspeed: 3, damage: 5, crit: 2, health: 4 }, ['bulletstorm'], 1);
    kv.beginWave(50); g.gameState = 'playing'; g.waveBanner = 0; __ctl.god = true; __ctl.bot = true; __ctl.freezeWave = true; g.spawnHaste = 1;
    var b = g.boss; b.x = 240; b.y = 80; b.entered = true; b.aiTimer = 0.25;
    var p = g.player; p.x = 240; p.y = 196; __ctl.wander = { x: 240, y: 196, ax: 45, ay: 14 }; ring(12, 240, 140, 150, 110);
    var f0 = window.__frame; __ctl.bossFloor = function (f) { return Math.max(0.04, 1 - (f - f0) / 190); };`));
  api.stamp('THE VAULT KEEPER', 'WAVE 50', st.f + 4, st.f + sec(1.8), 840);
  await api.until(sec(14.0));
  await api.eval(() => { var kv = __kv, g = kv.game, b = g.boss; __ctl.bossFloor = null;
    if (b) kv.killBoss(g.enemies.indexOf(b), b);
    g.gameState = 'playing'; g.cards = []; g.pendingLevelUps = 0; g.advanceAfterLevel = false; });
  await api.flash(6);
  api.hook('CAN YOU BEAT<br><b>THEM ALL?</b>', st.f, st.f + sec(1.4));
  await api.hold(sec(0.6));
  await api.endCard('FACE THE VAULT', sec(3.3));
}

// 3. Five heroes, each showing off its ascendancy's ability
async function heroes(api) {
  const { st, sec } = api;
  const H = [
    ['warrior', 'WARRIOR', 'BERSERKER: WHIRLWIND', 1, 8, { multishot: 2, damage: 3, health: 3 }],
    ['rogue', 'ROGUE', 'ASSASSIN: FAN OF BLADES', 1, 15, { multishot: 2, atkspeed: 3, crit: 2 }],
    ['mage', 'MAGE', 'LIGHT MAGE: RADIANT BEAM', 1, 25, { multishot: 2, damage: 3, homing: 1 }],
    ['ranger', 'RANGER', 'TRAPPER: SPIKE TRAP', 1, 35, { multishot: 2, damage: 3, pierce: 2 }],
    ['bombardier', 'BOMBARDIER', 'DEMOLITIONIST: MEGA BOMB', 0, 45, { multishot: 3, damage: 3, atkspeed: 2 }]
  ];
  st.view = { s: 7 };
  api.hook('WHICH HERO<br><b>ARE YOU?</b>', 0, sec(2.2));
  for (let i = 0; i < H.length; i++) {
    const [cls, name, sub, asc, wave, picks] = H[i];
    const scene = () => run(api, `build('${cls}', ${JSON.stringify(picks)}, [], ${asc});
      kv.beginWave(${wave}); g.gameState = 'playing'; g.waveBanner = 0; __ctl.god = true; __ctl.bot = false; __ctl.freezeWave = true; g.spawnHaste = 0;
      var p = g.player; p.x = 240; p.y = 150;
      ring(14, 240, 150, 100, 80); ring(14, 240, 150, 150, 110);
      g.enemies.forEach(function (e) { if (!e.isBoss) e.speed *= 0.2; });`);
    if (i === 0) { await scene(); st.view.snap = true; } else await api.wipe(scene);
    api.stamp(name, sub, st.f + 2, st.f + sec(2.25), 600);
    await api.hold(sec(0.9));
    await api.eval(() => { var p = __kv.game.player; p.abilityCd = 0; __kv.castAbility(); });
    await api.hold(sec(1.5));
  }
  api.hook('COMMENT<br><b>YOUR PICK!</b>', st.f, st.f + sec(1.4));
  await api.hold(sec(0.5));
  await api.endCard('PICK YOUR HERO', sec(3.4));
}

const VIDEOS = {
  pov: { len: 17.5, direct: pov, music: [{ track: 'combat3', t0: 0, t1: 4.6 }, { track: 'combat0', t0: 4.6, t1: 9.6 }, { track: 'combat3', t0: 9.6, t1: 17.5 }] },
  bosses: { len: 18, direct: bosses, music: [{ track: 'combat0', t0: 0, t1: 3.75 }, { track: 'combat1', t0: 3.75, t1: 7.35 }, { track: 'combat2', t0: 7.35, t1: 10.95 }, { track: 'combat4', t0: 10.95, t1: 18 }] },
  heroes: { len: 17.5, direct: heroes, music: [{ track: 'combat3', t0: 0, t1: 17.5 }] }
};

(async () => {
  const names = WANT.length ? WANT : Object.keys(VIDEOS);
  for (const n of names) {
    if (!VIDEOS[n]) { console.log('unknown video', n); continue; }
    await record(n, VIDEOS[n].len, VIDEOS[n].music, VIDEOS[n].direct);
  }
})().catch(e => { console.error(e); process.exit(1); });
