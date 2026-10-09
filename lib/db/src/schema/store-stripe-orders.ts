import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** App order associations only; Stripe owns products, prices and payment records. */
export const storeStripeOrdersTable = pgTable("store_stripe_orders", {
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  offerId: text("offer_id").notNull(),
  passId: text("pass_id"),
  priceId: text("price_id").notNull(),
  expectedAmount: integer("expected_amount").notNull(),
  liveMode: boolean("live_mode").notNull().default(false),
  sessionId: text("session_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [
  uniqueIndex("store_stripe_orders_player_offer_idx").on(table.playerId, table.offerId, table.liveMode).where(sql`${table.status} = 'pending'`),
  uniqueIndex("store_stripe_orders_session_idx").on(table.sessionId),
]);
