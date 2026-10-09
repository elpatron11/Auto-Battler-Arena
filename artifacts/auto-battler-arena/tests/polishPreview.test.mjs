import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
test('normal/live controller never requests polished models and preview choice stays local', () => {
  const controller = readFileSync(new URL('src/prototypes/roster3d/gameIntegration.ts', root), 'utf8');
  const battle = readFileSync(new URL('src/prototypes/roster3d/RosterBattleApp.tsx', root), 'utf8');
  assert.doesNotMatch(controller, /polished|createPolished|polish=/);
  assert.match(battle, /get\('polish'\) === '1'/);
  assert.doesNotMatch(battle, /localStorage|\/api\/.*(?:reward|result)/);
  assert.match(battle, /clock\(engine\.performance\.now\(\) \/ 1000\)/);
});

test('matched snapshot benchmark keeps the child clock, copied inputs and fixed presentation time', async () => {
  const code = ts.transpileModule(readFileSync(new URL('src/prototypes/roster3d/polishBenchmark.ts', root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const renderers = [], poseTimes = [], contexts = [];
  let clock = 9000;
  const ctx = { clearRect() {}, save() {}, translate() {}, restore() {} };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, performance: { now: () => clock++ },
    requestAnimationFrame: callback => callback(),
    document: { createElement: () => ({ getContext: () => ctx }) },
    require: id => {
      if (id === './magePremiumModel') return { createPremiumMageModel() { throw new Error('Not selected in this comparison'); } };
      if (id === './premiumRoster') return { PREMIUM_ROSTER_FACTORY: {
        supports() { throw new Error('Not selected in this comparison'); },
        create() { throw new Error('Not selected in this comparison'); },
      } };
      assert.equal(id, './battleRenderer');
      return { createRosterBattleRenderer: (entities, options) => {
        const renderer = {
          options, entities, disposed: 0,
          stats: { phase: 'ready', units: entities().length, drawCalls: 15, triangles: 700 },
          draw(context, entity, cacheTime) {
            poseTimes.push(options.presentationTime); contexts.push(cacheTime);
            assert.equal(context, ctx);
            assert.equal(entity.atkAnimAt, 274900);
          },
          drawTotems() {},
          dispose() { this.disposed++; },
        };
        renderers.push(renderer); return renderer;
      } };
    },
  });
  const entities = [Object.freeze({ alive: true, classId: 'archer', team: 'player', x: 5, y: 8,
    atkAnimAt: 274900, hitFlashAt: 274950, casting: Object.freeze({ total: 1, timeLeft: .4 }),
    extra: Object.freeze({}), status: Object.freeze({}) })];
  const totems = [Object.freeze({ id: 1, x: 4, y: 9, type: 'lightning' })];
  const before = JSON.stringify({ entities, totems });
  const result = await module.exports.benchmarkRosterFinish(entities, totems, 275);
  assert.equal(result.samples, 24); assert.equal(result.units, 1); assert.equal(result.totems, 1);
  assert.ok(poseTimes.every(t => t === 275), 'presentation time never uses parent clock or advances');
  assert.ok(contexts.at(-1) > contexts[0], 'cache refresh clock advances independently');
  assert.notEqual(renderers[0].entities()[0], entities[0]);
  assert.notEqual(renderers[0].entities()[0].casting, entities[0].casting);
  assert.equal(JSON.stringify({ entities, totems }), before);
  assert.ok(renderers.every(r => r.disposed === 1));
});