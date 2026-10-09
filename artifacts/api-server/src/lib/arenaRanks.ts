import { and, eq } from "drizzle-orm";
import { db, arenaRankMilestonesTable, economyWalletsTable } from "@workspace/db";
import { boundedGoldCredit } from "./economy";
import { grantPrestigeSkin, prestigeRankSkin } from "./prestigeRewards";
export const ARENA_RANKS = [
  {name:"Bronze",minimum:0,gold:0,divisions:3,color:"#c68b60"},
  {name:"Silver",minimum:1200,gold:100,divisions:3,color:"#c7d2e1"},
  {name:"Gold",minimum:1400,gold:200,divisions:3,color:"#ffd166"},
  {name:"Platinum",minimum:1600,gold:350,divisions:3,color:"#72ddd3"},
  {name:"Diamond",minimum:1800,gold:500,divisions:3,color:"#85bfff"},
  {name:"Master",minimum:2000,gold:750,divisions:1,color:"#c494ff"},
  {name:"Grandmaster",minimum:2200,gold:1000,divisions:1,color:"#ff787f"},
  {name:"Gladiator",minimum:2400,gold:0,divisions:1,color:"#ffd568"},
] as const;

export function crossedRankMilestones(before: number, after: number) {
  return ARENA_RANKS.filter(rank => rank.gold > 0 && before < rank.minimum && after >= rank.minimum);
}
export function arenaRankLabel(rating: number) {
  let index = 0;
  for(let i=0;i<ARENA_RANKS.length;i++)if(rating>=ARENA_RANKS[i].minimum)index=i;
  const rank=ARENA_RANKS[index], next=ARENA_RANKS[index+1];
  if(rank.divisions===1||!next)return rank.name;
  const step=Math.min(2,Math.max(0,Math.floor((rating-rank.minimum)/((next.minimum-rank.minimum)/3))));
  return `${rank.name} ${["III","II","I"][step]}`;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function awardRankMilestones(tx: Transaction, playerId: string, challengeId: string, before: number, after: number, teamSize:2|3=3) {
  const skin = prestigeRankSkin(teamSize, after);
  if (skin) await grantPrestigeSkin(tx, playerId, skin);
  const candidates = crossedRankMilestones(before, after);
  if (!candidates.length) return;
  // Caller holds account locks and rating row locks. The unique key is the
  // second defense against parallel results, retries, and demotion/re-promotion.
  await tx.insert(economyWalletsTable).values({playerId}).onConflictDoNothing();
  const [wallet] = await tx.select().from(economyWalletsTable)
    .where(eq(economyWalletsTable.playerId, playerId)).for("update");
  let balance = wallet.gold;
  for (const rank of candidates) {
    const gold = boundedGoldCredit(balance, rank.gold);
    if (!gold) continue;
    const inserted = await tx.insert(arenaRankMilestonesTable).values({
      playerId, challengeId, rank: teamSize===2 ? `2v2:${rank.name}` : rank.name, gold,
    }).onConflictDoNothing().returning();
    if (inserted.length) balance += gold;
  }
  if (balance !== wallet.gold) await tx.update(economyWalletsTable).set({gold:balance})
    .where(eq(economyWalletsTable.playerId, playerId));
}

export async function rankMilestoneReceipt(tx: Transaction, playerId: string, challengeId: string) {
  const rows=await tx.select({rank:arenaRankMilestonesTable.rank, gold:arenaRankMilestonesTable.gold})
    .from(arenaRankMilestonesTable).where(and(
      eq(arenaRankMilestonesTable.playerId, playerId), eq(arenaRankMilestonesTable.challengeId, challengeId)));
  return rows.map(row=>({...row,rank:row.rank.replace(/^2v2:/,"")}));
}