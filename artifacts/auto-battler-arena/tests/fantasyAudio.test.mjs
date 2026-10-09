import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import vm from 'node:vm';
const root=new URL('../public/',import.meta.url);
const read=file=>readFileSync(new URL(file,root),'utf8');
const manifest=JSON.parse(read('audio/manifest.json'));
const scripts=['audio/bank.js','fantasy-audio-cues.js','fantasy-audio.js'].map(read);
async function fixture({locked=false,muted=false,failed=false}={}){
  const nodes=[],listeners={},events=[],calls=[],math=Object.create(Math);
  let randomCalls=0;
  math.random=()=>{randomCalls++;throw Error('Audio consumed combat RNG');};
  function param(){return {value:1,setValueAtTime(v,t){this.value=v;events.push(['set',v,t]);},
    linearRampToValueAtTime(v,t){this.value=v;events.push(['ramp',v,t]);},
    exponentialRampToValueAtTime(){},cancelScheduledValues(){}};}
  function node(kind){
    const n={kind,gain:param(),frequency:param(),pan:param(),playbackRate:param(),
      connect(){},disconnect(){this.disconnected=true;},start(t){this.startTime=t;},
      stop(t){if(t===undefined){this.stopped=true;this.onended?.();}}};
    nodes.push(n);return n;
  }
  const audio={state:locked?'suspended':'running',currentTime:0,destination:{},
    createGain:()=>node('gain'),createBufferSource:()=>node('sample'),
    createOscillator:()=>node('osc'),createStereoPanner:()=>node('pan'),
    createDynamicsCompressor(){return {connect(){},threshold:param(),knee:param(),
      ratio:param(),attack:param(),release:param()};},
    async resume(){this.state='running';},
    async decodeAudioData(data){
      const id=Buffer.from(data).toString(),a=manifest.assets[id];
      return {id,duration:a.duration,length:Math.ceil(a.duration*48000),numberOfChannels:1};
    }};
  const c=vm.createContext({URL,console:{warn(){}},Date,Math:math,setTimeout,
    performance:{now:()=>audio.currentTime*1000},ARENA_W:1000,audioCtx:audio,
    balanceSimulationRunning:false,playerProfile:{sfxEnabled:!muted,musicEnabled:true},
    document:{hidden:false,currentScript:{src:'https://arena.test/prefix/fantasy-audio.js'},
      addEventListener(name,fn){(listeners[name]||=[]).push(fn);}},
    addEventListener(name,fn){(listeners[name]||=[]).push(fn);},
    ensureAudio(){},
    fetch:async url=>{
      calls.push(String(url));const file=new URL(url).pathname.split('/audio/')[1];
      const id=Object.keys(manifest.assets).find(id=>manifest.assets[id].file===file);
      assert.ok(id,'real bank path');
      return {ok:!failed,status:failed?404:200,arrayBuffer:async()=>Buffer.from(id)};
    }});
  c.window=c;
  c.sfx=()=>{throw Error('Old synthetic combat cue called');};
  c.classCastSfx=c.classAttackSfx=c.classAttackAccent=()=>{throw Error('Old beep helper called');};
  c.abilityLabel=()=>{};
  c.healTarget=(source,target,amount)=>{
    const before=target.hp;target.hp=Math.min(target.maxHp||100,target.hp+amount);
    c.sfx('heal');return target.hp-before;
  };
  c.spawnStatusBurst=(target,kind)=>{target.bursts=(target.bursts||0)+1;return kind;};
  c.handleDeath=(target,source)=>{target.alive=false;target.hp=0;c.sfx('death_'+target.classId);return source;};
  c.dealDamage=(source,target,amount,opts={})=>{
    if(target.immune)return 0;
    const absorbed=Math.min(target.status.shield,amount);
    target.status.shield-=absorbed;
    const damage=amount-absorbed;target.hp=Math.max(0,target.hp-damage);
    if(target.hp===0)c.handleDeath(target,source);
    if(damage>0&&!opts.isDot)c.sfx(source?.melee?'meleehit':'rangedhit');
    return damage;
  };
  c.interruptCast=target=>{
    if(!target.casting)return;
    const cast=target.casting;target.casting=null;cast.onInterrupt?.();
  };
  c.addDot=(target,source,damage,interval,duration,name)=>{
    if(target.immune)return false;
    target.status.dots.push({name,damage});return true;
  };
  c.castCharge=(actor,target)=>{
    if(!target)return false;
    actor.cd=5;c.sfx('charge');return 'charged';
  };
  c.castDruidUlti=actor=>{actor.cd=12;c.sfx('bearform');return 12;};
  c.castChannelUlti=actor=>{actor.casting={timeLeft:3};return actor.casting;};
  c.setMusicMode=mode=>{c.musicMode=mode;};
  c.syncAudioSettings=()=>{};
  for(const script of scripts)vm.runInContext(script,c);
  if(!locked&&!muted)await c.FantasyAudio.warm();
  const unit=(id,classId='warrior',extra={})=>({id,classId,hp:100,alive:true,melee:true,
    x:200,status:{shield:0,dots:[]},extra:{},...extra});
  return {c,api:c.FantasyAudio,audio,nodes,events,calls,unit,listeners,
    randomCalls:()=>randomCalls,advance:t=>audio.currentTime+=t};
}
test('every imported asset is small, intact and traceable to an explicit commercial license',()=>{
  assert.equal(Object.keys(manifest.assets).length,74);
  let bytes=0;
  for(const [id,a]of Object.entries(manifest.assets)){
    const file=readFileSync(new URL('audio/'+a.file,root));bytes+=file.length;
    assert.equal(createHash('sha256').update(file).digest('hex'),a.sha256,id);
    assert.equal(file.length,a.bytes);assert.ok(file.length>500);
    assert.ok(a.duration>0 && a.duration<2.15,id);
    assert.ok(['CC0-1.0','CC-BY-SA-3.0'].includes(a.license));
    assert.ok(a.creator && a.original && a.edits && a.sourcePage.startsWith('https://'));
    assert.match(a.sourceSha256,/^[a-f0-9]{64}$/);
    if(a.license==='CC-BY-SA-3.0')assert.equal(id,'weapon/bow-release');
  }
  assert.ok(bytes<512*1024,'less than half a MiB of audio');
  assert.match(read('audio/LICENSES.md'),/dorkster.*qubodup.*remaxim/s);
  assert.match(read('game.html'),/audio\/credits\.html/);
});
test('all original named triggers and every layered sample have a replacement',async()=>{
  const f=await fixture(),text=read('game.html');
  const old=text.slice(text.indexOf('const SFX ='),text.indexOf('let lastAdaptiveSfxAt'));
  for(const name of [...old.matchAll(/^\s{2}(\w+):/gm)].map(m=>m[1])){
    if(name.startsWith('death')||['meleehit','rangedhit','button','purchase'].includes(name))continue;
    assert.ok(f.c.FantasyAudioCues[name],name);
  }
  for(const cue of Object.values(f.c.FantasyAudioCues))
    for(const layer of cue.layers)for(const id of layer.files)assert.ok(f.c.FantasyAudioBank[id],id);
});
test('material impacts follow real damage, not immune attempts or repeated DoT ticks',async()=>{
  const f=await fixture(),a=f.unit(1),b=f.unit(2);
  b.immune=true;assert.equal(f.c.dealDamage(a,b,20),0);
  assert.equal(f.api.metrics().played.bladeHit,undefined);
  b.immune=false;assert.equal(f.c.dealDamage(a,b,20),20);
  assert.equal(b.hp,80);assert.equal(f.api.metrics().played.bladeHit,1);
  f.advance(1);f.c.dealDamage(a,b,3,{isDot:true});
  assert.equal(f.api.metrics().played.bladeHit,1);
  assert.equal(b.hp,77);
});
test('absorbed damage produces a block, a depleted shield produces a break',async()=>{
  const f=await fixture(),a=f.unit(1),b=f.unit(2);b.status.shield=30;
  assert.equal(f.c.dealDamage(a,b,20),0);assert.equal(b.hp,100);
  assert.equal(f.api.metrics().played.shieldBlock,1);
  assert.equal(f.api.metrics().played.bladeHit,undefined);
  f.advance(.3);assert.equal(f.c.dealDamage(a,b,20),10);
  assert.equal(f.api.metrics().played.shieldBreak,1);assert.equal(b.hp,90);
});
test('death vocals occur at the existing death trigger, with no extra pain or changed result',async()=>{
  const f=await fixture(),a=f.unit(1),b=f.unit(2,'priest');
  assert.equal(f.c.dealDamage(a,b,100),100);
  assert.equal(b.alive,false);assert.equal(b.hp,0);
  assert.equal(f.api.metrics().played['vocal:death'],1);
  assert.equal(f.api.metrics().played['vocal:hurt'],undefined);
  assert.ok(f.nodes.some(n=>n.buffer?.id==='vocal/female-death'));
  assert.equal(f.api.metrics().errors.length,0);
});
test('pets die with creature sounds, never a human class voice',async()=>{
  const f=await fixture(),a=f.unit(1),pet=f.unit(2,'pet-archer-snake',{isPet:true});
  f.c.dealDamage(a,pet,100);
  assert.ok(f.nodes.some(n=>n.buffer?.id==='vocal/beast-death'));
  assert.equal(f.api.metrics().played['vocal:death'],undefined);
});
test('legacy standalone death calls work without a combat position',async()=>{
  const f=await fixture();f.c.sfx('death_warrior');
  assert.equal(f.api.metrics().played['vocal:death'],1);
  assert.equal(f.api.metrics().errors.length,0);
});
test('healing is a tiny sine beep, coalesces simultaneous HoTs and skips full-health healing',async()=>{
  const f=await fixture(),a=f.unit(1),b=f.unit(2);
  assert.equal(f.c.healTarget(a,b,5),0);
  assert.equal(f.api.metrics().played.heal,undefined);
  b.hp=80;assert.equal(f.c.healTarget(a,b,5),5);
  assert.equal(f.api.metrics().played.heal,1);
  f.c.healTarget(a,b,5);assert.equal(f.api.metrics().played.heal,1);
  const beep=f.nodes.find(n=>n.kind==='osc');
  assert.equal(beep.type,'sine');assert.equal(beep.frequency.value,780);
  assert.ok(!f.nodes.some(n=>n.buffer?.id==='spell/holy'));
});
test('casting and icy spell layers contain no pan-like metal or glass recordings',()=>{
  for(const id of ['spell/projectile','spell/holy','spell/magic-1','spell/magic-2',
    'spell/ice-crack-1','spell/ice-crack-2','spell/ice-crack-3']){
    assert.match(manifest.assets[id].original,/Audio\/cloth\d\.ogg$/);
    assert.equal(manifest.assets[id].creator,'Kenney');
  }
});
test('interrupt and poison sounds require accepted transitions; observers return exact original values',async()=>{
  const f=await fixture(),a=f.unit(1),b=f.unit(2);let interrupted=0;
  f.c.interruptCast(b);assert.equal(f.api.metrics().played.interrupt,undefined);
  b.casting={onInterrupt(){interrupted++;}};
  f.c.interruptCast(b);assert.equal(interrupted,1);assert.equal(b.casting,null);
  assert.equal(f.api.metrics().played.interrupt,1);
  b.immune=true;assert.equal(f.c.addDot(b,a,2,1,3,'Poison'),false);
  assert.equal(f.api.metrics().played.poison,undefined);
  b.immune=false;assert.equal(f.c.addDot(b,a,2,1,3,'Poison'),true);
  assert.equal(f.api.metrics().played.poison,1);
  assert.equal(f.c.castCharge(a,null),false);
  assert.equal(f.api.metrics().played.charge,undefined);
  assert.equal(f.c.castCharge(a,b),'charged');assert.equal(a.cd,5);
  assert.equal(f.api.metrics().played.charge,1);
  assert.equal(f.api.metrics().played['vocal:cry'],1);
});
test('accepted CC retains visual behavior, with prominent audio and no writes to its timers',async()=>{
  const f=await fixture(),b=f.unit(2);
  for(const kind of ['fear','freeze','stun','disorient','sap']){
    f.advance(.5);assert.equal(f.c.spawnStatusBurst(b,kind),kind);
    assert.ok(f.api.metrics().played[kind],kind);
  }
  assert.equal(b.bursts,5);assert.deepEqual(b.status,{shield:0,dots:[]});
});
test('ultimate form and channel sounds are prioritized without changing any cooldown or cast',async()=>{
  const f=await fixture(),a=f.unit(1,'druid');
  assert.equal(f.c.castDruidUlti(a),12);assert.equal(a.cd,12);
  assert.ok(f.nodes.some(n=>n.buffer?.id==='events/ultimate'));
  f.advance(2);const casting=f.c.castChannelUlti(a);
  assert.equal(casting,a.casting);assert.equal(casting.timeLeft,3);
  assert.equal(f.api.metrics().played.ultimate,1);
});
test('rapid 3v3 bursts stay bounded, coalesce repeats and let ultimates/deaths duck routine hits',async()=>{
  const f=await fixture();
  for(let frame=0;frame<120;frame++){
    f.advance(1/60);
    for(let actor=0;actor<6;actor++)f.c.classAttackSfx(f.unit(actor,['warrior','rogue','paladin','archer','frostmage','warlock'][actor]));
    if(frame%30===0)f.api.emit('divinestand');
    assert.ok(f.api.metrics().active<=10);
  }
  const m=f.api.metrics();assert.ok(m.dropped>100);assert.ok(m.peak<=10);
  assert.ok((m.played['vocal:effort']||0)<6);
  assert.ok(m.played.divinestand>0);
  assert.ok(f.events.some(e=>e[0]==='set'&&e[1]===.32),'routine ducking');
  assert.equal(f.randomCalls(),0);assert.equal(m.errors.length,0);
});
test('recorded variants avoid immediate repeats and keep pitch changes subtle',async()=>{
  const f=await fixture();
  for(let i=0;i<8;i++){f.advance(1);f.api.emit('sword');}
  const sounds=f.nodes.filter(n=>n.kind==='sample'&&n.buffer?.id.startsWith('weapon/sword-swing'));
  assert.equal(sounds.length,8);
  for(let i=1;i<sounds.length;i++)assert.notEqual(sounds[i].buffer.id,sounds[i-1].buffer.id);
  for(const n of sounds)assert.ok(n.playbackRate.value>=.955&&n.playbackRate.value<=1.045);
});
test('mute, zero volume, simulations and backgrounding silence every category including accents and pets',async()=>{
  const f=await fixture(),pet=f.unit(3,'pet-archer-snake',{isPet:true});
  f.api.emit('charge');assert.ok(f.api.metrics().active>0);
  f.c.playerProfile.sfxEnabled=false;f.listeners.change[0]();
  assert.equal(f.api.metrics().active,0);const count=f.nodes.length;
  f.c.classAttackSfx(f.unit(1));f.c.classCastSfx('warrior');f.c.sfx('death_pet-archer-snake');
  f.c.handleDeath(pet,null);f.c.sfx('button');assert.equal(f.nodes.length,count);
  f.c.playerProfile.sfxEnabled=true;f.c.playerProfile.sfxVolume=0;
  f.c.sfx('victory');assert.equal(f.api.metrics().active,0);
  f.c.playerProfile.sfxVolume=.5;f.c.balanceSimulationRunning=true;
  f.c.sfx('charge');assert.equal(f.api.metrics().active,0);
  f.c.balanceSimulationRunning=false;f.advance(1);f.c.sfx('charge');
  assert.ok(f.api.metrics().active>0);
  f.c.document.hidden=true;f.listeners.visibilitychange[0]();
  assert.equal(f.api.metrics().active,0);f.c.sfx('victory');
  assert.equal(f.api.metrics().active,0);assert.equal(f.api.metrics().errors.length,0);
  assert.equal(f.c.playerProfile.musicEnabled,true);
});
test('locked contexts stay quiet until user interaction; assets stay under the artifact path',async()=>{
  const f=await fixture({locked:true});f.c.sfx('charge');
  assert.equal(f.calls.length,0);assert.equal(f.api.metrics().active,0);
  f.listeners.pointerdown[0]();await new Promise(resolve=>setTimeout(resolve,300));
  await f.api.warm();assert.equal(f.api.metrics().loaded,74);
  assert.ok(f.calls.every(url=>url.startsWith('https://arena.test/prefix/audio/')));
  assert.ok(f.calls.every(url=>/[?&]v=[a-f0-9]{12}/.test(url)),'changed audio must not reuse stale cached pan sounds');
  assert.ok(f.api.metrics().decodedBytes<=12*1024*1024);
});
test('failed downloads are surfaced, backed off and never replaced with Atari-style combat fallbacks',async()=>{
  const f=await fixture({failed:true});const count=f.calls.length;
  f.c.classAttackSfx(f.unit(1));f.c.sfx('charge');
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.calls.length,count);assert.ok(f.api.metrics().errors.length>0);
  assert.equal(f.api.metrics().active,0);
});
