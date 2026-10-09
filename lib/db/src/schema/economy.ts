import { pgTable, text, integer, timestamp, uuid, index, uniqueIndex, jsonb, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const economyWalletsTable = pgTable("economy_wallets", {
  playerId: text("player_id").primaryKey(),
  gold: integer("gold").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("economy_wallets_gold_nonnegative_check", sql`${table.gold} >= 0`),
]);

export const economyUnlocksTable = pgTable("economy_unlocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: text("player_id").notNull(),
  kind: text("kind").notNull(),
  itemId: text("item_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("economy_unlocks_player_kind_item_unique").on(table.playerId, table.kind, table.itemId),
  index("economy_unlocks_player_idx").on(table.playerId),
]);

export const economyDuplicatesTable = pgTable("economy_duplicates", {
  playerId: text("player_id").notNull(),
  kind: text("kind").notNull(),
  itemId: text("item_id").notNull(),
  quantity: integer("quantity").notNull().default(0),
}, (table) => [
  uniqueIndex("economy_duplicates_player_kind_item_unique").on(table.playerId, table.kind, table.itemId),
  check("economy_duplicates_quantity_nonnegative_check", sql`${table.quantity} >= 0`),
]);

export const economyListingsTable = pgTable("economy_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: text("seller_id").notNull(),
  kind: text("kind").notNull(),
  itemId: text("item_id").notNull(),
  price: integer("price").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("economy_listings_created_idx").on(table.createdAt),
  index("economy_listings_seller_idx").on(table.sellerId),
  check("economy_listings_price_positive_check", sql`${table.price} > 0`),
]);

export const arenaEconomyRewardsTable = pgTable("arena_economy_rewards", {
  challengeId: uuid("challenge_id").primaryKey(),
  playerId: text("player_id").notNull(),
  opponentId: text("opponent_id").notNull(),
  outcome: text("outcome").notNull(),
  gold: integer("gold").notNull(),
  rankUp: text("rank_up"),
  drops: jsonb("drops").$type<Array<{kind: string; itemId: string; duplicate: boolean}>>().notNull().default([]),
  losses: jsonb("losses").$type<Array<{kind: string; itemId: string; listingCancelled: boolean}>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("arena_economy_rewards_opponents_idx").on(table.playerId, table.opponentId, table.createdAt),
]);

export const economyMigrationsTable = pgTable("economy_migrations", {
  playerId: text("player_id").primaryKey(),
  status: text("status").notNull(),
  onboardingSelection: jsonb("onboarding_selection").$type<{ classIds: string[]; racialId: string } | null>(),
  legacyTournamentWins: integer("legacy_tournament_wins").notNull().default(0),
  legacyTournamentEntries: integer("legacy_tournament_entries").notNull().default(0),
  legacyTournamentHistory: jsonb("legacy_tournament_history").$type<unknown[]>().notNull().default([]),
  migratedAt: timestamp("migrated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const economyTournamentRunsTable = pgTable("economy_tournament_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id").notNull().unique(),
  playerId: text("player_id").notNull(),
  attack: jsonb("attack").$type<Record<string, unknown>>().notNull(),
  placement: text("placement", { enum: ["champion", "runner_up", "eliminated"] }).notNull(),
  prize: integer("prize").notNull().default(0),
  state: text("state", { enum: ["entered", "finished"] }).notNull().default("entered"),
  history: jsonb("history").$type<Array<{
    round: string;
    playerA: string;
    playerB: string;
    playerAName: string;
    playerBName: string;
    playerASnapshot: Record<string, unknown>;
    playerBSnapshot: Record<string, unknown>;
    winner: string;
    outcome: string;
    scoreA: number;
    scoreB: number;
  }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  index("economy_tournament_runs_player_created_idx").on(table.playerId, table.createdAt),
]);