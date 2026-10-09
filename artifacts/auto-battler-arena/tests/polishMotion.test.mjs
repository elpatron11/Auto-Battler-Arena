import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const sourcePath = new URL('../src/prototypes/roster3d/polishMotion.ts', import.meta.url);
const filename = fileURLToPath(sourcePath);
const source = readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = new Module(filename);
compiledModule.filename = filename;
compiledModule.paths = Module._nodeModulePaths(fileURLToPath(new URL('..', sourcePath)));
compiledModule._compile(compiled, filename);
const { createPolishMotion, getPolishReactionWeights } = compiledModule.exports;

function fixture() {
  const joint = {
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
  const received = [];
  const disposed = { called: false };
  const model = {
    root: { children: [joint] },
    stats: { meshes: 1 },
    animate(pose) {
      received.push(pose);
      // A minimal authoritative animator which fully resets its baseline.
      joint.rotation.x = pose.mode === 'attack' ? pose.progress * 0.2 : 0.03;
      joint.rotation.y = 0.1;
      joint.rotation.z = 0;
      joint.position.x = 0;
      joint.position.y = pose.mode === 'run' ? 0.08 : 0;
      joint.position.z = 0;
      joint.scale.x = 1;
      joint.scale.y = 1;
      joint.scale.z = 1;
    },
    dispose() { disposed.called = true; },
  };
  return { model, joint, received, disposed };
}

test('polish motion forwards the exact pose and preserves the model interface', () => {
  const { model, joint, received, disposed } = fixture();
  const polished = createPolishMotion(model, 'warrior');
  const pose = { time: 2.25, mode: 'attack', progress: 0.4, variant: 'rampage' };

  polished.animate(pose);

  assert.equal(received.length, 1);
  assert.equal(received[0], pose);
  assert.equal(polished.root, model.root);
  assert.equal(polished.stats, model.stats);
  assert.equal(typeof polished.setVisualReaction, 'function');
  polished.dispose();
  assert.equal(disposed.called, true);
  assert.ok(Number.isFinite(joint.rotation.z));
});

test('repeated frames restore the base pose before adding polish, so transforms do not drift', () => {
  const { model, joint, received } = fixture();
  const polished = createPolishMotion(model, 'archer');
  const pose = { time: 4, mode: 'run', progress: 0, variant: undefined };

  polished.animate(pose);
  const first = {
    rotation: { ...joint.rotation },
    position: { ...joint.position },
    scale: { ...joint.scale },
  };
  polished.animate(pose);

  assert.deepEqual(joint.rotation, first.rotation);
  assert.deepEqual(joint.position, first.position);
  assert.deepEqual(joint.scale, first.scale);
  assert.equal(received.length, 2);
  assert.equal(received[1], pose);
});

test('visual hit/death weights are bounded and resettable without changing pose timing', () => {
  const { model, joint } = fixture();
  const polished = createPolishMotion(model, 'paladin');
  const pose = { time: 1, mode: 'idle', progress: 0 };

  polished.setVisualReaction(4, -2);
  polished.animate(pose);
  const reactedY = joint.rotation.z;
  polished.setVisualReaction(0, 0);
  polished.animate(pose);

  assert.notEqual(reactedY, joint.rotation.z);
  assert.ok(Number.isFinite(joint.scale.y));
});

test('reaction weights use the supplied practice clock, hitFlashAt, and alive state', () => {
  const entity = { alive: true, hitFlashAt: 1000, hitFlashDur: 0.2 };
  const pausedClock = 1.1;
  const active = getPolishReactionWeights(entity, pausedClock);
  assert.ok(active.hit > 0.99);
  assert.equal(active.death, 0);
  assert.deepEqual(getPolishReactionWeights(entity, 1.5), { hit: 0, death: 0 });
  assert.deepEqual(getPolishReactionWeights({ ...entity, alive: false }, 1.1), { hit: active.hit, death: 1 });
});