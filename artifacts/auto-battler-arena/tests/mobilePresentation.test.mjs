import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../public/mobile-presentation.js', import.meta.url), 'utf8');
const fit = html.slice(html.indexOf('  function fitBattleMap(){'), html.indexOf("  button.addEventListener('click',()=>{", html.indexOf('  function fitBattleMap(){')));

function framing(width, height, mapWidth = 900, mapHeight = 560, inset = 0) {
  const classes = new Set(['battleMode']);
  const wrap = { style: {}, getBoundingClientRect: () => ({ top: inset }) };
  const context = vm.createContext({
    wrap, arena: { width: mapWidth, height: mapHeight }, button: { setAttribute() {} },
    landscape: () => width > height, getComputedStyle: () => ({ paddingBottom: `${inset}px` }),
    document: { body: { classList: { contains: x => classes.has(x), toggle: x => classes.add(x) } },
      getElementById: () => ({ clientWidth: width - inset * 2 }) },
    window: { innerHeight: height + 80, visualViewport: { height }, scrollY: 0 },
  });
  vm.runInContext(fit + ';fitBattleMap();', context);
  return wrap.style;
}

test('wide phones, browser chrome and notch insets contain the full arena uniformly', () => {
  for (const [width, height, inset] of [[960, 360, 0], [844, 390, 20], [740, 280, 0], [1280, 600, 24]]) {
    const style = framing(width, height, 900, 560, inset);
    const w = parseFloat(style.width), h = parseFloat(style.height);
    assert.ok(Math.abs(w / h - 900 / 560) < 1e-9);
    assert.ok(w <= width - inset * 2);
    assert.ok(h <= height - inset * 2 - 4);
  }
});
test('dungeon map dimensions are respected and rotating to portrait restores intrinsic sizing', () => {
  const style = framing(920, 360, 1100, 700);
  assert.ok(Math.abs(parseFloat(style.width) / parseFloat(style.height) - 1100 / 700) < 1e-9);
  assert.equal(framing(390, 844).height, '');
  assert.equal(framing(390, 844).width, '');
});

function presentation({ supported = true, rejects = false, installed = false, ios = false,
  orientation, landscape = true, battle = false } = {}) {
  const listeners = {}, hostListeners = {}, nodes = new Map(), properties = new Map();
  function element(tag) {
    const handlers = {};
    return { tag, style: { getPropertyValue: key => properties.get(key) || '', setProperty: (k,v) => properties.set(k,v) },
      parentElement: null, hidden: false, textContent: '', handlers,
      append(...children) { children.forEach(x => { x.parentElement = this; }); },
      appendChild(child) { child.parentElement = this; if (child.id) nodes.set(child.id, child); },
      addEventListener(name, fn) { handlers[name] = fn; }, setAttribute() {}, remove() {} };
  }
  const body = element('body'), root = element('html'), hub = element('hub'), bar = element('bar');
  const doc = { body, documentElement: root, head: element('head'), fullscreenEnabled: supported,
    fullscreenElement: null, createElement: element, getElementById: id => id === 'mainHub' ? hub : bar,
    addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} };
  body.classList = { contains: () => battle };
  let requests = 0;
  if (supported) root.requestFullscreen = options => {
    requests++; assert.equal(options.navigationUI, 'hide');
    if (rejects) return Promise.reject(new Error('Blocked'));
    doc.fullscreenElement = root;
    return Promise.resolve();
  };
  const host = { document: doc, navigator: { userAgent: ios ? 'iPhone' : 'Android', standalone: installed },
    screen: {orientation},
    matchMedia: query => ({ matches: query.includes('display-mode') ? installed :
      query === '(orientation:portrait)' ? !landscape : true }),
    getComputedStyle: () => ({ getPropertyValue: () => '0px' }),
    addEventListener: (name, fn) => { hostListeners[name] = fn; }, removeEventListener() {} };
  const window = { parent: host, addEventListener() {} };
  vm.runInNewContext(source, { document: doc, window, Promise,
    MutationObserver: class { observe() {} disconnect() {} } });
  return { nodes, listeners, doc, get requests() { return requests; } };
}

test('real entry gestures request fullscreen synchronously; synthetic and unrelated clicks do not', () => {
  const p = presentation();
  const click = (id, trusted) => p.listeners.click({ isTrusted: trusted,
    target: { closest: () => ({ id, disabled: false, matches: () => false }) } });
  click('startBtn', false); click('racialBtn', true); assert.equal(p.requests, 0);
  click('hubJoinBtn', true); assert.equal(p.requests, 1);
  click('startBtn', true); assert.equal(p.requests, 1, 'already fullscreen');
});
test('blocked requests preserve gameplay and explicit retry explains the fallback', async () => {
  const p = presentation({ rejects: true });
  p.nodes.get('mobileFullscreenBtn').handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.nodes.get('mobileFullscreenNote').hidden, false);
  assert.match(p.nodes.get('mobileFullscreenNote').textContent || p.nodes.get('mobileFullscreenBtn').textContent, /Fullscreen|fullscreen/);
  assert.equal(p.requests, 1);
});
test('unsupported iPhone keeps the fallback, while installed app mode needs no request', () => {
  const p = presentation({ supported: false, ios: true });
  assert.equal(p.nodes.get('mobileFullscreenBtn').textContent, 'App view');
  p.nodes.get('mobileFullscreenBtn').handlers.click();
  assert.equal(p.nodes.get('mobileFullscreenNote').hidden, false);
  assert.equal(p.requests, 0);
  const installed = presentation({ installed: true });
  assert.equal(installed.nodes.get('mobileFullscreenBtn').hidden, true);
});
test('host grants iframe fullscreen and recalculates on fullscreen/visual viewport changes', () => {
  for (const page of ['Play', 'GuestPlay']) {
    const text = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), 'utf8');
    assert.match(text, /allow="[^"]*\bfullscreen\b[^"]*" allowFullScreen/);
  }
  const hook = readFileSync(new URL('../src/lib/useGameFrameScrolling.ts', import.meta.url), 'utf8');
  assert.match(hook, /\(window\.visualViewport\?\.height \?\? window\.innerHeight\) - Math\.max\(topOffset, frame\.offsetTop \|\| 0\)/);
  assert.match(hook, /document\.addEventListener\('fullscreenchange', scheduleResizeRefresh\)/);
  assert.match(html, /window\.visualViewport\?\.addEventListener\('resize',fitBattleMap\)/);
});
test('orientation lock is requested after successful fullscreen, never before real entry', async () => {
  let locks=0,unlocks=0;
  const p=presentation({orientation:{lock(mode){assert.equal(mode,'landscape');locks++;return Promise.resolve();},
    unlock(){unlocks++;}}});
  assert.equal(locks,0);
  p.nodes.get('mobileFullscreenBtn').handlers.click();
  assert.equal(locks,0,'fullscreen must settle first');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(locks,1);
  p.doc.fullscreenElement=null;p.listeners.fullscreenchange();
  assert.equal(unlocks,1);
});
test('denied or unsupported orientation leaves play working and portrait has a dismissible rotate hint', async () => {
  const p=presentation({landscape:false,battle:true,orientation:{lock(){return Promise.reject(Error('Unsupported'));}}});
  p.nodes.get('mobileFullscreenBtn').handlers.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.requests,1);
  assert.equal(p.nodes.get('mobileLandscapeNote').hidden,false);
  const ios=presentation({supported:false,ios:true,landscape:false,battle:true});
  assert.equal(ios.nodes.get('mobileLandscapeNote').hidden,false);
  assert.equal(ios.requests,0);
});
test('installed game requests landscape without another fullscreen call', async () => {
  let locks=0;
  const p=presentation({installed:true,battle:true,orientation:{lock(){locks++;return Promise.resolve();}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(locks,1);assert.equal(p.requests,0);
});
test('orientation resolving after fullscreen exit is released rather than retaining a stale lock', async () => {
  let resolveLock,unlocks=0;
  const p=presentation({orientation:{lock(){return new Promise(resolve=>{resolveLock=resolve;});},
    unlock(){unlocks++;}}});
  p.nodes.get('mobileFullscreenBtn').handlers.click();
  await Promise.resolve();
  p.doc.fullscreenElement=null;p.listeners.fullscreenchange();
  resolveLock();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(unlocks,1);
});