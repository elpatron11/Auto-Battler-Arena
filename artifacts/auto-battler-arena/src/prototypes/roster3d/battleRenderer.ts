import * as THREE from 'three';
import { createCharacterModel } from './characterModel';
import { createPrestigeRosterModel } from './premiumRoster/prestige';
import { createPremiumMageMotion } from './magePremiumMotion';
import { drawPremiumMageVfx } from './magePremiumVfx';
import { drawPremiumRosterVfx } from './premiumRoster/vfx';
import { createPolishedCharacterModel } from './polishModel';
import { createPolishMotion, getPolishReactionWeights, type PolishMotionModel } from './polishMotion';
import { drawPolishVfx, drawPolishDeath, drawPolishTotem, type PolishTotem } from './polishVfx';
import type { CharacterModel, CharacterPose } from './modelKit';
import { type DruidForm } from './roster';
import { entityModelId, type CreatureEntity, type ModelId } from './creatures';
import { battleAttackProgress } from '../warrior3d/battlePose';

export interface RosterEntity extends CreatureEntity {
  /** Cosmetic facing for lobby copies only; combat entities leave this unset. */
  readonly lobbyFacing?: number;
  readonly skinId?: string;
  readonly alive: boolean;
  readonly team: string;
  readonly classId: string;
  readonly isPet?: boolean;
  readonly isDungeonMonster?: boolean;
  readonly x: number;
  readonly y: number;
  readonly atkAnimAt?: number;
  readonly atkAnimDur?: number;
  readonly atkAnimAng?: number;
  readonly a2Variant?: string;
  readonly ultVariant?: string;
  readonly casting?: { readonly timeLeft: number; readonly total: number } | null;
  readonly hitFlashAt?: number;
  readonly hitFlashDur?: number;
  readonly radius?: number;
  readonly status?: { readonly stunTimer?: number; readonly rootTimer?: number; readonly polymorphed?: unknown };
  readonly extra?: { readonly form?: string; readonly bladestorm?: number; readonly shadowForm?: number; readonly rampage?: number };
}
type Slot = {
  skinId?: string;
  model: CharacterModel; id: ModelId; form: DruidForm; tile: number;
  x: number; y: number; time: number; facing: number;
  targetFacing: number;
};
export interface RosterRenderStats {
  tileSize: number;
  phase: 'loading' | 'ready' | 'failed' | 'disposed';
  renders: number;
  cachedDraws: number;
  units: number;
  drawCalls: number;
  triangles: number;
  renderMsLast: number;
  renderMsMax: number;
  modeCounts: Record<CharacterPose['mode'], number>;
  classes: string[];
  error: string;
}
export interface RosterBattleRenderer {
  enabled: boolean;
  stats: RosterRenderStats;
  draw(ctx: CanvasRenderingContext2D, entity: RosterEntity, time: number): boolean;
  handled(entity: RosterEntity): boolean;
  snapshot(): RosterRenderStats & { enabled: boolean };
  reset(): void;
  dispose(): void;
  drawDeath?(ctx: CanvasRenderingContext2D, entity: RosterEntity, time: number): boolean;
  drawTotems?(ctx: CanvasRenderingContext2D, totems: readonly PolishTotem[], time: number): void;
}
const TILE = 160, COLS = 3, MAX_UNITS = 18, INTERVAL = 1000 / 30;
function eligible(e: RosterEntity): boolean {
  const model = entityModelId(e);
  // Keep paid/equipped special skins visible until matching 3D variants exist.
  // Bosses, companions and adds use their dedicated models, not Warrior skins.
  const originalSkin = model && !model.startsWith('boss-') && !model.startsWith('pet-') &&
    !model.startsWith('add-') && e.skinId && e.skinId !== 'default' &&
    !((model === 'paladin' && e.skinId === 'wingedPaladin') || (model === 'warrior' && e.skinId === 'emberLord'));
  return e.alive && !e.status?.polymorphed &&
    !originalSkin && (e.team === 'player' || e.team === 'enemy') && model !== null;
}
function formOf(e: RosterEntity): DruidForm {
  const form = e.extra?.form;
  return e.classId === 'druid' && (form === 'bear' || form === 'tiger' || form === 'tree') ? form : '';
}
const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** One WebGL context and one CPU atlas readback, including bosses and live summoned pets. */
export function createRosterBattleRenderer(getEntities: () => readonly RosterEntity[], options: {
  polished?: boolean; presentationTime?: number; premiumMage?: () => CharacterModel;
  premiumRoster?: { supports(id: ModelId, form: DruidForm): boolean; create(id: ModelId, form: DruidForm): CharacterModel };
  /** Menu-only callers opt in; ordinary battles retain 160px tiles and 18 slots. */
  tileSize?: number;
  maxUnits?: number;
} = {}): RosterBattleRenderer {
  let tileSize = valid(options.tileSize) ? Math.max(TILE, Math.min(768, Math.ceil(options.tileSize))) : TILE;
  const maxUnits = valid(options.maxUnits) ? Math.max(1, Math.min(MAX_UNITS, Math.floor(options.maxUnits))) : MAX_UNITS;
  const initialRows = options.tileSize ? 1 : 2;
  let enabled = true, disposed = false, lastRender = -Infinity;
  let renderer: THREE.WebGLRenderer | null = null;
  let bitmap: HTMLCanvasElement | null = null, bitmapCtx: CanvasRenderingContext2D | null = null;
  let scene: THREE.Scene | null = null, camera: THREE.OrthographicCamera | null = null;
  let rows = initialRows;
  const slots = new Map<RosterEntity, Slot>();
  const drawn = new WeakSet<RosterEntity>();
  // Cosmetic onset recorded once after a previously rendered living entity dies.
  // It never writes an entity, delays removal, changes HP or owns combat timing.
  const deathStarts = new Map<RosterEntity, number>();
  const refined = (e: RosterEntity) => {
    const id = entityModelId(e);
    return options.premiumRoster ? !!id && options.premiumRoster.supports(id, formOf(e)) :
      options.premiumMage ? id === 'frostmage' : !!options.polished;
  };
  function ghost(e: RosterEntity, time: number): boolean {
    if (!refined(e) || e.alive || !slots.has(e)) return false;
    if (!deathStarts.has(e)) deathStarts.set(e, time);
    return time - deathStarts.get(e)! < .4;
  }
  const renderable = (e: RosterEntity, time: number) => eligible(e) || ghost(e, time);
  const stats: RosterRenderStats = { tileSize, phase: 'loading', renders: 0, cachedDraws: 0, units: 0,
    drawCalls: 0, triangles: 0, renderMsLast: 0, renderMsMax: 0,
    modeCounts: { idle: 0, run: 0, attack: 0, cast: 0 }, classes: [], error: '' };

  function release() {
    slots.forEach(s => s.model.dispose()); slots.clear();
    if (renderer) {
      try { renderer.dispose(); renderer.forceContextLoss(); } catch { /* Best effort on loss. */ }
    }
    renderer = null; bitmap = null; bitmapCtx = null; scene = null; camera = null;
  }
  function fail(error: unknown) {
    stats.phase = 'failed';
    stats.error = `3D roster unavailable — original characters remain active. ${error instanceof Error ? error.message : String(error)}`;
    release();
  }
  function initialize() {
    if (renderer) return true;
    if (disposed || stats.phase === 'failed') return false;
    try {
      const canvas = document.createElement('canvas');
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true,
        preserveDrawingBuffer: true, powerPreference: 'low-power' });
      if(options.tileSize && renderer.capabilities?.maxTextureSize)
        tileSize=Math.min(tileSize,Math.floor(renderer.capabilities.maxTextureSize/COLS/64)*64);
      stats.tileSize=tileSize;
      // Tile dimensions are already physical pixels. DPR here would apply it twice.
      renderer.setPixelRatio(1); renderer.setSize(tileSize * COLS, tileSize * rows, false);
      renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping; renderer.autoClear = false;
      bitmap = document.createElement('canvas'); bitmap.width = tileSize * COLS; bitmap.height = tileSize * rows;
      bitmapCtx = bitmap.getContext('2d', { willReadFrequently: true });
      if (!bitmapCtx) throw new Error('The roster frame cache could not be created.');
      scene = new THREE.Scene(); camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 50);
      camera.position.set(0, 7.2, 14); camera.lookAt(0, 2.2, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 1.55));
      const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-4, 8, 7); scene.add(light);
      return true;
    } catch (error) { fail(error); return false; }
  }
  function poseFor(e: RosterEntity, slot: Slot, time: number): CharacterPose {
    const previousFacing = slot.facing, previousTime = slot.time;
    const dx = e.x - slot.x, dy = e.y - slot.y;
    const moving = Math.hypot(dx, dy) > .03;
    if (moving) slot.targetFacing = slot.facing = Math.atan2(dx, dy);
    slot.x = e.x; slot.y = e.y; slot.time = time;
    const stun = (e.status?.stunTimer || 0) > 0, root = (e.status?.rootTimer || 0) > 0;
    const elapsed = (time * 1000 - (valid(e.atkAnimAt) && e.atkAnimAt > 0 ? e.atkAnimAt : -Infinity)) / 1000;
    const duration = valid(e.atkAnimDur) && e.atkAnimDur > 0 ? e.atkAnimDur : .34;
    const attacking = elapsed >= 0 && elapsed < duration;
    let mode: CharacterPose['mode'] = 'idle', progress = 0;
    if (!stun) {
      if (e.casting && e.casting.total > 0) {
        mode = 'cast'; progress = Math.max(0, Math.min(1, 1 - e.casting.timeLeft / e.casting.total));
      } else if (attacking) {
        mode = 'attack'; progress = battleAttackProgress(elapsed, duration);
        if (valid(e.atkAnimAng)) slot.targetFacing = slot.facing = Math.atan2(Math.cos(e.atkAnimAng), Math.sin(e.atkAnimAng));
      } else if (moving && !root) mode = 'run';
    }
    if (refined(e)) {
      const turn = Math.atan2(Math.sin(slot.targetFacing - previousFacing), Math.cos(slot.targetFacing - previousFacing));
      slot.facing = valid(options.presentationTime) ? slot.targetFacing :
        previousFacing + turn * (1 - Math.exp(-Math.max(0, time - previousTime) * 24));
      const reaction = getPolishReactionWeights(e, time);
      (slot.model as PolishMotionModel).setVisualReaction(reaction.hit,
        e.alive ? 0 : Math.min(1, (time - (deathStarts.get(e) ?? time)) / .3));
    }
    // Original bosses are front-facing brutes, not narrow side silhouettes.
    // Keep their faces and large contact bodies readable while aiming the windup.
    const facing = valid(e.lobbyFacing) ? e.lobbyFacing :
      slot.id.startsWith('boss-') ? Math.sin(slot.facing) * .55 : slot.facing;
    slot.model.root.rotation.y = facing +
      ((e.extra?.bladestorm || 0) > 0 ? time * 11.5 : 0);
    return { time: stun ? 0 : time, mode, progress,
      variant: (e.extra?.shadowForm || 0) > 0 ? 'shadow' :
        e.classId === 'frostmage' && e.ultVariant === 'custom' ? 'fire' :
        (e.extra?.rampage || 0) > 0 ? 'rampage' : undefined };
  }
  function refresh(time: number) {
    if (!renderer || !scene || !camera || !bitmap || !bitmapCtx) return false;
    try {
      if (renderer.getContext().isContextLost()) throw new Error('The graphics context was lost.');
      const started = performance.now();
      const all = getEntities();
      const living = ((options.polished || options.premiumMage || options.premiumRoster) ? [...all.filter(eligible), ...all.filter(e => ghost(e, time))] : all.filter(eligible)).slice(0, maxUnits);
      // Grow only when summons need it. Keep six-hero fights at the original atlas size.
      const neededRows = Math.max(initialRows, Math.ceil(living.length / COLS));
      if (neededRows > rows) {
        rows = neededRows;
        renderer.setSize(tileSize * COLS, tileSize * rows, false);
        bitmap.width = tileSize * COLS; bitmap.height = tileSize * rows;
      }
      const current = new Set(living);
      slots.forEach((slot, e) => {
        if (!current.has(e) || slot.form !== formOf(e) || slot.id !== entityModelId(e) || slot.skinId !== e.skinId) { slot.model.dispose(); slots.delete(e); }
      });
      let calls = 0, triangles = 0;
      renderer.setScissorTest(false); renderer.clear(true, true, true);
      renderer.setScissorTest(true);
      living.forEach((e, tile) => {
        let slot = slots.get(e);
        if (!slot) {
          const id = entityModelId(e)!, form = formOf(e);
          const prestige = (id === 'paladin' && e.skinId === 'wingedPaladin') || (id === 'warrior' && e.skinId === 'emberLord');
          const model = prestige ? createPrestigeRosterModel(id) : options.premiumRoster ? (options.premiumRoster.supports(id, form) ? options.premiumRoster.create(id, form) : createCharacterModel(id, form)) :
            options.premiumMage ? (id === 'frostmage' ? createPremiumMageMotion(options.premiumMage()) : createCharacterModel(id, form)) :
            options.polished ? createPolishMotion(createPolishedCharacterModel(id, form), id) : createCharacterModel(id, form);
          const facing = e.team === 'player' ? Math.PI / 2 : -Math.PI / 2;
          slot = { id, form, model, skinId:e.skinId, tile, x: e.x, y: e.y, time, facing, targetFacing: facing };
          slots.set(e, slot);
        }
        slot.tile = tile;
        const pose = poseFor(e, slot, valid(options.presentationTime) ? options.presentationTime : time); slot.model.animate(pose);
        const x = (tile % COLS) * tileSize, y = (rows - 1 - Math.floor(tile / COLS)) * tileSize;
        renderer!.setViewport(x, y, tileSize, tileSize); renderer!.setScissor(x, y, tileSize, tileSize);
        scene!.add(slot.model.root);
        try {
          renderer!.render(scene!, camera!);
          calls += renderer!.info.render.calls; triangles += renderer!.info.render.triangles;
        } finally { scene!.remove(slot.model.root); }
        stats.modeCounts[pose.mode]++;
      });
      renderer.setScissorTest(false);
      if (renderer.getContext().isContextLost()) throw new Error('The graphics context was lost.');
      // Flush/copy WebGL once, then every hero's ordinary 2D compositor uses this CPU atlas.
      bitmapCtx.clearRect(0, 0, bitmap.width, bitmap.height);
      bitmapCtx.drawImage(renderer.domElement, 0, 0);
      stats.renderMsLast = performance.now() - started;
      stats.renderMsMax = Math.max(stats.renderMsMax, stats.renderMsLast);
      stats.drawCalls = calls; stats.triangles = triangles; stats.units = living.length;
      stats.classes = [...new Set(living.map(e => entityModelId(e)!))];
      stats.renders++; stats.phase = 'ready'; lastRender = time * 1000;
      return true;
    } catch (error) { fail(error); return false; }
  }
  function handled(e: RosterEntity) {
    return enabled && !disposed && stats.phase === 'ready' && eligible(e) && drawn.has(e) && slots.has(e);
  }
  const api: RosterBattleRenderer = {
    get enabled() { return enabled; }, set enabled(value: boolean) { enabled = !!value; },
    stats, handled,
    draw(ctx, e, time) {
      if (!enabled || !valid(time) || !renderable(e, time) || !initialize()) return false;
      // Capacity overflow stays on Original; do not rebuild the same full atlas
      // for every additional unit during a single combat render frame.
      if (!slots.has(e) && time * 1000 === lastRender) return false;
      if (time * 1000 - lastRender >= INTERVAL || !slots.has(e) || slots.get(e)!.form !== formOf(e) || slots.get(e)!.id !== entityModelId(e)) {
        if (!refresh(time)) return false;
      } else stats.cachedDraws++;
      const slot = slots.get(e); if (!slot || !bitmap) return false;
      const monster = slot.id === 'boss-frost' || slot.id === 'boss-demon';
      const size = monster ? 230 : e.isPet ? 65 : 85;
      const top = monster ? -111 : e.isPet ? -37 : -47;
      ctx.save();
      if (!e.alive) ctx.globalAlpha *= Math.max(0, 1 - (time - deathStarts.get(e)!) / .4);
      ctx.fillStyle = 'rgba(10,13,19,.24)'; ctx.beginPath();
      ctx.ellipse(0, monster ? 54 : e.isPet ? 9 : 13, monster ? 50 : 12, monster ? 12 : 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(bitmap, slot.tile % COLS * tileSize, Math.floor(slot.tile / COLS) * tileSize, tileSize, tileSize, -size / 2, top, size, size);
      if (e.alive && refined(e)) {
        const visualTime = valid(options.presentationTime) ? options.presentationTime : time;
        if (options.premiumRoster) drawPremiumRosterVfx(ctx, e, visualTime);
        else if (options.premiumMage) drawPremiumMageVfx(ctx, e, visualTime);
        else drawPolishVfx(ctx, e, visualTime);
      }
      ctx.restore(); drawn.add(e); return true;
    },
    snapshot() { return { ...stats, classes: [...stats.classes], modeCounts: { ...stats.modeCounts }, enabled }; },
    reset() {
      if (renderer && bitmap && rows !== initialRows) {
        rows = initialRows; renderer.setSize(tileSize * COLS, tileSize * rows, false); bitmap.height = tileSize * rows;
      }
      slots.forEach(s => s.model.dispose()); slots.clear(); deathStarts.clear(); lastRender = -Infinity;
      stats.renders = 0; stats.cachedDraws = 0; stats.units = 0; stats.classes = [];
      stats.drawCalls = 0; stats.triangles = 0; stats.renderMsLast = 0; stats.renderMsMax = 0;
      stats.modeCounts = { idle: 0, run: 0, attack: 0, cast: 0 };
      if (stats.phase !== 'failed' && !disposed) stats.phase = 'loading';
    },
    dispose() { if (disposed) return; disposed = true; release(); stats.phase = 'disposed'; },
  };
  if (options.polished || options.premiumMage || options.premiumRoster) {
    api.drawDeath = (ctx, e, time) => {
      if (!enabled || !ghost(e, time)) return false;
      ctx.save(); ctx.translate(e.x, e.y);
      const drawn = api.draw(ctx, e, time);
      ctx.restore();
      if (drawn) {
        ctx.save(); ctx.globalAlpha *= Math.max(0, 1 - (time - deathStarts.get(e)!) / .4);
        drawPolishDeath(ctx, e, time); ctx.restore();
      }
      return drawn;
    };
    if (!options.premiumMage && !options.premiumRoster) api.drawTotems = (ctx, totems, time) => {
        if (enabled && stats.phase === 'ready') totems.forEach(totem => drawPolishTotem(ctx, totem, time));
      };
  }
  return api;
}