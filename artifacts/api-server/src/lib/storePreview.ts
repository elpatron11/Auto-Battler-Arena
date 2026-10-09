import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import {
  db, arenaChallengesTable, arenaProfilesTable, economyUnlocksTable,
  storeTestClaimsTable, storeTestPurchasesTable,
  storeLiveClaimsTable, storeLivePurchasesTable,
} from "@workspace/db";
import { GetStoreResponse } from "@workspace/api-zod";
import { storeOffersAt, storeRewardState, storeTestFlowsEnabled, storeWeekAt } from "./storeRules";
import { storeStripeState } from "./storeStripeState";
import { storeCheckoutMode } from "./storeStripeRules";

type StoreReader = Pick<typeof db, "select">;

/** Read existing settled results. No client win counter and no combat/result-route changes. */
export async function countStoreArenaWins(
  reader: StoreReader, playerId: string, purchasedAt: Date, endsAt: Date,
): Promise<number> {
  const realOpponent = (column: typeof arenaChallengesTable.attackerId | typeof arenaChallengesTable.defenderId) => sql`exists (
    select 1 from ${arenaProfilesTable}
    where ${arenaProfilesTable.id} = ${column} and ${arenaProfilesTable.isBot} = false
  )`;
  const [row] = await reader.select({ wins: sql<number>`count(*)::int` })
    .from(arenaChallengesTable).where(and(
      eq(arenaChallengesTable.status, "completed"),
      inArray(arenaChallengesTable.teamSize, [2, 3]),
      gte(arenaChallengesTable.resolvedAt, purchasedAt),
      lt(arenaChallengesTable.resolvedAt, endsAt),
      or(
        and(eq(arenaChallengesTable.attackerId, playerId), eq(arenaChallengesTable.outcome, "win"),
          realOpponent(arenaChallengesTable.defenderId)),
        and(eq(arenaChallengesTable.defenderId, playerId), eq(arenaChallengesTable.outcome, "loss"),
          realOpponent(arenaChallengesTable.attackerId)),
      ),
    ));
  return row?.wins ?? 0;
}

export async function buildStorePreview(reader: StoreReader, playerId: string | null, now: number) {
  const week = storeWeekAt(now);
  const mode = storeCheckoutMode(process.env.NODE_ENV);
  const purchasesTable = mode === "live" ? storeLivePurchasesTable : storeTestPurchasesTable;
  const claimsTable = mode === "live" ? storeLiveClaimsTable : storeTestClaimsTable;
  const [purchases, claims, unlocks] = playerId ? await Promise.all([
    reader.select().from(purchasesTable).where(eq(purchasesTable.playerId, playerId)),
    reader.select().from(claimsTable).where(eq(claimsTable.playerId, playerId)),
    reader.select({ kind: economyUnlocksTable.kind, itemId: economyUnlocksTable.itemId })
      .from(economyUnlocksTable).where(eq(economyUnlocksTable.playerId, playerId)),
  ]) : [[], [], []];
  const purchase = purchases.find(item => item.offerId === week.offerId && item.passId === week.id);
  const currentClaims = claims.filter(item => item.passId === week.id);
  const wins = purchase && playerId
    ? await countStoreArenaWins(reader, playerId, purchase.purchasedAt, new Date(week.endsAt)) : 0;
  return GetStoreResponse.parse({
    serverTime: new Date(now).toISOString(),
    signedIn: Boolean(playerId),
    testPurchasesEnabled: storeTestFlowsEnabled(process.env.NODE_ENV),
    checkoutMode: mode,
    stripeCheckoutEnabled: mode !== "off" && storeStripeState.ready,
    offers: storeOffersAt(now).map(offer => ({
      ...offer,
      owned: unlocks.some(item => item.kind === offer.kind && item.itemId === offer.itemId) ||
        (mode === "live" && purchases.some(item => item.offerId === offer.id)),
      testOwned: mode === "test" && purchases.some(item => item.offerId === offer.id),
    })),
    pass: {
      id: week.id, templateId: week.template.id, featuredClass: week.template.classId,
      title: week.template.title, description: week.template.description,
      startsAt: new Date(week.startsAt).toISOString(), endsAt: new Date(week.endsAt).toISOString(),
      priceCents: week.template.priceCents, offerId: week.offerId,
      purchasedAt: purchase?.purchasedAt.toISOString() ?? null,
      wins, targetWins: week.template.targetWins,
      rewards: week.template.rewards.map(reward => ({
        ...reward,
        description: mode === "live" && reward.kind === "gold" ? "Gold added to your account when claimed." :
          mode === "live" && reward.kind === "badge" ? "A permanent Rogue Week profile prestige badge." : reward.description,
        state: storeRewardState(reward.wins, wins, Boolean(purchase),
          currentClaims.some(claim => claim.rewardId === reward.id)),
      })),
      claimedGold: currentClaims.reduce((sum, claim) => sum + claim.gold, 0),
    },
    previewBadges: mode === "test" ? [...new Set(claims.filter(claim => claim.kind === "badge").map(claim => claim.itemId))] : [],
    earnedBadges: mode === "live" ? [...new Set(claims.filter(claim => claim.kind === "badge").map(claim => claim.itemId))] : [],
  });
}
