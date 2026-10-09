import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeDungeonBuff,
  buildDungeonStatus,
  dungeonAttemptReceipt,
  dungeonBuffForCycle,
  dungeonCycleAt,
  dungeonEncounterForCycle,
  DUNGEON_HOUR_MS,
  DUNGEON_MIN_WIN_DURATION_MS,
  mayAwardDungeonWin,
} from "../src/lib/hourlyDungeonRules.ts";

test("the global encounter rotation is frost, demon, temple and repeats each third cycle", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(dungeonEncounterForCycle),
    ["frost", "demon", "temple", "frost", "demon", "temple"]);
  assert.equal(dungeonCycleAt(4 * DUNGEON_HOUR_MS - 1), 3);
  const status = buildDungeonStatus(3 * DUNGEON_HOUR_MS, null);
  assert.equal(status.cycle, 3);
  assert.equal(status.encounterId, "frost");
  assert.equal(status.resetAt, 4 * DUNGEON_HOUR_MS);
});

test("a completion's buff is live only in its cycle and expires at the exact reset", () => {
  const buff = dungeonBuffForCycle("demon", 1);
  assert.equal(buff.kind, "damage");
  assert.equal(buff.value, 0.04);
  assert.equal(activeDungeonBuff(buff, 2 * DUNGEON_HOUR_MS - 1)?.id, "demon");
  assert.equal(activeDungeonBuff(buff, 2 * DUNGEON_HOUR_MS), null);
  assert.equal(buildDungeonStatus(DUNGEON_HOUR_MS + 1, {
    cycle: 1,
    encounterId: "demon",
  }).activeBuff?.expiresAt, 2 * DUNGEON_HOUR_MS);
  assert.equal(buildDungeonStatus(2 * DUNGEON_HOUR_MS, {
    cycle: 1,
    encounterId: "demon",
  }).activeBuff, null);
});

test("settlement awards only a current-cycle win after eight seconds and before another completion", () => {
  const start = 5 * DUNGEON_HOUR_MS + 10_000;
  const base = {
    attemptCycle: 5,
    currentCycle: 5,
    startedAt: start,
    now: start + DUNGEON_MIN_WIN_DURATION_MS,
    alreadyCompleted: false,
  };
  assert.equal(mayAwardDungeonWin(base), true);
  assert.equal(mayAwardDungeonWin({ ...base, now: start + DUNGEON_MIN_WIN_DURATION_MS - 1 }), false);
  assert.equal(mayAwardDungeonWin({ ...base, currentCycle: 6 }), false);
  assert.equal(mayAwardDungeonWin({ ...base, alreadyCompleted: true }), false);
});

test("settlement retries return the persisted award receipt rather than re-evaluating a reported outcome", () => {
  const awarded = { outcome: "win", awarded: true };
  const notAwarded = { outcome: "win", awarded: false };
  const loss = { outcome: "loss", awarded: false };
  assert.deepEqual(dungeonAttemptReceipt(awarded), { awarded: true });
  assert.deepEqual(dungeonAttemptReceipt(awarded), { awarded: true });
  assert.deepEqual(dungeonAttemptReceipt(notAwarded), { awarded: false });
  assert.deepEqual(dungeonAttemptReceipt(loss), { awarded: false });
});