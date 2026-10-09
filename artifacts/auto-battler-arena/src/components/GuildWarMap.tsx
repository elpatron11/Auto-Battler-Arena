import { useState } from 'react';
import type { WarSnapshot } from '../lib/guildWarTypes';
import { GuildWar3D } from './guild-war-3d/GuildWar3D';
import { GuildWarMap2D } from './guild-war-3d/GuildWarMap2D';

function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
function flatSnapshot(s:WarSnapshot|null):WarSnapshot|null {
  if(!s||(s.map?.scale??1)===1)return s;
  // The retained flat renderer uses the original 1200x800 coordinate space.
  // Normalize presentation only; never change the authoritative snapshot.
  const scale=s.map!.scale;
  const point=<T extends {x:number;y:number}>(p:T):T=>({...p,x:p.x/scale,y:p.y/scale});
  return {...s,entities:s.entities.map(point),structures:s.structures.map(point),
    guilds:s.guilds.map(g=>({...g,camp:point(g.camp)})),boss:point(s.boss),banner:point(s.banner),
    summons:s.summons?.map(point),
    events:s.events?.map(e=>({...point(e),tx:e.tx/scale,ty:e.ty/scale})),
    map:s.map?{...s.map,width:s.map.width/scale,height:s.map.height/scale,scale:1,
      walls:s.map.walls.map(w=>({...point(w),w:w.w/scale,h:w.h/scale})),ramps:s.map.ramps.map(point)}:undefined};
}

/** Thin wrapper: real 3D battlefield, or the legacy 2D renderer with an explicit notice when WebGL is unavailable. */
export function GuildWarMap({ snap, meId, zoom }: { snap: WarSnapshot | null; meId: string | null; zoom: number }) {
  const [failed, setFailed] = useState<string | null>(() => (webglAvailable() ? null : 'WebGL is not available on this device'));
  if (failed) {
    return (
      <div data-testid="war-map-2d-fallback">
        <div role="status" data-testid="text-war-3d-unavailable" style={{ padding: '6px 10px', marginBottom: 6, borderRadius: 6, background: 'rgba(120,40,40,.35)', color: '#f6c9c2', font: "600 13px 'Barlow Condensed', sans-serif" }}>
          3D battlefield unavailable ({failed}). Showing the flat 2D map instead.
        </div>
        <GuildWarMap2D snap={flatSnapshot(snap)} meId={meId} zoom={zoom} />
      </div>
    );
  }
  return <GuildWar3D snap={snap} meId={meId} zoom={zoom} onFail={setFailed} />;
}
