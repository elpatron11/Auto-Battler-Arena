import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function loader(globals = {}, three = THREE) {
  const cache = new Map();
  function load(filename) {
    if (!filename.endsWith('.ts')) filename += '.ts';
    if (cache.has(filename)) return cache.get(filename);
    const module = { exports: {} }; cache.set(filename, module.exports);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports,
      performance: { now: () => 100 }, ...globals,
      require: id => id === 'three' ? three : load(path.resolve(path.dirname(filename), id)) });
    return module.exports;
  }
  return name => load(path.join(root, 'src/prototypes/roster3d', name));
}
test('all nine classes and all Druid forms are distinct actual meshes, finite in every animation, and fully disposable', () => {
  const load = loader(), { ROSTER } = load('roster'), { createCharacterModel } = load('characterModel');
  assert.equal(ROSTER.length, 9);
  const signatures = new Set();
  const specs = [...ROSTER.map(c => [c.id, '']), ['druid', 'bear'], ['druid', 'tiger'], ['druid', 'tree']];
  for (const [id, form] of specs) {
    const model = createCharacterModel(id, form);
    assert.ok(model.root instanceof THREE.Group);
    assert.ok(model.stats.triangles > 100 && model.stats.triangles <= 3500, `${id}/${form} triangle budget`);
    let meshes = 0; const resources = new Set();
    model.root.traverse(o => {
      if (!o.isMesh) return; meshes++; resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
    });
    assert.equal(meshes, model.stats.meshes);
    signatures.add(`${model.stats.triangles}/${meshes}`);
    model.root.rotation.y = .63;
    for (const mode of ['idle', 'run', 'attack', 'cast']) for (const progress of [0, .2, .5, .9, 1]) {
      for (const variant of [undefined, 'shadow', 'fire', 'rampage', undefined]) {
        model.animate({ time: 12 + progress, mode, progress, variant });
        model.root.updateMatrixWorld(true);
        model.root.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite), `${id}/${form}/${mode} finite transforms`));
        assert.equal(model.root.rotation.y, .63, 'the atlas owns facing');
        const box = new THREE.Box3().setFromObject(model.root);
        assert.ok(box.max.y < 11 && box.min.y > -1.5, `${id}/${form} bounded body pose`);
      }
    }
    let disposed = 0; resources.forEach(r => r.addEventListener('dispose', () => disposed++));
    model.dispose();
    assert.equal(disposed, resources.size, `${id}/${form} releases geometry and materials`);
  }
  assert.equal(signatures.size, specs.length, 'do not substitute one recolored body for the whole roster');
});
test('shared battle atlas renders both teams once at 30 Hz, preserves inputs, transforms Druids and falls back on loss', () => {
  let frames = 0, copies = 0, contexts = 0, lost = false;
  class Renderer {
    constructor({ canvas }) { contexts++; this.domElement = canvas; }
    info = { render: { calls: 30, triangles: 1500 } };
    setPixelRatio() {} setSize() {} setClearColor() {} setScissorTest() {}
    setScissor() {} setViewport() {} clear() {} dispose() {} forceContextLoss() {}
    getContext() { return { isContextLost: () => lost }; }
    render() { frames++; }
  }
  const load = loader({ document: { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ clearRect() {}, drawImage() { copies++; } }) }) } },
  { ...THREE, WebGLRenderer: Renderer });
  let entities = ['warrior', 'priest', 'frostmage', 'rogue', 'paladin', 'druid'].map((classId, i) =>
    Object.freeze({ alive: true, team: i < 3 ? 'player' : 'enemy', classId, x: i * 30, y: 100,
      atkAnimAt: 0, extra: Object.freeze({}), status: Object.freeze({}) }));
  const before = JSON.stringify(entities), images = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {},
    drawImage: (...args) => images.push(args.slice(1)) };
  const renderer = load('battleRenderer').createRosterBattleRenderer(() => entities);
  for (const e of entities) assert.equal(renderer.draw(ctx, e, 1), true);
  assert.equal(contexts, 1); assert.equal(frames, 6); assert.equal(copies, 1);
  assert.equal(renderer.stats.units, 6);
  assert.equal(renderer.stats.modeCounts.attack, 0);
  assert.equal(renderer.handled(entities[4]), true, 'enemy noncaptains use 3D too');
  assert.deepEqual(images.map(args => args.slice(0, 2)), [[0, 0], [160, 0], [320, 0], [0, 160], [160, 160], [320, 160]]);
  assert.equal(JSON.stringify(entities), before, 'never change real combat entities');
  renderer.draw(ctx, entities[0], 1.01); assert.equal(frames, 6);
  renderer.enabled = false; assert.equal(renderer.draw(ctx, entities[0], 1.02), false); assert.equal(renderer.handled(entities[0]), false);
  renderer.enabled = true;
  const druid = { ...entities[5], extra: { form: 'bear' }, atkAnimAt: 1030, atkAnimDur: .34 };
  entities = [...entities.slice(0, 5), druid];
  assert.equal(renderer.draw(ctx, druid, 1.04), true); assert.equal(renderer.stats.modeCounts.attack, 1);
  assert.equal(renderer.draw(ctx, { ...druid, isPet: true }, 1.05), false);
  assert.equal(renderer.draw(ctx, { ...druid, status: { polymorphed: true } }, 1.05), false);
  lost = true; assert.equal(renderer.draw(ctx, druid, 1.08), false);
  assert.equal(renderer.stats.phase, 'failed'); assert.match(renderer.stats.error, /original characters/);
  renderer.dispose(); renderer.dispose();
});
test('roster bridge is embedded opt-in practice only, validates all teams before changing setup, and creates only local matches', () => {
  const source = readFileSync(path.join(root, 'public/roster-battle-bridge.js'), 'utf8');
  for (const practice of [false, true]) for (const optin of [false, true]) for (const embedded of [false, true]) {
    const window = {}; window.parent = embedded ? {} : window;
    let starts = 0, request;
    const context = vm.createContext({ window, URLSearchParams, Set,
      location: { search: optin ? '?rosterBattlePreview=1' : '' },
      PRACTICE_ONLY: practice, GUEST_TRIAL: true, state: null,
      playerProfile: { gold: 0 }, selected: [], selectedBuilds: [], abilityChoice: {}, ultChoice: {},
      captainClass: null, captainRacial: null, setTeamSize: n => assert.equal(n, 3),
      startBattle: opts => { starts++; request = opts; } });
    vm.runInContext(source, context);
    const bridge = window.RosterBattleGame;
    assert.equal(!!bridge, practice && optin && embedded);
    if (!bridge) continue;
    assert.throws(() => bridge.start({ player: ['bad'], enemy: ['warrior', 'paladin', 'priest'] }), /three valid/);
    assert.equal(starts, 0); assert.equal(context.selected.length, 0);
    const player = ['warlock', 'druid', 'shaman'], enemy = ['rogue', 'paladin', 'archer'];
    bridge.start({ player, enemy, druidAbility: 'custom' });
    assert.equal(starts, 1); assert.deepEqual(Array.from(context.selected), player);
    assert.equal(context.selectedBuilds[1].ability, 'custom');
    assert.equal(context.captainClass, 'warlock'); assert.equal(request.enemyCaptainClass, 'rogue');
    assert.equal(request._ordersConfirmed, true); assert.equal(request._arenaTipShown, true);
    assert.equal(request._priorityPrepared, true);
    assert.equal(request.onlineChallenge, undefined); assert.equal(request.tournament, undefined);
    assert.equal(bridge.snapshot().gold, 0);
    bridge.beginFrame(12); assert.equal(bridge.clock(12.4), 12, 'one timestamp throughout a render frame');
  }
});
test('practice presets cover the complete roster and core hooks remain opt-in body-only', () => {
  const load = loader(), { ROSTER } = load('roster'), { LINEUPS } = load('lineups');
  const offered = new Set(LINEUPS.flatMap(l => [...l.player, ...l.enemy]));
  for (const cls of ROSTER) assert.ok(offered.has(cls.id));
  const game = readFileSync(path.join(root, 'public/game.html'), 'utf8');
  assert.match(game, /window\.RosterBattleGame && window\.RosterBattlePreview\?\.draw/);
  assert.match(game, /window\.RosterBattlePreview\?\.handled\(e\)/);
  assert.match(game, /if\(isSteelCyclone && !live3dBody\)/);
});
test('all bosses, pets and Demon minions are distinct, budgeted, bounded meshes with disposable noncumulative animation', () => {
  const load = loader(), { CREATURES } = load('creatures'), { createCharacterModel } = load('characterModel');
  assert.equal(CREATURES.length, 9);
  const signatures = new Set();
  for (const { id } of CREATURES) {
    const model = createCharacterModel(id), resources = new Set();
    assert.ok(model.stats.triangles <= 3000);
    assert.ok(model.stats.meshes <= (id.startsWith('boss-') ? 55 : 45), `${id} draw-call budget`);
    signatures.add(`${model.stats.triangles}/${model.stats.meshes}`);
    model.root.traverse(o => {
      if (!o.isMesh) return;
      resources.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) resources.add(m);
    });
    const box = new THREE.Box3();
    for (const mode of ['idle', 'run', 'attack', 'cast']) for (const progress of [0, .15, .4, .55, .8, 1]) {
      const pose = { mode, time: 19 + progress, progress };
      model.animate(pose); model.root.updateMatrixWorld(true);
      const first = [];
      model.root.traverse(o => first.push(...o.matrixWorld.elements));
      model.animate({ mode: 'cast', time: 33, progress: .7 });
      model.animate(pose); model.root.updateMatrixWorld(true);
      const again = [];
      model.root.traverse(o => again.push(...o.matrixWorld.elements));
      assert.deepEqual(again, first, `${id}/${mode} resets its entire pose`);
      assert.ok(again.every(Number.isFinite));
      box.union(new THREE.Box3().setFromObject(model.root));
    }
    assert.ok(box.min.y > -.4 && box.max.y < 7.5, `${id} stays inside the atlas view`);
    let disposed = 0; resources.forEach(r => r.addEventListener('dispose', () => disposed++));
    model.dispose(); assert.equal(disposed, resources.size);
  }
  assert.equal(signatures.size, CREATURES.length);
});
test('creature selection uses actual encounter flags and pet class IDs, never relabels ordinary Warriors', () => {
  const { entityModelId } = loader()('creatures');
  assert.equal(entityModelId({ classId: 'warrior' }), 'warrior');
  for (const id of ['frost', 'demon', 'temple']) assert.equal(entityModelId({ classId: 'warrior', _dungeonBoss: true, _dungeonEncounterId: id }), `boss-${id}`);
  assert.equal(entityModelId({ classId: 'warrior', _dungeonBoss: { id: 'frost' } }), 'boss-frost');
  assert.equal(entityModelId({ classId: 'warrior', _dungeonBoss: true, _dungeonEncounterId: 'unknown' }), null);
  for (const id of ['pet-archer', 'pet-archer-snake', 'pet-archer-turtle', 'pet-frostmage']) assert.equal(entityModelId({ classId: id, isPet: true }), id);
  assert.equal(entityModelId({ classId: 'unknown-pet', isPet: true }), null);
  assert.equal(entityModelId({ classId: 'warrior', _dungeonAdd: true, name: 'Demon Hound' }), 'add-hound');
  assert.equal(entityModelId({ classId: 'warrior', _dungeonAdd: true, name: 'Demon Guard' }), 'add-guard');
});
test('one expanding atlas includes real pets and bosses, keeps readback once per frame and falls back safely at capacity', () => {
  let copies = 0, contexts = 0, frames = 0;
  const sizes = [], viewports = [];
  class Renderer {
    constructor({ canvas }) { contexts++; this.domElement = canvas; }
    info = { render: { calls: 20, triangles: 500 } };
    setPixelRatio() {} setSize(w, h) { sizes.push([w, h]); } setClearColor() {} setScissorTest() {}
    setScissor() {} setViewport(...rect) { viewports.push(rect); } clear() {} dispose() {} forceContextLoss() {}
    getContext() { return { isContextLost: () => false }; }
    render() { frames++; }
  }
  const load = loader({ document: { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ clearRect() {}, drawImage() { copies++; } }) }) } }, { ...THREE, WebGLRenderer: Renderer });
  const { CREATURES } = load('creatures');
  const entities = CREATURES.map(({ id, name }, i) => Object.freeze({
    alive: true, team: 'enemy', x: 30 * i, y: 100, classId: id.startsWith('pet-') ? id : 'warrior',
    isPet: id.startsWith('pet-'), name, _dungeonBoss: id.startsWith('boss-'),
    _dungeonEncounterId: id.startsWith('boss-') ? id.slice(5) : undefined,
    _dungeonAdd: id.startsWith('add-'), status: Object.freeze({}), extra: Object.freeze({}),
  }));
  const before = JSON.stringify(entities), images = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {}, drawImage: (...a) => images.push(a.slice(1)) };
  let live = entities;
  const renderer = load('battleRenderer').createRosterBattleRenderer(() => live);
  entities.forEach(e => assert.equal(renderer.draw(ctx, e, 1), true));
  assert.equal(contexts, 1); assert.equal(copies, 1); assert.equal(frames, 9);
  assert.deepEqual(sizes, [[480, 320], [480, 480]]);
  assert.deepEqual(viewports.map(v => v.slice(0, 2)), [[0, 320], [160, 320], [320, 320], [0, 160], [160, 160], [320, 160], [0, 0], [160, 0], [320, 0]]);
  assert.equal(new Set(renderer.stats.classes).size, 9);
  assert.equal(JSON.stringify(entities), before);
  renderer.enabled = false;
  entities.forEach(e => assert.equal(renderer.handled(e), false));
  renderer.enabled = true; renderer.reset();
  live = [...entities, ...entities.map(e => ({ ...e })), { ...entities[0] }];
  const oldCopies = copies;
  live.forEach((e, i) => assert.equal(renderer.draw(ctx, e, 2), i < 18));
  assert.equal(copies, oldCopies + 1, 'overflow uses Original without extra same-frame copies');
  assert.equal(renderer.stats.units, 18);
  renderer.dispose();
});