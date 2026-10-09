import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source=readFileSync(new URL('../public/captain-control-ui.js',import.meta.url),'utf8');
function fixture() {
  const ids=new Map(), handlers=new Map(), calls=[];
  class Node {
    constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.dataset={};this.events={};
      const classes=new Set();this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),
        toggle:(c,v)=>v?classes.add(c):classes.delete(c)};}
    set id(v){this._id=v;ids.set(v,this)} get id(){return this._id}
    set className(v){this._className=v} get firstElementChild(){return this.children[0]}
    set innerHTML(v){for(const n of this.children)n.parentNode=null;this.children=[]}
    appendChild(n){return this.insertBefore(n,null)}
    removeChild(n){this.children.splice(this.children.indexOf(n),1);n.parentNode=null;return n}
    insertBefore(n,next){if(n.parentNode){const a=n.parentNode.children;a.splice(a.indexOf(n),1)}
      const i=next?this.children.indexOf(next):this.children.length;this.children.splice(i,0,n);n.parentNode=this;return n}
    get nextSibling(){const a=this.parentNode?.children||[];return a[a.indexOf(this)+1]||null}
    setAttribute(k,v){this[k]=v} getAttribute(k){return this[k]??null} removeAttribute(k){delete this[k]} querySelector(){return null}
    addEventListener(k,f){(this.events[k]||=[]).push(f)}
    closest(selector){for(let n=this;n;n=n.parentNode){if(selector.split(',').some(s=>s.trim()==='#'+n.id||
      ['input','textarea','select'].includes(s.trim())&&n.tag===s.trim()))return n}return null}
    getBoundingClientRect(){return{left:0,top:0,width:132,height:132}} get offsetWidth(){return 54}
    setPointerCapture(){} releasePointerCapture(){} focus(){}
    click(){this.fire('click',{detail:0});this.onclick?.();}
    fire(k,e={}){e.pointerId??=1;e.preventDefault??=()=>{};for(const f of this.events[k]||[])f(e)}
  }
  const body=new Node('body'),battle=new Node();battle.id='battleScreen';body.appendChild(battle);
  const arena=new Node();arena.id='arenaWrap';battle.appendChild(arena);
  const racial=new Node('button');racial.id='racialBtn';battle.appendChild(racial);
  const originalClick=()=>calls.push(['racial']);racial.onclick=originalClick;
  for(const id of ['mainHub','selectScreen']){const n=new Node();n.id=id;body.appendChild(n)}
  const state={over:false};body.classList.add('battleMode');
  const hero={classId:'warrior',racial:'nightelf',cd:{racial:0}};
  const view={active:true,enabled:true,selected:'manual',available:true,
    slots:['attack','a1','a2','ult'].map((id,i)=>({id,label:['Attack','A1 · Cleave','A2 · Charge','ULT · Rampage'][i],cooldown:0,disabled:false}))};
  let sync;
  const document={body,getElementById:id=>ids.get(id),createElement:t=>new Node(t),createComment:()=>new Node('comment'),
    addEventListener:(k,f)=>{(handlers.get(k)||handlers.set(k,[]).get(k)).push(f)}};
  const window={CaptainControl:{view:()=>view,input:(x,y)=>calls.push(['move',x,y]),request:s=>calls.push(['request',s]),
    cancel:s=>calls.push(['cancel',s]),release:()=>calls.push(['release']),setMode(){}},
    getSelection:()=>({removeAllRanges:()=>calls.push(['selection-clear'])}),addEventListener(){}};
  vm.runInNewContext(source,{window,document,state,playerCaptainRef:hero,CLASS_STATS:{warrior:{icon:'⚔️'},priest:{icon:'✝️'}},
    RACIALS:{nightelf:{name:'Veilstep',icon:'🌙'}},
    collectibleArtUrl:(cls,name)=>'/collectibles/'+cls+'-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'.webp',
    resolveMatchAbilityArtName:()=> 'Umbral Ascension',
    Set,Array,setInterval:f=>{sync=f;return 1},clearInterval(){}});
  const emit=(type,target,extra={})=>{let prevented=false;const event={target,cancelable:true,...extra,preventDefault(){prevented=true}};
    for(const f of handlers.get(type)||[])f(event);return prevented};
  const hud=ids.get('ccBattle'),row=hud.children[1],zone=row.children[0],stick=zone.children[0],cluster=row.children[1];
  return{body,battle,arena,racial,originalClick,hero,view,state,calls,sync,emit,stick,zone,cluster,Node};
}
test('racial is moved, not cloned; original handler, node and menu position survive rebuild/end',()=>{
  const f=fixture();assert.equal(f.racial.parentNode,f.cluster);assert.equal(f.racial.onclick,f.originalClick);
  f.view.slots.push({id:'dreambind',label:'Dreambind',cooldown:0});f.sync();
  assert.equal(f.racial.parentNode,f.cluster);assert.equal(f.cluster.children.filter(n=>n===f.racial).length,1);
  f.view.active=false;f.state.over=true;f.sync();assert.equal(f.racial.parentNode,f.battle);
  assert.equal(f.racial.onclick,f.originalClick);assert.equal(f.body.classList.contains('ccLiveBattle'),false);
});
test('live battle blocks selection/callout; menu and text input retain native behavior',()=>{
  const f=fixture(),input=new f.Node('input');f.battle.appendChild(input);
  for(const type of ['selectstart','contextmenu','dragstart','dblclick']){
    assert.equal(f.emit(type,f.arena),true);assert.equal(f.emit(type,input),false);
    assert.equal(f.emit(type,{parentElement:f.arena}),true);
    assert.equal(f.emit(type,{parentElement:input}),false);
    assert.equal(f.emit(type,f.body),false);f.state.over=true;assert.equal(f.emit(type,f.arena),false);f.state.over=false;
  }
});
test('owned touch drags cannot scroll; outside/menu gestures can; touchstart keeps racial clicks',()=>{
  const f=fixture(),touch=id=>({identifier:id});
  assert.equal(f.emit('touchstart',f.racial,{changedTouches:[touch(1)]}),false);
  assert.equal(f.emit('touchmove',f.racial,{touches:[touch(1),touch(2)]}),true);
  f.emit('touchend',f.racial,{changedTouches:[touch(1)]});
  assert.equal(f.emit('touchmove',f.body,{touches:[touch(2)]}),false);
  f.emit('touchstart',f.stick,{changedTouches:[touch(3)]});f.state.over=true;
  assert.equal(f.emit('touchmove',f.stick,{touches:[touch(3)]}),false);
});
test('separate joystick and ability pointer IDs preserve movement and independent release',()=>{
  const f=fixture(),button=f.cluster.children.find(n=>n.dataset.slot==='attack');
  f.stick.fire('pointerdown',{pointerId:10,clientX:100,clientY:66});
  button.fire('pointerdown',{pointerId:20});assert.deepEqual(f.calls.at(-1),['request','attack']);
  button.fire('pointerup',{pointerId:20});
  f.stick.fire('pointermove',{pointerId:10,clientX:130,clientY:66});
  assert.ok(f.calls.at(-1)[1]>0);assert.equal(f.calls.at(-1)[0],'move');
  f.stick.fire('pointercancel',{pointerId:10});assert.deepEqual(f.calls.at(-1),['move',0,0]);
});
test('floating joystick follows a distant thumb without changing its drag direction and resets on release',()=>{
  const f=fixture();
  f.zone.fire('pointerdown',{pointerId:10,clientX:90,clientY:66});
  assert.deepEqual(f.calls.at(-1),['move',0,0]);
  f.stick.fire('pointermove',{pointerId:10,clientX:150,clientY:66});
  const first=f.stick.style.transform;assert.notEqual(first,'translate(24px,0px)');
  assert.deepEqual(f.calls.at(-1),['move',1,0]);
  f.stick.fire('pointermove',{pointerId:10,clientX:165,clientY:66});
  assert.notEqual(f.stick.style.transform,first);
  assert.deepEqual(f.calls.at(-1),['move',1,0]);
  f.stick.fire('pointerup',{pointerId:10});
  assert.equal(f.stick.style.transform,'');assert.equal(f.stick.children[0].style.transform,'');
});
test('cancelling the joystick releases only movement, not an independently pressed spell',()=>{
  const f=fixture(),button=f.cluster.children.find(n=>n.dataset.slot==='a1');
  f.stick.fire('pointerdown',{pointerId:10,clientX:90,clientY:66});
  button.fire('pointerdown',{pointerId:20});
  f.stick.fire('pointercancel',{pointerId:10});
  assert.equal(f.calls.some(c=>c[0]==='release'||c[0]==='cancel'),false);
  assert.equal(button.classList.contains('down'),true);
  button.fire('pointerup',{pointerId:20});assert.equal(button.classList.contains('down'),false);
});
test('racial press during held movement invokes native handler once and preserves the joystick pointer',()=>{
  const f=fixture();f.stick.fire('pointerdown',{pointerId:10,clientX:90,clientY:66});
  f.racial.fire('pointerdown',{pointerId:20});
  assert.equal(f.calls.filter(c=>c[0]==='racial').length,1);
  f.racial.fire('pointerup',{pointerId:20});
  f.stick.fire('pointermove',{pointerId:10,clientX:120,clientY:66});
  assert.equal(f.calls.at(-1)[0],'move');assert.ok(f.calls.at(-1)[1]>0);
});
test('cooldown/readiness feedback retains the label and clears without rebuilding the button',()=>{
  const f=fixture(),button=f.cluster.children.find(n=>n.dataset.slot==='attack');
  f.view.slots[0].cooldown=3.1;f.sync();
  assert.equal(button.classList.contains('cooling'),true);assert.equal(button._c.textContent,4);
  assert.equal(button.title,'Attack');assert.equal(button['aria-label'],'Attack');
  assert.equal(button._l.children[0].textContent,'⚔️');
  f.view.slots[0].cooldown=0;f.sync();
  assert.equal(button.classList.contains('cooling'),false);assert.equal(button._c.style.display,'none');
  assert.equal(f.cluster.children.find(n=>n.dataset.slot==='attack'),button);
});
test('equipped spell art replaces visible names; names remain available to assistive technology',()=>{
  const f=fixture(),button=f.cluster.children.find(n=>n.dataset.slot==='a1');
  assert.equal(button._l.children.find(n=>n.tag==='img').src,'/collectibles/warrior-cleave.webp');
  assert.equal(button['aria-label'],'A1 · Cleave');assert.equal(button.title,'A1 · Cleave');
  const image=button._l.children.find(n=>n.tag==='img');f.sync();
  assert.equal(button._l.children.find(n=>n.tag==='img'),image,'polling must not reload unchanged artwork');
  f.view.slots[1].cooldown=3;f.view.slots[1].disabled=true;f.sync();
  assert.equal(button.disabled,true);assert.equal(button._c.textContent,3);
  assert.equal(button._l.children.find(n=>n.tag==='img'),image,'icon stays mounted during cooldown');
  f.view.slots[1].cooldown=0;f.view.slots[1].disabled=false;f.sync();
  assert.equal(button.disabled,false);assert.equal(button._c.style.display,'none');
});
test('variant changes refresh art; absent art uses an existing symbol rather than a broken image or name',()=>{
  const f=fixture(),button=f.cluster.children.find(n=>n.dataset.slot==='a2');
  f.view.slots[2].label='A2 · Steel Cyclone';f.sync();
  const image=button._l.children.find(n=>n.tag==='img');
  assert.equal(image.src,'/collectibles/warrior-steel-cyclone.webp');
  image.fire('error');assert.equal(image.style.display,'none');
  assert.equal(button._l.children[0].textContent,'⚔️');assert.equal(button._l.children[0].style.display,'flex');
});
test('Shadow Beam attack reuses the existing parent ability art',()=>{
  const f=fixture(),button=f.cluster.children.find(n=>n.dataset.slot==='attack');
  f.hero.classId='priest';f.view.slots[0].label='Shadow Beam';f.sync();
  assert.equal(button._l.children.find(n=>n.tag==='img').src,'/collectibles/priest-umbral-ascension.webp');
});
test('racial countdown uses the existing timer and is removed when the native button returns to menus',()=>{
  const f=fixture();f.hero.cd.racial=12.2;f.sync();
  const counter=f.racial.children.at(-1);
  assert.equal(counter.textContent,13);assert.equal(counter.style.display,'flex');
  assert.equal(f.racial.classList.contains('ccRacialCooling'),true);
  assert.equal(f.hero.cd.racial,12.2,'presentation must not consume or reset the cooldown');
  f.hero.cd.racial=0;f.sync();assert.equal(counter.style.display,'none');
  assert.equal(f.racial.classList.contains('ccRacialCooling'),false);
  f.view.active=false;f.sync();assert.equal(counter.parentNode,null);
  assert.equal(f.racial.onclick,f.originalClick);assert.equal(f.racial.getAttribute('aria-label'),null);
});