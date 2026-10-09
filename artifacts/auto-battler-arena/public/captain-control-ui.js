(function(){
'use strict';
var CC=function(){return window.CaptainControl};
var V=function(){try{var c=CC();return c&&c.view?c.view():null}catch(e){return null}};
var $=function(i){return document.getElementById(i)};
var sels=[],battle,stick,stickZone,knob,msg,btnWrap,last=null,stickPid=null,btnPtr={},timer=null;
var stickCenter=null,stickHome=null,stickBounds=null;
var racialHome=null,racialButton=null,racialCountdown=null,racialAttrs=null,ownedTouches=new Set();
function mk(t,c,h){var e=document.createElement(t);if(c)e.className=c;if(h!=null)e.textContent=h;return e}
function makeSel(){
 var w=mk('div','ccSel');w.appendChild(mk('div','ccTitle','Captain Control'));
 var seg=mk('div','ccSeg');
 ['auto','manual'].forEach(function(m){var b=mk('button','',m.toUpperCase());b.type='button';b.dataset.mode=m;
  b.addEventListener('click',function(){var c=CC();if(c&&c.setMode)c.setMode(m);sync()});seg.appendChild(b)});
 w.appendChild(seg);var n=mk('div','ccNote');w.appendChild(n);
 w._seg=seg;w._note=n;sels.push(w);return w}
function inject(){
 var hub=$('mainHub'),sc=$('selectScreen'),pm=$('priorityModal');
 if(hub){var h=hub.querySelector('.hubHero');var s=makeSel();h&&h.parentNode?h.parentNode.insertBefore(s,h.nextSibling):hub.appendChild(s)}
 if(sc){var r=sc.querySelector('.modeRow');var s2=makeSel();r&&r.parentNode?r.parentNode.insertBefore(s2,r.nextSibling):sc.appendChild(s2)}
 if(pm){var row=$('behaviorChoiceRow');var s3=makeSel();s3.style.margin='0 0 10px';s3.style.background='#0b1120';
  row&&row.parentNode?row.parentNode.insertBefore(s3,row):pm.firstElementChild.appendChild(s3)}
 buildBattle()}
function buildBattle(){
 var aw=$('arenaWrap');if(!aw)return;
 battle=mk('div');battle.id='ccBattle';battle.setAttribute('aria-label','Captain manual controls');
 msg=mk('div','ccMsg');battle.appendChild(msg);
 var row=mk('div','ccRow');
 stick=mk('div','ccStick');stick.tabIndex=0;stick.setAttribute('role','application');stick.setAttribute('aria-label','Movement joystick');
 knob=mk('div','ccKnob');stick.appendChild(knob);
 stickZone=mk('div','ccStickZone');stickZone.appendChild(stick);row.appendChild(stickZone);
 btnWrap=mk('div','ccBtns');btnWrap.setAttribute('role','group');btnWrap.setAttribute('aria-label','Captain attacks and abilities');row.appendChild(btnWrap);battle.appendChild(row);
 aw.parentNode.insertBefore(battle,aw.nextSibling);
 [stick,stickZone].forEach(function(surface){
  surface.addEventListener('pointerdown',function(e){if(stickPid!=null||!on())return;stickPid=e.pointerId;stick.focus({preventScroll:true});
   var r=stick.getBoundingClientRect();stickHome={x:r.left+r.width/2,y:r.top+r.height/2};
   stickBounds={left:stickHome.x,right:Math.max(stickHome.x,Math.min(stickHome.x+120,(window.innerWidth||Infinity)-r.width/2-10)),
    top:Math.min(stickHome.y,r.height/2+10),bottom:stickHome.y};
   stickCenter={x:Math.max(stickBounds.left,Math.min(stickBounds.right,e.clientX)),
    y:Math.max(stickBounds.top,Math.min(stickBounds.bottom,e.clientY))};paintStick();
   try{stick.setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();e.stopPropagation?.();mv(e)});
  surface.addEventListener('pointermove',function(e){if(e.pointerId===stickPid){e.preventDefault();e.stopPropagation?.();mv(e)}});
  ['pointerup','pointercancel','lostpointercapture'].forEach(function(t){surface.addEventListener(t,function(e){
   if(e.pointerId===stickPid){e.stopPropagation?.();endStick()}
  })});
 })}
function on(){return last&&last.active&&last.enabled&&last.selected==='manual'}
function paintStick(){if(stickCenter&&stickHome)stick.style.transform='translate('+(stickCenter.x-stickHome.x)+'px,'+(stickCenter.y-stickHome.y)+'px)'}
function mv(e){if(!stickCenter)return;var r=stick.getBoundingClientRect(),dx=e.clientX-stickCenter.x,dy=e.clientY-stickCenter.y;
 var radius=Math.max(1,(r.width-knob.offsetWidth)/2);
 // Follow along the drag vector only beyond the travel ring. Moving the base
 // along that same vector preserves direction and keeps diagonal input stable.
 var distance=Math.hypot(dx,dy),follow=radius*1.4;
 if(distance>follow){var shift=distance-follow,nx=dx/distance,ny=dy/distance;
  // Limit travel along the same ray, rather than clamping each axis separately.
  // This keeps the base inside the screen without turning diagonal movement.
  if(nx>0)shift=Math.min(shift,(stickBounds.right-stickCenter.x)/nx);
  if(nx<0)shift=Math.min(shift,(stickBounds.left-stickCenter.x)/nx);
  if(ny>0)shift=Math.min(shift,(stickBounds.bottom-stickCenter.y)/ny);
  if(ny<0)shift=Math.min(shift,(stickBounds.top-stickCenter.y)/ny);
  shift=Math.max(0,shift);stickCenter.x+=nx*shift;stickCenter.y+=ny*shift;
  dx=e.clientX-stickCenter.x;dy=e.clientY-stickCenter.y;paintStick()}
 var m=Math.hypot(dx,dy),k=m>radius?radius/m:1;dx*=k;dy*=k;knob.style.transform='translate('+dx+'px,'+dy+'px)';
 var c=CC();if(c&&c.input)c.input(dx/radius,dy/radius)}
function endStick(){var pid=stickPid;stickPid=null;if(pid!=null){try{stick.releasePointerCapture(pid)}catch(x){}}
 stickCenter=stickHome=stickBounds=null;stick.style.transform='';knob.style.transform='';var c=CC();if(c&&c.input)c.input(0,0)}
function relBtn(id){var p=btnPtr[id];if(!p)return;delete btnPtr[id];var b=p.b;b.classList.remove('down');try{b.releasePointerCapture(id)}catch(x){}}
function releaseAll(){endStick();ownedTouches.clear();Object.keys(btnPtr).forEach(function(k){relBtn(+k)});var c=CC();if(c&&c.release)c.release()}
var slotEls={};
function restoreRacial(){
 if(!racialButton||racialButton.parentNode!==btnWrap)return;
 if(racialCountdown&&racialCountdown.parentNode===racialButton)racialButton.removeChild(racialCountdown);
 racialButton.classList.remove('ccRacialCooling');
 if(racialAttrs)Object.keys(racialAttrs).forEach(function(k){
  if(racialAttrs[k]==null)racialButton.removeAttribute(k);else racialButton.setAttribute(k,racialAttrs[k])});
 if(racialHome&&racialHome.parentNode)racialHome.parentNode.insertBefore(racialButton,racialHome.nextSibling)}
function mountRacial(){
 var b=$('racialBtn');if(!b||!btnWrap)return;
 if(!racialHome){racialButton=b;racialHome=document.createComment('Captain racial original position');b.parentNode.insertBefore(racialHome,b)}
 if(!b._ccPointers){
  b._ccPointers=true;
  b.addEventListener('pointerdown',function(e){
   if(b.disabled||!on())return;btnPtr[e.pointerId]={b:b};
   try{b.setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();b.classList.add('down');
   // Invoke the native handler once on press: a second finger can suppress
   // browser-generated click, while the original racial rules remain intact.
   b.click();
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(function(t){b.addEventListener(t,function(e){relBtn(e.pointerId)})});
  b.addEventListener('click',function(e){
   if(b.parentNode!==btnWrap||!on())return;
   if(e.detail>0){e.preventDefault();e.stopImmediatePropagation();return}
   var c=CC();if(c&&c.racialTarget)c.racialTarget();
  },true);
 }
 if(b.parentNode!==btnWrap){
  racialAttrs={'title':b.getAttribute('title'),'aria-label':b.getAttribute('aria-label')};btnWrap.appendChild(b);
  if(!racialCountdown){racialCountdown=mk('span','ccRacialCd');racialCountdown.setAttribute('aria-hidden','true')}
  b.appendChild(racialCountdown)}
 var hero=typeof playerCaptainRef!=='undefined'?playerCaptainRef:null;
 var cd=Math.ceil(hero&&hero.cd&&hero.cd.racial||0);
 var race=hero&&typeof RACIALS!=='undefined'?RACIALS[hero.racial]:null;
 b.classList.toggle('ccRacialCooling',cd>0);
 racialCountdown.style.display=cd>0?'flex':'none';racialCountdown.textContent=cd>0?cd:'';
 if(race){b.title=race.name;b.setAttribute('aria-label',race.name+(cd>0?' — '+cd+' seconds remaining':''))}}
// Reuse equipped spell-card art and the game's existing class/racial symbols.
// This is presentation-only: no request, target, timer or cast state is changed.
function symbol(s){
 var hero=typeof playerCaptainRef!=='undefined'?playerCaptainRef:null;
 var cls=hero&&hero.classId;
 var glyph=cls&&typeof CLASS_STATS!=='undefined'&&CLASS_STATS[cls]?CLASS_STATS[cls].icon:null;
 var name=String(s.label||'').replace(/^(?:A[12]|ULT)\s*·\s*/,'').replace(/\s*\(passive\)$/,'');
 var url=null;
 if(cls&&typeof collectibleArtUrl==='function'){
  if(s.id==='a1'||s.id==='a2'||s.id==='ult')url=collectibleArtUrl(cls,name);
  else if(s.id==='attack'&&name==='Shadow Beam'&&typeof resolveMatchAbilityArtName==='function'){
   var art=resolveMatchAbilityArtName(hero,name);if(art)url=collectibleArtUrl(cls,art)}
 }
 if(s.id==='dreambind'&&typeof customAbilityIcon==='function')glyph=customAbilityIcon('rogue');
 return {url:url,glyph:glyph||({attack:'ATK',a1:'A1',a2:'A2',ult:'ULT',dreambind:'DB'}[s.id]||'?')}}
function drawSymbol(b,s){
 var art=symbol(s),key=(art.url||'')+'|'+art.glyph;
 b.title=s.label;b.setAttribute('aria-label',s.label);
 if(b._artKey===key)return;b._artKey=key;b._l.innerHTML='';
 var fallback=mk('span','ccGlyph',art.glyph);fallback.setAttribute('aria-hidden','true');b._l.appendChild(fallback);
 if(art.url){var image=mk('img','ccArt');image.alt='';image.draggable=false;
  image.addEventListener('error',function(){image.style.display='none';fallback.style.display='flex'});
  image.addEventListener('load',function(){fallback.style.display='none'});
  image.src=art.url;b._l.appendChild(image)}}
function ensureBtns(slots){
 var key=slots.map(function(s){return s.id}).join();if(btnWrap._k===key)return;restoreRacial();btnWrap._k=key;btnWrap.innerHTML='';slotEls={};
 slots.forEach(function(s){var b=mk('button','ccBtn');b.type='button';b.dataset.slot=s.id;b.setAttribute('aria-label',s.label);
  b._l=mk('span','ccSymbol');b._l.setAttribute('aria-hidden','true');b.appendChild(b._l);drawSymbol(b,s);
  b._c=mk('span','ccCd');b._c.setAttribute('aria-hidden','true');b._c.style.display='none';b.appendChild(b._c);
  b.addEventListener('pointerdown',function(e){if(b.disabled||!on())return;btnPtr[e.pointerId]={b:b};
    try{b.setPointerCapture(e.pointerId)}catch(x){}e.preventDefault();b.classList.add('down');
    if(window.CaptainAim)window.CaptainAim.begin(s.id,e);
    else {var c=CC();if(c&&c.request)c.request(s.id)}});
   b.addEventListener('pointermove',function(e){if(btnPtr[e.pointerId]&&window.CaptainAim){e.preventDefault();window.CaptainAim.move(e)}});
  ['pointerup','pointercancel','lostpointercapture'].forEach(function(t){b.addEventListener(t,function(e){
    if(btnPtr[e.pointerId]){
      if(window.CaptainAim){if(t==='pointerup')window.CaptainAim.finish(e);else window.CaptainAim.cancel()}
      else if(t!=='pointerup'){var c=CC();if(c&&c.cancel)c.cancel(s.id)}
    }relBtn(e.pointerId)})});
  b.addEventListener('click',function(e){if(e.detail===0&&!b.disabled&&on()){var c=CC();if(c&&c.request)c.request(s.id)}});
  b.addEventListener('contextmenu',function(e){e.preventDefault()});
  slotEls[s.id]=b;btnWrap.appendChild(b)})}
function sync(){
 var v=V();var was=on();last=v;
 document.body.classList.toggle('ccLiveBattle',liveBattle());
 if(!liveBattle())ownedTouches.clear();
 var avail=!!(v&&v.available);
 sels.forEach(function(w){
  [].forEach.call(w._seg.children,function(b){b.classList.toggle('on',!!v&&v.selected===b.dataset.mode);
   b.disabled=!avail||(v&&v.active)});
  w._note.textContent=!v?'Unavailable.':avail?(v.selected==='manual'?'Steer the Captain'+(v.captainName?' ('+v.captainName+')':'')+' with the joystick. Hold a skill, drag to aim, release to cast; drag outside the map to cancel. Teammates stay on AI. Local only; no saved replay.':'AUTO: the whole team fights on AI. Choose MANUAL to steer your Captain.')
   :'Manual control is only available in normal local 3v3 with a Captain selected. '+(v.reason||'Other modes always use AUTO.')});
 if(!v||!battle)return;
 var show=!!(v.active&&v.selected==='manual'&&v.available);
 battle.classList.toggle('show',show);
 if(!show||!v.enabled){if(was||stickPid!=null||Object.keys(btnPtr).length)releaseAll()}
 if(!show){restoreRacial();return}
 msg.textContent=v.message||v.target||'';
 ensureBtns(v.slots||[]);
 mountRacial();
 (v.slots||[]).forEach(function(s){var b=slotEls[s.id];if(!b)return;b.disabled=!!s.disabled||!v.enabled;drawSymbol(b,s);
  var cd=Math.ceil(s.cooldown||0);b.classList.toggle('cooling',cd>0);b._c.style.display=cd>0?'flex':'none';b._c.textContent=cd>0?cd:''})}
function start(){if(timer)return;timer=setInterval(sync,150)}
function stop(){clearInterval(timer);timer=null}
// Only battle surfaces own these gestures. Menus, dialogs and text inputs keep
// their native scrolling/editing behavior; touchstart remains uncancelled so
// the original racial button's click handler still receives ordinary taps.
function liveBattle(){return typeof state!=='undefined'&&!!state&&!state.over&&document.body.classList.contains('battleMode')}
function element(target){return target?.closest?target:target?.parentElement}
function editable(target){return !!element(target)?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')}
function battleSurface(target){return liveBattle()&&!editable(target)&&!!element(target)?.closest?.('#battleScreen')}
function gestureSurface(target){return battleSurface(target)&&!!element(target)?.closest?.('#arenaWrap,#ccBattle,#racialBtn')}
document.addEventListener('touchstart',function(e){
 if(!gestureSurface(e.target))return;
 Array.from(e.changedTouches||[]).forEach(function(t){ownedTouches.add(t.identifier)})
},{passive:true});
document.addEventListener('touchmove',function(e){
 if(!liveBattle()){ownedTouches.clear();return}
 if(editable(e.target))return;
 if(Array.from(e.touches||[]).some(function(t){return ownedTouches.has(t.identifier)})&&e.cancelable)e.preventDefault();
},{passive:false});
['touchend','touchcancel'].forEach(function(type){document.addEventListener(type,function(e){
 Array.from(e.changedTouches||[]).forEach(function(t){ownedTouches.delete(t.identifier)})
},{passive:true})});
['selectstart','contextmenu','dragstart','dblclick'].forEach(function(type){
 document.addEventListener(type,function(e){if(battleSurface(e.target))e.preventDefault()})});
document.addEventListener('pointerdown',function(e){
 if(battleSurface(e.target))window.getSelection()?.removeAllRanges();
},true);
window.addEventListener('blur',releaseAll);
window.addEventListener('pagehide',function(){releaseAll();ownedTouches.clear();restoreRacial();stop()});
window.addEventListener('pageshow',function(){start();sync()});
document.addEventListener('visibilitychange',function(){if(document.hidden){releaseAll();ownedTouches.clear();stop()}else{start();sync()}});
inject();sync();start();
})();
