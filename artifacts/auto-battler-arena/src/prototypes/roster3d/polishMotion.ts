import type { CharacterModel, CharacterPose } from './modelKit';
import type { ModelId } from './creatures';

export interface PolishMotionModel extends CharacterModel {
  /** Read-only visual weights supplied by the renderer; no timing is owned here. */
  setVisualReaction(hit: number, death?: number): void;
}

export interface PolishReactionEntity {
  readonly alive: boolean;
  readonly hitFlashAt?: number;
  readonly hitFlashDur?: number;
}

type Transform = {
  x: number; y: number; z: number;
};
type VisualJoint = {
  rotation: Transform;
  position: Transform;
  scale: Transform;
};

const clamp01 = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
const smooth = (n: number) => n * n * (3 - 2 * n);

/** Uses the practice clock and authoritative hit timestamp; death is `alive === false`. */
export function getPolishReactionWeights(entity: PolishReactionEntity, time: number) {
  const duration = entity.hitFlashDur && entity.hitFlashDur > 0 ? entity.hitFlashDur : 0.18;
  const elapsed = entity.hitFlashAt ? (time * 1000 - entity.hitFlashAt) / 1000 : Infinity;
  const hit = elapsed >= 0 && elapsed < duration
    ? Math.sin(clamp01(elapsed / duration) * Math.PI) : 0;
  return { hit, death: entity.alive ? 0 : 1 };
}

function makeSnapshot() {
  return {
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

function snapshotInto(base: ReturnType<typeof makeSnapshot>, joint: VisualJoint) {
  base.rotation.x = joint.rotation.x; base.rotation.y = joint.rotation.y; base.rotation.z = joint.rotation.z;
  base.position.x = joint.position.x; base.position.y = joint.position.y; base.position.z = joint.position.z;
  base.scale.x = joint.scale.x; base.scale.y = joint.scale.y; base.scale.z = joint.scale.z;
}

function restore(joint: VisualJoint, base: ReturnType<typeof makeSnapshot>) {
  joint.rotation.x = base.rotation.x; joint.rotation.y = base.rotation.y; joint.rotation.z = base.rotation.z;
  joint.position.x = base.position.x; joint.position.y = base.position.y; joint.position.z = base.position.z;
  joint.scale.x = base.scale.x; joint.scale.y = base.scale.y; joint.scale.z = base.scale.z;
}

/**
 * Wraps the authoritative model animation and layers a small, deterministic
 * body follow-through on top. The base pose object is forwarded unchanged.
 */
export function createPolishMotion(model: CharacterModel, id: ModelId): PolishMotionModel {
  // Builders keep their articulated body as the first root child. A fallback
  // to root supports future models which animate the root directly.
  const joint = (model.root.children[0] || model.root) as unknown as VisualJoint;
  const priorBase = makeSnapshot();
  let hasPriorBase = false;
  let hit = 0, death = 0;

  return {
    ...model,
    setVisualReaction(hitWeight: number, deathWeight = 0) {
      hit = clamp01(hitWeight);
      death = clamp01(deathWeight);
    },
    animate(pose: CharacterPose) {
      // Remove only our previous overlay before the authoritative animation
      // runs, including on rigs whose base animator leaves body transforms
      // untouched in some modes.
      if (hasPriorBase) restore(joint, priorBase);
      model.animate(pose);
      snapshotInto(priorBase, joint);
      hasPriorBase = true;
      const base = priorBase;
      const t = Number.isFinite(pose.time) ? pose.time : 0;
      const p = clamp01(pose.progress);
      const attack = pose.mode === 'attack' ? Math.sin(p * Math.PI) : 0;
      const cast = pose.mode === 'cast' ? Math.sin(p * Math.PI) : 0;
      const run = pose.mode === 'run';
      const idle = pose.mode === 'idle';

      // A small class-aware weight preserves broad, chunky silhouettes while
      // giving light humanoids a little more readable anticipation.
      const lightFrame = id === 'rogue' || id === 'archer' || id === 'priest' ||
        id === 'frostmage' || id === 'warlock' || id === 'shaman';
      const weight = lightFrame ? 1 : 0.72;
      const anticipation = pose.mode === 'attack' ? smooth(Math.min(1, p / 0.38)) * (1 - smooth(Math.max(0, (p - 0.38) / 0.18))) : 0;
      const recover = pose.mode === 'attack' ? smooth(Math.max(0, (p - 0.55) / 0.45)) : 0;

      joint.rotation.x = base.rotation.x + weight * (
        (run ? 0.035 : 0) - anticipation * 0.045 + attack * 0.035 -
        cast * 0.025 + hit * 0.11 + death * 0.28);
      joint.rotation.z = base.rotation.z + weight * (
        Math.sin(t * (idle ? 1.15 : 0.75)) * (idle ? 0.012 : 0.006) +
        (run ? 0.018 : 0) + (anticipation - recover) * 0.025 -
        hit * 0.055 - death * 0.12);
      joint.position.y = base.position.y + (idle ? Math.sin(t * 2.1) * 0.018 : 0) +
        (run ? Math.abs(Math.sin(t * 8)) * 0.018 : 0) + cast * 0.018 -
        hit * 0.025 - death * 0.08;
      const compression = 1 - death * 0.035 - hit * 0.008;
      joint.scale.y = base.scale.y * compression;
    },
  };
}