import * as THREE from 'three';
import { createModelKit, type CharacterModel, type CharacterPose } from './modelKit';

export type PetModelId = 'pet-archer' | 'pet-archer-snake' | 'pet-archer-turtle' | 'pet-frostmage' | 'add-hound' | 'add-guard';
type Kit = ReturnType<typeof createModelKit>;
type Rig = (p: CharacterPose) => void;
const TAU = Math.PI * 2;
const INK = '#12151f';
const sin = Math.sin;
/** Attack/cast envelope: 0..1..0 over progress, 0 when not acting. */
function pulse(p: CharacterPose, mode: 'attack' | 'cast') {
  return p.mode === mode ? sin(Math.max(0, Math.min(1, p.progress)) * Math.PI) : 0;
}

/* Hawk: original warm brown body, gold beak, flapping wings. */
function hawk(k: Kit, root: THREE.Group): Rig {
  const col = '#8a5a34', dark = '#4d3220', light = '#c89a62', gold = '#e0a84a';
  const g = k.group(root, [0, 3.4, 0]);
  k.mesh(g, 'sphere', col, [0, 0, 0], [.7, .6, 1.15]);
  k.mesh(g, 'sphere', light, [0, -.12, .35], [.5, .42, .7]);
  const head = k.group(g, [0, .35, 1.0]);
  k.mesh(head, 'sphere', col, [0, 0, 0], [.42, .4, .42]);
  k.mesh(head, 'cone', gold, [0, -.05, .55], [.16, .5, .16], [Math.PI / 2, 0, 0]);
  for (const s of [-1, 1]) k.mesh(head, 'sphere', INK, [s * .24, .1, .26], [.07, .07, .07]);
  const tail = k.group(g, [0, 0, -1.0]);
  k.mesh(tail, 'box', dark, [0, 0, -.45], [.55, .06, .9], [-.15, 0, 0]);
  const wings = [-1, 1].map(s => {
    const w = k.group(g, [s * .55, .15, .1]);
    k.mesh(w, 'box', dark, [s * .8, 0, 0], [1.6, .07, .9]);
    k.mesh(w, 'box', col, [s * 1.9, 0, -.15], [.9, .06, .65]);
    k.mesh(w, 'box', dark, [s * 2.6, 0, -.3], [.6, .05, .35]);
    return w;
  });
  const legs = [-1, 1].map(s => {
    const l = k.group(g, [s * .22, -.45, .1]);
    k.mesh(l, 'cylinder', gold, [0, -.2, 0], [.06, .45, .06]);
    k.mesh(l, 'box', gold, [0, -.45, .1], [.2, .05, .3]);
    return l;
  });
  return p => {
    const a = pulse(p, 'attack'), c = pulse(p, 'cast');
    const rate = p.mode === 'run' ? 11 : 6;
    const flap = sin(p.time * rate) * (p.mode === 'run' ? .85 : .55) + a * .4;
    wings.forEach((w, i) => { const s = i ? 1 : -1; w.rotation.set(0, 0, s * flap * -1 + s * -.1); });
    g.position.y = 3.4 + sin(p.time * 3) * .2 + c * .3;
    g.rotation.x = a * .6 + (p.mode === 'run' ? .12 : 0);
    head.rotation.x = -a * .5; tail.rotation.x = sin(p.time * rate) * .1;
    legs.forEach(l => l.rotation.x = -.6 - a * .3);
  };
}

/* Snake: green coils, head with forked red tongue, travelling undulation. */
function snake(k: Kit, root: THREE.Group): Rig {
  const col = '#6fb84a', dark = '#3b6f2c', belly = '#eaff9b';
  const segs: THREE.Group[] = [];
  const N = 9;
  const base = k.group(root, [0, 0, 0]);
  for (let i = 0; i < N; i++) {
    const r = .55 - i * .035;
    const s = k.group(base, [0, r, -i * .62 + 1.6]);
    k.mesh(s, 'sphere', i % 2 ? dark : col, [0, 0, 0], [r, r, .5]);
    k.mesh(s, 'box', belly, [0, r * .45, 0], [.1, .08, .5]);
    segs.push(s);
  }
  const head = k.group(base, [0, .7, 2.1]);
  k.mesh(head, 'sphere', col, [0, 0, 0], [.52, .4, .7]);
  for (const s of [-1, 1]) {
    k.mesh(head, 'sphere', belly, [s * .3, .18, .3], [.1, .1, .1]);
    k.mesh(head, 'sphere', INK, [s * .33, .2, .36], [.05, .05, .05]);
  }
  const tongue = k.group(head, [0, -.05, .7]);
  k.mesh(tongue, 'box', '#d8564a', [0, 0, .3], [.05, .04, .6]);
  k.mesh(tongue, 'box', '#d8564a', [.1, 0, .72], [.04, .04, .3], [0, .5, 0]);
  k.mesh(tongue, 'box', '#d8564a', [-.1, 0, .72], [.04, .04, .3], [0, -.5, 0]);
  return p => {
    const a = pulse(p, 'attack'), c = pulse(p, 'cast');
    const sp = p.mode === 'run' ? 9 : 3, amp = p.mode === 'run' ? .75 : .35;
    segs.forEach((s, i) => {
      const x = sin(p.time * sp - i * .8) * amp * (.4 + i / N);
      s.position.x = x; s.rotation.y = Math.cos(p.time * sp - i * .8) * amp * .5;
      const lift = i < 3 ? a * .5 * (3 - i) : 0;
      s.position.y = (.55 - i * .035) + lift + c * .2;
    });
    head.position.set(sin(p.time * sp + .8) * amp * .3, .7 + a * 1.2 + c * .3, 2.1 + a * .9);
    head.rotation.set(a * .6, 0, 0);
    tongue.scale.z = .6 + .6 * Math.max(0, sin(p.time * 14)) + a * .5;
  };
}

/* Turtle: segmented hard green carapace, small four legs, head. */
function turtle(k: Kit, root: THREE.Group): Rig {
  const col = '#4f8b63', dark = '#315a42', light = '#c8e8a0', skin = '#7aa86a';
  const body = k.group(root, [0, 1.3, 0]);
  k.mesh(body, k.taper(1.2, 1.7, .8, 6), dark, [0, .1, 0], [1, 1, 1.2]);
  k.mesh(body, k.reg(new THREE.SphereGeometry(1.6, 6, 4, 0, TAU, 0, Math.PI / 2)), col, [0, .5, 0], [1.05, .95, 1.25]);
  const plates: [number, number][] = [[0, 0], [-.85, .1], [.85, .1], [0, 1.0], [0, -1.0], [-.8, 1.0], [.8, 1.0], [-.8, -1.0], [.8, -1.0]];
  plates.forEach(([x, z], i) => {
    const h = 2.05 - Math.hypot(x, z) * .5;
    k.mesh(body, 'cone', i ? light : '#e0f2b8', [x * 1.15, h - .5, z * 1.15], [.42, .22, .42]);
  });
  const head = k.group(body, [0, .15, 1.95]);
  k.mesh(head, 'sphere', skin, [0, 0, 0], [.45, .4, .55]);
  for (const s of [-1, 1]) k.mesh(head, 'sphere', INK, [s * .28, .12, .3], [.07, .07, .07]);
  const tail = k.mesh(body, 'cone', skin, [0, -.1, -2.0], [.2, .6, .2], [-Math.PI / 2, 0, 0]);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const l = k.group(root, [sx * 1.35, .8, sz * .95]);
    k.mesh(l, 'box', skin, [0, -.3, 0], [.55, .6, .6]);
    k.mesh(l, 'box', dark, [0, -.65, .1], [.6, .15, .75]);
    return l;
  });
  return p => {
    const a = pulse(p, 'attack'), c = pulse(p, 'cast');
    const sp = p.mode === 'run' ? 5 : 1.5;
    legs.forEach((l, i) => { const ph = (i === 0 || i === 3) ? 0 : Math.PI; l.rotation.x = p.mode === 'run' ? sin(p.time * sp + ph) * .5 : 0; });
    body.position.y = 1.3 + c * .35 - a * .1; body.rotation.z = p.mode === 'run' ? sin(p.time * sp) * .04 : 0;
    body.rotation.x = -a * .15;
    head.position.z = 1.95 + a * .9 - (p.mode === 'idle' ? sin(p.time * 1.2) * .08 : 0);
    head.rotation.x = a * .3; tail.rotation.z = sin(p.time * 2) * .2;
  };
}

/* Frost elemental: floating crystalline body with orbiting shards. */
function frost(k: Kit, root: THREE.Group): Rig {
  const ice = '#dffbff', cyan = '#7fcff0', deep = '#4fb0de';
  const core = k.group(root, [0, 2.6, 0]);
  const shape = k.mesh(core, 'cone', ice, [0, .9, 0], [.9, 1.8, .9], [0, 0, 0], true);
  const low = k.mesh(core, 'cone', cyan, [0, -.9, 0], [.9, 1.8, .9], [Math.PI, 0, 0], true);
  const heart = k.mesh(core, 'sphere', '#ffffff', [0, 0, 0], [.45, .45, .45], [0, 0, 0], true);
  for (const s of [-1, 1]) k.mesh(core, 'sphere', deep, [s * .3, .4, .62], [.12, .12, .1], [0, 0, 0], true);
  const arms = [-1, 1].map(s => {
    const a = k.group(core, [s * 1.0, .1, .1]);
    k.mesh(a, 'cone', cyan, [s * .5, 0, 0], [.22, 1.0, .22], [0, 0, -s * Math.PI / 2], true);
    return a;
  });
  const orbit = k.group(core, [0, 0, 0]);
  const shards = [0, 1, 2, 3, 4].map(i => {
    const s = k.group(orbit, [0, 0, 0]);
    k.mesh(s, 'cone', i % 2 ? ice : deep, [1.7, 0, 0], [.2, .6, .2], [0, 0, 0], true);
    s.rotation.y = i * TAU / 5; return s;
  });
  const ring = k.mesh(core, 'ring', '#bfeeff', [0, -.2, 0], [1.9, 1.9, 1.9], [Math.PI / 2, 0, 0], true);
  return p => {
    const a = pulse(p, 'attack'), c = pulse(p, 'cast');
    core.position.y = 2.6 + sin(p.time * 2.4) * .3 + c * .5;
    core.rotation.set(p.mode === 'run' ? .25 : a * .4, 0, p.mode === 'run' ? sin(p.time * 5) * .08 : 0);
    shape.rotation.y = p.time * .8; low.rotation.y = -p.time * .8;
    const hs = .45 + c * .5 + a * .25 + sin(p.time * 6) * .05; heart.scale.setScalar(hs);
    orbit.rotation.y = p.time * (2 + c * 6 + a * 4); orbit.rotation.z = .3 * sin(p.time);
    arms.forEach((m, i) => { const s = i ? 1 : -1; m.rotation.z = s * (-.3 - c * .9 - a * .5); m.rotation.x = -a * .6; });
    ring.rotation.z = p.time * 1.5; ring.scale.setScalar(1.9 + c * .9);
    shards.forEach((s, i) => s.scale.setScalar(1 + .15 * sin(p.time * 4 + i)));
  };
}

/* Demon Hound: fiery dark quadruped with ember eyes/maw/mane. */
function hound(k: Kit, root: THREE.Group): Rig {
  const fur = '#2a1716', dark = '#150c0d', ember = '#ff6a2a', hot = '#ffb347', horn = '#d9c7a0';
  const body = k.group(root, [0, 2.1, 0]);
  k.mesh(body, 'sphere', fur, [0, 0, 0], [.95, .85, 1.7]);
  k.mesh(body, 'sphere', dark, [0, .55, .2], [.7, .4, 1.2]);
  for (let i = 0; i < 4; i++) k.mesh(body, 'cone', ember, [0, .95 - i * .03, .9 - i * .6], [.2, .5, .2], [0, 0, 0], true);
  const head = k.group(body, [0, .6, 1.8]);
  k.mesh(head, 'sphere', fur, [0, 0, 0], [.7, .6, .75]);
  const jaw = k.group(head, [0, -.2, .3]);
  k.mesh(jaw, 'box', dark, [0, -.1, .45], [.5, .18, .8]);
  k.mesh(jaw, 'cone', hot, [.2, .1, .75], [.07, .25, .07], [Math.PI, 0, 0]);
  k.mesh(jaw, 'cone', hot, [-.2, .1, .75], [.07, .25, .07], [Math.PI, 0, 0]);
  k.mesh(head, 'box', fur, [0, .1, .75], [.5, .35, .6]);
  k.mesh(head, 'sphere', ember, [0, -.15, .5], [.3, .1, .4], [0, 0, 0], true);
  for (const s of [-1, 1]) {
    k.mesh(head, 'sphere', hot, [s * .32, .3, .45], [.12, .08, .1], [0, 0, 0], true);
    k.mesh(head, 'cone', horn, [s * .4, .65, -.1], [.14, .7, .14], [-.4, 0, -s * .4]);
  }
  const tail = k.group(body, [0, .3, -1.7]);
  k.mesh(tail, 'cone', fur, [0, .1, -.6], [.2, 1.3, .2], [-Math.PI / 2 - .4, 0, 0]);
  k.mesh(tail, 'sphere', ember, [0, .55, -1.2], [.22, .22, .22], [0, 0, 0], true);
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const l = k.group(body, [sx * .6, -.4, sz * 1.0]);
    k.mesh(l, 'box', fur, [0, -.6, 0], [.35, 1.2, .38]);
    k.mesh(l, 'box', ember, [0, -1.2, .12], [.4, .12, .55], [0, 0, 0], true);
    return l;
  });
  return p => {
    const a = pulse(p, 'attack'), c = pulse(p, 'cast');
    const sp = p.mode === 'run' ? 11 : 0;
    legs.forEach((l, i) => { const ph = i === 0 || i === 3 ? 0 : Math.PI; l.rotation.x = sin(p.time * sp + ph) * .8 + (i < 2 ? -a * .6 : 0); });
    body.position.y = 2.1 + (sp ? Math.abs(sin(p.time * sp)) * .2 : sin(p.time * 2) * .05) - a * .15 + c * .2;
    body.rotation.x = -a * .25 + c * .3;
    head.rotation.x = a * .3 - c * .4; jaw.rotation.x = (a * .8) + c * .4 + (sp ? 0 : sin(p.time * 3) * .05);
    tail.rotation.y = sin(p.time * (sp ? 10 : 3)) * .4;
  };
}

/* Demon Guard: compact armored demonic minion with horns, shield and blade. */
function guard(k: Kit, root: THREE.Group): Rig {
  const steel = '#4a3b45', dark = '#241a22', skin = '#8a2f2a', ember = '#ff7a3a', horn = '#d9c7a0', trim = '#a8793a';
  const body = k.group(root, [0, 0, 0]);
  const hips: THREE.Group[] = [], legs = [-1, 1].map(s => {
    const l = k.group(body, [s * .5, 1.5, 0]);
    k.mesh(l, 'box', dark, [0, -.7, 0], [.55, 1.2, .55]);
    k.mesh(l, 'box', steel, [0, -1.35, .12], [.65, .3, .85]);
    hips.push(l); return l;
  });
  const torso = k.group(body, [0, 1.6, 0]);
  k.mesh(torso, 'box', steel, [0, .8, 0], [1.6, 1.4, .95]);
  k.mesh(torso, 'box', trim, [0, .25, .5], [1.7, .2, .1]);
  k.mesh(torso, 'sphere', ember, [0, 1.0, .5], [.2, .2, .1], [0, 0, 0], true);
  for (const s of [-1, 1]) k.mesh(torso, 'cone', steel, [s * 1.0, 1.65, 0], [.45, .5, .45], [0, 0, -s * .5]);
  const head = k.group(torso, [0, 1.95, .05]);
  k.mesh(head, 'sphere', skin, [0, 0, 0], [.55, .5, .5]);
  k.mesh(head, 'box', steel, [0, .15, .05], [.95, .35, .9]);
  for (const s of [-1, 1]) {
    k.mesh(head, 'sphere', ember, [s * .22, 0, .48], [.1, .06, .05], [0, 0, 0], true);
    k.mesh(head, 'cone', horn, [s * .45, .5, -.05], [.14, .75, .14], [0, 0, -s * .5]);
  }
  const armL = k.group(torso, [-1.05, 1.35, 0]);
  k.mesh(armL, 'box', skin, [0, -.55, 0], [.4, 1.0, .4]);
  k.mesh(armL, 'box', steel, [-.15, -.7, .35], [.2, 1.3, 1.0]);
  k.mesh(armL, 'sphere', ember, [-.27, -.7, .4], [.05, .25, .25], [0, 0, 0], true);
  const armR = k.group(torso, [1.05, 1.35, 0]);
  k.mesh(armR, 'box', skin, [0, -.55, 0], [.4, 1.0, .4]);
  const blade = k.group(armR, [0, -1.1, .1]);
  k.mesh(blade, 'box', trim, [0, 0, 0], [.15, .15, .6]);
  k.mesh(blade, 'box', '#cfc6c0', [0, 0, 1.1], [.12, .32, 1.6]);
  k.mesh(blade, 'cone', ember, [0, 0, 2.0], [.16, .5, .1], [Math.PI / 2, 0, 0], true);
  return p => {
    const a = pulse(p, 'attack'), c = pulse(p, 'cast');
    const sp = p.mode === 'run' ? 9 : 0, w = sin(p.time * sp);
    legs[0].rotation.x = w * .7; legs[1].rotation.x = -w * .7;
    body.position.y = sp ? Math.abs(w) * .15 : sin(p.time * 2) * .04;
    torso.rotation.x = a * .3 - c * .1; torso.rotation.y = -a * .5 * 0 + (sp ? w * .08 : 0);
    head.rotation.x = -c * .3;
    armR.rotation.x = -a * 2.2 + (sp ? -w * .6 : 0) - c * 2.4 + .3;
    armL.rotation.x = (sp ? w * .6 : 0) - c * 2.0;
    armL.rotation.z = c * .5;
    blade.rotation.x = Math.PI / 2 * .0 - .4 + a * .4;
  };
}

const BUILD: Record<PetModelId, (k: Kit, r: THREE.Group) => Rig> = {
  'pet-archer': hawk, 'pet-archer-snake': snake, 'pet-archer-turtle': turtle,
  'pet-frostmage': frost, 'add-hound': hound, 'add-guard': guard,
};

export function createPetModel(id: PetModelId): CharacterModel {
  const k = createModelKit();
  const root = new THREE.Group();
  root.name = id;
  const rig = BUILD[id](k, root);
  return k.finish(root, p => rig(p));
}
