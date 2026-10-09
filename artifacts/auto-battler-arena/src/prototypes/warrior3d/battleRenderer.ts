import * as THREE from 'three';
import { applyPose, createPose } from './warriorAnimation';
import { createWarrior, type WarriorModel } from './warriorModel';
import { sampleBattlePose, type BattlePoseSample } from './battlePose';

export const SPRITE_LOCAL = { x0: -52, y0: -54, w: 106, h: 100 } as const;
export const SPRITE_DOWNSCALE = 1;
const TARGET_FPS = 30;
const CANVAS_SIZE = 160;

export interface BattleEntity {
  readonly alive: boolean;
  readonly team: string;
  readonly isCaptain: boolean;
  readonly classId: string;
  readonly isPet?: boolean;
  readonly x: number;
  readonly y: number;
  readonly radius?: number;
  readonly moveSpeed?: number;
  readonly atkAnimAt?: number;
  /** Duration in seconds; atkAnimAt is a performance.now()-style millisecond timestamp. */
  readonly atkAnimDur?: number;
  readonly atkAnimAng?: number;
  readonly casting?: unknown;
  readonly status?: Readonly<{
    stunTimer?: number;
    stunKind?: string;
    rootTimer?: number;
  }>;
  readonly extra?: Readonly<{ bladestorm?: number }>;
}

export type BattleRendererPhase = 'loading' | 'ready' | 'failed' | 'disposed';

export interface BattleRendererStats {
  renders: number;
  cachedDraws: number;
  drawCalls: number;
  triangles: number;
  renderMsLast: number;
  renderMsMax: number;
  modeCounts: Record<'idle' | 'run' | 'attack', number>;
  phase: BattleRendererPhase;
  status: string;
  loading: boolean;
  ready: boolean;
  failed: boolean;
  error?: string;
}

export interface BattleRendererSnapshot extends BattleRendererStats {
  enabled: boolean;
  initialized: boolean;
  failed: boolean;
  status: string;
}

export interface BattleRenderer {
  enabled: boolean;
  stats: BattleRendererStats;
  snapshot(): BattleRendererSnapshot;
  draw(ctx: CanvasRenderingContext2D, e: BattleEntity, t: number): boolean;
  reset(): void;
  dispose(): void;
}

interface EntityHistory {
  x: number;
  y: number;
  time: number;
  facing: number;
  moving: boolean;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function eligible(e: BattleEntity): boolean {
  return e.alive === true && e.team === 'player' && e.isCaptain === true &&
    e.classId === 'warrior' && e.isPet !== true;
}

/** Creates the preview-only live-mesh renderer. No DOM or WebGL work occurs at module import. */
export function createBattleRenderer(): BattleRenderer {
  let enabled = true;
  let canvas: HTMLCanvasElement | null = null;
  let cachedCanvas: HTMLCanvasElement | null = null;
  let cachedContext: CanvasRenderingContext2D | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let model: WarriorModel | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.OrthographicCamera | null = null;
  let disposed = false;
  let failure = '';
  let statusMessage = '';
  let lastRenderAt = -Infinity;
  let histories = new WeakMap<object, EntityHistory>();
  const pose = createPose();
  const stats: BattleRendererStats = {
    renders: 0,
    cachedDraws: 0,
    drawCalls: 0,
    triangles: 0,
    renderMsLast: 0,
    renderMsMax: 0,
    modeCounts: { idle: 0, run: 0, attack: 0 },
    phase: 'loading',
    status: 'Waiting for the first eligible Warrior.',
    loading: true,
    ready: false,
    failed: false,
  };

  const reportStatus = (message: string) => {
    if (message === statusMessage) return;
    statusMessage = message;
    stats.status = message;
  };

  const initialize = (): boolean => {
    if (renderer && model && scene && camera) return true;
    if (failure || disposed) return false;
    try {
      canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      cachedCanvas = document.createElement('canvas');
      cachedCanvas.width = CANVAS_SIZE;
      cachedCanvas.height = CANVAS_SIZE;
      cachedContext = cachedCanvas.getContext('2d', { willReadFrequently: true });
      if (!cachedContext) throw new Error('A 2D frame cache could not be created.');
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'low-power',
      });
      renderer.setPixelRatio(1);
      renderer.setSize(CANVAS_SIZE, CANVAS_SIZE, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 50);
      camera.position.set(0, 7.2, 14);
      camera.lookAt(0, 2.2, 0);
      scene.add(new THREE.AmbientLight(0xffffff, 1.55));
      const key = new THREE.DirectionalLight(0xffffff, 2.0);
      key.position.set(-4, 8, 7);
      scene.add(key);
      model = createWarrior();
      scene.add(model.root);
      stats.phase = 'ready';
      stats.loading = false;
      stats.ready = true;
      reportStatus('Live 3D Warrior preview ready.');
      return true;
    } catch (error) {
      failure = `Live 3D preview unavailable; original Warrior rendering remains active. ${error instanceof Error ? error.message : String(error)}`;
      stats.phase = 'failed';
      stats.loading = false;
      stats.failed = true;
      stats.error = failure;
      reportStatus(failure);
      releaseResources();
      return false;
    }
  };

  const releaseResources = () => {
    if (renderer) {
      try { renderer.dispose(); } catch { /* Continue releasing the model and canvas. */ }
      try { renderer.forceContextLoss(); } catch { /* Context may already be lost. */ }
      renderer = null;
    }
    try { model?.dispose(); } catch { /* Best-effort release of shared rig resources. */ }
    model = null;
    scene = null;
    camera = null;
    canvas = null;
    cachedCanvas = null;
    cachedContext = null;
  };

  const getHistory = (e: BattleEntity, now: number): EntityHistory => {
    let h = histories.get(e as object);
    if (!h) {
      h = { x: e.x, y: e.y, time: now, facing: 0, moving: false };
      histories.set(e as object, h);
      return h;
    }
    const dt = Math.max(0.001, Math.min(0.25, now - h.time));
    const dx = e.x - h.x;
    const dy = e.y - h.y;
    const distance = Math.hypot(dx, dy);
    const speed = distance / dt;
    h.moving = distance > 0.03 && speed > 1.5;
    if (h.moving) {
      // The mesh's front is +Z; map-space positive Y points down.
      h.facing = Math.atan2(dx, dy);
    }
    h.x = e.x;
    h.y = e.y;
    h.time = now;
    return h;
  };

  const draw = (ctx: CanvasRenderingContext2D, e: BattleEntity, t: number): boolean => {
    if (!eligible(e)) return false;
    if (!enabled || disposed || failure) return false;
    if (!initialize() || !renderer || !model || !scene || !camera || !canvas || !cachedCanvas || !cachedContext) return false;

    const now = finite(t) ? t : performance.now() / 1000;
    const history = getHistory(e, now);
    const status = e.status;
    const stunned = finite(status?.stunTimer) && status.stunTimer > 0;
    const rooted = finite(status?.rootTimer) && status.rootTimer > 0;
    const attackAt = finite(e.atkAnimAt) && e.atkAnimAt > 0 ? e.atkAnimAt : -Infinity;
    const attackDuration = finite(e.atkAnimDur) && e.atkAnimDur > 0 ? e.atkAnimDur : 0.34;
    const attackElapsed = (now * 1000 - attackAt) / 1000;
    const sample: BattlePoseSample = sampleBattlePose({
      time: now,
      moving: history.moving || (!stunned && !rooted && finite(e.moveSpeed) && e.moveSpeed > 0),
      stunned,
      rooted,
      attackElapsed,
      attackDuration,
    }, pose);
    if (sample.mode === 'attack' && finite(e.atkAnimAng)) {
      history.facing = Math.atan2(Math.cos(e.atkAnimAng), Math.sin(e.atkAnimAng));
    }

    if (renderer.getContext().isContextLost()) {
      failure = 'Live 3D preview lost its rendering context; original Warrior rendering remains active.';
      stats.phase = 'failed';
      stats.loading = false;
      stats.ready = false;
      stats.failed = true;
      stats.error = failure;
      reportStatus(failure);
      releaseResources();
      return false;
    }
    const wallTime = now * 1000;
    const renderNeeded = wallTime - lastRenderAt >= 1000 / TARGET_FPS;
    if (renderNeeded) {
      const started = performance.now();
      try {
        applyPose(model.rig, sample.pose);
        model.root.rotation.y = history.facing +
          (e.extra && finite(e.extra.bladestorm) && e.extra.bladestorm > 0 ? now * 11.5 : 0);
        if (renderer.getContext().isContextLost()) throw new Error('WebGL context was lost.');
        renderer.render(scene, camera);
        if (renderer.getContext().isContextLost()) throw new Error('WebGL context was lost.');
        // Read back once per mesh update, not on every battle frame. The
        // original sprite compositor can copy this bitmap between updates.
        cachedContext.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        cachedContext.drawImage(canvas, 0, 0);
        const elapsed = performance.now() - started;
        stats.renders++;
        stats.modeCounts[sample.mode]++;
        stats.drawCalls = renderer.info.render.calls;
        stats.triangles = renderer.info.render.triangles;
        stats.renderMsLast = elapsed;
        stats.renderMsMax = Math.max(stats.renderMsMax, elapsed);
        lastRenderAt = wallTime;
      } catch (error) {
        failure = `Live 3D preview lost its rendering context; original Warrior rendering remains active. ${error instanceof Error ? error.message : String(error)}`;
        stats.phase = 'failed';
        stats.loading = false;
        stats.ready = false;
        stats.failed = true;
        stats.error = failure;
        reportStatus(failure);
        releaseResources();
        return false;
      }
    } else {
      stats.cachedDraws++;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(10, 13, 19, 0.24)';
    ctx.beginPath();
    ctx.ellipse(0, 13, 12, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(cachedCanvas, -42.5, -47, 85, 85);
    ctx.restore();
    return true;
  };

  function reset() {
    histories = new WeakMap<object, EntityHistory>();
    lastRenderAt = -Infinity;
    stats.renders = 0;
    stats.cachedDraws = 0;
    stats.drawCalls = 0;
    stats.triangles = 0;
    stats.renderMsLast = 0;
    stats.renderMsMax = 0;
    stats.modeCounts.idle = 0;
    stats.modeCounts.run = 0;
    stats.modeCounts.attack = 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    releaseResources();
    histories = new WeakMap<object, EntityHistory>();
    stats.phase = 'disposed';
    stats.loading = false;
    stats.ready = false;
    reportStatus('Live 3D Warrior preview disposed.');
  }

  return {
    get enabled() { return enabled; },
    set enabled(value: boolean) { enabled = Boolean(value); },
    stats,
    snapshot() {
      return {
        ...stats,
        modeCounts: { ...stats.modeCounts },
        enabled,
        initialized: !!renderer,
        failed: !!failure,
        status: statusMessage,
      };
    },
    draw,
    reset,
    dispose,
  };
}