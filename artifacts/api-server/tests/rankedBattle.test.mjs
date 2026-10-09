import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRankedTeam, resolveRankedBattle } from "../src/lib/rankedBattle.ts";

const team = (classes) => parseRankedTeam({ heroes: classes.map((classId) => ({ classId })) });

test("mirror teams resolve to a draw, including simultaneous knockouts", () => {
  for (const classes of [
    ["warrior", "priest", "rogue"],
    ["warlock", "warlock", "warlock"],
    ["priest", "priest", "priest"],
  ]) {
    const same = team(classes);
    assert.equal(resolveRankedBattle(same, same), "draw");
  }
});

test("outcome is reproducible and reversed for opposite squads", () => {
  const attackers = team(["warrior", "priest", "rogue"]);
  const defenders = team(["priest", "priest", "priest"]);
  assert.equal(resolveRankedBattle(attackers, defenders), "win");
  assert.equal(resolveRankedBattle(defenders, attackers), "loss");
  assert.equal(resolveRankedBattle(attackers, defenders), "win");
});

test("unknown or oversized builds cannot enter a ranked match", () => {
  assert.equal(parseRankedTeam({ heroes: [{ classId: "fake" }, { classId: "priest" }, { classId: "rogue" }] }), null);
  assert.equal(parseRankedTeam({ heroes: [{ classId: "priest", ability: "admin" }, { classId: "priest" }, { classId: "rogue" }] }), null);
  assert.equal(parseRankedTeam({ heroes: [{ classId: "priest", talents: ["x", "y", "z"] }, { classId: "priest" }, { classId: "rogue" }] }), null);
});