import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const require = createRequire(import.meta.url), ts = require('typescript');
Module._extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
const dir = new URL('../src/prototypes/roster3d/', import.meta.url);
const load = f => require(fileURLToPath(new URL(f + '.ts', dir)));
const { createPremiumRosterModel, isPremiumRosterModel } = load('premiumRoster/index');
const { createCharacterModel } = load('characterModel');
const { createPremiumMageModel } = load('magePremiumModel');
const { createPremiumMageMotion } = load('magePremiumMotion');
const { createPremiumRosterMotion } = load('premiumRoster/motion');
const { drawPremiumRosterVfx } = load('premiumRoster/vfx');
const { MODEL_ROSTER } = load('creatures');
const snapshot = root => {
  const rows = [];
  root.traverse(o => rows.push([o.type, o.visible, o.position.toArray(), o.rotation.toArray(), o.scale.toArray(),
    o.isMesh ? Array.from(o.geometry.attributes.position?.array || []) : null,
    o.isMesh ? o.material.color.getHexString() : null]));
  return JSON.stringify(rows);
};
const cases = ['paladin', 'rogue', 'archer', 'warrior', 'priest', 'shaman', 'warlock', 'druid'].map(id => [id, '']);
cases.push(['druid', 'bear'], ['druid', 'tiger']);

for (const [id, form] of cases) test(`premium ${id} ${form}: bounded resources, unchanged pose timing, no accumulated transforms`, () => {
  const raw = createPremiumRosterModel(id, form), base = createCharacterModel(id, form);
  assert.equal(isPremiumRosterModel(id, form), true);
  assert(raw.stats.triangles <= Math.max(2500, base.stats.triangles), `${raw.stats.triangles} triangles`);
  let visible = 0, originalVisible = 0;
  raw.root.traverseVisible(o => { if (o.isMesh) visible++; });
  base.root.traverseVisible(o => { if (o.isMesh) originalVisible++; });
  assert(visible <= originalVisible + (id === 'archer' ? 1 : 0), `${visible} visible meshes vs ${originalVisible}`);
  assert(raw.stats.materials <= base.stats.materials, 'no extra material allocations');
  assert.deepEqual(raw.root.scale.toArray(), base.root.scale.toArray(), 'same world scale');
  raw.root.traverse(o => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    for (const v of o.geometry.attributes.position.array) assert(Number.isFinite(v));
    if (o.geometry.attributes.color) for (const v of o.geometry.attributes.color.array) assert(Number.isFinite(v));
  });
  for (const variant of [undefined, 'shadow', 'rampage', undefined]) {
    for (const mode of ['idle', 'run', 'attack', 'cast']) {
      const pose = { mode, time: 1.45, progress: .7, variant };
      raw.animate(pose); const first = snapshot(raw.root);
      for (let i = 0; i < 8; i++) raw.animate(pose);
      assert.equal(snapshot(raw.root), first, `${mode}/${variant} does not accumulate`);
    }
  }
  const poses = [], originalAnimate = raw.animate;
  raw.animate = p => { poses.push(p); originalAnimate(p); };
  const wrapper = createPremiumRosterMotion(raw, id), exact = { mode: 'cast', time: 2.7, progress: .41 };
  wrapper.animate(exact); assert.equal(poses.at(-1), exact);
  wrapper.dispose(); wrapper.dispose(); base.dispose();
});

test('approved Cryomancer geometry and all motion remain exactly the same', () => {
  const current = createPremiumMageMotion(createPremiumMageModel()), roster = createPremiumRosterModel('frostmage');
  for (const variant of [undefined, 'fire', undefined]) for (const mode of ['idle', 'run', 'attack', 'cast']) {
    const pose = { variant, mode, time: 1.45, progress: .7 };
    current.animate(pose); roster.animate(pose);
    assert.equal(snapshot(roster.root), snapshot(current.root), `${mode}/${variant}`);
  }
  assert.deepEqual(roster.stats, current.stats);
  current.dispose(); roster.dispose();
});

test('bosses, companions, dungeon minions and Tree Form retain exact base models', () => {
  const ids = MODEL_ROSTER.filter(r => r.group !== 'Heroes').map(r => [r.id, '']);
  ids.push(['druid', 'tree']);
  for (const [id, form] of ids) {
    assert.equal(isPremiumRosterModel(id, form), false);
    const base = createCharacterModel(id, form), premium = createPremiumRosterModel(id, form);
    for (const mode of ['idle', 'run', 'attack', 'cast']) {
      const pose = { mode, time: 1.45, progress: .7 };
      base.animate(pose); premium.animate(pose);
      assert.equal(snapshot(premium.root), snapshot(base.root), `${id}/${form}/${mode}`);
    }
    base.dispose(); premium.dispose();
  }
});

test('approved premium roster is the normal 3D factory, not a gallery query setting', () => {
  const src = readFileSync(new URL('gameIntegration.ts', dir), 'utf8');
  assert.match(src, /premiumRoster: PREMIUM_ROSTER_FACTORY/);
  assert.doesNotMatch(src, /get\('premium'\)/);
  const game = readFileSync(new URL('../../../public/game.html', dir), 'utf8');
  assert.match(game, /data-testid="select-profile-graphics"/);
  assert.doesNotMatch(game, /data-testid="select-battle-graphics"/);
  assert.match(game, /const healthBarLift = \(window\.GameBody3D\?\.handled\(e\)/);
  assert.match(game, /e\.y-e\.radius-14-healthBarLift/);
  const hud = game.slice(game.indexOf('  // health bar\n'), game.indexOf('  // Captain crown'));
  const barY = new Function('e', 'monsterKind', 'window', hud + '\nreturn by;');
  const entity = { x: 100, y: 100, radius: 14 };
  assert.equal(barY(entity, false, { GameBody3D: { handled: () => true } }), 64);
  assert.equal(barY(entity, false, { GameBody3D: { handled: () => false } }), 72);
  assert.equal(barY({ ...entity, _dungeonBoss: true }, true, { GameBody3D: { handled: () => true } }), 168);
});

test('bounded premium class accents preserve inherited alpha and entity state', () => {
  const calls = [], state = { globalAlpha: .25 }, stack = [];
  const ctx = new Proxy(state, { get(o, k) {
    if (k in o) return o[k];
    if (k === 'save') return () => stack.push({ ...o });
    if (k === 'restore') return () => { for (const key of Object.keys(o)) delete o[key]; Object.assign(o, stack.pop()); };
    return (...args) => calls.push([k, args, o.globalAlpha]);
  } });
  for (const [classId] of cases) {
    const e = { alive: true, classId, x: 0, y: 0, team: 'player', casting: { total: 1, timeLeft: .5 }, extra: {} };
    const before = JSON.stringify(e); calls.length = 0;
    drawPremiumRosterVfx(ctx, e, 2);
    assert.equal(JSON.stringify(e), before); assert.equal(state.globalAlpha, .25);
    assert(calls.filter(([name]) => name === 'stroke').length <= 4);
    assert(calls.every(([, args, alpha]) => alpha <= .25 && args.filter(v => typeof v === 'number').every(Number.isFinite)));
    calls.length = 0;
    drawPremiumRosterVfx(ctx, { ...e, alive: false }, 2);
    drawPremiumRosterVfx(ctx, { ...e, classId: 'boss-frost' }, 2);
    drawPremiumRosterVfx(ctx, { ...e, classId: 'pet-snake' }, 2);
    assert.equal(calls.length, 0);
  }
});