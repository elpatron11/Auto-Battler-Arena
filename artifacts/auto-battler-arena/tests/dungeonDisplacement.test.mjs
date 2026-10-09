import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");

function gameFunctionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `expected game function ${name}`);
  const end = html.indexOf("\nfunction ", start + 1);
  return html.slice(start, end < 0 ? html.length : end);
}

function gameConstantSource(name) {
  const start = html.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `expected game constant ${name}`);
  const end = html.indexOf(";", start);
  assert.ok(end >= 0, `expected ${name} declaration terminator`);
  return html.slice(start, end + 1);
}

function displacementHarness({ walls = [] } = {}) {
  const context = vm.createContext({
    window: {},
    ARENA_W: 900,
    ARENA_H: 560,
    WALLS: walls,
    state: { entities: [] },
    spawnBurst() {},
    spawnAoe() {}
  });
  const source = [
    gameFunctionSource("clamp"),
    gameFunctionSource("rand"),
    gameFunctionSource("collidesWalls"),
    gameFunctionSource("inBounds"),
    gameConstantSource("CORNER_SWEEP_ANGLES"),
    gameFunctionSource("moveEntity"),
    gameFunctionSource("isDisplacementImmune"),
    gameFunctionSource("pushApart"),
    gameFunctionSource("resolveEntitySeparation"),
    gameFunctionSource("pushAway"),
    "globalThis.displacement = { isDisplacementImmune, moveEntity, pushApart, resolveEntitySeparation, pushAway };"
  ].join("\n");
  vm.runInContext(readFileSync(new URL("../public/arena-collision.js", import.meta.url), "utf8"), context);
  vm.runInContext(source, context);
  return context;
}

function unit(overrides = {}) {
  return {
    x: 300, y: 220, radius: 20, alive: true, team: "player",
    status: {}, ...overrides
  };
}

function assertPosition(entity, x, y, message) {
  assert.equal(entity.x, x, `${message}: x`);
  assert.equal(entity.y, y, `${message}: y`);
}

test("displacement immunity follows the dungeon-boss tag rather than encounter names", () => {
  const context = displacementHarness();
  const isImmune = context.displacement.isDisplacementImmune;

  assert.equal(isImmune(unit({ _dungeonBoss: true, _dungeonEncounterId: "unlisted-future-boss" })), true);
  assert.equal(isImmune(unit({ _dungeonBoss: true, _dungeonEncounterId: "demon" })), true);
  assert.equal(isImmune(unit({ _dungeonEncounterId: "demon" })), false);
  assert.equal(isImmune(null), false);
});

test("pushApart and pushAway never displace a dungeon boss, regardless of control state", () => {
  const context = displacementHarness();
  const { pushApart, pushAway } = context.displacement;
  const controls = [
    {}, { stunTimer: 2 }, { fearTimer: 2 }, { sapTimer: 2 },
    { rootTimer: 2 }, { disorientTimer: 2 }, { polymorphed: true }
  ];
  const origins = [
    [100, 220], [500, 220], [300, 20], [300, 500]
  ];
  const pushDistances = [12, 180, 1200];

  for (const status of controls) {
    const boss = unit({
      x: 300, y: 220, _dungeonBoss: true,
      _dungeonEncounterId: "a-name-added-in-the-future", status: { ...status }
    });
    pushApart(boss, 31, -17);
    assertPosition(boss, 300, 220, "pushApart leaves the tagged boss in place");

    for (const [srcX, srcY] of origins) {
      for (const pushDist of pushDistances) {
        pushAway(boss, srcX, srcY, pushDist);
        assertPosition(boss, 300, 220, "pushAway leaves the tagged boss in place");
      }
    }
  }
});

test("entity separation holds bosses fixed and moves overlapping players, pets, and charging units", () => {
  const context = displacementHarness();
  const { resolveEntitySeparation } = context.displacement;
  const cases = [
    { kind: "player", first: true, other: unit({ team: "player" }) },
    { kind: "pet", first: false, other: unit({ team: "player", isPet: true }) },
    { kind: "charging unit", first: true, other: unit({ team: "enemy", status: { chargeTimer: 1 } }) },
    { kind: "player", first: false, other: unit({ team: "player" }) }
  ];

  for (const { kind, first, other } of cases) {
    const boss = unit({
      x: 300, y: 220, team: "enemy", _dungeonBoss: true, status: {}
    });
    other.x = 310;
    other.y = 220;
    const bossX = boss.x, bossY = boss.y;
    context.state.entities = first ? [boss, other] : [other, boss];
    resolveEntitySeparation(0.1);
    assertPosition(boss, bossX, bossY, `${kind} overlap does not move the boss`);
    assert.notDeepEqual([other.x, other.y], [310, 220], `${kind} absorbs the displacement`);
    assert.ok(Math.hypot(other.x - boss.x, other.y - boss.y) > 10,
      `${kind} moves away from the boss`);
  }
});

test("wall collision does not move the boss or let an overlapping unit pass through a wall", () => {
  const wall = { x: 330, y: 160, w: 40, h: 120 };
  for (const bossFirst of [true, false]) {
    const context = displacementHarness({ walls: [wall] });
    const { resolveEntitySeparation } = context.displacement;
    const boss = unit({ x: 300, y: 220, team: "enemy", _dungeonBoss: true, status: {} });
    const player = unit({ x: 310, y: 220, team: "player" });
    context.state.entities = bossFirst ? [boss, player] : [player, boss];

    resolveEntitySeparation(0.1);
    assertPosition(boss, 300, 220, "wall-constrained separation keeps the boss fixed");
    assert.ok(player.x + player.radius <= wall.x,
      "wall-constrained displacement cannot carry the player through the wall");
  }
});

test("ordinary displacement remains active, root still pins nonboss units, and normal movement can move bosses", () => {
  const context = displacementHarness();
  const { moveEntity, pushApart, pushAway, resolveEntitySeparation } = context.displacement;

  const ordinary = unit({ x: 140, y: 200 });
  pushApart(ordinary, 12, 5);
  assertPosition(ordinary, 152, 205, "ordinary pushApart displacement still works");

  const knockback = unit({ x: 120, y: 300 });
  pushAway(knockback, 60, 300, 45);
  assert.equal(knockback.x, 165, "ordinary pushAway displacement still works");

  const rooted = unit({ x: 400, y: 220, status: { rootTimer: 1 } });
  const neighbor = unit({ x: 410, y: 220 });
  context.state.entities = [rooted, neighbor];
  resolveEntitySeparation(0.1);
  assertPosition(rooted, 400, 220, "the existing root rule still pins a nonboss");
  assert.notEqual(neighbor.x, 410, "the unrooted unit absorbs a rooted unit's separation");
  const rootedKnockback = { x: 500, y: 300, radius: 20, status: { rootTimer: 1 } };
  pushAway(rootedKnockback, 400, 300, 50);
  assertPosition(rootedKnockback, 500, 300, "root still prevents nonboss knockback");

  const boss = unit({ x: 600, y: 350, team: "enemy", _dungeonBoss: true });
  assert.equal(moveEntity(boss, 1, 0, 10, 1), true);
  assertPosition(boss, 610, 350, "ordinary navigation movement is not blocked by displacement immunity");
});

test("long ordinary knockback remains swept against walls", () => {
  const context = displacementHarness({ walls: [{ x: 150, y: 250, w: 30, h: 100 }] });
  const target = unit({ x: 120, y: 300 });

  context.displacement.pushAway(target, 50, 300, 200);
  assert.ok(target.x < 150 - target.radius, "a long knockback stops before the wall");
  assert.ok(target.x > 120, "ordinary units still travel as far as the wall safely allows");
});