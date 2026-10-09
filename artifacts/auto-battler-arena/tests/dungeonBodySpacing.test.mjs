import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const monsterSource = readFileSync(new URL("../public/dungeon-monsters.js", import.meta.url), "utf8");
const spacingSource = readFileSync(new URL("../public/dungeon-body-spacing.js", import.meta.url), "utf8");
const gameHtml = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");

function gameFunctionSource(name) {
  const start = gameHtml.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `expected game function ${name}`);
  const end = gameHtml.indexOf("\nfunction ", start + 1);
  return gameHtml.slice(start, end < 0 ? gameHtml.length : end);
}

function gameConstantSource(name) {
  const start = gameHtml.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `expected game constant ${name}`);
  const end = gameHtml.indexOf(";", start);
  assert.ok(end >= 0, `expected ${name} declaration terminator`);
  return gameHtml.slice(start, end + 1);
}

function spacingContext(extra = {}) {
  const context = vm.createContext({
    window: {},
    performance: { now: () => 1000 },
    ...extra
  });
  vm.runInContext(
    "Math.random = function () { throw new Error('dungeon body spacing must not use random numbers'); };",
    context
  );
  vm.runInContext(monsterSource, context, { filename: "dungeon-monsters.js" });
  vm.runInContext(spacingSource, context, { filename: "dungeon-body-spacing.js" });
  return context;
}

function boss(id = "frost-yeti", overrides = {}) {
  return {
    id: 900,
    x: 500,
    y: 300,
    radius: 34,
    alive: true,
    team: "enemy",
    melee: true,
    range: 120,
    hp: 4200,
    maxHp: 4200,
    dmg: 80,
    speed: 48,
    status: {},
    _dungeonBoss: true,
    _dungeonEncounterId: id,
    ...overrides
  };
}

function unit(overrides = {}) {
  return {
    id: 1,
    x: 300,
    y: 200,
    radius: 17,
    alive: true,
    team: "player",
    melee: true,
    range: 90,
    status: {},
    ...overrides
  };
}

function addMove(entity, dx, dy) {
  entity.x += dx;
  entity.y += dy;
}

function productionPushContext({ walls = [], width = 900, height = 560 } = {}) {
  const context = vm.createContext({
    window: {},
    ARENA_W: width,
    ARENA_H: height,
    WALLS: walls
  });
  vm.runInContext(readFileSync(new URL("../public/arena-collision.js", import.meta.url), "utf8"), context);
  vm.runInContext([
    gameFunctionSource("clamp"),
    gameFunctionSource("collidesWalls"),
    gameFunctionSource("inBounds"),
    gameFunctionSource("isDisplacementImmune"),
    gameFunctionSource("pushApart"),
    "globalThis.bodyMovement = { collidesWalls, inBounds, pushApart };"
  ].join("\n"), context, { filename: "game-body-movement.js" });
  return context;
}

function legalOnProductionFloor(movement, walls, width, height) {
  return (entity, x, y) =>
    !movement.bodyMovement.collidesWalls(x, y, entity.radius, walls) &&
    movement.bodyMovement.inBounds(x, y, entity.radius);
}

function assertOutsideBody(spacing, monster, entity, message) {
  const geometry = spacing.geometry(monster, entity, entity.x, entity.y);
  assert.ok(geometry, `${message}: expected monster geometry`);
  assert.ok(geometry.gap >= -0.01, `${message}: body gap ${geometry.gap.toFixed(3)} is negative`);
}

test("public monster footprints describe the visible idle body and spacing uses their offset ellipse", () => {
  const context = spacingContext();
  const monsters = context.window.DungeonMonsters;
  const spacing = context.window.DungeonBodySpacing;
  const frost = boss("frost-yeti");
  const demon = boss("horned-demon");

  assert.deepEqual(
    JSON.parse(JSON.stringify(monsters.getBodyFootprint(frost))),
    { rx: 76, ry: 88, cx: 0, cy: -9, power: 4 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(monsters.getBodyFootprint(demon))),
    { rx: 64, ry: 78, cx: 0, cy: -4, power: 4 }
  );

  const actor = unit({ radius: 17 });
  const frostHorizontal = spacing.geometry(frost, actor, frost.x - 95, frost.y - 9);
  assert.equal(frostHorizontal.dx, -95);
  assert.equal(frostHorizontal.dy, 0);
  assert.equal(frostHorizontal.boundary, 95);
  assert.ok(Math.abs(frostHorizontal.gap) < 1e-9);
  const frostVertical = spacing.geometry(frost, actor, frost.x, frost.y - 9 - 107);
  assert.ok(Math.abs(frostVertical.boundary - 107) < 1e-9);
  assert.ok(Math.abs(frostVertical.gap) < 1e-9);

  const frostDiagonal = spacing.geometry(frost, actor, frost.x + 76, frost.y - 9 + 76);
  assert.ok(frostDiagonal.gap < 0,
    "the conservative fourth-power footprint includes the Frost body at local (76, 76)");
  assert.equal(
    spacing.canOccupy(actor, frost.x + 76, frost.y - 9 + 76, [actor, frost]),
    false,
    "ordinary movement cannot enter the diagonal Frost footprint"
  );

  const demonHorizontal = spacing.geometry(demon, actor, demon.x - 83, demon.y - 4);
  assert.ok(Math.abs(demonHorizontal.boundary - 83) < 1e-9);
  assert.ok(Math.abs(demonHorizontal.gap) < 1e-9);
  assert.equal(spacing.geometry(boss("unknown-boss"), actor, actor.x, actor.y), null);
  assert.equal(spacing.geometry(boss("frost", { alive: false }), actor, actor.x, actor.y), null);
  const polymorphedFrost = boss("frost", { status: { polymorphed: true } });
  assert.ok(spacing.geometry(polymorphedFrost, actor, polymorphedFrost.x, polymorphedFrost.y),
    "the collision footprint persists while the boss is polymorphed");
});

test("combat distance only compensates melee contact with a large monster body", () => {
  const context = spacingContext();
  const spacing = context.window.DungeonBodySpacing;
  const monster = boss();
  const melee = unit({
    x: monster.x - 95.25,
    y: monster.y - 9,
    radius: 17,
    range: 80
  });
  const surface = spacing.geometry(monster, melee, melee.x, melee.y);
  const expectedContact = ((monster.radius || 34) + (melee.radius || 17)) * 0.86;
  assert.ok(Math.abs(surface.gap - 0.25) < 1e-9);
  assert.ok(Math.abs(spacing.distance(melee, monster) - (surface.gap + expectedContact)) < 1e-9);

  assert.equal(spacing.distance({ ...melee, melee: false }, monster), Math.hypot(95.25, 9),
    "ranged attacks keep raw center distance");
  assert.equal(spacing.distance(melee, unit({ x: melee.x + 100, y: melee.y })), 100,
    "ordinary melee targets keep raw center distance");

  const pet = unit({
    isPet: true,
    x: monster.x - 92,
    y: monster.y - 9,
    range: 32,
    radius: 14
  });
  assert.ok(spacing.distance(pet, monster) <= 32,
    "a short-range melee pet can attack while touching the body's edge");
  assert.ok(Math.abs(spacing.distance(pet, monster) - 28.8) < 1e-9,
    "short-range pet contact alone is capped at 90% of its 32-pixel range");

  const bossAtContact = { ...monster, x: 500, y: 300, range: 80 };
  const heroAtBody = unit({ x: 500 + 95, y: 300 - 9, radius: 17 });
  const heroBeyondBody = unit({ x: 500 + 110, y: 300 - 9, radius: 17 });
  assert.equal(spacing.distance(bossAtContact, heroAtBody), 80,
    "boss body contact allows its existing range swing without increasing range");
  assert.equal(spacing.distance(bossAtContact, heroBeyondBody), Math.hypot(110, 9),
    "a boss retains raw distance outside its body-contact allowance");
  assert.equal(bossAtContact.range, 80, "distance checks do not mutate boss combat stats");
});

test("movement cannot enter a boss or rooted hero body, but invalid positions can escape", () => {
  const context = spacingContext();
  const spacing = context.window.DungeonBodySpacing;
  const monster = boss();
  const outside = unit({ x: 300, y: 291 });

  assert.equal(spacing.canOccupy(outside, monster.x, monster.y - 9, [outside, monster]), false,
    "an ordinary unit cannot walk into the monster footprint");
  const alreadyInside = unit({ x: monster.x, y: monster.y - 9 });
  assert.equal(
    spacing.canOccupy(alreadyInside, monster.x - 300, monster.y - 9, [alreadyInside, monster]),
    true,
    "an invalid embedded position may move outward"
  );

  const hero = unit({ x: 650, y: 291 });
  const rootedHero = unit({ id: 3, x: 650, y: 310, status: { rootTimer: 2 } });
  assert.equal(spacing.canOccupy(monster, 600, 300, [monster, hero]), false,
    "a boss cannot step into a hero's body");
  assert.equal(spacing.canOccupy(monster, 600, 310, [monster, rootedHero]), false,
    "a boss cannot step into a rooted hero's body");

  const polymorphedBoss = boss("frost-yeti", { status: { polymorphed: true } });
  const pinnedOutside = unit({
    id: 9,
    x: polymorphedBoss.x - 97,
    y: polymorphedBoss.y - 9,
    status: { rootTimer: 2, polymorphed: true }
  });
  const beforeRestoration = [pinnedOutside.x, pinnedOutside.y];
  assert.ok(
    spacing.geometry(polymorphedBoss, pinnedOutside, pinnedOutside.x, pinnedOutside.y).gap > 0,
    "the rooted polymorphed hero starts outside the retained footprint"
  );
  spacing.resolve([polymorphedBoss, pinnedOutside], addMove);
  polymorphedBoss.status.polymorphed = false;
  spacing.resolve([polymorphedBoss, pinnedOutside], addMove);
  assert.deepEqual([pinnedOutside.x, pinnedOutside.y], beforeRestoration,
    "a pinned hero outside the body remains at the same valid position through boss restoration");
  assert.ok(
    spacing.geometry(polymorphedBoss, pinnedOutside, pinnedOutside.x, pinnedOutside.y).gap > 0,
    "restoring the boss never leaves that hero embedded in its body"
  );
});

test("body projection and rooted charge destinations respect production walls and arena bounds", () => {
  const context = spacingContext();
  const spacing = context.window.DungeonBodySpacing;
  const bounds = { width: 900, height: 560 };

  const edgeMovement = productionPushContext(bounds);
  const edgeBoss = boss("frost-yeti", { x: 100, y: 250 });
  const edgePlayer = unit({ id: 51, x: 30, y: 241 });
  const edgeStats = JSON.stringify(edgeBoss);
  const edgeEntities = [edgeBoss, edgePlayer];
  const edgeLegal = legalOnProductionFloor(edgeMovement, [], bounds.width, bounds.height);
  spacing.resolve(edgeEntities, edgeMovement.bodyMovement.pushApart, edgeLegal);
  assertOutsideBody(spacing, edgeBoss, edgePlayer,
    "the edge-constrained correction finds an alternate legal perimeter point");
  assert.ok(edgeMovement.bodyMovement.inBounds(edgePlayer.x, edgePlayer.y, edgePlayer.radius),
    "the corrected player remains within actual game bounds");
  assert.equal(JSON.stringify(edgeBoss), edgeStats, "wall-aware resolution never moves or mutates the boss");

  const wall = { x: 330, y: 245, w: 40, h: 52 };
  const wallMovement = productionPushContext({ ...bounds, walls: [wall] });
  const wallBoss = boss("frost-yeti", { x: 450, y: 280 });
  const wallPlayer = unit({ id: 52, x: 360, y: 271 });
  const wallEntities = [wallBoss, wallPlayer];
  const wallLegal = legalOnProductionFloor(wallMovement, [wall], bounds.width, bounds.height);
  spacing.resolve(wallEntities, wallMovement.bodyMovement.pushApart, wallLegal);
  assertOutsideBody(spacing, wallBoss, wallPlayer, "a wall-blocked radial correction is redirected");
  assert.equal(
    wallMovement.bodyMovement.collidesWalls(wallPlayer.x, wallPlayer.y, wallPlayer.radius, [wall]),
    false,
    "the corrected surface point is legal for the real wall collision function"
  );

  const teleportBoss = boss("frost-yeti", { x: 500, y: 300 });
  const rootedInside = unit({
    id: 53,
    x: teleportBoss.x - 60,
    y: teleportBoss.y - 9,
    status: { rootTimer: 2 }
  });
  const teleportEntities = [teleportBoss, rootedInside];
  const rootedPosition = [rootedInside.x, rootedInside.y];
  spacing.resolve(
    teleportEntities,
    edgeMovement.bodyMovement.pushApart,
    edgeLegal
  );
  assert.deepEqual([rootedInside.x, rootedInside.y], rootedPosition,
    "final-frame correction never forcibly moves an already-rooted hero");
  assert.ok(spacing.geometry(teleportBoss, rootedInside, rootedInside.x, rootedInside.y).gap < 0,
    "the test confirms the pinned hero remains at its pre-existing embedded position");

  const destination = spacing.destination(
    rootedInside,
    teleportBoss.x,
    teleportBoss.y - 9,
    teleportEntities,
    (entity, x, y) => edgeLegal(entity, x, y)
  );
  const landing = spacing.geometry(teleportBoss, rootedInside, destination.x, destination.y);
  assert.ok(landing.gap >= 0,
    "a rooted hero's requested charge/blink destination is redirected outside the body");
  assert.deepEqual([rootedInside.x, rootedInside.y], rootedPosition,
    "destination selection is pure and does not alter the entity before landing");

  const gameMoveContext = productionPushContext(bounds);
  gameMoveContext.WALLS = [];
  gameMoveContext.window.DungeonBodySpacing = spacing;
  gameMoveContext.state = { dungeon: true, entities: teleportEntities };
  vm.runInContext(gameFunctionSource("placeEntityAt"), gameMoveContext, {
    filename: "game-place-entity-at.js"
  });
  gameMoveContext.placeEntityAt(rootedInside, teleportBoss.x, teleportBoss.y - 9);
  assertOutsideBody(spacing, teleportBoss, rootedInside,
    "the actual game teleport placement helper uses the safe destination API");
  assert.equal(rootedInside.status.rootTimer, 2,
    "safe teleport placement does not clear a root status");

  const chargeBoss = boss("frost-yeti", { x: 500, y: 300 });
  const charger = unit({
    id: 54,
    x: 300,
    y: 291,
    status: { rootTimer: 2 },
    extra: {},
    cd: { a2: 0 }
  });
  gameMoveContext.state = { dungeon: true, entities: [charger, chargeBoss] };
  for (const name of [
    "navPathClear", "namedAbilityVfx", "spawnBeam", "spawnSlash", "triggerAtkAnim",
    "spawnAoe", "addShake", "sfx", "abilityLabel", "dealDamage", "applyStun", "log"
  ]) gameMoveContext[name] = () => {};
  vm.runInContext(gameFunctionSource("castCharge"), gameMoveContext, {
    filename: "game-cast-charge.js"
  });
  gameMoveContext.castCharge(charger, chargeBoss);
  assertOutsideBody(spacing, chargeBoss, charger,
    "the actual Warrior Charge landing is corrected outside the boss body");
  assert.equal(charger.status.rootTimer, 2, "Charge landing correction preserves an existing root");

  const blinker = unit({
    id: 55,
    x: 300,
    y: 291,
    status: { stunTimer: 0, rootTimer: 2 },
    extra: {},
    cd: { a2: 0 }
  });
  const threat = unit({ id: 56, x: 150, y: 291, team: "enemy" });
  gameMoveContext.state = { dungeon: true, entities: [blinker, threat, chargeBoss] };
  gameMoveContext.ESCAPE_ANGLE_OFFSETS = [0, 10, -10, 20, -20, 32, -32, 45, -45];
  for (const name of ["applyHaste", "addHot"]) gameMoveContext[name] = () => {};
  vm.runInContext(gameFunctionSource("castBlink"), gameMoveContext, {
    filename: "game-cast-blink.js"
  });
  gameMoveContext.castBlink(blinker, threat);
  assertOutsideBody(spacing, chargeBoss, blinker,
    "the actual Blink landing is corrected outside a boss even when rooted");
  assert.equal(blinker.status.rootTimer, 2, "Blink landing correction does not clear root");
});

test("resolve separates converging melee units, preserves pinned entities and stats, and corrects charge landings", () => {
  const context = spacingContext();
  const spacing = context.window.DungeonBodySpacing;
  const monster = boss("frost-yeti", { x: 500, y: 250 });
  const anchorY = monster.y - 9;
  const actors = [
    unit({ id: 11, x: 320, y: anchorY - 8, range: 60 }),
    unit({ id: 12, x: 320, y: anchorY - 4, range: 60 }),
    unit({ id: 13, x: 320, y: anchorY, range: 60, isPet: true }),
    unit({ id: 14, x: 320, y: anchorY + 4, range: 32, isPet: true, radius: 14 }),
    unit({ id: 15, x: 320, y: anchorY + 8, range: 60, team: "enemy", charging: true })
  ];
  const rooted = unit({
    id: 20,
    x: monster.x - 95 - 2,
    y: anchorY + 20,
    status: { rootTimer: 2 }
  });
  const teleportLanding = unit({
    id: 21,
    x: monster.x + 8,
    y: anchorY,
    team: "enemy",
    teleporting: true
  });
  const dead = unit({ id: 22, x: monster.x, y: anchorY, alive: false });
  const entities = [monster, ...actors, rooted, teleportLanding, dead];
  const bossStart = JSON.stringify(monster);
  const rootedStart = [rooted.x, rooted.y];
  const deadStart = [dead.x, dead.y];

  for (let tick = 0; tick < 90; tick++) {
    for (const actor of actors) {
      const dx = monster.x - actor.x;
      const dy = anchorY - actor.y;
      const length = Math.hypot(dx, dy);
      if (length <= 0.01) continue;
      const step = Math.min(3, length);
      const nx = actor.x + dx / length * step;
      const ny = actor.y + dy / length * step;
      if (spacing.canOccupy(actor, nx, ny, entities)) {
        actor.x = nx;
        actor.y = ny;
      }
    }
    spacing.resolve(entities, addMove);
  }

  assert.equal(JSON.stringify(monster), bossStart, "resolution never changes boss position or stats");
  assert.deepEqual([rooted.x, rooted.y], rootedStart, "rooted heroes retain their exact position");
  assert.deepEqual([dead.x, dead.y], deadStart, "dead entities are not projected");
  for (const actor of actors) assertOutsideBody(spacing, monster, actor, `actor ${actor.id}`);
  assertOutsideBody(spacing, monster, teleportLanding, "teleport landing");
  assert.equal(teleportLanding.teleporting, true, "landing correction retains entity state");

  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i], b = actors[j];
      const peerDistance = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(peerDistance >= a.radius + b.radius + 2,
        `actors ${a.id} and ${b.id} retain visible spacing (${peerDistance.toFixed(2)})`);
    }
    assert.ok(spacing.distance(actors[i], monster) <= actors[i].range,
      `melee actor ${actors[i].id} can still reach the boss after settling`);
  }
  assert.ok(actors.every(actor => actor.x < monster.x + 20),
    "the converged scrum remains at the boss's front rather than being scattered away");
});

test("resolution is stable by entity id and rendering reads entities without mutating them", () => {
  const context = spacingContext();
  const spacing = context.window.DungeonBodySpacing;
  const monster = boss("horned-demon", { x: 400, y: 280 });
  const originals = [
    unit({ id: 3, x: 399, y: 276, isPet: true }),
    unit({ id: 1, x: 401, y: 278 }),
    unit({ id: 2, x: 400, y: 277, team: "enemy", charging: true })
  ];
  const resolveCopy = source => {
    const copy = source.map(entity => ({ ...entity, status: { ...entity.status } }));
    spacing.resolve(copy, addMove);
    return new Map(copy.map(entity => [entity.id, [entity.x, entity.y]]).sort((a, b) => a[0] - b[0]));
  };
  const forward = resolveCopy([monster, ...originals]);
  const reversed = resolveCopy([monster, ...originals].reverse());
  assert.deepEqual([...forward], [...reversed],
    "identical entities resolve to identical positions regardless of input ordering");

  const draw = context.window.DungeonMonsters.drawBody;
  const canvas = new Proxy({}, {
    get(target, key) {
      if (key === "createLinearGradient" || key === "createRadialGradient") {
        return () => ({ addColorStop() {} });
      }
      return target[key] ?? (() => {});
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
  for (const anim of [{ attack: 0 }, { attack: 0.7 }]) {
    const renderEntity = boss("horned-demon", {
      id: 77,
      x: 200,
      y: 180,
      anim,
      atkTimer: 0.25,
      cast: { remaining: 0 }
    });
    const before = JSON.stringify(renderEntity);
    assert.equal(draw(canvas, renderEntity, 0.016), true);
    assert.equal(JSON.stringify(renderEntity), before,
      "idle and attack rendering do not mutate entity state");
  }
});

test("game combat AI and final-frame hook use the public body-spacing adapter", () => {
  const attacks = [];
  const abilityCasts = [];
  const warriorPolicyEvents = [];
  const target = boss("frost-yeti");
  const combatY = target.y - 9;
  const makeAttacker = (id, overrides = {}) => unit({
    id,
    x: target.x - 95,
    y: combatY,
    radius: 17,
    range: 40,
    atkTimer: 0,
    hp: 100,
    maxHp: 100,
    extra: {},
    status: {},
    cd: { ult: 10, a1: 10, a2: 10 },
    ...overrides
  });
  const context = spacingContext({
    state: { dungeon: true, entities: [] },
    WALLS: [],
    ARENA_W: 900,
    ARENA_H: 560,
    autoAttack: (attacker, victim) => {
      attacks.push([attacker.classId || "pet", victim.id]);
      if (attacker.classId === "warrior-policy") warriorPolicyEvents.push("basic");
    },
    pickPriorityTarget: () => target,
    pickRogueTarget: () => target,
    findNearestEnemy: () => target,
    teamMoveFactor: () => 1,
    isSilenced: () => false,
    aliveAllies: () => [],
    hasLOS: () => true,
    navPathClear: () => true,
    castCleave() {},
    castCharge: attacker => {
      if (attacker.classId === "warrior-policy") {
        warriorPolicyEvents.push("charge");
        attacker.cd.a2 = 5;
      }
    },
    castHolySmash() {},
    castPaladinUlti() {},
    castBlessing() {},
    castGladiator() {},
    castRogueUlti: attacker => abilityCasts.push(["rogue-ult", attacker.id]),
    castCheapShot: attacker => abilityCasts.push(["cheap-shot", attacker.id]),
    castSmokeVeil() {},
    castDisorient() {},
    findNearestEnemyForPet: () => target,
    spawnAoe() {},
    spawnText() {},
    spawnProjectile() {},
    spawnSlash() {},
    dealDamage: (source, victim, amount, metadata) => attacks.push([metadata.tag, victim.id]),
    captainFrostBoltStack() {},
    addDot() {},
    applyStun() {},
    log() {}
  });

  vm.runInContext([
    readFileSync(new URL("../public/arena-collision.js", import.meta.url), "utf8"),
    "function manualFocusTarget(){return null;}",
    gameFunctionSource("clamp"),
    gameFunctionSource("collidesWalls"),
    gameFunctionSource("inBounds"),
    gameConstantSource("CORNER_SWEEP_ANGLES"),
    gameFunctionSource("moveEntity"),
    "globalThis.__cornerSweepAngles = CORNER_SWEEP_ANGLES;",
    gameFunctionSource("dist"),
    gameFunctionSource("meleeDistance"),
    gameFunctionSource("opportunisticMeleeSwing"),
    gameFunctionSource("moveToward"),
    gameFunctionSource("aiWarrior"),
    gameFunctionSource("aiRogue"),
    gameFunctionSource("aiPaladin"),
    gameFunctionSource("aiPet")
  ].join("\n"), context, { filename: "game-combat-functions.js" });
  context.findNearestEnemy = () => target;
  assert.deepEqual(
    Array.from(context.__cornerSweepAngles),
    [0, 10, -10, 20, -20, 32, -32, 45, -45],
    "the VM movement check uses the real production corner-sweep directions"
  );

  const warrior = makeAttacker(31, { classId: "warrior", range: 42 });
  const rogue = makeAttacker(32, { classId: "rogue", range: 50 });
  const paladin = makeAttacker(33, { classId: "paladin", range: 50, a2Variant: "custom" });
  const pet = makeAttacker(34, {
    classId: "pet-wolf",
    isPet: true,
    melee: true,
    x: target.x - 92,
    range: 32,
    radius: 14,
    owner: 35
  });
  const owner = unit({ id: 35, classId: "hunter" });
  context.state.entities = [warrior, rogue, paladin, pet, owner, target];

  context.aiWarrior(warrior, 0.016);
  context.aiRogue(rogue, 0.016);
  context.aiPaladin(paladin, 0.016);
  context.aiPet(pet, 0.016);
  assert.deepEqual(attacks, [
    ["warrior", target.id],
    ["rogue", target.id],
    ["paladin", target.id],
    ["pet", target.id]
  ], "Rogue, Warrior, Paladin and short-range melee pet attacks reach a boss at body contact");
  assert.equal(context.window.DungeonBodySpacing.distance(warrior, target), 43.86,
    "a Warrior at body contact retains the pre-spacing 43.86 virtual contact distance");
  assert.ok(context.window.DungeonBodySpacing.distance(warrior, target) > warrior.range,
    "the Warrior's range-42 basic-attack gate remains closed at baseline body contact");

  const liveSpacing = context.window.DungeonBodySpacing;
  const policyHero = makeAttacker(37, { classId: "warrior-policy", range: 42 });
  const oldContact = ((target.radius || 34) + (policyHero.radius || 17)) * 0.86;
  assert.equal(liveSpacing.distance(policyHero, target), oldContact,
    "updated body spacing exactly preserves the Warrior's legacy 43.86 contact metric");
  const runWarriorPolicy = distance => {
    const harnessSpacing = Object.create(liveSpacing);
    harnessSpacing.distance = distance;
    context.window.DungeonBodySpacing = harnessSpacing;
    const attacker = makeAttacker(37, {
      classId: "warrior-policy",
      range: 42,
      cd: { ult: 10, a1: 10, a2: 0 }
    });
    context.state.entities = [attacker, target];
    const start = warriorPolicyEvents.length;
    for (let cycle = 0; cycle < 2; cycle++) {
      attacker.cd.a2 = 0;
      attacker.atkTimer = 0;
      context.aiWarrior(attacker, 0.016);
      attacker.atkTimer = 0;
      context.aiWarrior(attacker, 0.016);
    }
    return warriorPolicyEvents.slice(start);
  };
  const baselineEvents = runWarriorPolicy(() => oldContact);
  const updatedEvents = runWarriorPolicy((attacker, victim) => liveSpacing.distance(attacker, victim));
  context.window.DungeonBodySpacing = liveSpacing;
  assert.deepEqual(baselineEvents, ["charge", "basic", "charge", "basic"],
    "the legacy contact baseline alternates Charge and opportunistic basic swings");
  assert.deepEqual(updatedEvents, baselineEvents,
    "body-spacing preserves the repeated Warrior Charge/basic event policy");
  assert.equal(warrior.range, 42, "spacing does not change Warrior range to mask Charge policy");
  assert.equal(target.range, 120, "spacing does not mutate the boss's attack range");

  context.window.DungeonBodySpacing = liveSpacing;
  for (const bossRooted of [false, true]) {
    for (const gap of [1.2, 1.5, 2]) {
      const rogueBoss = boss("frost-yeti", {
        id: bossRooted ? 951 : 950,
        x: 500,
        y: 300,
        status: {
          rootTimer: bossRooted ? 2 : 0,
          stunTimer: 0,
          silenceTimer: 0
        }
      });
      const bodySurfaceX = rogueBoss.x - (76 + 17 + 2);
      const rogue = makeAttacker(60 + Math.round(gap * 10) + (bossRooted ? 100 : 0), {
        classId: "rogue",
        x: bodySurfaceX - gap,
        y: rogueBoss.y - 9,
        range: 42,
        speed: 100,
        ultVariant: undefined,
        cd: {
          ult: gap === 1.5 ? 10 : 0,
          a1: 10,
          a2: gap === 1.5 ? 0 : 10
        }
      });
      const rootedWitness = unit({
        id: rogue.id + 500,
        x: rogueBoss.x + 115,
        y: rogueBoss.y - 9,
        status: { rootTimer: 2 }
      });
      const witnessPosition = [rootedWitness.x, rootedWitness.y];
      const bossBefore = JSON.stringify(rogueBoss);
      const startGap = liveSpacing.geometry(rogueBoss, rogue, rogue.x, rogue.y).gap;
      const expectedCast = gap === 1.5 ? "cheap-shot" : "rogue-ult";
      assert.ok(Math.abs(startGap - gap) < 1e-8,
        `Rogue starts at the requested ${gap}-pixel contact gap`);
      assert.ok(liveSpacing.distance(rogue, rogueBoss) > 45,
        "Rogue begins just outside the legacy 45-pixel ability threshold");

      abilityCasts.length = 0;
      context.pickRogueTarget = () => rogueBoss;
      context.findNearestEnemy = () => null;
      context.state.entities = [rogue, rootedWitness, rogueBoss];
      let fired = false;
      for (let frame = 0; frame < 8; frame++) {
        context.aiRogue(rogue, 0.016);
        const currentGap = liveSpacing.geometry(rogueBoss, rogue, rogue.x, rogue.y).gap;
        assert.ok(currentGap >= -0.01,
          `production movement never embeds Rogue at gap ${gap} (actual ${currentGap.toFixed(3)})`);
        assert.equal(JSON.stringify(rogueBoss), bossBefore,
          "combat approach never displaces or mutates the stationary/rooted boss");
        assert.deepEqual([rootedWitness.x, rootedWitness.y], witnessPosition,
          "combat approach never displaces the rooted hero");
        if (abilityCasts.some(([kind, id]) => kind === expectedCast && id === rogue.id)) {
          fired = true;
          break;
        }
      }
      assert.ok(fired,
        `actual Rogue movement from gap ${gap} reaches its ready ${expectedCast} ability`);
    }
  }
  context.pickRogueTarget = () => target;
  context.findNearestEnemy = () => target;

  const distantBoss = boss("frost-yeti", { hp: 1000 });
  const longRogue = makeAttacker(36, {
    x: distantBoss.x - 320,
    y: distantBoss.y - 9,
    range: 50,
    ultVariant: "custom",
    cd: { ult: 0, a1: 10, a2: 10 }
  });
  context.state.entities = [longRogue, distantBoss];
  context.pickRogueTarget = () => distantBoss;
  assert.ok(
    context.window.DungeonBodySpacing.distance(longRogue, distantBoss) < 280,
    "body-contact normalization places this raw-320 target inside virtual 280 reach"
  );
  abilityCasts.length = 0;
  context.moveToward = () => {};
  context.aiRogue(longRogue, 0.016);
  assert.deepEqual(abilityCasts, [],
    "Rogue's long-range teleport/finisher policy still rejects targets beyond 280 center pixels");

  const frameHook = gameHtml.match(
    /if\(match\.dungeon && window\.DungeonBodySpacing\)\s*\{\s*window\.DungeonBodySpacing\.resolve\(match\.entities,pushApart,\s*\(entity,x,y\)=>!collidesWalls\(x,y,entity\.radius,WALLS\)\s*&&\s*inBounds\(x,y,entity\.radius\)\);\s*\}/
  );
  assert.ok(frameHook, "the live game loop invokes final-frame body-spacing resolution with wall-aware legality");
  assert.ok(
    gameHtml.indexOf("resolveEntitySeparation(dt);") < frameHook.index,
    "body-spacing resolution runs after ordinary entity separation"
  );
  const hookContext = vm.createContext({
    window: {},
    calls: [],
    WALLS: [],
    collidesWalls: (x, y, radius, walls) => x < 0 || y < 0 || walls.length > 0,
    inBounds: (x, y, radius) => x >= radius && y >= radius
  });
  vm.runInContext(
    `globalThis.frameHook = function (match, pushApart) { ${frameHook[0]} };`,
    hookContext
  );
  hookContext.window.DungeonBodySpacing = {
    resolve(entities, move, legal) { hookContext.calls.push([entities, move, legal]); }
  };
  const entities = [target, warrior];
  const move = () => {};
  hookContext.frameHook({ dungeon: true, entities }, move);
  assert.equal(hookContext.calls.length, 1);
  assert.equal(hookContext.calls[0][0], entities);
  assert.equal(hookContext.calls[0][1], move);
  assert.equal(typeof hookContext.calls[0][2], "function",
    "the live resolver receives the legal-position callback");
  assert.equal(hookContext.calls[0][2](unit({ radius: 17 }), 100, 120), true);
  assert.equal(hookContext.calls[0][2](unit({ radius: 17 }), -1, 120), false,
    "the loop callback rejects movement outside wall/bounds-safe positions");
  hookContext.frameHook({ dungeon: false, entities }, move);
  assert.equal(hookContext.calls.length, 1, "non-dungeon frames do not run dungeon body resolution");
});