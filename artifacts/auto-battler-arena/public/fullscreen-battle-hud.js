(function(){
  'use strict';
  let host=window;
  try{if(window.parent.document)host=window.parent;}catch(_){}
  const body=document.body,screen=document.getElementById('battleScreen');
  const wrap=document.getElementById('arenaWrap');
  if(!screen||!wrap)return;
  let scheduled=false;
  function setClass(name,value){
    if(body.classList.contains(name)!==value)body.classList.toggle(name,value);
  }
  function setProperty(name,value){
    if(screen.style.getPropertyValue(name)!==value)screen.style.setProperty(name,value);
  }
  function update(){
    scheduled=false;
    const fullscreen=host.document.fullscreenElement||host.document.webkitFullscreenElement;
    const wide=host.matchMedia('(orientation:landscape)').matches;
    const active=body.classList.contains('battleMode')&&
      (body.classList.contains('phoneLandscapeBattle')||!!fullscreen&&wide||
       wide&&(host.navigator.standalone===true||host.matchMedia('(display-mode:standalone)').matches));
    setClass('fullscreenBattleHud',!!active);
    if(!active){
      setClass('healthMarginsUnavailable',false);
      return;
    }
    // Remove a previously opened skills popover when entering the compact view.
    if(body.classList.contains('landscape-loadout-open'))body.classList.remove('landscape-loadout-open');
    document.getElementById('landscapeLoadoutBtn')?.setAttribute('aria-expanded','false');
    const map=wrap.getBoundingClientRect(),bounds=screen.getBoundingClientRect();
    const margin=Math.min(map.left-bounds.left,bounds.right-map.right);
    setClass('healthMarginsUnavailable',margin<46);
    setProperty('--battle-health-width',Math.max(0,Math.min(200,margin-8)).toFixed(1)+'px');
    // Leave room for the existing upper controls and bottom racial ability.
    setProperty('--battle-health-top',(map.top-bounds.top+46).toFixed(1)+'px');
    setProperty('--battle-health-height',Math.max(0,map.height-126).toFixed(1)+'px');
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;requestAnimationFrame(update);
  }
  const observer=new MutationObserver(schedule);
  observer.observe(body,{attributes:true,attributeFilter:['class']});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  resize?.observe(wrap);resize?.observe(screen);
  host.addEventListener('resize',schedule);
  host.addEventListener('orientationchange',schedule);
  host.visualViewport?.addEventListener('resize',schedule);
  host.document.addEventListener('fullscreenchange',schedule);
  host.document.addEventListener('webkitfullscreenchange',schedule);
  window.addEventListener('pagehide',event=>{
    if(event.persisted)return;
    observer.disconnect();resize?.disconnect();
    host.removeEventListener('resize',schedule);
    host.removeEventListener('orientationchange',schedule);
    host.visualViewport?.removeEventListener('resize',schedule);
    host.document.removeEventListener('fullscreenchange',schedule);
    host.document.removeEventListener('webkitfullscreenchange',schedule);
  });
  schedule();
})();
