import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../public/game.html', import.meta.url),'utf8');
test('the visual pass preserves every non-renderer statement in the original game', () => {
  // Captured before this visual-only pass. Independent gameplay/UI requests may
  // intentionally change this baseline; never update it to hide a visual-pass mutation.
  // Rebaselined for the independently requested shared wall sliding, intent-only
  // recovery and strong manual focus commands. The original/current hashes were
  // verified identical outside those changes. Keep all non-renderer statements
  // protected here, including the new gameplay behavior.
   // Responsive framing is independently tested in mobilePresentation.test.mjs.
   // Its exclusion was checked against the pre-change source: both yield the
   // same remaining statements and hash, so gameplay protection is intact.
   // Radiant Strike's optional manual enemy argument is independently covered
   // by timing/damage tests; excluding it yields identical pre/post baselines.
   const excluded = new Set(['drawHeroBody','drawEntity','drawEffects','render','drawRosterPreviewDeath','castRadiantStrike']);
  const statements=[];
  // Presentation hooks are the only permitted additions to the bridge.
  // The requested duo integration changes only four bridge size/snapshot
  // checks. Normalize those exact additions to the prior 3v3 bridge so the
  // ORIGINAL protected gameplay hash stays intact rather than rebaselining it.
  const rankedBridgeBaseline=source
    .replace("  const realTeams=window.RealPlayerTournament?.teams(tournamentServerReceipt);\n  if(!realTeams){showUnlockToast('Could not load the saved real-player squads. Your server tournament remains available for recovery.');return;}\n  const {you,teams}=realTeams;",
      "  const pool=aiRivals.slice().sort(()=>Math.random()-.5).slice(0,5);\n  const you={name:playerProfile.name||'Your Team',roster:selected.slice(),abilities:Object.assign({},abilityChoice),ults:Object.assign({},ultChoice),isPlayer:true,rating:playerProfile.rating||1000,tournamentWins:playerProfile.tournamentWins||0};\n  const teams=[you,...pool.map(makeAITeamFromRival)].sort(()=>Math.random()-.5);")
    .replace("const snapshot=[2,3].includes(selected.length) ?\n       currentDefenseSnapshot()||(playerProfile&&(selected.length===2?playerProfile.defenseTeam2:playerProfile.defenseTeam))||null : null;",
      "const snapshot=currentDefenseSnapshot()||(playerProfile&&playerProfile.defenseTeam)||null;")
    .replace("if(!Array.isArray(d.heroes)||![2,3].includes(d.heroes.length))return;",
      "if(!Array.isArray(d.heroes)||d.heroes.length!==3)return;")
    .replace("if(attack&&Array.isArray(attack.heroes)&&attack.heroes.length===d.heroes.length){\n       setTeamSize(d.heroes.length);",
      "if(attack&&Array.isArray(attack.heroes)&&attack.heroes.length===3){\n       setTeamSize(3);")
    .replace("     setTeamSize(d.heroes.length);\n      startBattle({onlineChallenge:true,",
      "     setTeamSize(3);\n      startBattle({onlineChallenge:true,");
  const baseline=rankedBridgeBaseline.replace(/^[ \t]*window\.MatchRewards\?\.show\([^\n]+\);\r?\n/gm,'')
    .replace(/^[ \t]*queueMicrotask\(\(\)=>window\.MatchRewards\?\.show\([^\n]+\);\r?\n/gm,'');
  for(const match of baseline.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
     if(match[0].startsWith('<script id="landscape-battle-fit-script"'))continue;
    if(!match[1].trim())continue;
    const file=ts.createSourceFile('game.js',match[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    assert.equal(file.parseDiagnostics.length,0);
    for(const statement of file.statements){
      if(ts.isFunctionDeclaration(statement) && excluded.has(statement.name?.text))continue;
      statements.push(statement.getText(file));
    }
  }
   assert.equal(statements.length,760);
  assert.equal(createHash('sha256').update(JSON.stringify(statements)).digest('hex'),
     '19c43e391cb5a4876ba528b639be4554146e55e0198e20eb9f0549aa827be33c');
});

test('Radiant Strike changes only optional manual targeting, preserving its entire AUTO body', () => {
  let originalShape;
  for (const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    const file = ts.createSourceFile('game.js', match[1], ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const node = file.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'castRadiantStrike');
    if (node) originalShape = node.getText(file)
      .replace('function castRadiantStrike(e, manualEnemy, manualAlly)', 'function castRadiantStrike(e)')
      .replace('const lowAlly = arguments.length > 2 ? manualAlly : lowestHpAlly(e, true);', 'const lowAlly = lowestHpAlly(e, true);')
      .replace('const enemy = arguments.length > 1 ? manualEnemy : findNearestEnemy(e);', 'const enemy = findNearestEnemy(e);');
  }
  assert.ok(originalShape);
  assert.equal(createHash('sha256').update(originalShape).digest('hex'),
    'a050d636951226cd53e30f72dd95e50b9e20e2daa72cb102e3986054525798c4');
});

function preview(search) {
  const messages=[],listeners={};
  const parent={postMessage:msg=>messages.push(msg)};
  const context={URLSearchParams,location:{search,origin:'https://preview.test'},parent,
    document:{documentElement:{dataset:{}}},addEventListener:(name,handler)=>listeners[name]=handler,
    RosterPolishMotion:{reset(){}},RosterPolishArt:{cacheStats:()=>({entries:0}),clearCache(){}},
    RosterPolishVfx:{metrics:{effects:0}}};
  context.window=context;
  vm.runInNewContext(readFileSync(new URL('../public/roster-polish-preview.js',import.meta.url),'utf8'),context);
  return {api:context.RosterVisualPreview,context,messages,listeners,parent};
}

test('death ghosts retain living size and ability colors; form collapse never changes combat data', () => {
  let helper;
  for(const match of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
    const file=ts.createSourceFile('game.js',match[1],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    helper ||= file.statements.find(s=>ts.isFunctionDeclaration(s) && s.name?.text==='drawRosterPreviewDeath')?.getText(file);
  }
  assert.ok(helper);
  const calls=[],scales=[],turns=[];
  const ctx={save(){},restore(){},translate(){},scale:(x,y)=>scales.push([x,y]),rotate:v=>turns.push(v)};
  const context={ctx,CLASS_COLOR:{druid:'#65934c',priest:'#e7dbbd'},performance:{now:()=>2000},
    window:{RosterPolishArt:{},RosterPolishMotion:{pose:()=>({ghost:{dead:true,tilt:.4},fade:.6})}},
    drawHeroBody:(...args)=>calls.push(args)};
  vm.runInNewContext(helper+';this.draw=drawRosterPreviewDeath;',context);
  const e=Object.freeze({classId:'druid',team:'player',radius:14,x:30,y:40,alive:false,moveSpeed:123,extra:Object.freeze({form:'bear'})});
  context.draw(e,1/60);
  assert.deepEqual(scales[0],[1.14,1.14]);
  assert.deepEqual(turns,[.4]);
  assert.notEqual(calls[0][1],e);
  assert.equal(calls[0][1].moveSpeed,0);
  assert.equal(e.moveSpeed,123);
  const priest=Object.freeze({...e,classId:'priest',extra:Object.freeze({shadowForm:2})});
  context.draw(priest,1/60);
  assert.equal(calls[1][1],priest);
  assert.equal(calls[1][3],'#17131d');
});
test('normal game URLs keep the original renderer, including withMode test calls', () => {
  const {api}=preview('?guest=1');
  assert.equal(api.enabled,false);
  api.setMode('polished');
  assert.equal(api.enabled,false);
  api.withMode('polished',()=>assert.equal(api.enabled,false));
});
test('opt-in preview can revert immediately and rejects unrelated message sources', () => {
  const {api,listeners,parent}=preview('?visualPreview=1');
  assert.equal(api.enabled,true);
  api.setMode('original');
  assert.equal(api.enabled,false);
  listeners.message({origin:'https://other.test',source:parent,data:{type:'arena:visual-preview',mode:'polished'}});
  assert.equal(api.enabled,false);
  listeners.message({origin:'https://preview.test',source:{},data:{type:'arena:visual-preview',mode:'polished'}});
  assert.equal(api.enabled,false);
  api.withMode('polished',()=>assert.equal(api.enabled,true));
  assert.equal(api.enabled,false);
  listeners.message({origin:'https://preview.test',source:parent,data:{type:'arena:visual-preview',mode:'polished'}});
  assert.equal(api.enabled,true);
  assert.equal(api.metrics().effects.effects,0);
});