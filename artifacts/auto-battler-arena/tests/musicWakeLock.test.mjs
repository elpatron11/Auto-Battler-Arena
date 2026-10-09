import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import vm from 'node:vm';
const root=new URL('../public/',import.meta.url);
const musicScript=readFileSync(new URL('fantasy-music.js',root),'utf8');
const wakeScript=readFileSync(new URL('game-wake-lock.js',root),'utf8');
function musicFixture(){
  const listeners={},params=[],timers=[];let media,sources=0,oldStops=0,battleVisible=false;
  const param={value:1,cancelScheduledValues(){},setTargetAtTime(v){params.push(v);}};
  class Audio{
    constructor(){media=this;this.paused=true;this.volume=1;this.playCount=0;}
    addEventListener(name,fn){listeners['media:'+name]=fn;}
    pause(){this.paused=true;}
    play(){this.paused=false;this.playCount++;return this.nextPlay||Promise.resolve();}
  }
  const c=vm.createContext({URL,Audio,Promise,console,playerProfile:{musicEnabled:true,sfxEnabled:true},
    audioCtx:{state:'running',currentTime:0,destination:{},
      createMediaElementSource(){sources++;return {connect(){}};},
      createGain(){return {gain:param,connect(){}};},resume:async()=>{}},
    state:null,musicMode:'menu',ensureAudio(){},stopGameMusic(){oldStops++;},musicNote(){throw Error('Old music');},
    startBattle(){battleVisible=true;this.state={entities:[],over:false};return 'native fight';},
    document:{hidden:false,body:{classList:{contains:()=>battleVisible}},
      currentScript:{src:'https://arena.test/game/fantasy-music.js'},
      addEventListener(name,fn){listeners[name]=fn;}},
    addEventListener(name,fn){listeners[name]=fn;},
    setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){}});
  c.window=c;vm.runInContext(musicScript,c);
  return {c,listeners,media,param,params,timers,sources:()=>sources,oldStops:()=>oldStops};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
test('full composed tracks have verified CC0 provenance and manageable streamed sizes',()=>{
  const manifest=JSON.parse(readFileSync(new URL('audio/music/manifest.json',root),'utf8'));
  for(const [id,a]of Object.entries(manifest.tracks)){
    const bytes=readFileSync(new URL(`audio/music/${a.file}`,root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),a.sha256);
    assert.equal(a.license,'CC0-1.0');assert.ok(a.duration>60);
    assert.equal(a.creator,'The Cynic Project / cynicmusic');
    assert.ok(a.sourcePage.startsWith('https://opengameart.org/'));
    assert.ok(bytes.length<1.5*1024*1024,id);
  }
  assert.ok(musicScript.includes("audio.preload='none'"));
  assert.ok(!musicScript.includes('decodeAudioData'),'music must not inflate the SFX decoded-buffer cache');
});
test('music unlocks after input, changes menu/battle track and respects Music independently of SFX',async()=>{
  const f=musicFixture();
  assert.ok(f.media.paused);assert.equal(f.media.playCount,0);
  f.listeners.pointerdown();await flush();
  assert.ok(!f.media.paused);assert.match(f.media.src,/\/game\/audio\/music\/menu.mp3$/);
  assert.equal(f.param.value,.45);assert.ok(f.oldStops()>0);assert.equal(f.sources(),1);
  f.c.playerProfile.sfxEnabled=false;f.listeners.change();assert.ok(!f.media.paused);
  assert.equal(f.c.startBattle(),'native fight');await flush();
  assert.match(f.media.src,/battle.mp3$/);assert.equal(f.param.value,.28);
  assert.equal(f.c.musicMode,'battle');assert.equal(f.sources(),1);
  f.c.playerProfile.musicEnabled=false;f.listeners.change();assert.ok(f.media.paused);
  assert.equal(f.param.value,0);
  f.c.playerProfile.musicEnabled=true;f.listeners.change();await flush();
  assert.ok(!f.media.paused);f.c.document.hidden=true;f.listeners.visibilitychange();
  assert.ok(f.media.paused);f.c.document.hidden=false;f.listeners.visibilitychange();await flush();
  assert.ok(!f.media.paused);assert.doesNotThrow(()=>f.c.musicNote());
});
test('music ducks for important effects and never revives after mute',async()=>{
  const f=musicFixture();f.listeners.pointerdown();await flush();
  f.c.GameMusic.duck();assert.ok(f.params.at(-1)<.45);
  f.c.playerProfile.musicEnabled=false;f.listeners.change();
  f.timers.at(-1)();assert.ok(f.media.paused);assert.equal(f.param.value,0);
});
test('track changes during a pending play start the new track once the old attempt settles',async()=>{
  const f=musicFixture();let resolve;
  f.media.nextPlay=new Promise(r=>{resolve=r;});
  f.listeners.pointerdown();f.c.startBattle();
  assert.equal(f.media.playCount,1);
  f.media.nextPlay=null;resolve();await flush();await flush();
  assert.equal(f.media.playCount,2);assert.match(f.media.src,/battle.mp3$/);
  assert.ok(!f.media.paused);
});
test('real native fight state keeps orchestral music exclusive through profile/settings menu resets',async()=>{
  const f=musicFixture();f.listeners.pointerdown();await flush();
  f.c.startBattle();await flush();const plays=f.media.playCount;
  assert.equal(f.c.state.running,undefined,'reproduce the real engine rather than an invented running flag');
  f.c.setMusicMode('menu');f.listeners.message();f.listeners.change();await flush();
  assert.equal(f.c.GameMusic.status().mode,'battle');assert.match(f.media.src,/battle.mp3$/);
  assert.equal(f.media.playCount,plays,'no restart/overlapping menu track');
  f.c.state.over=true;f.c.setMusicMode('menu');await flush();
  assert.equal(f.c.GameMusic.status().mode,'menu');assert.match(f.media.src,/menu.mp3$/);
});
test('orders/tip preparation cannot start fight music before a native fight is visible',async()=>{
  const f=musicFixture();f.listeners.pointerdown();await flush();
  f.c.setMusicMode('battle');await flush();
  assert.match(f.media.src,/menu.mp3$/);assert.equal(f.c.GameMusic.status().mode,'menu');
});
function wakeFixture({supported=true,deny=false,deferred=false}={}){
  const listeners={},sentinels=[];let clock=0,requests=0,resolve;
  const request=async()=>{
    requests++;if(deny)throw Error('Battery/policy refused wake lock');
    if(deferred)await new Promise(r=>{resolve=r;});
    const sentinel={released:false,addEventListener(name,fn){this.onRelease=fn;},
      async release(){this.released=true;this.onRelease?.();}};
    sentinels.push(sentinel);return sentinel;
  };
  const c=vm.createContext({Date:{now:()=>clock},navigator:{wakeLock:supported?{request}:undefined},
    state:{over:false},document:{hidden:false,
      body:{classList:{contains:()=>!!c.state.entities}},
      addEventListener(name,fn){listeners[name]=fn;}},
    frameElement:null,addEventListener(name,fn){listeners[name]=fn;},setInterval(fn){listeners.poll=fn;}});
  c.window=c;vm.runInContext(wakeScript,c);
  return {c,listeners,sentinels,requests:()=>requests,
    advance:t=>clock+=t,resolve:()=>resolve?.()};
}
test('wake lock is fight-only and releases on result, pause, page hide and hidden iframe',async()=>{
  const f=wakeFixture();await f.c.GameWakeLock.refresh();assert.equal(f.requests(),0);
  f.c.state.entities=[];await f.c.GameWakeLock.refresh();
  assert.equal(f.requests(),1);assert.equal(f.c.GameWakeLock.status().held,true);
  f.c.state.over=true;await f.c.GameWakeLock.refresh();assert.ok(f.sentinels[0].released);
  f.c.state.over=false;await f.c.GameWakeLock.refresh();
  f.c.state.paused=true;await f.c.GameWakeLock.refresh();assert.ok(f.sentinels[1].released);
  f.c.state.paused=false;await f.c.GameWakeLock.refresh();
  f.c.frameElement={hidden:false,style:{},getAttribute:()=> 'true'};
  await f.c.GameWakeLock.refresh();assert.ok(f.sentinels[2].released);
  f.c.frameElement=null;await f.c.GameWakeLock.refresh();
  f.listeners.pagehide();assert.ok(f.sentinels[3].released);
});
test('visibility/OS release reacquires safely, without overlapping requests',async()=>{
  const f=wakeFixture();f.c.state.entities=[];await f.c.GameWakeLock.refresh();
  f.c.document.hidden=true;f.listeners.visibilitychange();await flush();
  assert.ok(f.sentinels[0].released);
  f.c.document.hidden=false;f.listeners.visibilitychange();await flush();
  assert.equal(f.requests(),2);f.sentinels[1].onRelease();assert.equal(f.c.GameWakeLock.status().held,false);
  f.advance(2100);await f.c.GameWakeLock.refresh();assert.equal(f.requests(),3);
});
test('unsupported and battery/policy-denied phones degrade safely and do not hammer requests',async()=>{
  const unsupported=wakeFixture({supported:false});unsupported.c.state.entities=[];
  await unsupported.c.GameWakeLock.refresh();assert.equal(unsupported.requests(),0);
  assert.equal(unsupported.c.GameWakeLock.status().supported,false);
  const denied=wakeFixture({deny:true});denied.c.state.entities=[];
  await denied.c.GameWakeLock.refresh();await denied.c.GameWakeLock.refresh();
  assert.equal(denied.requests(),1);assert.match(denied.c.GameWakeLock.status().error,/refused/);
  denied.advance(31000);await denied.c.GameWakeLock.refresh();assert.equal(denied.requests(),2);
});
test('a request that completes after leaving the fight releases rather than retaining a stale lock',async()=>{
  const f=wakeFixture({deferred:true});f.c.state.entities=[];
  const pending=f.c.GameWakeLock.refresh();await f.c.GameWakeLock.refresh();
  assert.equal(f.requests(),1);delete f.c.state.entities;f.resolve();await pending;
  assert.ok(f.sentinels[0].released);assert.equal(f.c.GameWakeLock.status().held,false);
});
