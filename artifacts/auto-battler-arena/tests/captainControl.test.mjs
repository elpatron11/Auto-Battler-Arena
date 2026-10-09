import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const html = readFileSync(new URL('../public/game.html', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../public/captain-control.js', import.meta.url), 'utf8');
const functions = new Map(), values = new Map();
for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
  const file = ts.createSourceFile('game.js', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const node of file.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(file));
    if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) values.set(declaration.name.text, declaration.initializer.getText(file));
    }
  }
}
function fixture(classId = 'warrior', variant = 'default', ultimate = 'default') {
  const calls = [], events = {}, moves = [];
  const window = {addEventListener: (type, fn) => {events[type] = fn;}};
  let time = 1000;
  const context = vm.createContext({
    window, isSupportBuild: () => false,
    document: {body: {classList: {contains: () => false, add() {}, remove() {}}}, addEventListener: (type, fn) => {events[type] = fn;}},
    performance: {now: () => time}, selected: [classId, 'priest', 'frostmage'], captainClass: classId,
    teamSize: 3, tournament: null, WALLS: [], state: null,
    FIRESTORM_RANGE: 620, SHAMAN_CHAIN_FIRST_RANGE: 620,
    isSilenced: e => e.status.silenceTimer > 0,
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    meleeDistance: (a, b) => Math.max(0, Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius),
    hasLOS: () => true, navPathClear: () => true,
    inBounds:(x,y,r)=>x-r>4&&x+r<896&&y-r>4&&y+r<556,
    collidesWalls:()=>false,
    teamMoveFactor: () => .8,
    moveEntity: (e, dx, dy, speed, dt) => {moves.push({e, dx, dy, speed, dt}); e.x += dx * speed * dt; e.y += dy * speed * dt;},
    entityHasTalent: () => false, aiTryRacial: () => false,
    captainPaladinAllyOf: () => null,
    universalAntiStuckReevaluation: e => calls.push(['watchdog', e.id]),
    escapeEnemyFirestorm: () => false,
    repositionWhileEnemyCc: () => false,
    classAI: e => calls.push(['AI', e.id]),
    feralShiftReady: e => !(e.extra.feralShiftLock > 0),
    needsCleanse: e => e.status.slowTimer > 0 || e.status.dots.length > 0 || e.status.polymorphed,
    isActingHealer: e => ['priest', 'shaman'].includes(e.classId),
  });
  for (const name of ['CLASS_DESC', 'CLASS_STATS', 'CUSTOM_ABILITIES', 'CUSTOM_ULTS', 'MAGE_POLYMORPH_ULT']) {
    vm.runInContext(`var ${name}=${values.get(name)};`, context);
  }
  for (const name of ['abilityLineIdx', 'ultLineIdx', 'variantLabel', 'variantArtName', 'makeStatus', 'canDreambindTarget', 'tickEntity']) {
    vm.runInContext(functions.get(name), context);
  }
  for (const name of new Set(adapter.match(/\bcast[A-Z]\w+(?=\()/g))) {
    context[name] = (...args) => {calls.push([name, ...args]); return true;};
  }
  context.autoAttack = (...args) => calls.push(['autoAttack', ...args]);
  context.preplaceBearTraps = e => {calls.push(['preplaceBearTraps', e]); e.extra.trapsPreplaced = true; e.extra.trapCharges = 0;};
  const hero = (id, team, key, position) => ({
    id, team, classId: key, x: position, y: 100, radius: 14, alive: true, hp: 100, maxHp: 100, speed: 100,
    range: ['warrior', 'rogue', 'paladin'].includes(key) ? 55 : 260, melee: ['warrior', 'rogue', 'paladin'].includes(key),
    name: key, isPet: false, isCaptain: id === 1, wasCreated: true,
    status: context.makeStatus(), extra: {}, cd: {a1: 0, a2: 0, ult: 0}, atkTimer: 0,
    a2Variant: variant, ultVariant: ultimate,
  });
  const captain = hero(1, 'player', classId, 100), teammate = hero(2, 'player', 'priest', 150), opponent = hero(3, 'enemy', 'warrior', 140);
  context.state = {entities: [captain, teammate, opponent], effects: [], log: [], over: false};
  context.aliveAllies = (e, self = true) => context.state.entities.filter(t => t.alive && !t.isPet && t.team === e.team && (self || t !== e));
  context.lowestHpAlly = (e, self = true) => context.aliveAllies(e, self).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  context.deadAlly = e => context.state.entities.find(t => !t.alive && t.team === e.team && !t.isPet);
  for (const name of ['pickPriorityTarget', 'pickRogueTarget', 'archerTacticalTarget', 'pickDruidTarget', 'pickHexformTarget',
    'pickRogueDisorientTarget', 'pickDreambindTarget', 'findUncursedEnemyFor', 'pickMarkTarget', 'findNearestEnemy']) context[name] = () => opponent;
  vm.runInContext(adapter, context);
  const control = window.CaptainControl;
  const begin = (opts = {}, manual = true) => {control.end(); if (manual) control.setMode('manual'); else control.setMode('auto'); control.prepare(opts); control.begin(opts, captain);};
  return {context, captain, teammate, opponent, control, calls, moves, events, begin, advance: n => {time += n;}};
}

test('all adapter casts resolve to original engine functions, not copied abilities', () => {
  for (const name of new Set(adapter.match(/\bcast[A-Z]\w+(?=\()/g))) assert.ok(functions.has(name), name);
  assert.doesNotMatch(adapter, /\b(?:dealDamage|healTarget|applyCaptainBuffs|applyProfileTalents)\(/);
});

test('ground aim places Ice Tempest at an explicit valid location, not a unit',()=>{
  const f=fixture('frostmage');f.begin();
  assert.equal(f.control.aim('a2').kind,'ground');
  assert.equal(f.control.request('a2',{point:{x:260,y:200}}),true);
  f.control.step(f.captain,.1);
  const cast=f.calls.find(c=>c[0]==='castIceTempest');
  assert.deepEqual({x:cast[2].x,y:cast[2].y},{x:260,y:200});
  assert.equal(f.captain.lastTarget,undefined);
  assert.equal(f.control.view().active,true);
});
test('invalid ground positions, range and obstructed line of sight cannot enqueue or consume a cast',()=>{
  const f=fixture('frostmage','default','custom');f.begin();
  for(const point of [{x:-1,y:100},{x:899,y:100},{x:NaN,y:100}])
    assert.equal(f.control.request('ult',{point}),false);
  f.context.collidesWalls=()=>true;
  assert.equal(f.control.request('ult',{point:{x:200,y:100}}),false);
  f.context.collidesWalls=()=>false;f.context.hasLOS=()=>false;
  assert.equal(f.control.request('ult',{point:{x:200,y:100}}),false);
  f.control.step(f.captain,.1);
  assert.equal(f.calls.some(c=>c[0]==='castFrostUlti'),false);
  assert.equal(f.captain.cd.ult,0);
});
test('ground position revalidates against the moving captain at dispatch',()=>{
  const f=fixture('frostmage');f.begin();
  assert.equal(f.control.request('a2',{point:{x:300,y:100}}),true);
  f.captain.x=800;f.control.step(f.captain,.1);
  assert.equal(f.calls.some(c=>c[0]==='castIceTempest'),false);
});
test('explicit enemy selection overrides nearest and persists for subsequent basic attacks',()=>{
  const f=fixture('frostmage');f.begin();
  const far={...f.opponent,id:4,x:250,status:f.context.makeStatus()};
  f.context.state.entities.push(far);
  f.control.request('attack',{targetId:far.id});f.control.step(f.captain,.1);
  assert.equal(f.calls.find(c=>c[0]==='autoAttack')[2],far);
  f.calls.length=0;f.control.request('attack');f.control.step(f.captain,.1);
  assert.equal(f.calls.find(c=>c[0]==='autoAttack')[2],far);
  f.calls.length=0;far.alive=false;f.control.request('attack');f.control.step(f.captain,.1);
  assert.equal(f.calls.find(c=>c[0]==='autoAttack')[2],f.opponent);
});
test('explicit ally choice overrides support auto-selection and does not clear joystick input',()=>{
  const f=fixture('shaman');f.begin();f.control.input(1,0);
  assert.equal(f.control.request('a1',{targetId:f.teammate.id}),true);
  f.control.step(f.captain,.1);
  assert.equal(f.calls.find(c=>c[0]==='castHealingWave')[2],f.teammate);
  assert.equal(f.moves.length,1);
  assert.equal(f.control.request('a1',{targetId:f.opponent.id}),false);
});
test('aim targets distinguish range-invalid enemies and untargetable/invisible units',()=>{
  const f=fixture('frostmage');f.begin();f.opponent.x=700;
  assert.equal(f.control.aim('a1').targets.find(t=>t.id===f.opponent.id).valid,false);
  f.opponent.status.invis=true;
  assert.equal(f.control.aim('a1').targets.some(t=>t.id===f.opponent.id),false);
});
test('Firestorm and Rain of Arrows use ground circles; self buffs cannot become remote ground casts',()=>{
  for(const [key,ult,slot]of [['frostmage','custom','ult'],['archer','default','ult']]){
    const f=fixture(key,'default',ult);f.begin();assert.equal(f.control.aim(slot).kind,'ground');
    assert.equal(f.control.request(slot,{point:{x:200,y:100}}),true);
    f.control.step(f.captain,.1);assert.equal(f.calls.some(c=>c[0]===(key==='archer'?'castArcherUlti':'castFrostUlti')),true);
  }
  const f=fixture('rogue');f.begin();assert.equal(f.control.aim('a1').kind,'self');
  assert.equal(f.control.request('a1',{point:{x:200,y:100}}),false);
});
test('AUTO is default; only the captured player Captain is owned', () => {
  const f = fixture();
  assert.equal(f.control.view().selected, 'auto');
  f.begin({}, false);
  assert.equal(f.control.owns(f.captain), false);
  f.begin();
  assert.equal(f.control.owns(f.captain), true);
  assert.equal(f.control.owns(f.teammate), false);
  assert.equal(f.control.owns(f.opponent), false);
  assert.equal(f.context.state.replayable, false);
});
test('shared menu invalidation needs no match options and releases Captain ownership and queued input', () => {
  const f = fixture(); f.begin(); f.control.input(1, 0); f.control.request('a1');
  vm.runInContext('var arenaEntryGeneration=0;', f.context);
  vm.runInContext(functions.get('invalidateArenaEntry'), f.context);
  assert.doesNotThrow(() => f.context.invalidateArenaEntry());
  assert.equal(f.control.owns(f.captain), false);
  f.control.step(f.captain, .1);
  assert.equal(f.calls.length, 0); assert.equal(f.moves.length, 0);
});
for (const opts of [{onlineChallenge: true}, {tournament: true}, {dungeon: true}, {replay: true}, {playback: true}]) {
  test(`manual is blocked in ${Object.keys(opts)[0]}`, () => {
    const f = fixture(); f.begin(opts);
    assert.equal(f.control.view().active, false);
    assert.equal(f.control.view().selected, 'auto');
    assert.equal(f.control.request('a1'), false);
    assert.equal(f.control.owns(f.captain), false);
  });
}
test('5v5, no Captain, active Tournament and late Dungeon flags block control', () => {
  for (const change of [f => {f.context.teamSize = 5;}, f => {f.context.captainClass = null;},
    f => {f.context.tournament = {active: true};}, f => {f.context.state.dungeon = true;}]) {
    const f = fixture(); change(f); f.begin(); assert.equal(f.control.view().active, false);
  }
});
test('joystick uses existing movement, status and team factors; root blocks movement', () => {
  const f = fixture(); f.begin();
  f.captain.status.slowFactor = .5; f.captain.status.hasteFactor = 2;
  f.captain.status.invis = true; f.captain.extra.rampage = 1;
  f.control.input(1, 1); f.control.step(f.captain, .1);
  assert.equal(f.moves.length, 1);
  assert.ok(Math.abs(f.moves[0].speed - 145.6) < .001);
  assert.ok(Math.abs(f.moves[0].dx - Math.SQRT1_2) < .001);
  f.captain.status.rootTimer = 2; f.control.step(f.captain, .1); assert.equal(f.moves.length, 1);
  f.control.release(); f.captain.status.rootTimer = 0; f.control.step(f.captain, .1); assert.equal(f.moves.length, 1);
});
test('manual tick retains cooldown processing but bypasses BOTH watchdogs and class AI; teammates retain AI', () => {
  const f = fixture(); f.begin(); f.captain.cd.a1 = 5;
  f.context.tickEntity(f.captain, .1);
  assert.equal(f.captain.cd.a1, 4.9);
  assert.deepEqual(f.calls, []);
  f.context.tickEntity(f.teammate, .1); f.context.tickEntity(f.opponent, .1);
  assert.deepEqual(f.calls, [['watchdog', 2], ['AI', 2], ['watchdog', 3], ['AI', 3]]);
});
test('death/CC prevents input; dead Captain does not stop teammate AI', () => {
  for (const change of [e => {e.alive = false;}, e => {e.status.stunTimer = 2;}, e => {e.status.fearTimer = 2;},
    e => {e.status.polymorphed = true;}, e => {e.status.sapTimer = 2;}]) {
    const f = fixture(); f.begin(); change(f.captain);
    assert.equal(f.control.view().enabled, false); assert.equal(f.control.request('a1'), false);
    f.control.input(1, 0); f.control.step(f.captain, .1); assert.equal(f.moves.length, 0);
  }
});
test('wind-ups keep a held joystick, lock casts/movement, then resume without a new pointer', () => {
  const f = fixture('frostmage'); f.begin(); f.control.input(1, 0);
  f.captain.casting = {timeLeft: 1};
  assert.equal(f.control.view().enabled, true);
  assert.equal(f.control.request('a1'), false);
  f.control.input(1, 0); f.control.step(f.captain, .1);
  assert.equal(f.moves.length, 0);
  f.captain.casting = null; f.control.step(f.captain, .1);
  assert.equal(f.moves.length, 1);
  assert.equal(f.moves[0].dx, 1);
});
test('instant attacks/spells and held movement run in the same tick', () => {
  for (const slot of ['attack', 'a1']) {
    const f = fixture(); f.begin(); f.control.input(0, 1); f.control.request(slot);
    f.control.step(f.captain, .1);
    assert.equal(f.calls.length, 1); assert.equal(f.moves.length, 1);
  }
});
function addEnemy(f, x, properties = {}) {
  const t = {...f.opponent, id: f.context.state.entities.length + 1, x,
    status: f.context.makeStatus(), extra: {}, ...properties};
  f.context.state.entities.push(t);
  return t;
}
test('manual Attack ignores stale AI focus and snapshots the nearest valid enemy on press', () => {
  const f = fixture(); f.begin();
  f.opponent.x = 175; f.captain.lastTarget = f.opponent;
  const near = addEnemy(f, 135); f.control.request('attack');
  addEnemy(f, 110); // A newer, closer target does not steal the queued press.
  f.control.step(f.captain, .1);
  assert.equal(f.calls[0][2], near);
});
test('manual target selection skips hidden, dead, untargetable, sleeping and blocked enemies', () => {
  const f = fixture('frostmage'); f.begin();
  f.opponent.status.untargetable = true;
  addEnemy(f, 105, {alive:false});
  const hidden = addEnemy(f, 110); hidden.status.invis = true;
  const sleeping = addEnemy(f, 115); sleeping.status.sapTimer = 2;
  const occluded = addEnemy(f, 120);
  f.context.hasLOS = (x,y,tx) => tx !== occluded.x;
  const legal = addEnemy(f, 150);
  f.control.request('a1'); f.control.step(f.captain, .1);
  assert.equal(f.calls[0][2], legal);
});
test('action-specific restrictions choose a farther valid target rather than failing on the nearest', () => {
  for (const [classId, variant, configure] of [
    ['warrior','default', (f, next) => {f.opponent.x=140; next.x=260;}],
    ['rogue','default', f => {f.opponent.status.stunTimer=2;}],
    ['rogue','custom', f => {f.opponent.status.disorientTimer=2;}],
    ['archer','default', f => {f.opponent.status.markedTimer=3;}],
    ['warlock','custom', f => {f.opponent.status.lethalCurse={};}],
  ]) {
    const f = fixture(classId, variant); f.begin();
    const next = addEnemy(f, 150); configure(f, next);
    f.control.request('a2'); f.control.step(f.captain, .1);
    assert.equal(f.calls[0]?.[2], next, classId + '/' + variant);
  }
});
test('Hexform excludes Druid heroes; Dreambind and Disorient ignore healer/AI priorities', () => {
  const mage = fixture('frostmage', 'default', 'polymorph'); mage.begin();
  mage.opponent.classId = 'druid';
  const legal = addEnemy(mage, 170, {classId:'warrior'}); mage.control.request('ult'); mage.control.step(mage.captain,.1);
  assert.equal(mage.calls[0][2], legal);
  for (const slot of ['a2', 'dreambind']) {
    const f = fixture('rogue', 'custom'); f.begin(); f.captain.status.invis = true;
    const healer = addEnemy(f, 150, {classId:'priest'});
    f.context.pickRogueDisorientTarget = () => healer;
    f.context.pickDreambindTarget = () => healer;
    f.control.request(slot); f.control.step(f.captain,.1);
    assert.equal(f.calls[0][2], f.opponent);
  }
});
test('a queued enemy that becomes invalid is not replaced with AI focus or charged a cooldown', () => {
  const f = fixture('frostmage'); f.begin(); f.control.request('a1');
  f.opponent.alive = false; addEnemy(f,145);
  f.control.step(f.captain,.1);
  assert.equal(f.calls.length,0); assert.equal(f.captain.cd.a1,0);
});
test('manual Goblin racial uses nearest enemy without replacing the native racial handler', () => {
  const f = fixture(); f.begin(); f.captain.lastTarget = f.opponent;
  const near = addEnemy(f,120); f.control.racialTarget();
  assert.equal(f.captain.lastTarget,near);
  f.begin({},false); f.captain.lastTarget=f.opponent; f.control.racialTarget();
  assert.equal(f.captain.lastTarget,f.opponent);
});
test('shared cast progression still completes a manual Captain cast', () => {
  const f = fixture(); f.begin(); let completed = 0;
  f.context.teamAtkCastFactor = () => 1;
  f.captain.casting = {timeLeft: .05, onComplete: () => completed++};
  f.context.tickEntity(f.captain, .1);
  assert.equal(completed, 1); assert.equal(f.captain.casting, null); assert.deepEqual(f.calls, []);
});
test('cooldown, LOS, range, silence and attack gates do not bypass existing eligibility', () => {
  const f = fixture('frostmage'); f.begin(); f.captain.cd.a1 = 2;
  assert.equal(f.control.request('a1'), false); f.captain.cd.a1 = 0;
  f.context.hasLOS = () => false; f.control.request('a1'); f.control.step(f.captain, .1); assert.equal(f.calls.length, 0);
  f.context.hasLOS = () => true; f.opponent.x = 900; f.control.request('a1'); f.control.step(f.captain, .1); assert.equal(f.calls.length, 0);
  f.opponent.x = 140; f.captain.status.silenceTimer = 2; assert.equal(f.control.request('a1'), false);
  f.captain.status.silenceTimer = 0; f.captain.atkTimer = 1; assert.equal(f.control.request('attack'), false);
  f.control.request('a1'); f.control.step(f.captain, .1); assert.equal(f.calls[0][0], 'castFrostBolt');
});
test('actual Glacial Bolt and Radiant Strike retain their original cast timing and damage callbacks', () => {
  for (const [classId, slot, name, seconds, damage] of [
    ['frostmage', 'a1', 'castFrostBolt', 1, 30], ['priest', 'a2', 'castRadiantStrike', 1.2, 22],
  ]) {
    const f = fixture(classId); f.begin();
    for (const helper of ['abilityLabel', 'sfx', 'spawnAoe', 'spawnProjectile', 'applySlow', 'log',
      'namedAbilityVfx', 'spawnBeam', 'captainFrostBoltStack']) f.context[helper] = () => {};
    f.context.isFrozenTarget = () => false;
    f.context.dealDamage = (...args) => f.calls.push(['damage', ...args]);
    vm.runInContext(functions.get(name), f.context);
    assert.equal(f.control.request(slot), true); f.control.step(f.captain, .1);
    assert.equal(f.captain.casting.total, seconds);
    assert.equal(f.control.request(slot), false);
    f.captain.casting.onComplete();
    assert.equal(f.calls.find(call => call[0] === 'damage')[3], damage);
  }
});
const routes = [
  ['warrior','a1','default','default','castCleave'], ['warrior','a2','default','default','castCharge',200],
  ['warrior','ult','default','custom','castSteelCycloneUlti'],
  ['frostmage','a2','default','default','castIceTempest'], ['frostmage','a2','custom','default','castBlink'],
  ['frostmage','ult','default','polymorph','castFrostUlti'],
  ['priest','a1','default','default','castShield'], ['priest','a2','custom','default','castSwiftShield'],
  ['priest','ult','default','custom','castShadowForm'], ['rogue','a1','default','default','castSmokeVeil'],
  ['rogue','a2','default','default','castCheapShot'], ['rogue','a2','custom','default','castDisorient'],
  ['rogue','ult','default','custom','castRogueUlti'], ['paladin','a1','default','default','castHolySmash'],
  ['paladin','a2','default','default','castBlessing'], ['paladin','a2','custom','default','castGladiator'],
  ['paladin','ult','default','default','castPaladinUlti'], ['archer','a1','default','default','castAimedShot'],
  ['archer','a2','default','default','castMarkTarget'], ['archer','ult','default','custom','castArcherUlti'],
  ['warlock','a1','default','default','castCurse'], ['warlock','a2','default','default','castShadowBolt'],
  ['warlock','a2','custom','default','castDoomCurse'], ['warlock','ult','default','default','castWarlockUlti'],
  ['druid','a1','default','default','castTigerForm'], ['druid','a2','default','default','castTreeForm'],
  ['shaman','a1','default','default','castHealingWave'], ['shaman','a2','default','default','castFireshock'],
  ['shaman','ult','default','custom','castShamanUlti'],
];
for (const [classId, slot, variant, ultimate, expected, distance = 140] of routes) test(`${classId} ${slot} ${variant}/${ultimate} reuses ${expected}`, () => {
  const f = fixture(classId, variant, ultimate); f.opponent.x = distance; f.begin();
  assert.equal(f.control.request(slot), true); f.control.step(f.captain, .1);
  assert.equal(f.calls[0]?.[0], expected);
  assert.equal(f.calls[0][1], f.captain);
});
test('trap charges, passive A2, Dreambind and special-form attacks retain their existing routes', () => {
  const archer = fixture('archer', 'custom'); archer.begin(); archer.control.request('a2'); archer.control.step(archer.captain, .1);
  assert.equal(archer.calls[0][0], 'preplaceBearTraps'); assert.equal(archer.control.request('a2'), false);
  const druid = fixture('druid', 'custom'); druid.begin(); assert.equal(druid.control.request('a2'), false);
  const rogue = fixture('rogue'); rogue.begin(); assert.equal(rogue.control.request('dreambind'), false);
  rogue.captain.status.invis = true; rogue.control.request('dreambind'); rogue.control.step(rogue.captain, .1);
  assert.equal(rogue.calls[0][0], 'castDreambind');
  const priest = fixture('priest'); priest.begin(); priest.captain.extra.shadowForm = 2;
  priest.control.request('attack'); priest.control.step(priest.captain, .1); assert.equal(priest.calls[0][0], 'castShadowBeam');
});
test('cancel, blur, expired presses, menu and next AUTO match cannot retain manual input', () => {
  for (const release of [f => f.control.release(), f => f.events.blur(), f => f.control.cancel('a1'),
    f => f.advance(300), f => f.control.end()]) {
    const f = fixture(); f.begin(); f.control.request('a1'); release(f); f.control.step(f.captain, .1); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.begin(); f.control.input(1, 0); f.control.request('a1'); f.begin({}, false);
  f.context.tickEntity(f.captain, .1);
  assert.deepEqual(f.calls, [['watchdog', 1], ['AI', 1]]); assert.equal(f.moves.length, 0);
});