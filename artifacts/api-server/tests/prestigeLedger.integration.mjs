// All test ledger writes are isolated and rolled back even on failure.
import {buildSync} from 'esbuild';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../',import.meta.url));
const source=`
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {db,pool,economyUnlocksTable,economyWalletsTable} from '@workspace/db';
import {applyAccountGift,isAccountGiftRecipient,ACCOUNT_GIFT_KIND} from './src/lib/accountGifts';
import {awardRankMilestones} from './src/lib/arenaRanks';
import {awardPrestigeDrops} from './src/lib/prestigeRewards';
export async function verify(){
  const owner='prestige-ledger-'+randomUUID(),dropOwner='prestige-roll-'+randomUUID();
  const rollback=new Error('intentional rollback');
  const verified=email=>({id:owner,emailAddresses:[{emailAddress:email,verification:{status:'verified'}}]});
  assert.equal(isAccountGiftRecipient(owner,verified('cabaraul@gmail.com')),true);
  assert.equal(isAccountGiftRecipient(owner,verified('WEDOIT72@gmail.com')),true);
  assert.equal(isAccountGiftRecipient(owner,verified('someone-else@gmail.com')),false);
  assert.equal(isAccountGiftRecipient('different-id',verified('wedoit72@gmail.com')),false);
  assert.equal(isAccountGiftRecipient(owner,{id:owner,emailAddresses:[{emailAddress:'wedoit72@gmail.com',verification:{status:'unverified'}}]}),false);
  try{
    await db.transaction(async tx=>{
      const read=async id=>await tx.select().from(economyUnlocksTable).where(eq(economyUnlocksTable.playerId,id));
      await awardRankMilestones(tx,owner,randomUUID(),2399,2400,3);
      assert.deepEqual((await read(owner)).map(row=>row.itemId),['wingedPaladin']);
      await awardRankMilestones(tx,owner,randomUUID(),2399,2400,3);
      assert.equal((await read(owner)).length,1);
      await awardRankMilestones(tx,owner,randomUUID(),2399,2400,2);
      assert.equal((await read(owner)).length,2);
      assert.equal((await awardPrestigeDrops(tx,dropOwner,'dungeon',()=>0)).length,2);
      assert.equal((await read(dropOwner)).length,2);
      assert.equal((await awardPrestigeDrops(tx,dropOwner,'arena',()=>{throw Error('owned skins must not reroll')})).length,0);
      assert.equal((await read(dropOwner)).length,2);
      assert.ok((await read(dropOwner)).every(row=>row.kind==='skin'));
      await tx.insert(economyWalletsTable).values({playerId:dropOwner,gold:100});
      assert.equal(await applyAccountGift(tx,dropOwner),true);
      assert.equal(await applyAccountGift(tx,dropOwner),false);
      const [giftWallet]=await tx.select().from(economyWalletsTable).where(eq(economyWalletsTable.playerId,dropOwner));
      assert.equal(giftWallet.gold,3100,'Gold credited exactly once');
      assert.equal((await read(dropOwner)).filter(row=>row.kind==='skin').length,2,'existing skins do not duplicate');
      assert.equal((await read(dropOwner)).filter(row=>row.kind===ACCOUNT_GIFT_KIND).length,1,'one durable receipt');
      throw rollback;
    });
  }catch(e){if(e!==rollback)throw e;}
  finally{await pool.end();}
  console.log('Prestige mode isolation, permanent ledger grants, rare-drop insertion and duplicate prevention passed; test writes rolled back.');
}`;
const result=buildSync({stdin:{contents:source,resolveDir:dir,sourcefile:'prestige-ledger-check.ts',loader:'ts'},bundle:true,
  platform:'node',format:'cjs',write:false,external:['pg-native'],logLevel:'error'});
const filename=dir+'tests/prestige-ledger-check.cjs',mod=new Module(filename);
mod.filename=filename;mod.paths=createRequire(import.meta.url).resolve.paths('pg');
mod._compile(result.outputFiles[0].text,filename);
await mod.exports.verify();