import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const monsterSource = readFileSync(new URL("../public/dungeon-monsters.js", import.meta.url), "utf8");
const gameSource = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");

function recordingCanvas() {
  const calls = [];
  const gradient = { addColorStop(...args) { calls.push(["addColorStop", ...args]); } };
  const context = new Proxy({}, {
    get(_target, property) {
      if (property in _target) return _target[property];
      if (property === "createRadialGradient" || property === "createLinearGradient") {
        return (...args) => {
          calls.push([property, ...args]);
          return gradient;
        };
      }
      return (...args) => calls.push([property, ...args]);
    },
    set(target, property, value) {
      target[property] = value;
      calls.push(["set", property, value]);
      return true;
    }
  });
  return { context, calls };
}

function monsterModule({ now = 1_000, randomCalls = { count: 0 } } = {}) {
  const window = {};
  const fakeMath = Object.create(Math);
  fakeMath.random = () => {
    randomCalls.count++;
    return 0.5;
  };
  vm.runInNewContext(monsterSource, {
    window,
    performance: { now: () => now },
    Math: fakeMath
  });
  return { monsters: window.DungeonMonsters, randomCalls };
}

function plainEntity(overrides = {}) {
  return {
    id: 7, x: 420, y: 260, radius: 34, hp: 800, maxHp: 1000,
    armor: 45, damage: 90, speed: 2.4, alive: true, status: {},
    _dungeonBoss: { id: "frost" },
    ...overrides
  };
}

function methodCalls(calls, method) {
  return calls.filter(call => call[0] === method);
}

test("Frost and demon bodies render visually, Temple stays unhandled, and rendering consumes no state or RNG", () => {
  const randomCalls = { count: 0 };
  const { monsters } = monsterModule({ randomCalls });
  for (const id of ["frost", "demon", "temple", "unlisted"]) {
    const entity = plainEntity({
      _dungeonBoss: { id },
      _dungeonEncounterId: id,
      status: { freeze: 0, poison: 0 },
      anim: { attack: 0.35 }
    });
    const before = structuredClone(entity);
    const { context, calls } = recordingCanvas();
    const handled = monsters.drawBody(context, entity, 0.016);

    assert.equal(handled, id === "frost" || id === "demon", `${id} recognition result`);
    assert.deepEqual(entity, before, `${id} rendering leaves coordinates and combat state unchanged`);
    if (handled) {
      assert.ok(calls.length > 0, `${id} is safely passed through the drawing API`);
      assert.ok(methodCalls(calls, "beginPath").length > 0, `${id} draws a body`);
      assert.ok(methodCalls(calls, "fill").length > 0, `${id} paints body shapes`);
    }
  }
  assert.equal(randomCalls.count, 0, "monster rendering must never consume gameplay RNG");
});

test("monster renderer honors native atkAnimAt elapsed-time motion", () => {
  const { monsters } = monsterModule({ now: 1_170 });
  const idle = plainEntity({ _dungeonBoss: { id: "frost" }, atkAnimAt: 800 });
  const attacking = plainEntity({ _dungeonBoss: { id: "frost" }, atkAnimAt: 1_170 });
  // At the fixed clock, 800ms ago is outside the default 340ms attack window;
  // the second entity's timestamp is now and therefore starts at zero too.
  // Compare a second in-window sample at the sine peak.
  attacking.atkAnimAt = 1_000;
  const idleCanvas = recordingCanvas();
  const attackCanvas = recordingCanvas();
  monsters.drawBody(idleCanvas.context, idle, 0.016);
  monsters.drawBody(attackCanvas.context, attacking, 0.016);

  const idleTransforms = methodCalls(idleCanvas.calls, "translate");
  const attackTransforms = methodCalls(attackCanvas.calls, "translate");
  assert.notDeepEqual(attackTransforms, idleTransforms,
    "an in-window atkAnimAt timestamp changes the rendered attack pose");
  assert.ok(attackTransforms.some(call => call[1] === 0 && call[2] < -3),
    "the natural attack animation raises the body through its native pose translation");
});

function functionSource(name) {
  const start = gameSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `expected game function ${name}`);
  const next = gameSource.indexOf("\nfunction ", start + 1);
  return gameSource.slice(start, next < 0 ? gameSource.length : next);
}

function entityHarness({ polymorphed = false } = {}) {
  const calls = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === "createRadialGradient" || property === "createLinearGradient") return () => gradient;
      return (...args) => calls.push([property, ...args]);
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
  const random = Object.create(Math);
  random.random = () => { throw new Error("monster drawing unexpectedly used Math.random"); };
  const monsterDrawCalls = [];
  const genericDrawCalls = [];
  const overlayCalls = [];
  const hpRects = [];
  const roundRectPath = (...args) => hpRects.push(args);
  const window = { DungeonMonsters: null };
  const { monsters } = monsterModule();
  window.DungeonMonsters = {
    isMonster: monsters.isMonster,
    drawBody(context, entity, dt) {
      monsterDrawCalls.push(entity);
      return monsters.drawBody(context, entity, dt);
    }
  };

  const context = vm.createContext({
    ctx, window, Math: random,
    performance: { now: () => 2_000 },
    AMBIENT_FX_COLOR: {},
    CLASS_COLOR: { warrior: "#a44" },
    CLASS_STATS: {},
    SPRITE_DOWNSCALE: 1,
    SPRITE_LOCAL: { x0: 0, y0: 0 },
    spriteCanvas: { width: 20, height: 20 },
    silCanvas: {}, flashCanvas: {},
    drawRacialReadyRing() {},
    drawHeroDetailOverlay(...args) { overlayCalls.push(args); },
    drawPetDetail() {},
    renderHeroSprite(...args) { genericDrawCalls.push(args); },
    druidFormColor: () => null,
    entityClassColor: () => "#a44",
    shade: color => color,
    hexToRgba: color => color,
    roundRectPath,
    clamp: value => value,
    spawnBurst() {},
    rand: () => 0
  });
  vm.runInContext(drawSheep, context);
  vm.runInContext(functionSource("drawCrowdControlMarker")+"\n"+functionSource("drawEntity"), context);
  const entity = {
    id: 12, x: 420, y: 260, radius: 34, hp: 620, maxHp: 1000,
    alive: true, team: "enemy", classId: "warrior", _dungeonBoss: { id: "frost" },
    status: { dots: [], stunTimer: 1, stunKind: "freeze", polymorphed },
    extra: {}, atkAnimAt: 1_900
  };
  return { context, entity, calls, monsterDrawCalls, genericDrawCalls, overlayCalls, hpRects };
}

test("drawEntity replaces a Warrior body with the dungeon monster while retaining boss HP and status UI", () => {
  const harness = entityHarness();
  harness.context.drawEntity(harness.entity, 0.016);
  assert.equal(harness.monsterDrawCalls.length, 1, "the dungeon monster renderer handles the body");
  assert.equal(harness.genericDrawCalls.length, 0, "the generic Warrior sprite is not also rendered");
  assert.equal(harness.overlayCalls.length, 0, "generic hero detail overlays do not cover monster art");
  assert.ok(harness.hpRects.some(([, , y]) => y === harness.entity.y + 68),
    "the monster-specific health-bar position is retained");
  assert.ok(harness.calls.some(call => call[0] === "fillText" && call[1] === "❄"),
    "the usual compact freeze-status icon remains visible");
  assert.ok(harness.calls.some(call => call[0] === "fillRect" && call[3] > 0),
    "the health bar remains painted for the monster");
});

test("drawEntity preserves polymorphed sheep instead of replacing it with monster art", () => {
  const harness = entityHarness({ polymorphed: true });
  harness.context.drawEntity(harness.entity, 0.016);
  assert.equal(harness.monsterDrawCalls.length, 0, "polymorph takes precedence over monster body rendering");
  assert.equal(harness.genericDrawCalls.length, 0);
  assert.ok(harness.calls.some(call => call[0] === "fillRect"),
    "the sheep's legs/body are drawn instead of a generic Warrior sprite");
  assert.ok(harness.hpRects.some(([, , y]) => y === harness.entity.y + 68),
    "polymorphing a monster does not remove its health UI");
  assert.ok(harness.calls.some(call => call[0] === "fillText" && call[1] === "❄"),
    "polymorphing preserves status UI too");
});

// The game implementation's sheep helper is included unchanged so the
// integration test exercises the actual polymorph body, not a test substitute.
const drawSheep = functionSource("drawSheep");