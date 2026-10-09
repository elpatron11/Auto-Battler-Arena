// Opt-in development database check. Every write is rolled back, including
// failure paths. Run: node tests/rankMilestoneLedger.integration.mjs
import { buildSync } from 'esbuild';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';

const dir=fileURLToPath(new URL('../',import.meta.url));
const source=`
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {db,pool,economyWalletsTable,arenaRankMilestonesTable} from '@workspace/db';
import {lockEconomyAccounts} from './src/lib/economy';
import {awardRankMilestones,rankMilestoneReceipt} from './src/lib/arenaRanks';
export async function verify(){
  const playerId='rank-ledger-check-'+randomUUID(),challengeId=randomUUID(),rollback=new Error('intentional rollback');
  try{
    await db.transaction(async tx=>{
      await lockEconomyAccounts(tx,[playerId]);
      await tx.insert(economyWalletsTable).values({playerId,gold:1000});
      await awardRankMilestones(tx,playerId,challengeId,1199,1201);
      await awardRankMilestones(tx,playerId,challengeId,1199,1201);
      await awardRankMilestones(tx,playerId,randomUUID(),1199,1201);
      let [wallet]=await tx.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId,playerId));
      assert.equal(wallet.gold,1100);
      assert.deepEqual(await rankMilestoneReceipt(tx,playerId,challengeId),[{rank:'Silver',gold:100}]);
      await awardRankMilestones(tx,playerId,randomUUID(),1399,1401);
      [wallet]=await tx.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId,playerId));
      assert.equal(wallet.gold,1300);
      const rows=await tx.select().from(arenaRankMilestonesTable).where(eq(arenaRankMilestonesTable.playerId,playerId));
      assert.equal(rows.length,2);
      throw rollback;
    });
  }catch(e){if(e!==rollback)throw e;}
  finally{await pool.end();}
  console.log('PostgreSQL milestone credit, retry, demotion/re-promotion and receipt checks passed; all writes rolled back.');
}`;
const result=buildSync({stdin:{contents:source,resolveDir:dir,sourcefile:'rank-ledger-check.ts',loader:'ts'},bundle:true,
  platform:'node',format:'cjs',write:false,external:['pg-native'],logLevel:'error'});
const filename=dir+'tests/rank-ledger-check.cjs';
const mod=new Module(filename);
mod.filename=filename;mod.paths=createRequire(import.meta.url).resolve.paths('pg');
mod._compile(result.outputFiles[0].text,filename);
await mod.exports.verify();