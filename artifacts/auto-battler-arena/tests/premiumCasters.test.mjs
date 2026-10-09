import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
Module._extensions['.ts'] = (mod, filename) => {
  mod._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};
const dir = new URL('../src/prototypes/roster3d/', import.meta.url);
const load = (f) => require(fileURLToPath(new URL(f, dir)));
const { createCharacterModel } = load('characterModel.ts');
const { createPremiumCasterModel } = load('premiumRoster/casters.ts');

const snap = (m) => { const s = []; m.root.traverse((o) => s.push([o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), o.visible, o.isMesh ? o.material.uuid : ''])); return JSON.stringify(s); };
const names = (m) => { const n = []; m.root.traverse((o) => n.push(o.name + '|' + o.type)); return n; };

for (const id of ['priest', 'shaman', 'warlock']) {
  test(`premium ${id}`, () => {
    const base = createCharacterModel(id);
    const m = createPremiumCasterModel(id);
    assert.deepEqual(names(m), names(base), 'node hierarchy');
    assert.ok(m.stats.triangles <= 2500, `triangles ${m.stats.triangles}`);
    assert.ok(m.stats.materials <= base.stats.materials, 'no added materials');
    let joints = 0; m.root.traverse((o) => { if (o.userData.premiumJoint) joints++;
      if (o.isMesh) { for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
        if (o.geometry.attributes.color) assert.ok(o.material.vertexColors); } });
    assert.equal(joints, 4);
    const variants = id === 'priest' ? [undefined, 'shadow'] : [undefined];
    for (const variant of variants) for (const mode of ['idle', 'run', 'attack', 'cast']) for (const progress of [0, 0.5, 1]) {
      const pose = { time: 1.3, mode, progress, ...(variant ? { variant } : {}) };
      m.animate(pose); const a = snap(m);
      m.animate(pose); assert.equal(snap(m), a, `idempotent ${mode} ${variant}`);
      m.animate({ time: 0.2, mode: 'run', progress: 0.3 }); m.animate(pose);
      assert.equal(snap(m), a, `history independent ${mode}`);
      m.root.traverse((o) => assert.ok(Number.isFinite(o.position.x + o.position.y + o.position.z + o.quaternion.w)));
    }
    m.animate({ time: 0, mode: 'idle', progress: 0 });
    m.dispose(); m.dispose(); base.dispose();
  });
}
