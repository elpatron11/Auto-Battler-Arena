import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { arenaProfilesTable } from "./arena-profiles";

export type ArenaHeroStatsRecord = {
  classId: string;
  name: string;
  damage: number;
  healing: number;
  kills: number;
  deaths: number;
  assists: number;
  cc: number;
  prevented: number;
  reflected: number;
  aoe: number;
  dot: number;
  pet: number;
  selfHeal: number;
  shielding: number;
  survival: number;
};
export type ArenaMatchSummaryRecord = {
  durationSeconds: number;
  player: ArenaHeroStatsRecord[];
  enemy: ArenaHeroStatsRecord[];
};

export const arenaChallengesTable = pgTable("arena_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  attackerId: text("attacker_id").notNull().references(() => arenaProfilesTable.id),
  defenderId: text("defender_id").notNull().references(() => arenaProfilesTable.id),
  attack: jsonb("attack").$type<Record<string, unknown>>().notNull(),
  defense: jsonb("defense").$type<Record<string, unknown>>().notNull(),
  status: text("status").notNull().default("pending"),
  outcome: text("outcome"),
  localOutcome: text("local_outcome"),
  attackerRatingDelta: integer("attacker_rating_delta").notNull().default(0),
  summary: jsonb("summary").$type<ArenaMatchSummaryRecord>(),
  recordingUploadPath: text("recording_upload_path"),
  recordingPath: text("recording_path"),
  recordingContentType: text("recording_content_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  index("arena_challenges_attacker_created_idx").on(table.attackerId, table.createdAt),
  index("arena_challenges_attacker_defender_created_idx").on(table.attackerId, table.defenderId, table.createdAt),
  index("arena_challenges_defender_created_idx").on(table.defenderId, table.createdAt),
]);

export const insertArenaChallengeSchema = createInsertSchema(arenaChallengesTable);
export type InsertArenaChallenge = z.infer<typeof insertArenaChallengeSchema>;
export type ArenaChallengeRecord = typeof arenaChallengesTable.$inferSelect;