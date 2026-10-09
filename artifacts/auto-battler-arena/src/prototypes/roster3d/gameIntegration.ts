import { createRosterBattleRenderer, type RosterBattleRenderer, type RosterEntity, type RosterRenderStats } from './battleRenderer';
import { PREMIUM_ROSTER_FACTORY } from './premiumRoster';

export type GameBodyLayer = RosterBattleRenderer & {
  beginFrame(time: number): void;
  clock(time: number): number;
  drawPreview(ctx: CanvasRenderingContext2D, entity: RosterEntity, party: readonly RosterEntity[], time: number, requiredPixels?: number): boolean;
  readonly previewStats?: RosterRenderStats;
};
interface GameRoot extends Window {
  GameBody3DSource?: {
    entitiesForRendering(): readonly RosterEntity[];
    paused(): boolean;
  };
  GameBody3D?: GameBodyLayer;
  PrestigeVfx?: {
    drawPresentation(ctx: CanvasRenderingContext2D, e: RosterEntity, time: number, low?: boolean): boolean;
    drawAmbient(ctx: CanvasRenderingContext2D, e: RosterEntity, time: number, low?: boolean): boolean;
  };
}
export const GRAPHICS_KEY = 'arena:body-graphics:v1';
type Mode = '3d' | 'original';
const parseMode = (value: string | null): Mode => value === 'original' ? 'original' : '3d';

/** Cosmetic-only runtime: never starts combat or writes a profile/reward. */
export function installGameBody3D(root: GameRoot, factory = createRosterBattleRenderer) {
  const query = new URLSearchParams(root.location.search);
  // Dedicated comparisons keep their own renderer, clocks and mode controls.
  if (query.get('rosterBattlePreview') === '1' || query.get('warriorBattlePreview') === '1') return;
  if (root.GameBody3D) return root.GameBody3D;
  let mode: Mode = '3d', storageError = false;
  try { mode = parseMode(root.localStorage.getItem(GRAPHICS_KEY)); } catch { storageError = true; }
  const entities = () => root.GameBody3DSource?.entitiesForRendering() ?? [];
  // High-resolution, static menu frames never replace or enlarge the battle atlas.
  let previewParty: readonly RosterEntity[] | null = null;
  const createRenderer = () => factory(entities, { premiumRoster: PREMIUM_ROSTER_FACTORY });
  let renderer = createRenderer();
  let menuRenderer: RosterBattleRenderer | undefined, menuSize = 0;
  function releaseMenu() {
    menuRenderer?.dispose(); menuRenderer = undefined; menuSize = 0;
  }
  let frameTime = 0, firstEntity: RosterEntity | undefined;
  const layer: GameBodyLayer = {
    get enabled() { return renderer.enabled; },
    set enabled(value) { renderer.enabled = value; if(menuRenderer)menuRenderer.enabled=value; },
    get stats() { return renderer.stats; },
    draw: (ctx, entity, time) => renderer.draw(ctx, entity, time),
    get previewStats() { return menuRenderer?.stats; },
    drawPreview(ctx, entity, party, time, requiredPixels) {
      if(!renderer.enabled)return false;
      const transform=ctx.getTransform?.();
      const native=requiredPixels ?? 85*Math.max(transform?Math.hypot(transform.a,transform.b):1,
        transform?Math.hypot(transform.c,transform.d):1);
      const size=Math.max(256,Math.min(768,Math.ceil((Number.isFinite(native)?native:256)/64)*64));
      if(!menuRenderer||menuSize!==size){
        releaseMenu();menuSize=size;
        menuRenderer=factory(()=>previewParty??[],{
          premiumRoster:PREMIUM_ROSTER_FACTORY,tileSize:size,maxUnits:3});
      }
      previewParty = party;
      try {
        const low = !!root.matchMedia?.('(pointer: coarse)').matches;
        root.PrestigeVfx?.drawPresentation(ctx, entity, time, low);
        root.PrestigeVfx?.drawAmbient(ctx, entity, time, low);
        return menuRenderer.draw(ctx, entity, time);
      }
      finally { previewParty = null; }
    },
    handled: entity => renderer.handled(entity),
    snapshot: () => renderer.snapshot(),
    reset: () => renderer.reset(),
    dispose: () => { releaseMenu(); renderer.dispose(); },
    beginFrame(time) {
      // Release the large menu cache before battle rendering starts.
      releaseMenu();
      const first = entities()[0];
      if (first !== firstEntity) { renderer.reset(); firstEntity = first; frameTime = 0; }
      if (!root.GameBody3DSource?.paused() || !frameTime) frameTime = time;
    },
    clock: time => frameTime || time,
  };
  root.GameBody3D = layer;
  const selects = [...root.document.querySelectorAll<HTMLSelectElement>('[data-game-graphics]')];
  const statuses = [...root.document.querySelectorAll<HTMLElement>('[data-game-graphics-status]')];
  function update() {
    selects.forEach(select => { select.value = mode; });
    const message = mode === 'original' ? 'Original bodies active' :
      renderer.stats.phase === 'failed' ? 'Original active — 3D unavailable on this device' :
      renderer.stats.phase === 'loading' ? '3D ready · starts in battle' :
      '3D bodies active · 30 FPS';
    const specialSkins = mode === '3d' && entities().some(entity =>
      entity.alive && !entity.isPet && !entity._dungeonBoss && !entity._dungeonAdd &&
      entity.skinId && entity.skinId !== 'default');
    statuses.forEach(status => {
      status.textContent = message + (specialSkins ? ' · Equipped skins keep Original art' : '') +
        (storageError ? ' · Choice cannot be saved on this device' : '');
      status.title = renderer.stats.phase === 'failed' ? renderer.stats.error : '';
    });
  }
  function apply(value: Mode) {
    mode = value;
    if (mode === '3d' && renderer.stats.phase === 'failed') {
      renderer.dispose(); renderer = createRenderer();
      firstEntity = undefined; frameTime = 0;
    }
    renderer.enabled = mode === '3d';
    if(menuRenderer){
      if(mode==='3d'&&menuRenderer.stats.phase==='failed')releaseMenu();
      else menuRenderer.enabled=mode==='3d';
    }
    update();
  }
  function change(event: Event) {
    apply(parseMode((event.currentTarget as HTMLSelectElement).value));
    try { root.localStorage.setItem(GRAPHICS_KEY, mode); storageError = false; }
    catch { storageError = true; }
    update();
  }
  function storage(event: StorageEvent) {
    if (event.key === GRAPHICS_KEY || event.key === null) apply(parseMode(event.newValue));
  }
  apply(mode);
  selects.forEach(select => select.addEventListener('change', change));
  root.addEventListener('storage', storage);
  const poll = root.setInterval(update, 1000);
  root.addEventListener('pagehide', () => {
    root.clearInterval(poll);
    selects.forEach(select => select.removeEventListener('change', change));
    root.removeEventListener('storage', storage);
    layer.dispose();
    if (root.GameBody3D === layer) delete root.GameBody3D;
  }, { once: true });
  return layer;
}