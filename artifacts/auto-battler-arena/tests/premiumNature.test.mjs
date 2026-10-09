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
const { createAdventurer } = load('adventurerModels.ts');
const { createPremiumNatureModel } = load('premiumRoster/nature.ts');

const snap = (m) => { const s = []; m.root.traverse((o) => s.push([o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), o.visible, o.isMesh ? o.material.uuid : ''])); return JSON.stringify(s); };
const draws = (m) => { let n = 0; m.root.traverse((o) => { if (o.isMesh) n++; }); return n; };

for (const [id, form] of [['archer', ''], ['druid', ''], ['druid', 'bear'], ['druid', 'tiger'], ['druid', 'tree']]) {
  test(`premium nature ${id} ${form}`, () => {
    const base = createAdventurer(id, form);
    const m = createPremiumNatureModel(id, form);
    if (form === 'tree') { assert.equal(m.stats.triangles, base.stats.triangles); return; }
    console.log(id, form, 'tris', m.stats.triangles, 'draws', draws(m), 'mats', m.stats.materials, 'base', base.stats.triangles, draws(base));
    assert.ok(m.stats.triangles <= 2500, `triangles ${m.stats.triangles}`);
    assert.ok(m.stats.materials <= base.stats.materials);
    assert.ok(draws(m) <= Math.max(38, 0) || draws(m) <= draws(base) - 4);
    m.root.traverse((o) => { if (o.isMesh) { for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
      if (o.geometry.attributes.color) assert.ok(o.material.vertexColors); else assert.ok(!o.material.vertexColors); } });
    for (const mode of ['idle', 'run', 'attack', 'cast']) for (const progress of [0, 0.5, 1]) {
      const pose = { time: 1.3, mode, progress };
      m.animate(pose); const a = snap(m);
      m.animate(pose); assert.equal(snap(m), a, `idempotent ${mode}`);
      m.animate({ time: 0.2, mode: 'run', progress: 0.3 }); m.animate(pose);
      assert.equal(snap(m), a, `history ${mode}`);
    }
    if (id === 'archer') for (const pr of [.2, .4, .55]) {
      m.animate({ time: 1, mode: 'attack', progress: pr }); m.root.updateMatrixWorld(true);
      let arrow; m.root.traverse((o) => { if (o.isGroup && o.children.length === 2 && o.children.every((c) => c.isMesh) && o.parent?.children.some((c) => c.isMesh && c.geometry.index.count === 108)) arrow = o; });
      const bow = arrow.parent, sx = arrow.scale.x;
      const nock = -.2 * sx + arrow.position.x, tip = 1.6 * sx + arrow.position.x;
      const strX = bow.children.find((c) => c.isMesh && c.geometry.index.count === 108).position.x;
      assert.ok(Math.abs(nock - strX) < 1e-6, 'nock on apex'); assert.ok(tip > 1.5, `tip ${tip} past palm`);
    }
    m.dispose(); m.dispose(); base.dispose();
  });
}
