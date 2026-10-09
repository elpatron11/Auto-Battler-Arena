import { getAuth } from "@clerk/express";
import {squadRatings,squadScore,bestSquad,savedSquadId,ratingChange,passiveRatingDelta} from "../lib/squadRatings";
import {
  CreateArenaChallengeBody,
  CreateArenaChallengeResponse,
  FinishArenaChallengeBody,
  FinishArenaChallengeParams,
  FinishArenaChallengeResponse,
  GetArenaChallengeParams,
  GetArenaChallengeResponse,
  GetArenaLeaderboardResponse,
  GetArenaProfileResponse,
  ListArenaChallengesResponse,
  ListArenaOpponentRecordsResponse,
  ListArenaPlayersResponse,
  PublishArenaDefenseBody,
  PublishArenaDefenseResponse,
  SaveArenaProfileBody,
  SaveArenaProfileResponse,
} from "@workspace/api-zod";
import {
  arenaChallengesTable,
  arenaEconomyRewardsTable,
  arenaFeaturedMatchesTable,
  arenaNotificationsTable,
  economyDuplicatesTable,
  economyListingsTable,
  economyMigrationsTable,
  economyTournamentRunsTable,
  economyUnlocksTable,
  economyWalletsTable,
  arenaProfilesTable,
  hourlyDungeonCompletionsTable,
  db,
  type ArenaProfileRecord,
  type ArenaMatchSummaryRecord,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { parseRankedTeam } from "../lib/rankedBattle";
import {
  activeDungeonBuff,
  dungeonBuffForCycle,
  dungeonCycleAt,
  type DungeonBuff,
  type DungeonEncounterId,
} from "../lib/hourlyDungeon";
import { autoDefenseCandidates, explicitDefenseChange } from "../lib/arenaAutoDefense";
import { rankedColumns, rankedScorePatch, rankedSize, rankedView, type RankedSize } from "../lib/arenaMode";
import { awardRankMilestones, rankMilestoneReceipt, arenaRankLabel } from "../lib/arenaRanks";
import { awardPrestigeDrops, isPrestigeSkin, sanitizePrestigeEquips } from "../lib/prestigeRewards";
import { logger } from "../lib/logger";
import { pruneReplaysForPlayers } from "../lib/replayRetention";
import {
  boundedGoldCredit,
  CLASS_IDS,
  CLASS_TALENTS,
  ECONOMY,
  isCanonicalCollectible,
  lockEconomyAccounts,
  RACIAL_IDS,
  rollArenaDrops,
  selectDuplicateLossCopy,
} from "../lib/economy";
import { initializeEconomy } from "./economy";
import {
  ARENA_BOTS,
  botDefense,
  chooseRandomEligibleOpponent,
  DAILY_OPPONENT_CHALLENGE_LIMIT,
  utcDayStart,
} from "../lib/arenaMatchmaking";

const router: IRouter = Router();

function visibleDungeonBuff(value: Record<string, unknown> | null, now = Date.now()): DungeonBuff | undefined {
  if (!value || typeof value.expiresAt !== "number") return undefined;
  return activeDungeonBuff(value as unknown as DungeonBuff, now) ?? undefined;
}

let botsSeeded: Promise<void> | null = null;
function seedArenaBots(): Promise<void> {
  if (botsSeeded) return botsSeeded;
  const publishedAt = new Date();
  botsSeeded = db.insert(arenaProfilesTable).values(ARENA_BOTS.map((bot) => ({
    id: bot.id,
    name: bot.name,
    isBot: true,
    rating: bot.rating,
    rating2: bot.rating,
    defense: botDefense(bot.heroes),
    defenseUpdatedAt: publishedAt,
    defense2:botDefense(bot.heroes.slice(0,2)),
    defenseUpdatedAt2:publishedAt,
  }))).onConflictDoNothing().then(async () => {
    for(const bot of ARENA_BOTS)await db.update(arenaProfilesTable).set({
      defense2:botDefense(bot.heroes.slice(0,2)),defenseUpdatedAt2:publishedAt,
    }).where(and(eq(arenaProfilesTable.id,bot.id),isNull(arenaProfilesTable.defense2)));
  }).catch((error: unknown) => {
    botsSeeded = null;
    throw error;
  });
  return botsSeeded;
}

router.use(async (req, res, next) => {
  const id = getAuth(req).userId;
  if (!id) {
    res.status(401).json({ error: "Sign in to access the arena." });
    return;
  }
  res.locals.playerId = id;
  try {
    await seedArenaBots();
    next();
  } catch (error) {
    next(error);
  }
});

function profileId(res: { locals: Record<string, unknown> }): string {
  return res.locals.playerId as string;
}

async function visibleReplayIds(id: string, recordedIds: string[]): Promise<Set<string>> {
  if (!recordedIds.length) return new Set();
  const recent = await db.select({ id: arenaChallengesTable.id }).from(arenaChallengesTable)
    .where(and(eq(arenaChallengesTable.status, "completed"),
      isNotNull(arenaChallengesTable.recordingPath),
      or(eq(arenaChallengesTable.attackerId, id), eq(arenaChallengesTable.defenderId, id))))
    .orderBy(sql`${arenaChallengesTable.resolvedAt} DESC NULLS LAST`, desc(arenaChallengesTable.createdAt))
    .limit(3);
  const featured = await db.select({ id: arenaFeaturedMatchesTable.challengeId })
    .from(arenaFeaturedMatchesTable).where(inArray(arenaFeaturedMatchesTable.challengeId, recordedIds));
  return new Set([...recent.map(row => row.id), ...featured.map(row => row.id)]);
}

async function ensurePlayer(id: string): Promise<ArenaProfileRecord> {
  await db.insert(arenaProfilesTable).values({
    id,
    name: `Challenger ${id.slice(-6)}`,
  }).onConflictDoNothing();
  const [player] = await db.select().from(arenaProfilesTable).where(eq(arenaProfilesTable.id, id));
  if (!player) throw new Error("Could not create player profile");
  await initializeEconomy(id, player.state);
  return initializeMissingDefense(player);
}

async function initializeMissingDefense(player: ArenaProfileRecord): Promise<ArenaProfileRecord> {
  if (player.defense) return player;
  for (const candidate of autoDefenseCandidates(player.state)) {
    if (!validTeam(candidate) || JSON.stringify(candidate).length > 30_000 ||
        !await ownsLoadout(player.id, candidate)) continue;
    const [updated] = await db.update(arenaProfilesTable).set({
      defense: candidate,
      defenseUpdatedAt: new Date(),
      state: { ...player.state, defenseTeam: candidate },
    }).where(and(eq(arenaProfilesTable.id, player.id), isNull(arenaProfilesTable.defense))).returning();
    return updated ?? player;
  }
  return player;
}

async function presentProfile(player: ArenaProfileRecord) {
  const [legacy] = await db.select().from(economyMigrationsTable)
    .where(eq(economyMigrationsTable.playerId, player.id));
  const [entryCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(economyTournamentRunsTable)
    .where(eq(economyTournamentRunsTable.playerId, player.id));
  const [settledWins] = await db.select({ count: sql<number>`count(*)::int` })
    .from(economyTournamentRunsTable).where(and(
      eq(economyTournamentRunsTable.playerId, player.id),
      eq(economyTournamentRunsTable.state, "finished"),
      eq(economyTournamentRunsTable.placement, "champion"),
    ));
  const preservedTournamentState = legacy ? {
    tournamentWins: legacy.legacyTournamentWins + settledWins.count,
    tournamentEntries: legacy.legacyTournamentEntries + entryCount.count,
    tournamentHistory: legacy.legacyTournamentHistory,
  } : {
    tournamentWins: player.state.tournamentWins ?? 0,
    tournamentEntries: player.state.tournamentEntries ?? 0,
    tournamentHistory: player.state.tournamentHistory ?? [],
  };
  return {
    playerId: player.id,
    name: player.name,
    rating: player.rating,
    wins: player.wins,
    losses: player.losses,
    state: {
      ...cleanState(player.state),
      ...preservedTournamentState,
      name: player.name,
      rating: player.rating,
      onlineWins: player.wins,
      onlineLosses: player.losses,
      defenseTeam2:player.state.defenseTeam2 ?? player.defense2,
      ranked2v2:bestSquad(squadRatings(player),2),
      ranked3v3:bestSquad(squadRatings(player),3),
      squadRatings:squadRatings(player),
    },
    defensePublished: player.defense !== null,
    defenseUpdatedAt: player.defenseUpdatedAt?.toISOString() ?? null,
  };
}

function cleanState(state: Record<string, unknown>) {
  const copy = { ...state };
  delete copy.rating;
  delete copy.onlineWins;
  delete copy.onlineLosses;
  delete copy.onlineMatchHistory;
  delete copy.ranked2v2;
  delete copy.ranked3v3;
  delete copy.squadRatings;
  for (const key of ["gold", "coins", "unlockedClasses", "classesUnlocked", "unlockedRacials",
    "unlockedRaces", "unlockedSpells", "unlockedUltimates", "unlockedTalents", "inventory",
    "ownedClasses", "ownedRacials", "ownedSpells", "ownedUltimates", "talentUnlockMigrationV1",
    "tournamentWins", "tournamentEntries", "tournamentHistory", "ownedSkins"]) {
    delete copy[key];
  }
  return copy;
}

function validTeam(value: Record<string, unknown>): boolean {
  return parseRankedTeam(value) !== null;
}

async function initializeMissingDuoDefense(player: ArenaProfileRecord): Promise<ArenaProfileRecord> {
  if (player.defense2) return player;
  for (const candidate of autoDefenseCandidates({...player.state,defenseTeam:player.state.defenseTeam2})) {
    if (!parseRankedTeam(candidate,2) || !await ownsLoadout(player.id,candidate)) continue;
    const [updated] = await db.update(arenaProfilesTable).set({
      defense2:candidate,defenseUpdatedAt2:new Date(),
      state:sql`${arenaProfilesTable.state} || ${JSON.stringify({defenseTeam2:candidate})}::jsonb`,
    }).where(and(eq(arenaProfilesTable.id,player.id),isNull(arenaProfilesTable.defense2))).returning();
    return updated ?? player;
  }
  return player;
}

async function ownsLoadout(playerId: string, value: Record<string, unknown>): Promise<boolean> {
  const team = parseRankedTeam(value, rankedSize(Array.isArray(value.heroes) ? value.heroes.length : 3));
  if (!team) return false;
  const required: Array<{ kind: string; itemId: string }> = [];
  for (const hero of team.heroes) {
    if (!CLASS_IDS.includes(hero.classId as typeof CLASS_IDS[number])) return false;
    required.push({ kind: "class", itemId: hero.classId });
    if (isPrestigeSkin(hero.skinId)) required.push({kind:"skin",itemId:hero.skinId});
    if (hero.ability === "custom") {
      const itemId = `ability:${hero.classId}`;
      if (!isCanonicalCollectible("spell", itemId)) return false;
      required.push({ kind: "spell", itemId });
    }
    if (hero.ultimate === "custom" || hero.ultimate === "polymorph") {
      const itemId = `ult:${hero.classId}`;
      if (!isCanonicalCollectible("ultimate", itemId)) return false;
      required.push({ kind: "ultimate", itemId });
    }
    for (const talentId of hero.talents ?? []) {
      if (!CLASS_TALENTS[hero.classId]?.includes(talentId)) return false;
      required.push({ kind: "talent", itemId: `${hero.classId}:${talentId}` });
    }
  }
  if (team.captainRacial) {
    if (!RACIAL_IDS.includes(team.captainRacial as typeof RACIAL_IDS[number])) return false;
    required.push({ kind: "racial", itemId: team.captainRacial });
  }
  const owned = await db.select({ kind: economyUnlocksTable.kind, itemId: economyUnlocksTable.itemId })
    .from(economyUnlocksTable).where(eq(economyUnlocksTable.playerId, playerId));
  const ownedKeys = new Set(owned.map((item) => `${item.kind}:${item.itemId}`));
  return required.every((item) => ownedKeys.has(`${item.kind}:${item.itemId}`));
}

function validSummary(
  summary: ArenaMatchSummaryRecord,
  attack: Record<string, unknown>,
  defense: Record<string, unknown>,
): boolean {
  const teamMatches = (heroes: ArenaMatchSummaryRecord["player"], snapshot: Record<string, unknown>) => {
    const expected = (snapshot.heroes as Array<{classId: string}>).map((hero) => hero.classId).sort();
    return heroes.length === expected.length &&
      heroes.map((hero) => hero.classId).sort().every((id, i) => id === expected[i]);
  };
  if (!Number.isFinite(summary.durationSeconds) || summary.durationSeconds < 0 ||
      summary.durationSeconds > 3600 || JSON.stringify(summary).length > 15_000 ||
      !teamMatches(summary.player, attack) || !teamMatches(summary.enemy, defense)) return false;
  return [...summary.player, ...summary.enemy].every((hero) =>
    hero.name.length <= 80 &&
    ["damage", "healing", "kills", "deaths", "assists", "cc", "prevented",
      "reflected", "aoe", "dot", "pet", "selfHeal", "shielding", "survival"].every((key) => {
      const value = hero[key as keyof typeof hero];
      return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10_000_000;
    })
  );
}

router.get("/arena/profile", async (req, res): Promise<void> => {
  const player = rankedView(await initializeMissingDuoDefense(await ensurePlayer(profileId(res))), rankedSize(req.query.teamSize));
  res.json(GetArenaProfileResponse.parse(await presentProfile(player)));
});

router.put("/arena/profile", async (req, res): Promise<void> => {
  const parsed = SaveArenaProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  const state = parsed.data.state;
  if (!/^[\p{L}\p{M}\p{N} _.'-]{2,32}$/u.test(name) || JSON.stringify(state).length > 200_000) {
    res.status(400).json({ error: "Use 2–32 letters, numbers, spaces, dots, apostrophes, underscores, or hyphens for the name." });
    return;
  }
  const existing = await ensurePlayer(profileId(res));
  const cleaned = cleanState(state);
  cleaned.skins = await sanitizePrestigeEquips(profileId(res), cleaned.skins);
  const duoReplacement = explicitDefenseChange(
    {defenseTeam:cleaned.defenseTeam2}, {defenseTeam:existing.state.defenseTeam2});
  const publishDuo = !!duoReplacement && !!parseRankedTeam(duoReplacement,2) &&
    await ownsLoadout(profileId(res),duoReplacement);
  if (duoReplacement && !publishDuo && existing.defense2) {
    res.status(403).json({error:"Save a complete owned 2v2 defense before updating it."}); return;
  }
  const replacement = explicitDefenseChange(cleaned, existing.state);
  let publishReplacement = false;
  if (replacement) {
    if (!validTeam(replacement)) {
      res.status(400).json({ error: "Save a complete 3v3 defense before updating your public defense." });
      return;
    }
    publishReplacement = await ownsLoadout(profileId(res), replacement);
    // Initial onboarding saves the draft before economy ownership is created.
    // Existing players must never receive a successful but unpublished edit.
    if (!publishReplacement && existing.defense) {
      res.status(403).json({ error: "Your defense includes a class or racial not owned by this account." });
      return;
    }
  }
  // A game tab opened before automatic publication may still hold a null
  // defenseTeam. Keep the published defense visible in the saved profile.
  if (existing.defense && !cleaned.defenseTeam) {
    cleaned.defenseTeam = existing.state.defenseTeam ?? existing.defense;
  }
  if(existing.defense2 && !cleaned.defenseTeam2)
    cleaned.defenseTeam2=existing.state.defenseTeam2 ?? existing.defense2;
  const [player] = await db.update(arenaProfilesTable)
    .set({ name, state: sql`${JSON.stringify(cleaned)}::jsonb || jsonb_build_object('squadRatings', CASE WHEN ${arenaProfilesTable.state}->'squadRatings' IS NULL OR ${arenaProfilesTable.state}->'squadRatings' = '{}'::jsonb THEN ${JSON.stringify(squadRatings(existing))}::jsonb ELSE ${arenaProfilesTable.state}->'squadRatings' END)`,
      ...(publishReplacement ? { defense: replacement!, defenseUpdatedAt: new Date() } : {}),
      ...(publishDuo ? {defense2:duoReplacement!,defenseUpdatedAt2:new Date()} : {}),
    })
    .where(eq(arenaProfilesTable.id, profileId(res)))
    .returning();
  res.json(SaveArenaProfileResponse.parse(await presentProfile(await initializeMissingDuoDefense(await initializeMissingDefense(player)))));
});

router.put("/arena/defense", async (req, res): Promise<void> => {
  const parsed = PublishArenaDefenseBody.safeParse(req.body);
  const size = rankedSize(parsed.success && Array.isArray(parsed.data.defense.heroes) ? parsed.data.defense.heroes.length : 3);
  if (!parsed.success || !parseRankedTeam(parsed.data.defense,size)) {
    res.status(400).json({ error: "Save a complete 3v3 defense before publishing." });
    return;
  }
  if (JSON.stringify(parsed.data.defense).length > 30_000) {
    res.status(400).json({ error: "Defense is too large." });
    return;
  }
  const defenseOwner=await ensurePlayer(profileId(res));
  if(parsed.data.defense.squadId&&!savedSquadId(defenseOwner.state,parsed.data.defense.squadId)){
    res.status(400).json({error:"Save this squad before publishing its defense."});return;
  }
  if (!await ownsLoadout(profileId(res), parsed.data.defense)) {
    res.status(403).json({ error: "Your defense includes a class or racial not owned by this account." });
    return;
  }
  const now = new Date();
  await db.update(arenaProfilesTable)
    .set({ ...(size===2 ? {defense2:parsed.data.defense,defenseUpdatedAt2:now} : {defense:parsed.data.defense,defenseUpdatedAt:now}),
      state: sql`${arenaProfilesTable.state} || ${JSON.stringify({[size===2?'defenseTeam2':'defenseTeam']: parsed.data.defense})}::jsonb`,
    })
    .where(eq(arenaProfilesTable.id, profileId(res)));
  res.json(PublishArenaDefenseResponse.parse({ publishedAt: now.toISOString() }));
});

function publicPlayer(player: ArenaProfileRecord) {
  return {
    playerId: player.id,
    name: player.name,
    rating: player.rating,
    wins: player.wins,
    losses: player.losses,
    publishedAt: player.defenseUpdatedAt!.toISOString(),
    isBot: player.isBot,
  };
}

router.get("/arena/players", async (req, res): Promise<void> => {
  const size=rankedSize(req.query.teamSize), columns=rankedColumns(size);
  const players = await db.select().from(arenaProfilesTable)
    .where(and(isNotNull(columns.defense), ne(arenaProfilesTable.id, profileId(res))))
    .orderBy(desc(columns.updated)).limit(50);
  res.json(ListArenaPlayersResponse.parse(players.map(player=>publicPlayer(rankedView(player,size)))));
});

router.get("/arena/leaderboard", async (req, res): Promise<void> => {
  const size=rankedSize(req.query.teamSize), columns=rankedColumns(size);
  const players = await db.select().from(arenaProfilesTable)
    .where(isNotNull(columns.defense))
    .orderBy(desc(columns.rating), desc(columns.wins))
    .limit(50);
  res.json(GetArenaLeaderboardResponse.parse(players.map(player=>publicPlayer(rankedView(player,size)))));
});

router.get("/arena/challenges", async (req, res): Promise<void> => {
  const id = profileId(res);
  const challenges = await db.select().from(arenaChallengesTable)
    .where(and(eq(arenaChallengesTable.teamSize,rankedSize(req.query.teamSize)),
      or(eq(arenaChallengesTable.attackerId, id), eq(arenaChallengesTable.defenderId, id))))
    .orderBy(desc(arenaChallengesTable.createdAt)).limit(50);
  const watchable = await visibleReplayIds(id, challenges.filter(challenge => challenge.recordingPath).map(challenge => challenge.id));
  const ids = [...new Set(challenges.map((c) => c.attackerId === id ? c.defenderId : c.attackerId))];
  const opponents = ids.length
    ? await db.select({ id: arenaProfilesTable.id, name: arenaProfilesTable.name })
        .from(arenaProfilesTable).where(inArray(arenaProfilesTable.id, ids))
    : [];
  const names = new Map(opponents.map((p) => [p.id, p.name]));
  res.json(ListArenaChallengesResponse.parse(challenges.map((challenge) => {
    const outgoing = challenge.attackerId === id;
    const outcome = outgoing ? challenge.outcome :
      challenge.outcome === "win" ? "loss" :
      challenge.outcome === "loss" ? "win" : challenge.outcome;
    return {
      id: challenge.id,
      direction: outgoing ? "outgoing" : "incoming",
      opponentName: names.get(outgoing ? challenge.defenderId : challenge.attackerId) ?? "Unknown",
      outcome,
      localOutcome: outgoing ? challenge.localOutcome : null,
      ratingDelta: outgoing ? challenge.attackerRatingDelta : passiveRatingDelta(challenge),
      createdAt: challenge.createdAt.toISOString(),
      resolvedAt: challenge.resolvedAt?.toISOString() ?? null,
      hasSummary: challenge.summary !== null,
      hasRecording: challenge.recordingPath !== null && watchable.has(challenge.id),
    };
  })));
});

router.get("/arena/opponents", async (req, res): Promise<void> => {
  const id = profileId(res);
  const opponentId = sql<string>`CASE WHEN ${arenaChallengesTable.attackerId} = ${id}
    THEN ${arenaChallengesTable.defenderId} ELSE ${arenaChallengesTable.attackerId} END`;
  const records = await db.select({
    opponentId,
    wins: sql<number>`COUNT(*) FILTER (WHERE
      (${arenaChallengesTable.attackerId} = ${id} AND ${arenaChallengesTable.outcome} = 'win')
      OR (${arenaChallengesTable.defenderId} = ${id} AND ${arenaChallengesTable.outcome} = 'loss'))::int`,
    losses: sql<number>`COUNT(*) FILTER (WHERE
      (${arenaChallengesTable.attackerId} = ${id} AND ${arenaChallengesTable.outcome} = 'loss')
      OR (${arenaChallengesTable.defenderId} = ${id} AND ${arenaChallengesTable.outcome} = 'win'))::int`,
    draws: sql<number>`COUNT(*) FILTER (WHERE ${arenaChallengesTable.outcome} = 'draw')::int`,
    totalGames: sql<number>`COUNT(*)::int`,
  }).from(arenaChallengesTable)
    .where(and(eq(arenaChallengesTable.teamSize,rankedSize(req.query.teamSize)),eq(arenaChallengesTable.status, "completed"),
      inArray(arenaChallengesTable.outcome, ["win", "loss", "draw"]),
      or(eq(arenaChallengesTable.attackerId, id), eq(arenaChallengesTable.defenderId, id))))
    // GROUP BY the selected column: repeating the expression would bind the
    // player ID as a different SQL parameter and PostgreSQL would reject it.
    .groupBy(sql`1`)
    .orderBy(sql`MAX(${arenaChallengesTable.resolvedAt}) DESC NULLS LAST`);
  const opponents = records.length
    ? await db.select({ id: arenaProfilesTable.id, name: arenaProfilesTable.name })
        .from(arenaProfilesTable).where(inArray(arenaProfilesTable.id, records.map(row => row.opponentId)))
    : [];
  const names = new Map(opponents.map(row => [row.id, row.name]));
  res.json(ListArenaOpponentRecordsResponse.parse(records.map(row => ({
    ...row,
    opponentName: names.get(row.opponentId) ?? "Unknown player",
    winRate: Math.round(row.wins / row.totalGames * 100),
  }))));
});

router.get("/arena/challenges/:challengeId", async (req, res): Promise<void> => {
  const params = GetArenaChallengeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid match ID." });
    return;
  }
  const id = profileId(res);
  const [challenge] = await db.select().from(arenaChallengesTable)
    .where(and(eq(arenaChallengesTable.id, params.data.challengeId),
      or(eq(arenaChallengesTable.attackerId, id), eq(arenaChallengesTable.defenderId, id))));
  if (!challenge || challenge.status !== "completed") {
    res.status(404).json({ error: "Completed match not found." });
    return;
  }
  const outgoing = challenge.attackerId === id;
  const [opponent] = await db.select({ name: arenaProfilesTable.name }).from(arenaProfilesTable)
    .where(eq(arenaProfilesTable.id, outgoing ? challenge.defenderId : challenge.attackerId));
  const watchable = await visibleReplayIds(id, challenge.recordingPath ? [challenge.id] : []);
  const outcome = outgoing ? challenge.outcome :
    challenge.outcome === "win" ? "loss" :
    challenge.outcome === "loss" ? "win" : challenge.outcome;
  res.json(GetArenaChallengeResponse.parse({
    id: challenge.id,
    direction: outgoing ? "outgoing" : "incoming",
    opponentName: opponent?.name ?? "Unknown",
    outcome,
    localOutcome: outgoing ? challenge.localOutcome : null,
    ratingDelta: outgoing ? challenge.attackerRatingDelta : passiveRatingDelta(challenge),
    createdAt: challenge.createdAt.toISOString(),
    resolvedAt: challenge.resolvedAt?.toISOString() ?? null,
    attack: challenge.attack,
    defense: challenge.defense,
    summary: challenge.summary,
    hasRecording: challenge.recordingPath !== null && watchable.has(challenge.id),
    recordingContentType: watchable.has(challenge.id) ? challenge.recordingContentType : null,
  }));
});

router.post("/arena/challenges", async (req, res): Promise<void> => {
  const parsed = CreateArenaChallengeBody.safeParse(req.body);
  const size=rankedSize(parsed.success && Array.isArray(parsed.data.attack.heroes) ? parsed.data.attack.heroes.length : 3);
  const columns=rankedColumns(size);
  const parsedAttack = parsed.success ? parseRankedTeam(parsed.data.attack,size) : null;
  if (!parsed.success || !parsedAttack) {
    res.status(400).json({ error: "Choose a complete 2v2 or 3v3 attack team before challenging." });
    return;
  }
  const attackSnapshot = {
    heroes: parsedAttack.heroes,
    captainClass: parsedAttack.captainClass,
    captainRacial: parsedAttack.captainRacial,
    squadId: null as string|null,
  };
  const id = profileId(res);
  if ((parsed.data.opponentId != null && parsed.data.opponentId === id) ||
      JSON.stringify(parsed.data.attack).length > 30_000) {
    res.status(400).json({ error: "Invalid challenge." });
    return;
  }
  const attackingPlayer=await ensurePlayer(id);
  attackSnapshot.squadId=savedSquadId(attackingPlayer.state,parsed.data.attack.squadId);
  if(parsed.data.attack.squadId && !attackSnapshot.squadId){
    res.status(400).json({error:"Save this squad before starting a ranked match."});return;
  }
  if (!await ownsLoadout(id, attackSnapshot)) {
    res.status(403).json({ error: "Your attack includes a class or racial not owned by this account." });
    return;
  }
  // Serialize all matchmaking for this attacker, including the idempotency
  // lookup and daily-cap check, so concurrent requests cannot overbook a slot.
  const ticket = await db.transaction(async (tx) => {
    await lockEconomyAccounts(tx, [id]);
    const dayStart = utcDayStart(new Date());
    const [previous] = await tx.select().from(arenaChallengesTable)
      .where(eq(arenaChallengesTable.id, parsed.data.requestId));
    if (previous) {
      if (previous.attackerId !== id || previous.teamSize !== size ||
          (parsed.data.opponentId != null && previous.defenderId !== parsed.data.opponentId)) {
        return "conflict" as const;
      }
      const [opponent] = await tx.select().from(arenaProfilesTable)
        .where(eq(arenaProfilesTable.id, previous.defenderId));
      if (!opponent) return "not_found" as const;
      return { ...previous, opponentName: opponent.name, opponentRating: rankedView(opponent,size).rating };
    }

    let defender: ArenaProfileRecord | undefined;
    if (parsed.data.opponentId != null) {
      [defender] = await tx.select().from(arenaProfilesTable)
        .where(and(eq(arenaProfilesTable.id, parsed.data.opponentId), isNotNull(columns.defense)));
      if(defender) defender=rankedView(defender,size);
      if (!defender?.defense || !parseRankedTeam(defender.defense,size)) return "not_found" as const;
    } else {
      const candidates = await tx.select().from(arenaProfilesTable)
        .where(and(isNotNull(columns.defense), ne(arenaProfilesTable.id, id)));
      const counts = await tx.select({
        defenderId: arenaChallengesTable.defenderId,
        count: sql<number>`count(*)::int`,
      }).from(arenaChallengesTable)
        .where(and(eq(arenaChallengesTable.teamSize,size),eq(arenaChallengesTable.attackerId, id), gte(arenaChallengesTable.createdAt, dayStart)))
        .groupBy(arenaChallengesTable.defenderId);
      const challengeCounts = new Map(counts.map((row) => [row.defenderId, row.count]));
      defender = chooseRandomEligibleOpponent(
        candidates.map(candidate=>rankedView(candidate,size)).filter((candidate) => candidate.defense && parseRankedTeam(candidate.defense,size)),
        challengeCounts,
      ) ?? undefined;
      if (!defender) return "exhausted" as const;
    }

    const [dailyCount] = await tx.select({
      count: sql<number>`count(*)::int`,
    }).from(arenaChallengesTable)
      .where(and(
        eq(arenaChallengesTable.attackerId, id),
        eq(arenaChallengesTable.defenderId, defender.id),
        eq(arenaChallengesTable.teamSize,size),
        gte(arenaChallengesTable.createdAt, dayStart),
      ));
    if (dailyCount.count >= DAILY_OPPONENT_CHALLENGE_LIMIT) return "limit" as const;

    const [claimed] = await tx.insert(arenaChallengesTable).values({
      id: parsed.data.requestId, attackerId: id, defenderId: defender.id,
      attack: attackSnapshot, defense: defender.defense!, teamSize:size,
    }).onConflictDoNothing().returning();
    if (!claimed) {
      const [previous] = await tx.select().from(arenaChallengesTable)
        .where(eq(arenaChallengesTable.id, parsed.data.requestId));
      if (!previous || previous.attackerId !== id || previous.defenderId !== defender.id) return "conflict" as const;
      const [opponent] = await tx.select().from(arenaProfilesTable).where(eq(arenaProfilesTable.id, previous.defenderId));
      return opponent ? { ...previous, opponentName: opponent.name, opponentRating: opponent.rating } : "not_found" as const;
    }
    const players = await tx.select().from(arenaProfilesTable)
      .where(inArray(arenaProfilesTable.id, [id, defender.id]))
      .orderBy(asc(arenaProfilesTable.id)).for("update");
      const opponent = rankedView(players.find((p) => p.id === defender.id)!,size);
    // Use the latest published defense under lock, not a stale read.
      if (!opponent.defense || !parseRankedTeam(opponent.defense,size)) {
      await tx.delete(arenaChallengesTable).where(eq(arenaChallengesTable.id, claimed.id));
      return null;
    }
    const snapshotNow = Date.now();
    const snapshotCycle = dungeonCycleAt(snapshotNow);
    const completions = await tx.select({
      playerId: hourlyDungeonCompletionsTable.playerId,
      encounterId: hourlyDungeonCompletionsTable.encounterId,
    }).from(hourlyDungeonCompletionsTable).where(and(
      inArray(hourlyDungeonCompletionsTable.playerId, [id, defender.id]),
      eq(hourlyDungeonCompletionsTable.cycle, snapshotCycle),
    ));
    const buffs = new Map<string, DungeonBuff>();
    for (const completion of completions) {
      if (completion.encounterId === "frost" || completion.encounterId === "demon" ||
          completion.encounterId === "temple") {
        buffs.set(completion.playerId, dungeonBuffForCycle(
          completion.encounterId as DungeonEncounterId,
          snapshotCycle,
        ));
      }
    }
    const [created] = await tx.update(arenaChallengesTable).set({
      defense: opponent.defense,
      attackBuff: buffs.get(id) ?? null,
      defenseBuff: buffs.get(defender.id) ?? null,
    }).where(eq(arenaChallengesTable.id, claimed.id)).returning();
    return { ...created, opponentName: opponent.name, opponentRating: opponent.rating };
  });
  if (ticket === "conflict") {
    res.status(409).json({ error: "Challenge request ID is already in use." });
    return;
  }
  if (ticket === "limit") {
    res.status(429).json({ error: `Daily challenge limit reached for this opponent (${DAILY_OPPONENT_CHALLENGE_LIMIT} per UTC day).` });
    return;
  }
  if (ticket === "exhausted") {
    res.status(404).json({ error: "No eligible opponents are available; all published defenses have reached today's limit." });
    return;
  }
  if (ticket === "not_found") {
    res.status(404).json({ error: "That player has no published defense." });
    return;
  }
  if (ticket === null) {
    res.status(404).json({ error: "That player has no published defense." });
    return;
  }
  res.status(201).json(CreateArenaChallengeResponse.parse({
    id: ticket.id,
    opponentId: ticket.defenderId,
    opponentName: ticket.opponentName,
    opponentRating: ticket.opponentRating,
    defense: ticket.defense,
    attackBuff: visibleDungeonBuff(ticket.attackBuff),
    defenseBuff: visibleDungeonBuff(ticket.defenseBuff),
    createdAt: ticket.createdAt.toISOString(),
  }));
});

router.post("/arena/challenges/:challengeId/result", async (req, res): Promise<void> => {
  const params = FinishArenaChallengeParams.safeParse(req.params);
  const parsed = FinishArenaChallengeBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid challenge result." });
    return;
  }
  const playerId = profileId(res);
  const summary = parsed.data.summary;
  const result = await db.transaction(async (tx) => {
    // Lock both wallets before the match/profile rows; a result pays the defender too.
    const [ticket] = await tx.select({ attackerId: arenaChallengesTable.attackerId, defenderId: arenaChallengesTable.defenderId })
      .from(arenaChallengesTable).where(eq(arenaChallengesTable.id, params.data.challengeId));
    if (!ticket || ticket.attackerId !== playerId) return { error: "not_found" } as const;
    await lockEconomyAccounts(tx, [playerId, ticket.defenderId]);
    const [challenge] = await tx.select().from(arenaChallengesTable)
      .where(eq(arenaChallengesTable.id, params.data.challengeId)).for("update");
    if (!challenge || challenge.attackerId !== playerId) return { error: "not_found" } as const;
    if (challenge.status !== "pending" && challenge.status !== "completed") {
      return { error: "unverified" } as const;
    }
    if (summary && !validSummary(summary, challenge.attack, challenge.defense)) {
      return { error: "invalid_summary" } as const;
    }
    let settledDelta: number | null = null;
    let rankUp: string | undefined;
    if (challenge.status === "pending") {
      const outcome = parsed.data.localOutcome;
      if (!outcome) return { error: "missing_outcome" } as const;
      const players = await tx.select().from(arenaProfilesTable)
        .where(inArray(arenaProfilesTable.id, [playerId, challenge.defenderId]))
        .orderBy(asc(arenaProfilesTable.id)).for("update");
      const size=rankedSize(challenge.teamSize);
      const rawAttacker = players.find((player) => player.id === playerId);
      const rawDefender = players.find((player) => player.id === challenge.defenderId);
      const attacker = rawAttacker && rankedView(rawAttacker,size);
      const defender = rawDefender && rankedView(rawDefender,size);
      if (!attacker || !defender) return { error: "not_found" } as const;
      const attackerRanks=squadRatings(rawAttacker!);
      const defenderRanks=squadRatings(rawDefender!);
      const attackRank=squadScore(rawAttacker!,size,challenge.attack,attackerRanks);
      const defenseRank=squadScore(rawDefender!,size,challenge.defense,defenderRanks);
      attacker.rating=attackRank.score.rating;attacker.wins=attackRank.score.wins;attacker.losses=attackRank.score.losses;
      defender.rating=defenseRank.score.rating;defender.wins=defenseRank.score.wins;defender.losses=defenseRank.score.losses;
      const delta = ratingChange(attacker.rating,defender.rating,outcome);
      const attackerRating = Math.max(100, attacker.rating + delta);
      const defenderOutcome=outcome==='win'?'loss':outcome==='loss'?'win':'draw';
      const defenderRating = Math.max(100, defender.rating + ratingChange(defender.rating,attacker.rating,defenderOutcome));
      if(attackerRating>attacker.rating&&arenaRankLabel(attacker.rating)!==arenaRankLabel(attackerRating))rankUp=arenaRankLabel(attackerRating);
      await awardRankMilestones(tx, playerId, challenge.id, attacker.rating, attackerRating,size);
      if (!defender.isBot) await awardRankMilestones(tx, defender.id, challenge.id, defender.rating, defenderRating,size);
      settledDelta = attackerRating - attacker.rating;
      attackerRanks[attackRank.key]={...attackRank.score,rating:attackerRating,wins:attacker.wins+(outcome==='win'?1:0),losses:attacker.losses+(outcome==='loss'?1:0)};
      defenderRanks[defenseRank.key]={...defenseRank.score,rating:defenderRating,wins:defender.wins+(outcome==='loss'?1:0),losses:defender.losses+(outcome==='win'?1:0)};
      const attackBest=bestSquad(attackerRanks,size),defenseBest=bestSquad(defenderRanks,size);
      await tx.update(arenaProfilesTable).set({...rankedScorePatch(size,attackBest.rating,attackBest.wins,attackBest.losses),
        state:sql`${arenaProfilesTable.state} || ${JSON.stringify({squadRatings:attackerRanks})}::jsonb`})
        .where(eq(arenaProfilesTable.id, playerId));
      await tx.update(arenaProfilesTable).set({...rankedScorePatch(size,defenseBest.rating,defenseBest.wins,defenseBest.losses),
        state:sql`${arenaProfilesTable.state} || ${JSON.stringify({squadRatings:defenderRanks})}::jsonb`})
        .where(eq(arenaProfilesTable.id, challenge.defenderId));
      await tx.update(arenaChallengesTable).set({
        status: "completed", outcome, localOutcome: outcome,
        defense:{...challenge.defense,settledRatingDelta:defenderRating-defender.rating},
        attackerRatingDelta: settledDelta, resolvedAt: new Date(),
      }).where(eq(arenaChallengesTable.id, challenge.id));

      const farmWindow = new Date(Date.now() - ECONOMY.antiFarming.windowMs);
      const recent = await tx.select().from(arenaEconomyRewardsTable).where(and(
        eq(arenaEconomyRewardsTable.playerId, playerId),
        eq(arenaEconomyRewardsTable.opponentId, challenge.defenderId),
        gte(arenaEconomyRewardsTable.createdAt, farmWindow),
      )).orderBy(desc(arenaEconomyRewardsTable.createdAt)).limit(ECONOMY.antiFarming.repeatCount);
      const cooldownStart = new Date(Date.now() - ECONOMY.antiFarming.cooldownMs);
      const farmed = recent.length >= ECONOMY.antiFarming.repeatCount &&
        recent[0].createdAt >= cooldownStart;
      // Repeat-opponent limits apply to collectible farming, not ordinary Gold.
      const potentialGold = outcome === "win" ? ECONOMY.arenaGold.win :
        outcome === "loss" ? ECONOMY.arenaGold.loss : 0;
      const drops = farmed || outcome === "draw" ? [] : rollArenaDrops(outcome);
      await tx.insert(economyWalletsTable).values({ playerId }).onConflictDoNothing();
      const [wallet] = await tx.select().from(economyWalletsTable)
        .where(eq(economyWalletsTable.playerId, playerId)).for("update");
      const gold = boundedGoldCredit(wallet.gold, potentialGold) ?? 0;
      if (gold > 0) await tx.update(economyWalletsTable).set({ gold: wallet.gold + gold })
        .where(eq(economyWalletsTable.playerId, playerId));
      const awarded: Array<{kind: string; itemId: string; duplicate: boolean}> = [];
      if (!farmed && outcome === "win") awarded.push(...await awardPrestigeDrops(tx,playerId,"arena"));
      for (const drop of drops) {
        const [owned] = await tx.select().from(economyUnlocksTable).where(and(
          eq(economyUnlocksTable.playerId, playerId), eq(economyUnlocksTable.kind, drop.kind),
          eq(economyUnlocksTable.itemId, drop.itemId),
        ));
        if (owned) {
          await tx.insert(economyDuplicatesTable).values({
            playerId, kind: drop.kind, itemId: drop.itemId, quantity: 1,
          }).onConflictDoUpdate({
            target: [economyDuplicatesTable.playerId, economyDuplicatesTable.kind, economyDuplicatesTable.itemId],
            set: { quantity: sql`${economyDuplicatesTable.quantity} + 1` },
          });
          awarded.push({ ...drop, duplicate: true });
        } else {
          await tx.insert(economyUnlocksTable).values({ playerId, kind: drop.kind, itemId: drop.itemId }).onConflictDoNothing();
          awarded.push({ ...drop, duplicate: false });
        }
      }
      const lost: Array<{kind: string; itemId: string; listingCancelled: boolean}> = [];
      if (outcome === "loss") {
        for (const kind of ["spell", "ultimate"] as const) {
          const available = await tx.select().from(economyDuplicatesTable).where(and(
            eq(economyDuplicatesTable.playerId, playerId), eq(economyDuplicatesTable.kind, kind),
            sql`${economyDuplicatesTable.quantity} > 0`,
          )).for("update");
          const activeListings = await tx.select().from(economyListingsTable).where(and(
            eq(economyListingsTable.sellerId, playerId), eq(economyListingsTable.kind, kind),
          ));
          const listingCounts = new Map<string, number>();
          for (const listing of activeListings) listingCounts.set(listing.itemId, (listingCounts.get(listing.itemId) ?? 0) + 1);
          const loss = selectDuplicateLossCopy(kind, available.map((row) => ({
            itemId: row.itemId, quantity: row.quantity, listedQuantity: listingCounts.get(row.itemId) ?? 0,
          })));
          if (!loss) continue;
          const target = available.find((row) => row.itemId === loss.itemId)!;
          if (target.quantity === 1) await tx.delete(economyDuplicatesTable).where(and(
            eq(economyDuplicatesTable.playerId, playerId), eq(economyDuplicatesTable.kind, kind),
            eq(economyDuplicatesTable.itemId, target.itemId),
          ));
          else await tx.update(economyDuplicatesTable).set({ quantity: target.quantity - 1 }).where(and(
            eq(economyDuplicatesTable.playerId, playerId), eq(economyDuplicatesTable.kind, kind),
            eq(economyDuplicatesTable.itemId, target.itemId),
          ));
          const [cancelled] = loss.listingCancelled ? await tx.select().from(economyListingsTable).where(and(
            eq(economyListingsTable.sellerId, playerId), eq(economyListingsTable.kind, kind),
            eq(economyListingsTable.itemId, target.itemId),
          )).limit(1) : [];
          if (cancelled) await tx.delete(economyListingsTable).where(eq(economyListingsTable.id, cancelled.id));
          lost.push({ kind, itemId: target.itemId, listingCancelled: Boolean(cancelled) });
        }
      }
      await tx.insert(arenaEconomyRewardsTable).values({
        challengeId: challenge.id, playerId, opponentId: challenge.defenderId, outcome,
        gold, rankUp, drops: awarded, losses: lost,
      });

      if (!defender.isBot) {
        const defenseMilestones = await rankMilestoneReceipt(tx, defender.id, challenge.id);
        let defenseGold = defenseMilestones.reduce((sum, rank) => sum + rank.gold, 0);
        const defenseDrops: Array<{kind: string; itemId: string; duplicate: boolean}> = [];
        const defenseMatchGold = outcome === "loss" ? ECONOMY.arenaGold.win :
          outcome === "win" ? ECONOMY.arenaGold.loss : 0;
        if (defenseMatchGold > 0) {
          await tx.insert(economyWalletsTable).values({ playerId: defender.id }).onConflictDoNothing();
          const [defenseWallet] = await tx.select().from(economyWalletsTable)
            .where(eq(economyWalletsTable.playerId, defender.id)).for("update");
          const matchGold = boundedGoldCredit(defenseWallet.gold, defenseMatchGold) ?? 0;
          defenseGold += matchGold;
          if (matchGold > 0) await tx.update(economyWalletsTable)
            .set({ gold: defenseWallet.gold + matchGold })
            .where(eq(economyWalletsTable.playerId, defender.id));
        }
        if (outcome === "loss") {
          const history = await tx.select({ createdAt: arenaNotificationsTable.createdAt })
            .from(arenaNotificationsTable)
            .where(and(eq(arenaNotificationsTable.playerId, defender.id),
              eq(arenaNotificationsTable.opponentId, playerId),
              eq(arenaNotificationsTable.direction, "incoming"),
              eq(arenaNotificationsTable.outcome, "win"),
              gte(arenaNotificationsTable.createdAt, farmWindow)))
            .orderBy(desc(arenaNotificationsTable.createdAt))
            .limit(ECONOMY.antiFarming.repeatCount);
          const farmedDefense = history.length >= ECONOMY.antiFarming.repeatCount &&
            history[0].createdAt >= cooldownStart;
          if (!farmedDefense) {
            defenseDrops.push(...await awardPrestigeDrops(tx,defender.id,"arena"));
            for (const drop of rollArenaDrops("win")) {
              const [owned] = await tx.select().from(economyUnlocksTable).where(and(
                eq(economyUnlocksTable.playerId, defender.id), eq(economyUnlocksTable.kind, drop.kind),
                eq(economyUnlocksTable.itemId, drop.itemId),
              ));
              if (owned) {
                await tx.insert(economyDuplicatesTable).values({
                  playerId: defender.id, kind: drop.kind, itemId: drop.itemId, quantity: 1,
                }).onConflictDoUpdate({
                  target: [economyDuplicatesTable.playerId, economyDuplicatesTable.kind, economyDuplicatesTable.itemId],
                  set: { quantity: sql`${economyDuplicatesTable.quantity} + 1` },
                });
              } else {
                await tx.insert(economyUnlocksTable).values({
                  playerId: defender.id, kind: drop.kind, itemId: drop.itemId,
                }).onConflictDoNothing();
              }
              defenseDrops.push({ ...drop, duplicate: Boolean(owned) });
            }
          }
        }
        const defenseOutcome = outcome === "loss" ? "win" : outcome === "win" ? "loss" : "draw";
        await tx.insert(arenaNotificationsTable).values({
          challengeId: challenge.id, playerId: defender.id, opponentId: playerId,
          opponentName: attacker.name, direction: "incoming", outcome: defenseOutcome,
          ratingDelta: defenderRating - defender.rating,
          gold: defenseGold, drops: defenseDrops, losses: [],
        });
      }
    }
    // Do not allow a retry to overwrite the first settled result.
    const presentationUpdate: Partial<typeof arenaChallengesTable.$inferInsert> = {};
    if (summary && !challenge.summary) presentationUpdate.summary = summary;
    if (challenge.status === "completed" && parsed.data.localOutcome !== undefined && !challenge.localOutcome) {
      presentationUpdate.localOutcome = parsed.data.localOutcome;
    }
    if (Object.keys(presentationUpdate).length > 0) await tx.update(arenaChallengesTable)
      .set(presentationUpdate).where(eq(arenaChallengesTable.id, challenge.id));
    const [rawAttacker] = await tx.select().from(arenaProfilesTable)
      .where(eq(arenaProfilesTable.id, playerId));
    const attacker=rankedView(rawAttacker,rankedSize(challenge.teamSize));
    const [defender] = await tx.select().from(arenaProfilesTable)
      .where(eq(arenaProfilesTable.id, challenge.defenderId));
    const [economy] = await tx.select().from(arenaEconomyRewardsTable)
      .where(eq(arenaEconomyRewardsTable.challengeId, challenge.id));
    const rankMilestones = await rankMilestoneReceipt(tx, playerId, challenge.id);
    const [finalWallet] = await tx.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId, playerId));
    return {
      rating: attacker.rating, delta: settledDelta ?? challenge.attackerRatingDelta,
      wins: attacker.wins, losses: attacker.losses,
      outcome: challenge.status === "pending" ? parsed.data.localOutcome : challenge.outcome,
      localOutcome: challenge.status === "pending" ? parsed.data.localOutcome : challenge.localOutcome ?? parsed.data.localOutcome ?? null,
      opponentName: defender.name,
      economy: {
        gold: (economy?.gold ?? 0) + rankMilestones.reduce((sum, rank) => sum + rank.gold, 0),
        drops: economy?.drops ?? [], losses: economy?.losses ?? [],
        balance: finalWallet?.gold ?? 0, rating: attacker.rating, rankMilestones, rankUp: economy?.rankUp ?? rankUp,
      },
      newlySettled: challenge.status === "pending",
      defenderId: challenge.defenderId,
    };
  });
   if ("error" in result) {
     res.status(result.error === "not_found" ? 404 : result.error === "invalid_summary" || result.error === "missing_outcome" ? 400 : 409)
       .json({ error: result.error === "missing_outcome" ? "A completed fight outcome is required." :
         result.error === "invalid_summary" ? "Match statistics did not match the teams." :
        "Challenge not found or not verified." });
    return;
  }
   res.json(FinishArenaChallengeResponse.parse(result));
   if (result.newlySettled) void pruneReplaysForPlayers([playerId, result.defenderId])
     .catch(error => logger.warn({ err: error, challengeId: params.data.challengeId }, "Arena replay cleanup will retry later"));
});

export default router;