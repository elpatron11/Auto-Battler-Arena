/* Cosmetic presentation only. No combat values, ownership, timers or model geometry are changed. */
(function(root){
  'use strict';
  const TAU=Math.PI*2;
  const SHADOW={id:'warrior',accent:'#bd1638',bright:'#f04457',dark:'#100910'};
  const HOLY={id:'paladin',accent:'#ffe184',bright:'#fffdf1',dark:'#ad792e'};
  const finite=Number.isFinite;
  function theme(e){
    if(!e||e.isPet)return null;
    if(e.classId==='warrior'&&e.skinId==='emberLord')return SHADOW;
    if(e.classId==='paladin'&&e.skinId==='wingedPaladin')return HOLY;
    return null;
  }
  function budget(low){
    const phone=!!root.matchMedia?.('(pointer: coarse)').matches;
    const reduced=!!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return {low:!!low||phone||reduced,reduced,smoke:low||phone||reduced?2:4,sparks:low||phone||reduced?3:7};
  }
  function ellipse(c,x,y,rx,ry){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);}
  function line(c,x,y,xx,yy){c.beginPath();c.moveTo(x,y);c.lineTo(xx,yy);c.stroke();}
  function lightWings(c,x,y,power,low){
    c.strokeStyle=HOLY.bright;c.lineWidth=low?1.4:1.8;
    for(const side of [-1,1])for(let i=0;i<(low?3:5);i++){
      c.beginPath();c.moveTo(x+side*7,y+4);
      c.quadraticCurveTo(x+side*(22+i*3),y-25+i*2,x+side*(36+i*2)*power,y-24+i*8);c.stroke();
    }
  }
  function halo(c,x,y,r,alpha){
    c.globalAlpha*=alpha;c.strokeStyle=HOLY.accent;c.lineWidth=1.6;
    ellipse(c,x,y,r,r*.9);c.stroke();
    c.strokeStyle=HOLY.bright;c.lineWidth=.7;ellipse(c,x,y,r+3,(r+3)*.9);c.stroke();
  }
  /** Local body coordinates. Draw behind the unit, independent of the 2D/3D renderer. */
  function drawAmbient(c,e,time,low){
    const style=theme(e);if(!style||!finite(time))return false;
    const b=budget(low),t=b.reduced?0:time,alpha=c.globalAlpha;
    const moving=finite(e.moveSpeed)?Math.min(1,e.moveSpeed/80):0;
    c.save();
    try{
      c.globalAlpha=alpha*.33;c.strokeStyle=style.accent;c.lineWidth=1.1;
      ellipse(c,0,14,18+moving*2,5);c.stroke();
      if(style===SHADOW){
        c.fillStyle=SHADOW.dark;
        for(let i=0;i<b.smoke;i++){
          const p=(t*.65+i/b.smoke)%1,x=Math.sin(i*2.7+t)*12;
          c.globalAlpha=alpha*(1-p)*(.16+moving*.15);
          ellipse(c,x,15-p*(12+moving*13),4+p*4,3+p*5);c.fill();
        }
        c.strokeStyle=SHADOW.accent;c.lineWidth=1.3;
        if(moving>.15&&!b.reduced)for(let i=0;i<(b.low?2:3);i++){
          const p=(t*.9+i*.31)%1,x=(i-1)*7;
          c.globalAlpha=alpha*(1-p)*.45;
          c.beginPath();c.moveTo(x,14);
          c.quadraticCurveTo(x+Math.sin(t*2+i)*5,4-p*5,x-2,-p*15);c.stroke();
        }
        c.fillStyle=SHADOW.bright;
        for(let i=0;i<b.sparks;i++){
          const p=(t*.4+i*.27)%1;c.globalAlpha=alpha*(1-p)*.38;
          ellipse(c,Math.sin(i*2.4+t*.4)*(10+moving*3),13-p*(18+moving*9),.8,1.3);c.fill();
        }
      }else{
        c.globalCompositeOperation='screen';
        c.globalAlpha=alpha*.12;c.fillStyle=HOLY.accent;
        ellipse(c,0,14,21,7);c.fill();
        c.globalAlpha=alpha*.34;c.strokeStyle=HOLY.bright;c.lineWidth=.8;
        ellipse(c,0,14,14,4);c.stroke();
        for(let i=0;i<(b.low?2:4);i++){
          const p=(t*.35+i*.25)%1,x=Math.cos(i*2.3)*16,y=10-p*15;
          c.globalAlpha=alpha*(1-p)*.35;
          line(c,x-1,y,x+1,y);line(c,x,y-1,x,y+1);
        }
      }
    }finally{c.restore();}
    return true;
  }
  /** Selection / loading only: a light pattern, not new literal model wings. */
  function drawPresentation(c,e,time,low){
    const style=theme(e);if(!style)return false;
    const b=budget(low),t=b.reduced?0:(finite(time)?time:0),alpha=c.globalAlpha;
    c.save();
    try{
      if(style===HOLY){
        c.globalCompositeOperation='screen';c.globalAlpha=alpha*.20;
        halo(c,0,-19,27,.9);
        c.globalAlpha=alpha*(.10+.025*Math.sin(t*1.3));lightWings(c,0,-9,1,b.low);
        c.strokeStyle=HOLY.accent;c.lineWidth=.8;c.globalAlpha=alpha*.22;
        for(let i=0;i<(b.low?6:10);i++){
          const a=i/(b.low?6:10)*TAU;
          line(c,Math.cos(a)*29,-19+Math.sin(a)*27,Math.cos(a)*33,-19+Math.sin(a)*31);
        }
      }else{
        c.fillStyle=SHADOW.dark;
        for(let i=0;i<b.smoke;i++){
          const p=(t*.2+i/b.smoke)%1;
          c.globalAlpha=alpha*(1-p)*.28;
          ellipse(c,Math.sin(t*.5+i*2)*17,-7-p*30,9+p*9,8+p*13);c.fill();
        }
        c.globalAlpha=alpha*.23;c.strokeStyle=SHADOW.accent;c.lineWidth=1.1;
        for(let i=0;i<(b.low?2:4);i++){
          c.beginPath();c.moveTo((i-1.5)*12,12);
          c.quadraticCurveTo((i-1.5)*15+Math.sin(t+i)*4,-10,(i-1.5)*12,-37);c.stroke();
        }
      }
    }finally{c.restore();}
    return true;
  }
  /** One bounded, short-lived effect per signature event, inside the existing effect budget. */
  function makeEffect(e,kind,x,y,x2,y2,hitX,hitY){
    const style=theme(e);
    if(!style||![x,y,x2,y2].every(finite)||
      !(style===SHADOW?['charge','warriorPassive']:['holySmash','paladinPassive']).includes(kind))return null;
    return {type:'prestigeSignature',kind,style:style.id,x,y,x2,y2,
      hitX:finite(hitX)?hitX:x2,hitY:finite(hitY)?hitY:y2,t:0,
      dur:kind==='charge'?.58:kind==='holySmash'?.54:.7};
  }
  function drawEffect(c,fx,p,low){
    if(fx?.type!=='prestigeSignature'||!finite(p))return false;
    const b=budget(low),q=Math.max(0,Math.min(1,p)),fade=Math.sin(Math.PI*q)**.45;
    const style=fx.style==='paladin'?HOLY:SHADOW,alpha=c.globalAlpha;
    c.save();
    try{
      c.lineCap='round';c.lineJoin='round';
      if(fx.kind==='charge'){
        // Opaque dark core replaces the stock brown/yellow beams and their white centre.
        c.globalCompositeOperation='source-over';c.globalAlpha=alpha*(1-q)*.7;
        c.strokeStyle=SHADOW.dark;c.lineWidth=b.low?10:15;
        line(c,fx.x,fx.y,fx.x2,fx.y2);
        c.globalAlpha=alpha*(1-q)*.75;c.strokeStyle=SHADOW.accent;c.lineWidth=2.4;
        line(c,fx.x,fx.y-3,fx.x2,fx.y2-3);
        if(!b.reduced){
          for(let i=0;i<b.smoke;i++){
            const v=(i+.4)/b.smoke;
            c.globalAlpha=alpha*(1-q)*.3;c.fillStyle=SHADOW.dark;
            ellipse(c,fx.x+(fx.x2-fx.x)*v,fx.y+(fx.y2-fx.y)*v-q*9,5+q*6,4+q*5);c.fill();
          }
        }
      }else if(fx.kind==='holySmash'){
        c.globalCompositeOperation='screen';c.globalAlpha=alpha*(1-q)*.6;
        c.strokeStyle=HOLY.accent;c.lineWidth=b.low?4:6;line(c,fx.x,fx.y,fx.x2,fx.y2);
        c.strokeStyle=HOLY.bright;c.lineWidth=1.5;line(c,fx.x,fx.y,fx.x2,fx.y2);
      }
      const x=fx.hitX,y=fx.hitY,r=8+q*22;
      c.globalCompositeOperation=style===HOLY?'screen':'source-over';
      c.globalAlpha=alpha*fade*.58;c.strokeStyle=style.accent;c.lineWidth=2.5*(1-q)+.6;
      ellipse(c,x,y,r,r*.65);c.stroke();
      c.fillStyle=style===HOLY?HOLY.bright:SHADOW.dark;c.globalAlpha=alpha*fade*.35;
      ellipse(c,x,y,5+q*13,5+q*10);c.fill();
      c.strokeStyle=style.bright;c.lineWidth=1;c.globalAlpha=alpha*fade*.7;
      for(let i=0;i<b.sparks;i++){
        const a=i/b.sparks*TAU+.3,len=(b.reduced?7:6+q*20);
        line(c,x+Math.cos(a)*len,y+Math.sin(a)*len*.7,
          x+Math.cos(a)*(len+3),y+Math.sin(a)*(len+3)*.7);
      }
      if(fx.kind==='paladinPassive'){
        c.globalAlpha=alpha*fade*.5;lightWings(c,fx.x,fx.y-18,.7+q*.3,b.low);
        c.globalAlpha=alpha*fade*.35;halo(c,fx.x,fx.y-27,18,1);
      }else if(fx.kind==='warriorPassive'){
        c.globalAlpha=alpha*fade*.55;c.strokeStyle=SHADOW.accent;c.lineWidth=2;
        ellipse(c,fx.x,fx.y-9,16,23);c.stroke();
      }
    }finally{c.restore();}
    return true;
  }
  root.PrestigeVfx=Object.freeze({theme,budget,drawAmbient,drawPresentation,makeEffect,drawEffect});
})(window);