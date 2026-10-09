import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const script = readFileSync(new URL('../public/game-startup.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
const host = readFileSync(new URL('../src/pages/Play.tsx', import.meta.url), 'utf8');

function harness({account = false, dashboard = true, battle = false} = {}) {
  const events = {}, documentEvents = {}, frames = [], timers = [], messages = [];
  const classes = new Set(['game-starting']);
  const splash = {hidden: false, setAttribute() {}};
  const message = {textContent: ''}, retry = {hidden: true, addEventListener() {}};
  const nodes = {'game-startup': splash, 'game-startup-message': message, 'game-startup-retry': retry};
  if (dashboard) nodes.alRoot = {};
  const parent = {postMessage: data => messages.push(data)};
  const window = {parent, addEventListener: (type, fn) => {events[type] = fn;}};
  const document = {
    fonts: {ready: Promise.resolve()},
    body: {classList: {contains: name => dashboard && name === 'alLobby'}},
    documentElement: {classList: {remove: name => classes.delete(name)}},
    getElementById: id => nodes[id],
    addEventListener: (type, fn) => {documentEvents[type] = fn;},
  };
  let homes = 0;
  vm.runInNewContext(script, {window, document, location: {origin: 'https://game.test', search: account ? '?startup=account' : '?guest=1'},
    URLSearchParams, Promise, playerProfile: {}, state: battle ? {over: false} : null, PRACTICE_ONLY: false,
    showMainHub: () => homes++, requestAnimationFrame: fn => frames.push(fn),
    setTimeout: fn => {timers.push(fn); return timers.length;}, clearTimeout() {}, console});
  documentEvents.DOMContentLoaded();
  return {classes, splash, message, retry, frames, timers, messages,
    homes: () => homes,
    load: async () => {events.load(); await Promise.resolve(); await Promise.resolve();},
    send: (type, source = parent, origin = 'https://game.test') => events.message({data: {type}, source, origin}),
    paint: () => {while (frames.length) frames.shift()();}};
}

test('a first-paint CSS gate precedes all legacy game UI and has a retry path', () => {
  assert.match(html, /<html lang="en" class="game-starting">/);
  assert.ok(html.indexOf('game-startup.js') < html.indexOf('<body>'));
  assert.match(html, /html\.game-starting body > :not\(#game-startup\).*visibility:hidden!important/);
  assert.match(html, /id="game-startup-retry"/);
  assert.doesNotMatch(html, /setTimeout\(\(\)=>\{if\(typeof playerProfile[^;\n]+showMainHub\(\);\},80\)/);
});

test('guest reveals only the final dashboard, once, after load and layout frames', async () => {
  const h = harness();
  assert.equal(h.homes(), 0);
  await h.load();
  assert.equal(h.homes(), 1);
  assert.equal(h.splash.hidden, false);
  h.paint();
  assert.equal(h.splash.hidden, true);
  assert.equal(h.classes.has('game-starting'), false);
  h.send('arena:startup-commit');
  assert.equal(h.homes(), 1);
});

test('account startup waits for trusted saved-state commit as well as load', async () => {
  const h = harness({account: true});
  await h.load(); h.paint();
  assert.equal(h.splash.hidden, false);
  h.send('arena:startup-commit', {}, 'https://game.test');
  h.send('arena:startup-commit', undefined, 'https://untrusted.test');
  assert.equal(h.homes(), 0);
  h.send('arena:startup-commit'); h.paint();
  assert.equal(h.splash.hidden, true);
  assert.equal(h.homes(), 1);
});

test('an early host commit cannot reveal unfinished scripts', async () => {
  const h = harness({account: true});
  h.send('arena:startup-commit'); h.paint();
  assert.equal(h.homes(), 0);
  await h.load(); h.paint();
  assert.equal(h.splash.hidden, true);
});

test('failed dashboard initialization stays covered and exposes retry, never legacy UI', async () => {
  const h = harness({dashboard: false});
  await h.load(); h.paint();
  assert.equal(h.splash.hidden, false);
  assert.equal(h.retry.hidden, false);
  assert.equal(h.homes(), 0);
});

test('a stalled late script exposes retry before load finishes', () => {
  const h = harness({account: true});
  h.timers[0]();
  assert.equal(h.retry.hidden, false);
  assert.equal(typeof h.retry.onclick, 'function');
  assert.equal(h.splash.hidden, false);
  assert.equal(h.homes(), 0);
});

test('phone loading stays viewport-sized and recalculates menu size on reveal', () => {
  const sizing = readFileSync(new URL('../src/lib/useGameFrameScrolling.ts', import.meta.url), 'utf8');
  assert.match(sizing, /const practiceLocked = doc\.documentElement\.classList\.contains\('game-starting'\)/);
  assert.match(sizing, /classObserver\.observe\(doc\.documentElement, \{ attributes: true, attributeFilter: \['class'\] \}\)/);
});

test('startup does not redirect an active fight; visibility probes are repeatable', async () => {
  const h = harness({battle: true});
  await h.load(); h.paint();
  assert.equal(h.homes(), 0);
  assert.equal(h.messages.length, 1);
  h.send('arena:ping');
  assert.equal(h.messages.length, 2);
  assert.equal(h.messages[1].type, 'arena:startup-visible');
});

test('host sends authoritative state before startup commit without gating engine readiness', () => {
  const effect = host.slice(host.indexOf('// Engine readiness is not visual readiness.'), host.indexOf('\n  return <', host.indexOf('// Engine readiness is not visual readiness.')));
  assert.ok(effect.indexOf('arena:sync-profile') < effect.indexOf('arena:startup-commit'));
  assert.match(host, /game\.html\?startup=account/);
  assert.match(host, /if \(msg\.type === 'arena:ready'\)[\s\S]*?setReady\(true\)/);
});

test('an in-frame account retry receives another commit even if React is already ready', () => {
  const handler = host.slice(host.indexOf("if (msg.type === 'arena:ready')"), host.indexOf("if (msg.type === 'arena:return-to-arena')"));
  assert.match(handler, /if \(iframeReady\.current && latestEconomy\.current/);
  assert.ok(handler.indexOf('arena:sync-profile') < handler.indexOf('arena:startup-commit'));
  assert.ok(handler.indexOf('arena:startup-commit') < handler.indexOf('setReady(true)'));
});
