import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  check,
  index,
  integer,
  pgTable,
  boolean,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { arenaProfilesTable } from "./arena-profiles";

export const hourlyDungeonAttemptsTable = pgTable("hourly_dungeon_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: text("player_id").notNull().references(() => arenaProfilesTable.id),
  requestId: uuid("request_id").notNull(),
  cycle: integer("cycle").notNull(),
  encounterId: text("encounter_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  outcome: text("outcome"),
  awarded: boolean("awarded").notNull().default(false),
  gold: integer("gold").notNull().default(0),
}, (table) => [
  unique("hourly_dungeon_attempts_player_request_unique").on(table.playerId, table.requestId),
  index("hourly_dungeon_attempts_player_cycle_idx").on(table.playerId, table.cycle),
  check("hourly_dungeon_attempts_encounter_check", sql`encounter_id IN ('frost', 'demon', 'temple')`),
  check("hourly_dungeon_attempts_outcome_check", sql`outcome IS NULL OR outcome IN ('win', 'loss', 'abandoned')`),
]);

export const hourlyDungeonCompletionsTable = pgTable("hourly_dungeon_completions", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: text("player_id").notNull().references(() => arenaProfilesTable.id),
  cycle: integer("cycle").notNull(),
  encounterId: text("encounter_id").notNull(),
  attemptId: uuid("attempt_id").notNull().references(() => hourlyDungeonAttemptsTable.id),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("hourly_dungeon_completions_player_cycle_unique").on(table.playerId, table.cycle),
  unique("hourly_dungeon_completions_attempt_unique").on(table.attemptId),
  index("hourly_dungeon_completions_cycle_idx").on(table.cycle),
  check("hourly_dungeon_completions_encounter_check", sql`encounter_id IN ('frost', 'demon', 'temple')`),
]);

export const insertHourlyDungeonAttemptSchema = createInsertSchema(hourlyDungeonAttemptsTable);
export const insertHourlyDungeonCompletionSchema = createInsertSchema(hourlyDungeonCompletionsTable);
export type InsertHourlyDungeonAttempt = z.infer<typeof insertHourlyDungeonAttemptSchema>;
export type InsertHourlyDungeonCompletion = z.infer<typeof insertHourlyDungeonCompletionSchema>;
export type HourlyDungeonAttemptRecord = typeof hourlyDungeonAttemptsTable.$inferSelect;
export type HourlyDungeonCompletionRecord = typeof hourlyDungeonCompletionsTable.$inferSelect;