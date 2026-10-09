/* Arena environment renderer: presentation only. Static layer prebaked per map/wall signature
   (one canvas per map, max two). Per frame: one drawImage + 4 flame overlays. Read-only inputs. */
(function(){
'use strict';
var BASE=(document.currentScript&&document.currentScript.src)||location.href;
var GROUND={citadel:'assets/arena-environments/dungeon-ground.webp',ruins:'assets/arena-environments/forest-ground.webp?forest-scenery=2'};
var ATLAS_URL='assets/arena-environments/forest-props.webp?forest-scenery=2',atlas=null,atlasState=0;
// Tight alpha bounds in the normalized 300px cells; never squash painted props.
var FOREST_BOXES=[[6,18,288,263],[6,49,288,202],[73,6,154,288],
  [72,6,156,288],[6,35,288,229],[90,6,119,288]];
var cache={citadel:null,ruins:null}, img={citadel:null,ruins:null}, ready={citadel:false,ruins:false}, ver={citadel:0,ruins:0};

function prng(seed){var a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;var t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function loadGround(id){
  if(img[id])return; var im=new Image(); img[id]=im;
  im.onload=function(){
    var done=function(){ready[id]=true;ver[id]++;};
    if(im.decode){im.decode().then(done,done);}else done();
  };
  im.onerror=function(){img[id]=im;ready[id]=false;};
  try{im.src=new URL(GROUND[id],BASE).href;}catch(e){}
}
function loadAtlas(){
  if(atlasState)return;atlasState=1;var im=new Image();
  im.onload=function(){var done=function(){if(!im.naturalWidth||!im.naturalHeight){im.onerror();return;}atlas=im;atlasState=2;ver.ruins++;};if(im.decode){im.decode().then(done,im.onerror);}else done();};
  im.onerror=function(){atlasState=3;try{console.warn('ArenaEnvironment: forest-props atlas failed to load; using procedural forest props');}catch(e){}};
  try{im.src=new URL(ATLAS_URL,BASE).href;}catch(e){atlasState=3;}
}
function rr(c,x,y,w,h,r){c.beginPath();if(c.roundRect)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h);}
function torchSpots(id,W,H){
  if(id==='ruins')return [[52,28],[W-52,28],[52,H-92],[W-52,H-92]];
  var m=26;
  return [[m,m],[W-m,m],[m,H-m],[W-m,H-m]];
}

/* ---------- shared drawing pieces ---------- */
function plinth(c,x,y,warm){
  c.fillStyle='rgba(0,0,0,.35)';c.fillRect(x-9,y+8,20,5);
  c.fillStyle='#4a4d5c';c.fillRect(x-8,y-2,16,12);
  c.fillStyle='#6d7084';c.fillRect(x-8,y-2,16,3);
  c.fillStyle='#2c2e3b';c.fillRect(x-8,y+7,16,3);c.fillRect(x+5,y-2,3,12);
  c.fillStyle='#252733';c.fillRect(x-6,y-6,12,5);
  c.fillStyle=warm;c.fillRect(x-5,y-6,10,1.5);
}
function pool(c,x,y,r,col){
  var g=c.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,col);g.addColorStop(1,'rgba(0,0,0,0)');
  c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);
}
function vignette(c,W,H,col,a){
  var g=c.createRadialGradient(W/2,H/2,H*.34,W/2,H/2,H*.98);
  g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,col.replace('A',a));
  c.fillStyle=g;c.fillRect(0,0,W,H);
}
function bevel(c,w,hi,lo){
  c.fillStyle=hi;c.fillRect(w.x,w.y,w.w,3);c.fillRect(w.x,w.y,3,w.h);
  c.fillStyle=lo;c.fillRect(w.x,w.y+w.h-6,w.w,6);c.fillRect(w.x+w.w-5,w.y,5,w.h);
  c.strokeStyle='#0f121c';c.lineWidth=2;c.strokeRect(w.x+1,w.y+1,w.w-2,w.h-2);
}
function masonry(c,w,r,base,lines,lit){
  c.fillStyle=base;c.fillRect(w.x,w.y,w.w,w.h);
  c.save();c.beginPath();c.rect(w.x,w.y,w.w,w.h);c.clip();
  var row=20,i=0;
  for(var y=w.y;y<w.y+w.h;y+=row,i++){
    var off=i%2?10:0,bw=26;
    for(var x=w.x-off;x<w.x+w.w;x+=bw){
      var s=(r()-.5)*.14;c.fillStyle=s>0?'rgba(255,255,255,'+s+')':'rgba(0,0,0,'+(-s)+')';c.fillRect(x+1,y+1,bw-1,row-1);
    }
    c.strokeStyle=lines;c.lineWidth=1;c.beginPath();c.moveTo(w.x,y+.5);c.lineTo(w.x+w.w,y+.5);
    for(var x2=w.x-off;x2<w.x+w.w;x2+=bw){c.moveTo(x2+.5,y);c.lineTo(x2+.5,y+row);}
    c.stroke();
  }
  var g=c.createLinearGradient(w.x,w.y,w.x+w.w,w.y+w.h);g.addColorStop(0,lit);g.addColorStop(1,'rgba(0,0,0,.34)');
  c.fillStyle=g;c.fillRect(w.x,w.y,w.w,w.h);
  c.strokeStyle='rgba(8,10,18,.6)';c.beginPath();var cx=w.x+w.w*(.3+r()*.4),cy=w.y+6;
  c.moveTo(cx,cy);for(var k=0;k<4;k++){cx+=(r()-.5)*12;cy+=8+r()*8;c.lineTo(cx,cy);}c.stroke();
  c.restore();
}
function capStone(c,w){
  var m=Math.min(w.w,w.h)>60?10:5;
  c.fillStyle='rgba(120,126,150,.55)';c.fillRect(w.x+m,w.y+m,w.w-m*2,w.h-m*2);
  c.strokeStyle='rgba(10,12,20,.55)';c.lineWidth=1;c.strokeRect(w.x+m+.5,w.y+m+.5,w.w-m*2-1,w.h-m*2-1);
  c.fillStyle='rgba(255,255,255,.12)';c.fillRect(w.x+m+1,w.y+m+1,w.w-m*2-2,2);
}
function banner(c,x,y,w,h){
  c.fillStyle='#2a1e1a';c.fillRect(x-2,y-3,w+4,4);
  c.fillStyle='#8c1f2b';c.beginPath();c.moveTo(x,y);c.lineTo(x+w,y);c.lineTo(x+w,y+h);c.lineTo(x+w/2,y+h-8);c.lineTo(x,y+h);c.fill();
  c.fillStyle='rgba(0,0,0,.28)';c.fillRect(x+w-4,y,4,h-6);
  c.strokeStyle='#d6a85a';c.lineWidth=1.5;c.beginPath();c.moveTo(x+w/2,y+8);c.lineTo(x+w/2,y+h-18);c.moveTo(x+w/2-5,y+16);c.lineTo(x+w/2+5,y+16);c.stroke();
}
function chain(c,x,y0,y1){
  c.strokeStyle='#161923';c.lineWidth=2;
  for(var y=y0;y<y1;y+=6){c.strokeRect(x-2+((y/6|0)%2)*1,y,4,6);}
  c.strokeStyle='rgba(150,155,175,.35)';c.lineWidth=1;
  for(var y2=y0;y2<y1;y2+=6){c.strokeRect(x-2,y2+1,2,3);}
}
function gate(c,x,y,w,h){
  c.fillStyle='#0a0c14';rr(c,x,y,w,h,w/2);c.fill();
  c.strokeStyle='#3b3f4f';c.lineWidth=2;
  for(var i=1;i<4;i++){c.beginPath();c.moveTo(x+i*w/4,y+6);c.lineTo(x+i*w/4,y+h);c.stroke();}
  c.beginPath();c.moveTo(x,y+h*.45);c.lineTo(x+w,y+h*.45);c.stroke();
  c.strokeStyle='#58506a';rr(c,x,y,w,h,w/2);c.stroke();
}
function rubble(c,r,W,H,n,cols){
  for(var i=0;i<n;i++){
    var side=r()*4|0,t=r(),d=4+r()*14,x=side<2?t*W:(side===2?d:W-d),y=side<2?(side?H-d:d):t*H;
    var s=2+r()*3.5;c.fillStyle='rgba(0,0,0,.3)';c.fillRect(x-s+1,y+s*.5,s*2,s*.7);
    c.fillStyle=cols[i%cols.length];c.beginPath();c.moveTo(x-s,y+s*.5);c.lineTo(x-s*.6,y-s*.6);c.lineTo(x+s*.5,y-s*.7);c.lineTo(x+s,y+s*.4);c.fill();
    c.fillStyle='rgba(255,255,255,.14)';c.fillRect(x-s*.5,y-s*.6,s,1);
  }
}
function blob(c,x,y,rad,r,cols){
  c.fillStyle='rgba(0,0,0,.28)';c.beginPath();c.arc(x+2,y+rad*.45,rad,0,6.283);c.fill();
  c.fillStyle=cols[0];c.beginPath();c.arc(x,y,rad,0,6.283);c.fill();
  c.fillStyle=cols[1];c.beginPath();c.arc(x-rad*.2,y-rad*.25,rad*.75,0,6.283);c.fill();
  c.fillStyle=cols[2];c.beginPath();c.arc(x-rad*.32,y-rad*.4,rad*.42,0,6.283);c.fill();
  c.fillStyle='rgba(190,225,110,.35)';
  for(var i=0;i<4;i++){c.beginPath();c.arc(x+(r()-.7)*rad,y+(r()-.8)*rad,1.2+r(),0,6.283);c.fill();}
  // Leaf facets are baked once: irregular, lit foliage rather than flat circles.
  for(var j=0;j<18;j++){
    var angle=r()*6.283,d=Math.sqrt(r())*rad*.85,lx=x+Math.cos(angle)*d,ly=y+Math.sin(angle)*d;
    var size=1.5+r()*rad*.16;
    c.fillStyle=j%3===0?'rgba(145,178,76,.32)':j%3===1?'rgba(9,39,19,.38)':'rgba(80,135,57,.48)';
    c.beginPath();c.moveTo(lx-size,ly);c.lineTo(lx,ly-size*.6);c.lineTo(lx+size,ly);c.lineTo(lx,ly+size*.7);c.closePath();c.fill();
  }
}
var LEAF=['#173a22','#27582f','#4b8a3d'];

/* ---------- citadel ---------- */
function bakeCitadel(c,W,H,walls,r,withImg){
  if(!withImg){
    c.fillStyle='#262b3d';c.fillRect(0,0,W,H);
    for(var y=0,i=0;y<H;y+=36,i++){
      for(var x=(i%2?-22:0);x<W;x+=44){
        var s=(r()-.5)*.16;c.fillStyle=s>0?'rgba(150,160,200,'+s+')':'rgba(0,0,0,'+(-s)+')';c.fillRect(x+1,y+1,43,35);
        c.strokeStyle='rgba(8,10,18,.45)';c.strokeRect(x+.5,y+.5,44,36);
      }
    }
    c.strokeStyle='rgba(8,10,18,.45)';
    for(var k=0;k<26;k++){var cx=r()*W,cy=r()*H;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+(r()-.5)*30,cy+r()*18);c.lineTo(cx+(r()-.5)*40,cy+10+r()*24);c.stroke();}
    c.fillStyle='#10131d';[[W/2-18,H-14],[W/2-18,6]].forEach(function(p){c.fillRect(p[0],p[1],36,8);});
  }
  c.fillStyle='rgba(18,26,52,.18)';c.fillRect(0,0,W,H);
  torchSpots('citadel',W,H).forEach(function(p){pool(c,p[0],p[1],120,'rgba(255,150,60,.2)');});
  vignette(c,W,H,'rgba(4,6,16,A)',.62);
  walls.forEach(function(w,i){
    var big=w.w<50||w.h>150;
    masonry(c,w,r,big?'#363c55':'#3a4059','rgba(8,10,20,.6)','rgba(255,215,160,.12)');
    if(!big)capStone(c,w);
    bevel(c,w,'rgba(255,255,255,.18)','rgba(0,0,0,.45)');
    c.save();c.beginPath();c.rect(w.x,w.y,w.w,w.h);c.clip();
    if(big){
      var top=w.y<100;
      banner(c,w.x+8,top?w.y+16:w.y+w.h-100,24,72);
      chain(c,w.x+w.w-6,w.y+2,w.y+w.h-2);
      if(top){c.fillStyle='rgba(0,0,0,.25)';c.fillRect(w.x,w.y+w.h-14,w.w,14);}
    }else{
      c.fillStyle='rgba(0,0,0,.2)';c.fillRect(w.x+w.w-8,w.y+8,8,w.h-8);
      c.fillStyle='rgba(60,90,50,.4)';c.fillRect(w.x+2,w.y+w.h-9,w.w*.4,4);
    }
    c.restore();
  });
  [0,1].forEach(function(i){var w=walls[i];if(w&&w.y>300){c.save();c.beginPath();c.rect(w.x,w.y,w.w,w.h);c.clip();gate(c,w.x+6,w.y+w.h-64,28,58);c.restore();}});
  rubble(c,r,W,H,34,['#4a4e60','#5a5f73','#3a3d4c']);
  torchSpots('citadel',W,H).forEach(function(p){plinth(c,p[0],p[1],'#b8742f');});
}

/* ---------- ruins (painted atlas path + soft organic fallback; no card borders) ---------- */
function cell(c,k,x,y,w,h,alpha){
  var cw=atlas.naturalWidth/3,ch=atlas.naturalHeight/2,b=FOREST_BOXES[k];
  var sx=(k%3)*cw+b[0]*cw/300,sy=(k/3|0)*ch+b[1]*ch/300,sw=b[2]*cw/300,sh=b[3]*ch/300;
  var s=Math.min(w/sw,h/sh),dw=sw*s,dh=sh*s;
  if(alpha)c.globalAlpha=alpha;
  c.drawImage(atlas,sx,sy,sw,sh,x+(w-dw)/2,y+h-dh,dw,dh);
  c.globalAlpha=1;
}
function groundShadow(c,cx,cy,rx,ry,a){
  c.save();c.translate(cx,cy);c.scale(1,ry/rx);
  var g=c.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,'rgba(4,20,12,'+a+')');g.addColorStop(1,'rgba(4,20,12,0)');
  c.fillStyle=g;c.beginPath();c.arc(0,0,rx,0,6.283);c.fill();c.restore();
}
function rock(c,x,y,s,r){
  var p=[[-1,.5],[-.8,-.4],[-.2,-.9],[.6,-.7],[1,.1],[.8,.6]];
  c.fillStyle='#4f5d66';c.beginPath();p.forEach(function(q,i){var px=x+q[0]*s*(1+(r()-.5)*.2),py=y+q[1]*s*.8;i?c.lineTo(px,py):c.moveTo(px,py);});c.fill();
  c.fillStyle='rgba(150,175,190,.35)';c.beginPath();c.moveTo(x-s*.8,y-s*.3);c.lineTo(x-s*.2,y-s*.7);c.lineTo(x+s*.5,y-s*.55);c.lineTo(x,y-s*.1);c.fill();
  c.fillStyle='rgba(80,140,60,.55)';c.beginPath();c.ellipse(x-s*.2,y-s*.55,s*.55,s*.2,0,0,6.283);c.fill();
}
function pine(c,x,y,hh,r){
  c.fillStyle='#4a3420';c.fillRect(x-2,y-6,4,8);
  var cols=['#143823','#1f5230','#2f6c3a','#4a8a47'];
  for(var i=0;i<4;i++){var by=y-4-i*hh*.2,hw=hh*(.3-i*.055);c.fillStyle=cols[i];c.beginPath();c.moveTo(x-hw,by);c.lineTo(x,by-hh*.34);c.lineTo(x+hw,by);c.fill();}
}
function fallbackWall(c,w,wi,r){
  var cx=w.x+w.w/2,mid=w.w<60&&w.h<110;
  if(mid){
    groundShadow(c,cx,w.y+w.h-8,w.w*.5,9,.5);
    c.fillStyle='#6d7780';c.beginPath();c.moveTo(w.x+9,w.y+w.h-8);c.lineTo(w.x+13,w.y+14);c.lineTo(w.x+w.w-13,w.y+14);c.lineTo(w.x+w.w-9,w.y+w.h-8);c.fill();
    c.fillStyle='#8c979f';c.fillRect(w.x+6,w.y+6,w.w-12,10);
    c.fillStyle='rgba(60,110,50,.6)';c.fillRect(w.x+12,w.y+w.h-26,w.w-24,6);
    return;
  }
  var along=w.h>w.w,n=along?4:2,i;
  for(i=0;i<n;i++){
    var px=along?cx:w.x+22+i*(w.w-44),py=along?w.y+24+i*(w.h-48)/(n-1):w.y+w.h-14;
    groundShadow(c,px,py+4,24,7,.45);
    if(i%2===0||!along&&wi%2)pine(c,px,py+6,along?46:50,r);else rock(c,px,py,along?20:22,r);
  }
}
function bakeRuins(c,W,H,walls,r,withImg){
  var art=withImg&&atlas&&atlas.naturalWidth>0;
  if(!withImg){
    var g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#274f2e');g.addColorStop(.5,'#1f4628');g.addColorStop(1,'#32602f');
    c.fillStyle=g;c.fillRect(0,0,W,H);
    c.fillStyle='rgba(120,90,55,.3)';c.beginPath();c.ellipse(W/2,H/2,230,70,.06,0,6.283);c.fill();
    for(var i=0;i<260;i++){c.fillStyle=i%3?'rgba(110,160,70,.14)':'rgba(20,70,40,.18)';c.beginPath();c.arc(r()*W,r()*H,2+r()*8,0,6.283);c.fill();}
    for(var s=0;s<12;s++){var sx=r()*W,sy=r()<.5?r()*H*.18:H*.82+r()*H*.18;c.fillStyle='rgba(5,30,15,.15)';c.beginPath();c.ellipse(sx,sy,60+r()*60,26+r()*20,r(),0,6.283);c.fill();}
    vignette(c,W,H,'rgba(3,22,10,A)',.45);
  }
  var sp=torchSpots('ruins',W,H);
  sp.forEach(function(p){pool(c,p[0],p[1]+10,90,'rgba(255,170,70,.12)');});
  walls.forEach(function(w,wi){
    c.save();c.beginPath();c.rect(w.x,w.y,w.w,w.h);c.clip();
    var mid=w.w<60&&w.h<110,along=w.h>w.w&&!mid;
    if(!art){fallbackWall(c,w,wi,r);c.restore();return;}
    if(mid){
      groundShadow(c,w.x+w.w/2,w.y+w.h-7,w.w*.55,9,.5);
      cell(c,2,w.x,w.y,w.w,w.h);
    }else if(along){
      var n=3,bh=w.h/n+18;
      for(var k=0;k<n;k++){
        var by=w.y+k*(w.h-bh)/(n-1);
        groundShadow(c,w.x+w.w/2,by+bh-8,w.w*.5,9,.4);
        cell(c,k===1?4:3,w.x,by,w.w,bh);
      }
    }else{
      groundShadow(c,w.x+w.w/2,w.y+w.h-8,w.w*.5,10,.5);
      cell(c,wi%2?1:0,w.x,w.y,w.w,w.h);
    }
    c.restore();
  });
  sp.forEach(function(p){
    if(art){groundShadow(c,p[0],p[1]+72,25,7,.5);cell(c,5,p[0]-32,p[1]-20,64,96);}
    else plinth(c,p[0],p[1]+4,'#c58a3a');
  });
}

/* ---------- frame ---------- */
function flames(ctx,spots,t){
  ctx.save();
  for(var i=0;i<spots.length;i++){
    var x=spots[i][0],y=spots[i][1]-6,f=Math.sin(t*9+i*2.1)*1.4+Math.sin(t*5.3+i)*.8;
    ctx.globalAlpha=.12+.04*Math.sin(t*7+i);ctx.fillStyle='#ff9a3c';ctx.beginPath();ctx.arc(x,y,20+f,0,6.283);ctx.fill();
    ctx.globalAlpha=.9;ctx.fillStyle='#d9611f';ctx.beginPath();ctx.moveTo(x-5,y);ctx.quadraticCurveTo(x-7,y-8,x+f*.4,y-16-f);ctx.quadraticCurveTo(x+7,y-8,x+5,y);ctx.fill();
    ctx.fillStyle='#ffd27a';ctx.beginPath();ctx.moveTo(x-2.5,y);ctx.quadraticCurveTo(x-3.5,y-6,x,y-11-f*.6);ctx.quadraticCurveTo(x+3.5,y-6,x+2.5,y);ctx.fill();
    var q=(t*.9+i*.37)%1;ctx.globalAlpha=1-q;ctx.fillStyle='#ffc060';ctx.fillRect(x+Math.sin(t*3+i*5)*5,y-12-q*22,1.5,1.5);
  }
  ctx.restore();
}
function sameLayout(e,a,walls){
  if(!e||e.w!==a.w||e.h!==a.h||e.ver!==ver[a.id]||e.geometry.length!==walls.length*4)return false;
  for(var i=0;i<walls.length;i++){
    var w=walls[i],p=i*4;
    if(e.geometry[p]!==w.x||e.geometry[p+1]!==w.y||e.geometry[p+2]!==w.w||e.geometry[p+3]!==w.h)return false;
  }
  return true;
}

function draw(ctx,arena,walls,t){
  var id=arena&&arena.id;
  if(id!=='citadel'&&id!=='ruins')return false;
  if(!ctx||!Array.isArray(walls))return false;
  loadGround(id);if(id==='ruins')loadAtlas();
  var e=cache[id];
  if(!sameLayout(e,arena,walls)){
    var cv=e?e.c:document.createElement('canvas');
    if(cv.width!==arena.w)cv.width=arena.w;if(cv.height!==arena.h)cv.height=arena.h;
    var c=cv.getContext('2d');if(!c)return false;c.clearRect(0,0,arena.w,arena.h);
    var ok=ready[id]&&img[id]&&img[id].naturalWidth>0;
    if(ok){try{c.drawImage(img[id],0,0,arena.w,arena.h);}catch(error){ok=false;ready[id]=false;}}
    var r=prng(id==='citadel'?1337:4242);
    (id==='citadel'?bakeCitadel:bakeRuins)(c,arena.w,arena.h,walls,r,ok);
    var geometry=[];
    for(var i=0;i<walls.length;i++){var w=walls[i];geometry.push(w.x,w.y,w.w,w.h);}
    e=cache[id]={c:cv,w:arena.w,h:arena.h,ver:ver[id],geometry:geometry,spots:torchSpots(id,arena.w,arena.h)};
  }
  ctx.drawImage(e.c,0,0);
  flames(ctx,e.spots,+t||0);
  return true;
}
window.ArenaEnvironment=Object.freeze({draw:draw});
})();
