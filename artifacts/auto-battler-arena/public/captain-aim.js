/* Manual-only aiming presentation. The adapter remains the legality/cast owner. */
(function () {
  'use strict';
  let aim=null, overlay=null, svg=null, hint=null, cancel=null, clear=null, frame=0;
  const cc=()=>window.CaptainControl;
  const ns='http://www.w3.org/2000/svg';
  function arena(){return document.querySelector('#arenaWrap canvas');}
  function ensure(){
    if(overlay)return;
    overlay=document.createElement('div');overlay.id='captainAimOverlay';
    svg=document.createElementNS(ns,'svg');svg.setAttribute('aria-hidden','true');overlay.appendChild(svg);
    hint=document.createElement('div');hint.className='captainAimHint';hint.setAttribute('role','status');overlay.appendChild(hint);
    cancel=document.createElement('button');cancel.type='button';cancel.className='captainAimCancel';cancel.textContent='Cancel cast';
    cancel.onclick=stop;overlay.appendChild(cancel);
    clear=document.createElement('button');clear.type='button';clear.className='captainTargetClear';clear.textContent='Clear target';
    clear.onclick=()=>{cc()?.selectAttackTarget(null);draw();};overlay.appendChild(clear);
    document.body.appendChild(overlay);
  }
  function rect(){const c=arena();return c?{c,r:c.getBoundingClientRect()}:null;}
  function point(e){const v=rect();if(!v||!v.r.width||!v.r.height)return null;
    return{x:(e.clientX-v.r.left)*v.c.width/v.r.width,y:(e.clientY-v.r.top)*v.c.height/v.r.height};}
  function inside(e){const v=rect();return v&&e.clientX>=v.r.left&&e.clientX<=v.r.right&&e.clientY>=v.r.top&&e.clientY<=v.r.bottom;}
  function circle(x,y,r,color,dashed=false){
    const n=document.createElementNS(ns,'circle');
    for(const [k,v]of Object.entries({cx:x,cy:y,r,stroke:color,fill:color,'fill-opacity':.08,'stroke-width':2,'vector-effect':'non-scaling-stroke'}))n.setAttribute(k,String(v));
    if(dashed)n.setAttribute('stroke-dasharray','7 5');svg.appendChild(n);
  }
  function selected(spec){
    const target=spec.targets.find(t=>t.id===aim?.targetId);
    return target||null;
  }
  function valid(spec){
    if(spec.disabled)return false;
    if(spec.kind==='self')return true;
    if(spec.kind==='ground')return cc().pointValid(spec.slot,aim.point);
    return !!selected(spec)?.valid;
  }
  function draw(){
    ensure();
    const control=cc(),v=control?.view();
    if(!v?.active){if(aim)stop();overlay.hidden=true;frame=0;return;}
    const spec=control.aim(aim?.slot||'attack'),canvas=rect();
    if(!spec||!canvas){frame=0;return;}
    const locked=spec.targets.find(t=>t.id===spec.selectedAttackTarget);
    overlay.hidden=!aim&&!locked;
    if(!aim&&!locked){frame=0;return;}
    svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${canvas.c.width} ${canvas.c.height}`);
    Object.assign(svg.style,{left:canvas.r.left+'px',top:canvas.r.top+'px',width:canvas.r.width+'px',height:canvas.r.height+'px'});
    cancel.hidden=!aim;hint.hidden=!aim;clear.hidden=!locked;
    if(aim){
      const ok=valid(spec),color=ok?'#72ead6':'#ff6b79';
      circle(spec.captain.x,spec.captain.y,spec.range||spec.radius||38,'#ffd166',true);
      spec.targets.forEach(t=>{
        if(spec.kind==='ground'||spec.kind==='self')return;
        if(spec.kind==='enemy'&&t.ally||['ally','dead-ally'].includes(spec.kind)&&!t.ally)return;
        circle(t.x,t.y,(t.radius||14)+8,t.valid?(t.ally?'#82c6ff':'#72ead6'):'#ff6b79');
      });
      if(spec.kind==='ground'&&aim.point)circle(aim.point.x,aim.point.y,spec.radius,color);
      else if(spec.kind==='self')circle(spec.captain.x,spec.captain.y,spec.radius||38,color);
      else if(selected(spec)){const t=selected(spec);circle(t.x,t.y,(t.radius||14)+15,color); }
      hint.textContent=spec.disabled?'Not ready — release to cancel':ok?
        (spec.kind==='self'?'Self-centered ability':spec.kind==='ground'?'Drag circle to place':selected(spec)?.name||'Target selected')+' · Release to cast':
        'Invalid / out of range · Drag to a valid target or cancel';
      hint.classList.toggle('invalid',!ok);
    }else if(locked)circle(locked.x,locked.y,(locked.radius||14)+12,locked.valid?'#ffd166':'#ff6b79');
    frame=requestAnimationFrame(draw);
  }
  function stop(){
    aim=null;
    if(overlay){cancel.hidden=true;hint.hidden=true;}
  }
  function begin(slot,e){
    const spec=cc()?.aim(slot);
    if(!spec||spec.disabled)return false;
    ensure();aim={slot,pid:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false,targetId:null,point:null};
    const options=spec.targets.filter(t=>spec.kind==='ground'?!t.ally&&cc().pointValid(slot,t):t.valid).sort((a,b)=>{
      if(spec.kind==='either'&&a.ally!==b.ally)return a.ally?-1:1;
      return Math.hypot(a.x-spec.captain.x,a.y-spec.captain.y)-Math.hypot(b.x-spec.captain.x,b.y-spec.captain.y);
    });
    const target=slot==='attack'&&spec.selectedAttackTarget!=null?spec.targets.find(t=>t.id===spec.selectedAttackTarget):options[0];
    aim.targetId=spec.kind==='self'?spec.captain.id:target?.id??null;
    aim.point=target?{x:target.x,y:target.y}:{x:spec.captain.x,y:spec.captain.y};
    if(!frame)draw();return true;
  }
  function move(e){
    if(!aim||aim.pid!==e.pointerId)return;
    if(Math.hypot(e.clientX-aim.startX,e.clientY-aim.startY)<12&&!aim.moved)return;
    aim.moved=true;
    const p=point(e),spec=cc().aim(aim.slot);if(!p||!spec)return;
    if(spec.kind==='ground')aim.point=p;
    else if(spec.kind!=='self'){
      const v=rect(),tolerance=38*v.c.width/v.r.width;
      const candidates=spec.targets.filter(t=>spec.kind==='enemy'?!t.ally:['ally','dead-ally'].includes(spec.kind)?t.ally:true)
        .sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
      const t=candidates[0];
      aim.targetId=t&&Math.hypot(t.x-p.x,t.y-p.y)<=tolerance?t.id:null;
    }
  }
  function finish(e){
    if(!aim||aim.pid!==e.pointerId)return false;
    const spec=cc().aim(aim.slot),cancelBox=cancel.getBoundingClientRect();
    const cancelled=e.clientX>=cancelBox.left&&e.clientX<=cancelBox.right&&e.clientY>=cancelBox.top&&e.clientY<=cancelBox.bottom||
      aim.moved&&!inside(e);
    let sent=false;
    if(spec&&!cancelled&&valid(spec)){
      sent=cc().request(aim.slot,spec.kind==='ground'?{point:aim.point}:{targetId:aim.targetId});
    }
    stop();return sent;
  }
  window.CaptainAim={begin,move,finish,cancel:stop};
  document.addEventListener('keydown',e=>{if(e.key==='Escape')stop();});
  window.addEventListener('blur',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
})();