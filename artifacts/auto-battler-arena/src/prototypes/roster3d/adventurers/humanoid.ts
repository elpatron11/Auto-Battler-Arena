import * as THREE from 'three';
import type { CharacterPose, createModelKit } from '../modelKit';

export type Kit = ReturnType<typeof createModelKit>;
export interface HumanoidOpts {
  skin: string; cloth: string; shoulder: string; cloth2: string; trim: string; boot: string;
  bulk?: number; skirt?: boolean; eyeColor?: string; hair?: string; face?: boolean;
}
export interface Humanoid {
  root: THREE.Group; body: THREE.Group; torso: THREE.Group; head: THREE.Group;
  sh: [THREE.Group, THREE.Group]; el: [THREE.Group, THREE.Group]; hand: [THREE.Group, THREE.Group];
  hip: [THREE.Group, THREE.Group]; knee: [THREE.Group, THREE.Group];
}

/** Lean shared humanoid rig (feet y0, front +Z). Palette follows drawClassV3: main torso/sleeves, accent shoulders. */
export function buildHumanoid(k: Kit, o: HumanoidOpts): Humanoid {
  const b = o.bulk ?? 1;
  const root = new THREE.Group();
  const body = k.group(root);
  const hip = [] as unknown as Humanoid['hip'];
  const knee = [] as unknown as Humanoid['knee'];
  [1, -1].forEach((s, i) => {
    const h = k.group(body, [s * .45 * b, 1.6, 0]);
    k.mesh(h, k.taper(.34, .28, .85), o.cloth2, [0, -.42, 0], [b, 1, b]);
    const kn = k.group(h, [0, -.85, 0]);
    k.mesh(kn, k.taper(.28, .24, .75), o.cloth2, [0, -.37, 0]);
    k.mesh(kn, 'box', o.boot, [0, -.58, .16], [.6, .36, .98]);
    hip[i] = h; knee[i] = kn;
  });
  const torso = k.group(body, [0, 1.6, 0]);
  k.mesh(torso, k.taper(.8 * b, .62 * b, 1.55), o.cloth, [0, .95, 0], [1, 1, .62]);
  k.mesh(torso, 'box', o.trim, [0, .3, 0], [1.4 * b, .2, .9]);
  k.mesh(torso, 'cylinder', o.skin, [0, 1.85, 0], [.22, .3, .22]);
  if (o.skirt) k.mesh(torso, k.taper(.7 * b, 1.05 * b, 1.2, 8), o.cloth2, [0, -.3, 0], [1, 1, .85]);
  const sh = [] as unknown as Humanoid['sh'];
  const el = [] as unknown as Humanoid['el'];
  const hand = [] as unknown as Humanoid['hand'];
  [1, -1].forEach((s, i) => {
    const g = k.group(torso, [s * (.95 * b + .1), 1.65, 0]);
    k.mesh(g, 'sphere', o.shoulder, [0, .03, 0], [.46, .32, .4]);
    k.mesh(g, k.taper(.22, .2, .9), o.cloth, [0, -.45, 0]);
    const e = k.group(g, [0, -.9, 0]);
    k.mesh(e, k.taper(.2, .17, .8), o.cloth, [0, -.4, 0]);
    const hd = k.group(e, [0, -.85, 0]);
    k.mesh(hd, 'sphere', o.skin, [0, 0, 0], [.22, .2, .22]);
    sh[i] = g; el[i] = e; hand[i] = hd;
  });
  const head = k.group(torso, [0, 2.55, 0]);
  k.mesh(head, 'sphere', o.skin, [0, 0, 0], [.6, .66, .6]);
  if (o.face !== false) {
    for (const s of [-1, 1]) k.mesh(head, 'sphere', '#eef7ff', [s * .22, .04, .57], [.11, .09, .05]);
    k.mesh(head, 'cone', o.skin, [0, -.08, .64], [.08, .2, .08], [Math.PI / 2 + .3, 0, 0]);
    k.mesh(head, 'box', '#7a3d2c', [0, -.3, .55], [.24, .05, .05]);
  }
  return { root, body, torso, head, sh, el, hand, hip, knee };
}

export type ArmFn = (mode: CharacterPose['mode'], p: number, t: number) => void;

/** Idle breath, run cycle, then class gesture callback. */
export function animateBase(h: Humanoid, pose: CharacterPose, arms: ArmFn) {
  const { time: t, mode } = pose;
  const p = Math.min(1, Math.max(0, pose.progress));
  for (let i = 0; i < 2; i++) {
    h.sh[i].rotation.set(0, 0, 0); h.el[i].rotation.set(0, 0, 0);
    h.hip[i].rotation.set(0, 0, 0); h.knee[i].rotation.set(0, 0, 0);
  }
  h.body.position.set(0, 0, 0); h.body.rotation.set(0, 0, 0);
  h.torso.rotation.set(0, 0, 0); h.head.rotation.set(0, 0, 0);
  h.torso.scale.y = 1 + Math.sin(t * 2.2) * .015;
  if (mode === 'run') {
    const ph = t * 10, s = Math.sin(ph);
    h.hip[0].rotation.x = s * .9; h.hip[1].rotation.x = -s * .9;
    h.knee[0].rotation.x = Math.max(0, -s) * 1.1; h.knee[1].rotation.x = Math.max(0, s) * 1.1;
    h.sh[0].rotation.x = -s * .7; h.sh[1].rotation.x = s * .7;
    h.el[0].rotation.x = -.5; h.el[1].rotation.x = -.5;
    h.body.position.y = Math.abs(s) * .12; h.torso.rotation.x = .14;
  } else {
    h.sh[0].rotation.z = .1 + Math.sin(t * 2.2) * .03; h.sh[1].rotation.z = -.1 - Math.sin(t * 2.2) * .03;
    h.head.rotation.y = Math.sin(t * .8) * .08;
  }
  arms(mode, p, t);
}
