/* Stream composed music, separately from the SFX cache and master gain. */
(function(){
  'use strict';
  const base=new URL('./audio/music/',document.currentScript.src);
  const audio=new Audio();audio.preload='none';audio.loop=true;
  const nativeStop=window.stopGameMusic;
  let mode='menu',unlocked=false,gain=null,source=null,ctx=null,playPending=false;
  let duckTimer=null,lastError=null,playingFile=null;
  const profile=()=>typeof playerProfile==='undefined'?null:playerProfile;
  const enabled=()=>profile()?.musicEnabled!==false && !document.hidden;
  // Native matches have entities/over and a battleMode body class, not
  // state.running. Legacy settings refreshes therefore incorrectly request
  // menu music during combat; the actual visible fight owns the soundtrack.
  function fightActive(){
    return typeof state!=='undefined' && !!state && !state.over &&
      !!document.body?.classList.contains('battleMode');
  }
  function level(){
    const v=profile()?.musicVolume;
    return (mode==='battle'?.28:.45)*(typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(1,v)):1);
  }
  function connect(){
    if(typeof ensureAudio==='function')ensureAudio();
    const next=typeof audioCtx==='undefined'?null:audioCtx;
    if(next && !source && typeof next.createMediaElementSource==='function'){
      ctx=next;source=ctx.createMediaElementSource(audio);gain=ctx.createGain();
      source.connect(gain);gain.connect(ctx.destination);audio.volume=1;
    }
    if(gain)gain.gain.value=level();else audio.volume=level();
  }
  function stop(){
    if(typeof nativeStop==='function')nativeStop();
    clearTimeout(duckTimer);audio.pause();
    if(gain){gain.gain.cancelScheduledValues(ctx.currentTime);gain.gain.value=0;}
  }
  function sync(){
    mode=fightActive()?'battle':'menu';
    if(typeof musicMode!=='undefined')musicMode=mode;
    if(!unlocked || !enabled()){stop();return;}
    const file=mode==='battle'?'battle.mp3':'menu.mp3';
    if(file!==playingFile){audio.pause();audio.src=new URL(file,base).href;playingFile=file;}
    try{connect();}catch(error){lastError=error.message;audio.volume=level();}
    if(audio.paused && !playPending){
      playPending=true;
      let result;
      try{result=audio.play();}catch(error){lastError=error.message;playPending=false;return;}
      Promise.resolve(result).then(()=>{lastError=null;if(!enabled())stop();})
        .catch(error=>{lastError=error.message;})
        .finally(()=>{
          playPending=false;
          if(unlocked && enabled() && playingFile!==file)sync();
        });
    }
  }
  // Keep native music fields current, without starting the old beep sequencer.
  window.musicNote=function(){};
  window.stopGameMusic=stop;
  window.setMusicMode=function(next){
    if(typeof nativeStop==='function')nativeStop();
    mode=next==='battle'?'battle':'menu';
    if(typeof musicMode!=='undefined')musicMode=mode;
    sync();
  };
  // Start runs through several preparatory dialogs before combat really begins.
  // Observe the completed call, without writing state or changing its return.
  const nativeStart=window.startBattle;
  if(typeof nativeStart==='function')window.startBattle=function(...args){
    try{return nativeStart.apply(this,args);}finally{sync();}
  };
  if(typeof MutationObserver==='function' && document.body){
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  }
  const unlock=()=>{
    unlocked=true;
    if(ctx && ctx.state!=='running')void ctx.resume().then(sync).catch(()=>{});
    else sync();
  };
  document.addEventListener('pointerdown',unlock,{passive:true});
  document.addEventListener('keydown',unlock,{passive:true});
  document.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('message',sync);
  window.addEventListener('pagehide',stop);
  audio.addEventListener('error',()=>{
    lastError=`Music load error ${audio.error?.code||'unknown'}`;
    console.warn('Fantasy music:',lastError);
  });
  window.GameMusic={
    sync,
    isFightActive:fightActive,
    duck(seconds=.9){
      if(!gain || !enabled())return;
      const t=ctx.currentTime;
      gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(level()*.6,t,.025);
      clearTimeout(duckTimer);
      duckTimer=setTimeout(()=>{if(enabled())gain.gain.setTargetAtTime(level(),ctx.currentTime,.15);},Math.min(1.5,seconds)*1000);
    },
    status:()=>({mode,playing:!audio.paused,unlocked,file:playingFile,error:lastError}),
  };
  stop();
})();
