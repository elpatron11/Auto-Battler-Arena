import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { arenaChallengesTable } from "./arena-challenges";
import { arenaProfilesTable } from "./arena-profiles";

export const arenaFeaturedMatchesTable = pgTable("arena_featured_matches", {
  playerId: text("player_id").notNull().references(() => arenaProfilesTable.id),
  challengeId: uuid("challenge_id").notNull().references(() => arenaChallengesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.playerId, table.challengeId] }),
  index("arena_featured_matches_player_created_idx").on(table.playerId, table.createdAt),
  index("arena_featured_matches_challenge_idx").on(table.challengeId),
]);

export const arenaNotificationsTable = pgTable("arena_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: text("player_id").notNull().references(() => arenaProfilesTable.id),
  challengeId: uuid("challenge_id").notNull().references(() => arenaChallengesTable.id),
  opponentId: text("opponent_id").notNull().references(() => arenaProfilesTable.id),
  opponentName: text("opponent_name").notNull(),
  direction: text("direction", { enum: ["outgoing", "incoming"] }).notNull(),
  outcome: text("outcome", { enum: ["win", "loss", "draw"] }).notNull(),
  ratingDelta: integer("rating_delta").notNull(),
  gold: integer("gold").notNull().default(0),
  drops: jsonb("drops").$type<Array<{kind: string; itemId: string; duplicate: boolean}>>().notNull().default([]),
  losses: jsonb("losses").$type<Array<{kind: string; itemId: string; listingCancelled: boolean}>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, table => [
  uniqueIndex("arena_notifications_player_challenge_idx").on(table.playerId, table.challengeId),
  index("arena_notifications_player_read_created_idx").on(table.playerId, table.readAt, table.createdAt),
  index("arena_notifications_defense_opponent_idx").on(table.playerId, table.opponentId, table.createdAt),
]);

// Files are detached from challenges before deletion, then retried if the object store is unavailable.
export const arenaReplayGarbageTable = pgTable("arena_replay_garbage", {
  path: text("path").primaryKey(),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
});