import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ARENA_BOTS,
  botDefense,
  chooseRandomEligibleOpponent,
  DAILY_OPPONENT_CHALLENGE_LIMIT,
  utcDayStart,
} from "../src/lib/arenaMatchmaking.ts";
import { parseRankedTeam } from "../src/lib/rankedBattle.ts";

test("random matchmaking excludes opponents at their daily limit", () => {
  assert.equal(DAILY_OPPONENT_CHALLENGE_LIMIT, 5);
  const candidates = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const counts = new Map([
    ["a", DAILY_OPPONENT_CHALLENGE_LIMIT],
    ["b", 1],
    ["c", 4],
  ]);
  assert.equal(chooseRandomEligibleOpponent([{ id: "c" }], counts)?.id, "c",
    "an opponent with four challenges remains eligible for a fifth");
  counts.set("c", 5);
  assert.equal(chooseRandomEligibleOpponent([{ id: "c" }], counts), null,
    "the sixth challenge is blocked");
  for (let i = 0; i < 20; i++) {
    assert.notEqual(chooseRandomEligibleOpponent(candidates, counts)?.id, "a");
  }
  assert.equal(chooseRandomEligibleOpponent([{ id: "a" }], counts), null);
});

test("UTC day boundary is independent of local timezone", () => {
  assert.equal(utcDayStart(new Date("2025-04-06T23:59:59.000Z")).toISOString(),
    "2025-04-06T00:00:00.000Z");
});

test("seeded bot roster preserves the original ten and adds nine advanced defenses", () => {
  assert.equal(ARENA_BOTS.length, 19);
  assert.equal(new Set(ARENA_BOTS.map(bot => bot.id)).size, ARENA_BOTS.length);
  assert.ok(ARENA_BOTS.every((bot) =>
    bot.name.startsWith("Arena Bot • ") &&
    parseRankedTeam(botDefense(bot.heroes)) !== null
  ));
  assert.ok(new Set(ARENA_BOTS.map((bot) => bot.heroes.join(","))).size > 1);
});

test("advanced bots equip real alternate builds at each requested starting rating", () => {
  const advanced = ARENA_BOTS.slice(10);
  for (const rating of [1600, 1700, 2000]) {
    assert.equal(advanced.filter(bot => bot.rating === rating).length, 3);
  }
  const builds = advanced.flatMap(bot => botDefense(bot.heroes).heroes);
  for (const [classId, field, variant] of [
    ["frostmage", "ultimate", "custom"], ["druid", "ability", "custom"],
    ["shaman", "ultimate", "custom"], ["warrior", "ultimate", "custom"],
    ["priest", "ultimate", "custom"], ["priest", "ability", "custom"],
    ["frostmage", "ultimate", "polymorph"], ["frostmage", "ability", "custom"],
  ]) {
    assert.ok(builds.some(hero => hero.classId === classId && hero[field] === variant),
      `${classId} ${field} ${variant} is actually equipped`);
  }
  for (const bot of ARENA_BOTS) {
    const trio = botDefense(bot.heroes);
    const duo = botDefense(bot.heroes.slice(0, 2));
    assert.ok(parseRankedTeam(trio));
    assert.ok(parseRankedTeam(duo, 2));
    assert.equal(duo.heroes.length, 2);
    assert.deepEqual(duo.heroes, trio.heroes.slice(0, 2));
    assert.equal(duo.captainClass, duo.heroes[0].classId);
  }
  assert.ok(ARENA_BOTS.slice(0, 10).every(bot => botDefense(bot.heroes).heroes
    .every(hero => hero.ability === "default" && hero.ultimate === "default")));
});

test("Polymorph is a mage-only ranked ultimate", () => {
  const mageTeam = botDefense([
    { classId: "frostmage", ability: "custom", ultimate: "polymorph" }, "priest", "warrior",
  ]);
  assert.equal(parseRankedTeam(mageTeam).heroes[0].ultimate, "polymorph");
  mageTeam.heroes[0].classId = "warrior";
  assert.equal(parseRankedTeam(mageTeam), null);
});