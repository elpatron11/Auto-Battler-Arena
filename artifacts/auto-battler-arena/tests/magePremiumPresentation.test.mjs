import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url), ts = require('typescript'), THREE = require('three');
Module._extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
const dir = new URL('../src/prototypes/roster3d/', import.meta.url);
const load = f => require(fileURLToPath(new URL(f + '.ts', dir)));
const { createPremiumMageModel } = load('magePremiumModel');
const { createPremiumMageMotion } = load('magePremiumMotion');
const { createCharacterModel } = load('characterModel');
const { drawPremiumMageVfx } = load('magePremiumVfx');
const snapshot = root => {
  const rows = []; root.traverse(o => rows.push([o.type, o.position.toArray(), o.rotation.toArray(), o.scale.toArray(),
    o.isMesh ? o.geometry.attributes.position.count : 0, o.isMesh ? o.material.color.getHexString() : '']));
  return JSON.stringify(rows);
};

test('premium secondary motion forwards exact timing and never accumulates', () => {
  const base = createPremiumMageModel(), poses = [], animate = base.animate;
  base.animate = p => { poses.push(p); animate(p); };
  const model = createPremiumMageMotion(base);
  for (const mode of ['idle', 'run', 'cast', 'attack']) {
    const pose = { time: 1.25, progress: .8, mode };
    model.animate(pose); const first = snapshot(model.root);
    for (let i = 0; i < 20; i++) model.animate(pose);
    assert.equal(snapshot(model.root), first);
    assert.equal(poses.at(-1), pose);
  }
  model.setVisualReaction(1, .7); model.animate({ time: 1, progress: 0, mode: 'idle' });
  model.setVisualReaction(0, 0);
  const pose = { time: 1.25, progress: .8, mode: 'idle' };
  model.animate(pose); const reset = snapshot(model.root);
  const reference = createPremiumMageMotion(createPremiumMageModel()); reference.animate(pose);
  assert.equal(reset, snapshot(reference.root));
  model.dispose(); reference.dispose();
});

test('premium renderer refines only Cryomancer, including when old polish flag is also set', () => {
  let rendered = [], factoryCalls = 0;
  class Renderer {
    domElement = {}; info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio() {} setSize() {} setClearColor() {} setScissorTest() {} clear() {} setViewport() {} setScissor() {} dispose() {} forceContextLoss() {}
    getContext() { return { isContextLost: () => false }; }
    render(scene) {
      const root = scene.children.find(o => o.type === 'Group');
      rendered.push([root.name, snapshot(root)]);
      let calls = 0, triangles = 0; root.traverse(o => { if (o.isMesh) { calls++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
      this.info.render = { calls, triangles };
    }
  }
  const ctx = new Proxy({ globalAlpha: 1 }, { get: (o, k) => k in o ? o[k] : () => {} });
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('battleRenderer.ts', dir), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: module.exports, module, performance, document: { createElement: () => ({ getContext: () => ctx }) },
    require: id => id === 'three' ? { ...THREE, WebGLRenderer: Renderer } : load(id.replace(/^\.\//, '')) });
  const entities = ['warrior', 'priest', 'frostmage', 'shaman', 'druid'].map((classId, i) => ({
    classId, team: 'player', alive: true, x: 10 + i, y: 10, extra: {}, status: {},
  }));
  const before = JSON.stringify(entities);
  const make = module.exports.createRosterBattleRenderer;
  const base = make(() => entities); base.draw(ctx, entities[0], 2);
  const normal = rendered; rendered = [];
  const premium = make(() => entities, { polished: true, premiumMage: () => { factoryCalls++; return createPremiumMageModel(); } });
  premium.draw(ctx, entities[0], 2);
  assert.equal(factoryCalls, 1);
  normal.forEach(([id, snap], i) => id === 'frostmage' ? assert.notEqual(rendered[i][1], snap) : assert.equal(rendered[i][1], snap, id));
  assert.equal(premium.stats.drawCalls, base.stats.drawCalls);
  assert.equal(JSON.stringify(entities), before, 'renderer never writes battle state');
  assert.equal(premium.drawTotems, undefined, 'no changes to another class totems');
  assert.equal(base.drawDeath, undefined, 'normal renderer stays baseline');
  entities[0].alive = false; assert.equal(premium.drawDeath(ctx, entities[0], 2.1), false);
  base.dispose(); premium.dispose();
});

test('normal controller and base caster asset remain separate from premium opt-in', () => {
  assert.doesNotMatch(readFileSync(new URL('gameIntegration.ts', dir), 'utf8'), /premiumMage|magePremium|createPremiumMage/);
  assert.doesNotMatch(readFileSync(new URL('casterModels.ts', dir), 'utf8'), /premiumMage|magePremium|createPremiumMage/);
});

test('crisp Mage accents are bounded, restore inherited alpha and never mutate combat', () => {
  const commands = [], state = { globalAlpha: .35 }, stack = [];
  const ctx = new Proxy(state, { get(o, key) {
    if (key in o) return o[key];
    if (key === 'save') return () => stack.push({ ...o });
    if (key === 'restore') return () => { for (const k of Object.keys(o)) delete o[k]; Object.assign(o, stack.pop()); };
    return (...args) => { commands.push([key, args, o.globalAlpha]); };
  } });
  const entity = { classId: 'frostmage', alive: true, casting: { total: 1, timeLeft: .5 } };
  const before = JSON.stringify(entity);
  drawPremiumMageVfx(ctx, entity, 2);
  assert.equal(state.globalAlpha, .35);
  assert.equal(JSON.stringify(entity), before);
  assert.equal(commands.filter(([name]) => name === 'fill').length, 8, 'four fixed two-plane facets');
  assert(commands.every(([, args, alpha]) => args.filter(v => typeof v === 'number').every(Number.isFinite) && alpha <= .35));
  commands.length = 0;
  for (const classId of ['priest', 'shaman', 'warrior']) drawPremiumMageVfx(ctx, { ...entity, classId }, 2);
  drawPremiumMageVfx(ctx, { ...entity, alive: false }, 2);
  drawPremiumMageVfx(ctx, { ...entity, casting: null }, 2);
  assert.equal(commands.length, 0, 'no accents on other classes, dead units or idle');
  drawPremiumMageVfx(ctx, { ...entity, casting: null, atkAnimAt: 1900, atkAnimDur: .34, ultVariant: 'custom' }, 2);
  assert.equal(state.globalAlpha, .35);
  assert.equal(commands.filter(([name]) => name === 'fill').length, 2, 'one attack facet, no particle spam');
});