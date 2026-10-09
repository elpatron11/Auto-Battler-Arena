import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../public/prestige-vfx.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/game.html',import.meta.url),'utf8');
function api(phone=false,reduced=false){
  const window={matchMedia:q=>({matches:q.includes('coarse')?phone:reduced})};
  vm.runInNewContext(code,{window});
  return window.PrestigeVfx;
}
function canvas(){
  const calls=[],stack=[],ctx={globalAlpha:.7,globalCompositeOperation:'source-over'};
  ctx.save=()=>stack.push({globalAlpha:ctx.globalAlpha,globalCompositeOperation:ctx.globalCompositeOperation});
  ctx.restore=()=>Object.assign(ctx,stack.pop());
  for(const name of ['beginPath','ellipse','moveTo','lineTo','quadraticCurveTo','stroke','fill'])
    ctx[name]=(...args)=>{assert.ok(args.every(Number.isFinite));calls.push([name,...args]);};
  return {ctx,calls,stack};
}
const hero=(cls,skin)=>({id:9,classId:cls,skinId:skin,alive:true,moveSpeed:90,extra:{},status:{},x:20,y:30});
test('only the two existing prestige IDs receive VFX; there are no new skins',()=>{
  const v=api();
  assert.equal(v.theme(hero('warrior','emberLord')).id,'warrior');
  assert.equal(v.theme(hero('paladin','wingedPaladin')).id,'paladin');
  for(const e of [hero('warrior','default'),hero('paladin','dawnBastion'),hero('rogue','emberLord'),
    {...hero('warrior','emberLord'),isPet:true}])assert.equal(v.theme(e),null);
  assert.equal(v.makeEffect(hero('paladin','wingedPaladin'),'charge',0,0,2,2),null);
  assert.equal(v.makeEffect(hero('warrior','emberLord'),'charge',NaN,0,2,2),null);
});
test('ambient, selection and signature draws preserve the entity and restore canvas state',()=>{
  const v=api();
  for(const e of [hero('warrior','emberLord'),hero('paladin','wingedPaladin')]){
    const before=JSON.stringify(e),{ctx,stack}=canvas();
    for(const low of [false,true]){
      v.drawAmbient(ctx,e,2,low);v.drawPresentation(ctx,e,2,low);
      const kinds=e.classId==='warrior'?['charge','warriorPassive']:['holySmash','paladinPassive'];
      for(const kind of kinds){
        const fx=v.makeEffect(e,kind,20,30,80,60);
        assert.ok(fx.dur<=.7);
        for(const p of [0,.35,1])assert.equal(v.drawEffect(ctx,fx,p,low),true);
      }
    }
    assert.equal(JSON.stringify(e),before);
    assert.equal(ctx.globalAlpha,.7);assert.equal(ctx.globalCompositeOperation,'source-over');
    assert.equal(stack.length,0);
  }
});
test('phone/adaptive/reduced-motion modes reduce smoke and sparks without spawning ambient effects',()=>{
  assert.ok(api(true).budget(false).sparks<api().budget(false).sparks);
  assert.ok(api().budget(true).smoke<api().budget(false).smoke);
  assert.equal(api(false,true).budget(false).reduced,true);
  const regular=canvas(),mobile=canvas(),e=hero('warrior','emberLord');
  api().drawAmbient(regular.ctx,e,2,false);api(true).drawAmbient(mobile.ctx,e,2,false);
  assert.ok(mobile.calls.length<regular.calls.length);
});
function ability(name,next,cls,skin){
  const effects=[],combat=[],e={...hero(cls,skin),radius:14,cd:{a1:0,a2:0},team:'player'},target={id:2,x:90,y:60,alive:true};
  const context={window:{PrestigeVfx:api()},WALLS:[],e,target,
    navPathClear:()=>true,collidesWalls:()=>false,inBounds:()=>true,
    placeEntityAt:(o,x,y)=>{o.x=x;o.y=y;},addEffect:f=>effects.push(f),
    namedAbilityVfx:(...a)=>effects.push({type:'stockNamed',args:a}),
    spawnBeam:(...a)=>effects.push({type:'stockBeam',args:a}),
    spawnSlash:(...a)=>effects.push({type:'stockSlash',args:a}),
    spawnAoe:(...a)=>effects.push({type:'stockAoe',args:a}),
    triggerAtkAnim:(_e,_t,dur)=>combat.push(['animation',dur]),
    dealDamage:(_e,_t,amount,opts)=>combat.push(['damage',amount,opts.tag]),
    healTarget:(_e,_t,amount)=>combat.push(['heal',amount]),
    applyStun:(_t,seconds,kind)=>combat.push(['stun',seconds,kind]),
    addShake:()=>{},sfx:()=>{},abilityLabel:()=>{},log:()=>{}};
  const helper=html.slice(html.indexOf('function spawnPrestigeSignature('),html.indexOf('function spawnAbilitySignature('));
  const fn=html.slice(html.indexOf('function '+name+'('),html.indexOf('function '+next+'('));
  vm.runInNewContext(helper+fn+`;${name}(e,target);`,context);
  const {skinId,...state}=e;
  return {combat,state,effects};
}
test('prestige Charge replaces stock yellow effects but retains displacement, damage, stun and cooldown',()=>{
  const normal=ability('castCharge','castWarriorUlti','warrior','default');
  const shadow=ability('castCharge','castWarriorUlti','warrior','emberLord');
  assert.deepEqual(shadow.combat,normal.combat);assert.deepEqual(shadow.state,normal.state);
  assert.equal(shadow.state.cd.a2,5);
  assert.ok(normal.effects.some(e=>e.type==='stockBeam'));
  assert.ok(shadow.effects.some(e=>e.type==='prestigeSignature'&&e.kind==='charge'));
  assert.ok(!shadow.effects.some(e=>e.type==='stockBeam'||e.type==='stockNamed'||e.type==='stockAoe'));
});
test('prestige Ability 1 changes only VFX, retaining Holy Smash damage, healing and cooldown',()=>{
  const normal=ability('castHolySmash','castBlessing','paladin','default');
  const holy=ability('castHolySmash','castBlessing','paladin','wingedPaladin');
  assert.deepEqual(holy.combat,normal.combat);assert.deepEqual(holy.state,normal.state);
  assert.equal(holy.state.cd.a1,3);
  assert.equal(holy.effects[0].kind,'holySmash');
});
test('real passive triggers call the visual hooks and all inline classic scripts remain valid',()=>{
  assert.match(html,/hitCount % 2 === 0\).*?spawnPrestigeSignature\(e,'paladinPassive'/s);
  assert.match(html,/target\.extra\.enduranceCd = 10;\s*spawnPrestigeSignature\(target,'warriorPassive'/);
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!/\btype\s*=\s*["']module/.test(match[1])&&match[2].trim())new vm.Script(match[2]);
  }
});