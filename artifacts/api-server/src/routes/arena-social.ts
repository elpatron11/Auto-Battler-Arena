import { getAuth } from "@clerk/express";
import {
  FeatureArenaMatchParams, FeatureArenaMatchResponse,
  GetArenaPublicProfileParams, GetArenaPublicProfileResponse,
  ListArenaNotificationsResponse, MarkArenaNotificationsReadBody,
  MarkArenaNotificationsReadResponse, SearchArenaProfilesQueryParams,
  SearchArenaProfilesResponse, UnfeatureArenaMatchParams, UnfeatureArenaMatchResponse,
} from "@workspace/api-zod";
import {
  arenaChallengesTable, arenaFeaturedMatchesTable, arenaNotificationsTable,
  arenaProfilesTable, db,
  type ArenaChallengeRecord, type ArenaProfileRecord,
} from "@workspace/db";
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { lockEconomyAccounts } from "../lib/economy";
import { parseRankedTeam } from "../lib/rankedBattle";
import { rankedSize, rankedView } from "../lib/arenaMode";
import { pruneReplayIfUnneeded } from "../lib/replayRetention";
import {passiveRatingDelta,squadRatings,bestSquad} from "../lib/squadRatings";

const router: IRouter = Router();
router.use((req, res, next) => {
  const id = getAuth(req).userId;
  if (!id) { res.status(401).json({ error: "Sign in to view Arena profiles." }); return; }
  res.locals.playerId = id;
  next();
});
const viewerId = (res: { locals: Record<string, unknown> }) => res.locals.playerId as string;

function card(player: ArenaProfileRecord) {
  return {
    playerId: player.id, name: player.name, rating: player.rating,
    wins: player.wins, losses: player.losses, defensePublished: Boolean(player.defense),
  };
}

router.get("/arena/profiles", async (req, res): Promise<void> => {
  const query = SearchArenaProfilesQueryParams.safeParse({...req.query,
    teamSize:req.query.teamSize===undefined ? undefined : Number(req.query.teamSize)});
  if (!query.success) { res.status(400).json({ error: "Invalid profile search." }); return; }
  const search = query.data.search?.trim();
  const escaped = search?.replace(/[\\%_]/g, char => `\\${char}`);
  const matches = await db.select().from(arenaProfilesTable)
    .where(and(eq(arenaProfilesTable.isBot, false),
      escaped ? ilike(arenaProfilesTable.name, `%${escaped}%`) : undefined))
    .orderBy(desc(arenaProfilesTable.rating), desc(arenaProfilesTable.wins)).limit(30);
  res.json(SearchArenaProfilesResponse.parse(matches.map(player=>card(rankedView(player,rankedSize(req.query.teamSize))))));
});

function matchForPlayer(challenge: ArenaChallengeRecord, id: string, opponentName: string, featured: boolean) {
  const outgoing = challenge.attackerId === id;
  const outcome = outgoing ? challenge.outcome :
    challenge.outcome === "win" ? "loss" :
    challenge.outcome === "loss" ? "win" : challenge.outcome;
  return {
    id: challenge.id,
    opponentId: outgoing ? challenge.defenderId : challenge.attackerId,
    opponentName,
    outcome,
    ratingDelta: outgoing ? challenge.attackerRatingDelta : passiveRatingDelta(challenge),
    createdAt: challenge.resolvedAt?.toISOString() ?? challenge.createdAt.toISOString(),
    recordingContentType: challenge.recordingContentType,
    featured,
  };
}

router.get("/arena/profiles/:playerId", async (req, res): Promise<void> => {
  const parsed = GetArenaPublicProfileParams.safeParse(req.params);
  if (!parsed.success || !parsed.data.playerId || parsed.data.playerId.length > 128) {
    res.status(400).json({ error: "Invalid profile." }); return;
  }
  const id = parsed.data.playerId;
  const size=rankedSize(req.query.teamSize);
  const [rawPlayer] = await db.select().from(arenaProfilesTable).where(eq(arenaProfilesTable.id, id));
  const player=rawPlayer && rankedView(rawPlayer,size);
  if (!player) { res.status(404).json({ error: "Player not found." }); return; }
  const saved = await db.select({ challenge: arenaChallengesTable })
    .from(arenaFeaturedMatchesTable)
    .innerJoin(arenaChallengesTable, eq(arenaFeaturedMatchesTable.challengeId, arenaChallengesTable.id))
    .where(and(eq(arenaFeaturedMatchesTable.playerId, id),
      eq(arenaChallengesTable.teamSize,size),
      isNotNull(arenaChallengesTable.recordingPath), isNotNull(arenaChallengesTable.outcome)))
    .orderBy(desc(arenaFeaturedMatchesTable.createdAt)).limit(5);
  const isOwnProfile = viewerId(res) === id;
  const latest = isOwnProfile ? await db.select().from(arenaChallengesTable)
    .where(and(eq(arenaChallengesTable.status, "completed"),
      eq(arenaChallengesTable.teamSize,size),
      isNotNull(arenaChallengesTable.recordingPath),
      isNotNull(arenaChallengesTable.outcome),
      or(eq(arenaChallengesTable.attackerId, id), eq(arenaChallengesTable.defenderId, id))))
    .orderBy(sql`${arenaChallengesTable.resolvedAt} DESC NULLS LAST`, desc(arenaChallengesTable.createdAt)).limit(3) : [];
  const shown = [...saved.map(row => row.challenge), ...latest];
  const opponentIds = [...new Set(shown.map(row => row.attackerId === id ? row.defenderId : row.attackerId))];
  const opponents = opponentIds.length ? await db.select({ id: arenaProfilesTable.id, name: arenaProfilesTable.name })
    .from(arenaProfilesTable).where(inArray(arenaProfilesTable.id, opponentIds)) : [];
  const names = new Map(opponents.map(row => [row.id, row.name]));
  const savedIds = new Set(saved.map(row => row.challenge.id));
  const asMatch = (challenge: ArenaChallengeRecord) =>
    matchForPlayer(challenge, id,
      names.get(challenge.attackerId === id ? challenge.defenderId : challenge.attackerId) ?? "Unknown player",
      savedIds.has(challenge.id));
  const defenseTeam = player.defense ? parseRankedTeam(player.defense,size) : null;
  res.json(GetArenaPublicProfileResponse.parse({
    ...card(player), isOwnProfile,
    rating:Math.max(bestSquad(squadRatings(rawPlayer!),2).rating,bestSquad(squadRatings(rawPlayer!),3).rating),
    ranked2v2:bestSquad(squadRatings(rawPlayer!),2),
    ranked3v3:bestSquad(squadRatings(rawPlayer!),3),
    defenseTeam: defenseTeam ? {
      heroes: defenseTeam.heroes.map(hero => ({ classId: hero.classId })),
      captainClass: defenseTeam.captainClass ?? null,
    } : null,
    featuredMatches: saved.map(row => asMatch(row.challenge)),
    recentMatches: isOwnProfile ? latest.map(asMatch) : [],
  }));
});

router.post("/arena/challenges/:challengeId/feature", async (req, res): Promise<void> => {
  const parsed = FeatureArenaMatchParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid match ID." }); return; }
  const id = viewerId(res);
  const result = await db.transaction(async tx => {
    await lockEconomyAccounts(tx, [id]);
    const [challenge] = await tx.select().from(arenaChallengesTable)
      .where(eq(arenaChallengesTable.id, parsed.data.challengeId)).for("update");
    if (!challenge || (challenge.attackerId !== id && challenge.defenderId !== id) ||
        challenge.status !== "completed" || !challenge.outcome || !challenge.recordingPath) return "not_found";
    const [existing] = await tx.select().from(arenaFeaturedMatchesTable).where(and(
      eq(arenaFeaturedMatchesTable.playerId, id), eq(arenaFeaturedMatchesTable.challengeId, challenge.id)));
    if (existing) return "saved";
    const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(arenaFeaturedMatchesTable)
      .where(eq(arenaFeaturedMatchesTable.playerId, id));
    if (count.total >= 5) return "full";
    await tx.insert(arenaFeaturedMatchesTable).values({ playerId: id, challengeId: challenge.id });
    return "saved";
  });
  if (result === "not_found") { res.status(404).json({ error: "A completed replay from your matches is required." }); return; }
  if (result === "full") { res.status(409).json({ error: "Save up to five matches. Remove one before saving another." }); return; }
  res.json(FeatureArenaMatchResponse.parse({ featured: true }));
});

router.delete("/arena/challenges/:challengeId/feature", async (req, res): Promise<void> => {
  const parsed = UnfeatureArenaMatchParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid match ID." }); return; }
  const id = viewerId(res);
  await db.transaction(async tx => {
    await lockEconomyAccounts(tx, [id]);
    await tx.delete(arenaFeaturedMatchesTable).where(and(
      eq(arenaFeaturedMatchesTable.playerId, id),
      eq(arenaFeaturedMatchesTable.challengeId, parsed.data.challengeId)));
  });
  await pruneReplayIfUnneeded(parsed.data.challengeId);
  res.json(UnfeatureArenaMatchResponse.parse({ featured: false }));
});

router.get("/arena/notifications", async (_req, res): Promise<void> => {
  const rows = await db.select().from(arenaNotificationsTable)
    .where(and(eq(arenaNotificationsTable.playerId, viewerId(res)),eq(arenaNotificationsTable.direction,"incoming"), isNull(arenaNotificationsTable.readAt)))
    .orderBy(desc(arenaNotificationsTable.createdAt), desc(arenaNotificationsTable.id)).limit(100);
  const opponentIds = [...new Set(rows.filter(row=>row.type==='arena').map(row=>row.opponentId))];
  const opponents = opponentIds.length ? await db.select({id:arenaProfilesTable.id,name:arenaProfilesTable.name})
    .from(arenaProfilesTable).where(inArray(arenaProfilesTable.id,opponentIds)) : [];
  const names = new Map(opponents.map(player=>[player.id,player.name]));
  res.json(ListArenaNotificationsResponse.parse(rows.map(row => ({
    id: row.id, challengeId: row.challengeId, opponentId: row.opponentId, opponentName: names.get(row.opponentId) ?? row.opponentName,
    type:row.type,message:row.message,
    direction: row.direction, outcome: row.outcome, ratingDelta: row.ratingDelta,
    economy: { gold: row.gold, drops: row.drops, losses: row.losses },
    createdAt: row.createdAt.toISOString(),
  }))));
});

router.post("/arena/notifications/read", async (req, res): Promise<void> => {
  const parsed = MarkArenaNotificationsReadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Select notifications to dismiss." }); return; }
  const changed = await db.update(arenaNotificationsTable).set({ readAt: new Date() })
    .where(and(eq(arenaNotificationsTable.playerId, viewerId(res)),
      isNull(arenaNotificationsTable.readAt), inArray(arenaNotificationsTable.id, parsed.data.ids)))
    .returning({ id: arenaNotificationsTable.id });
  res.json(MarkArenaNotificationsReadResponse.parse({ markedCount: changed.length }));
});

export default router;