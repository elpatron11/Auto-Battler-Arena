import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const engine = readFileSync(new URL("../public/hourly-dungeon.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/game.html", import.meta.url), "utf8");

function harness({ hosted = false, statusData = { encounterId: "frost", cycle: "cycle-1", completed: false }, randomUUID = true } = {}) {
  const messages = [];
  const deferred = [];
  const listeners = new Map();
  const controls = new Map();
  const classNames = new Set();
  const musicModes = [];
  let stoppedMusic = 0;
  const body = { classList: {
    add: name => classNames.add(name),
    remove: (...names) => names.forEach(name => classNames.delete(name))
  } };
  const parent = { postMessage(message) { messages.push(["post", message]); } };
  const document = {
    body,
    getElementById(id) {
      if (id === "backBtn") return { onclick: null };
      return controls.get(id) || null;
    },
    querySelector() { return null; }
  };
  let nextEntityId = 10;
  const window = {
    parent: null,
    location: { origin: "https://arena.test" },
    document,
    performance: { now: () => 100 },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatchEvent() {},
    cancelAnimationFrame() {},
    setTimeout(callback) { deferred.push(callback); return deferred.length; },
    applyArenaMap() {},
    chooseArenaMap: () => ({ id: "hourlyDungeon", w: 900, h: 560, walls: [], gap: { x: 450, y: 280 } }),
    createEntity(classId, team, x, y) {
      return {
        id: nextEntityId++, classId, team, x, y, radius: 17, hp: 100, maxHp: 100,
        speed: 70, dmg: 20, alive: true, isPet: false, status: {}, extra: {},
        matchStats: {}, atkCd: 1, atkTimer: 0, cd: {}, name: classId
      };
    },
    dealDamage(source, target, amount) {
      messages.push(["damage", source && source.name, target.id, amount]);
      target.hp -= amount;
      if (target.hp <= 0) { target.hp = 0; target.alive = false; }
    },
    applyStun(target, duration) { messages.push(["stun", target.id, duration]); },
    spawnAoe() {},
    moveEntity() {},
    autoAttack(source, target) {
      messages.push(["swing", source.id, target.id]);
      window.dealDamage(source, target, source.dmg);
      source.atkTimer = source.atkCd;
    },
    setMusicMode(mode) { musicModes.push(mode); },
    stopGameMusic() { stoppedMusic += 1; },
    requestAnimationFrame: () => 1,
    loop() {},
    log() {},
    renderSideBars() {},
    renderMatchLoadout() {},
    updateRacialBtn() {},
    yPositionsFor: count => Array.from({ length: count }, (_, index) => 100 + index * 70),
    applyDruidPackBuff() {},
    applyCaptainBuffs() {},
    createPet() { return { id: nextEntityId++, isPet: true, alive: true }; },
    ARENA_W: 900,
    ARENA_H: 560,
    crypto: randomUUID ? { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" } : {},
    fetch: async () => ({ ok: true, json: async () => statusData }),
    showMainHub() {},
    startBattle(opts) {
      if (!opts || !opts._ordersConfirmed) return "orders";
      window.state = {
        dungeon: false, over: false, entities: [
          { id: 1, team: "player", alive: true, hp: 100, maxHp: 100 },
          { id: 2, team: "enemy", alive: true, hp: 100, maxHp: 100 }
        ]
      };
      return "started";
    }
  };
  window.parent = hosted ? parent : window;
  const context = vm.createContext({
    window,
    document,
    console,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    Date,
    Math,
    setTimeout,
    clearTimeout,
    fetch: async () => ({ ok: true, json: async () => ({}) })
  });
  vm.runInContext(`
    let state = null;
    let selected = [];
    let selectedBuilds = [];
    let teamSize = 3;
    let abilityChoice = {};
    let ultChoice = {};
    let captainClass = null;
    let captainRacial = null;
    let playerCaptainRef = null;
    let entityIdCounter = 0;
    let activeArena = null;
    let ARENA_W = 900, ARENA_H = 560, rafId = null, lastTime = null;
    const ARENA_MAPS = { citadel: { id: "citadel", w: 900, h: 560, walls: [], gap: {x:450,y:280} } };
    const CLASS_STATS = { warrior: { hp: 100 } };
  `, context);
  vm.runInContext(engine, context);
  function dispatchMessage(data) {
    for (const listener of listeners.get("message") || []) {
      listener({ origin: window.location.origin, source: window.parent, data });
    }
  }
  function dispatchRawMessage(data, overrides = {}) {
    for (const listener of listeners.get("message") || []) {
      listener(Object.assign({ origin: window.location.origin, source: window.parent, data }, overrides));
    }
  }
  function dispatchPagehide() {
    for (const listener of listeners.get("pagehide") || []) listener();
  }
  return {
    context, window, messages, classNames, deferred, musicModes, dispatchMessage, dispatchRawMessage, dispatchPagehide,
    get stoppedMusic() { return stoppedMusic; }
  };
}

function setDungeonState(window, id, players = 3) {
  const party = Array.from({ length: players }, (_, index) => ({
    id: index + 1, team: "player", alive: true, isPet: false, x: 150, y: 100 + index * 70,
    radius: 17, hp: 100, maxHp: 100, status: {}
  }));
  const boss = {
    id: 50, team: "enemy", alive: true, isPet: false, _dungeonBoss: true,
    x: 700, y: 280, radius: 34, hp: 1000, maxHp: 1000, name: "boss", status: {}
  };
  window.state = {
    dungeon: true, over: false, entities: [...party, boss], dungeonEncounter: null,
    _simElapsed: 0, effects: [], traps: [], totems: [], fireZones: []
  };
  const encounter = window.HourlyDungeon.__test.makeEncounter(id, boss, players);
  window.state.dungeonEncounter = encounter;
  return { encounter, party, boss };
}

test("boss preview refuses normal, unflagged, standalone and invalid encounters before touching a live fight", () => {
  for (const search of ["", "?practice=1&guest=1", "?rosterBattlePreview=1", "?practice=1&rosterBattlePreview=1"]) {
    const { window, context, messages } = harness({ hosted: true });
    vm.runInContext("var PRACTICE_ONLY = true; var GUEST_TRIAL = true;", context);
    window.URLSearchParams = URLSearchParams; window.location.search = search;
    const live = { dungeon: false, entities: [], over: false };
    window.state = live;
    assert.throws(() => window.HourlyDungeon.startPreviewEncounter("frost"), /practice flag/);
    assert.equal(window.state, live); assert.equal(messages.length, 0);
  }
  const { window, context } = harness({ hosted: true });
  window.URLSearchParams = URLSearchParams;
  window.location.search = "?practice=1&guest=1&rosterBattlePreview=1";
  const live = { dungeon: false, entities: [], over: false }; window.state = live;
  assert.throws(() => window.HourlyDungeon.startPreviewEncounter("frost"), /guest practice/);
  vm.runInContext("var PRACTICE_ONLY = true; var GUEST_TRIAL = true;", context);
  assert.throws(() => window.HourlyDungeon.startPreviewEncounter("unknown"), /Invalid boss/);
  window.parent = window;
  assert.throws(() => window.HourlyDungeon.startPreviewEncounter("frost"), /embedded guest/);
  assert.equal(window.state, live);
});

test("each explicit boss preview uses the real local encounter and never creates hosted attempts or rewards", () => {
  const { window, context, messages } = harness({ hosted: true });
  vm.runInContext("var PRACTICE_ONLY = true; var GUEST_TRIAL = true; selected = ['warrior','paladin','priest'];", context);
  window.URLSearchParams = URLSearchParams;
  window.location.search = "?practice=1&guest=1&rosterBattlePreview=1";
  window.clearArenaChallengeStateForDungeon = () => window.state && !window.state.dungeon ? false : true;
  window.state = { dungeon: false, entities: [], over: false };
  for (const id of ["frost", "demon", "temple"]) {
    window.HourlyDungeon.startPreviewEncounter(id);
    const boss = window.state.entities.find(e => e._dungeonBoss);
    assert.equal(boss._dungeonEncounterId, id);
    assert.equal(window.state.entities.filter(e => e.team === "player").length, 3);
    assert.equal(window.state.dungeon, true);
    assert.equal(window.state._dungeonAttemptId, null);
    assert.equal(window.state.dungeonCapturedBuff, undefined);
    window.HourlyDungeon.finishBattle("win");
    assert.equal(window.HourlyDungeon.getView().result.claimed, false);
  }
  assert.equal(messages.filter(m => m[0] === "post").length, 0);
});

function setSelected(harness, classes = ["warrior","priest"]) {
  vm.runInContext(`selected = ${JSON.stringify(classes)};`, harness.context);
}

async function drainPromises() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

test("cancelling the dungeon loading tip never reserves a hosted attempt", async () => {
  const h = harness({ hosted: true });
  setSelected(h);
  let finishTip;
  h.window.ArenaTip = {
    cancelAll() {},
    beforeMatch() { return new Promise(resolve => { finishTip = resolve; }); }
  };
  const entering = h.window.HourlyDungeon.enter();
  respond(h, lastRequest(h, "status"), {
    data: { status: { encounterId: "frost", cycle: "cycle-1", completed: false } }
  });
  await drainPromises();
  assert.equal(typeof finishTip, "function");
  assert.equal(h.messages.some(message => message[0] === "post" && message[1].action === "start"), false);
  finishTip("cancelled");
  assert.equal(await entering, false);
  assert.equal(h.window.HourlyDungeon.getView().busy, false);
  assert.equal(h.messages.some(message => message[0] === "post" && message[1].action === "start"), false);
});

test("local dungeon combat waits for the loading tip and starts only after continuation", async () => {
  const h = harness();
  setSelected(h);
  let finishTip;
  h.window.ArenaTip = {
    cancelAll() {},
    beforeMatch() { return new Promise(resolve => { finishTip = resolve; }); }
  };
  const entering = h.window.HourlyDungeon.enter();
  await drainPromises();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finishTip, "function");
  assert.equal(h.window.HourlyDungeon.isActive(), false);
  assert.equal(h.window.HourlyDungeon.getView().busy, true);
  finishTip("started");
  assert.equal(await entering, true);
  assert.equal(h.window.state.dungeon, true);
});

function lastRequest(harness, action) {
  const entry = harness.messages.slice().reverse().find(message =>
    message[0] === "post" && message[1].type === "arena:dungeon-request" && message[1].action === action);
  assert.ok(entry, `expected a posted ${action} request`);
  return entry[1];
}

function gameFunctionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `expected game function ${name}`);
  const end = html.indexOf("\nfunction ", start + 1);
  return html.slice(start, end < 0 ? html.length : end);
}

function respond(harness, request, payload) {
  harness.dispatchMessage(Object.assign({
    type: "arena:dungeon-response", requestId: request.requestId, ok: true
  }, payload));
}

async function enterHostedDungeon(h, {
  cycle = "cycle-1",
  attemptId = "123e4567-e89b-42d3-a456-426614174000",
  serverId = "223e4567-e89b-42d3-a456-426614174001",
  encounterId = "frost"
} = {}) {
  setSelected(h);
  const entering = h.window.HourlyDungeon.enter();
  respond(h, lastRequest(h, "status"), {
    data: { status: { encounterId, cycle, completed: false } }
  });
  await drainPromises();
  const startRequest = lastRequest(h, "start");
  assert.equal(startRequest.requestId, attemptId);
  respond(h, startRequest, {
    data: { start: { id: serverId, encounterId, cycle } }
  });
  assert.equal(await entering, true);
  return { attemptId, serverId };
}

test("expired max-HP buff removes excess health proportionally and only applies once", () => {
  const { window } = harness();
  const baseHp = window.CLASS_STATS ? window.CLASS_STATS.warrior.hp : 100;
  const entity = { hp: 100, maxHp: 100 };
  const buff = { id: "hourly-1", cycle: "c1", kind: "maxHp", value: 0.05, expiresAt: 1000 };
  assert.equal(window.HourlyDungeon.__test.applyEntityBuff(entity, buff, 100), true);
  assert.equal(entity.maxHp, 105);
  assert.equal(entity.hp, 105);
  assert.equal(window.HourlyDungeon.__test.applyEntityBuff(entity, buff, 100), false);
  entity.hp = 52.5;
  assert.equal(window.HourlyDungeon.__test.refreshEntityBuff(entity, 1000000), true);
  assert.equal(entity.maxHp, 100);
  assert.equal(entity.hp, 50);
  assert.equal(window.HourlyDungeon.__test.refreshEntityBuff(entity, 2000000), false);
  assert.equal(baseHp, 100);
});

test("max-HP expiry preserves real Second Wind and Bear Form bonuses through form exit", () => {
  const { window } = harness();
  const buff = { id: "hourly-stack", cycle: "c1", kind: "maxHp", value: 0.05, expiresAt: 1000 };
  const passiveStart = html.indexOf("// Warrior passive — Second Wind:");
  const passiveEnd = html.indexOf("// Shaman's Earth Orbs:", passiveStart);
  const secondWind = html.slice(passiveStart, passiveEnd);
  assert.ok(passiveStart >= 0 && passiveEnd > passiveStart);

  const warrior = { hp: 30, maxHp: 100, alive: true, classId: "warrior", extra: {}, cd: {} };
  assert.equal(window.HourlyDungeon.__test.applyEntityBuff(warrior, buff, 100), true);
  warrior.hp = 30; // Shared damage processing has already applied the hit.
  vm.runInNewContext(secondWind, {
    target: warrior,
    spawnText() {},
    log() {}
  });
  assert.equal(warrior.maxHp, 125);
  assert.equal(warrior.hp, 50);
  assert.equal(window.HourlyDungeon.__test.refreshEntityBuff(warrior, 1000000), true);
  assert.equal(warrior.maxHp, 120);
  assert.equal(warrior.hp, 48);

  const bearVm = vm.createContext({
    CLASS_STATS: { druid: { melee: false, range: 210 } },
    DRUID_MELEE_RANGE: 42,
    healOnDruidShift() {},
    addHot() {},
    spawnAoe() {},
    spawnText() {},
    sfx() {},
    abilityLabel() {},
    log() {}
  });
  vm.runInContext(gameFunctionSource("endDruidForm") + "\n" +
    gameFunctionSource("triggerDruidBearForm"), bearVm);
  const druid = {
    hp: 30, maxHp: 100, alive: true, name: "Druid", x: 0, y: 0,
    a2Variant: "default", extra: { bearHpBonus: 0 },
    status: {}, melee: false, range: 210
  };
  bearVm.druid = druid;
  assert.equal(window.HourlyDungeon.__test.applyEntityBuff(druid, buff, 100), true);
  druid.hp = 30;
  bearVm.e = druid;
  vm.runInContext("triggerDruidBearForm(e);", bearVm);
  assert.equal(druid.extra.bearHpBonus, 37);
  assert.equal(druid.maxHp, 142);
  assert.equal(window.HourlyDungeon.__test.refreshEntityBuff(druid, 1000000), true);
  assert.equal(druid.maxHp, 137);
  vm.runInContext("endDruidForm(e);", bearVm);
  assert.equal(druid.maxHp, 100, "leaving Bear Form must restore the exact unbuffed baseline");
});

test("Frost encounter advances a long-warning nova and applies a short freeze on impact", () => {
  const { window, messages } = harness();
  const { encounter, party } = setDungeonState(window, "frost");
  window.HourlyDungeon.tick(2.5);
  assert.equal(encounter.hazards.length, 1);
  assert.equal(encounter.hazards[0].kind, "circle");
  assert.ok(encounter.hazards[0].duration >= 1.5);
  window.HourlyDungeon.tick(2.9);
  assert.equal(messages.some(message => message[0] === "damage"), false);
  window.HourlyDungeon.tick(0.2);
  assert.ok(messages.some(message => message[0] === "damage"));
  assert.ok(messages.some(message => message[0] === "stun" && message[2] === 0.6));
  assert.ok(party.every(hero => hero.hp <= 100));
});

test("Demon encounter periodically progresses adds but never exceeds two living adds", () => {
  const { window } = harness();
  const { encounter } = setDungeonState(window, "demon");
  assert.equal(encounter.nextAddAt, 1.5);
  window.HourlyDungeon.tick(1.49);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd).length, 0);
  window.HourlyDungeon.tick(0.01);
  const firstAdd = window.state.entities.find(entity => entity._dungeonAdd);
  assert.ok(firstAdd);
  assert.equal(firstAdd.name, "Demon Hound");
  assert.equal(firstAdd.hp, 90);
  assert.equal(firstAdd.maxHp, 90);
  assert.equal(firstAdd.dmg, 11);
  assert.equal(firstAdd._dungeonAddDamageFactor, 0.8);
  assert.equal(firstAdd.speed, 70);
  assert.equal(firstAdd.atkCd, 1.5);
  assert.equal(firstAdd.atkTimer, 0.7);
  assert.equal(encounter.nextAddAt, 8);

  window.HourlyDungeon.tick(6.49);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd && entity.alive).length, 1);
  window.HourlyDungeon.tick(0.01);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd && entity.alive).length, 2);
  assert.equal(encounter.nextAddAt, 14.5);

  window.HourlyDungeon.tick(6.49);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd && entity.alive).length, 2);
  window.HourlyDungeon.tick(0.01);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd && entity.alive).length, 2,
    "the 6.5-second spawn attempt respects the two-living-add cap");
  assert.ok(Math.abs(encounter.nextAddAt - 21) < 1e-9);

  firstAdd.alive = false;
  window.HourlyDungeon.tick(6.49);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd && entity.alive).length, 1);
  window.HourlyDungeon.tick(0.01);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd && entity.alive).length, 2,
    "the next 6.5-second attempt replaces a dead add");
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd).length, 2,
    "dead dungeon adds are removed instead of accumulating as corpses");
  assert.ok(Math.abs(encounter.nextAddAt - 27.5) < 1e-9);
});

test("boss hard CC pauses new specials and adds but does not cancel a telegraphed hit", () => {
  const { window, messages } = harness();
  for (const control of [
    { stunTimer: 1 }, { fearTimer: 1 }, { sapTimer: 1 },
    { disorientTimer: 1 }, { polymorphed: true }
  ]) {
    const { encounter, boss } = setDungeonState(window, "frost");
    boss.status = control;
    window.HourlyDungeon.tick(3);
    assert.equal(encounter.hazards.length, 0, "controlled bosses cannot start new specials");
    boss.status = {};
    window.HourlyDungeon.tick(0.1);
    assert.equal(encounter.hazards.length, 1, "the delayed special starts after control ends");
    window.state = null;
  }

  const { encounter, boss } = setDungeonState(window, "frost");
  window.HourlyDungeon.tick(2.5);
  assert.equal(encounter.hazards.length, 1);
  boss.status = { fearTimer: 5 };
  window.HourlyDungeon.tick(3);
  assert.ok(messages.some(message => message[0] === "damage"),
    "an already telegraphed hazard still resolves while the boss is controlled");

  const demon = setDungeonState(window, "demon");
  demon.boss.status = { stunTimer: 1 };
  demon.encounter.nextAddAt = 0;
  window.HourlyDungeon.tick(0.1);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd && entity.alive).length, 0);
});

test("Temple cone cadence, warning, locked direction, and impact damage remain exact", () => {
  const { window, messages } = harness();
  const { encounter, party, boss } = setDungeonState(window, "temple");
  party[0].x = boss.x - 190;
  party[0].y = boss.y;
  assert.equal(encounter.nextSpecialAt, 1.5);
  window.HourlyDungeon.tick(1.49);
  assert.equal(encounter.hazards.length, 0, "the first cone is not early");
  window.HourlyDungeon.tick(0.01);
  assert.equal(encounter.hazards.length, 1);
  const firstCone = encounter.hazards[0];
  const lockedAngle = firstCone.angle;
  assert.equal(firstCone.kind, "cone");
  assert.equal(firstCone.duration, 1.5);
  assert.equal(firstCone.remaining, 1.5);
  assert.equal(firstCone.damage, 46);
  assert.equal(firstCone.radius, 252);
  assert.equal(firstCone.spread, Math.PI * 0.66);
  assert.equal(encounter.nextSpecialAt, 4.5,
    "the next cone is scheduled three simulated seconds after the first");

  party[1].x = 200;
  party[1].y = 500;
  window.HourlyDungeon.tick(0.75);
  assert.equal(firstCone.angle, lockedAngle);
  assert.equal(messages.filter(message => message[0] === "damage").length, 0,
    "the cone does not damage during its 1.5-second warning");
  window.HourlyDungeon.tick(0.75);
  assert.equal(messages.filter(message => message[0] === "damage").length, 1);
  assert.equal(messages.find(message => message[0] === "damage")[3], 46);
  assert.equal(party[0].hp, 54);
  assert.equal(encounter.hazards.length, 0);

  window.HourlyDungeon.tick(1.49);
  assert.equal(encounter.hazards.length, 0, "the next cone is not early");
  window.HourlyDungeon.tick(0.01);
  assert.equal(encounter.hazards.length, 1);
  assert.equal(encounter.hazards[0].duration, 1.5);
  assert.equal(encounter.hazards[0].damage, 46);
  assert.equal(encounter.hazards[0].radius, 252);
  assert.equal(encounter.hazards[0].spread, Math.PI * 0.66);
  assert.equal(encounter.nextSpecialAt, 7.5);
});

test("summon damage budget applies to all damage without nerfing bosses or normal Warriors", () => {
  const prefix = gameFunctionSource("dealDamage").split("// Team-wide racial passives.")[0] + "\nreturn amount;\n}";
  const context = vm.createContext({
    window: {},
    isSteelCycloneing: () => false,
    talentConditionalDamage: (_source, _target, amount) => amount
  });
  vm.runInContext(prefix, context);
  const target = { alive: true, status: {} };
  for (const base of [11, 16, 14, 50]) {
    assert.equal(context.dealDamage({ _dungeonAdd: true, _dungeonAddDamageFactor: 0.8 }, target, base, {}), base * 0.8);
  }
  assert.equal(context.dealDamage({ _dungeonAdd: true, _dungeonAddDamageFactor: 0.8 }, target, 10, { isDot: true }), 8);
  assert.equal(context.dealDamage({ _dungeonBoss: true }, target, 31, {}), 31);
  assert.equal(context.dealDamage({ classId: "warrior", _dungeonAddDamageFactor: 0.8 }, target, 20, {}), 20);
});

test("Frost casts ground zones every 1.5 seconds independently of its wider nova", () => {
  const { window } = harness();
  const { encounter, boss } = setDungeonState(window, "frost");
  window.HourlyDungeon.tick(1.5);
  const zone = encounter.hazards[0];
  assert.equal(zone.effect, "frostZone");
  assert.equal(zone.radius, 112);
  assert.equal(zone.damage, 46);
  assert.equal(zone.duration, 3);
  assert.equal(encounter.nextSpecialAt, 3);
  window.HourlyDungeon.tick(1.5);
  assert.equal(encounter.hazards.filter(hazard => hazard.effect === "frostZone").length, 2);
  assert.equal(encounter.nextSpecialAt, 4.5);
  window.HourlyDungeon.tick(5.5);
  const nova = encounter.hazards.find(hazard => hazard.effect === "frostNova");
  assert.ok(nova);
  assert.equal(nova.x, boss.x);
  assert.equal(nova.y, boss.y);
  assert.equal(nova.radius, 195);
  assert.equal(nova.duration, 3);
  assert.equal(nova.damage, 66);
  assert.equal(encounter.nextNovaAt, 17);
  assert.ok(encounter.hazards.some(hazard => hazard.effect === "frostZone"));
});

test("all bosses chase the nearest attackable non-pet hero and use shared real melee attacks", () => {
  for (const id of ["frost", "temple", "demon"]) {
    const { window, messages } = harness();
    const { boss, party } = setDungeonState(window, id, 5);
    Object.assign(boss, { range: 85, speed: 48, dmg: 31, atkCd: 1.5, atkTimer: 0 });
    party[0].x = boss.x - 20;
    party[0].status.untargetable = true;
    party[1].x = boss.x - 30;
    party[1].status.sapTimer = 1;
    party[2].x = boss.x - 40;
    party[2].status.invis = true;
    party[2].status.markedTimer = 0;
    party[3].x = boss.x - 230;
    party[3].y = boss.y;
    party[4].x = boss.x - 170;
    party[4].y = boss.y;
    const pet = { id: 100, team: "player", alive: true, isPet: true, x: boss.x - 1, y: boss.y, hp: 100 };
    window.state.entities.push(pet);
    window.moveEntity = (entity, dx, dy, speed, dt) => {
      entity.x += dx * speed * dt;
      entity.y += dy * speed * dt;
    };

    const initialX = boss.x;
    window.HourlyDungeon.tickBoss(boss, 1);
    assert.equal(boss.lastTarget, party[4], `${id} chooses the nearest eligible hero`);
    assert.ok(boss.x < initialX, `${id} chases while its target is out of range`);
    assert.equal(messages.filter(entry => entry[0] === "swing").length, 0);

    party[4].x = boss.x - 30;
    party[4].y = boss.y;
    window.HourlyDungeon.tickBoss(boss, 0.1);
    assert.equal(party[0].hp, 100, `${id} ignores untargetable heroes`);
    assert.equal(party[1].hp, 100, `${id} ignores sapped heroes`);
    assert.equal(party[2].hp, 100, `${id} ignores invisible unmarked heroes`);
    assert.equal(party[4].hp, 69);
    assert.equal(boss.atkTimer, 1.5);
    assert.deepEqual(messages.filter(entry => entry[0] === "swing").map(entry => entry[2]), [party[4].id]);

    window.HourlyDungeon.tickBoss(boss, 0.1);
    assert.equal(party[4].hp, 69, `${id} respects the shared attack timer`);
    assert.equal(messages.filter(entry => entry[0] === "swing").length, 1);
    boss.atkTimer = 0;
    window.HourlyDungeon.tickBoss(boss, 0.1);
    assert.equal(party[4].hp, 38);
    assert.equal(messages.filter(entry => entry[0] === "swing").length, 2);
  }
});

test("all bosses respect roots for movement but can still swing in range", () => {
  for (const id of ["frost", "temple", "demon"]) {
    const { window, messages } = harness();
    const { boss, party } = setDungeonState(window, id);
    Object.assign(boss, { range: 85, speed: 48, dmg: 31, atkCd: 1.5, atkTimer: 0 });
    boss.status.rootTimer = 2;
    party[0].x = boss.x - 300;
    party[0].y = boss.y;
    let moves = 0;
    window.moveEntity = () => { moves += 1; };
    const initialX = boss.x;
    window.HourlyDungeon.tickBoss(boss, 0.1);
    assert.equal(moves, 0, `${id} must not move while rooted`);
    assert.equal(boss.x, initialX);
    assert.equal(messages.filter(entry => entry[0] === "swing").length, 0);

    party[0].x = boss.x - 30;
    window.HourlyDungeon.tickBoss(boss, 0.1);
    assert.equal(moves, 0, `${id} remains rooted while attacking`);
    assert.equal(party[0].hp, 69);
    assert.equal(messages.filter(entry => entry[0] === "swing").length, 1);
  }
});

test("Demon swings normally during summons and attacks on the tick its chase closes into range", () => {
  const { window, messages } = harness();
  const { encounter, boss, party } = setDungeonState(window, "demon");
  Object.assign(boss, { dmg: 42, range: 100, speed: 60, atkCd: 1.4 });
  party[0].x = boss.x - 30;
  party[0].y = boss.y;
  boss.atkTimer = 0;

  window.HourlyDungeon.__test.tickEncounter(1.5);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd && entity.alive).length, 1);
  window.HourlyDungeon.tickBoss(boss, 0.1);
  assert.equal(party[0].hp, 58, "a summoning Demon still uses its ordinary 42-damage swing");
  assert.equal(boss.atkTimer, 1.4);
  assert.equal(messages.filter(entry => entry[0] === "swing").length, 1);

  window.HourlyDungeon.__test.tickEncounter(6.5);
  assert.equal(window.state.entities.filter(entity => entity._dungeonAdd && entity.alive).length, 2);
  window.HourlyDungeon.tickBoss(boss, 0.1);
  assert.equal(party[0].hp, 58, "a second summon does not bypass the attack cooldown");
  assert.equal(messages.filter(entry => entry[0] === "swing").length, 1);
  boss.atkTimer = 0;
  window.HourlyDungeon.tickBoss(boss, 0.1);
  assert.equal(party[0].hp, 16);
  assert.equal(messages.filter(entry => entry[0] === "swing").length, 2);

  const closing = harness();
  const { boss: chargingBoss, party: closingParty } = setDungeonState(closing.window, "demon");
  Object.assign(chargingBoss, { dmg: 42, range: 100, speed: 60, atkCd: 1.4 });
  closingParty[0].x = chargingBoss.x - 200;
  closingParty[0].y = chargingBoss.y;
  chargingBoss.atkTimer = 0;
  closing.window.moveEntity = (entity, dx, dy, speed, dt) => {
    entity.x += dx * speed * dt;
    entity.y += dy * speed * dt;
  };
  closing.window.HourlyDungeon.tickBoss(chargingBoss, 2);
  assert.ok(Math.hypot(closingParty[0].x - chargingBoss.x, closingParty[0].y - chargingBoss.y) <= chargingBoss.range);
  assert.equal(closingParty[0].hp, 58, "the Demon attacks in the same tick its movement reaches melee range");
  assert.equal(closing.messages.filter(entry => entry[0] === "swing").length, 1);
});

test("bosses retain encounter-specific HP and mobile melee baselines", async () => {
  for (const id of ["frost", "temple", "demon"]) {
    for (const size of [2, 3]) {
      const demon = id === "demon";
      const hp = (demon ? 2100 : 1860) + Math.max(0, size - 3) * (demon ? 440 : 390);
      const h = harness({ statusData: { encounterId: id, cycle: "cycle-1", completed: false } });
      setSelected(h, Array(size).fill("warrior"));
      await h.window.HourlyDungeon.enter();
      const boss = h.window.state.dungeonEncounter.boss;
      assert.equal(boss.maxHp, hp, `${id} has the shared max HP at party size ${size}`);
      assert.equal(boss.hp, hp);
      assert.equal(boss.dmg, demon ? 42 : 31);
      assert.equal(boss.speed, demon ? 60 : 48);
      assert.equal(boss.range, demon ? 100 : 85);
      assert.equal(boss.melee, true);
      assert.equal(boss.atkCd, demon ? 1.4 : 1.5);
      assert.equal(boss.atkTimer, 1);
    }
  }
});

test("hourly entry rejects parties outside exactly two or three before reserving an attempt",async()=>{
  for(const size of [0,1,4,5]){
    const h=harness({hosted:true});setSelected(h,Array(size).fill('warrior'));
    await h.window.HourlyDungeon.enter();
    assert.equal(h.messages.filter(m=>m[0]==='post').length,0);
    assert.equal(h.window.state,null);
    assert.match(h.window.HourlyDungeon.getView().error,/2 or 3/);
  }
});

test("dungeon cleanup clears combat entities/effects and does not add local profile rewards", () => {
  const { window, messages, classNames, deferred } = harness();
  const profile = { battleWins: 4, battleLosses: 2, gold: 19 };
  const original = JSON.stringify(profile);
  setDungeonState(window, "frost");
  window.state.effects.push({ type: "impact" });
  window.HourlyDungeon.cleanupForNormalBattle();
  assert.equal(window.state, null);
  assert.equal(classNames.has("battleMode"), false);

  setDungeonState(window, "demon");
  window.HourlyDungeon.finishBattle("Victory!");
  assert.equal(window.HourlyDungeon.getView().result.localPractice, true);
  assert.match(window.HourlyDungeon.getView().result.message, /no reward/i);
  assert.equal(window.HourlyDungeon.getView().practiceOnly, true);
  assert.equal(JSON.stringify(profile), original);
  assert.equal(messages.filter(message => message[0] === "post").length, 0);
  deferred.forEach(callback => callback());
  assert.equal(window.state, null);
});

test("game integration bypasses regular settlement and guest match counters for dungeon fights", () => {
  const dungeonFinish = html.indexOf("if(state&&state.dungeon&&window.HourlyDungeon)");
  const normalSettlement = html.indexOf("try{finalizeMatchStats();}", dungeonFinish);
  const guestTrial = html.slice(html.indexOf('<script id="guest-quick-match-trial">'));
  assert.ok(dungeonFinish > -1);
  assert.ok(normalSettlement > dungeonFinish);
  assert.match(guestTrial, /state\.dungeon\s*\|\|/);
  assert.match(html, /opts\.dungeon\s*\|\|/);
  assert.match(html, /ticket\.attackBuff\|\|null/);
  assert.match(html, /ticket\.defenseBuff\|\|null/);
  const challengeStart = html.indexOf("if(event.data.type==='arena:start-challenge')");
  const challengeMutation = html.indexOf("activeChallenge=ticket", challengeStart);
  const challengeGate = html.slice(challengeStart, challengeMutation);
  assert.ok(challengeStart >= 0 && challengeMutation > challengeStart);
  assert.match(challengeGate, /HourlyDungeon\.isActive\(\)/);
  assert.match(challengeGate, /dungeonView\.busy/);
  assert.match(challengeGate, /dungeonView\.claimPending/);
  assert.match(challengeGate, /arena:dungeon-busy/);
  assert.match(html, /window\.clearArenaChallengeStateForDungeon=function\(\)/);
  assert.match(engine, /root\.clearArenaChallengeStateForDungeon\(\)\s*===\s*false/);
});

test("Warrior Second Wind still works normally but never procs on a dungeon boss", () => {
  const start = html.indexOf("// Warrior passive — Second Wind:");
  const end = html.indexOf("// Shaman's Earth Orbs:", start);
  const passive = html.slice(start, end);
  assert.match(passive, /target\.classId==='warrior'\s*&&\s*!target\._dungeonBoss/);
  const run = target => vm.runInNewContext(passive, { target, spawnText() {}, log() {} });
  const boss = { classId: "warrior", _dungeonBoss: true, alive: true, hp: 20, maxHp: 100, extra: {}, cd: {} };
  run(boss);
  assert.equal(boss.maxHp, 100);
  assert.equal(boss.extra.enduranceCd, undefined);
  const warrior = { classId: "warrior", alive: true, hp: 20, maxHp: 100, extra: {}, cd: {} };
  run(warrior);
  assert.equal(warrior.maxHp, 120);
  assert.equal(warrior.extra.enduranceCd, 10);
});

test("loss cleanup clears active combat and allows a new local attempt", async () => {
  const h = harness();
  setSelected(h);
  assert.equal(await h.window.HourlyDungeon.enter(), true);
  h.window.HourlyDungeon.finishBattle("Defeat...");
  h.deferred.at(-1)();
  assert.equal(h.window.state, null);
  assert.equal(h.window.HourlyDungeon.isActive(), false);
  assert.equal(h.window.HourlyDungeon.canEnter(), true);
  assert.equal(await h.window.HourlyDungeon.enter(), true);
  assert.equal(h.window.state.dungeon, true);
});

test("dungeon entry is rejected while a regular fight is still active", async () => {
  const h = harness();
  setSelected(h);
  await h.window.HourlyDungeon.refreshStatus();
  h.window.state = { dungeon: false, over: false, entities: [] };
  assert.equal(h.window.HourlyDungeon.canEnter(), false);
  assert.equal(await h.window.HourlyDungeon.enter(), false);
  assert.equal(h.messages.some(message => message[0] === "post" &&
    message[1].type === "arena:dungeon-request" && message[1].action === "start"), false);
});

test("leaving or replacing an unfinished owned attempt sends abandoned before teardown, never after victory", async () => {
  const exited = harness({ hosted: true });
  const exitedIds = await enterHostedDungeon(exited);
  exited.window.HourlyDungeon.exit();
  const exitFinish = lastRequest(exited, "finish");
  assert.equal(exitFinish.id, exitedIds.serverId);
  assert.equal(exitFinish.requestId, exitedIds.attemptId);
  assert.equal(exitFinish.outcome, "abandoned");
  assert.equal(exited.window.state, null);

  const replaced = harness({ hosted: true });
  await enterHostedDungeon(replaced);
  replaced.window.startBattle({ _ordersConfirmed: true });
  assert.equal(lastRequest(replaced, "finish").outcome, "abandoned");
  assert.equal(replaced.window.state.dungeon, false);

  const victory = harness({ hosted: true });
  await enterHostedDungeon(victory);
  victory.window.HourlyDungeon.finishBattle("Victory!");
  assert.equal(lastRequest(victory, "finish").outcome, "win");
  victory.window.HourlyDungeon.exit();
  assert.equal(victory.messages.filter(message => message[0] === "post" &&
    message[1].type === "arena:dungeon-request" && message[1].action === "finish").length, 1);
});

test("hosted victory receipt survives combat cleanup, retries same UUID, and claims the award", async () => {
  const h = harness({ hosted: true });
  setSelected(h);
  const entering = h.window.HourlyDungeon.enter();
  const statusRequest = lastRequest(h, "status");
  respond(h, statusRequest, { data: { status: { encounterId: "frost", cycle: "cycle-1", completed: false } } });
  await drainPromises();
  const startRequest = lastRequest(h, "start");
  assert.match(startRequest.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  respond(h, startRequest, { data: { start: { id: "server-attempt", encounterId: "frost", cycle: "cycle-1" } } });
  assert.equal(await entering, true);
  h.window.HourlyDungeon.finishBattle("Victory!");
  const finishRequest = lastRequest(h, "finish");
  h.deferred.at(-1)();
  assert.equal(h.window.state, null);
  assert.equal(h.window.HourlyDungeon.isActive(), false);
  respond(h, finishRequest, { ok: false, error: "temporary finish failure" });
  await drainPromises();
  const failedResult = h.window.HourlyDungeon.getView().result;
  assert.match(failedResult.claimError, /temporary finish failure/);
  assert.equal(h.window.HourlyDungeon.retryClaim(), true);
  const retryRequest = lastRequest(h, "finish");
  assert.equal(retryRequest.requestId, finishRequest.requestId);
  assert.equal(retryRequest.id, finishRequest.id);
  assert.equal(retryRequest.outcome, "win");
  respond(h, retryRequest, { data: { finish: { awarded: true, status: {
    encounterId: "frost", cycle: "cycle-1", completed: true,
    activeBuff: { kind: "maxHp", name: "Frostbound Guardian", value: 0.05, expiresAt: Date.now() + 3_600_000 },
  } } } });
  await drainPromises();
  assert.equal(h.window.HourlyDungeon.getView().result.claimed, true);
  assert.equal(h.window.HourlyDungeon.canEnter(), false);
  const refresh = h.window.HourlyDungeon.refreshStatus();
  respond(h, lastRequest(h, "status"), {
    data: { status: { encounterId: "temple", cycle: "cycle-2", completed: false } }
  });
  await refresh;
  assert.equal(h.window.HourlyDungeon.canEnter(), true);
});

test("successful clears automatically expose the confirmed buff reward without collection loot or another claim action", async () => {
  for (const [encounterId, kind, value, name] of [
    ["frost", "maxHp", 0.05, "Frostbound Guardian"],
    ["demon", "damage", 0.04, "Demon Lord"],
    ["temple", "healing", 0.05, "Temple Sentinel"],
  ]) {
    const h = harness({ hosted: true });
    await enterHostedDungeon(h, { encounterId, cycle: 17 });
    h.window.playerProfile = { spells: ["existing spell"], ultimates: ["existing ultimate"], talents: ["existing talent"] };
    const before = JSON.stringify(h.window.playerProfile);
    h.window.HourlyDungeon.finishBattle("Victory!");
    const finishRequest = lastRequest(h, "finish");
    assert.equal(finishRequest.outcome, "win", "the win sends its reward claim automatically");
    assert.equal(finishRequest.cycle, 17, "reload recovery retains the clear's hourly cycle");
    h.deferred.at(-1)();
    const buff = { kind, value, name, cycle: 17, expiresAt: Date.now() + 3_600_000 };
    respond(h, finishRequest, { data: { awarded: true, status: {
      encounterId, cycle: 17, completed: true, activeBuff: buff,
    } } });
    await drainPromises();
    const view = h.window.HourlyDungeon.getView();
    assert.equal(view.result.claimed, true);
    assert.equal(view.result.buff.name, name);
    assert.equal(view.result.buff.kind, kind);
    assert.equal(view.result.buff.value, value);
    assert.equal(view.result.buff.expiresAt, buff.expiresAt);
    assert.equal(view.status.activeBuff.name, name);
    assert.equal(h.window.HourlyDungeon.canEnter(), false);
    view.result.buff.name = "mutated copy";
    assert.equal(h.window.HourlyDungeon.getView().result.buff.name, name);
    assert.equal(JSON.stringify(h.window.playerProfile), before, "permanent collections are unchanged");
  }
});

test("host claim states recover pending and failed wins by server attempt id while preserving the client retry UUID", async () => {
  const h = harness({ hosted: true });
  const ids = await enterHostedDungeon(h, { cycle: 17 });
  h.dispatchMessage({
    type: "arena:dungeon-claim-state",
    id: "723e4567-e89b-42d3-a456-426614174006",
    outcome: "loss", state: "pending", cycle: 16
  });
  assert.equal(h.window.HourlyDungeon.isActive(), true);
  assert.equal(h.window.HourlyDungeon.getView().encounter.id, "frost");
  assert.equal(h.window.HourlyDungeon.getView().result, null,
    "a recovered loss cannot replace the active encounter");
  h.window.HourlyDungeon.finishBattle("Victory!");
  const finishRequest = lastRequest(h, "finish");
  assert.equal(finishRequest.requestId, ids.attemptId);
  assert.equal(finishRequest.id, ids.serverId);

  h.dispatchMessage({
    type: "arena:dungeon-claim-state", id: ids.serverId, outcome: "win",
    state: "pending", cycle: 17
  });
  assert.equal(h.window.HourlyDungeon.getView().result.claimPending, true);
  h.dispatchMessage({
    type: "arena:dungeon-claim-state", id: ids.serverId, outcome: "win",
    state: "error", cycle: 17, error: "Recovery is still waiting."
  });
  respond(h, finishRequest, { ok: false, error: "Recovery is still waiting." });
  await drainPromises();
  assert.match(h.window.HourlyDungeon.getView().result.claimError, /Recovery is still waiting/);
  assert.equal(h.window.HourlyDungeon.retryClaim(), true);
  const retryRequest = lastRequest(h, "finish");
  assert.equal(retryRequest.requestId, ids.attemptId, "an in-session retry keeps the client UUID");
  assert.equal(retryRequest.id, ids.serverId, "the host state resolves by the separate server attempt id");
  respond(h, retryRequest, {
    data: { finish: { awarded: { kind: "damage", value: 0.04 }, status: { cycle: 17, completed: true } } }
  });
  await drainPromises();
  assert.equal(h.window.HourlyDungeon.getView().result.claimed, true);
});

test("reloaded claim UI waits through regular combat, ignores untrusted messages, and does not let old losses overwrite a win", () => {
  const h = harness({ hosted: true });
  const id = "323e4567-e89b-42d3-a456-426614174002";
  const pendingWin = {
    type: "arena:dungeon-claim-state", id, outcome: "win", state: "pending", cycle: 17
  };
  h.dispatchRawMessage(pendingWin, { origin: "https://evil.test", source: {} });
  assert.equal(h.window.HourlyDungeon.getView().result, null);

  h.window.state = { dungeon: false, over: false, entities: [] };
  h.dispatchMessage(pendingWin);
  h.dispatchMessage({
    type: "arena:dungeon-claim-state",
    id: "423e4567-e89b-42d3-a456-426614174003",
    outcome: "loss", state: "pending", cycle: 16
  });
  assert.equal(h.window.HourlyDungeon.getView().result, false,
    "pending claim UI must not cover a regular match");
  assert.equal(h.window.HourlyDungeon.getView().claimPending, true,
    "an older loss cannot replace the pending win state");
  h.window.state = null;
  h.window.showMainHub();
  assert.equal(h.window.HourlyDungeon.getView().result.outcome, "Victory!");
  assert.equal(h.window.HourlyDungeon.getView().result.attemptId, id);
  assert.equal(h.window.HourlyDungeon.getView().result.claimPending, true);
});

test("claim cycle metadata distinguishes an older error while missing legacy cycles stay gated until settlement", async () => {
  const h = harness({ hosted: true });
  const status = h.window.HourlyDungeon.refreshStatus();
  respond(h, lastRequest(h, "status"), {
    data: { status: { encounterId: "frost", cycle: 18, completed: false } }
  });
  await status;
  const olderId = "523e4567-e89b-42d3-a456-426614174004";
  h.dispatchMessage({
    type: "arena:dungeon-claim-state", id: olderId, outcome: "win",
    state: "error", cycle: 17, error: "Old claim failed."
  });
  assert.equal(h.window.HourlyDungeon.canEnter(), true,
    "a server-provided older cycle should not block the current hour");

  const legacyId = "623e4567-e89b-42d3-a456-426614174005";
  h.dispatchMessage({
    type: "arena:dungeon-claim-state", id: legacyId, outcome: "win", state: "pending"
  });
  assert.equal(h.window.HourlyDungeon.canEnter(), false,
    "a legacy receipt with unknown cycle remains gated while pending");
  h.dispatchMessage({
    type: "arena:dungeon-claim-state", id: legacyId, outcome: "win", state: "confirmed",
    data: { awarded: null, status: { encounterId: "frost", cycle: 18, completed: false } }
  });
  assert.equal(h.window.HourlyDungeon.canEnter(), true);
});

test("draw finish maps to supported loss and does not block another attempt", async () => {
  const h = harness({ hosted: true });
  setSelected(h);
  const entering = h.window.HourlyDungeon.enter();
  respond(h, lastRequest(h, "status"), {
    data: { status: { encounterId: "demon", cycle: "cycle-1", completed: false } }
  });
  await drainPromises();
  respond(h, lastRequest(h, "start"), {
    data: { start: { id: "server-attempt", encounterId: "demon", cycle: "cycle-1" } }
  });
  assert.equal(await entering, true);
  h.window.HourlyDungeon.finishBattle("Draw");
  const finishRequest = lastRequest(h, "finish");
  assert.equal(finishRequest.outcome, "loss");
  h.deferred.at(-1)();
  respond(h, finishRequest, { data: { finish: { awarded: null } } });
  await drainPromises();
  assert.equal(h.window.HourlyDungeon.getView().result.outcome, "Draw");
  assert.equal(h.window.HourlyDungeon.canEnter(), true);
});

test("refreshStatus coalesces concurrent hosted requests and returns the status", async () => {
  const h = harness({ hosted: true });
  const first = h.window.HourlyDungeon.refreshStatus();
  const second = h.window.HourlyDungeon.refreshStatus();
  const request = lastRequest(h, "status");
  assert.equal(h.messages.filter(message => message[0] === "post" &&
    message[1].type === "arena:dungeon-request" && message[1].action === "status").length, 1);
  respond(h, request, { data: { status: { encounterId: "temple", cycle: "cycle-2", completed: false } } });
  assert.equal((await first).encounterId, "temple");
  assert.equal((await second).cycle, "cycle-2");
});

test("normal AI starts apply the captured active buff only after orders confirm; PvP uses ticket buffs", async () => {
  const activeBuff = { id: "local", cycle: "cycle-1", kind: "maxHp", value: 0.05, expiresAt: "2099-01-01T00:00:00Z" };
  const h = harness({ statusData: { encounterId: "frost", cycle: "cycle-1", completed: false, activeBuff } });
  await h.window.HourlyDungeon.refreshStatus();
  assert.equal(h.window.startBattle({}), "orders");
  assert.equal(h.window.state, null);
  h.window.startBattle({ _ordersConfirmed: true });
  let player = h.window.state.entities.find(entity => entity.team === "player");
  let enemy = h.window.state.entities.find(entity => entity.team === "enemy");
  assert.equal(player.maxHp, 105);
  assert.equal(enemy.maxHp, 100);

  h.window.startBattle({
    _ordersConfirmed: true,
    onlineChallenge: true,
    attackBuff: { id: "ticket-a", cycle: "pvp", kind: "damage", value: 0.04, expiresAt: "2099-01-01T00:00:00Z" },
    defenseBuff: { id: "ticket-d", cycle: "pvp", kind: "healing", value: 0.05, expiresAt: "2099-01-01T00:00:00Z" }
  });
  player = h.window.state.entities.find(entity => entity.team === "player");
  enemy = h.window.state.entities.find(entity => entity.team === "enemy");
  assert.equal(player.maxHp, 100);
  assert.equal(player._hourlyDungeonDamageFactor, 1.04);
  assert.equal(enemy._hourlyDungeonHealingFactor, 1.05);
});

test("UUID fallback stays RFC 4122 v4-shaped without randomUUID", () => {
  const h = harness({ randomUUID: false });
  assert.match(h.window.HourlyDungeon.__test.createRequestId(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("exit selects menu music and pagehide stops music", () => {
  const h = harness();
  h.window.HourlyDungeon.exit();
  assert.equal(h.musicModes.at(-1), "menu");
  h.dispatchPagehide();
  assert.equal(h.stoppedMusic, 1);
});

test("normal start invalidates in-flight status and start responses before they can replace the arena", async () => {
  const h = harness({ hosted: true });
  setSelected(h);
  const entering = h.window.HourlyDungeon.enter();
  const statusRequest = lastRequest(h, "status");
  h.window.startBattle({ _ordersConfirmed: true });
  assert.equal(await entering, false);
  respond(h, statusRequest, { data: { status: { encounterId: "frost", cycle: "cycle-1", completed: false } } });
  await drainPromises();
  assert.equal(h.window.state.dungeon, false);
  assert.equal(h.window.HourlyDungeon.getView().busy, false);

  const startHarness = harness({ hosted: true });
  setSelected(startHarness);
  const pendingStart = startHarness.window.HourlyDungeon.enter();
  respond(startHarness, lastRequest(startHarness, "status"), {
    data: { status: { encounterId: "frost", cycle: "cycle-1", completed: false } }
  });
  await drainPromises();
  const lateStartRequest = lastRequest(startHarness, "start");
  startHarness.window.startBattle({ _ordersConfirmed: true });
  assert.equal(await pendingStart, false);
  respond(startHarness, lateStartRequest, {
    data: { start: { id: "late-attempt", encounterId: "frost", cycle: "cycle-1" } }
  });
  await drainPromises();
  assert.equal(startHarness.window.state.dungeon, false);
  assert.equal(startHarness.window.HourlyDungeon.getView().busy, false);
});

test("dungeon boss dispatch is gated after shared DoT processing and before normal class AI", () => {
  const tick = html.slice(html.indexOf("function tickEntity(e, dt){"), html.indexOf("function tickTraps(dt){"));
  const dotProcessing = tick.indexOf("for(let i=st.dots.length-1;i>=0;i--)");
  const bossDispatch = tick.indexOf("if(state&&state.dungeon&&e._dungeonBoss&&window.HourlyDungeon)");
  const normalAi = tick.indexOf("classAI(e, dt);");
  assert.ok(dotProcessing >= 0 && bossDispatch > dotProcessing && normalAi > bossDispatch);
  assert.match(tick.slice(bossDispatch, normalAi), /window\.HourlyDungeon\.tickBoss\(e,dt\)/);
  assert.match(tick.slice(bossDispatch, normalAi), /st\.stunTimer>0/);
});