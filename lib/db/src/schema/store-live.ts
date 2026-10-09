import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** Real entitlements only. Historical preview receipts never populate these tables. */
export const storeLivePurchasesTable = pgTable("store_live_purchases", {
  playerId: text("player_id").notNull(),
  offerId: text("offer_id").notNull(),
  passId: text("pass_id"),
  orderId: text("order_id").notNull().unique(),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.playerId, table.offerId] })]);

export const storeLiveClaimsTable = pgTable("store_live_claims", {
  playerId: text("player_id").notNull(),
  passId: text("pass_id").notNull(),
  rewardId: text("reward_id").notNull(),
  kind: text("kind").notNull(),
  itemId: text("item_id").notNull(),
  gold: integer("gold").notNull().default(0),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.playerId, table.passId, table.rewardId] }),
  index("store_live_claims_player_kind_idx").on(table.playerId, table.kind),
]);
