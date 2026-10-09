import {
  arenaChallengesTable,
  arenaFeaturedMatchesTable,
  arenaReplayGarbageTable,
  db,
} from "@workspace/db";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { logger } from "./logger";
import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";

const objectStorage = new ObjectStorageService();
const garbageBatchSize = 50;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function isFeatured(tx: Transaction, challengeId: string): Promise<boolean> {
  const [featured] = await tx.select({ challengeId: arenaFeaturedMatchesTable.challengeId })
    .from(arenaFeaturedMatchesTable)
    .where(eq(arenaFeaturedMatchesTable.challengeId, challengeId))
    .limit(1);
  return Boolean(featured);
}

async function isAmongEitherPlayersLatestThreeRecorded(
  tx: Transaction,
  challengeId: string,
  playerIds: string[],
): Promise<boolean> {
  for (const id of playerIds) {
    const recent = await tx.select({ id: arenaChallengesTable.id })
      .from(arenaChallengesTable)
      .where(and(
        eq(arenaChallengesTable.status, "completed"),
        isNotNull(arenaChallengesTable.recordingPath),
        or(eq(arenaChallengesTable.attackerId, id), eq(arenaChallengesTable.defenderId, id)),
      ))
      .orderBy(sql`${arenaChallengesTable.resolvedAt} DESC NULLS LAST`, desc(arenaChallengesTable.createdAt))
      .limit(3);
    if (recent.some((match) => match.id === challengeId)) return true;
  }
  return false;
}

async function isAmongEitherPlayersLatestThreeCompleted(
  tx: Transaction,
  challengeId: string,
  playerIds: string[],
): Promise<boolean> {
  for (const id of playerIds) {
    const recent = await tx.select({ id: arenaChallengesTable.id })
      .from(arenaChallengesTable)
      .where(and(
        eq(arenaChallengesTable.status, "completed"),
        or(eq(arenaChallengesTable.attackerId, id), eq(arenaChallengesTable.defenderId, id)),
      ))
      .orderBy(sql`${arenaChallengesTable.resolvedAt} DESC NULLS LAST`, desc(arenaChallengesTable.createdAt))
      .limit(3);
    if (recent.some((match) => match.id === challengeId)) return true;
  }
  return false;
}

/**
 * A saved replay is retained while in either participant's latest-three
 * recorded-match window, or while either participant features it.
 */
export async function isReplayRetained(
  tx: Transaction,
  challengeId: string,
  playerIds: string[],
): Promise<boolean> {
  return await isFeatured(tx, challengeId) ||
    await isAmongEitherPlayersLatestThreeRecorded(tx, challengeId, playerIds);
}

/** Each participant sees their own three recent recordings, plus featured matches. */
export async function isReplayVisibleToPlayer(
  tx: Transaction,
  challengeId: string,
  playerId: string,
): Promise<boolean> {
  return await isFeatured(tx, challengeId) ||
    await isAmongEitherPlayersLatestThreeRecorded(tx, challengeId, [playerId]);
}

/** Uploads are bounded by the most recent completed fights, not recordings. */
export async function isReplayUploadEligible(
  tx: Transaction,
  challengeId: string,
  playerIds: string[],
): Promise<boolean> {
  return await isFeatured(tx, challengeId) ||
    await isAmongEitherPlayersLatestThreeCompleted(tx, challengeId, playerIds);
}

async function retryQueuedDeletes(): Promise<void> {
  const pending = await db.select().from(arenaReplayGarbageTable)
    .orderBy(arenaReplayGarbageTable.queuedAt)
    .limit(garbageBatchSize);
  for (const item of pending) {
    if (!item.path.startsWith("/objects/") || item.path.includes("..") || item.path.includes("\\")) {
      logger.error({ path: item.path }, "Refusing to delete an invalid queued Arena replay path");
      continue;
    }
    try {
      const file = await objectStorage.getObjectEntityFile(item.path);
      await file.delete();
      await db.delete(arenaReplayGarbageTable).where(eq(arenaReplayGarbageTable.path, item.path));
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        await db.delete(arenaReplayGarbageTable).where(eq(arenaReplayGarbageTable.path, item.path));
        continue;
      }
      logger.warn({ err: error, path: item.path }, "Could not delete queued Arena replay; it will be retried");
    }
  }
}

let retryInProgress: Promise<void> | null = null;
function retryQueuedDeletesOnce(): Promise<void> {
  if (retryInProgress) return retryInProgress;
  retryInProgress = retryQueuedDeletes().finally(() => {
    retryInProgress = null;
  });
  return retryInProgress;
}

/**
 * Detach and queue a replay only after checking retention while holding its
 * challenge row lock. Object-store deletion happens after commit and is safe to
 * retry because queued paths are unique and missing objects count as deleted.
 */
export async function pruneReplayIfUnneeded(challengeId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(arenaChallengesTable)
      .where(eq(arenaChallengesTable.id, challengeId)).for("update");
    if (!challenge || challenge.status !== "completed" || !challenge.recordingPath) return;

    if (await isReplayRetained(tx, challenge.id, [challenge.attackerId, challenge.defenderId])) return;

    await tx.insert(arenaReplayGarbageTable)
      .values({ path: challenge.recordingPath })
      .onConflictDoNothing();
    await tx.update(arenaChallengesTable).set({
      recordingPath: null,
      recordingContentType: null,
      recordingUploadPath: null,
    }).where(eq(arenaChallengesTable.id, challenge.id));
  });
  await retryQueuedDeletesOnce();
}

/**
 * Prune all completed recordings outside the three-match retention window for
 * these players. Featured matches are retained by pruneReplayIfUnneeded.
 */
export async function pruneReplaysForPlayers(playerIds: string[]): Promise<void> {
  const uniquePlayerIds = [...new Set(playerIds)].filter(Boolean);
  if (uniquePlayerIds.length > 0) {
    const candidates = await db.select({ id: arenaChallengesTable.id })
      .from(arenaChallengesTable)
      .where(and(
        eq(arenaChallengesTable.status, "completed"),
        isNotNull(arenaChallengesTable.recordingPath),
        or(
          ...uniquePlayerIds.flatMap((id) => [
            eq(arenaChallengesTable.attackerId, id),
            eq(arenaChallengesTable.defenderId, id),
          ]),
        ),
      ))
      .orderBy(desc(arenaChallengesTable.resolvedAt), desc(arenaChallengesTable.createdAt));

    for (const candidate of candidates) {
      await pruneReplayIfUnneeded(candidate.id);
    }
  }
  await retryQueuedDeletesOnce();
}

// Periodic retries ensure transient App Storage failures do not leave retained
// objects indefinitely, even if no further recording is uploaded.
const garbageRetryTimer = setInterval(() => {
  void retryQueuedDeletesOnce().catch((error: unknown) => {
    logger.error({ err: error }, "Could not process queued Arena replay deletions");
  });
}, 60_000);
garbageRetryTimer.unref();