// Same rectangle/segment LOS semantics as the normal game's hasLOS; isolated
// map geometry so no existing arena rules or collision objects are changed.
export const MAP = {width:1200,height:800};
export const WALLS = [
  {x:440,y:220,w:320,h:14},{x:440,y:220,w:14,h:320},{x:746,y:220,w:14,h:320},
  {x:440,y:526,w:120,h:14},{x:640,y:526,w:120,h:14},
];
export const CAMPS = [{x:120,y:120},{x:1080,y:120},{x:1080,y:710},{x:600,y:740},{x:120,y:710}];
export const RAMPS = [{x:410,y:480},{x:790,y:480}];
export function point(room,x,y){const s=room.mapScale||1;return {x:x*s,y:y*s};}
export function layout(room){
  const scale=room.mapScale||1;
  return {width:MAP.width*scale,height:MAP.height*scale,scale,
    walls:WALLS.map(w=>({x:w.x*scale,y:w.y*scale,w:w.w*scale,h:w.h*scale})),
    camps:CAMPS.map(p=>point(room,p.x,p.y)),ramps:RAMPS.map(p=>point(room,p.x,p.y))};
}
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function segIntersectsRect(x1,y1,x2,y2,r){
  const rx=r.x+r.w,ry=r.y+r.h;
  if(Math.max(x1,x2)<r.x||Math.min(x1,x2)>rx||Math.max(y1,y2)<r.y||Math.min(y1,y2)>ry)return false;
  const ccw=(ax,ay,bx,by,cx,cy)=>(cy-ay)*(bx-ax)>(by-ay)*(cx-ax);
  const cross=(ax,ay,bx,by,cx,cy,dx,dy)=>ccw(ax,ay,cx,cy,dx,dy)!==ccw(bx,by,cx,cy,dx,dy)&&ccw(ax,ay,bx,by,cx,cy)!==ccw(ax,ay,bx,by,dx,dy);
  if([[r.x,r.y,rx,r.y],[rx,r.y,rx,ry],[rx,ry,r.x,ry],[r.x,ry,r.x,r.y]].some(e=>cross(x1,y1,x2,y2,...e)))return true;
  const inside=(x,y)=>x>=r.x&&x<=rx&&y>=r.y&&y<=ry;
  return inside(x1,y1)||inside(x2,y2);
}
export function obstacles(room){
  const gate=room.structures.find(s=>s.kind==="gate");
  const s=room.mapScale||1;
  return [...layout(room).walls,...(gate?.hp>0||room.ice?.hp>0?[{x:560*s,y:526*s,w:80*s,h:14*s}]:[])];
}
export function lineOfSight(room,a,b){
  // Wall-walk actors expose themselves on the parapet; only trim their local
  // endpoint, never let an ordinary unit shoot through the far castle wall.
  const length=dist(a,b)||1, trimA=a.wall?28*(room.mapScale||1):0,trimB=b.wall?28*(room.mapScale||1):0;
  const x1=a.x+(b.x-a.x)/length*trimA,y1=a.y+(b.y-a.y)/length*trimA;
  const x2=b.x+(a.x-b.x)/length*trimB,y2=b.y+(a.y-b.y)/length*trimB;
  return !obstacles(room).some(w=>segIntersectsRect(x1,y1,x2,y2,w));
}
function clear(room,a,b){
  return !obstacles(room).some(w=>segIntersectsRect(a.x,a.y,b.x,b.y,{x:w.x-9,y:w.y-9,w:w.w+18,h:w.h+18}));
}
export function route(room,a,b){
  // Checkpoints are JSON. Waypoints must never retain live actors: reciprocal
  // pursuit otherwise makes actor A.path -> B.path -> A circular.
  const from={x:a.x,y:a.y},to={x:b.x,y:b.y};
  if(clear(room,a,b))return [to];
  const nodes=[from,to,point(room,600,575),point(room,600,500)];
  for(const w of obstacles(room))for(const x of [w.x-16,w.x+w.w+16])for(const y of [w.y-16,w.y+w.h+16]){
    if(!obstacles(room).some(r=>x>r.x-10&&x<r.x+r.w+10&&y>r.y-10&&y<r.y+r.h+10))nodes.push({x,y});
  }
  const d=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),used=new Set();d[0]=0;
  for(let k=0;k<nodes.length;k++){
    let u=-1;for(let i=0;i<nodes.length;i++)if(!used.has(i)&&(u<0||d[i]<d[u]))u=i;
    if(u<0||!Number.isFinite(d[u]))break;
    if(u===1)break;used.add(u);
    for(let v=1;v<nodes.length;v++)if(!used.has(v)&&clear(room,nodes[u],nodes[v])){
      const cost=d[u]+dist(nodes[u],nodes[v]);if(cost<d[v]){d[v]=cost;prev[v]=u;}
    }
  }
  if(!Number.isFinite(d[1]))return [];
  const result=[];for(let i=1;i>0;i=prev[i]){result.unshift(nodes[i]);if(prev[i]<0)return [];}
  return result;
}
export function move(room,e,target,dt,speed=e.arenaMoveSpeed??70){
  if(e.arenaRooted)return;
  if(dist(e,target)<8)return;
  const key=`${Math.round(target.x/20)},${Math.round(target.y/20)},${room.geometry}`;
  if(e.pathKey!==key||room.now>e.pathUntil){e.path=route(room,e,target);e.pathKey=key;e.pathUntil=room.now+1000;}
  while(e.path?.length&&dist(e,e.path[0])<9)e.path.shift();
  const p=e.path?.[0];if(!p){recover(room,e,true);return;}
  const d=dist(e,p),step=Math.min(d,speed*dt);
  e.x+=(p.x-e.x)/d*step;e.y+=(p.y-e.y)/d*step;
  const map=layout(room);
  e.x=Math.max(20,Math.min(map.width-20,e.x));e.y=Math.max(20,Math.min(map.height-20,e.y));
  recover(room,e);
}
function recover(room,e,emptyPath=false){
  if(!e.anchor||dist(e,e.anchor)>10){e.anchor={x:e.x,y:e.y};e.stuckSince=room.now;}
  else if(room.now-e.stuckSince>3000){
    e.pathUntil=0;e.stuckSince=room.now;
    // Recovery is a local legal nudge, never a teleport through an obstacle.
    for(const [dx,dy] of [[18,0],[-18,0],[0,18],[0,-18]]){
      const n={x:e.x+dx,y:e.y+dy};
      const map=layout(room);
      if(n.x<20||n.x>map.width-20||n.y<20||n.y>map.height-20)continue;
      // Arriving within 9 units of a corner waypoint can leave a center just
      // inside pathfinding's inflated safety margin. Escape that margin only
      // if the segment crosses NO actual wall and the endpoint is fully clear.
      const escape=emptyPath&&!obstacles(room).some(w=>
        segIntersectsRect(e.x,e.y,n.x,n.y,w)||
        (n.x>=w.x-9&&n.x<=w.x+w.w+9&&n.y>=w.y-9&&n.y<=w.y+w.h+9));
      if(clear(room,e,n)||escape){e.x=n.x;e.y=n.y;break;}
    }
  }
}
