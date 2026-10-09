import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
Module._extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(readFileSync(f, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
const { createPremiumMeleeModel } = require("../src/prototypes/roster3d/premiumRoster/melee.ts");
const res = {};
for (const id of ['warrior','paladin','rogue']) {
  const m = createPremiumMeleeModel(id); let vis = 0, bad = 0, noIdx = 0, noCol = 0; const mats = new Set();
  m.root.traverse((o) => { if (!o.isMesh) return; if (o.visible) { vis++; mats.add(o.material); }
    const g = o.geometry; if (o.visible && !g.index) noIdx++;
    const p = g.attributes.position.array; for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) bad++;
    if (o.visible && o.material.vertexColors && !g.attributes.color) noCol++; });
  const snap = () => { const a = []; m.root.traverse((o) => a.push(o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.y, o.rotation.z, o.scale.y)); return a; };
  const pose = { time: 1.3, mode: 'attack', progress: 0.4 };
  m.animate(pose); const a = snap(); m.animate({ time: 0, mode: 'run', progress: 0 }); m.animate(pose); const b = snap();
  let joints = 0; m.root.traverse((o) => { if (o.userData.premiumJoint) joints++; });
  res[id] = { tris: m.stats.triangles, vis, bad, noIdx, noCol, mats: mats.size, same: JSON.stringify(a) === JSON.stringify(b), joints };
  m.dispose(); m.dispose();
}

test("premium melee budgets, indexed finite geometry and idempotent animate", () => {
  for (const [id, r] of Object.entries(res)) {
    assert.ok(r.tris <= (id === "warrior" ? 3400 : 2500), `${id} tris ${r.tris}`);
    assert.ok(r.vis <= (id === "warrior" ? 72 : 43), `${id} draws ${r.vis}`);
    assert.equal(r.bad, 0); assert.equal(r.noIdx, 0); assert.equal(r.noCol, 0);
    assert.ok(r.same, `${id} animate idempotent`); assert.equal(r.joints, 4);
  }
});
