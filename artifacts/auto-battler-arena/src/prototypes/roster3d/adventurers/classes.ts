import * as THREE from 'three';
import { createModelKit, type CharacterModel } from '../modelKit';
import { animateBase, buildHumanoid } from './humanoid';

const sw = (p: number) => Math.sin(p * Math.PI);
const ease = (p: number) => p * p * (3 - 2 * p);

export function createRogue(): CharacterModel {
  const k = createModelKit();
  const h = buildHumanoid(k, { skin: '#d7a078', cloth: '#3a1821', shoulder: '#a92c38', cloth2: '#2a1219', trim: '#15151b',
    boot: '#24262d', bulk: .86, face: false });
  const { torso, head } = h;
  // V3 hood: maroon cap over crown, black lower-face mask, eyes as bright dots
  k.mesh(head, 'sphere', '#3a1821', [0, .3, -.08], [.74, .62, .72]);
  k.mesh(head, 'cone', '#3a1821', [0, .1, -.78], [.4, .9, .4], [-1.95, 0, 0]);
  k.mesh(head, 'box', '#17131a', [0, -.3, .36], [.8, .5, .5]);
  for (const s of [-1, 1]) k.mesh(head, 'sphere', '#eef7ff', [s * .22, .02, .6], [.1, .07, .05]);
  // crimson V neckline, shoulder mantle, sash, cape
  for (const s of [-1, 1]) k.mesh(torso, 'box', '#a92c38', [s * .28, 1.55, .36], [.62, .09, .05], [0, 0, s * -.6]);
  k.mesh(torso, 'box', '#a92c38', [-.5, .1, .45], [.22, 1.0, .06], [0, 0, .12]);
  k.mesh(torso, 'box', '#4a2c20', [.65, .22, .1], [.3, .3, .3]);
  const cape = k.group(torso, [0, 1.9, -.45]);
  k.mesh(cape, k.plate([[-.75, 0], [.75, 0], [.95, -2.1], [.4, -1.8], [0, -2.3], [-.4, -1.8], [-.95, -2.1]], .05), '#2a1219');
  const dagger = (i: number, reverse: boolean) => {
    const g = k.group(h.hand[i]);
    g.rotation.x = reverse ? 0 : Math.PI - .15;
    if (reverse) g.position.z = .18;
    k.mesh(g, 'cylinder', '#4b2c20', [0, .05, 0], [.1, .5, .1]);
    k.mesh(g, 'box', '#15151b', [0, .33, 0], [.55, .09, .16]);
    k.mesh(g, 'cone', '#eef4f8', [0, 1.25, 0], [.2, 1.8, .06]);
  };
  dagger(0, false); dagger(1, true);
  return k.finish(h.root, pose => animateBase(h, pose, (mode, p, t) => {
    h.sh[0].rotation.x = -.9; h.sh[1].rotation.x = -.7; h.sh[0].rotation.z = .25; h.sh[1].rotation.z = -.25;
    h.el[0].rotation.x = -.8; h.el[1].rotation.x = -.8;
    h.torso.rotation.x = .22; h.head.rotation.x = -.1;
    if (mode === 'idle') { const b = Math.sin(t * 3) * .06; h.sh[0].rotation.x += b; h.sh[1].rotation.x -= b; }
    if (mode === 'attack') {
      const a = p < .5 ? sw(p * 2) : 0, b = p >= .5 ? sw((p - .5) * 2) : 0;
      h.sh[1].rotation.x = -.7 - a * .9; h.sh[1].rotation.z = -.25 + a * .9; h.torso.rotation.y = a * .5 - b * .5;
      h.sh[0].rotation.x = -.9 - b * .9; h.sh[0].rotation.z = .25 - b * .9; h.body.position.z = sw(p) * .5;
    }
    if (mode === 'cast') { h.sh[0].rotation.x = -1.8 * sw(p) - .4; h.sh[1].rotation.x = -1.8 * sw(p) - .4; h.sh[0].rotation.z = .5; h.sh[1].rotation.z = -.5; }
  }));
}

export function createPaladin(): CharacterModel {
  const k = createModelKit();
  const h = buildHumanoid(k, { skin: '#d7a078', cloth: '#d6a83f', shoulder: '#35558a', cloth2: '#2b3a5c', trim: '#f5e8b2',
    boot: '#24262d', bulk: 1.12, skirt: true, hair: '#5a3a1e' });
  const { torso, head } = h;
  // gold cuirass, cream chevron, blue pauldrons with gold rim
  for (const s of [-1, 1]) {
    k.mesh(torso, 'box', '#f5e8b2', [s * .3, 1.5, .4], [.7, .1, .05], [0, 0, s * -.6]);
    k.mesh(torso, 'cylinder', '#d6a83f', [s * 1.37, 1.62, 0], [.5, .1, .45]);
  }
  k.mesh(torso, 'box', '#f5e8b2', [0, .9, .5], [.5, 1.1, .06]);
  k.mesh(torso, 'cylinder', '#d6a83f', [0, .3, .5], [.18, .08, .18], [Math.PI / 2, 0, 0]);
  // V3 helm: gold dome with lowered brim, cheek guards, short cream crest
  k.mesh(head, 'sphere', '#d8b34f', [0, .22, -.03], [.72, .6, .7]);
  k.mesh(head, 'box', '#d8b34f', [0, .36, .52], [.8, .14, .2]);
  k.mesh(head, 'box', '#d8b34f', [0, .1, .66], [.09, .5, .05]);
  for (const s of [-1, 1]) k.mesh(head, 'box', '#d8b34f', [s * .62, -.1, .08], [.12, .6, .5]);
  k.mesh(head, 'box', '#f5e8b2', [0, .85, -.05], [.1, .35, .8], [-.1, 0, 0]);
  const cape = k.group(torso, [0, 1.9, -.5]);
  k.mesh(cape, k.plate([[-.95, 0], [.95, 0], [1.15, -2.4], [-1.15, -2.4]], .06), '#1f2f52');
  // gold block warhammer (right hand)
  const hm = k.group(h.hand[1]); hm.rotation.x = Math.PI / 2;
  k.mesh(hm, 'cylinder', '#6d4829', [0, .5, 0], [.13, 2.8, .13]);
  k.mesh(hm, 'box', '#d6a83f', [0, 2.0, 0], [.95, .9, 1.7]);
  k.mesh(hm, 'box', '#f5e8b2', [0, 2.0, 0], [1.0, .12, .9]);
  // blue heater shield with gold border (left forearm)
  const sg = k.group(h.el[0], [.38, -.45, .25]);
  k.mesh(sg, k.plate([[-.75, 1], [.75, 1], [.75, -.1], [0, -1.35], [-.75, -.1]], .14), '#d6a83f');
  k.mesh(sg, k.plate([[-.58, .85], [.58, .85], [.58, -.05], [0, -1.05], [-.58, -.05]], .06), '#31558b', [0, 0, .15]);
  k.mesh(sg, 'box', '#f5e8b2', [0, .3, .24], [.14, 1.0, .05]);
  k.mesh(sg, 'box', '#f5e8b2', [0, .5, .24], [.66, .14, .05]);
  return k.finish(h.root, pose => animateBase(h, pose, (mode, p, t) => {
    h.sh[1].rotation.x = -.8; h.el[1].rotation.x = -.7; h.sh[1].rotation.z = -.15;
    h.sh[0].rotation.x = -.5; h.el[0].rotation.x = -1.0; h.sh[0].rotation.z = .1;
    if (mode === 'idle') h.sh[0].rotation.x += Math.sin(t * 2.2) * .04;
    if (mode === 'attack') {
      const up = p < .35 ? ease(p / .35) : 1, down = p < .35 ? 0 : ease((p - .35) / .4);
      h.sh[1].rotation.x = -.8 - up * 1.4 + Math.min(1, down) * 2.2; h.el[1].rotation.x = -.7 - up * .5;
      h.torso.rotation.x = -up * .2 + Math.min(1, down) * .5; h.body.position.z = Math.min(1, down) * .4;
      h.sh[0].rotation.x = -.5 - Math.min(1, down) * .5;
    }
    if (mode === 'cast') { h.sh[1].rotation.x = -1.6 * sw(p) - .8; h.el[1].rotation.x = -.3; h.sh[1].rotation.z = -.3; h.head.rotation.x = -.25 * sw(p); }
  }));
}

export function createArcher(): CharacterModel {
  const k = createModelKit();
  const h = buildHumanoid(k, { skin: '#d7a078', cloth: '#355b2d', shoulder: '#6f9d49', cloth2: '#2a4423', trim: '#4a321f',
    boot: '#24262d', bulk: .92, hair: '#4a321f' });
  const { torso, head } = h;
  // V3 hood: leaf-green cap with brow peak, face open below
  k.mesh(head, 'sphere', '#355b2d', [0, .28, -.1], [.72, .6, .72]);
  k.mesh(head, 'cone', '#355b2d', [0, .35, -.7], [.36, .8, .36], [-1.8, 0, 0]);
  k.mesh(head, 'box', '#355b2d', [0, .42, .5], [.82, .12, .3], [.25, 0, 0]);
  k.mesh(torso, 'box', '#6f9d49', [0, 1.55, .36], [.9, .08, .05]);
  k.mesh(torso, 'box', '#4a321f', [0, 1.1, .4], [.14, 1.7, .05], [0, 0, -.7]);
  const cape = k.group(torso, [0, 1.9, -.45]);
  k.mesh(cape, k.plate([[-.7, 0], [.7, 0], [.95, -1.8], [.3, -1.5], [-.1, -2.0], [-.85, -1.6]], .05), '#2a4423');
  // quiver and arrows
  const q = k.group(torso, [-.35, 1.3, -.62]); q.rotation.z = .35;
  k.mesh(q, k.taper(.28, .22, 1.6, 7), '#4a321f');
  for (let i = 0; i < 3; i++) {
    k.mesh(q, 'cylinder', '#e7d7ae', [(i - 1) * .1, 1.15, (i % 2) * .08], [.025, .8, .025]);
    k.mesh(q, 'cone', '#b8ff68', [(i - 1) * .1, 1.62, (i % 2) * .08], [.07, .26, .02]);
  }
  // bow in left hand
  const bow = k.group(h.hand[0]);
  // bow x = forward bulge (hand -y), bow y = limbs (hand +z)
  bow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)));
  const bowArc = k.group(bow); bowArc.rotation.z = -Math.PI / 2;
  k.mesh(bowArc, new THREE.TorusGeometry(1.5, .09, 4, 10, Math.PI), '#b77a35', [0, 0, 0]);
  const str = k.mesh(bow, 'box', '#e7d7ae', [0, 0, 0], [.025, 2.9, .025]);
  const arrow = k.group(bow, [0, 0, 0]);
  k.mesh(arrow, 'cylinder', '#b8ff68', [.7, 0, 0], [.03, 1.8, .03], [0, 0, Math.PI / 2]);
  k.mesh(arrow, 'cone', '#c9d2da', [1.7, 0, 0], [.09, .3, .03], [0, 0, -Math.PI / 2]);
  return k.finish(h.root, pose => animateBase(h, pose, (mode, p, t) => {
    str.position.x = 0; arrow.visible = mode === 'attack';
    h.sh[0].rotation.x = -.7; h.el[0].rotation.x = -.5; h.sh[1].rotation.x = -.2; h.el[1].rotation.x = -.4;
    if (mode === 'attack') {
      const pull = p < .6 ? ease(p / .6) : 0, rel = p >= .6 ? 1 - Math.min(1, (p - .6) / .15) : 1;
      h.sh[0].rotation.x = -1.5; h.el[0].rotation.x = -.05; h.sh[0].rotation.z = .1;
      h.sh[1].rotation.x = -1.45; h.sh[1].rotation.z = -.2 - pull * .9; h.el[1].rotation.x = -.3 - pull * 1.9 * rel - (1 - rel) * .1;
      h.torso.rotation.y = .45; h.head.rotation.y = -.4;
      str.position.x = -pull * rel * .9; arrow.position.x = -pull * rel * .9 + (p >= .6 ? Math.min(1.2, (p - .6) * 8) : 0);
      arrow.visible = p < .75;
    }
    if (mode === 'cast') { h.sh[0].rotation.x = -1.6; h.sh[1].rotation.x = -2.4 * sw(p); h.el[1].rotation.x = -.2; }
  }));
}
