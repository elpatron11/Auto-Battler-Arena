import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const arenaProfilesTable = pgTable("arena_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isBot: boolean("is_bot").notNull().default(false),
  rating: integer("rating").notNull().default(1000),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
  defense: jsonb("defense").$type<Record<string, unknown>>(),
  defenseUpdatedAt: timestamp("defense_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertArenaProfileSchema = createInsertSchema(arenaProfilesTable);
export type InsertArenaProfile = z.infer<typeof insertArenaProfileSchema>;
export type ArenaProfileRecord = typeof arenaProfilesTable.$inferSelect;