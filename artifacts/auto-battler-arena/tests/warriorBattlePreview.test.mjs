import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';

function loader(globals = {}, three = THREE) {
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const source = readFileSync(new URL(`../src/prototypes/warrior3d/${name}.ts`, import.meta.url), 'utf8');
    const module = { exports: {} };
    cache.set(name, module.exports);
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, performance: { now: () => 100 },
      require: id => id === 'three' ? three : load(id.replace('./', '')), ...globals });
    return module.exports;
  }
  return load;
}
const pose = loader()('battlePose');
const animation = loader()('warriorAnimation');

test('match poses follow actual attack windows and do not invent strikes; roots still allow attacks, stuns freeze them', () => {
  const input = { time: 12, moving: false, stunned: false, rooted: false, attackElapsed: Infinity, attackDuration: .34 };
  const out = animation.createPose();
  assert.equal(pose.sampleBattlePose(input, out).mode, 'idle');
  assert.equal(pose.sampleBattlePose({ ...input, moving: true }, out).mode, 'run');
  assert.equal(pose.sampleBattlePose({ ...input, moving: true, rooted: true }, out).mode, 'idle');
  for (const elapsed of [0, .001, .1, .339]) {
    const sample = pose.sampleBattlePose({ ...input, rooted: true, attackElapsed: elapsed }, out);
    assert.equal(sample.mode, 'attack');
    assert.equal(sample.pose, out);
    assert.ok(Array.from(out).every(Number.isFinite));
  }
  for (const elapsed of [-1, .34, Infinity, NaN]) {
    assert.equal(pose.sampleBattlePose({ ...input, attackElapsed: elapsed }, out).mode, 'idle');
  }
  const stunned = pose.sampleBattlePose({ ...input, moving: true, stunned: true, attackElapsed: .1 }, out);
  assert.equal(stunned.mode, 'idle');
  assert.deepEqual(Array.from(stunned.pose), Array.from(animation.samplePose('idle', 0, animation.createPose())));
});

test('body-local compositor replaces only the friendly Warrior captain, throttles GPU work, and preserves entity input', () => {
  const calls = [];
  let frames = 0, lost = false, disposed = 0;
  class Renderer {
    info = { render: { calls: 72, triangles: 3400 } };
    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    getContext() { return { isContextLost: () => lost }; }
    render() { frames++; }
    dispose() { disposed++; }
    forceContextLoss() {}
  }
  const load = loader({ document: { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ clearRect() {}, drawImage() {} }) }) } },
    { ...THREE, WebGLRenderer: Renderer });
  const renderer = load('battleRenderer').createBattleRenderer();
  const ctx = { save() {}, restore() {}, beginPath() {}, fill() {},
    ellipse: (...args) => calls.push(['shadow', ...args]),
    drawImage: (...args) => calls.push(['image', ...args.slice(1)]) };
  const actor = Object.freeze({ alive: true, team: 'player', isCaptain: true, classId: 'warrior',
    x: 250, y: 340, radius: 17, moveSpeed: 0, atkAnimAt: 0 });
  const before = JSON.stringify(actor);
  for (const changed of [{ team: 'enemy' }, { isCaptain: false }, { classId: 'priest' }, { isPet: true }, { alive: false }]) {
    assert.equal(renderer.draw(ctx, { ...actor, ...changed }, 10), false);
  }
  assert.equal(renderer.stats.phase, 'loading');
  assert.equal(renderer.draw(ctx, actor, .1), true);
  assert.equal(renderer.stats.modeCounts.attack, 0, 'unset attack timestamp must not produce an opening fake swing');
  assert.equal(renderer.draw(ctx, actor, .11), true);
  assert.equal(frames, 1);
  assert.equal(renderer.stats.cachedDraws, 1);
  assert.deepEqual(calls.find(c => c[0] === 'image'), ['image', -42.5, -47, 85, 85]);
  assert.deepEqual(calls.find(c => c[0] === 'shadow').slice(1, 3), [0, 13]);
  assert.equal(JSON.stringify(actor), before);
  renderer.enabled = false;
  assert.equal(renderer.draw(ctx, actor, .15), false);
  renderer.enabled = true;
  assert.equal(renderer.draw(ctx, actor, .15), true);
  assert.equal(frames, 2);
  lost = true;
  assert.equal(renderer.draw(ctx, actor, .19), false);
  assert.equal(renderer.stats.phase, 'failed');
  assert.match(renderer.stats.error, /original Warrior/);
  renderer.dispose();
  renderer.dispose();
  assert.equal(disposed, 1);
});

test('practice bridge is unavailable outside an embedded opt-in practice document and only invokes ordinary local combat', () => {
  const source = readFileSync(new URL('../public/warrior-battle-bridge.js', import.meta.url), 'utf8');
  for (const practice of [false, true]) for (const enabled of [false, true]) {
    let starts = 0;
    const window = { parent: {} };
    vm.runInNewContext(source, { window, URLSearchParams,
      location: { search: enabled ? '?guest=1&practice=1&warriorBattlePreview=1' : '?practice=1' },
      PRACTICE_ONLY: practice, GUEST_TRIAL: true,
      state: { entities: [], over: false }, playerProfile: { gold: 0 },
      startBattle: opts => {
        starts++;
        assert.equal(opts._ordersConfirmed, true);
        assert.equal(opts._arenaTipShown, true);
        assert.equal(opts._priorityPrepared, true);
        assert.equal(opts.tournament, undefined);
        assert.equal(opts.onlineChallenge, undefined);
        assert.deepEqual(Array.from(opts.enemyTeam), ['warrior', 'priest', 'frostmage']);
      } });
    assert.equal(!!window.WarriorBattleGame, practice && enabled);
    if (window.WarriorBattleGame) {
      window.WarriorBattleGame.start();
      assert.equal(starts, 1);
      assert.equal(window.WarriorBattleGame.snapshot().gold, 0);
    }
  }
});