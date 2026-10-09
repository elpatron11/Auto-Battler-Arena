import * as THREE from 'three';
import { createModelKit, type CharacterModel } from '../modelKit';
import { animateBase, buildHumanoid } from './humanoid';

const sw = (p: number) => Math.sin(p * Math.PI);

export function createDruidHuman(): CharacterModel {
  const k = createModelKit();
  const h = buildHumanoid(k, { skin: '#d7a078', cloth: '#4d6b35', shoulder: '#78a84f', cloth2: '#3a4f27', trim: '#6a4529',
    boot: '#24262d', skirt: true, hair: '#503522' });
  const { torso, head } = h;
  // V3 head: brown hair cap with two swept antler twigs
  k.mesh(head, 'sphere', '#503522', [0, .3, -.1], [.68, .56, .68]);
  k.mesh(head, 'cylinder', '#503522', [0, -.2, -.5], [.4, .9, .15]);
  for (const s of [-1, 1]) {
    const a = k.group(head, [s * .35, .7, 0]); a.rotation.z = -s * .45;
    k.mesh(a, 'cylinder', '#7d5a32', [0, .45, 0], [.07, .9, .07]);
    k.mesh(a, 'cone', '#7d5a32', [s * .22, .75, 0], [.06, .5, .06], [0, 0, -s * 1.0]);
    k.mesh(a, 'cone', '#7d5a32', [0, 1.0, 0], [.06, .35, .06]);
  }
  for (const s of [-1, 1]) {
    k.mesh(torso, 'box', '#78a84f', [s * .28, 1.55, .36], [.62, .09, .05], [0, 0, s * -.6]);
    k.mesh(torso, 'cone', '#78a84f', [s * 1.35, 1.65, .15], [.25, .7, .08], [0, 0, s * 1.9]);
  }
  k.mesh(torso, 'sphere', '#74d64d', [0, .3, .5], [.14, .14, .08], [0, 0, 0], true);
  for (const x of [-.5, 0, .5]) k.mesh(torso, 'cone', '#6a4529', [x, -.9, .55], [.3, .8, .08], [Math.PI, 0, 0]);
  // staff: brown shaft topped with a glowing green leaf
  const st = k.group(h.hand[1]); st.rotation.x = Math.PI / 2 - .1;
  k.mesh(st, 'cylinder', '#79522e', [0, .4, 0], [.1, 3.6, .1]);
  const orb = k.mesh(st, 'sphere', '#74d64d', [0, 2.4, 0], [.3, .5, .3], [0, 0, .3], true);
  k.mesh(st, 'cone', '#79522e', [.3, 1.8, 0], [.1, .5, .05], [0, 0, -1.2]);
  return k.finish(h.root, pose => animateBase(h, pose, (mode, p, t) => {
    h.sh[1].rotation.x = -.5; h.el[1].rotation.x = -.5; h.sh[1].rotation.z = -.1;
    orb.scale.set(.3, .5 + Math.sin(t * 3) * .03, .3);
    if (mode === 'attack') { h.sh[1].rotation.x = -.5 - sw(p) * 1.5; h.torso.rotation.x = sw(p) * .3; h.sh[0].rotation.x = sw(p) * -.8; }
    if (mode === 'cast') {
      h.sh[1].rotation.x = -1.7 * sw(p) - .5; h.sh[0].rotation.x = -2.0 * sw(p); h.sh[0].rotation.z = .5 * sw(p);
      h.head.rotation.x = -.2 * sw(p); orb.scale.set(.3 + sw(p) * .25, .5 + sw(p) * .4, .3 + sw(p) * .25);
    }
  }));
}

interface QSpec { fur: string; furL: string; furD: string; muzzle: string; len: number; girth: number; legH: number; bear: boolean }

function createQuadruped(s: QSpec): CharacterModel {
  const k = createModelKit();
  const root = new THREE.Group();
  root.scale.setScalar(1.15);
  const baseY = s.legH * 1.05 + .3;
  const body = k.group(root, [0, baseY, 0]);
  k.mesh(body, 'sphere', s.fur, [0, 0, 0], [s.girth, s.girth * .85, s.len]);
  k.mesh(body, 'sphere', s.furL, [0, -s.girth * .3, .1], [s.girth * .75, s.girth * .55, s.len * .75]);
  if (s.bear) k.mesh(body, 'sphere', s.fur, [0, s.girth * .65, s.len * .35], [s.girth * .85, s.girth * .6, s.len * .45]);
  k.mesh(body, 'cylinder', '#61d7ff', [s.girth * .88, .1, 0], [.02, .45, .45], [0, 0, Math.PI / 2], true); // druid rune
  const neck = k.group(body, [0, s.girth * (s.bear ? .45 : .3), s.len * .85]);
  const head = k.group(neck, [0, 0, .25]);
  const hs = s.bear ? 1 : .8;
  if (!s.bear) for (let i = 0; i < 8; i++) { // lion-style mane ring from the original tiger form
    const a = i / 8 * Math.PI * 2;
    k.mesh(head, 'sphere', s.furD, [Math.sin(a) * .85, Math.cos(a) * .85, -.25], [.4, .4, .5]);
  }
  k.mesh(head, 'sphere', s.bear ? s.fur : s.furL, [0, 0, 0], [.85 * hs, .75 * hs, .8 * hs]);
  k.mesh(head, 'box', s.muzzle, [0, -.2 * hs, .8 * hs], [.55 * hs, .38 * hs, .65 * hs]);
  k.mesh(head, 'sphere', '#171313', [0, -.02 * hs, 1.15 * hs], [.17, .13, .1]);
  const jaw = k.group(head, [0, -.4 * hs, .5 * hs]);
  k.mesh(jaw, 'box', s.muzzle, [0, -.05, .25 * hs], [.45 * hs, .14, .7 * hs]);
  for (const x of [-1, 1]) {
    k.mesh(head, 'sphere', s.bear ? s.furD : s.furD, [x * .6 * hs, .65 * hs, -.1], [.28, .28, .14]);
    k.mesh(head, 'sphere', '#ffd76b', [x * .33 * hs, .22 * hs, .66 * hs], [.11, .08, .06], [0, 0, 0], true);
    k.mesh(jaw, 'cone', '#f4f0e0', [x * .18, .1, .6 * hs], [.04, .18, .04]);
  }
  const tail = k.group(body, [0, 0, -s.len * .9]);
  if (s.bear) k.mesh(tail, 'sphere', s.fur, [0, 0, 0], [.25, .25, .25]);
  else {
    k.mesh(tail, k.taper(.14, .1, 1.6, 6), s.furD, [0, .45, -.7], [1, 1, 1], [Math.PI / 2 + .9, 0, 0]);
    k.mesh(tail, 'sphere', s.furD, [0, 1.15, -1.1], [.22, .22, .22]);
  }
  const legs: THREE.Group[] = []; const knees: THREE.Group[] = [];
  for (const z of [s.len * .6, -s.len * .6]) for (const x of [1, -1]) {
    const lg = k.group(body, [x * s.girth * .65, -.2, z]);
    const w = s.bear ? .42 : .3;
    k.mesh(lg, k.taper(w, w * .85, s.legH * .55), s.furD, [0, -s.legH * .27, 0]);
    const kn = k.group(lg, [0, -s.legH * .55, 0]);
    k.mesh(kn, k.taper(w * .85, w * .75, s.legH * .5), s.furD, [0, -s.legH * .22, 0]);
    k.mesh(kn, 'box', '#2a1b14', [0, -s.legH * .5, .15], [w * 1.7, .2, w * 2.4]);
    legs.push(lg); knees.push(kn);
  }
  return k.finish(root, ({ time: t, mode, progress }) => {
    const p = Math.min(1, Math.max(0, progress));
    body.position.set(0, baseY, 0); body.rotation.set(0, 0, 0);
    neck.rotation.set(0, 0, 0); jaw.rotation.set(0, 0, 0);
    tail.rotation.set(s.bear ? 0 : Math.sin(t * 4) * .25, s.bear ? 0 : Math.sin(t * 2) * .15, 0);
    legs.forEach(l => l.rotation.set(0, 0, 0)); knees.forEach(l => l.rotation.set(0, 0, 0));
    body.scale.set(1, 1 + Math.sin(t * 2.2) * .02, 1);
    if (mode === 'run') {
      const ph = t * (s.bear ? 8 : 12);
      legs.forEach((l, i) => { const f = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)); l.rotation.x = f * .8; knees[i].rotation.x = Math.max(0, -f) * .8; });
      body.position.y += Math.abs(Math.sin(ph)) * .2; body.rotation.x = Math.sin(ph * 2) * .04;
      neck.rotation.x = .1;
    } else if (mode === 'attack') {
      const a = sw(p);
      body.rotation.x = -a * .3; body.position.z = a * .5; body.position.y += a * .5;
      legs[0].rotation.x = -a * 2.2; legs[1].rotation.x = a * .3; knees[0].rotation.x = a * .6;
      neck.rotation.x = a * .5; jaw.rotation.x = a * .8; body.rotation.y = (p - .5) * .5;
    } else if (mode === 'cast') {
      const a = sw(p);
      body.rotation.x = -a * .5; body.position.y += a * .65; neck.rotation.x = -a * .4; jaw.rotation.x = a * .9;
      legs[0].rotation.x = -a * 1.3; legs[1].rotation.x = -a * 1.3;
    } else {
      neck.rotation.y = Math.sin(t * .9) * .15; neck.rotation.x = Math.sin(t * 1.4) * .05;
    }
  });
}

export const createBear = () => createQuadruped({ fur: '#65452f', furL: '#a47a52', furD: '#33251e', muzzle: '#c59b70',
  len: 1.7, girth: 1.3, legH: 1.7, bear: true });
export const createTiger = () => createQuadruped({ fur: '#b66a2d', furL: '#e7a04a', furD: '#4a2b1d', muzzle: '#e9bd7a',
  len: 1.55, girth: .95, legH: 1.8, bear: false });

export function createTree(): CharacterModel {
  const k = createModelKit();
  const root = new THREE.Group();
  root.scale.setScalar(.78);
  // static base: root toes stay planted; everything above sways about the pivot
  k.mesh(root, k.taper(1.0, 1.5, .7), '#2d2117', [0, .35, 0]);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    k.mesh(root, 'cone', '#2d2117', [Math.sin(a) * 1.5, .75, Math.cos(a) * 1.4], [.4, 1.3, .4], [Math.cos(a) * 1.25, 0, -Math.sin(a) * 1.25]);
  }
  const trunk = k.group(root, [0, .7, 0]);
  k.mesh(trunk, k.taper(.8, 1.15, 3.2), '#a77943', [0, 1.6, 0]);
  k.mesh(trunk, k.taper(.5, .9, 3.0), '#7a5430', [-.3, 1.6, -.15]);
  for (const s of [-1, 1]) {
    k.mesh(trunk, 'sphere', '#61d7ff', [s * .3, 2.35, .72], [.14, .09, .06], [0, 0, 0], true);
    k.mesh(trunk, 'box', '#2d2117', [s * .32, 2.58, .74], [.4, .1, .08], [0, 0, -s * .35]);
  }
  k.mesh(trunk, 'box', '#2d2117', [0, 1.7, .8], [.5, .1, .08]);
  const canopy = k.group(trunk, [0, 3.5, 0]);
  const blobs: [number, number, number, number, string][] = [[0, .2, 0, 1.5, '#3f7b31'], [-1.2, -.1, .3, 1.0, '#274c25'],
    [1.2, 0, -.2, 1.05, '#72a84f'], [.2, 1.0, .4, 1.0, '#a0c95c'], [0, -.1, -1.0, .9, '#274c25']];
  blobs.forEach(([x, y, z, r, c]) => k.mesh(canopy, 'sphere', c, [x, y, z], [r, r * .8, r]));
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const a = k.group(trunk, [s * .8, 2.5, 0]);
    k.mesh(a, k.taper(.22, .36, 2.0, 6), '#2d2117', [s * .85, .3, 0], [1, 1, 1], [0, 0, s * (Math.PI / 2 - .5)]);
    const f = k.group(a, [s * 1.7, .8, 0]);
    for (const r of [-.5, 0, .5]) k.mesh(f, 'cone', '#a77943', [s * .3, r * .5, 0], [.1, .8, .1], [0, 0, -s * Math.PI / 2 + r]);
    arms.push(a);
  }
  return k.finish(root, ({ time: t, mode, progress }) => {
    const p = Math.min(1, Math.max(0, progress)), a = sw(p);
    trunk.position.set(0, .7, 0);
    trunk.rotation.set(0, 0, Math.sin(t * 1.2) * .03);
    trunk.scale.set(1 + Math.sin(t * 2) * .015, 1 + Math.sin(t * 2) * .02, 1);
    canopy.rotation.set(0, Math.sin(t * .8) * .06, Math.sin(t * 1.7) * .03);
    arms[0].rotation.set(0, 0, Math.sin(t * 1.5) * .1); arms[1].rotation.set(0, 0, -Math.sin(t * 1.5 + 1) * .1);
    if (mode === 'run') { trunk.position.y += Math.abs(Math.sin(t * 8)) * .15; trunk.rotation.x = .08; trunk.rotation.z = Math.sin(t * 8) * .05; arms[0].rotation.z = Math.sin(t * 8) * .5; arms[1].rotation.z = Math.sin(t * 8) * .5; }
    if (mode === 'attack') { arms[0].rotation.set(-a * 1.4, 0, a * .6); arms[1].rotation.set(-a * 1.4, 0, -a * .6); trunk.rotation.x = a * .2; }
    if (mode === 'cast') { arms[0].rotation.z = -a * 1.1; arms[1].rotation.z = a * 1.1; canopy.scale.setScalar(1 + a * .2); }
    else canopy.scale.setScalar(1 + Math.sin(t * 2) * .02);
  });
}
