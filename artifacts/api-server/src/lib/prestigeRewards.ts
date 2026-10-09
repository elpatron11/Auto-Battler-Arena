import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, arenaProfilesTable, economyUnlocksTable } from "@workspace/db";
import { isPrestigeSkin, prestigeRankSkin, rollPrestigeSkins, type PrestigeSkinId } from "./prestigeRules";
export * from "./prestigeRules";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Resolved from the existing account, never from a client-controlled display name.
const SPECIAL_ACCOUNTS = new Set(["user_3K1dqZTDrTYsc35okpxyTFZikMg"]);

export async function grantPrestigeSkin(tx: Transaction, playerId: string, itemId: PrestigeSkinId) {
  const rows = await tx.insert(economyUnlocksTable).values({playerId, kind:"skin", itemId})
    .onConflictDoNothing().returning({id:economyUnlocksTable.id});
  return rows.length > 0;
}
/** Called only inside the already locked, first-settlement reward transaction. */
export async function awardPrestigeDrops(tx: Transaction, playerId: string, source: "arena" | "dungeon",
  random: () => number = () => randomInt(1_000_000)/1_000_000) {
  const rows = await tx.select({itemId:economyUnlocksTable.itemId}).from(economyUnlocksTable)
    .where(and(eq(economyUnlocksTable.playerId,playerId),eq(economyUnlocksTable.kind,"skin")));
  const awarded: Array<{kind:"skin";itemId:PrestigeSkinId;duplicate:false}> = [];
  for(const itemId of rollPrestigeSkins(source, rows.map(row=>row.itemId),random)) {
    if(await grantPrestigeSkin(tx,playerId,itemId)) awarded.push({kind:"skin",itemId,duplicate:false});
  }
  return awarded;
}
/** Current mode highs and explicit special grants are eligible; browser-held flags are not. */
export async function syncPrestigeEligibility(playerId: string) {
  await db.transaction(async tx => {
    const [player] = await tx.select().from(arenaProfilesTable).where(eq(arenaProfilesTable.id,playerId));
    if (!player || player.isBot) return;
    const grants = SPECIAL_ACCOUNTS.has(playerId) ? ["wingedPaladin","emberLord"] as const :
      [prestigeRankSkin(3,player.rating),prestigeRankSkin(2,player.rating2)];
    for (const skin of grants) if (skin) await grantPrestigeSkin(tx,playerId,skin);
  });
}
export async function sanitizePrestigeEquips(playerId: string, skins: unknown): Promise<Record<string,string>> {
  if (!skins || typeof skins !== "object" || Array.isArray(skins)) return {};
  const owned = await db.select({itemId:economyUnlocksTable.itemId}).from(economyUnlocksTable)
    .where(and(eq(economyUnlocksTable.playerId,playerId),eq(economyUnlocksTable.kind,"skin")));
  return Object.fromEntries(Object.entries(skins).filter(([cls,id]) => typeof id === "string" &&
    (!isPrestigeSkin(id) || (owned.some(row=>row.itemId===id) &&
      ((cls==="paladin"&&id==="wingedPaladin")||(cls==="warrior"&&id==="emberLord"))))));
}