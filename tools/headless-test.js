// Headless smoke test: runs the real game script under Node with a stubbed
// DOM/canvas, pumps the rAF loop manually, and drives a run through the
// wave-50 VAULT KEEPER into the endless waves. Fails loudly on any runtime
// exception in update/render. Usage: node tools/headless-test.js [../kryptvault.html]
'use strict';

const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
let script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

// test-only hooks: expose internals from the IIFE (never ships)
script = script.replace(/\}\)\(\);\s*$/,
  'window.__hooks = { game: game, beginWave: beginWave, killBoss: killBoss, ' +
  'currentBiome: currentBiome, startGame: startGame, spawnBoss: spawnBoss, ' +
  'selectClass: function(i){ selectClassByIndex(i); }, walls: function(){ return walls; } };\n})();');

// ---------- DOM / browser stubs ----------
function ctxStub() {
  return new Proxy({ canvas: { width: 480, height: 270 } }, {
    get(t, k) {
      if (k in t) return t[k];
      return function () { return { width: 480, data: new Uint8ClampedArray(4) }; };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function canvasStub() {
  return {
    width: 480, height: 270,
    style: {},
    getContext: () => ctxStub(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }),
    addEventListener: () => {},
    toDataURL: () => 'data:,',
    parentElement: { clientWidth: 480, clientHeight: 270 },
  };
}
const listeners = {};
const win = {
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener: () => {},
  dispatch: (ev, arg) => { (listeners[ev] || []).forEach(fn => fn(arg)); },
  innerWidth: 960, innerHeight: 540,
  location: { search: '', href: 'http://test/' },
  KeyboardEvent: function () {},
  setInterval, clearInterval, setTimeout, clearTimeout,
};
const doc = {
  getElementById: () => canvasStub(),
  createElement: (tag) => tag === 'canvas' ? canvasStub() :
    { style: {}, focus: () => {}, blur: () => {}, addEventListener: () => {}, setAttribute: () => {}, value: '' },
  addEventListener: () => {},
  body: { appendChild: () => {} },
  activeElement: null,
  visibilityState: 'visible',
};
const sandbox = {
  window: win, document: doc,
  localStorage: { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]), text: () => Promise.resolve('') }),
  performance, console, Math, JSON, Date, Image: function () { return { addEventListener: () => {}, style: {} }; },
  navigator: { userAgent: 'headless' },
  requestAnimationFrame: (cb) => { pending = cb; },
  Audio: function () { return { play: () => {} }; },
};
sandbox.globalThis = sandbox;
let pending = null;

const vm = require('vm');
const ctxVm = vm.createContext(sandbox);
vm.runInContext(script, ctxVm, { filename: 'kryptvault.js' });

const H = sandbox.window.__hooks;
if (!H) { console.error('FAIL: hooks not installed'); process.exit(1); }

let now = 0;
function pump(frames) {
  for (let i = 0; i < frames; i++) {
    const cb = pending; pending = null;
    if (!cb) throw new Error('game loop stopped re-registering rAF');
    now += 16.7;
    cb(now);
  }
}

function key(code) {
  win.dispatch('keydown', { code, preventDefault: () => {} });
  win.dispatch('keyup', { code, preventDefault: () => {} });
}

try {
  pump(10);                       // menus render
  H.startGame();                  // straight into the run (bypasses menus)
  console.log('run started at wave', H.game.wave, '/ biome', H.currentBiome().name);

  pump(600);                      // ~10s of combat on the starting wave
  console.log('after 10s: wave', H.game.wave, 'kills', H.game.score,
              'enemies', H.game.enemies.length, 'state', H.game.gameState);

  // force the Keeper fight
  H.game.gameState = 'playing';
  H.game.cards = [];
  H.beginWave(50);
  pump(5);
  const boss = H.game.boss;
  if (!boss || boss.kind !== 'keeper') throw new Error('wave 50 boss is ' + (boss && boss.kind));
  console.log('wave 50 boss:', boss.name, 'hp', boss.hp, 'biome', H.currentBiome().name);

  pump(900);                      // ~15s of Keeper AI (dash/fan/summons all cycle)
  console.log('after keeper 15s: boss hp', H.game.boss && H.game.boss.hp,
              'enemyShots', H.game.enemyShots.length, 'enemies', H.game.enemies.length);

  // kill it and enter the endless waves
  if (H.game.boss) {
    const idx = H.game.enemies.indexOf(H.game.boss);
    H.killBoss(idx, H.game.boss);
  }
  // clear the resulting draft and advance
  H.game.gameState = 'playing';
  H.game.cards = [];
  H.game.advanceAfterLevel = false;
  H.beginWave(51);
  pump(5);
  console.log('wave 51: biome', H.currentBiome().name,
              'endlessBanner', H.game.endlessBanner.toFixed(1),
              'breakables', H.walls().filter(w => w.breakable).length, '(expect 0)');
  pump(600);                      // ~10s of endless combat
  console.log('after endless 10s: wave', H.game.wave, 'kills', H.game.score,
              'enemies', H.game.enemies.length);

  // per-biome block kinds: each field plays differently until wave 50
  function kindsAt(n) {
    H.game.gameState = 'playing'; H.game.cards = [];
    H.beginWave(n);
    pump(120); // 2s of combat exercises softAt / magma / crumble paths
    return H.walls().reduce((m, w) => { if (w.kind) m[w.kind] = (m[w.kind] || 0) + 1; return m; }, {});
  }
  const expect = [[5, 'brick'], [15, 'sand'], [25, 'ice'], [35, 'magma'], [45, 'gilded']];
  for (const [wv, kind] of expect) {
    const k = kindsAt(wv);
    const names = Object.keys(k);
    if (names.length && (names.length !== 1 || names[0] !== kind)) {
      throw new Error('wave ' + wv + ' expected only ' + kind + ' got ' + JSON.stringify(k));
    }
    console.log('wave', wv, 'blocks:', JSON.stringify(k));
  }
  const k55 = kindsAt(55);
  if (Object.keys(k55).length) throw new Error('endless waves must be solid, got ' + JSON.stringify(k55));
  console.log('wave 55 blocks: {} (solid, as designed)');

  console.log('PASS: no exceptions through Keeper fight, endless transition, and all block kinds');
} catch (err) {
  console.error('FAIL:', err.stack || err);
  process.exit(1);
}
