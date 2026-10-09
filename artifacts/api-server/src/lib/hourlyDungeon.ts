import {
  arenaProfilesTable,
  db,
  economyWalletsTable,
  hourlyDungeonAttemptsTable,
  hourlyDungeonCompletionsTable,
  type HourlyDungeonAttemptRecord,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { boundedGoldCredit, ECONOMY, lockEconomyAccounts } from "./economy";
import { awardPrestigeDrops } from "./prestigeRewards";
import {
  buildDungeonStatus,
  DUNGEON_ENCOUNTERS,
  DUNGEON_MAX_ATTEMPTS_PER_CYCLE,
  dungeonAttemptReceipt,
  dungeonCycleAt,
  dungeonEncounterForCycle,
  DUNGEON_MIN_WIN_DURATION_MS,
  mayAwardDungeonWin,
  type DungeonEncounterId,
  type DungeonStatus,
} from "./hourlyDungeonRules";

export * from "./hourlyDungeonRules";

export async function getDungeonStatus(playerId: string | null, now = Date.now()): Promise<DungeonStatus> {
  const cycle = dungeonCycleAt(now);
  let completion: { cycle: number; encounterId: DungeonEncounterId } | null = null;
  if (playerId) {
    const [row] = await db.select({
      cycle: hourlyDungeonCompletionsTable.cycle,
      encounterId: hourlyDungeonCompletionsTable.encounterId,
    }).from(hourlyDungeonCompletionsTable).where(and(
      eq(hourlyDungeonCompletionsTable.playerId, playerId),
      eq(hourlyDungeonCompletionsTable.cycle, cycle),
    )).limit(1);
    if (row && DUNGEON_ENCOUNTERS.includes(row.encounterId as DungeonEncounterId)) {
      completion = { cycle: row.cycle, encounterId: row.encounterId as DungeonEncounterId };
    }
  }
  return buildDungeonStatus(now, completion);
}

export type CreateDungeonAttemptResult =
  | { kind: "ok"; attempt: HourlyDungeonAttemptRecord; created: boolean }
  | { kind: "completed" }
  | { kind: "limit" };

export async function createDungeonAttempt(
  playerId: string,
  requestId: string,
  now?: number,
): Promise<CreateDungeonAttemptResult> {
  return db.transaction(async (tx): Promise<CreateDungeonAttemptResult> => {
    await lockEconomyAccounts(tx, [playerId]);
    const registeredAt = now ?? Date.now();
    const cycle = dungeonCycleAt(registeredAt);
    const encounterId = dungeonEncounterForCycle(cycle);
    await tx.insert(arenaProfilesTable).values({
      id: playerId,
      name: `Challenger ${playerId.slice(-6)}`,
    }).onConflictDoNothing();

    const [previous] = await tx.select().from(hourlyDungeonAttemptsTable).where(and(
      eq(hourlyDungeonAttemptsTable.playerId, playerId),
      eq(hourlyDungeonAttemptsTable.requestId, requestId),
    )).limit(1);
    if (previous) return { kind: "ok", attempt: previous, created: false };

    const [completion] = await tx.select({ id: hourlyDungeonCompletionsTable.id })
      .from(hourlyDungeonCompletionsTable).where(and(
        eq(hourlyDungeonCompletionsTable.playerId, playerId),
        eq(hourlyDungeonCompletionsTable.cycle, cycle),
      )).limit(1);
    if (completion) return { kind: "completed" };

    const [count] = await tx.select({
      count: sql<number>`count(*)::int`,
    }).from(hourlyDungeonAttemptsTable).where(and(
      eq(hourlyDungeonAttemptsTable.playerId, playerId),
      eq(hourlyDungeonAttemptsTable.cycle, cycle),
    ));
    if (count.count >= DUNGEON_MAX_ATTEMPTS_PER_CYCLE) return { kind: "limit" };

    const [attempt] = await tx.insert(hourlyDungeonAttemptsTable).values({
      playerId,
      requestId,
      cycle,
      encounterId,
      startedAt: new Date(registeredAt),
    }).returning();
    return { kind: "ok", attempt, created: true };
  });
}

export type FinishDungeonAttemptResult =
  | { kind: "ok"; awarded: boolean; gold: number }
  | { kind: "not_found" }
  | { kind: "too_soon" };

export async function finishDungeonAttempt(
  playerId: string,
  attemptId: string,
  outcome: "win" | "loss" | "abandoned",
  now?: number,
): Promise<FinishDungeonAttemptResult> {
  return db.transaction(async (tx): Promise<FinishDungeonAttemptResult> => {
    await lockEconomyAccounts(tx, [playerId]);
    const settledAt = now ?? Date.now();
    const currentCycle = dungeonCycleAt(settledAt);
    const [attempt] = await tx.select().from(hourlyDungeonAttemptsTable).where(and(
      eq(hourlyDungeonAttemptsTable.id, attemptId),
      eq(hourlyDungeonAttemptsTable.playerId, playerId),
    )).for("update").limit(1);
    if (!attempt) return { kind: "not_found" };

    if (attempt.outcome !== null) return { kind: "ok", ...dungeonAttemptReceipt(attempt), gold: attempt.gold };

    const startedAt = attempt.startedAt.getTime();
    if (outcome === "win" && attempt.cycle === currentCycle &&
        settledAt - startedAt < DUNGEON_MIN_WIN_DURATION_MS) {
      return { kind: "too_soon" };
    }

    let awarded = false;
    if (outcome === "win" && mayAwardDungeonWin({
      attemptCycle: attempt.cycle,
      currentCycle,
      startedAt,
      now: settledAt,
      alreadyCompleted: false,
    })) {
      const [completion] = await tx.insert(hourlyDungeonCompletionsTable).values({
        playerId,
        cycle: attempt.cycle,
        encounterId: attempt.encounterId,
        attemptId: attempt.id,
        completedAt: new Date(settledAt),
      }).onConflictDoNothing({
        target: [hourlyDungeonCompletionsTable.playerId, hourlyDungeonCompletionsTable.cycle],
      }).returning({ id: hourlyDungeonCompletionsTable.id });
      awarded = Boolean(completion);
    }

    // Credit currency with the hourly completion, never from a repeat finish
    // request. Persist the receipt amount so retries also report the same Gold.
    let gold = 0;
    if (awarded) {
      await awardPrestigeDrops(tx, playerId, "dungeon");
      await tx.insert(economyWalletsTable).values({ playerId }).onConflictDoNothing();
      const [wallet] = await tx.select().from(economyWalletsTable)
        .where(eq(economyWalletsTable.playerId, playerId)).for("update");
      gold = boundedGoldCredit(wallet.gold, ECONOMY.dungeonGold) ?? 0;
      if (gold > 0) await tx.update(economyWalletsTable)
        .set({ gold: wallet.gold + gold })
        .where(eq(economyWalletsTable.playerId, playerId));
    }

    const [settled] = await tx.update(hourlyDungeonAttemptsTable).set({
      outcome,
      awarded,
      gold,
      finishedAt: new Date(settledAt),
    }).where(eq(hourlyDungeonAttemptsTable.id, attempt.id)).returning();
    return { kind: "ok", ...dungeonAttemptReceipt(settled), gold: settled.gold };
  });
}