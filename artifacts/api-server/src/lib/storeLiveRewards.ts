import { and, eq } from "drizzle-orm";
import { db, economyUnlocksTable, economyWalletsTable, storeLiveClaimsTable, storeLivePurchasesTable } from "@workspace/db";
import { boundedGoldCredit, lockEconomyAccounts } from "./economy";
import { buildStorePreview, countStoreArenaWins } from "./storePreview";
import { storeWeekAt } from "./storeRules";

/** Atomic, once-per-milestone real grants; independent of every preview receipt. */
export async function claimLiveStoreReward(playerId: string, passId: string, rewardId: string) {
  return db.transaction(async tx => {
    await lockEconomyAccounts(tx, [playerId]);
    const now = Date.now(), week = storeWeekAt(now);
    if (passId !== week.id) return { error: "This weekly pass has ended.", status: 410 } as const;
    const reward = week.template.rewards.find(item => item.id === rewardId);
    if (!reward) return { error: "Unknown reward.", status: 400 } as const;
    const [purchase] = await tx.select().from(storeLivePurchasesTable).where(and(
      eq(storeLivePurchasesTable.playerId, playerId), eq(storeLivePurchasesTable.offerId, week.offerId),
      eq(storeLivePurchasesTable.passId, week.id)));
    if (!purchase) return { error: "Purchase this week's paid pass first.", status: 409 } as const;
    const [existing] = await tx.select().from(storeLiveClaimsTable).where(and(
      eq(storeLiveClaimsTable.playerId, playerId), eq(storeLiveClaimsTable.passId, week.id),
      eq(storeLiveClaimsTable.rewardId, rewardId)));
    if (existing) return buildStorePreview(tx, playerId, now);
    const wins = await countStoreArenaWins(tx, playerId, purchase.purchasedAt, new Date(week.endsAt));
    if (wins < reward.wins) return { error: "Earn the required Arena victories first.", status: 409 } as const;
    if (reward.kind === "gold") {
      const [wallet] = await tx.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId, playerId));
      if (!wallet || boundedGoldCredit(wallet.gold, reward.gold) !== reward.gold)
        return { error: "Your Gold balance cannot receive this reward yet.", status: 409 } as const;
      await tx.update(economyWalletsTable).set({ gold: wallet.gold + reward.gold, updatedAt: new Date(now) })
        .where(eq(economyWalletsTable.playerId, playerId));
    } else if (reward.kind !== "badge") {
      await tx.insert(economyUnlocksTable).values({ playerId, kind: reward.kind, itemId: reward.itemId }).onConflictDoNothing();
    }
    await tx.insert(storeLiveClaimsTable).values({
      playerId, passId, rewardId, kind: reward.kind, itemId: reward.itemId, gold: reward.gold,
    });
    return buildStorePreview(tx, playerId, now);
  });
}
