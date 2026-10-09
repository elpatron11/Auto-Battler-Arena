import {transformSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const module={exports:{}};
vm.runInNewContext(transformSync(readFileSync(new URL('../src/lib/prestigeRules.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports});
export const prestigeRules=module.exports;
// Existing route harnesses isolate settlement from the real database and RNG.
// Real entitlement insertion and rank grants are exercised by prestigeLedger.integration.mjs.
export const prestigeFixture={
  ...prestigeRules,
  awardPrestigeDrops:async()=>[],
  grantPrestigeSkin:async()=>true,
  sanitizePrestigeEquips:async(_id,skins)=>skins||{},
};