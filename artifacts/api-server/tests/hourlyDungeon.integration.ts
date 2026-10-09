// Opt-in real-development-database verification. Not part of the isolated unit suite.
// Uses and removes only its own synthetic player; never run against production.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  arenaProfilesTable, db, economyWalletsTable, hourlyDungeonAttemptsTable, hourlyDungeonCompletionsTable, pool,
} from "@workspace/db";
import {
  createDungeonAttempt, finishDungeonAttempt, getDungeonStatus,
} from "../src/lib/hourlyDungeon";

async function cleanup(owner: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Development database only.");
  assert.match(owner, /^dungeon-integration-[0-9a-f-]{36}$/);
  await db.transaction(async tx => {
    await tx.delete(hourlyDungeonCompletionsTable).where(eq(hourlyDungeonCompletionsTable.playerId, owner));
    await tx.delete(hourlyDungeonAttemptsTable).where(eq(hourlyDungeonAttemptsTable.playerId, owner));
    await tx.delete(economyWalletsTable).where(eq(economyWalletsTable.playerId, owner));
    await tx.delete(arenaProfilesTable).where(eq(arenaProfilesTable.id, owner));
  });
}

async function verify() {
  if (process.env.NODE_ENV === "production") throw new Error("Development database only.");
  const owner = `dungeon-integration-${randomUUID()}`;
  const otherOwner = `dungeon-isolation-${randomUUID()}`;
  const firstCycle = Math.floor(Date.now() / 3_600_000);
  const kinds = new Set<string>();
  try {
    for (let i = 0; i < 3; i++) {
      const cycle = firstCycle + i;
      const start = cycle * 3_600_000 + 120_000;
      const requestId = randomUUID();
      const [a, retry] = await Promise.all([
        createDungeonAttempt(owner, requestId, start),
        createDungeonAttempt(owner, requestId, start),
      ]);
      assert.equal(a.kind, "ok");
      assert.equal(retry.kind, "ok");
      if (a.kind !== "ok" || retry.kind !== "ok") throw new Error("Attempt registration failed.");
      assert.equal(a.attempt.id, retry.attempt.id, "same owner/request is idempotent");
      assert.notEqual(a.created, retry.created, "only one registration inserts");
      assert.equal((await finishDungeonAttempt(otherOwner, a.attempt.id, "win", start + 10_000)).kind, "not_found");
      assert.equal((await finishDungeonAttempt(owner, a.attempt.id, "win", start + 1_000)).kind, "too_soon");
      assert.deepEqual(await finishDungeonAttempt(owner, a.attempt.id, "loss", start + 2_000),
        { kind: "ok", awarded: false, gold: 0 });
      assert.deepEqual(await finishDungeonAttempt(owner, a.attempt.id, "win", start + 10_000),
        { kind: "ok", awarded: false, gold: 0 }, "settled losses cannot turn into wins");

      const [one, two] = await Promise.all([
        createDungeonAttempt(owner, randomUUID(), start + 3_000),
        createDungeonAttempt(owner, randomUUID(), start + 3_000),
      ]);
      if (one.kind !== "ok" || two.kind !== "ok") throw new Error("Loss did not permit re-entry.");
      const wins = await Promise.all([
        finishDungeonAttempt(owner, one.attempt.id, "win", start + 13_000),
        finishDungeonAttempt(owner, two.attempt.id, "win", start + 13_000),
      ]);
      assert.equal(wins.filter(win => win.kind === "ok" && win.awarded).length, 1,
        "concurrent different attempts grant exactly one completion");
      assert.equal(wins.reduce((sum, win) => sum + (win.kind === "ok" ? win.gold : 0), 0), 25);
      const winningIndex = wins.findIndex(win => win.kind === "ok" && win.awarded);
      const winningAttempt = winningIndex === 0 ? one.attempt : two.attempt;
      const retries = await Promise.all([
        finishDungeonAttempt(owner, winningAttempt.id, "win", start + 14_000),
        finishDungeonAttempt(owner, winningAttempt.id, "win", start + 14_000),
      ]);
      for (const retry of retries) assert.deepEqual(retry, {kind:"ok",awarded:true,gold:25});
      const [wallet] = await db.select().from(economyWalletsTable)
        .where(eq(economyWalletsTable.playerId, owner));
      assert.equal(wallet.gold, (i + 1) * 25, "retries do not credit Gold again");
      const status = await getDungeonStatus(owner, start + 14_000);
      assert.equal(status.completed, true);
      assert.equal(status.activeBuff?.expiresAt, (cycle + 1) * 3_600_000);
      assert.ok(status.activeBuff);
      kinds.add(status.activeBuff.kind);
      assert.equal((await getDungeonStatus(otherOwner, start + 14_000)).activeBuff, null);
      assert.equal((await createDungeonAttempt(owner, randomUUID(), start + 15_000)).kind, "completed");
      const persisted = await db.select().from(hourlyDungeonCompletionsTable).where(and(
        eq(hourlyDungeonCompletionsTable.playerId, owner),
        eq(hourlyDungeonCompletionsTable.cycle, cycle),
      ));
      assert.equal(persisted.length, 1);
      const expired = await getDungeonStatus(owner, (cycle + 1) * 3_600_000);
      assert.equal(expired.completed, false);
      assert.equal(expired.activeBuff, null);
    }
    assert.deepEqual(kinds, new Set(["maxHp", "damage", "healing"]));
  } finally {
    try { await cleanup(owner); } finally { await pool.end(); }
  }
  console.log("PASS: real database — 25 Gold per hourly clear, concurrent wins/retries, three rotations, ownership, loss retry and exact expiry.");
}
const check = process.argv[2] === "--cleanup-fixture"
  ? cleanup(process.argv[3]).finally(() => pool.end())
  : verify();
void check.catch(error => {
  console.error(error instanceof Error ? error.message : "Dungeon integration verification failed.");
  process.exitCode = 1;
});