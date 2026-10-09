/* Circular bodies against padded obstacles. Collision-only; map art is unchanged. */
(function () {
  'use strict';
  const PAD = 3, EPS = 0.001;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function contact(x, y, radius, wall) {
    const cx = clamp(x, wall.x, wall.x + wall.w), cy = clamp(y, wall.y, wall.y + wall.h);
    const dx = x - cx, dy = y - cy, distance = Math.hypot(dx, dy), clearance = radius + PAD;
    if (distance > 0) return {nx: dx / distance, ny: dy / distance, depth: clearance - distance};
    const faces = [
      {nx:-1,ny:0,d:x-wall.x}, {nx:1,ny:0,d:wall.x+wall.w-x},
      {nx:0,ny:-1,d:y-wall.y}, {nx:0,ny:1,d:wall.y+wall.h-y},
    ];
    faces.sort((a,b) => a.d-b.d);
    return {...faces[0],depth:clearance+faces[0].d};
  }
  function blocked(x,y,r,walls) {
    return walls.some(w => contact(x,y,r,w).depth > EPS);
  }
  function contacts(x,y,r,walls,width,height) {
    const list = walls.map(w => contact(x,y,r,w)).filter(c => c.depth > 0);
    for (const c of [
      {nx:1,ny:0,depth:r+4-x}, {nx:-1,ny:0,depth:x-(width-r-4)},
      {nx:0,ny:1,depth:r+4-y}, {nx:0,ny:-1,depth:y-(height-r-4)},
    ]) if (c.depth > 0) list.push(c);
    return list.sort((a,b) => b.depth-a.depth);
  }
  function move(entity,dx,dy,distance,walls,width,height) {
    const length = Math.hypot(dx,dy), r = entity.radius || 14;
    let x=entity.x, y=entity.y;
    if (!length || !(distance > 0)) return {x,y,moved:false};
    const destination={x:x+dx/length*distance,y:y+dy/length*distance};
    if(pathClear(entity,destination,r,walls,width,height))
      return {...destination,moved:true};
    // Repair only shallow pre-existing overlap with the new padding, on an
    // actual movement request. No continuous force, deep teleport or bounce.
    for (let i=0;i<3;i++) {
      const c=contacts(x,y,r,walls,width,height)[0];
      if (!c || c.depth > PAD+EPS) break;
      const nx=x+c.nx*(c.depth+EPS), ny=y+c.ny*(c.depth+EPS);
      if (contacts(nx,ny,r,walls,width,height).some(other => other.depth > PAD+EPS)) break;
      x=nx;y=ny;
    }
    const count=Math.max(1,Math.ceil(distance/4)), sx=dx/length*distance/count, sy=dy/length*distance/count;
    for (let step=0;step<count;step++) {
      let vx=sx,vy=sy;
      for (let iteration=0;iteration<4 && Math.hypot(vx,vy)>EPS;iteration++) {
        if (!contacts(x+vx,y+vy,r,walls,width,height).length) {x+=vx;y+=vy;break;}
        let lo=0,hi=1;
        for (let i=0;i<14;i++) {
          const mid=(lo+hi)/2;
          if (contacts(x+vx*mid,y+vy*mid,r,walls,width,height).length) hi=mid; else lo=mid;
        }
        const hit=contacts(x+vx*hi,y+vy*hi,r,walls,width,height)[0];
        x+=vx*lo;y+=vy*lo;
        vx*=1-lo;vy*=1-lo;
        if (!hit) break;
        // Remove only the inward component; preserve tangential movement.
        const inward=vx*hit.nx+vy*hit.ny;
        if (inward<0) {vx-=inward*hit.nx;vy-=inward*hit.ny;}
        else break;
      }
    }
    return {x,y,moved:Math.hypot(x-entity.x,y-entity.y)>EPS};
  }
  function segmentRect(a,b,x,y,w,h) {
    let lo=0,hi=1;
    for (const [origin,delta,min,max] of [[a.x,b.x-a.x,x,x+w],[a.y,b.y-a.y,y,y+h]]) {
      if (Math.abs(delta)<1e-9) {if(origin<min||origin>max)return false;continue;}
      const first=(min-origin)/delta,last=(max-origin)/delta;
      lo=Math.max(lo,Math.min(first,last));hi=Math.min(hi,Math.max(first,last));
      if(lo>hi)return false;
    }
    return true;
  }
  function pathClear(a,b,r,walls,width,height) {
    if(b.x-r<=4||b.x+r>=width-4||b.y-r<=4||b.y+r>=height-4)return false;
    const reach=r+PAD-EPS, dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    for(const w of walls) {
      // Minkowski sum: flat wall sides and genuinely round outer corners,
      // including the square pillars, rather than square-expanded nav boxes.
      if(segmentRect(a,b,w.x-reach,w.y,w.w+2*reach,w.h)||
         segmentRect(a,b,w.x,w.y-reach,w.w,w.h+2*reach))return false;
      for(const [cx,cy] of [[w.x,w.y],[w.x+w.w,w.y],[w.x,w.y+w.h],[w.x+w.w,w.y+w.h]]) {
        const t=length?clamp(((cx-a.x)*dx+(cy-a.y)*dy)/length,0,1):0;
        if(Math.hypot(a.x+dx*t-cx,a.y+dy*t-cy)<reach)return false;
      }
    }
    return true;
  }
  window.ArenaCollision={blocked,move,pathClear,padding:PAD};
})();