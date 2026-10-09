/* Best-effort, visible-fight-only screen wake lock. No combat state writes. */
(function(){
  'use strict';
  const supported=!!navigator.wakeLock?.request;
  let lock=null,pending=false,retryAt=0,lastError=null,disposed=false;
  function wanted(){
    if(disposed || document.hidden)return false;
    if(typeof state==='undefined' || !state || state.over || state.paused ||
      !document.body?.classList.contains('battleMode'))return false;
    try{
      const frame=window.frameElement;
      if(frame && (frame.hidden || frame.getAttribute('aria-hidden')==='true' ||
        frame.style.display==='none'))return false;
    }catch{}
    return true;
  }
  function release(){
    const previous=lock;lock=null;
    if(previous)void previous.release().catch(()=>{});
  }
  async function refresh(force=false){
    if(!wanted()){release();return;}
    if(!supported || lock || pending || (!force && Date.now()<retryAt))return;
    pending=true;
    try{
      const sentinel=await navigator.wakeLock.request('screen');
      if(!wanted()){await sentinel.release();return;}
      lock=sentinel;lastError=null;
      sentinel.addEventListener('release',()=>{
        if(lock===sentinel){lock=null;retryAt=Date.now()+2000;}
      });
    }catch(error){lastError=error.message;retryAt=Date.now()+30000;}
    finally{pending=false;}
  }
  const active=()=>{retryAt=0;void refresh(true);};
  document.addEventListener('visibilitychange',active);
  document.addEventListener('pointerdown',active,{passive:true});
  document.addEventListener('keydown',active,{passive:true});
  window.addEventListener('message',()=>{void refresh();});
  window.addEventListener('pageshow',()=>{disposed=false;active();});
  window.addEventListener('pagehide',()=>{disposed=true;release();});
  if(supported)setInterval(()=>{void refresh();},1000);
  window.GameWakeLock={
    refresh,
    status:()=>({supported,held:!!lock,pending,error:lastError}),
  };
})();
