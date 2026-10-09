import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/fullscreen-battle-hud.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/fullscreen-battle-hud.css',import.meta.url),'utf8');
function fixture({battle=true,phone=true,fullscreen=false,landscape=true,margin=160}={}){
  const classes=new Set([...(battle?['battleMode']:[]),...(phone?['phoneLandscapeBattle']:[])]);
  const props=new Map(),frames=[],listeners={};let mutation;
  const body={classList:{contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),
    remove:x=>classes.delete(x)}};
  const bounds={left:0,right:840,top:0},map={left:margin,right:840-margin,top:0,height:320};
  const screen={style:{getPropertyValue:x=>props.get(x)||'',setProperty:(x,v)=>props.set(x,v)},
    getBoundingClientRect:()=>bounds};
  const wrap={getBoundingClientRect:()=>map};
  const doc={body,getElementById:x=>x==='battleScreen'?screen:x==='arenaWrap'?wrap:{setAttribute(){}},
    fullscreenElement:fullscreen?{}:null,addEventListener:(x,fn)=>listeners[x]=fn,removeEventListener(){}};
  const host={document:doc,navigator:{},matchMedia:x=>({matches:x.includes('orientation')?landscape:false}),
    addEventListener:(x,fn)=>listeners[x]=fn,removeEventListener(){}};
  const window={parent:host,addEventListener(){}};
  vm.runInNewContext(source,{document:doc,window,requestAnimationFrame:fn=>frames.push(fn),
    MutationObserver:class{constructor(fn){mutation=fn;}observe(){}disconnect(){}}});
  function flush(){while(frames.length)frames.shift()();}
  flush();
  return {classes,props,doc,map,mutation,flush,listeners};
}
test('landscape health panels occupy only the free margins, leaving map and racial control clear',()=>{
  const f=fixture();assert.ok(f.classes.has('fullscreenBattleHud'));
  const width=parseFloat(f.props.get('--battle-health-width'));
  assert.ok(width>100&&width<f.map.left);
  const top=parseFloat(f.props.get('--battle-health-top'));
  const height=parseFloat(f.props.get('--battle-health-height'));
  assert.ok(top>=40);assert.ok(top+height<=f.map.height-72);
  assert.match(css,/#playerCol\{left:0\}/);assert.match(css,/#enemyCol\{right:0\}/);
});
test('normal menus and portrait play keep their original layout',()=>{
  assert.ok(!fixture({battle:false}).classes.has('fullscreenBattleHud'));
  assert.ok(!fixture({phone:false,landscape:false,fullscreen:true}).classes.has('fullscreenBattleHud'));
  assert.ok(!fixture({phone:false,fullscreen:false}).classes.has('fullscreenBattleHud'));
});
test('desktop fullscreen uses the margins and exiting restores standard skills and team layout',()=>{
  const f=fixture({phone:false,fullscreen:true});assert.ok(f.classes.has('fullscreenBattleHud'));
  f.doc.fullscreenElement=null;f.listeners.fullscreenchange();f.flush();
  assert.ok(!f.classes.has('fullscreenBattleHud'));
  assert.match(css,/#matchLoadout,[\s\S]*#landscapeLoadoutBtn\{display:none!important\}/);
});
test('resize recomputes side widths without stretching the arena or reading/writing combat state',()=>{
  const f=fixture();f.map.left=90;f.map.right=750;
  f.listeners.resize();f.flush();assert.equal(f.props.get('--battle-health-width'),'82.0px');
  assert.doesNotMatch(source,/\bstate\b|arena\.width\s*=|arena\.height\s*=/);
  f.map.left=10;f.map.right=830;f.listeners.resize();f.flush();
  assert.ok(f.classes.has('healthMarginsUnavailable'));
});
test('compact fullscreen clears a previously opened skills panel and reuses actual live HP lists',()=>{
  const f=fixture();f.classes.add('landscape-loadout-open');f.mutation();f.flush();
  assert.ok(!f.classes.has('landscape-loadout-open'));
  assert.match(css,/#teamBars\{display:contents!important\}/);
  assert.doesNotMatch(source,/innerHTML|appendChild|setInterval/,'no duplicated or stale health data');
});
