import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** Isolated scaffolding. These records are NOT payment receipts or economy entitlements. */
export const storeTestPurchasesTable = pgTable("store_test_purchases", {
  playerId: text("player_id").notNull(),
  offerId: text("offer_id").notNull(),
  passId: text("pass_id"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.playerId, table.offerId] }),
]);

export const storeTestClaimsTable = pgTable("store_test_claims", {
  playerId: text("player_id").notNull(),
  passId: text("pass_id").notNull(),
  rewardId: text("reward_id").notNull(),
  kind: text("kind").notNull(),
  itemId: text("item_id").notNull(),
  gold: integer("gold").notNull().default(0),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.playerId, table.passId, table.rewardId] }),
  index("store_test_claims_player_kind_idx").on(table.playerId, table.kind),
]);

export const insertStoreTestPurchaseSchema = createInsertSchema(storeTestPurchasesTable);
export const insertStoreTestClaimSchema = createInsertSchema(storeTestClaimsTable);
export type InsertStoreTestPurchase = z.infer<typeof insertStoreTestPurchaseSchema>;
export type InsertStoreTestClaim = z.infer<typeof insertStoreTestClaimSchema>;
