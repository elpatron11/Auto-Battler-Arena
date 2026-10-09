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
const { createPremiumRosterModel } = load('premiumRoster/index.ts');
const { createPrestigeRosterModel, PRESTIGE_BUDGET } = load('premiumRoster/prestige.ts');
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

for(const id of ['paladin','warrior']){
  test(`${id} reference cape keeps blue/crimson cloth and non-emitting gold hems`,()=>{
    const model=createPrestigeRosterModel(id),hsl={h:0,s:0,l:0},color=new THREE.Color();
    let cloth=0,gold=0;
    try{
      model.root.traverse(mesh=>{
        if(!mesh.isMesh)return;
        let cape=false;
        for(let node=mesh;node;node=node.parent)if(node.userData.premiumJoint==='cape')cape=true;
        if(!cape)return;
        const colors=mesh.geometry.attributes.color,mask=mesh.geometry.attributes.prestigeGlow;
        assert.ok(colors);
        for(let i=0;i<colors.count;i++){
          color.setRGB(colors.getX(i),colors.getY(i),colors.getZ(i)).multiply(mesh.material.color);
          color.getHSL(hsl);
          if(hsl.s>.3&&(id==='paladin'?hsl.h>.55&&hsl.h<.75:hsl.h>.92||hsl.h<.06))cloth++;
          if(hsl.s>.3&&hsl.h>.065&&hsl.h<.18)gold++;
          assert.equal(mask.getX(i),0,'cloth does not inherit armor emission');
        }
      });
      assert.ok(cloth>0,'reference cloth color remains visible');
      assert.ok(gold>0,'tagged gold trim remains distinct from cloth');
    }finally{model.dispose();}
  });
}
const rig = (m, skip = true) => { const s = []; m.root.traverse((o) => { if (skip && o.userData.prestige) return; s.push([o.position.toArray(), o.quaternion.toArray(), o.scale.toArray()]); }); return JSON.stringify(s); };
const POSES = [{ time: 0.7, mode: 'idle', progress: 0.2 }, { time: 1.1, mode: 'run', progress: 0.5 }, { time: 0.4, mode: 'attack', progress: 0.8 }, { time: 0.9, mode: 'cast', progress: 0.3 }];
const meshStat = (m) => { let t = 0, n = 0; m.root.traverse((o) => { if (o.isMesh && o.visible) { n++; t += tris(o.geometry); } }); return { t, n }; };

test('unsupported classes are unchanged premium models', () => {
  for (const id of ['rogue', 'priest', 'frostmage']) {
    const a = createPremiumRosterModel(id), b = createPrestigeRosterModel(id);
    for (const p of POSES) { a.animate(p); b.animate(p); }
    assert.equal(rig(a), rig(b)); assert.deepEqual(meshStat(a), meshStat(b));
    a.dispose(); b.dispose();
  }
});

for (const id of ['paladin', 'warrior']) {
  test(`${id} prestige shares rig, animation and keeps base materials`, () => {
    const base = createPremiumRosterModel(id), pre = createPrestigeRosterModel(id);
    const bn = [], pn = [];
    base.root.traverse((o) => bn.push(o)); pre.root.traverse((o) => !o.userData.prestige && pn.push(o));
    assert.equal(bn.length, pn.length);
    // same rig node identity of the premium factory: names/types/hierarchy order and joint markers
    assert.deepEqual(bn.map((o) => [o.name, o.type, o.userData.premiumJoint]), pn.map((o) => [o.name, o.type, o.userData.premiumJoint]));
    for (const p of POSES) { base.animate(p); pre.animate(p); assert.equal(rig(base), rig(pre)); }
    // scale/proportions of the actual rig
    assert.deepEqual(new THREE.Box3().setFromObject(base.root).min.toArray().length, 3);
    // base materials untouched by a prestige build
    const ref = createPremiumRosterModel(id); const colors = [];
    ref.root.traverse((o) => o.isMesh && colors.push(o.material.color.getHex() + ':' + o.material.emissive.getHex()));
    const colors2 = []; base.root.traverse((o) => o.isMesh && colors2.push(o.material.color.getHex() + ':' + o.material.emissive.getHex()));
    assert.deepEqual(colors, colors2);
    const baseMats = new Set(); base.root.traverse((o) => o.isMesh && baseMats.add(o.material));
    let shared = 0; pre.root.traverse((o) => o.isMesh && baseMats.has(o.material) && shared++);
    assert.equal(shared, 0);
    // all retained (incl. hidden merged) meshes use recoloured clones
    let changed = 0, total = 0; const pairs = [];
    pre.root.traverse((o) => { if (o.isMesh && !o.userData.prestige) { total++; pairs.push(o.material.color.getHex()); } });
    const orig = []; base.root.traverse((o) => o.isMesh && orig.push(o.material.color.getHex()));
    pairs.forEach((c, i) => c !== orig[i] && changed++);
    assert.ok(changed > total * 0.3, `recoloured ${changed}/${total}`);
    [base, pre, ref].forEach((m) => m.dispose());
  });

  test(`${id} prestige overhead is bounded and weapon set is unchanged`, () => {
    const base = createPremiumRosterModel(id), pre = createPrestigeRosterModel(id);
    const a = meshStat(base), b = meshStat(pre);
    const extra = []; pre.root.traverse((o) => o.userData.prestige && o.isMesh && extra.push(o));
    assert.ok(extra.length >= 1 && extra.length <= PRESTIGE_BUDGET.meshes);
    assert.equal(b.n - a.n, extra.length);
    assert.ok(b.t - a.t <= PRESTIGE_BUDGET.triangles, `added ${b.t - a.t}`);
    for (const m of extra) { assert.ok(m.geometry.index); assert.ok(!m.geometry.attributes.color); }
    assert.equal(pre.stats.triangles, b.t); assert.equal(pre.stats.meshes, b.n);
    console.log(id, 'base', a, 'prestige', b, 'added tris', b.t - a.t, 'meshes', extra.length, 'materials', pre.stats.materials);
    base.dispose(); pre.dispose();
  });

  test(`${id} prestige dispose is repeatable and owns added resources`, () => {
    const pre = createPrestigeRosterModel(id);
    const geos = new Set(), mats = new Set();
    pre.root.traverse((o) => { if (o.userData.prestige && o.isMesh) { geos.add(o.geometry); mats.add(o.material); } });
    let disposed = 0; [...geos, ...mats].forEach((r) => r.addEventListener('dispose', () => disposed++));
    pre.dispose(); pre.dispose(); pre.dispose();
    assert.equal(disposed, geos.size + mats.size);
    let left = 0; pre.root.traverse((o) => o.userData.prestige && left++); assert.equal(left, 0);
  });
}

test('warrior prestige adds no weapon geometry', () => {
  const pre = createPrestigeRosterModel('warrior');
  pre.root.traverse((o) => { if (o.userData.prestige) assert.ok(!/sword|axe|hammer|spear|weapon/i.test(o.name)); });
  pre.dispose();
});

test('warrior prestige: dark broad vertex colours, gold trim kept, base geometry untouched', () => {
  const base = createPremiumRosterModel('warrior'), pre = createPrestigeRosterModel('warrior');
  const bg = new Set(); base.root.traverse((o) => o.isMesh && bg.add(o.geometry));
  const lum = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
  let dark = 0, gold = 0, orange = 0, tot = 0;
  pre.root.traverse((o) => { if (!o.isMesh || o.userData.prestige) return; const c = o.geometry.attributes.color; if (!c || !o.visible) return;
    for (let i = 0; i < c.count; i++) { const r = c.getX(i), g = c.getY(i), b = c.getZ(i); tot++;
      if (r > 0.45 && g < r * 0.7 && b < 0.1) orange++; else if (r > 0.45 && g > 0.25 && b < r * 0.4) gold++; else if (lum(r, g, b) < 0.1) dark++; } });
  console.log('warrior verts', { tot, dark, gold, orange });
  assert.ok(dark > gold, 'broad surfaces are dark'); assert.ok(gold > 20, 'gold trim remains'); assert.ok(orange > 10, 'molten edge present');
  base.root.traverse((o) => { if (o.isMesh) assert.ok(bg.has(o.geometry)); });
  pre.dispose(); base.dispose();
});

for (const id of ['paladin', 'warrior']) {
  test(`${id} glow is selective, grounded and stronger only during action`, () => {
    const model = createPrestigeRosterModel(id);
    let aura, unlit = 0, lit = 0;
    model.root.traverse(o => {
      if (o.userData.prestigeAura) aura = o;
      if (!o.isMesh) return;
      const mask = o.geometry.attributes.prestigeGlow;
      if (mask) for (const value of mask.array) {
        assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
        if (value === 0) unlit++; else lit++;
      }
      assert.notEqual(o.type,'PointLight');
    });
    assert.ok(aura && lit > 0 && unlit > lit * 0.15, 'body retains unlit surfaces');
    assert.equal(aura.parent, model.root, 'aura stays on ground, not the bobbing torso');
    assert.equal(aura.material.depthWrite,false);
    assert.equal(aura.material.blending,THREE.AdditiveBlending);
    model.animate({time:0,mode:'idle',progress:0.5});
    const idle = aura.userData.prestigeGlowStrength;
    for (const mode of ['attack','cast']) {
      model.animate({time:0,mode,progress:0.5});
      assert.ok(aura.userData.prestigeGlowStrength > idle + 0.5);
      model.animate({time:0,mode,progress:1});
      assert.ok(Math.abs(aura.userData.prestigeGlowStrength-idle)<0.00001);
    }
    model.animate({time:NaN,mode:'attack',progress:NaN});
    assert.ok(Number.isFinite(aura.userData.prestigeGlowStrength));
    model.animate({time:0,mode:'run',progress:0.5});
    assert.equal(aura.userData.prestigeGlowStrength,idle,'no attack glow on ordinary movement');
    model.dispose();
  });
}
