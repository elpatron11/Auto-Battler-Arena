(function () {
  'use strict';
  const roster = [
    ['frostmage','Cryomancer','#4a9ddb'],['priest','Priest','#e7dbbd'],['warrior','Warrior','#ac6b4d'],
    ['rogue','Rogue','#914856'],['paladin','Paladin','#d3ab4c'],['archer','Archer','#629452'],
    ['warlock','Warlock','#8759ac'],['druid','Druid','#65934c'],['shaman','Shaman','#57a9ba']
  ];
  const canvas = document.getElementById('comparison'), ctx = canvas.getContext('2d');
  const status = document.getElementById('status'), poseSelect = document.getElementById('pose');
  const skinSelect = document.getElementById('skin'), benchmark = document.getElementById('benchmark');
  const frame = document.getElementById('engine');
  const actors = roster.map((row,i)=>({id:2000+i,classId:row[0],team:'player',alive:true,x:0,y:0,
    radius:17,visualFacing:1,status:{},extra:{},moveSpeed:0,skinId:'default',atkTimer:0}));
  let engine = null, raf = 0;
  const metrics = { benchmark: null, errors: [], ready:false };
  window.RosterLab = { metrics };
  function paintActor(e,row,x,y,mode,t,scale) {
    if (!e.alive && mode === 'original') {
      // Legacy removes its body immediately. Mark that behavior, rather than
      // showing an unexplained blank that suggests a broken renderer.
      ctx.save();ctx.textAlign='center';ctx.fillStyle='#aec3d2';ctx.font='12px system-ui';
      ctx.fillText('Body removed on death',x,y);ctx.restore();
      return;
    }
    ctx.save();
    try {
      ctx.translate(x,y);ctx.scale(scale,scale);
      if (!e.alive && mode === 'polished') ctx.globalAlpha *= engine.RosterPolishMotion.pose(e,t).fade;
      engine.RosterVisualPreview.withMode(mode,()=>engine.drawHeroBody(ctx,e,row[0],row[2],'#182b3c','#d4eef9','#7cbbe9',t));
    } finally { ctx.restore(); }
  }
  function sample(e,t) {
    const phase = (t % 1.1)/1.1, p=poseSelect.value;
    e.alive=true;e.x=0;e.y=0;e.casting=null;e.atkAnimAt=0;e.hitFlashAt=0;e.status.stunTimer=0;e.status.rootTimer=0;
    const variants=engine.RosterPolishArt.skins[e.classId];
    e.skinId=skinSelect.value==='default'?'default':variants[skinSelect.value==='first'?0:1];
    if(p==='run'){e.x=Math.sin(t*.75)*100;e.moveSpeed=75;e.visualFacing=Math.cos(t*.75)<0?-1:1;}
    else e.moveSpeed=0;
    if(p==='attack'){e.atkAnimAt=(t-phase*.34)*1000;e.atkAnimDur=.34;e.atkAnimAng=Math.sin(t*.6)>0?0:Math.PI;}
    if(p==='cast')e.casting={total:1,timeLeft:1-phase};
    if(p==='hit'){e.hitFlashAt=(t-phase*.18)*1000;e.hitFlashDur=.18;}
    if(p==='stun'){e.status.stunTimer=1;e.status.stunKind='freeze';}
    if(p==='root')e.status.rootTimer=1;
    if(p==='death') e.alive=(t%2.4)<1.2;
  }
  function draw() {
    if(!engine || document.hidden){raf=requestAnimationFrame(draw);return;}
    const t=engine.performance.now()/1000;
    try {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#101c2c';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#eacb88';ctx.font='600 19px system-ui';ctx.textAlign='center';
      ctx.fillText('ORIGINAL',245,33);ctx.fillText('POLISHED',695,33);
      ctx.strokeStyle='#334c66';ctx.beginPath();ctx.moveTo(460,44);ctx.lineTo(460,canvas.height-15);ctx.stroke();
      for(let i=0;i<roster.length;i++){
        const y=110+i*150,e=actors[i],row=roster[i]; sample(e,t);
        ctx.fillStyle='#acc2d4';ctx.font='600 14px system-ui';ctx.textAlign='left';ctx.fillText(row[1],14,y-45);
        ctx.strokeStyle='#263c53';ctx.beginPath();ctx.moveTo(12,y+54);ctx.lineTo(908,y+54);ctx.stroke();
        ctx.fillStyle='rgba(0,0,0,.35)';
        for(const x of [245,695]){ctx.beginPath();ctx.ellipse(x,y+29,43,11,0,0,Math.PI*2);ctx.fill();}
        paintActor(e,row,245,y,'original',t,2.3);paintActor(e,row,695,y,'polished',t,2.3);
      }
      const m=engine.RosterPolishArt.cacheStats();
      if(!metrics.benchmark) status.textContent=`Nine classes · ${m.entries}/${m.maxEntries} cached identities · ${(m.bytes/1048576).toFixed(2)} MiB artwork`+
        (poseSelect.value==='death'?'\nDeath cycle: original removes the body instantly; polished collapses and fades over 0.5s. Both reset for comparison.':'');
    } catch(error){metrics.errors.push(String(error));status.textContent='Rendering failed: '+String(error);return;}
    raf=requestAnimationFrame(draw);
  }
  function measure() {
    const t=engine.performance.now()/1000, batches=24, loops=4, runs={original:[],polished:[]};
    benchmark.disabled=true;
    try {
      for(let i=0;i<actors.length;i++) sample(actors[i],t);
      // Flush each group's raster work so deferred baseline commands cannot
      // be charged to the following polished sample. Alternate sample order.
      for(const mode of ['original','polished']){
        for(let warm=0;warm<2;warm++)for(let i=0;i<actors.length;i++)paintActor(actors[i],roster[i],70+i*95,100,mode,t,1);
        ctx.getImageData(0,0,1,1);
      }
      for(let n=0;n<batches;n++){
        for(const mode of n%2?['polished','original']:['original','polished']){
          ctx.getImageData(0,0,1,1);
          const start=performance.now();
          for(let repeat=0;repeat<loops;repeat++)for(let i=0;i<actors.length;i++)paintActor(actors[i],roster[i],70+i*95,100,mode,t,1);
          ctx.getImageData(0,0,1,1);
          runs[mode].push((performance.now()-start)/loops);
        }
      }
      const summary=values=>{values.sort((a,b)=>a-b);return{medianMs:values[Math.floor(values.length/2)],p95Ms:values[Math.floor(values.length*.95)]};};
      metrics.benchmark={original:summary(runs.original),polished:summary(runs.polished),art:engine.RosterPolishArt.cacheStats(),units:9};
      status.textContent=`Warm nine-body rendering (24 samples)\nOriginal: median ${metrics.benchmark.original.medianMs.toFixed(2)}ms · p95 ${metrics.benchmark.original.p95Ms.toFixed(2)}ms\nPolished: median ${metrics.benchmark.polished.medianMs.toFixed(2)}ms · p95 ${metrics.benchmark.polished.p95Ms.toFixed(2)}ms\nThese are browser renderer costs, not an iPhone FPS guarantee.`;
    }catch(error){metrics.errors.push(String(error));status.textContent=String(error);}
    finally{benchmark.disabled=false;}
  }
  frame.addEventListener('load',()=>{
    engine=frame.contentWindow;
    if(!engine.RosterPolishArt || !engine.RosterPolishMotion || !engine.drawHeroBody){status.textContent='Visual modules are unavailable.';return;}
    metrics.ready=true;benchmark.disabled=false;draw();
  });
  function reset(){metrics.benchmark=null;engine?.RosterPolishMotion?.reset();}
  poseSelect.addEventListener('change',reset);skinSelect.addEventListener('change',reset);
  benchmark.addEventListener('click',measure);
  window.addEventListener('pagehide',()=>cancelAnimationFrame(raf));
})();