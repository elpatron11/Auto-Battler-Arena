import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveSixTeamBracket,
  settleTournamentPayout,
  tournamentEntryLimitReached,
  tournamentFinishWaitSeconds,
  tournamentPrizeForPlacement,
} from "../src/lib/tournamentRules.ts";

test("server tournament resolves a six-team single-elimination bracket", () => {
  const attack = { id: "player" };
  const opponents = Array.from({ length: 10 }, (_, index) => ({
    id: `human-${index + 1}`, name: `Player ${index + 1}`, snapshot: { id: `saved-squad-${index + 1}` },
  }));
  const result = resolveSixTeamBracket(attack, opponents, () => "win", () => 0.4);
  assert.equal(result.history.length, 5);
  const entrants = [...new Set(result.history.flatMap(({ playerA, playerB }) => [playerA, playerB]))];
  assert.equal(entrants.length, 6);
  assert.equal(entrants.filter((entrant) => entrant === "player").length, 1);
  assert.equal(entrants.filter((entrant) => entrant.startsWith("human-")).length, 5);
  assert.ok(["champion", "runner_up", "eliminated"].includes(result.placement));
  assert.equal(tournamentPrizeForPlacement(result.placement),
    result.placement === "champion" ? 500 : result.placement === "runner_up" ? 50 : 0);
});

test("tournament placement prizes remain fixed", () => {
  assert.equal(tournamentPrizeForPlacement("champion"), 500);
  assert.equal(tournamentPrizeForPlacement("runner_up"), 50);
  assert.equal(tournamentPrizeForPlacement("eliminated"), 0);
});

test("a finished tournament cannot apply its prize a second time", () => {
  const first = settleTournamentPayout("entered", 900, tournamentPrizeForPlacement("champion"));
  assert.deepEqual(first, { gold: 1400, repeated: false });
  assert.deepEqual(
    settleTournamentPayout("finished", first.gold, tournamentPrizeForPlacement("champion")),
    { gold: 1400, repeated: true },
  );
});

test("tournament entry cap and prize wait are enforced by server policy helpers", () => {
  assert.equal(tournamentEntryLimitReached(0, 3), false);
  assert.equal(tournamentEntryLimitReached(2, 3), false);
  assert.equal(tournamentEntryLimitReached(3, 3), true);
  const enteredAt = new Date("2025-01-01T00:00:00.000Z");
  assert.equal(tournamentFinishWaitSeconds(enteredAt, enteredAt.getTime()), 90);
  assert.equal(tournamentFinishWaitSeconds(enteredAt, enteredAt.getTime() + 89_001), 1);
  assert.equal(tournamentFinishWaitSeconds(enteredAt, enteredAt.getTime() + 90_000), 0);
});