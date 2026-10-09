import { clerkClient } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import { db, economyUnlocksTable, economyWalletsTable } from "@workspace/db";
import { MAX_GOLD, lockEconomyAccounts } from "./economy";
import { grantPrestigeSkin } from "./prestigeRewards";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const ACCOUNT_GIFT_KIND = "accountGrant";
export const ACCOUNT_GIFT_ID = "verified-owner-gold3000-prestige";
const RECIPIENTS = new Set(["cabaraul@gmail.com", "wedoit72@gmail.com"]);
const eligibility = new Map<string, { value: boolean; expires: number }>();

/** Accept only the server-fetched Clerk user for the authenticated account. */
export function isAccountGiftRecipient(playerId: string, user: {
  id: string;
  emailAddresses: Array<{ emailAddress: string; verification: { status: string } | null }>;
}) {
  return user.id === playerId && user.emailAddresses.some(email =>
    email.verification?.status === "verified" && RECIPIENTS.has(email.emailAddress.toLowerCase()));
}

/** Internal trusted caller only; the receipt and rewards commit or roll back together. */
export async function applyAccountGift(tx: Transaction, playerId: string) {
  const [wallet] = await tx.select().from(economyWalletsTable)
    .where(eq(economyWalletsTable.playerId, playerId));
  if (!wallet) throw new Error("Account gift requires an initialized economy wallet.");
  const receipt = await tx.insert(economyUnlocksTable).values({
    playerId, kind: ACCOUNT_GIFT_KIND, itemId: ACCOUNT_GIFT_ID,
  }).onConflictDoNothing().returning({ id: economyUnlocksTable.id });
  if (!receipt.length) return false;
  if (wallet.gold > MAX_GOLD - 3000) throw new Error("Account gift exceeds the Gold balance limit.");
  await tx.update(economyWalletsTable).set({
    gold: sql`${economyWalletsTable.gold} + 3000`, updatedAt: new Date(),
  }).where(eq(economyWalletsTable.playerId, playerId));
  await grantPrestigeSkin(tx, playerId, "wingedPaladin");
  await grantPrestigeSkin(tx, playerId, "emberLord");
  return true;
}

/** Resolves separate preview/live Clerk IDs at runtime, never from browser profile fields. */
export async function syncAccountGift(playerId: string) {
  const [receipt] = await db.select({ id: economyUnlocksTable.id }).from(economyUnlocksTable)
    .where(and(eq(economyUnlocksTable.playerId, playerId),
      eq(economyUnlocksTable.kind, ACCOUNT_GIFT_KIND), eq(economyUnlocksTable.itemId, ACCOUNT_GIFT_ID)));
  if (receipt) return;
  const cached = eligibility.get(playerId);
  let eligible: boolean;
  if (cached && cached.expires > Date.now()) eligible = cached.value;
  else {
    eligible = isAccountGiftRecipient(playerId, await clerkClient.users.getUser(playerId));
    if (eligibility.size >= 1024) eligibility.clear();
    eligibility.set(playerId, { value: eligible, expires: Date.now() + 5 * 60_000 });
  }
  if (eligible) await db.transaction(async tx => {
    await lockEconomyAccounts(tx, [playerId]);
    await applyAccountGift(tx, playerId);
  });
}