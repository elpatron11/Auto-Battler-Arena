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
const THREE = require('three');
const dir = new URL('../src/prototypes/roster3d/', import.meta.url);
const load = (f) => require(fileURLToPath(new URL(f, dir)));
const { createCharacterModel } = load('characterModel.ts');
const { createPremiumMageModel } = load('magePremiumModel.ts');
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const info = (m) => {
  m.root.updateMatrixWorld(true);
  let t = 0, meshes = 0; const mats = new Set(), geos = new Set(), names = [];
  m.root.traverse((o) => { names.push(o.name + '|' + o.type); if (o.isMesh) { meshes++; t += tris(o.geometry); mats.add(o.material); geos.add(o.geometry); } });
  return { t, meshes, mats, geos, names, size: new THREE.Box3().setFromObject(m.root).getSize(new THREE.Vector3()) };
};
const snap = (m) => { const s = []; m.root.traverse((o) => s.push([o.position.toArray(), o.quaternion.toArray(), o.scale.toArray()])); return JSON.stringify(s); };

test('premium mage', () => {
  const base = createCharacterModel('frostmage'); base.animate({ time: 0, mode: 'idle', progress: 0 }); const b = info(base);
  const baseGeos = []; base.root.traverse((o) => o.isMesh && baseGeos.push(o.geometry));
  base.animate({ time: 0.7, mode: 'idle', progress: 0 }); const baseSnap = snap(base);
  const m = createPremiumMageModel(); m.animate({ time: 0, mode: 'idle', progress: 0 }); const a = info(m);
  let i = 0; base.root.traverse((o) => o.isMesh && assert.equal(o.geometry, baseGeos[i++]));
  assert.equal(snap(base), baseSnap);
  assert.deepEqual(a.names, b.names, 'node hierarchy');
  assert.equal(a.meshes, 38); assert.ok(a.meshes <= 38);
  assert.ok(a.mats.size <= 28, 'materials');
  assert.ok(a.t <= 2500, `triangles ${a.t}`);
  assert.equal(m.stats.triangles, a.t);
  assert.ok(a.geos.size < a.meshes, 'primitive/pair sharing');
  let withIndex = 0, withColor = 0;
  m.root.traverse((o) => { if (o.isMesh) { if (o.geometry.index) withIndex++; if (o.geometry.attributes.color) withColor++;
    for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
    if (o.geometry.attributes.color) assert.ok(o.material.vertexColors); } });
  assert.ok(withIndex >= 36, 'indexed');
  assert.ok(withColor >= 25);
  for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(a.size[k] - b.size[k]) <= Math.max(0.12, b.size[k] * (k === 'y' ? 0.06 : 0.18)), `bbox ${k} ${a.size[k]} vs ${b.size[k]}`);
  for (const mode of ['idle', 'run', 'attack', 'cast']) for (const progress of [0, 0.5, 1]) {
    m.animate({ time: 1.3, mode, progress });
    m.root.traverse((o) => assert.ok(Number.isFinite(o.position.x + o.position.y + o.position.z + o.quaternion.w)));
  }
  for (const pose of [{ variant: 'fire' }, {}, { variant: 'fire' }, {}]) {
    m.animate({ time: 1, mode: 'idle', progress: 0, ...pose });
    m.root.traverse((o) => { if (o.isMesh && o.geometry.attributes.color) assert.ok(o.material.vertexColors); });
  }
  console.log(`tris ${b.t} -> ${a.t} (${((a.t / b.t - 1) * 100).toFixed(1)}%) meshes ${a.meshes} mats ${b.mats.size}->${a.mats.size} geos ${a.geos.size} size ${a.size.toArray().map((v) => v.toFixed(2))} base ${b.size.toArray().map((v) => v.toFixed(2))}`);
  let d = 0; const own = new Set(); m.root.traverse((o) => o.isMesh && own.add(o.geometry));
  own.forEach((g) => g.addEventListener('dispose', () => d++));
  m.dispose(); m.dispose();
  assert.equal(d, own.size);
});
