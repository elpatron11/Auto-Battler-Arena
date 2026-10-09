import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';

function load(name, globals = {}) {
  const source = readFileSync(new URL(`../src/prototypes/warrior3d/${name}.ts`, import.meta.url), 'utf8');
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams,
    require: id => { assert.equal(id, 'three'); return THREE; }, ...globals });
  return module.exports;
}
const animation = load('warriorAnimation');
const model = load('warriorModel');

test('3D preview animation URLs are bounded to the three supported modes', () => {
  for (const mode of animation.ANIMATION_MODES) {
    assert.equal(animation.parseAnimation(`?animation=${mode}`), mode);
  }
  assert.equal(animation.parseAnimation('?animation=unknown'), 'idle');
  assert.equal(animation.parseAnimation(''), 'idle');
});

test('Warrior is a bounded genuine-depth mesh, not a 2D billboard', () => {
  const warrior = model.createWarrior();
  try {
    animation.applyPose(warrior.rig, animation.samplePose('idle', 0, animation.createPose()));
    const size = new THREE.Box3().setFromObject(warrior.root).getSize(new THREE.Vector3());
    assert.ok(size.x > 1 && size.y > 3 && size.z > 1);
    assert.ok(warrior.stats.triangles > 1000 && warrior.stats.triangles < 12000);
    assert.ok(warrior.stats.meshes < 100);
    assert.equal(warrior.stats.triangles, model.countTriangles(warrior.root));
    // Reference is the final composited original, not the base body beneath
    // the game's gold helmet/premium armor finishing layers.
    assert.equal(model.COLORS.steel, '#c4962e');
    assert.equal(model.COLORS.red, '#9d302e');
    assert.equal(model.COLORS.beard, '#351d14');
  } finally { warrior.dispose(); }
});

test('gait alternates, poses are finite and reusable, and attack has a cyclic windup/slash/recovery', () => {
  const pose = animation.createPose();
  const left = Array.from(animation.samplePose('run', animation.RUN_CYCLE_SECONDS / 4, pose));
  const right = Array.from(animation.samplePose('run', 3 * animation.RUN_CYCLE_SECONDS / 4, pose));
  assert.ok(left[animation.F.hipL] > 0.5 && right[animation.F.hipL] < -0.5);
  assert.ok(Math.abs(left[animation.F.hipL] + left[animation.F.hipR]) < 1e-9);
  assert.equal(animation.attackPhase(.5), 'windup');
  assert.equal(animation.attackPhase(.8), 'slash');
  assert.equal(animation.attackPhase(1.5), 'recovery');
  assert.deepEqual(Array.from(animation.samplePose('attack', 0, pose)),
    Array.from(animation.samplePose('attack', animation.ATTACK_PERIOD, pose)));
  for (const mode of animation.ANIMATION_MODES) {
    for (let i = 0; i < 120; i++) {
      assert.equal(animation.samplePose(mode, i * .04, pose), pose);
      assert.ok(Array.from(pose).every(Number.isFinite));
    }
  }
});

test('both hands hold the rigid sword and the support foot stays above the floor throughout each animation', () => {
  const warrior = model.createWarrior(), pose = animation.createPose(), target = new THREE.Vector3();
  const bounds = new THREE.Box3();
  try {
    for (const mode of animation.ANIMATION_MODES) {
      for (let i = 0; i < 120; i++) {
        animation.applyPose(warrior.rig, animation.samplePose(mode, i * .04, pose));
        for (const arm of warrior.rig.arms) {
          target.set(0, arm.gripY, 0).applyMatrix4(warrior.rig.sword.matrix);
          assert.ok(arm.hand.position.distanceTo(target) < .002, `${mode} ${i}: detached hand`);
        }
        warrior.root.updateMatrixWorld(true);
        const feet = warrior.rig.legs.map(leg => bounds.setFromObject(leg.hip).min.y);
        assert.ok(Math.min(...feet) >= -.015, `${mode} ${i}: foot below floor`);
        assert.ok(Math.min(...feet) < .1, `${mode} ${i}: both feet hovering`);
      }
    }
  } finally { warrior.dispose(); }
});

test('WebGL capability check releases its probe and reports unsupported graphics explicitly', () => {
  let released = false;
  const supported = load('webgl', { window: { devicePixelRatio: 3 },
    document: { createElement: () => ({ getContext: type => {
      assert.equal(type, 'webgl2');
      return { getExtension: () => ({ loseContext: () => { released = true; } }) };
    } }) } });
  assert.equal(supported.detectWebGL(), null);
  assert.equal(released, true);
  assert.equal(supported.cappedDpr(), 1.25);
  const unsupported = load('webgl', { document: { createElement: () => ({ getContext: () => null }) } });
  assert.match(unsupported.detectWebGL(), /WebGL 2/);
});

test('3D prototype stays an independent entry and is discoverable only through the development toolbar', () => {
  const toolbar = readFileSync(new URL('../src/components/VisualPreviewControls.tsx', import.meta.url), 'utf8');
  assert.ok(toolbar.indexOf('if (!import.meta.env.DEV) return null') < toolbar.indexOf('warrior-3d-preview.html'));
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.ok(!app.includes('warrior3d') && !app.includes('@react-three'));
  const stage = readFileSync(new URL('../src/prototypes/warrior3d/WarriorStage.tsx', import.meta.url), 'utf8');
  assert.match(stage, /frameloop="never"/);
  assert.match(stage, /shadows=\{false\}/);
  assert.match(stage, /1000 \/ 30/);
  assert.match(stage, /document\.hidden/);
});