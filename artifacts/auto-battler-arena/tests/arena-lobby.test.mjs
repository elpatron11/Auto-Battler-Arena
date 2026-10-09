import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/arena-lobby.js',import.meta.url),'utf8');
const definitions=JSON.parse(readFileSync(new URL('../src/lib/arena-ranks.json',import.meta.url),'utf8'));
const rankFunction=source.slice(source.indexOf('function rankOf(rp)'),source.indexOf('const setText'));
const context=vm.createContext({tiers:definitions});
vm.runInContext(rankFunction,context);

test('lobby copies face the camera without changing battle facing',()=>{
  const renderer=readFileSync(new URL('../src/prototypes/roster3d/battleRenderer.ts',import.meta.url),'utf8');
  const expression=renderer.match(/const facing = (valid\(e\.lobbyFacing\)[\s\S]*?);/)[1];
  const facing=new Function('e','slot','valid','return '+expression);
  const finite=value=>typeof value==='number' && Number.isFinite(value);
  assert.match(source,/lobbyFacing:0/);
  for(const id of ['warrior','frostmage','priest']){
    assert.equal(facing({lobbyFacing:0},{id,facing:Math.PI/2},finite),0);
    assert.equal(facing({},{id,facing:Math.PI/2},finite),Math.PI/2);
    assert.equal(facing({},{id,facing:-Math.PI/2},finite),-Math.PI/2);
  }
  assert.equal(facing({},{id:'boss-frost',facing:Math.PI/2},finite),.55);
  assert.equal(facing({lobbyFacing:NaN},{id:'warrior',facing:Math.PI/2},finite),Math.PI/2);
});

test('lobby ranks use the canonical thresholds and divisions',()=>{
  for(const [rating,label] of [[0,'Bronze III'],[1000,'Bronze I'],[1199,'Bronze I'],
    [1200,'Silver III'],[1399,'Silver I'],[1400,'Gold III'],[1600,'Platinum III'],
    [1800,'Diamond III'],[2000,'Master'],[2200,'Grandmaster']]){
    const rank=context.rankOf(rating);
    assert.equal(rank.name+rank.div,label);
    assert.equal(rank.color,definitions[rank.idx].color);
  }
});

test('rank definitions are not invented while the account bridge is loading',()=>{
  const empty=vm.createContext({tiers:[]});
  vm.runInContext(rankFunction,empty);
  assert.equal(empty.rankOf(1200),null);
  assert.ok(source.includes("e.origin !== location.origin || e.source !== window.parent"));
  assert.ok(source.includes("e.data?.type==='arena:ranked-progression'"));
});

test('battle entry and dungeon timer are native nodes, not new implementations',()=>{
  assert.ok(source.includes("const join = $('hubJoinBtn')"));
  assert.ok(source.includes("q('#alFindSlot').prepend(join)"));
  assert.ok(source.includes("const dun = $('hdHomeBtn')"));
  assert.ok(source.includes('dunSlot.appendChild(dun)'));
  assert.doesNotMatch(source,/join\.on(?:click|pointerdown)\s*=/);
  assert.doesNotMatch(source,/setInterval\s*\(/);
});

test('top Arena tab forwards to the existing Online Arena navigation',()=>{
  assert.ok(source.includes("['ARENA', I.swords, fwd('hubArenaBtn')]"));
  const forwarder=source.slice(source.indexOf('const fwd ='),source.indexOf('const el ='));
  let opened=0;
  const ctx=vm.createContext({$:(id)=>id==='hubArenaBtn'?{click:()=>opened++}:null,window:{}});
  vm.runInContext(forwarder+"\nfwd('hubArenaBtn')();",ctx);
  assert.equal(opened,1);
  const html=readFileSync(new URL('../public/game.html',import.meta.url),'utf8');
  assert.ok(html.includes("document.getElementById('hubArenaBtn').onclick=openOnlineArenaFromHub"));
});

test('Battle Pass and Shop forward to distinct Store sections',()=>{
  const helper=source.slice(source.indexOf('function openStore(section)'),source.indexOf("const short = q('#alShort')"));
  const calls=[];
  const ctx=vm.createContext({window:{parent:{postMessage:(message,origin)=>calls.push({message,origin})}},
    location:{origin:'https://arena.example',href:'https://arena.example/game.html'},URL});
  vm.runInContext(helper+"\nopenStore('battle-pass'); openStore('featured');",ctx);
  assert.deepEqual(calls.map(c=>c.message.section),['battle-pass','featured']);
  assert.ok(calls.every(c=>c.message.type==='arena:open-store' && c.origin==='https://arena.example'));
  assert.ok(source.includes("'Shop / Store', 'Shop / Store', () => openStore('featured')"));
  assert.ok(source.includes("'Open Shop &amp; rewards', () => openStore('battle-pass')"));
});

test('standalone game links open the host Store instead of sending an unhandled self-message',()=>{
  const helper=source.slice(source.indexOf('function openStore(section)'),source.indexOf("const short = q('#alShort')"));
  for(const prefix of ['/', '/arena-app/']){
    let destination;
    const win={location:{assign:url=>{destination=url;}}}; win.parent=win;
    const ctx=vm.createContext({window:win,location:{href:`https://arena.example${prefix}game.html`},URL});
    vm.runInContext(helper+"\nopenStore('battle-pass');",ctx);
    assert.equal(destination,`https://arena.example${prefix}store?section=battle-pass`);
  }
});

test('Store browsing opens immediately without waiting for profile persistence',()=>{
  const play=readFileSync(new URL('../src/pages/Play.tsx',import.meta.url),'utf8');
  const handler=play.slice(play.indexOf("if (msg.type === 'arena:open-store')"),play.indexOf("if (msg.type === 'arena:open-market')"));
  let opened,section,flushes=0;
  const ctx=vm.createContext({msg:{type:'arena:open-store',section:'battle-pass'},
    setStoreSection:value=>{section=value;},setGameScreen:value=>{opened=value;},
    flushPendingProfile:()=>{flushes++;return new Promise(()=>{});}});
  vm.runInContext(handler,ctx);
  assert.equal(opened,'store');
  assert.equal(section,'battle-pass');
  assert.equal(flushes,1);
});

test('lobby script is appended after existing live controllers',()=>{
  const html=readFileSync(new URL('../public/game.html',import.meta.url),'utf8');
  const lobby=html.lastIndexOf('src="./arena-lobby.js"');
  for(const name of ['mobile-game.js','captain-control-ui.js','account-menu.js','squad-ratings.js','hourly-dungeon-ui.js']){
    assert.ok(lobby>html.lastIndexOf(`src="./${name}"`),name);
  }
});

test('landscape layout follows the host viewport, not the tall menu iframe',()=>{
  const hook=readFileSync(new URL('../src/lib/useGameFrameScrolling.ts',import.meta.url),'utf8');
  const selector=hook.slice(hook.indexOf('const viewportWidth ='),hook.indexOf('// Media queries'));
  for(const [width,height,expected] of [[844,390,true],[740,312,true],[932,430,true],
    [390,844,false],[390,416,false],[1440,900,false],[1024,768,false]]){
    const attributes=new Set();
    const ctx=vm.createContext({viewportHeight:height-48,window:{innerWidth:width,innerHeight:height,
      visualViewport:{width,height}},doc:{documentElement:{toggleAttribute(name,on){
        if(on)attributes.add(name);else attributes.delete(name);
      }}}});
    vm.runInContext(selector,ctx);
    assert.equal(attributes.has('data-lobby-landscape'),expected,`${width}x${height}`);
    ctx.window.visualViewport.width=390;ctx.window.visualViewport.height=844;ctx.viewportHeight=796;
    vm.runInContext('{'+selector+'}',ctx);
    assert.equal(attributes.has('data-lobby-landscape'),false,'rotation restores portrait');
  }
});