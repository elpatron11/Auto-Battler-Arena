import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db,pool,arenaProfilesTable,guildMembersTable,guildsTable,guildInvitesTable } from "@workspace/db";
import { eq,inArray } from "drizzle-orm";
import { actGuild,guildFoundation } from "../src/lib/guildFoundation";

async function verify(){
  const prefix=`guild-test-${randomUUID()}`,ids=Array.from({length:15},(_,i)=>`${prefix}-${i}`);
  let guildIds:string[]=[];
  try{
    await db.insert(arenaProfilesTable).values(ids.map((id,i)=>({id,name:`Guild fixture ${i}`})));
    const create=await actGuild(ids[0],{action:"create",name:prefix.slice(0,24),emblem:"raven"});
    const guild=create.guilds.find(g=>g.leaderId===ids[0])!;guildIds.push(guild.id);
    assert.equal(guild.members.length,1);
    await assert.rejects(actGuild(ids[1],{action:"create",name:guild.name.toUpperCase(),emblem:"lion"}),/taken/);
    await assert.rejects(actGuild(ids[1],{action:"join",guildId:guild.id}),/invitation/);
    await assert.rejects(actGuild(ids[1],{action:"update",guildId:guild.id,name:"Not allowed"}),/leader/);
    await actGuild(ids[0],{action:"invite",guildId:guild.id,playerId:ids[1]});
    assert.equal((await guildFoundation(ids[1])).invitations.length,1);
    assert.equal((await guildFoundation(ids[2])).sentInvitations.length,0);
    await actGuild(ids[1],{action:"decline",guildId:guild.id});
    assert.equal((await guildFoundation(ids[1])).invitations.length,0);
    await actGuild(ids[0],{action:"invite",guildId:guild.id,playerId:ids[1]});
    await actGuild(ids[1],{action:"accept",guildId:guild.id});
    await assert.rejects(actGuild(ids[0],{action:"leave",guildId:guild.id}),/Transfer/);
    await actGuild(ids[0],{action:"transfer",guildId:guild.id,playerId:ids[1]});
    await assert.rejects(actGuild(ids[0],{action:"kick",guildId:guild.id,playerId:ids[1]}),/leader/);
    await actGuild(ids[1],{action:"kick",guildId:guild.id,playerId:ids[0]});
    await actGuild(ids[1],{action:"update",guildId:guild.id,open:true,name:`QA ${prefix.slice(-12)}`,emblem:"oak"});
    // Ten concurrent joins with nine slots left: exactly nine successes.
    const joins=await Promise.allSettled(ids.slice(2,12).map(id=>actGuild(id,{action:"join",guildId:guild.id})));
    assert.equal(joins.filter(r=>r.status==="fulfilled").length,9);
    assert.equal((await guildFoundation(ids[1])).guilds.find(g=>g.id===guild.id)!.members.length,10);
    await assert.rejects(actGuild(ids[1],{action:"invite",guildId:guild.id,playerId:ids[12]}),/ten/);
    const second=await actGuild(ids[12],{action:"create",name:`Other ${prefix.slice(-12)}`,emblem:"moon",open:true});
    const g2=second.guilds.find(g=>g.leaderId===ids[12])!;guildIds.push(g2.id);
    // Same account races joining two guilds; primary-key+serialized transactions
    // enforce a single membership even across different guild rows.
    await actGuild(ids[1],{action:"kick",guildId:guild.id,playerId:ids[2]});
    const races=await Promise.allSettled([actGuild(ids[13],{action:"join",guildId:guild.id}),actGuild(ids[13],{action:"join",guildId:g2.id})]);
    assert.equal(races.filter(r=>r.status==="fulfilled").length,1);
    await actGuild(ids[12],{action:"invite",guildId:g2.id,playerId:ids[14]});
    await actGuild(ids[12],{action:"revoke",guildId:g2.id,playerId:ids[14]});
    await assert.rejects(actGuild(ids[14],{action:"accept",guildId:g2.id}),/expired/);
    await actGuild(ids[12],{action:"invite",guildId:g2.id,playerId:ids[14]});
    await db.update(guildInvitesTable).set({expiresAt:new Date(0)}).where(eq(guildInvitesTable.playerId,ids[14]));
    await assert.rejects(actGuild(ids[14],{action:"accept",guildId:g2.id}),/expired/);
    console.info("Guild foundation: create/update/invite/accept/decline/revoke/leave/kick/transfer, expiry, permissions, 10-member concurrency and one-guild race passed.");
  }finally{
    // Only our randomly prefixed fixtures; genuine player rows are untouched.
    if(guildIds.length)await db.delete(guildsTable).where(inArray(guildsTable.id,guildIds));
    await db.delete(guildMembersTable).where(inArray(guildMembersTable.playerId,ids));
    await db.delete(arenaProfilesTable).where(inArray(arenaProfilesTable.id,ids));
    await pool.end();
  }
}
void verify().catch(error=>{console.error(error);process.exitCode=1;});
