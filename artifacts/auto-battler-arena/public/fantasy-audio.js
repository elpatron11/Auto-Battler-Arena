/* Audio-only observers. No combat fields, callbacks, timers or RNG are changed. */
(function () {
  'use strict';
  const bank=window.FantasyAudioBank, cues=window.FantasyAudioCues;
  if(!bank || !cues) { console.warn('Fantasy audio: missing asset index or cues'); return; }
  const base=new URL('./audio/',document.currentScript.src);
  const buffers=new Map(),pending=new Map(),failedUntil=new Map(),active=new Set();
  const lastCue=new Map(),lastChoice=new Map(),lastVoice=new Map();
  const limit={routine:4,feature:4,voice:2,event:3,ui:1};
  const stats={played:{},dropped:0,cold:0,peak:0,errors:[],decodedBytes:0};
  let context=null,master=null,routine=null,featured=null,seed=0x581af ^ Date.now();
  let actor=null,healing=null,ultimateDepth=0,lastVocalAt=-Infinity,warming=null,currentVolume=-1;
  const now=()=>performance.now()/1000;
  // Audio randomness must never consume the simulation's Math.random stream.
  function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
  function profile(){return typeof playerProfile==='undefined'?null:playerProfile;}
  function enabled(){
    return !document.hidden && !(typeof balanceSimulationRunning!=='undefined'&&balanceSimulationRunning)
      && profile()?.sfxEnabled!==false;
  }
  function volume(){
    const v=profile()?.sfxVolume;
    return !enabled()?0:typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(1,v)):1;
  }
  function release(entry){
    if(!active.delete(entry))return;
    for(const node of entry.nodes)try{node.disconnect();}catch{}
  }
  function stop(entry){
    try{entry.source.stop();}catch{}
    release(entry);
  }
  function stopAll(){
    for(const entry of [...active])stop(entry);
    lastCue.clear();lastVoice.clear();lastVocalAt=-Infinity;
  }
  function sync(){
    const v=volume();
    if(master && v!==currentVolume){master.gain.value=v;currentVolume=v;}
    if(v===0)stopAll();
  }
  function graph(){
    const ctx=typeof audioCtx==='undefined'?null:audioCtx;
    if(!ctx || ctx.state!=='running')return false;
    if(context!==ctx){
      stopAll();buffers.clear();stats.decodedBytes=0;context=ctx;
      master=ctx.createGain();routine=ctx.createGain();featured=ctx.createGain();
      const compressor=ctx.createDynamicsCompressor();
      compressor.threshold.value=-14;compressor.knee.value=6;compressor.ratio.value=12;
      compressor.attack.value=.003;compressor.release.value=.16;
      const output=ctx.createGain();output.gain.value=.82;
      routine.connect(master);featured.connect(master);master.connect(compressor);
      compressor.connect(output);output.connect(ctx.destination);currentVolume=-1;
    }
    sync();return volume()>0;
  }
  function choose(key,files){
    let index=Math.floor(random()*files.length);
    if(files.length>1 && index===lastChoice.get(key))index=(index+1)%files.length;
    lastChoice.set(key,index);return files[index];
  }
  async function load(id){
    if(buffers.has(id))return buffers.get(id);
    if(pending.has(id))return pending.get(id);
    if(!bank[id] || !context || (failedUntil.get(id)||0)>now())return null;
    const decodingContext=context;
    const promise=(async()=>{
      try{
        const url=new URL(bank[id].file,base);
        if(bank[id].revision)url.searchParams.set('v',bank[id].revision);
        const response=await fetch(url,{cache:'force-cache'});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const buffer=await decodingContext.decodeAudioData(await response.arrayBuffer());
        if(context!==decodingContext)return null;
        const bytes=buffer.length*buffer.numberOfChannels*4;
        while(stats.decodedBytes+bytes>12*1024*1024 && buffers.size){
          const [oldId,old]=buffers.entries().next().value;
          buffers.delete(oldId);stats.decodedBytes-=old.length*old.numberOfChannels*4;
        }
        buffers.set(id,buffer);stats.decodedBytes+=bytes;
        return buffer;
      }catch(error){
        failedUntil.set(id,now()+30);
        if(stats.errors.length<12)stats.errors.push(`${id}: ${error.message}`);
        console.warn(`Fantasy audio could not load ${id}`,error.message);
        return null;
      }finally{pending.delete(id);}
    })();
    pending.set(id,promise);return promise;
  }
  async function warm(){
    if(!graph())return;
    if(warming)return warming;
    // Three background workers, not 74 simultaneous decodes on a phone.
    const ids=Object.keys(bank).sort((a,b)=>Number(a.startsWith('vocal/'))-Number(b.startsWith('vocal/')));
    let i=0;
    warming=Promise.all(Array.from({length:3},async()=>{
      while(i<ids.length && enabled() && context?.state==='running'){
        await load(ids[i++]);await new Promise(resolve=>setTimeout(resolve,8));
      }
    })).finally(()=>{warming=null;});
    return warming;
  }
  function admit(priority,group){
    for(const entry of [...active])if(entry.end<=context.currentTime)release(entry);
    const same=[...active].filter(entry=>entry.group===group);
    if(same.length>=(limit[group]||4)){
      const victim=same.find(entry=>entry.priority<priority);
      if(!victim){stats.dropped++;return false;}stop(victim);
    }
    if(active.size>=10){
      const victim=[...active].sort((a,b)=>a.priority-b.priority).find(entry=>entry.priority<priority);
      if(!victim){stats.dropped++;return false;}stop(victim);
    }
    return true;
  }
  function duck(seconds){
    window.GameMusic?.duck(seconds);
    const t=context.currentTime;
    routine.gain.cancelScheduledValues(t);
    routine.gain.setValueAtTime(.32,t);
    routine.gain.setValueAtTime(.32,t+Math.min(1.2,seconds));
    routine.gain.linearRampToValueAtTime(1,t+Math.min(1.2,seconds)+.18);
  }
  function playLayer(layer,priority,group,entity,key){
    const id=choose(key,layer.files),buffer=buffers.get(id);
    if(!buffer){stats.cold++;void load(id);return false;} // Never replay a stale hit after loading.
    if(id.startsWith('vocal/'))group='voice';
    if(!admit(priority,group))return false;
    buffers.delete(id);buffers.set(id,buffer); // Bounded LRU.
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;
    const variation=group==='voice'?.015:.045;
    const rate=(layer.rate||1)*(1+(random()-.5)*2*variation);
    source.playbackRate.value=rate;
    const duration=buffer.duration/rate,t=context.currentTime;
    gain.gain.setValueAtTime(0,t);
    gain.gain.linearRampToValueAtTime((layer.gain||.35)*(.93+random()*.14),t+.003);
    const nodes=[source,gain];source.connect(gain);
    let tail=gain;
    if(entity && Number.isFinite(entity.x) && typeof context.createStereoPanner==='function'){
      const pan=context.createStereoPanner();
      const width=typeof ARENA_W==='number'?ARENA_W:1000;
      pan.pan.value=Math.max(-.35,Math.min(.35,(entity.x/width-.5)*.7));
      gain.connect(pan);tail=pan;nodes.push(pan);
    }
    tail.connect(group==='routine'?routine:featured);
    const entry={source,nodes,priority,group,end:t+duration};
    source.onended=()=>release(entry);active.add(entry);
    stats.peak=Math.max(stats.peak,active.size);
    if(priority>=4)duck(duration);
    source.start(t);return true;
  }
  function retainedUi(name){
    if(!graph())return;
    const heal=name==='heal',key=heal?'heal':'ui',group=heal?'routine':'ui';
    const t=context.currentTime;
    if(t-(lastCue.get(key)??-Infinity)<(heal?.55:.075))return;
    lastCue.set(key,t);
    if(!admit(heal?0:1,group))return;
    // Preserve the original short triangle click and ascending purchase chord.
    const freqs=name==='purchase'?[660,880,1100]:[heal?780:520],nodes=[],oscillators=[];
    const end=t+(name==='purchase'?.31:heal?.09:.085);
    for(let i=0;i<freqs.length;i++){
      const osc=context.createOscillator(),gain=context.createGain(),start=t+i*.055;
      osc.type=heal?'sine':'triangle';osc.frequency.setValueAtTime(freqs[i],start);
      if(name==='button')osc.frequency.exponentialRampToValueAtTime(650,start+.055);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.linearRampToValueAtTime(name==='purchase'?.08/Math.sqrt(3):heal?.028:.035,start+.012);
      gain.gain.exponentialRampToValueAtTime(.0001,start+(name==='purchase'?.16:heal?.065:.055));
      osc.connect(gain);gain.connect(heal?routine:featured);nodes.push(osc,gain);oscillators.push(osc);
      osc.start(start);osc.stop(start+(name==='purchase'?.19:heal?.09:.085));
    }
    const entry={source:{stop(){for(const osc of oscillators)try{osc.stop();}catch{}}},nodes,priority:heal?0:1,group,end};
    oscillators.at(-1).onended=()=>release(entry);active.add(entry);
    stats.played[name]=(stats.played[name]||0)+1;stats.peak=Math.max(stats.peak,active.size);
  }
  function emit(name,entity=actor){
    if(!enabled())return false;
    if(name==='button'||name==='purchase'||name==='heal'){
      if(name==='heal' && healing && healing.target.hp<=healing.before)return false;
      retainedUi(name);return true;
    }
    const cue=cues[name];if(!cue || !graph())return false;
    const t=context.currentTime;
    if(t-(lastCue.get(name)??-Infinity)<cue.gap){stats.dropped++;return false;}
    lastCue.set(name,t);
    const empowered=ultimateDepth>0 && /^(bearform|tigerform|purge|vanish|fireshock|blizzard)$/.test(name);
    const priority=empowered?4:cue.priority;
    let played=false;
    if(empowered)played=playLayer({files:['events/ultimate'],gain:.5},4,'feature',entity,'empowered');
    for(let i=0;i<cue.layers.length;i++)played=playLayer(cue.layers[i],priority,cue.group,entity,`${name}:${i}`)||played;
    if(played)stats.played[name]=(stats.played[name]||0)+1;
    return played;
  }
  const voiceFamily={warrior:'soldier',paladin:'knight',rogue:'agile',warlock:'mystic',
    shaman:'mystic',druid:'knight',frostmage:'female',priest:'female',archer:'female'};
  function vocal(entity,kind,force=false){
    if(!entity || entity.isPet || !enabled() || !graph())return;
    const t=context.currentTime,id=entity.id??entity.classId;
    if(kind!=='death'){
      if(t-lastVocalAt<.85 || t-(lastVoice.get(id)??-Infinity)<3)return;
      if(!force && random()>.22)return;
    }
    const family=voiceFamily[entity.classId]||'mystic';
    let files=kind==='death'||kind==='cry'?[`vocal/${family}-${kind==='cry'&&family==='female'?'effort-2':kind}`]
      :[1,2].map(i=>`vocal/${family}-${kind}-${i}`);
    if(kind==='laugh')files=[entity.classId==='priest'?'vocal/female-laugh':'vocal/dark-laugh'];
    if(entity.classId==='druid' && ['bear','tiger'].includes(entity.extra?.form))
      files=[`vocal/beast-${kind==='death'?'death':'effort'}`];
    if(playLayer({files,gain:kind==='death'?.68:kind==='hurt'?.44:.48},
      kind==='death'?5:kind==='cry'?4:1,'voice',entity,`${family}:${kind}`)){
      lastVoice.set(id,t);lastVocalAt=t;
      stats.played[`vocal:${kind}`]=(stats.played[`vocal:${kind}`]||0)+1;
    }
  }
  function guarded(callback){try{callback();}catch(error){
    if(stats.errors.length<12)stats.errors.push(`Playback: ${error.message}`);
  }}
  function attack(entity){
    const cls=entity.classId.replace('pet-','');
    const sound=cls==='druid'?(entity.extra?.form==='bear'?'bodyHit':entity.extra?.form==='tiger'?'claw':'axe')
      :({warrior:'sword',rogue:'dagger',paladin:'hammer',archer:'bow',frostmage:'frostAttack',
        priest:entity.extra?.shadowForm>0?'shadowAttack':'holyAttack',warlock:'shadowAttack',shaman:'axe'}[cls]||'claw');
    emit(sound,entity);vocal(entity,'effort');
  }
  function impact(source,target,opts){
    const cls=source?.classId?.replace('pet-',''),tag=String(opts?.tag||'').toLowerCase();
    const sound=/frost|glacial|ice|blizzard/.test(tag)?'frostHit'
      :/fire|flame|shock|lightning/.test(tag)?'fireshock'
      :/shadow|umbral|chaos|doom|hex/.test(tag)?'shadowHit'
      :/radiant|smite/.test(tag)?'holyHit'
      :({warrior:'bladeHit',rogue:'bladeHit',paladin:'hammerHit',archer:'arrowHit',
        frostmage:'frostHit',warlock:'shadowHit',priest:source?.extra?.shadowForm>0?'shadowHit':'holyHit',
        druid:'bodyHit',shaman:'axeHit'}[cls]||'bodyHit');
    emit(sound,target);if(target.alive)vocal(target,'hurt');
  }
  function observe(name,before,after,contextIndex,isUltimate=false){
    const original=window[name];if(typeof original!=='function')return;
    window[name]=function(...args){
      const savedActor=actor,savedDepth=ultimateDepth;
      if(contextIndex!==undefined)actor=args[contextIndex];
      if(isUltimate)ultimateDepth++;
      let snapshot;
      guarded(()=>{snapshot=before?.(args);});
      try{
        const result=original.apply(this,args);
        guarded(()=>after?.(args,snapshot,result));
        return result;
      }finally{actor=savedActor;ultimateDepth=savedDepth;}
    };
  }
  // Replace audio functions, never combat bodies or animation callbacks.
  window.classAttackSfx=function(e){guarded(()=>attack(e));};
  window.classAttackAccent=function(){};
  window.classCastSfx=function(cls){guarded(()=>{
    emit(({frostmage:'castFrost',priest:actor?.extra?.shadowForm>0?'castShadow':'castHoly',
      warlock:'castShadow',druid:'castNature',shaman:'castNature'}[cls]||'castSteel'),actor);
  });};
  window.sfx=function(name){guarded(()=>{
    if(!enabled() || !graph())return;
    if(name==='meleehit'||name==='rangedhit')return; // Outcome-aware material observer replaces these.
    if(name.startsWith('death')){
      emit('death',actor);
      if(actor?.isPet)playLayer({files:['vocal/beast-death'],gain:.5},5,'voice',actor,'pet-death');
      else vocal(actor||{classId:name.replace('death_',''),id:name},'death',true);
      return;
    }
    emit(name);
    if(name==='charge'||name==='rampage')vocal(actor,'cry',true);
    if(name==='darkpact'||name==='shadowform')vocal(actor,'laugh',true);
  });};
  observe('dealDamage',args=>({hp:args[1].hp,shield:args[1].status.shield}),([source,target,,opts],before)=>{
    if(!before || opts?.isDot)return;
    if(target.status.shield<before.shield){
      emit(target.status.shield<=0?'shieldBreak':'shieldBlock',target);
    }
    if(target.hp<before.hp)impact(source,target,opts);
  });
  observe('handleDeath',null,null,0);
  observe('healTarget',null,null,0);
  const originalHeal=window.healTarget;
  if(typeof originalHeal==='function')window.healTarget=function(source,target,...args){
    const previous=healing;healing={target,before:target.hp};
    try{return originalHeal.call(this,source,target,...args);}finally{healing=previous;}
  };
  observe('abilityLabel',null,null,0);
  observe('spawnStatusBurst',null,([target,kind])=>{
    const sound={fear:'fear',stun:'stun',impact:'stun',holy:'stun',daze:'stun',freeze:'freeze',
      disorient:'disorient',sap:'sap',poison:'poison',entangle:'entangle'}[kind];
    if(sound)emit(sound,target);
  });
  observe('interruptCast',args=>args[0].casting,([target],before)=>{
    if(before && before!==target.casting)emit('interrupt',target);
  });
  observe('addDot',args=>args[0].status.dots.length,([target,,,,,name],before)=>{
    if(target.status.dots.length>before && /poison|venom/i.test(name))emit('poison',target);
  });
  for(const name of Object.keys(window)){
    if(/^cast[A-Z]/.test(name)){
      const isUltimate=/(Ulti|ShadowForm)$/.test(name);
      observe(name,args=>args[0]?.casting,([entity],previous)=>{
        if(isUltimate && entity?.casting && entity.casting!==previous){
          emit('ultimate',entity);vocal(entity,'effort',true);
        }
      },0,isUltimate);
    }
  }
  observe('setMusicMode',null,([mode])=>{
    if(mode==='battle'){lastVoice.clear();lastCue.clear();emit('matchstart');}
    else if(mode==='menu')stopAll();
    void warm();
  });
  observe('syncAudioSettings',null,sync);
  const unlock=()=>guarded(()=>{
    if(!enabled())return;
    if(typeof ensureAudio==='function')ensureAudio();
    const ctx=typeof audioCtx==='undefined'?null:audioCtx;
    if(ctx && ctx.state!=='running')void ctx.resume().then(()=>warm()).catch(()=>{});
    else void warm();
  });
  document.addEventListener('pointerdown',unlock,{passive:true});
  document.addEventListener('keydown',unlock,{passive:true});
  document.addEventListener('change',()=>{guarded(sync);if(enabled())unlock();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll();});
  window.addEventListener('message',()=>guarded(sync));
  window.FantasyAudio={
    warm,emit,stop:stopAll,
    metrics:()=>({...stats,played:{...stats.played},errors:[...stats.errors],
      active:active.size,loaded:buffers.size,pending:pending.size,context:context?.state||'locked'}),
  };
})();
