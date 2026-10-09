import { getAuth } from "@clerk/express";
import { FinishEconomyTournamentBody } from "@workspace/api-zod";
import { ACCOUNT_GIFT_KIND, syncAccountGift } from "../lib/accountGifts";
import { arenaNotificationsTable, arenaProfilesTable, db, economyDuplicatesTable, economyListingsTable, economyLocalMatchesTable, economyMigrationsTable, economyTournamentRunsTable, economyUnlocksTable, economyWalletsTable } from "@workspace/db";
import { and, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  bootstrapUnlocks,
  CLASS_IDS,
  classUnlockPrice,
  ECONOMY,
  isCanonicalCollectible,
  legacyClassTalentUnlocks,
  LOCAL_MATCH_MIN_DURATION_MS,
  LOCAL_MATCH_PENDING_WINDOW_MS,
  LOCAL_MATCH_START_INTERVAL_MS,
  localStartRetryAfterSeconds,
  localWinGold,
  lockEconomyAccounts,
  mapLegacyEconomyState,
  MAX_GOLD,
  purchaseQuote,
  RACIAL_IDS,
  CLASS_TALENTS,
  racialUnlockPrice,
  starterTalentUnlocks,
  validBootstrapSelection,
} from "../lib/economy";
import { parseRankedTeam } from "../lib/rankedBattle";
import { syncPrestigeEligibility, PRESTIGE_SKINS, PRESTIGE_DROP_CHANCES, GLADIATOR_RATING } from "../lib/prestigeRewards";
import { autoDefenseCandidates } from "../lib/arenaAutoDefense";
import type { TournamentTeam } from "../lib/tournamentRules";
import { resolveTournament, type TournamentHistoryItem } from "../lib/tournament";
import {
  settleTournamentPayout,
  tournamentPrizeForPlacement,
  tournamentEntryLimitReached,
  tournamentFinishWaitSeconds,
} from "../lib/tournamentRules";

const router: IRouter = Router();
const collectibleKinds = ["spell", "ultimate", "talent"] as const;
type CollectibleKind = typeof collectibleKinds[number];
type ListingInput = { kind: CollectibleKind; itemId: string; price: number };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function listingInput(value: unknown): ListingInput | null {
  const body = record(value);
  if (!body || typeof body.kind !== "string" || !collectibleKinds.includes(body.kind as CollectibleKind) ||
    typeof body.itemId !== "string" || body.itemId.length < 1 || body.itemId.length > 80 ||
    !isCanonicalCollectible(body.kind as CollectibleKind, body.itemId) ||
    typeof body.price !== "number" || !Number.isSafeInteger(body.price) || body.price < 1 || body.price > 2_000_000_000) return null;
  return { kind: body.kind as CollectibleKind, itemId: body.itemId, price: body.price };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

router.use((req, res, next) => {
  const id = getAuth(req).userId;
  if (!id) {
    res.status(401).json({ error: "Sign in to access the economy." });
    return;
  }
  res.locals.playerId = id;
  void (async () => {
    await db.insert(arenaProfilesTable).values({ id, name: `Challenger ${id.slice(-6)}` }).onConflictDoNothing();
    const [profile] = await db.select().from(arenaProfilesTable).where(eq(arenaProfilesTable.id, id));
    await initializeEconomy(id, profile?.state ?? {});
    const [account] = await db.select().from(economyMigrationsTable)
      .where(eq(economyMigrationsTable.playerId, id));
    res.locals.economyReady = Boolean(account);
    next();
  })().catch(next);
});

function playerId(res: { locals: Record<string, unknown> }): string {
  return res.locals.playerId as string;
}

function requireReady(res: { locals: Record<string, unknown>; status: (code: number) => { json: (body: unknown) => unknown } }): boolean {
  if (res.locals.economyReady) return true;
  res.status(428).json({ error: "Complete one-time class and racial onboarding first." });
  return false;
}

/** Import old profile values exactly once; later profile saves cannot alter this ledger. */
export async function initializeEconomy(playerId: string, legacyState: Record<string, unknown> = {}): Promise<void> {
  const imported = mapLegacyEconomyState(legacyState);
  await db.transaction(async (tx) => {
    await lockEconomyAccounts(tx, [playerId]);
    const [prior] = await tx.select().from(economyMigrationsTable)
      .where(eq(economyMigrationsTable.playerId, playerId));
    if (!prior) {
      if (!imported.present) return;
      const [alreadySettled] = await tx.select({ count: sql<number>`count(*)::int` })
        .from(economyTournamentRunsTable).where(and(
          eq(economyTournamentRunsTable.playerId, playerId),
          eq(economyTournamentRunsTable.state, "finished"),
          eq(economyTournamentRunsTable.placement, "champion"),
        ));
      await tx.insert(economyMigrationsTable).values({
        playerId,
        status: "legacy_v3",
        legacyTournamentWins: Math.max(0, imported.legacyTournamentWins - alreadySettled.count),
        legacyTournamentEntries: imported.legacyTournamentEntries,
        legacyTournamentHistory: imported.legacyTournamentHistory,
      });
      await tx.insert(economyWalletsTable).values({ playerId, gold: imported.gold }).onConflictDoNothing();
      if (imported.unlocks.length) await tx.insert(economyUnlocksTable).values(
        imported.unlocks.map((item) => ({ ...item, playerId })),
      ).onConflictDoNothing();
      return;
    }
    const isLegacyUpgrade = prior.status === "legacy" || prior.status === "legacy_v2";
    const isBootstrapUpgrade = prior.status === "bootstrap" || prior.status === "bootstrap_v2";
    if (!isLegacyUpgrade && !isBootstrapUpgrade) return;
    const [alreadySettled] = await tx.select({ count: sql<number>`count(*)::int` })
      .from(economyTournamentRunsTable).where(and(
        eq(economyTournamentRunsTable.playerId, playerId),
        eq(economyTournamentRunsTable.state, "finished"),
        eq(economyTournamentRunsTable.placement, "champion"),
      ));
    const ownedClassRows = await tx.select({ itemId: economyUnlocksTable.itemId })
      .from(economyUnlocksTable).where(and(
        eq(economyUnlocksTable.playerId, playerId), eq(economyUnlocksTable.kind, "class"),
      ));
    const ownedClasses = [...new Set(ownedClassRows
      .map((row) => row.itemId)
      .filter((classId): classId is typeof CLASS_IDS[number] =>
        CLASS_IDS.includes(classId as typeof CLASS_IDS[number])))];
    const talentGrants = isLegacyUpgrade
      ? legacyClassTalentUnlocks(ownedClasses)
      : starterTalentUnlocks(ownedClasses);
    if (talentGrants.length) await tx.insert(economyUnlocksTable).values(
      talentGrants.map((item) => ({ ...item, playerId })),
    ).onConflictDoNothing();
    await tx.update(economyMigrationsTable).set({
      status: isLegacyUpgrade ? "legacy_v3" : "bootstrap_v3",
      legacyTournamentWins: Math.max(0, imported.legacyTournamentWins - alreadySettled.count),
      legacyTournamentEntries: imported.legacyTournamentEntries,
      legacyTournamentHistory: imported.legacyTournamentHistory,
    }).where(eq(economyMigrationsTable.playerId, playerId));
  });
}

router.get("/economy", async (_req, res): Promise<void> => {
  const id = playerId(res);
  if (res.locals.economyReady) await syncAccountGift(id);
  await syncPrestigeEligibility(id);
  const [wallet] = await db.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId, id));
  const unlocks = await db.select({ kind: economyUnlocksTable.kind, itemId: economyUnlocksTable.itemId })
    .from(economyUnlocksTable).where(eq(economyUnlocksTable.playerId, id));
  const duplicates = await db.select({ kind: economyDuplicatesTable.kind, itemId: economyDuplicatesTable.itemId, quantity: economyDuplicatesTable.quantity })
    .from(economyDuplicatesTable).where(eq(economyDuplicatesTable.playerId, id));
  const listings = await db.select().from(economyListingsTable).where(eq(economyListingsTable.sellerId, id));
  res.json({
    onboardingRequired: !res.locals.economyReady,
    gold: wallet?.gold ?? 0, unlocks: unlocks.filter(row => row.kind !== ACCOUNT_GIFT_KIND), duplicates, listings,
    config: {
      prestige: { skins: PRESTIGE_SKINS, dropChances: PRESTIGE_DROP_CHANCES, gladiatorRating: GLADIATOR_RATING },
      dungeonGold: ECONOMY.dungeonGold,
      arenaGold: ECONOMY.arenaGold, localGold: ECONOMY.localGold,
      arenaDrops: ECONOMY.arenaDrops, duplicateLoss: ECONOMY.duplicateLoss,
      marketTax: ECONOMY.marketTax, classPrices: ECONOMY.classPrices,
      classPriceAfterTenth: ECONOMY.classPriceAfterTenth, racialPrices: ECONOMY.racialPrices,
      racialPriceAfterSixth: ECONOMY.racialPriceAfterSixth, tournament: ECONOMY.tournament,
      antiFarming: ECONOMY.antiFarming, dropCatalog: ECONOMY.drops,
    },
  });
});

router.post("/economy/local-matches", async (req, res): Promise<void> => {
  if (!requireReady(res)) return;
  const input = record(req.body);
  if (!input || !isUuid(input.requestId)) {
    res.status(400).json({ error: "A valid local match ID is required." });
    return;
  }
  const id = playerId(res);
  const requestId = input.requestId;
  const registration = await db.transaction(async tx => {
    await lockEconomyAccounts(tx, [id]);
    const [existing] = await tx.select().from(economyLocalMatchesTable)
      .where(eq(economyLocalMatchesTable.id, requestId));
    if (existing) return existing.playerId === id ? { match: existing } : { conflict: true };
    const now = Date.now();
    const [recent] = await tx.select({ startedAt: economyLocalMatchesTable.startedAt })
      .from(economyLocalMatchesTable)
      .where(and(eq(economyLocalMatchesTable.playerId, id),
        gte(economyLocalMatchesTable.startedAt, new Date(now - LOCAL_MATCH_START_INTERVAL_MS))))
      .orderBy(desc(economyLocalMatchesTable.startedAt)).limit(1);
    if (recent) return { retryAfterSeconds: localStartRetryAfterSeconds(recent.startedAt, 0, now)! };
    const [outstanding] = await tx.select({ count: sql<number>`count(*)::int` })
      .from(economyLocalMatchesTable).where(and(
        eq(economyLocalMatchesTable.playerId, id),
        isNull(economyLocalMatchesTable.completedAt),
        gte(economyLocalMatchesTable.startedAt, new Date(now - LOCAL_MATCH_PENDING_WINDOW_MS)),
      ));
    const retryAfterSeconds = localStartRetryAfterSeconds(null, outstanding.count, now);
    if (retryAfterSeconds) return { retryAfterSeconds };
    const [match] = await tx.insert(economyLocalMatchesTable)
      .values({ id: requestId, playerId: id }).onConflictDoNothing().returning();
    return match ? { match } : { conflict: true };
  });
  if ("conflict" in registration) {
    res.status(409).json({ error: "That match ID is already in use." });
    return;
  }
  if ("retryAfterSeconds" in registration) {
    res.status(429).json({
      error: "Finish your recent local AI match before registering another reward.",
      retryAfterSeconds: registration.retryAfterSeconds,
    });
    return;
  }
  res.status(201).json({ id: registration.match.id, startedAt: registration.match.startedAt.toISOString() });
});

router.post("/economy/local-matches/:matchId/finish", async (req, res): Promise<void> => {
  if (!requireReady(res)) return;
  const matchId = req.params.matchId;
  const input = record(req.body);
  if (!isUuid(matchId) || !input || !["win", "loss", "draw"].includes(String(input.outcome))) {
    res.status(400).json({ error: "A valid local match and outcome are required." });
    return;
  }
  const id = playerId(res);
  const settled = await db.transaction(async tx => {
    await lockEconomyAccounts(tx, [id]);
    const [match] = await tx.select().from(economyLocalMatchesTable)
      .where(eq(economyLocalMatchesTable.id, matchId)).for("update");
    if (!match || match.playerId !== id) return { error: "not_found" } as const;
    const [wallet] = await tx.select().from(economyWalletsTable)
      .where(eq(economyWalletsTable.playerId, id)).for("update");
    if (!wallet) return { error: "no_wallet" } as const;
    const [wins] = await tx.select({ count: sql<number>`count(*)::int` })
      .from(economyLocalMatchesTable).where(and(
        eq(economyLocalMatchesTable.playerId, id),
        eq(economyLocalMatchesTable.outcome, "win"),
      ));
    if (match.completedAt) return {
      id: match.id, outcome: match.outcome, gold: match.gold,
      balance: wallet.gold, localWins: wins.count,
    };
    const elapsed = Date.now() - match.startedAt.getTime();
    if (elapsed < LOCAL_MATCH_MIN_DURATION_MS) return {
      error: "too_soon", retryAfterSeconds: Math.ceil((LOCAL_MATCH_MIN_DURATION_MS - elapsed) / 1000),
    } as const;
    const outcome = input.outcome as "win" | "loss" | "draw";
    const potential = outcome === "win" ? localWinGold(wins.count) : 0;
    const gold = Math.max(0, Math.min(potential, MAX_GOLD - wallet.gold));
    if (gold) await tx.update(economyWalletsTable).set({ gold: wallet.gold + gold })
      .where(eq(economyWalletsTable.playerId, id));
    await tx.update(economyLocalMatchesTable).set({ outcome, gold, completedAt: new Date() })
      .where(eq(economyLocalMatchesTable.id, match.id));
    return { id: match.id, outcome, gold, balance: wallet.gold + gold,
      localWins: wins.count + (outcome === "win" ? 1 : 0) };
  });
  if ("error" in settled) {
    const status = settled.error === "not_found" ? 404 : settled.error === "too_soon" ? 409 : 500;
    res.status(status).json({ error: settled.error === "too_soon" ? "The local fight is still starting. Retry shortly." :
      settled.error === "not_found" ? "Local match not found." : "Gold wallet unavailable.",
      ...("retryAfterSeconds" in settled ? { retryAfterSeconds: settled.retryAfterSeconds } : {}) });
    return;
  }
  res.json(settled);
});

router.post("/economy/bootstrap", async (req, res): Promise<void> => {
  const body = record(req.body);
  const classIds = body?.classIds;
  const racialId = body?.racialId;
  if (!validBootstrapSelection(classIds, racialId)) {
    res.status(400).json({ error: "Choose exactly three distinct valid classes and one valid starting racial." });
    return;
  }
  const id = playerId(res);
  const selectedRacial = racialId as string;
  const selection = { classIds: [...classIds].sort(), racialId: selectedRacial };
  const result = await db.transaction(async (tx) => {
    await lockEconomyAccounts(tx, [id]);
    const [prior] = await tx.select().from(economyMigrationsTable)
      .where(eq(economyMigrationsTable.playerId, id));
    if (prior) {
      if (["bootstrap", "bootstrap_v2", "bootstrap_v3"].includes(prior.status) &&
        JSON.stringify(prior.onboardingSelection) === JSON.stringify(selection)) return "replayed" as const;
      return "already_initialized" as const;
    }
    await tx.insert(economyMigrationsTable).values({
      playerId: id, status: "bootstrap_v3", onboardingSelection: selection,
    });
    await tx.insert(economyWalletsTable).values({ playerId: id, gold: 0 }).onConflictDoNothing();
    const grants = bootstrapUnlocks(classIds, selectedRacial).map((item) => ({ ...item, playerId: id }));
    await tx.insert(economyUnlocksTable).values(grants).onConflictDoNothing();
    return "created" as const;
  });
  if (result === "already_initialized") {
    res.status(409).json({ error: "Economy was already initialized and cannot be bootstrapped again." });
    return;
  }
  res.status(result === "created" ? 201 : 200).json({
    bootstrapped: true, repeatedRequest: result === "replayed", gold: 0,
    unlocks: bootstrapUnlocks(classIds, selectedRacial),
  });
});

router.get("/market/listings", async (_req, res): Promise<void> => {
  const listings = await db.select().from(economyListingsTable).orderBy(economyListingsTable.createdAt).limit(100);
  res.json(listings);
});

router.post("/market/listings", async (req, res): Promise<void> => {
  if (!requireReady(res)) return;
  const input = listingInput(req.body);
  if (!input) {
    res.status(400).json({ error: "Provide a collectible duplicate and a positive Gold price." });
    return;
  }
  const sellerId = playerId(res);
  const listing = await db.transaction(async (tx) => {
    await lockEconomyAccounts(tx, [sellerId]);
    const [duplicate] = await tx.select().from(economyDuplicatesTable)
      .where(and(eq(economyDuplicatesTable.playerId, sellerId), eq(economyDuplicatesTable.kind, input.kind),
        eq(economyDuplicatesTable.itemId, input.itemId))).for("update");
    if (!duplicate || duplicate.quantity < 1) return null;
    const [active] = await tx.select({ count: sql<number>`count(*)::int` }).from(economyListingsTable)
      .where(and(eq(economyListingsTable.sellerId, sellerId), eq(economyListingsTable.kind, input.kind),
        eq(economyListingsTable.itemId, input.itemId)));
    if (active.count >= duplicate.quantity) return null;
    const [created] = await tx.insert(economyListingsTable).values({
      sellerId, kind: input.kind, itemId: input.itemId, price: input.price,
    }).returning();
    return created;
  });
  if (!listing) {
    res.status(409).json({ error: "No unlisted duplicate copy is available." });
    return;
  }
  res.status(201).json(listing);
});

router.delete("/market/listings/:listingId", async (req, res): Promise<void> => {
  if (!requireReady(res)) return;
  const listingId = req.params.listingId;
  if (!isUuid(listingId)) { res.status(400).json({ error: "Invalid listing ID." }); return; }
  const sellerId = playerId(res);
  const removed = await db.transaction(async (tx) => {
    await lockEconomyAccounts(tx, [sellerId]);
    const [row] = await tx.delete(economyListingsTable).where(and(
      eq(economyListingsTable.id, listingId), eq(economyListingsTable.sellerId, sellerId),
    )).returning();
    return row;
  });
  if (!removed) { res.status(404).json({ error: "Listing not found." }); return; }
  res.json({ cancelled: true });
});

router.post("/market/listings/:listingId/purchase", async (req, res): Promise<void> => {
  if (!requireReady(res)) return;
  const listingId = req.params.listingId;
  if (!isUuid(listingId)) { res.status(400).json({ error: "Invalid listing ID." }); return; }
  const buyerId = playerId(res);
  const [listingOwner] = await db.select({ sellerId: economyListingsTable.sellerId })
    .from(economyListingsTable).where(eq(economyListingsTable.id, listingId));
  if (!listingOwner) { res.status(404).json({ error: "Listing no longer exists." }); return; }
  const result = await db.transaction(async (tx) => {
    await lockEconomyAccounts(tx, [buyerId, listingOwner.sellerId]);
    const [listing] = await tx.select().from(economyListingsTable)
      .where(eq(economyListingsTable.id, listingId)).for("update");
    if (!listing) return "missing" as const;
    if (listing.sellerId !== listingOwner.sellerId) return "missing" as const;
    if (listing.sellerId === buyerId) return "self" as const;
    const ids = [buyerId, listing.sellerId].sort();
    const wallets = await tx.select().from(economyWalletsTable)
      .where(inArray(economyWalletsTable.playerId, ids)).orderBy(economyWalletsTable.playerId).for("update");
    const buyer = wallets.find((row) => row.playerId === buyerId);
    const seller = wallets.find((row) => row.playerId === listing.sellerId);
    if (!buyer || !seller || buyer.gold < listing.price) return "funds" as const;
    const quote = purchaseQuote(listing.price, buyer.gold, seller.gold);
    if (!quote) return "balance_cap" as const;
    const [duplicate] = await tx.select().from(economyDuplicatesTable).where(and(
      eq(economyDuplicatesTable.playerId, listing.sellerId), eq(economyDuplicatesTable.kind, listing.kind),
      eq(economyDuplicatesTable.itemId, listing.itemId),
    )).for("update");
    if (!duplicate || duplicate.quantity < 1) {
      await tx.delete(economyListingsTable).where(eq(economyListingsTable.id, listing.id));
      return "destroyed" as const;
    }
    await tx.update(economyWalletsTable).set({ gold: quote.buyerGoldAfter })
      .where(eq(economyWalletsTable.playerId, buyerId));
    await tx.update(economyWalletsTable).set({ gold: quote.sellerGoldAfter })
      .where(eq(economyWalletsTable.playerId, listing.sellerId));
    if (duplicate.quantity === 1) await tx.delete(economyDuplicatesTable).where(and(
      eq(economyDuplicatesTable.playerId, listing.sellerId), eq(economyDuplicatesTable.kind, listing.kind),
      eq(economyDuplicatesTable.itemId, listing.itemId),
    ));
    else await tx.update(economyDuplicatesTable).set({ quantity: duplicate.quantity - 1 }).where(and(
      eq(economyDuplicatesTable.playerId, listing.sellerId), eq(economyDuplicatesTable.kind, listing.kind),
      eq(economyDuplicatesTable.itemId, listing.itemId),
    ));
    await tx.delete(economyListingsTable).where(eq(economyListingsTable.id, listing.id));
    const [owned] = await tx.select().from(economyUnlocksTable).where(and(
      eq(economyUnlocksTable.playerId, buyerId), eq(economyUnlocksTable.kind, listing.kind),
      eq(economyUnlocksTable.itemId, listing.itemId),
    ));
    if (!owned) await tx.insert(economyUnlocksTable).values({ playerId: buyerId, kind: listing.kind, itemId: listing.itemId }).onConflictDoNothing();
    else await tx.insert(economyDuplicatesTable).values({
      playerId: buyerId, kind: listing.kind, itemId: listing.itemId, quantity: 1,
    }).onConflictDoUpdate({
      target: [economyDuplicatesTable.playerId, economyDuplicatesTable.kind, economyDuplicatesTable.itemId],
      set: { quantity: sql`${economyDuplicatesTable.quantity} + 1` },
    });
    return { purchased: true, price: listing.price, tax: quote.tax, sellerAmount: quote.sellerAmount };
  });
  if (result === "missing") { res.status(404).json({ error: "Listing no longer exists." }); return; }
  if (result === "self") { res.status(400).json({ error: "You cannot buy your own listing." }); return; }
  if (result === "funds") { res.status(409).json({ error: "Insufficient Gold." }); return; }
  if (result === "balance_cap") { res.status(409).json({ error: "Seller's Gold balance is at its safe maximum." }); return; }
  if (result === "destroyed") { res.status(409).json({ error: "The listed duplicate no longer exists." }); return; }
  res.json(result);
});

router.post("/economy/unlock/class", async (req, res): Promise<void> => {
  if (!requireReady(res)) return;
  const classId = record(req.body)?.classId;
  if (typeof classId !== "string" || !CLASS_IDS.includes(classId as typeof CLASS_IDS[number])) { res.status(400).json({ error: "Unknown class." }); return; }
  const id = playerId(res);
  const result = await db.transaction(async (tx) => {
    await lockEconomyAccounts(tx, [id]);
    const [wallet] = await tx.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId, id)).for("update");
    const [owned] = await tx.select().from(economyUnlocksTable).where(and(
      eq(economyUnlocksTable.playerId, id), eq(economyUnlocksTable.kind, "class"), eq(economyUnlocksTable.itemId, classId),
    ));
    if (owned) return "owned" as const;
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(economyUnlocksTable)
      .where(and(eq(economyUnlocksTable.playerId, id), eq(economyUnlocksTable.kind, "class")));
    const price = classUnlockPrice(count.count);
    if (!wallet || wallet.gold < price) return "funds" as const;
    await tx.update(economyWalletsTable).set({ gold: wallet.gold - price }).where(eq(economyWalletsTable.playerId, id));
    await tx.insert(economyUnlocksTable).values({ playerId: id, kind: "class", itemId: classId });
    const starter = starterTalentUnlocks([classId]);
    if (starter.length) await tx.insert(economyUnlocksTable).values(
      starter.map((item) => ({ ...item, playerId: id })),
    ).onConflictDoNothing();
    return { unlocked: true, price };
  });
  if (result === "owned") { res.status(409).json({ error: "Class already unlocked." }); return; }
  if (result === "funds") { res.status(409).json({ error: "Insufficient Gold." }); return; }
  res.json(result);
});

router.post("/economy/unlock/racial", async (req, res): Promise<void> => {
  if (!requireReady(res)) return;
  const racialId = record(req.body)?.racialId;
  if (typeof racialId !== "string" || !RACIAL_IDS.includes(racialId as typeof RACIAL_IDS[number])) { res.status(400).json({ error: "Unknown racial." }); return; }
  const id = playerId(res);
  const result = await db.transaction(async (tx) => {
    await lockEconomyAccounts(tx, [id]);
    const [wallet] = await tx.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId, id)).for("update");
    const [owned] = await tx.select().from(economyUnlocksTable).where(and(
      eq(economyUnlocksTable.playerId, id), eq(economyUnlocksTable.kind, "racial"), eq(economyUnlocksTable.itemId, racialId),
    ));
    if (owned) return "owned" as const;
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(economyUnlocksTable)
      .where(and(eq(economyUnlocksTable.playerId, id), eq(economyUnlocksTable.kind, "racial")));
    const price = racialUnlockPrice(Math.max(0, count.count - 1));
    if (!wallet || wallet.gold < price) return "funds" as const;
    await tx.update(economyWalletsTable).set({ gold: wallet.gold - price }).where(eq(economyWalletsTable.playerId, id));
    await tx.insert(economyUnlocksTable).values({ playerId: id, kind: "racial", itemId: racialId });
    return { unlocked: true, price };
  });
  if (result === "owned") { res.status(409).json({ error: "Racial already unlocked." }); return; }
  if (result === "funds") { res.status(409).json({ error: "Insufficient Gold." }); return; }
  res.json(result);
});

function tournamentReceipt(
  run: typeof economyTournamentRunsTable.$inferSelect,
  gold: number,
  repeatedRequest: boolean,
  tournamentWins: number,
) {
  return {
    id: run.id,
    requestId: run.requestId,
    state: run.state,
    placement: run.placement,
    prize: run.prize,
    entryFee: ECONOMY.tournament.entry,
    gold,
    tournamentWins,
    repeatedRequest,
    history: run.history,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
  };
}

async function settledTournamentWins(playerId: string): Promise<number> {
  const [settled] = await db.select({ count: sql<number>`count(*)::int` }).from(economyTournamentRunsTable)
    .where(and(
      eq(economyTournamentRunsTable.playerId, playerId),
      eq(economyTournamentRunsTable.state, "finished"),
      eq(economyTournamentRunsTable.placement, "champion"),
    ));
  const [migration] = await db.select({ legacyTournamentWins: economyMigrationsTable.legacyTournamentWins })
    .from(economyMigrationsTable).where(eq(economyMigrationsTable.playerId, playerId));
  return settled.count + (migration?.legacyTournamentWins ?? 0);
}

router.post("/economy/tournaments/enter", async (req, res): Promise<void> => {
  if (!requireReady(res)) return;
  const body = record(req.body);
  if (!body || !isUuid(body.requestId)) {
    res.status(400).json({ error: "Provide a UUID requestId and a valid 3v3 attack snapshot." });
    return;
  }
  const id = playerId(res);
  const entered = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${body.requestId}, 9473))`);
    const [prior] = await tx.select().from(economyTournamentRunsTable)
      .where(eq(economyTournamentRunsTable.requestId, body.requestId as string));
    if (prior) return prior.playerId === id ? { run: prior, repeated: true } : null;

    const players=await tx.select().from(arenaProfilesTable)
      .where(and(eq(arenaProfilesTable.isBot,false),ne(arenaProfilesTable.id,id)))
      .orderBy(sql`random()`).limit(100);
    const unlocks=players.length ? await tx.select().from(economyUnlocksTable)
      .where(inArray(economyUnlocksTable.playerId,players.map(player=>player.id))) : [];
    const eligible:TournamentTeam[]=[];
    for(const player of players) {
      const owned=new Set(unlocks.filter(item=>item.playerId===player.id).map(item=>`${item.kind}:${item.itemId}`));
      const squads=autoDefenseCandidates({...player.state,defenseTeam:player.defense ?? player.state.defenseTeam})
        .filter(snapshot=>{
          const team=parseRankedTeam(snapshot);
          return team && team.heroes.every(hero=>owned.has(`class:${hero.classId}`) &&
            (hero.ability!=="custom" || owned.has(`spell:ability:${hero.classId}`)) &&
            (hero.ultimate!=="custom" || owned.has(`ultimate:ult:${hero.classId}`)) &&
            (hero.talents??[]).every(talent=>owned.has(`talent:${hero.classId}:${talent}`))) &&
            (!team.captainRacial || owned.has(`racial:${team.captainRacial}`));
        });
      if(squads.length) eligible.push({id:player.id,name:player.name,snapshot:squads[Math.floor(Math.random()*squads.length)]});
      if(eligible.length===5) break;
    }
    if(eligible.length<5) return "no_opponents" as const;
    // All participating accounts are locked in one canonical order, including
    // passive winners, before any wallet or run row is locked.
    await lockEconomyAccounts(tx,[id,...eligible.map(player=>player.id)]);
    const [wallet] = await tx.select().from(economyWalletsTable)
      .where(eq(economyWalletsTable.playerId, id)).for("update");
    const [account] = await tx.select().from(economyMigrationsTable)
      .where(eq(economyMigrationsTable.playerId, id));
    if (!wallet || !account) return "uninitialized" as const;
    const windowStart = new Date(Date.now() - ECONOMY.tournament.entryWindowMs);
    const [entryCount] = await tx.select({ count: sql<number>`count(*)::int` }).from(economyTournamentRunsTable)
      .where(and(
        eq(economyTournamentRunsTable.playerId, id),
        gte(economyTournamentRunsTable.createdAt, windowStart),
      ));
    if (tournamentEntryLimitReached(entryCount.count, ECONOMY.tournament.entryLimit)) {
      return "entry_limit" as const;
    }

    const snapshot = record(body.attack);
    const team = snapshot && parseRankedTeam(snapshot);
    if (!snapshot || !team || !team.captainClass || !team.captainRacial ||
      !RACIAL_IDS.includes(team.captainRacial as typeof RACIAL_IDS[number]) ||
      !team.heroes.some((hero) => hero.classId === team.captainClass)) return "invalid_team" as const;

    const required: Array<{ kind: string; itemId: string }> = [];
    for (const hero of team.heroes) {
      required.push({ kind: "class", itemId: hero.classId });
      if (hero.ability === "custom") {
        const itemId = `ability:${hero.classId}`;
        if (!isCanonicalCollectible("spell", itemId)) return "invalid_team" as const;
        required.push({ kind: "spell", itemId });
      }
      if (hero.ultimate === "custom") {
        const itemId = `ult:${hero.classId}`;
        if (!isCanonicalCollectible("ultimate", itemId)) return "invalid_team" as const;
        required.push({ kind: "ultimate", itemId });
      }
      for (const talent of hero.talents ?? []) {
        if (!CLASS_TALENTS[hero.classId]?.includes(talent)) return "invalid_team" as const;
        required.push({ kind: "talent", itemId: `${hero.classId}:${talent}` });
      }
    }
    required.push({ kind: "racial", itemId: team.captainRacial });
    const owned = await tx.select({ kind: economyUnlocksTable.kind, itemId: economyUnlocksTable.itemId })
      .from(economyUnlocksTable).where(eq(economyUnlocksTable.playerId, id));
    const ownedKeys = new Set(owned.map((item) => `${item.kind}:${item.itemId}`));
    if (!required.every((item) => ownedKeys.has(`${item.kind}:${item.itemId}`))) return "unowned_loadout" as const;
    if (wallet.gold < ECONOMY.tournament.entry) return "funds" as const;

    const serverSnapshot = {
      heroes: team.heroes,
      captainClass: team.captainClass,
      captainRacial: team.captainRacial,
    };
    const result = resolveTournament(serverSnapshot,eligible);
    await tx.update(economyWalletsTable).set({ gold: wallet.gold - ECONOMY.tournament.entry })
      .where(eq(economyWalletsTable.playerId, id));
    const [run] = await tx.insert(economyTournamentRunsTable).values({
      requestId: body.requestId as string,
      playerId: id,
      attack: serverSnapshot,
      placement: result.placement,
      prize: result.prize,
      history: result.history,
    }).returning();
    for(const [index,match] of result.history.entries()) {
      if(match.winner==="player" || match.outcome==="draw") continue;
      const opponent=match.winner===match.playerA ? match.playerB : match.playerA;
      const opponentName=match.winner===match.playerA ? match.playerBName : match.playerAName;
      const [notification]=await tx.insert(arenaNotificationsTable).values({
        playerId:match.winner,challengeId:null,type:"tournament",
        encounterId:`${run.id}:${index}:${match.winner}`,
        opponentId:opponent==="player" ? id : opponent,
         opponentName:opponentName==="You" ? "Tournament challenger" : opponentName,
        direction:"incoming",outcome:"win",ratingDelta:0,gold:10,
        message:`Your saved squad won a tournament encounter against ${opponentName==="You" ? "a challenger" : opponentName} and earned 10 Gold.`,
      }).onConflictDoNothing().returning();
      if(!notification) continue;
      await tx.insert(economyWalletsTable).values({playerId:match.winner}).onConflictDoNothing();
      const [defenseWallet]=await tx.select().from(economyWalletsTable)
        .where(eq(economyWalletsTable.playerId,match.winner)).for("update");
      if(defenseWallet.gold>MAX_GOLD-10) throw new Error("Tournament defense reward would exceed the Gold limit.");
      await tx.update(economyWalletsTable).set({gold:defenseWallet.gold+10})
        .where(eq(economyWalletsTable.playerId,match.winner));
    }
    return { run, repeated: false };
  });
  if (entered === null) { res.status(409).json({ error: "This requestId belongs to another player." }); return; }
  if (entered === "uninitialized") { res.status(428).json({ error: "Initialize your economy before entering." }); return; }
  if (entered === "invalid_team") { res.status(400).json({ error: "Provide a complete 3v3 snapshot with an active captain and racial." }); return; }
  if (entered === "unowned_loadout") { res.status(403).json({ error: "The attack snapshot contains a class, racial, spell, ultimate, or talent you do not own." }); return; }
  if (entered === "funds") { res.status(409).json({ error: "Insufficient Gold for tournament entry." }); return; }
  if (entered === "no_opponents") { res.status(409).json({ error: "Not enough eligible real-player 3v3 squads yet. Five other players are required; no Gold was charged." }); return; }
  if (entered === "entry_limit") {
    const windowHours = ECONOMY.tournament.entryWindowMs / (60 * 60 * 1000);
    res.status(429).json({
      error: `Tournament entry limit reached (${ECONOMY.tournament.entryLimit} per rolling ${windowHours}-hour window).`,
    });
    return;
  }
  const [wallet] = await db.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId, id));
  const tournamentWins = await settledTournamentWins(id);
  res.status(entered.repeated ? 200 : 201).json(
    tournamentReceipt(entered.run, wallet?.gold ?? 0, entered.repeated, tournamentWins),
  );
});

router.post("/economy/tournaments/:tournamentId/finish", async (req, res): Promise<void> => {
  if (!requireReady(res)) return;
  if (!isUuid(req.params.tournamentId)) { res.status(400).json({ error: "Invalid tournament ID." }); return; }
  const id = playerId(res);
  const played = FinishEconomyTournamentBody.safeParse(req.body);
  const result = await db.transaction(async (tx) => {
    await lockEconomyAccounts(tx, [id]);
    const [run] = await tx.select().from(economyTournamentRunsTable)
      .where(eq(economyTournamentRunsTable.id, req.params.tournamentId)).for("update");
    if (!run || run.playerId !== id) return null;
    if (run.state === "entered") {
      if (!played.success) return "missing_placement" as const;
      const waitSeconds = tournamentFinishWaitSeconds(run.createdAt, Date.now(), ECONOMY.tournament.minimumDurationMs);
      if (waitSeconds > 0) return { tooEarly: waitSeconds } as const;
    }
    const [wallet] = await tx.select().from(economyWalletsTable)
      .where(eq(economyWalletsTable.playerId, id)).for("update");
    if (!wallet) return "uninitialized" as const;
    // Keep historical settlements immutable. New prizes follow the fight the
    // player saw; the server still owns amounts, eligibility and the wallet.
    const placement = run.state === "finished" ? run.placement : played.data!.placement;
    const prize = run.state === "finished" ? run.prize :
      tournamentPrizeForPlacement(placement, ECONOMY.tournament);
    const payout = settleTournamentPayout(run.state, wallet.gold, prize);
    if (payout.repeated) return { run, gold: payout.gold, repeated: true };
    if (!Number.isSafeInteger(payout.gold) || payout.gold > MAX_GOLD) return "balance_cap" as const;
    await tx.update(economyWalletsTable).set({ gold: payout.gold })
      .where(eq(economyWalletsTable.playerId, id));
    const [finished] = await tx.update(economyTournamentRunsTable).set({
      state: "finished", placement, prize, finishedAt: new Date(),
    }).where(eq(economyTournamentRunsTable.id, run.id)).returning();
    return { run: finished, gold: payout.gold, repeated: false };
  });
  if (result === null) { res.status(404).json({ error: "Tournament run not found." }); return; }
  if (result === "missing_placement") {
    res.status(400).json({ error: "Finish the played tournament bracket before claiming its prize." }); return;
  }
  if (typeof result === "object" && "tooEarly" in result) {
    res.status(409).json({
      error: `Tournament reward is locked until ${Math.ceil(ECONOMY.tournament.minimumDurationMs / 1000)} seconds after entry.`,
      retryAfterSeconds: result.tooEarly,
    });
    return;
  }
  if (result === "uninitialized") { res.status(428).json({ error: "Initialize your economy before finishing." }); return; }
  if (result === "balance_cap") { res.status(409).json({ error: "Tournament prize would exceed the wallet balance limit." }); return; }
  const tournamentWins = await settledTournamentWins(id);
  res.json(tournamentReceipt(result.run, result.gold, result.repeated, tournamentWins));
});

router.get("/economy/tournaments", async (_req, res): Promise<void> => {
  const id = playerId(res);
  const [wallet] = await db.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId, id));
  const runs = await db.select().from(economyTournamentRunsTable)
    .where(eq(economyTournamentRunsTable.playerId, id)).orderBy(economyTournamentRunsTable.createdAt);
  const tournamentWins = await settledTournamentWins(id);
  res.json(runs.map((run) => tournamentReceipt(run, wallet?.gold ?? 0, false, tournamentWins)));
});

export default router;