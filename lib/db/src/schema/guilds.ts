import { pgTable, text, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const guildsTable = pgTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  nameKey: text("name_key").notNull().unique(),
  emblem: text("emblem").notNull(),
  leaderId: text("leader_id").notNull(),
  open: boolean("open").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const guildMembersTable = pgTable("guild_members", {
  playerId: text("player_id").primaryKey(),
  guildId: text("guild_id").notNull().references(() => guildsTable.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});
export const guildInvitesTable = pgTable("guild_invites", {
  guildId: text("guild_id").notNull().references(() => guildsTable.id, { onDelete: "cascade" }),
  playerId: text("player_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, t => [primaryKey({ columns: [t.guildId, t.playerId] })]);
export const guildWarCheckpointsTable = pgTable("guild_war_checkpoints", {
  id: text("id").primaryKey(),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertGuildSchema = createInsertSchema(guildsTable);
export type GuildRecord = typeof guildsTable.$inferSelect;
