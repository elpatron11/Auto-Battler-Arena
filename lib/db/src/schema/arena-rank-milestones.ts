import { pgTable, text, integer, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

// Separate from editable profile state and tradable inventory.
export const arenaRankMilestonesTable = pgTable("arena_rank_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: text("player_id").notNull(),
  rank: text("rank").notNull(),
  gold: integer("gold").notNull(),
  challengeId: uuid("challenge_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("arena_rank_milestones_player_rank_unique").on(table.playerId, table.rank),
  index("arena_rank_milestones_challenge_idx").on(table.challengeId),
]);