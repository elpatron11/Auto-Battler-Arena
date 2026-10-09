import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { arenaProfilesTable } from "./arena-profiles";

export const economyLocalMatchesTable = pgTable("economy_local_matches", {
  id: uuid("id").primaryKey(),
  playerId: text("player_id").notNull().references(() => arenaProfilesTable.id),
  outcome: text("outcome"),
  gold: integer("gold").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, table => [
  index("economy_local_matches_player_completed_idx").on(table.playerId, table.completedAt),
]);

export const insertEconomyLocalMatchSchema = createInsertSchema(economyLocalMatchesTable);
export type EconomyLocalMatch = typeof economyLocalMatchesTable.$inferSelect;