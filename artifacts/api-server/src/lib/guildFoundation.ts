import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, guildsTable, guildMembersTable, guildInvitesTable, arenaProfilesTable } from "@workspace/db";
import type { GuildActionInput } from "@workspace/api-zod";

export class GuildError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export async function guildFoundation(playerId: string) {
  const [guilds, members, profiles, invitations] = await Promise.all([
    db.select().from(guildsTable).orderBy(guildsTable.createdAt),
    db.select().from(guildMembersTable),
    db.select({ playerId: arenaProfilesTable.id, name: arenaProfilesTable.name }).from(arenaProfilesTable)
      .where(eq(arenaProfilesTable.isBot, false)),
    db.select().from(guildInvitesTable).where(gt(guildInvitesTable.expiresAt, new Date())),
  ]);
  const own = members.find(m => m.playerId === playerId)?.guildId;
  const names = new Map(profiles.map(p => [p.playerId, p.name]));
  const inviteView = (i: typeof invitations[number]) => ({
    guildId: i.guildId, guildName: guilds.find(g => g.id === i.guildId)?.name ?? "Guild",
    playerId: i.playerId, expiresAt: i.expiresAt.toISOString(),
  });
  return {
    playerId,
    guilds: guilds.map(g => ({ id:g.id, name:g.name, emblem:g.emblem, leaderId:g.leaderId, open:g.open,
      members:members.filter(m => m.guildId === g.id).map(m => ({playerId:m.playerId,name:names.get(m.playerId) ?? "Commander"})) })),
    invitations: invitations.filter(i => i.playerId === playerId).map(inviteView),
    sentInvitations: invitations.filter(i => i.guildId === own && guilds.find(g => g.id === own)?.leaderId === playerId).map(inviteView),
    players: profiles.filter(p => !members.some(m => m.playerId === p.playerId)),
  };
}

export async function actGuild(playerId: string, input: GuildActionInput) {
  await db.transaction(async tx => {
    // Serialize membership changes: protects ten-member cap, leader transitions,
    // concurrent invitation accepts, and uniqueness across different guilds.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(72461001)`);
    const [own] = await tx.select().from(guildMembersTable).where(eq(guildMembersTable.playerId,playerId));
    if (input.action === "create") {
      if (own) throw new GuildError("Leave your current guild before creating another.");
      const name = input.name?.trim();
      if (!name || name.length < 3 || name.length > 24) throw new GuildError("Use a guild name of 3–24 characters.",400);
      const existing = await tx.select().from(guildsTable).where(eq(guildsTable.nameKey,name.toLocaleLowerCase("en-US")));
      if (existing.length) throw new GuildError("That guild name is already taken.");
      const id = randomUUID();
      await tx.insert(guildsTable).values({id,name,nameKey:name.toLocaleLowerCase("en-US"),emblem:input.emblem ?? "lion",leaderId:playerId,open:input.open ?? false});
      await tx.insert(guildMembersTable).values({guildId:id,playerId});
      await tx.delete(guildInvitesTable).where(eq(guildInvitesTable.playerId,playerId));
      return;
    }
    const guildId = input.guildId ?? own?.guildId;
    if (!guildId) throw new GuildError("Choose a guild.",400);
    const [guild] = await tx.select().from(guildsTable).where(eq(guildsTable.id,guildId));
    if (!guild) throw new GuildError("Guild not found.",404);
    const roster = await tx.select().from(guildMembersTable).where(eq(guildMembersTable.guildId,guildId));
    const leader = () => { if(guild.leaderId !== playerId) throw new GuildError("Only the guild leader can do that.",403); };
    const inviteFilter = and(eq(guildInvitesTable.guildId,guildId),eq(guildInvitesTable.playerId,input.playerId ?? playerId));
    if (input.action === "join" || input.action === "accept") {
      if(own) throw new GuildError("You already belong to a guild.");
      if(roster.length >= 10) throw new GuildError("This guild already has ten members.");
      if(input.action === "accept") {
        const [invite] = await tx.select().from(guildInvitesTable)
          .where(and(eq(guildInvitesTable.guildId,guildId),eq(guildInvitesTable.playerId,playerId)));
        if(!invite || invite.expiresAt.getTime() <= Date.now()) throw new GuildError("This invitation has expired.");
      } else if(!guild.open) throw new GuildError("This guild requires an invitation.",403);
      await tx.insert(guildMembersTable).values({guildId,playerId});
      await tx.delete(guildInvitesTable).where(eq(guildInvitesTable.playerId,playerId));
    } else if(input.action === "decline") {
      await tx.delete(guildInvitesTable).where(and(eq(guildInvitesTable.guildId,guildId),eq(guildInvitesTable.playerId,playerId)));
    } else if(input.action === "invite") {
      leader();
      if(roster.length >= 10) throw new GuildError("This guild already has ten members.");
      if(!input.playerId || input.playerId === playerId) throw new GuildError("Choose another player.",400);
      const [target] = await tx.select().from(arenaProfilesTable).where(and(eq(arenaProfilesTable.id,input.playerId),eq(arenaProfilesTable.isBot,false)));
      if(!target) throw new GuildError("Player not found.",404);
      const [membership] = await tx.select().from(guildMembersTable).where(eq(guildMembersTable.playerId,input.playerId));
      if(membership) throw new GuildError("That player already has a guild.");
      await tx.insert(guildInvitesTable).values({guildId,playerId:input.playerId,expiresAt:new Date(Date.now()+7*86400000)})
        .onConflictDoUpdate({target:[guildInvitesTable.guildId,guildInvitesTable.playerId],set:{expiresAt:new Date(Date.now()+7*86400000)}});
    } else if(input.action === "revoke") {
      leader(); await tx.delete(guildInvitesTable).where(inviteFilter);
    } else if(input.action === "transfer") {
      leader();
      if(!input.playerId || input.playerId === playerId || !roster.some(m => m.playerId === input.playerId))
        throw new GuildError("Choose another current guild member.",400);
      await tx.update(guildsTable).set({leaderId:input.playerId}).where(eq(guildsTable.id,guildId));
    } else if(input.action === "kick" || input.action === "leave") {
      const target = input.action === "leave" ? playerId : input.playerId;
      if(input.action === "kick") leader();
      if(!target || !roster.some(m => m.playerId === target)) throw new GuildError("Player is not in this guild.",400);
      if(target === guild.leaderId && roster.length > 1) throw new GuildError("Transfer leadership before leaving.");
      if(input.action === "kick" && target === guild.leaderId) throw new GuildError("The leader cannot be removed.",400);
      await tx.delete(guildMembersTable).where(eq(guildMembersTable.playerId,target));
      if(roster.length === 1) await tx.delete(guildsTable).where(eq(guildsTable.id,guildId));
    } else if(input.action === "update") {
      leader();
      const name = input.name?.trim() ?? guild.name;
      if(name.length < 3 || name.length > 24) throw new GuildError("Use a guild name of 3–24 characters.",400);
      const names = await tx.select().from(guildsTable).where(eq(guildsTable.nameKey,name.toLocaleLowerCase("en-US")));
      if(names.some(g => g.id !== guildId)) throw new GuildError("That guild name is already taken.");
      await tx.update(guildsTable).set({name,nameKey:name.toLocaleLowerCase("en-US"),emblem:input.emblem ?? guild.emblem,open:input.open ?? guild.open})
        .where(eq(guildsTable.id,guildId));
    }
  });
  return guildFoundation(playerId);
}

export async function guildPlayer(playerId:string) {
  const [member] = await db.select().from(guildMembersTable).where(eq(guildMembersTable.playerId,playerId));
  if(!member) throw new GuildError("Join or create a guild first.");
  const [guild] = await db.select().from(guildsTable).where(eq(guildsTable.id,member.guildId));
  const [profile] = await db.select().from(arenaProfilesTable).where(eq(arenaProfilesTable.id,playerId));
  if(!guild || !profile) throw new GuildError("Save your game profile before entering Guild Wars.");
  return {guild,profile};
}
export async function guildMemberIds(guildIds:string[]) {
  return guildIds.length ? db.select().from(guildMembersTable).where(inArray(guildMembersTable.guildId,guildIds)) : [];
}
