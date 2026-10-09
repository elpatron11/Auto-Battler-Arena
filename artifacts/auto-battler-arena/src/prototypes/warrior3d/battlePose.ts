import { createPose, samplePose, type AnimationMode } from './warriorAnimation';

export const BATTLE_ATTACK_CLIP_SECONDS = 2.1;

export interface BattlePoseInput {
  time: number;
  moving: boolean;
  stunned: boolean;
  rooted: boolean;
  attackElapsed: number;
  attackDuration: number;
}

export interface BattlePoseSample {
  mode: AnimationMode;
  pose: Float64Array;
  attackProgress: number;
}

/** Returns the genuine attack-window progress, or zero when no attack is active. */
export function battleAttackProgress(elapsed: number, duration: number): number {
  if (!Number.isFinite(elapsed) || !Number.isFinite(duration) || duration <= 0 ||
      elapsed < 0 || elapsed >= duration) return 0;
  return Math.max(0, Math.min(1, elapsed / duration));
}

/** Samples the existing Warrior clips using only match-clock inputs. */
export function sampleBattlePose(input: BattlePoseInput, out = createPose()): BattlePoseSample {
  const attackProgress = battleAttackProgress(input.attackElapsed, input.attackDuration);
  const attackActive = Number.isFinite(input.attackElapsed) && Number.isFinite(input.attackDuration) &&
    input.attackDuration > 0 && input.attackElapsed >= 0 && input.attackElapsed < input.attackDuration;
  let mode: AnimationMode = 'idle';
  let clipTime = input.time;

  // Roots suppress locomotion, but (unlike stun) do not cancel an attack.
  if (input.stunned) {
    clipTime = 0;
  } else if (attackActive) {
    mode = 'attack';
    clipTime = attackProgress * BATTLE_ATTACK_CLIP_SECONDS;
  } else if (input.moving && !input.stunned && !input.rooted) {
    mode = 'run';
  }
  return { mode, pose: samplePose(mode, clipTime, out), attackProgress };
}