import * as THREE from 'three';
import type { WarriorRig } from './warriorModel';

export type AnimationMode = 'idle' | 'run' | 'attack';
export const ANIMATION_MODES: readonly AnimationMode[] = ['idle', 'run', 'attack'];
export const ATTACK_PERIOD = 2.4;
export const RUN_CYCLE_SECONDS = 0.62; // two steps (one full stride) per cycle

export function parseAnimation(search: string): AnimationMode {
  const v = new URLSearchParams(search).get('animation');
  return (ANIMATION_MODES as readonly string[]).includes(v ?? '') ? (v as AnimationMode) : 'idle';
}

/** Pose channel indices. Hip/knee angles: positive hip = leg forward. */
export const F = {
  bodyY: 0, bodyZ: 1, torsoYaw: 2, torsoPitch: 3, torsoRoll: 4, headPitch: 5, headYaw: 6,
  hipL: 7, hipR: 8, kneeL: 9, kneeR: 10,
  swX: 11, swY: 12, swZ: 13, swRX: 14, swRY: 15, swRZ: 16, cape: 17,
} as const;
export const POSE_SIZE = 18;
export const createPose = () => new Float64Array(POSE_SIZE);

type Ease = (t: number) => number;
const lin: Ease = (t) => t;
const inOut: Ease = (t) => t * t * (3 - 2 * t);
const easeIn: Ease = (t) => t * t * t;
const easeOut: Ease = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

interface Key { t: number; ease: Ease; v: readonly number[] }
//                  bodyY bodyZ yaw   pitch roll hP  hY   hipL  hipR  kneeL kneeR swX   swY  swZ   swRX  swRY swRZ  cape
const G =         [0,    0,    0,    0.05, 0,   0,   0,   0.12, -0.12, 0.12, 0.12, 0.1,  0.9, 0.85, 0.2,  0,   0.55, 0.15] as const;
const ATTACK: readonly Key[] = [
  { t: 0, ease: lin, v: G },
  // windup: sword drawn up behind the right shoulder, weight shifts back
  { t: 0.55, ease: inOut, v: [0, -0.2, -0.5, -0.12, 0, 0.05, -0.2, 0.3, -0.3, 0.25, 0.1, -0.55, 1.6, 0.15, -1.25, 0, -0.35, 0.3] },
  { t: 0.68, ease: lin, v: [0, -0.22, -0.6, -0.15, 0, 0.05, -0.25, 0.3, -0.3, 0.25, 0.1, -0.6, 1.7, 0.1, -1.4, 0, -0.4, 0.3] },
  // slash: fast diagonal cut, lunge forward
  { t: 0.86, ease: easeIn, v: [-0.05, 0.55, 0.65, 0.3, 0, 0.1, 0.35, 0.75, -0.55, 0.75, 0.4, 0.5, 0.55, 1.05, 2.0, 0, 0.8, 0.6] },
  // follow through
  { t: 1.05, ease: easeOut, v: [-0.08, 0.65, 0.8, 0.35, 0, 0.15, 0.4, 0.8, -0.6, 0.8, 0.45, 0.85, 0.2, 1.0, 2.2, 0.2, 1.2, 0.8] },
  { t: 1.45, ease: lin, v: [-0.08, 0.65, 0.75, 0.35, 0, 0.15, 0.35, 0.8, -0.6, 0.8, 0.45, 0.85, 0.25, 1.0, 2.15, 0.2, 1.15, 0.75] },
  // recovery to guard
  { t: 2.1, ease: inOut, v: G },
  { t: ATTACK_PERIOD, ease: lin, v: G },
];

/** Normalised attack phase name for a time, useful for tests. */
export function attackPhase(time: number): 'windup' | 'slash' | 'recovery' | 'rest' {
  const t = ((time % ATTACK_PERIOD) + ATTACK_PERIOD) % ATTACK_PERIOD;
  if (t < 0.68) return 'windup';
  if (t < 1.05) return 'slash';
  if (t < 2.1) return 'recovery';
  return 'rest';
}

/** Writes pose channels for a mode at a time. No allocations. */
export function samplePose(mode: AnimationMode, time: number, out: Float64Array): Float64Array {
  if (mode === 'attack') {
    const t = ((time % ATTACK_PERIOD) + ATTACK_PERIOD) % ATTACK_PERIOD;
    let i = 1;
    while (i < ATTACK.length - 1 && t > ATTACK[i].t) i++;
    const a = ATTACK[i - 1], b = ATTACK[i];
    const e = b.ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
    for (let k = 0; k < POSE_SIZE; k++) out[k] = a.v[k] + (b.v[k] - a.v[k]) * e;
    return out;
  }
  for (let k = 0; k < POSE_SIZE; k++) out[k] = G[k];
  if (mode === 'idle') {
    const b = Math.sin((time * Math.PI * 2) / 2.8);
    out[F.bodyY] = b * 0.025;
    out[F.torsoPitch] = 0.04 + b * 0.018;
    out[F.headYaw] = Math.sin(time * 0.55) * 0.1;
    out[F.swY] += b * 0.035;
    out[F.swRZ] += Math.sin(time * 1.1) * 0.025;
    out[F.cape] = 0.13 + Math.sin(time * 1.5) * 0.05;
    return out;
  }
  // run: alternating gait
  const p = (time / RUN_CYCLE_SECONDS) * Math.PI * 2;
  const s = Math.sin(p), c = Math.cos(p);
  out[F.bodyY] = -0.2 * Math.abs(s);
  out[F.torsoPitch] = 0.24;
  out[F.torsoYaw] = s * 0.14;
  out[F.torsoRoll] = c * 0.03;
  out[F.headPitch] = -0.16;
  out[F.hipL] = s * 0.62;
  out[F.hipR] = -s * 0.62;
  out[F.kneeL] = 0.15 + 1.0 * Math.max(0, c);
  out[F.kneeR] = 0.15 + 1.0 * Math.max(0, -c);
  out[F.swX] = 0.2; out[F.swY] = 0.85 + Math.cos(2 * p) * 0.06; out[F.swZ] = 0.8;
  out[F.swRX] = 0.35; out[F.swRZ] = 0.5 + s * 0.07;
  out[F.cape] = 0.55 + Math.sin(2 * p) * 0.12;
  return out;
}

// Scratch objects (module level, reused every frame).
const UP = new THREE.Vector3(0, 1, 0);
const vT = new THREE.Vector3();
const vN = new THREE.Vector3();
const vP = new THREE.Vector3();
const vE = new THREE.Vector3();
const vD = new THREE.Vector3();
const qS = new THREE.Quaternion();

function placeSegment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, radius: number) {
  vD.subVectors(to, from);
  const len = Math.max(vD.length(), 1e-4);
  vD.multiplyScalar(1 / len);
  mesh.position.addVectors(from, to).multiplyScalar(0.5);
  mesh.quaternion.copy(qS.setFromUnitVectors(UP, vD));
  mesh.scale.set(radius, len, radius);
}

/** Boot sole bounds in knee-local space (plate bottom -0.62-0.26-0.05, z -0.33..0.77) and leg pivots. */
export const LEG_BOUNDS = { hipY: 1.4, kneeY: -0.82, soleY: -0.93, heelZ: -0.33, toeZ: 0.77 } as const;

function soleLowY(hipAngle: number, knee: number): number {
  const B = LEG_BOUNDS;
  const ck = Math.cos(knee), sk = Math.sin(knee);
  const hr = -hipAngle, ch = Math.cos(hr), sh = Math.sin(hr);
  const y0 = B.soleY;
  const a1 = y0 * ck - B.heelZ * sk + B.kneeY, a2 = y0 * sk + B.heelZ * ck;
  const b1 = y0 * ck - B.toeZ * sk + B.kneeY, b2 = y0 * sk + B.toeZ * ck;
  return B.hipY + Math.min(a1 * ch - a2 * sh, b1 * ch - b2 * sh);
}

/** Lowest boot point (body space) for the pose, before any body offset. */
export function lowestFootY(pose: Float64Array): number {
  return Math.min(soleLowY(pose[F.hipL], pose[F.kneeL]), soleLowY(pose[F.hipR], pose[F.kneeR]));
}

/** Applies a sampled pose to the rig. Allocation-free. */
export function applyPose(rig: WarriorRig, pose: Float64Array): void {
  // Ground the support foot at y=0; only upward breathing lift is kept.
  rig.body.position.set(0, -lowestFootY(pose) + Math.max(0, pose[F.bodyY]), pose[F.bodyZ]);
  rig.torso.rotation.set(pose[F.torsoPitch], pose[F.torsoYaw], pose[F.torsoRoll]);
  rig.head.rotation.set(pose[F.headPitch], pose[F.headYaw], 0);
  rig.cape.rotation.x = pose[F.cape];
  rig.legs[0].hip.rotation.x = -pose[F.hipL];
  rig.legs[1].hip.rotation.x = -pose[F.hipR];
  rig.legs[0].knee.rotation.x = pose[F.kneeL];
  rig.legs[1].knee.rotation.x = pose[F.kneeR];
  rig.sword.position.set(pose[F.swX], pose[F.swY], pose[F.swZ]);
  rig.sword.rotation.set(pose[F.swRX], pose[F.swRY], pose[F.swRZ]);
  rig.sword.updateMatrix();

  const l = rig.armLength;
  // Keep the rigid sword inside both hands' reach spheres (alternating projection,
  // bounded iterations) so the arm IK never has to clamp away from the grip.
  const limit = Math.min(l * 2 - 0.01, l * 1.94);
  for (let it = 0; it < 16; it++) {
    let moved = false;
    for (const arm of rig.arms) {
      vT.set(0, arm.gripY, 0).applyMatrix4(rig.sword.matrix);
      vN.subVectors(vT, arm.shoulder);
      const dd = vN.length();
      if (dd > limit) {
        rig.sword.position.addScaledVector(vN, -(dd - limit) / dd);
        rig.sword.updateMatrix();
        moved = true;
      }
    }
    if (!moved) break;
  }

  for (const arm of rig.arms) {
    vT.set(0, arm.gripY, 0).applyMatrix4(rig.sword.matrix);
    vN.subVectors(vT, arm.shoulder);
    const dist = Math.max(vN.length(), 1e-4);
    vN.multiplyScalar(1 / dist);
    const d = Math.min(dist, l * 2 - 0.01);
    const a = d / 2;
    const h = Math.sqrt(Math.max(0, l * l - a * a));
    vP.set(arm.side * 0.7, -1, -0.5);
    vP.addScaledVector(vN, -vP.dot(vN)).normalize();
    vE.copy(arm.shoulder).addScaledVector(vN, a).addScaledVector(vP, h);
    vT.copy(arm.shoulder).addScaledVector(vN, d);
    placeSegment(arm.upper, arm.shoulder, vE, 0.29);
    placeSegment(arm.fore, vE, vT, 0.27);
    arm.elbow.position.copy(vE);
    arm.hand.position.copy(vT);
  }
}
