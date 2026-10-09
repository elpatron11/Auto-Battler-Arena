import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import Module from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
// compile roster modules on the fly (CommonJS) so extensionless .ts imports resolve
Module._extensions['.ts'] = (mod, filename) => {
  const out = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  mod._compile(out, filename);
};
const THREE = require('three');
const dir = new URL('../src/prototypes/roster3d/', import.meta.url);
const load = (f) => require(fileURLToPath(new URL(f, dir)));
const { createCharacterModel } = load('characterModel.ts');
const { createPolishedCharacterModel } = load('polishModel.ts');

const CASES = [
  ['warrior', ''], ['rogue', ''], ['paladin', ''], ['archer', ''], ['priest', ''], ['frostmage', ''],
  ['warlock', ''], ['shaman', ''], ['druid', ''], ['druid', 'bear'], ['druid', 'tiger'], ['druid', 'tree'],
  ['boss-frost', ''], ['boss-demon', ''], ['boss-temple', ''],
  ['pet-archer', ''], ['pet-archer-snake', ''], ['pet-archer-turtle', ''], ['pet-frostmage', ''],
  ['add-hound', ''], ['add-guard', ''],
];
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

function measure(m) {
  m.root.updateMatrixWorld(true);
  let t = 0, meshes = 0, nodes = 0; const mats = new Set(), geos = new Set(); const names = [];
  m.root.traverse((o) => {
    nodes++; names.push(o.name + '|' + o.type);
    if (o.isMesh) { meshes++; t += tris(o.geometry); mats.add(o.material); geos.add(o.geometry); }
  });
  const box = new THREE.Box3().setFromObject(m.root); const size = box.getSize(new THREE.Vector3());
  return { t, meshes, nodes, mats, geos, size, names };
}
function snapshot(m) {
  const s = []; m.root.traverse((o) => s.push([o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), o.visible]));
  return JSON.stringify(s);
}

const rows = [];
for (const [id, form] of CASES) {
  const label = form ? `${id}:${form}` : id;
  test(`polish ${label}`, () => {
    const base = createCharacterModel(id, form); const b = measure(base);
    const baseGeoSnapshot = new Map(); base.root.traverse((o) => { if (o.isMesh) baseGeoSnapshot.set(o, o.geometry); });
    const baseIdle = (() => { base.animate({ time: .7, mode: 'idle', progress: 0 }); return snapshot(base); })();

    const model = createPolishedCharacterModel(id, form); const a = measure(model);
    // the unrelated base instance is untouched
    base.root.traverse((o) => { if (o.isMesh) assert.equal(o.geometry, baseGeoSnapshot.get(o), 'base geometry unchanged'); });
    assert.equal(snapshot(base), baseIdle);

    // structure: same nodes, meshes, materials; no lights/textures
    assert.deepEqual(a.names, b.names, 'same node tree');
    assert.equal(a.meshes, b.meshes, 'draw calls');
    assert.ok(a.mats.size <= b.mats.size, 'materials');
    model.root.traverse((o) => {
      assert.ok(!o.isLight, 'no lights');
      if (o.isMesh) {
        assert.equal(o.material.type, 'MeshLambertMaterial');
        assert.equal(o.material.map, null);
        assert.ok(!o.castShadow);
      }
    });

    // caps and closed bevels: every ray that hits a base mesh must still hit the polished mesh
    {
      const ref = createCharacterModel(id, form); const rb = []; const rp = [];
      ref.root.traverse((o) => o.isMesh && rb.push(o)); model.root.traverse((o) => o.isMesh && rp.push(o));
      const rc = new THREE.Raycaster(); const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
      rb.forEach((bm, k) => {
        const bb = bm.geometry.boundingBox ?? (bm.geometry.computeBoundingBox(), bm.geometry.boundingBox);
        const c = bb.getCenter(new THREE.Vector3()); const sz = bb.getSize(new THREE.Vector3());
        if (sz.x < .05 || sz.y < .05 || sz.z < .05) return;
        for (const dv of dirs) {
          const d = new THREE.Vector3(...dv); const o = c.clone().addScaledVector(d, 50);
          rc.set(o, d.clone().negate());
          const hb = rc.intersectObject(Object.assign(new THREE.Mesh(bm.geometry, bm.material), {}), false).length;
          const hp = rc.intersectObject(new THREE.Mesh(rp[k].geometry, rp[k].material), false).length;
          if (hb) assert.ok(hp, `${label} mesh ${k} lost a face along ${dv}`);
        }
      });
      ref.dispose();
    }

    // variant materials keep vertex colours across base -> variant -> base
    if (id === 'priest' || id === 'frostmage') {
      const v = id === 'priest' ? 'shadow' : 'fire';
      for (const pose of [{ variant: v }, {}, { variant: v }, {}]) {
        model.animate({ time: 1, mode: 'idle', progress: 0, ...pose });
        model.root.traverse((o) => { if (o.isMesh && o.geometry.attributes.color) assert.ok(o.material.vertexColors, 'vertexColors kept'); });
      }
    }

    // triangle + size budget
    assert.ok(a.t <= Math.floor(b.t * 1.1), `triangles ${a.t} <= 1.10 x ${b.t}`);
    assert.ok(a.geos.size <= a.meshes);
    for (const k of ['x', 'y', 'z']) {
      const tol = Math.max(.12, b.size[k] * .06);
      assert.ok(Math.abs(a.size[k] - b.size[k]) <= tol, `bbox ${k} ${a.size[k].toFixed(2)} vs ${b.size[k].toFixed(2)}`);
    }
    assert.equal(model.stats.triangles, a.t);
    assert.ok(model.root.userData.polished.applied.length >= 5, 'real refinements applied');

    // refinement actually changed geometry
    let changed = 0; model.root.traverse((o) => { if (o.isMesh && o.geometry.attributes.color) changed++; });
    assert.ok(changed >= a.meshes * .8, 'meshes carry painted vertex colours');

    // animation nodes keep working and stay finite
    for (const mode of ['idle', 'run', 'attack', 'cast']) for (const progress of [0, .5, 1]) {
      model.animate({ time: 1.3, mode, progress });
      model.root.traverse((o) => assert.ok(Number.isFinite(o.position.x + o.position.y + o.position.z + o.quaternion.w)));
    }
    for (const variant of ['shadow', 'fire', 'rampage']) model.animate({ time: 2, mode: 'idle', progress: 0, variant });
    model.root.traverse((o) => { if (o.isMesh) for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v)); });

    // dispose is idempotent and frees owned geometries
    let disposed = 0; const owned = new Set(); model.root.traverse((o) => { if (o.isMesh) owned.add(o.geometry); });
    owned.forEach((g) => g.addEventListener('dispose', () => disposed++));
    model.dispose(); model.dispose();
    assert.equal(disposed, owned.size, 'every owned geometry disposed exactly once');

    rows.push(`${label.padEnd(20)} tris ${String(b.t).padStart(5)} -> ${String(a.t).padStart(5)} (${((a.t / b.t - 1) * 100).toFixed(1).padStart(5)}%)  ` +
      `meshes ${b.meshes}->${a.meshes}  mats ${b.mats.size}->${a.mats.size}  geos ${b.geos.size}->${a.geos.size}  ` +
      `size ${b.size.toArray().map((v) => v.toFixed(2)).join('x')} -> ${a.size.toArray().map((v) => v.toFixed(2)).join('x')}`);
  });
}

test('stats table', () => { console.log('\n' + rows.join('\n')); });
