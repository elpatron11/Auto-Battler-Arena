import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const integrationPath = path.join(root, 'src/prototypes/roster3d/gameIntegration.ts');
const GRAPHICS_KEY = 'arena:body-graphics:v1';

function integration(factory) {
  const source = ts.transpileModule(readFileSync(integrationPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    URLSearchParams,
    require: id => {
      if (id === './premiumRoster') return { PREMIUM_ROSTER_FACTORY: { supports() { return true; }, create() {} } };
      assert.equal(id, './battleRenderer', 'integration may only require its renderer module');
      return { createRosterBattleRenderer: factory };
    },
  });
  return module.exports;
}

function fakeRenderer() {
  return {
    enabled: true,
    stats: { phase: 'loading', error: '', units: 0 },
    resets: 0,
    disposals: 0,
    draws: [],
    handledCalls: [],
    draw(...args) { this.draws.push(args); return this.enabled; },
    handled(entity) { this.handledCalls.push(entity); return this.enabled; },
    snapshot() { return { phase: this.stats.phase }; },
    reset() { this.resets++; },
    dispose() { this.disposals++; },
  };
}

function setup({ search = '', stored = null, getError = false, setError = false, factory = fakeRenderer } = {}) {
  const listeners = new Map();
  const onceListeners = new WeakSet();
  const addedSelectListeners = new Map();
  const clearedIntervals = [];
  const intervals = [];
  let worldState = null;
  const statuses = [{ textContent: '', title: '' }, { textContent: '', title: '' }];
  const selects = [
    { value: '', addEventListener(type, fn) { addedSelectListeners.set(this, fn); }, removeEventListener(type, fn) {
      if (addedSelectListeners.get(this) === fn) addedSelectListeners.delete(this);
    } },
    { value: '', addEventListener(type, fn) { addedSelectListeners.set(this, fn); }, removeEventListener(type, fn) {
      if (addedSelectListeners.get(this) === fn) addedSelectListeners.delete(this);
    } },
  ];
  const storage = {
    getItem(key) {
      assert.equal(key, GRAPHICS_KEY);
      if (getError) throw new Error('storage unavailable');
      return stored;
    },
    setItem(key, value) {
      assert.equal(key, GRAPHICS_KEY);
      if (setError) throw new Error('storage unavailable');
      stored = value;
    },
  };
  const rootWindow = {
    location: { search },
    localStorage: storage,
    GameBody3DSource: {
      entitiesForRendering: () => worldState?.entities ?? [],
      paused: () => !!worldState?.paused,
    },
    document: { querySelectorAll(selector) {
      if (selector === '[data-game-graphics]') return selects;
      if (selector === '[data-game-graphics-status]') return statuses;
      throw new Error(`Unexpected selector ${selector}`);
    } },
    addEventListener(type, fn, options) {
      const collection = listeners.get(type) ?? new Set();
      collection.add(fn);
      listeners.set(type, collection);
      if (options?.once) onceListeners.add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    setInterval(fn, delay) {
      const interval = { fn, delay };
      intervals.push(interval);
      return interval;
    },
    clearInterval(interval) { clearedIntervals.push(interval); },
  };
  const renderers = [];
  const createRenderer = (entities, options) => {
    assert.ok(options.premiumRoster, 'normal 3D uses the approved premium roster, including retries');
    const renderer = factory(entities);
    renderer.entities = entities;
    renderers.push(renderer);
    return renderer;
  };
  const { installGameBody3D } = integration(createRenderer);
  function emit(type, event = {}) {
    for (const listener of [...(listeners.get(type) ?? [])]) {
      listener(event);
      if (onceListeners.has(listener)) listeners.get(type)?.delete(listener);
    }
  }
  function choose(select, value) {
    select.value = value;
    const listener = addedSelectListeners.get(select);
    assert.ok(listener, 'graphics selection listener is installed');
    listener({ currentTarget: select });
  }
  return {
    rootWindow, selects, statuses, storage, renderers, intervals, clearedIntervals,
    listeners, addedSelectListeners, installGameBody3D, emit, choose,
    setWorldState(value) { worldState = value; },
    get worldState() { return worldState; },
    get stored() { return stored; },
  };
}

test('live graphics defaults to 3D and honors a device-local Original preference', () => {
  const normal = setup();
  const normalLayer = normal.installGameBody3D(normal.rootWindow);
  assert.equal(normalLayer.enabled, true);
  assert.deepEqual(normal.selects.map(select => select.value), ['3d', '3d']);
  assert.deepEqual(normal.statuses.map(status => status.textContent), ['3D ready · starts in battle', '3D ready · starts in battle']);

  const original = setup({ stored: 'original' });
  const originalLayer = original.installGameBody3D(original.rootWindow);
  assert.equal(originalLayer.enabled, false);
  assert.deepEqual(original.selects.map(select => select.value), ['original', 'original']);
  assert.deepEqual(original.statuses.map(status => status.textContent), ['Original bodies active', 'Original bodies active']);
  assert.equal(original.stored, 'original', 'the preference stays local to the graphics key');
});

test('toggling is cosmetic-only and preserves combat state, entity identities, and progression', () => {
  const env = setup();
  const entities = [Object.freeze({ id: 'hero', classId: 'warrior' }), Object.freeze({ id: 'foe', classId: 'mage' })];
  const progression = { gold: 18, level: 7, wins: 4, inventory: ['sword'] };
  env.setWorldState({ entities, progression, battleNumber: 12, paused: false });
  const layer = env.installGameBody3D(env.rootWindow);
  const beforeEntities = env.worldState.entities;
  const beforeProgression = JSON.stringify(env.worldState.progression);
  env.choose(env.selects[0], 'original');
  assert.equal(layer.enabled, false);
  assert.equal(env.worldState.entities, beforeEntities);
  assert.equal(env.renderers[0].entities(), beforeEntities, 'the renderer reads the explicit source bridge');
  assert.equal(env.worldState.entities[0], entities[0]);
  assert.equal(JSON.stringify(env.worldState.progression), beforeProgression);
  assert.equal(env.stored, 'original');
  env.choose(env.selects[1], '3d');
  assert.equal(layer.enabled, true);
  assert.equal(env.worldState.entities, beforeEntities);
  assert.equal(JSON.stringify(env.worldState.progression), beforeProgression);
  assert.equal(env.stored, '3d');
  assert.equal(env.renderers.length, 1, 'normal cosmetic toggles reuse the same renderer');
});

test('cross-window storage events synchronize both selectors without reacting to unrelated keys', () => {
  const env = setup();
  const layer = env.installGameBody3D(env.rootWindow);
  env.emit('storage', { key: 'unrelated-setting', newValue: 'original' });
  assert.equal(layer.enabled, true);
  env.emit('storage', { key: GRAPHICS_KEY, newValue: 'original' });
  assert.equal(layer.enabled, false);
  assert.deepEqual(env.selects.map(select => select.value), ['original', 'original']);
  env.emit('storage', { key: null, newValue: null });
  assert.equal(layer.enabled, true, 'clearing storage restores the default 3D choice');
  assert.deepEqual(env.selects.map(select => select.value), ['3d', '3d']);
});

test('installation is idempotent and dedicated roster/Warrior previews are left alone', () => {
  const regular = setup();
  const first = regular.installGameBody3D(regular.rootWindow);
  assert.equal(regular.installGameBody3D(regular.rootWindow), first);
  assert.equal(regular.renderers.length, 1);
  assert.equal(regular.intervals.length, 1);

  for (const search of ['?rosterBattlePreview=1', '?warriorBattlePreview=1']) {
    const preview = setup({ search });
    assert.equal(preview.installGameBody3D(preview.rootWindow), undefined);
    assert.equal(preview.rootWindow.GameBody3D, undefined);
    assert.equal(preview.renderers.length, 0);
    assert.equal(preview.intervals.length, 0);
  }
});

test('atlas resets for a new battle and paused frames keep a consistent world clock', () => {
  const env = setup();
  const hero = { id: 'first-battle' };
  env.setWorldState({ entities: [hero], paused: false });
  const layer = env.installGameBody3D(env.rootWindow);
  const renderer = env.renderers[0];
  layer.beginFrame(10);
  assert.equal(layer.clock(10.25), 10);
  assert.equal(renderer.resets, 1, 'the first battle identity initializes the atlas');

  env.worldState.paused = true;
  layer.beginFrame(12);
  assert.equal(layer.clock(12.8), 10, 'paused rendering uses the same frame clock');
  layer.beginFrame(13);
  assert.equal(layer.clock(13.4), 10, 'the paused world continues to hold its clock');

  env.worldState.entities = [{ id: 'second-battle' }];
  layer.beginFrame(20);
  assert.equal(renderer.resets, 2, 'a new first entity resets the shared atlas');
  assert.equal(layer.clock(20.5), 20, 'the new battle starts a fresh consistent clock');
});

test('renderer failure reports Original fallback and selecting 3D retries with a fresh renderer', () => {
  const env = setup();
  const layer = env.installGameBody3D(env.rootWindow);
  const failed = env.renderers[0];
  failed.stats.phase = 'failed';
  failed.stats.error = 'WebGL unavailable';
  env.intervals[0].fn();
  assert.ok(env.statuses.every(status => status.textContent.includes('Original active — 3D unavailable on this device')));
  assert.ok(env.statuses.every(status => status.title === 'WebGL unavailable'));

  env.choose(env.selects[0], 'original');
  assert.equal(layer.enabled, false);
  env.choose(env.selects[0], '3d');
  assert.equal(env.renderers.length, 2);
  assert.equal(failed.disposals, 1);
  assert.equal(layer.enabled, true);
  assert.equal(env.statuses[0].textContent, '3D ready · starts in battle');
});

test('pagehide disposes the layer and releases its timer, storage, and selector listeners', () => {
  const env = setup();
  const layer = env.installGameBody3D(env.rootWindow);
  const renderer = env.renderers[0];
  const interval = env.intervals[0];
  assert.equal(env.listeners.get('storage').size, 1);
  assert.equal(env.addedSelectListeners.size, 2);
  env.emit('pagehide');
  assert.deepEqual(env.clearedIntervals, [interval]);
  assert.equal(renderer.disposals, 1);
  assert.equal(env.listeners.get('storage').size, 0);
  assert.equal(env.listeners.get('pagehide').size, 0);
  assert.equal(env.addedSelectListeners.size, 0);
  assert.equal(env.rootWindow.GameBody3D, undefined);
  assert.equal(layer.enabled, true, 'the disposed layer remains an inert reference, not globally installed');
});

test('storage write failure is explicitly surfaced while graphics selection still applies', () => {
  const env = setup({ getError: true, setError: true });
  const layer = env.installGameBody3D(env.rootWindow);
  assert.equal(layer.enabled, true);
  assert.ok(env.statuses.every(status => status.textContent.includes('Choice cannot be saved on this device')));
  env.choose(env.selects[1], 'original');
  assert.equal(layer.enabled, false, 'selection still takes effect despite storage failure');
  assert.deepEqual(env.selects.map(select => select.value), ['original', 'original']);
  assert.ok(env.statuses.every(status => status.textContent.includes('Original bodies active')));
  assert.ok(env.statuses.every(status => status.textContent.includes('Choice cannot be saved on this device')));
});

test('bundled integration has a stable URL, game.html loads it, and normal drawing uses all four live body hooks', () => {
  const bundler = readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
  const gameHtml = readFileSync(path.join(root, 'public/game.html'), 'utf8');
  const sourceScript = readFileSync(path.join(root, 'public/game-body-source.js'), 'utf8');
  const entry = readFileSync(path.join(root, 'game-body-3d.js'), 'utf8');
  const landscapeCss = gameHtml.match(/<style id="landscape-battle-fit">([\s\S]*?)<\/style>/)?.[1];
  assert.match(bundler, /gameBody3d:\s*path\.resolve\(import\.meta\.dirname,\s*'game-body-3d\.js'\)/);
  assert.match(bundler, /chunk\.name === 'gameBody3d'[\s\S]*?'game-body-3d\.js'/);
  assert.match(gameHtml, /<script\s+type="module"\s+src="\.\/game-body-3d\.js"><\/script>/);
  assert.match(entry, /installGameBody3D\(window\)/);
  const sourceTag = '<script src="./game-body-source.js"></script>';
  const moduleTag = '<script type="module" src="./game-body-3d.js"></script>';
  assert.ok(gameHtml.indexOf(sourceTag) >= 0, 'game.html loads the classic lexical-state bridge');
  assert.ok(gameHtml.indexOf(sourceTag) < gameHtml.indexOf(moduleTag), 'classic bridge loads before the module controller');
  assert.match(sourceScript, /window\.GameBody3DSource\s*=\s*Object\.freeze/);
  assert.match(sourceScript, /entitiesForRendering:\s*\(\)\s*=>\s*state\s*\?\s*state\.entities\s*:\s*\[\]/);
  assert.match(sourceScript, /paused:\s*\(\)\s*=>\s*!!\(state\s*&&\s*state\.paused\)/);
  assert.match(gameHtml, /GameBody3D\?\.draw\(/);
  assert.match(gameHtml, /GameBody3D\?\.handled\(/);
  assert.match(gameHtml, /GameBody3D\.beginFrame\(/);
  assert.match(gameHtml, /GameBody3D\.clock\(/);
  assert.ok(landscapeCss, 'landscape battle styles are present');
  assert.match(landscapeCss, /body\.phoneLandscapeBattle #topBar\{[^}]*pointer-events:none/);
  assert.match(landscapeCss, /body\.phoneLandscapeBattle #topBar select\{[^}]*pointer-events:auto/);
  const rosterPreview = readFileSync(path.join(root, 'src/prototypes/roster3d/RosterPreviewApp.tsx'), 'utf8');
  assert.match(rosterPreview, /<span data-testid="status-preview-only">Model gallery<\/span>/);
  assert.doesNotMatch(rosterPreview, /<span data-testid="status-preview-only">Unpublished<\/span>/);
});

test('public game bridge reads lexical state from its external classic script without window.state', () => {
  const gameHtml = readFileSync(path.join(root, 'public/game.html'), 'utf8');
  const bridgeScript = readFileSync(path.join(root, 'public/game-body-source.js'), 'utf8');
  const stateDeclaration = gameHtml.match(/\blet\s+state\s*=\s*null\s*;/)?.[0];
  assert.ok(stateDeclaration, 'game.html declares its actual lexical state binding');
  assert.match(gameHtml, /<script src="\.\/game-body-source\.js"><\/script>/);

  const context = vm.createContext({ window: {} });
  vm.runInContext(stateDeclaration, context);
  vm.runInContext(bridgeScript, context);
  assert.equal(vm.runInContext('"state" in window', context), false, 'game state is not copied onto window');
  assert.equal(vm.runInContext('window.GameBody3DSource.entitiesForRendering().length', context), 0);

  const readsLexicalState = vm.runInContext(`
    window.__fixtureEntities = [{ id: 'lexical-state-entity' }];
    state = { entities: window.__fixtureEntities, paused: true };
    window.GameBody3DSource.entitiesForRendering()[0] === window.__fixtureEntities[0] &&
      window.GameBody3DSource.paused() === true &&
      !('state' in window)
  `, context);
  assert.equal(readsLexicalState, true, 'the bridge follows lexical state and pause values, not window.state');
});

test('equipped custom skins stay Original for heroes and are disclosed while dedicated creatures remain 3D', () => {
  const equippedHero = { alive: true, team: 'player', classId: 'warrior', skinId: 'royalVanguard', x: 20, y: 100 };
  const boss = { alive: true, team: 'enemy', classId: 'warrior', _dungeonBoss: true,
    _dungeonEncounterId: 'frost', skinId: 'royalVanguard', x: 40, y: 100 };
  const pet = { alive: true, team: 'player', classId: 'pet-archer', isPet: true,
    skinId: 'royalVanguard', x: 60, y: 100 };
  const add = { alive: true, team: 'enemy', classId: 'warrior', _dungeonAdd: true,
    name: 'Demon Hound', skinId: 'royalVanguard', x: 80, y: 100 };

  const env = setup();
  env.setWorldState({ entities: [equippedHero, boss, pet, add], paused: false });
  env.installGameBody3D(env.rootWindow);
  assert.ok(env.statuses.every(status => status.textContent.includes('Equipped skins keep Original art')));
  env.setWorldState({ entities: [boss, pet, add], paused: false });
  env.intervals[0].fn();
  assert.ok(env.statuses.every(status => !status.textContent.includes('Equipped skins keep Original art')),
    'dedicated boss, pet, and add models are not reported as unsupported hero skins');
});

test('renderer keeps custom-skinned heroes Original but still draws custom-skinned bosses, pets, and adds in 3D', () => {
  class Renderer {
    constructor({ canvas }) { this.domElement = canvas; }
    info = { render: { calls: 12, triangles: 800 } };
    setPixelRatio() {} setSize() {} setClearColor() {} setScissorTest() {}
    setScissor() {} setViewport() {} clear() {} dispose() {} forceContextLoss() {}
    getContext() { return { isContextLost: () => false }; }
    render() {}
  }
  const cache = new Map();
  function load(filename) {
    if (!filename.endsWith('.ts')) filename += '.ts';
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} };
    cache.set(filename, module.exports);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports,
      performance: { now: () => 100 },
      document: { createElement: () => ({ width: 0, height: 0,
        getContext: () => ({ clearRect() {}, drawImage() {} }) }) },
      require: id => id === 'three'
        ? { ...THREE, WebGLRenderer: Renderer }
        : load(path.resolve(path.dirname(filename), id)),
    });
    return module.exports;
  }
  const { createRosterBattleRenderer } = load(path.join(root, 'src/prototypes/roster3d/battleRenderer'));
  const hero = { alive: true, team: 'player', classId: 'warrior', skinId: 'royalVanguard',
    x: 20, y: 100, status: {}, extra: {} };
  const dedicated = [
    { alive: true, team: 'enemy', classId: 'warrior', _dungeonBoss: true, _dungeonEncounterId: 'frost',
      skinId: 'royalVanguard', x: 40, y: 100, status: {}, extra: {} },
    { alive: true, team: 'player', classId: 'pet-archer', isPet: true,
      skinId: 'royalVanguard', x: 60, y: 100, status: {}, extra: {} },
    { alive: true, team: 'enemy', classId: 'warrior', _dungeonAdd: true, name: 'Demon Hound',
      skinId: 'royalVanguard', x: 80, y: 100, status: {}, extra: {} },
  ];
  const renderer = createRosterBattleRenderer(() => [hero, ...dedicated]);
  const context = { save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {}, drawImage() {} };
  assert.equal(renderer.draw(context, hero, 1), false, 'unsupported equipped hero skin remains on the Original renderer');
  for (const entity of dedicated) assert.equal(renderer.draw(context, entity, 1), true);
  assert.equal(renderer.stats.units, dedicated.length, 'all dedicated creatures occupy 3D atlas tiles');
  for (const entity of dedicated) assert.equal(renderer.handled(entity), true);
  assert.equal(renderer.handled(hero), false);
  renderer.dispose();
});