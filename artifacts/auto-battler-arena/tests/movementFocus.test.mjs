import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';

const html=readFileSync(new URL('../public/game.html',import.meta.url),'utf8');
const collision=readFileSync(new URL('../public/arena-collision.js',import.meta.url),'utf8');
const functions=new Map(),constants=new Map();
for(const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){
  const file=ts.createSourceFile('game.js',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  for(const node of file.statements){
    if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(file));
    if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)
      if(ts.isIdentifier(d.name)&&d.initializer)constants.set(d.name.text,d.initializer.getText(file));
  }
}
function fixture(map='citadel'){
  const hits=[];
  const c=vm.createContext({
    window:{},state:{entities:[]},teamOrders:{focus:null,heal:null,switchLow:true},activeTeamFormation:null,
    CORNER_SWEEP_ANGLES:[0,10,-10,20,-20,32,-32,45,-45],WEAK_FOCUS_CLASSES:new Set(),
    entityHasTalent:()=>false,isActingHealer:e=>['priest','shaman'].includes(e.classId),
    isSquishy:()=>false,teamMoveFactor:()=>1,isSilenced:()=>false,
    DRUID_TREE_RADIUS:130,
    DEFAULT_ABILITY_ROLE:{druid:'Healer',paladin:'Healer'},
    feralShiftReady:()=>false,feralBreakMovementCC(){},endDruidForm(){},
    castTigerForm:e=>{hits.push('tiger');e.extra.form='tiger';e.status.hasteFactor=3;e.melee=true;e.range=55;e.cd.a1=4;},
    castTreeForm:e=>{hits.push('tree');e.extra.form='tree';e.cd.a2=14;},
    castDruidUlti:e=>{hits.push('revive');e.cd.ult=10;},
    autoAttack:(e,t)=>{hits.push(t.id);e.atkTimer=1;e.lastTarget=t;},
    lowestHpAlly:()=>null,castBearTrap(){},spawnArcherPet(){},
    preplaceBearTraps:e=>{e.extra.trapsPreplaced=true;e.extra.trapCharges=0;},
  });
  vm.runInContext(collision,c);
  const names=['clamp','dist','meleeDistance','makeStatus','hasLOS','segIntersectsRect','collidesWalls',
    'inBounds','navPathClear','navNodesFor','findNavRoute','moveEntity','wallEscapeWaypoint','recoverFromNavigationStall',
    'universalAntiStuckReevaluation','opportunisticMeleeSwing','moveToward','moveAway','openDistance','bestEscapeAngle',
    'orderEntity','lowHealthFinishTarget','orderedFocusTarget','focusDamageImmune','manualFocusTarget','orderedHealTarget',
    'aiTargetScore','pickPriorityTarget','pickRogueTarget','pickDruidTarget','archerTacticalTarget','pickMarkTarget',
    'findUncursedEnemyFor','findNearestEnemy','nearestMeleeThreat','aiArcher','aiFrostMage',
    'isActingHealer','isSupportBuild','openingHealerCover','healerTeamPosition','druidTeamReady',
    'findHidingSpot','deadAlly','aiDruid','classAI','repositionWhileEnemyCc'];
  vm.runInContext(names.map(name=>{assert.ok(functions.has(name),name);return functions.get(name);}).join('\n'),c);
  const maps=vm.runInContext(`(${constants.get('ARENA_MAPS')})`,c);
  c.WALLS=maps[map].walls;c.ARENA_W=maps[map].w;c.ARENA_H=maps[map].h;
  c.aliveAllies=(e,self=true)=>c.state.entities.filter(o=>o.alive&&o.team===e.team&&(self||o!==e));
  c.ESCAPE_ANGLE_OFFSETS=vm.runInContext(`(${constants.get('ESCAPE_ANGLE_OFFSETS')})`,c);
  const unit=(id,team,x,y,extra={})=>({
    id,team,x,y,classId:'warrior',name:String(id),radius:14,speed:90,range:50,melee:true,
    alive:true,isPet:false,hp:100,maxHp:100,status:c.makeStatus(),extra:{},
    cd:{a1:99,a2:99,ult:99},atkTimer:99,a2Variant:'default',ultVariant:'default',
    _teamTacticsAge:5,...extra,
  });
  return {c,unit,hits,collision:c.window.ArenaCollision};
}

test('manual movement slides down a padded wall instead of wedging or bouncing',()=>{
  const f=fixture(),wall={x:300,y:50,w:40,h:400};
  f.c.WALLS=[wall];
  const e=f.unit(1,'player',282,100);
  for(let i=0;i<180;i++){
    const before={x:e.x,y:e.y};
    f.c.moveEntity(e,1,1,60,1/60);
    assert.ok(e.y>=before.y,'no backwards bounce');
    assert.ok(!f.c.collidesWalls(e.x,e.y,e.radius,[wall]));
  }
  assert.ok(e.y>220,'preserves tangential movement');
  assert.ok(e.x<=283.01,'body plus invisible padding stays outside the wall');
});
test('head-on and zero-input movement do not create sideways drift',()=>{
  const f=fixture();f.c.WALLS=[{x:300,y:50,w:40,h:400}];
  const e=f.unit(1,'player',283,150);
  for(let i=0;i<120;i++)f.c.moveEntity(e,1,0,100,1/60);
  assert.ok(Math.abs(e.y-150)<.001);
  f.c.moveEntity(e,0,0,100,1);
  assert.ok(Math.abs(e.x-283)<.01);
});
test('manual diagonal input continues smoothly around a pillar corner',()=>{
  const f=fixture();f.c.WALLS=[{x:150,y:120,w:90,h:90}];
  const e=f.unit(1,'player',133,150);
  for(let i=0;i<120;i++){
    f.c.moveEntity(e,1,-1,90,1/60);
    assert.ok(!f.c.collidesWalls(e.x,e.y,e.radius,f.c.WALLS));
  }
  assert.ok(e.x>155&&e.y<103,'walks around, not through, the upper-left corner');
});
test('long movement cannot tunnel through walls, and map-edge diagonals slide',()=>{
  const f=fixture();f.c.WALLS=[{x:300,y:0,w:8,h:560}];
  const e=f.unit(1,'player',100,200);
  f.c.moveEntity(e,1,0,900,1);
  assert.ok(e.x<284);
  f.c.WALLS=[];e.x=18.001;
  f.c.moveEntity(e,-1,1,100,.5);
  assert.ok(e.y>230);assert.ok(e.x>=18);
});
test('rounded pillar clearance agrees between navigation and physical collision',()=>{
  const f=fixture();const wall={x:150,y:120,w:90,h:90};
  f.c.WALLS=[wall];
  assert.equal(f.c.collidesWalls(133,150,14,[wall]),false);
  assert.equal(f.c.collidesWalls(134,150,14,[wall]),true);
  assert.equal(f.c.navPathClear({x:132,y:100},{x:132,y:240},14),true);
  assert.equal(f.c.navPathClear({x:134,y:100},{x:134,y:240},14),false);
  // Circle-vs-corner clearance, not a square character hitbox.
  assert.equal(f.c.collidesWalls(137,107,14,[wall]),false);
});
for(const map of ['citadel','ruins']){
  for(const melee of [true,false]){
    test(`${map}: ${melee?'melee':'ranged'} units route around walls and pillars to a real combat position`,()=>{
      const f=fixture(map),e=f.unit(1,'player',100,280,{melee,range:melee?50:290});
      const target=f.unit(2,'enemy',f.c.ARENA_W-100,140);
      f.c.state.entities=[e,target];
      for(let i=0;i<1600;i++){
        f.c.universalAntiStuckReevaluation(e,1/60);
        f.c.moveToward(e,target,1/60,e.range*.85);
        assert.ok(!f.c.collidesWalls(e.x,e.y,e.radius,f.c.WALLS),`illegal position ${e.x},${e.y}`);
        if(f.c.dist(e,target)<=e.range&&f.c.hasLOS(e.x,e.y,target.x,target.y,f.c.WALLS))break;
      }
      assert.ok(f.c.hasLOS(e.x,e.y,target.x,target.y,f.c.WALLS),'gets LOS rather than parking behind the wall');
      assert.ok(f.c.dist(e,target)<=e.range,'reaches attack range');
      if(!melee)assert.ok(f.c.dist(e,target)>100,'does not march into melee');
    });
  }
}
test('stuck recovery selects a connected waypoint without teleporting; idle/rooted units stay still',()=>{
  const f=fixture(),e=f.unit(1,'player',390,140),target=f.unit(2,'enemy',600,140);
  f.c.state.entities=[e,target];
  const before={x:e.x,y:e.y};
  for(let i=0;i<10;i++){e._aiMoveIntent=target;e._aiMoveIntentTTL=.2;f.c.universalAntiStuckReevaluation(e,.1);}
  assert.deepEqual({x:e.x,y:e.y},before);
  assert.ok(e._navRecoveryWaypoint);
  assert.ok(f.c.navPathClear(e,e._navRecoveryWaypoint,e.radius));
  const idle=f.unit(3,'player',100,280);
  for(let i=0;i<20;i++)f.c.universalAntiStuckReevaluation(idle,.1);
  assert.equal(idle._navRecoveryWaypoint,undefined);
  idle.status.rootTimer=3;idle._aiMoveIntent=target;
  for(let i=0;i<20;i++){idle._aiMoveIntentTTL=.2;f.c.universalAntiStuckReevaluation(idle,.1);}
  assert.equal(idle._navRecoveryWaypoint,undefined);
});
test('manual focus defeats nearby, low-HP, healer and reachable-target scoring for all DPS selectors',()=>{
  const f=fixture(),e=f.unit(1,'player',80,280);
  const nearby=f.unit(2,'enemy',130,280,{classId:'priest',hp:5});
  const focus=f.unit(3,'enemy',800,140,{classId:'warlock'});
  f.c.state.entities=[e,nearby,focus];f.c.teamOrders.focus='warlock';
  for(const selector of ['pickPriorityTarget','orderedFocusTarget','pickRogueTarget','pickDruidTarget','archerTacticalTarget','pickMarkTarget'])
    assert.equal(f.c[selector](e),focus,selector);
});
test('temporary immunity/stealth overrides return to the same focus without replacing it',()=>{
  const f=fixture(),e=f.unit(1,'player',80,280),focus=f.unit(2,'enemy',700,280,{classId:'warlock'});
  const fallback=f.unit(3,'enemy',180,280);
  f.c.state.entities=[e,focus,fallback];f.c.teamOrders.focus='warlock';
  assert.equal(f.c.pickPriorityTarget(e),focus);
  for(const kind of ['untargetable','invis','sapTimer','immune']){
    if(kind==='immune'){focus.status.damageTakenTimer=2;focus.status.damageTakenFactor=0;}
    else focus.status[kind]=true;
    assert.equal(f.c.pickPriorityTarget(e),fallback);
    focus.status.untargetable=false;focus.status.invis=false;focus.status.sapTimer=0;focus.status.damageTakenTimer=0;focus.status.damageTakenFactor=1;
    assert.equal(f.c.pickPriorityTarget(e),focus);
  }
});
test('manual Captain selection commands teammates immediately and supports retain healing priorities',()=>{
  const f=fixture(),e=f.unit(1,'player',80,280),focus=f.unit(2,'enemy',700,280);
  const injured=f.unit(3,'player',120,280,{classId:'priest',hp:15});
  f.c.state.entities=[e,focus,injured];
  f.c.window.CaptainControl={focusTargetId:()=>focus.id};
  assert.equal(f.c.pickPriorityTarget(e),focus);
  f.c.teamOrders.heal='priest';f.c.lowestHpAlly=()=>injured;
  assert.equal(f.c.orderedHealTarget(e),injured);
});
test('a temporarily immune final focus does not consume offense against an invalid target',()=>{
  const f=fixture(),e=f.unit(1,'player',80,280),focus=f.unit(2,'enemy',180,280,{classId:'warlock'});
  f.c.state.entities=[e,focus];f.c.teamOrders.focus='warlock';
  assert.equal(f.c.pickPriorityTarget(e),focus);
  focus.extra.bladestorm=2;
  assert.equal(f.c.pickPriorityTarget(e),null);
  assert.equal(f.c.pickRogueTarget(e),null);
  assert.equal(f.c.archerTacticalTarget(e),null);
  assert.equal(f.c.findNearestEnemy(e),null);
  focus.extra.bladestorm=0;
  assert.equal(f.c.pickPriorityTarget(e),focus);
});
test('archer pursues an out-of-range focus rather than stopping at an unrelated nearby melee enemy',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{classId:'archer',range:290,melee:false});
  const nearby=f.unit(2,'enemy',280,280),focus=f.unit(3,'enemy',790,280,{classId:'warlock'});
  f.c.WALLS=[];f.c.state.entities=[e,nearby,focus];f.c.teamOrders.focus='warlock';
  const before=e.x;
  f.c.aiArcher(e,.1);
  assert.equal(e.lastTarget,focus);assert.ok(e.x>before);
});
test('healthy ranged DPS advance on focus, but critical health and healers preserve defensive responses',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{classId:'frostmage',range:230,melee:false});
  const nearby=f.unit(2,'enemy',220,280),focus=f.unit(3,'enemy',790,280,{classId:'warlock'});
  f.c.WALLS=[];f.c.state.entities=[e,nearby,focus];f.c.teamOrders.focus='warlock';
  f.c.aiFrostMage(e,.1);
  assert.equal(e.lastTarget,focus);assert.ok(e.x>100,'healthy DPS pursue the command');
  e.x=100;e.hp=20;
  assert.equal(f.c.nearestMeleeThreat(e,175),nearby,'critical HP retains the survival override');
  e.hp=100;e.classId='priest';
  assert.equal(f.c.nearestMeleeThreat(e,175),nearby,'healers retain defensive awareness');
});
test('offensive curse/mark target the focus and opportunistic swings preserve the commanded destination',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{atkTimer:0});
  const nearby=f.unit(2,'enemy',140,280),focus=f.unit(3,'enemy',260,280,{classId:'warlock'});
  f.c.WALLS=[];f.c.state.entities=[e,nearby,focus];f.c.teamOrders.focus='warlock';
  e.lastTarget=focus;
  assert.equal(f.c.findUncursedEnemyFor(e,220),focus);
  assert.equal(f.c.pickMarkTarget(e,nearby),focus);
  f.c.opportunisticMeleeSwing(e,focus);
  assert.deepEqual(f.hits,[nearby.id]);assert.equal(e.lastTarget,focus);
});
test('Firestorm offense does not redirect to a larger unrelated cluster',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{classId:'frostmage',range:230,melee:false,ultVariant:'custom'});
  const focus=f.unit(2,'enemy',300,280,{classId:'warlock'});
  const cluster=[f.unit(3,'enemy',140,200),f.unit(4,'enemy',145,200),f.unit(5,'enemy',150,200)];
  f.c.WALLS=[];f.c.state.entities=[e,focus,...cluster];f.c.teamOrders.focus='warlock';
  f.c.FIRESTORM_RANGE=340;f.c.FIRESTORM_RADIUS=100;
  e.cd.ult=0;const targets=[];f.c.castFrostUlti=(actor,target)=>targets.push(target.id);
  f.c.aiFrostMage(e,.1);
  assert.deepEqual(targets,[focus.id]);
});

test('healer Druid stays with allies and saves Tiger and Tree during a healthy opening',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{classId:'druid',range:190,melee:false});
  const ally=f.unit(2,'player',160,280),enemy=f.unit(3,'enemy',700,280);
  f.c.WALLS=[];f.c.state.entities=[e,ally,enemy];e.cd.a1=0;e.cd.a2=0;e.cd.ult=0;
  for(let i=0;i<120;i++)f.c.aiDruid(e,1/60);
  assert.deepEqual(f.hits,[]);
  assert.ok(e.x<ally.x,'does not become the first member to charge');
  assert.ok(f.c.dist(e,ally)<100);
  assert.equal(e.cd.a2,0,'does not spend Tree on full-health allies');
});
test('King of the Jungle waits briefly, then sprints with nearby support before it reaches melee',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{classId:'druid',range:190,melee:false,a2Variant:'custom',_teamTacticsAge:0});
  const ally=f.unit(2,'player',100,300),enemy=f.unit(3,'enemy',700,280);
  f.c.WALLS=[];f.c.state.entities=[e,ally,enemy];e.cd.a1=0;
  f.c.aiDruid(e,.1);
  assert.ok(!f.hits.includes('tiger'));
  for(let i=0;i<240;i++){ally.x+=.7;e._teamTacticsAge+=1/60;f.c.aiDruid(e,1/60);assert.ok(e.x-ally.x<130);}
  assert.ok(f.hits.includes('tiger'),'does not wait for the teammate to enter melee');
  assert.ok(e.x>170,'waits for the team without permanently idling');
});
test('an already shifted Jungle Druid cannot race far ahead of a slower frontline',()=>{
  const f=fixture(),e=f.unit(1,'player',140,280,{classId:'druid',range:55,a2Variant:'custom',extra:{form:'tiger'}});
  const ally=f.unit(2,'player',100,280),enemy=f.unit(3,'enemy',750,280);
  e.status.hasteFactor=3;f.c.WALLS=[];f.c.state.entities=[e,ally,enemy];
  for(let i=0;i<180;i++){ally.x+=.6;f.c.aiDruid(e,1/60);assert.ok(e.x-ally.x<130);}
});
test('Jungle Druid commits when the team engages; solo and last survivors still fight',()=>{
  const f=fixture(),e=f.unit(1,'player',360,280,{classId:'druid',range:190,melee:false,a2Variant:'custom'});
  const ally=f.unit(2,'player',410,280),enemy=f.unit(3,'enemy',460,280);
  f.c.WALLS=[];f.c.state.entities=[e,ally,enemy];e.cd.a1=0;
  f.c.aiDruid(e,.1);assert.ok(f.hits.includes('tiger'));
  f.hits.length=0;ally.alive=false;e.extra.form=null;e.cd.a1=0;
  f.c.aiDruid(e,.1);assert.ok(f.hits.includes('tiger'));
});

test('Jungle Druid does not count a stunned teammate as ready backup',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{classId:'druid',a2Variant:'custom',range:190});
  const ally=f.unit(2,'player',100,300),enemy=f.unit(3,'enemy',700,280);
  f.c.WALLS=[];f.c.state.entities=[e,ally,enemy];ally.status.stunTimer=3;
  assert.equal(f.c.druidTeamReady(e,enemy),false);
  ally.status.stunTimer=0;assert.equal(f.c.druidTeamReady(e,enemy),true);
});

test('waiting offensive AI moves around Sap and Sheep without attacking or clearing them',()=>{
  for(const status of [{sapTimer:4},{polymorphed:true,untargetable:true}]){
    const f=fixture(),e=f.unit(1,'player',100,280),enemy=f.unit(2,'enemy',300,280);
    f.c.WALLS=[];Object.assign(enemy.status,status);f.c.state.entities=[e,enemy];
    for(let i=0;i<120;i++)assert.equal(f.c.repositionWhileEnemyCc(e,1/60),true);
    assert.ok(Math.hypot(e.x-100,e.y-280)>10,'visible, non-teleporting movement');
    for(const [key,value]of Object.entries(status))assert.equal(enemy.status[key],value);
    assert.equal(f.hits.length,0);
    enemy.status.sapTimer=0;enemy.status.polymorphed=false;enemy.status.untargetable=false;
    assert.equal(f.c.repositionWhileEnemyCc(e,1/60),false,'normal offense resumes immediately');
  }
});

test('CC waiting uses shared wall-safe navigation and never moves disabled units or overrides support/manual AI',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280),enemy=f.unit(2,'enemy',320,280);
  f.c.WALLS=[{x:220,y:160,w:40,h:220}];enemy.status.sapTimer=4;f.c.state.entities=[e,enemy];
  for(let i=0;i<180;i++){
    f.c.repositionWhileEnemyCc(e,1/60);
    assert.equal(f.c.collidesWalls(e.x,e.y,e.radius,f.c.WALLS),false);
  }
  for(const key of ['rootTimer','stunTimer','fearTimer','disorientTimer','sapTimer']){
    e.status[key]=3;assert.equal(f.c.repositionWhileEnemyCc(e,.1),false);e.status[key]=0;
  }
  e.status.polymorphed=true;assert.equal(f.c.repositionWhileEnemyCc(e,.1),false);e.status.polymorphed=false;
  e.classId='priest';assert.equal(f.c.repositionWhileEnemyCc(e,.1),false);e.classId='warrior';
  f.c.window.CaptainControl={owns:()=>true};assert.equal(f.c.repositionWhileEnemyCc(e,.1),false);
});

test('waiting movement does not replace attacking another available enemy or a non-breakable stun',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280),enemy=f.unit(2,'enemy',300,280);
  enemy.status.stunTimer=4;f.c.state.entities=[e,enemy];
  assert.equal(f.c.repositionWhileEnemyCc(e,.1),false);
  enemy.status.sapTimer=4;
  f.c.state.entities.push(f.unit(3,'enemy',350,280));
  assert.equal(f.c.repositionWhileEnemyCc(e,.1),false);
});

function druidBalanceFixture(){
  const f=fixture(),noop=()=>{};
  Object.assign(f.c,{
    CLASS_STATS:{druid:{melee:false,range:190}},DRUID_MELEE_RANGE:55,DRUID_CAPTAIN_HOT_PER_TICK:10,
    namedAbilityVfx:noop,spawnAoe:noop,spawnText:noop,sfx:noop,abilityLabel:noop,log:noop,
    addShake:noop,addZoomPulse:noop,spawnBeam:noop,
    applyRoot:(e,duration)=>{e.status.rootTimer=duration;},
    randomSpotInRadius:()=>({x:100,y:250}),
    addHot:(target,source,healPerTick,tickInterval,duration,name)=>target.status.hots.push({source,healPerTick,tickInterval,duration,name}),
  });
  vm.runInContext(['healOnDruidShift','endDruidForm','triggerDruidBearForm','castTreeForm','castDruidUlti']
    .map(name=>functions.get(name)).join('\n'),f.c);
  return f;
}
test('Druid Tree is 10s and every effective ultimate branch is 12s, retaining the 1 HP revive',()=>{
  const f=druidBalanceFixture(),e=f.unit(1,'player',100,280,{classId:'druid'});
  f.c.state.entities=[e];f.c.castTreeForm(e);assert.equal(e.cd.a2,10);
  for(const form of ['bear','tiger','tree']){
    e.extra.form=form;e.cd.ult=0;
    const fallen=f.unit(2,'player',150,280,{alive:false,hp:0,wasCreated:true});
    f.c.state.entities=[e,fallen];f.c.castDruidUlti(e);assert.equal(e.cd.ult,12);
    if(form==='tree'){assert.equal(fallen.alive,true);assert.equal(fallen.hp,1);}
  }
});
test('Bear takes 30% damage, Thick Hide retains its extra reduction, and Jungle heals 6 HP/sec only while Bear',()=>{
  const f=druidBalanceFixture(),e=f.unit(1,'player',100,280,{classId:'druid',a2Variant:'custom'});
  f.c.triggerDruidBearForm(e);assert.equal(e.status.damageTakenFactor,.30);
  assert.equal(e.status.hots[0].healPerTick,6);assert.equal(e.status.hots[0].tickInterval,1);
  assert.equal(e.extra.formTimer,Infinity);
  f.c.triggerDruidBearForm(e);assert.equal(e.status.hots.length,1,'no duplicate indefinite HoTs');
  f.c.endDruidForm(e);assert.equal(e.status.hots.length,0,'Bear healing cannot leak into Tiger');
  e.extra.talentBearHide=true;f.c.triggerDruidBearForm(e);assert.equal(e.status.damageTakenFactor,.24);
});
test('major CC gets a large labeled overhead marker in addition to the small status row',()=>{
  const f=fixture();vm.runInContext(functions.get('drawCrowdControlMarker'),f.c);f.c.roundRectPath=()=>{};
  for(const [status,label]of [[{stunTimer:3},'STUN'],[{fearTimer:3},'FEAR'],
    [{disorientTimer:3},'DISORIENT'],[{sapTimer:3},'SAP'],[{polymorphed:true},'SHEEP']]){
    const e=f.unit(1,'player',300,280),texts=[],radii=[];
    Object.assign(e.status,status);
    const ctx={save(){},restore(){},beginPath(){},fill(){},stroke(){},
      arc(_x,_y,r){radii.push(r);},measureText:txt=>({width:txt.length*6}),
      fillText(text){texts.push([text,this.font]);}};
    f.c.drawCrowdControlMarker(ctx,e,250);
    assert.ok(radii.includes(17),'34px outlined icon, compared with 12px badges');
    assert.ok(texts.some(([text])=>text===label));
    assert.ok(texts.some(([,font])=>font==='bold 22px sans-serif'));
  }
  assert.match(functions.get('drawEntity'),/drawCrowdControlMarker\(ctx,e,by\)/);
});
test('Tree waits for meaningful damage, then immediately prioritizes a badly hurt ally',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{classId:'druid',range:190,melee:false});
  const ally=f.unit(2,'player',170,280,{hp:70}),enemy=f.unit(3,'enemy',700,280);
  f.c.WALLS=[];f.c.state.entities=[e,ally,enemy];e.cd.a2=0;e.cd.ult=0;
  f.c.aiDruid(e,.1);assert.ok(!f.hits.includes('tree'));
  ally.hp=40;f.c.aiDruid(e,.1);assert.ok(f.hits.includes('tree'));
  f.hits.length=0;ally.alive=false;ally.wasCreated=true;
  f.c.aiDruid(e,.1);assert.deepEqual(f.hits,['revive'],'Tree branch can actually reach Rebirth');
});
test('Druid readies Rebirth safely without chasing a far-away corpse',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{classId:'druid',range:190,melee:false});
  const fallen=f.unit(2,'player',790,100,{alive:false,wasCreated:true,hp:0});
  const enemy=f.unit(3,'enemy',700,280);
  f.c.state.entities=[e,fallen,enemy];e.cd.a2=0;e.cd.ult=0;
  f.c.aiDruid(e,.1);
  assert.deepEqual(f.hits,['tree']);assert.equal(e.x,100);
  f.c.aiDruid(e,.1);assert.deepEqual(f.hits,['tree','revive']);
});
test('Tree also covers group damage and a nearby finishing window without changing its mechanics',()=>{
  for(const finish of [false,true]){
    const f=fixture(),e=f.unit(1,'player',100,280,{classId:'druid',range:190,melee:false,hp:finish?100:70});
    const ally=f.unit(2,'player',160,280,{hp:finish?100:70});
    const enemy=f.unit(3,'enemy',finish?200:700,280,{hp:finish?20:100});
    f.c.WALLS=[];f.c.state.entities=[e,ally,enemy];e.cd.a2=0;
    f.c.aiDruid(e,.1);assert.ok(f.hits.includes('tree'));
  }
});
test('opening healer cover stays connected, near allies, and releases for injury or timeout',()=>{
  const f=fixture(),e=f.unit(1,'player',220,240,{classId:'druid',range:190,melee:false,_teamTacticsAge:0});
  const ally=f.unit(2,'player',220,170),enemy=f.unit(3,'enemy',500,240);
  f.c.WALLS=[{x:300,y:180,w:50,h:120}];f.c.state.entities=[e,ally,enemy];
  assert.equal(f.c.openingHealerCover(e,.1),true);
  const p=e._openingCover;
  assert.ok(f.c.navPathClear(e,p,e.radius));
  assert.equal(f.c.hasLOS(p.x,p.y,enemy.x,enemy.y,f.c.WALLS),false);
  assert.equal(f.c.hasLOS(p.x,p.y,ally.x,ally.y,f.c.WALLS),true);
  assert.ok(f.c.dist(p,ally)<=115);
  ally.hp=40;assert.equal(f.c.openingHealerCover(e,.1),false);
  ally.hp=100;e._teamTacticsAge=3.1;assert.equal(f.c.openingHealerCover(e,.1),false);
  e._teamTacticsAge=0;ally.alive=false;ally.wasCreated=true;
  assert.equal(f.c.openingHealerCover(e,.1),false);
});
test('cover applies to healing builds, not Shadow Priest, Elemental Fury, or Jungle DPS',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280);
  for(const classId of ['priest','shaman','paladin','druid']){
    e.classId=classId;e.a2Variant='default';e.ultVariant='default';
    assert.equal(f.c.isSupportBuild(e),true,classId);
  }
  e.a2Variant='custom';assert.equal(f.c.isSupportBuild(e),false);
  for(const classId of ['priest','shaman']){
    e.classId=classId;e.ultVariant='custom';assert.equal(f.c.isSupportBuild(e),false);
  }
});
test('all-support teams and lone healers still have a way to close out fights',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280,{classId:'druid',range:190,melee:false});
  const ally=f.unit(2,'player',150,280,{classId:'druid',range:190,melee:false}),enemy=f.unit(3,'enemy',700,280);
  f.c.WALLS=[];f.c.state.entities=[e,ally,enemy];
  for(let i=0;i<180;i++){f.c.aiDruid(ally,1/60);f.c.aiDruid(e,1/60);}
  assert.ok(e.x>200 && ally.x>200,'both healer Druids advance without a frontline');
  ally.alive=false;e.cd.a1=0;f.c.aiDruid(e,.1);
  assert.ok(f.hits.includes('tiger'),'last survivor is not forced to wait for a team');
});
test('cached routes shortcut obsolete corners and discard recovery once a direct lane opens',()=>{
  const f=fixture(),e=f.unit(1,'player',100,280),enemy=f.unit(2,'enemy',700,280);
  f.c.WALLS=[];f.c.state.entities=[e,enemy];
  e._navRecoveryWaypoint={x:70,y:100};e._navRecoveryTTL=1.5;e._navRecoveryTargetId=enemy.id;
  f.c.moveToward(e,enemy,.1,40);
  assert.equal(e._navRecoveryWaypoint,null);
  assert.ok(e.x>100);assert.equal(e.y,280);
});
test('approach selection uses the short side of a long wall, not Euclidean-nearest',()=>{
  const f=fixture(),e=f.unit(1,'player',100,140,{range:80});
  const enemy=f.unit(2,'enemy',390,180);
  f.c.WALLS=[{x:300,y:10,w:40,h:420}];f.c.state.entities=[e,enemy];
  const route=f.c.findNavRoute(e,enemy,65),end=route.at(-1);
  assert.ok(end.y>225,'chooses the approach nearest the only open end of the wall');
  assert.ok(f.c.dist(end,enemy)<=80,'approach is still a real combat position');
  let last=e;
  for(const p of route){assert.ok(f.c.navPathClear(last,p,e.radius));last=p;}
});
test('cached blocked routes skip a corner as soon as a farther waypoint becomes visible',()=>{
  const f=fixture(),e=f.unit(1,'player',100,200),enemy=f.unit(2,'enemy',700,200);
  f.c.WALLS=[{x:300,y:50,w:40,h:350}];f.c.state.entities=[e,enemy];
  e._navRoute=[{x:100,y:100},{x:270,y:20},{x:370,y:20},enemy];
  e._navTargetId=enemy.id;e._navTargetPos={x:enemy.x,y:enemy.y};e._navRepath=.5;
  f.c.moveToward(e,enemy,.1,40);
  assert.equal(e._navRoute[0].x,270);
  assert.ok(e.x>100,'takes the visible diagonal instead of walking the old vertical leg');
});