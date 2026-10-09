import assert from 'node:assert/strict';
import {test} from 'node:test';
import {prestigeRules as rules} from './prestigeFixture.mjs';
test('Gladiator unlocks the correct class at exactly 2400 RP, independently per mode',()=>{
  assert.equal(rules.prestigeRankSkin(3,2399),null);
  assert.equal(rules.prestigeRankSkin(2,2399),null);
  assert.equal(rules.prestigeRankSkin(3,2400),'wingedPaladin');
  assert.equal(rules.prestigeRankSkin(2,2400),'emberLord');
  assert.equal(rules.prestigeRankSkin(2,2800),'emberLord');
  assert.equal(rules.prestigeRankSkin(3,NaN),null);
});
test('rare rolls use exact 0.3% Dungeon / 0.2% Arena thresholds, not 30% / 20%',()=>{
  for(const [source,threshold] of [['dungeon',.003],['arena',.002]]){
    assert.equal(rules.rollPrestigeSkins(source,[],()=>threshold-0.000001).length,2);
    assert.equal(rules.rollPrestigeSkins(source,[],()=>threshold).length,0);
    assert.equal(rules.rollPrestigeSkins(source,[],()=>.1).length,0);
    assert.equal(rules.rollPrestigeSkins(source,[],()=>.99).length,0);
  }
});
test('skins roll independently; already owned skins never grant duplicates or use RNG',()=>{
  const values=[.001,.9];let calls=0;
  assert.deepEqual([...rules.rollPrestigeSkins('arena',[],()=>values[calls++])],['wingedPaladin']);
  assert.equal(calls,2);
  calls=0;
  assert.deepEqual([...rules.rollPrestigeSkins('dungeon',['wingedPaladin'],()=>{calls++;return 0;})],['emberLord']);
  assert.equal(calls,1);
  assert.equal(rules.rollPrestigeSkins('arena',['wingedPaladin','emberLord'],()=>{throw Error('owned skins must not reroll');}).length,0);
});