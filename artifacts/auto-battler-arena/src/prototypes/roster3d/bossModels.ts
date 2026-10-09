import * as THREE from 'three';
import { createModelKit, type CharacterModel, type CharacterPose, type XYZ } from './modelKit';

export type BossId = 'boss-frost' | 'boss-demon' | 'boss-temple';
type Kit = ReturnType<typeof createModelKit>;

interface Rig {
  body: THREE.Group; torso: THREE.Group; head: THREE.Group; jaw: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; hips: THREE.Group[]; knees: THREE.Group[];
  fx: THREE.Object3D[]; pulse: THREE.Object3D[]; extra: THREE.Group; weapon?: THREE.Group;
}
interface Pal { fur: string; furD: string; skin: string; skinD: string; claw: string; leg: string; boot: string }

/** Zig-zag row of teeth/spikes as ONE extruded mesh (keeps draw calls low). Teeth point +Y, centred on x. */
function fringe(k: Kit, n: number, w: number, h: number, depth = 0.1, jag = 0.35): THREE.BufferGeometry {
  const pts: [number, number][] = [[-w / 2, 0]];
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + (w * i) / n, x1 = -w / 2 + (w * (i + 1)) / n;
    const hh = h * (1 - jag * Math.abs(i - (n - 1) / 2) / Math.max(1, n / 2));
    pts.push([x0 + (x1 - x0) * 0.1, 0.05], [(x0 + x1) / 2, hh], [x1 - (x1 - x0) * 0.1, 0.05]);
  }
  pts.push([w / 2, 0], [w / 2, -0.12], [-w / 2, -0.12]);
  return k.plate(pts, depth);
}

/** Chunky brute frame shared by all three bosses (silhouettes differ via palette and add-ons). */
function frame(k: Kit, root: THREE.Group, p: Pal, o: { torsoW: number; legW: number; armW: number; fist: number; comb?: boolean }): Rig {
  const body = k.group(root);
  const hips: THREE.Group[] = []; const knees: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const hip = k.group(body, [s * 0.95, 2.3, 0]); const knee = k.group(hip, [0, -1.15, 0]);
    k.mesh(hip, 'cylinder', p.leg, [0, -0.55, 0], [o.legW, 1.3, o.legW]);
    k.mesh(knee, 'cylinder', p.leg, [0, -0.5, 0], [o.legW * 0.92, 1.1, o.legW * 0.92]);
    k.mesh(knee, 'box', p.boot, [0, -1.0, 0.3], [1.3, 0.45, 1.8]);
    if (o.comb) k.mesh(knee, fringe(k, 3, 1.3, 0.55, 0.16, 0), p.claw, [0, -1.0, 1.1], [1, 1, 1], [Math.PI / 2, 0, 0]);
    else for (let i = -1; i <= 1; i++) k.mesh(knee, 'cone', p.claw, [i * 0.38, -1.0, 1.28], [0.16, 0.5, 0.16], [Math.PI / 2, 0, 0]);
    hips.push(hip); knees.push(knee);
  }
  const torso = k.group(body, [0, 2.3, 0]);
  k.mesh(torso, k.taper(o.torsoW, o.torsoW * 0.7, 2.7, 8), p.fur, [0, 1.35, 0], [1, 1, 0.8]);
  k.mesh(torso, 'box', p.furD, [0, 0.1, 0], [o.torsoW * 1.5, 0.4, 1.7]);
  const head = k.group(torso, [0, 3.0, 0.15]);
  const jaw = k.group(head, [0, -0.45, 0.5]);
  const mkArm = (s: number) => {
    const a = k.group(torso, [s * (o.torsoW + 0.55), 2.25, 0]);
    k.mesh(a, 'sphere', p.fur, [0, 0, 0], [0.8, 0.7, 0.75]);
    k.mesh(a, 'cylinder', p.fur, [0, -1.0, 0], [o.armW, 2.0, o.armW]);
    k.mesh(a, 'sphere', p.skin, [0, -2.2, 0.05], [o.fist, o.fist * 0.9, o.fist]);
    if (o.comb) k.mesh(a, fringe(k, 3, 0.95, 0.6, 0.2, 0), p.claw, [0, -2.55, 0.25], [1, 1, 1], [Math.PI, 0, 0]);
    else for (let i = -1; i <= 1; i++) k.mesh(a, 'cone', p.claw, [i * 0.3, -2.95, 0.3], [0.13, 0.55, 0.13], [Math.PI, 0, 0]);
    return a;
  };
  return { body, torso, head, jaw, armL: mkArm(1), armR: mkArm(-1), hips, knees, fx: [], pulse: [], extra: k.group(torso) };
}

function eyes(k: Kit, head: THREE.Group, col: string, y = 0.12) {
  for (const s of [-1, 1]) {
    k.mesh(head, 'box', col, [s * 0.38, y, 0.92], [0.34, 0.14, 0.12], [0, 0, -s * 0.28], true);
    k.mesh(head, 'box', '#1a0a10', [s * 0.38, y + 0.17, 0.95], [0.5, 0.1, 0.1], [0, 0, -s * 0.4]);
  }
}

// Frostbound Colossus: pale fur, blue skin face, ice crystal clusters on shoulders and back
function buildFrost(k: Kit, root: THREE.Group): Rig {
  const p: Pal = { fur: '#dcecf7', furD: '#9dbdd3', skin: '#7fa9c6', skinD: '#6c97b5', claw: '#243447', leg: '#cfe4f2', boot: '#8fb0c8' };
  const r = frame(k, root, p, { torsoW: 1.65, legW: 0.62, armW: 0.62, fist: 0.85, comb: true });
  const ice = '#8cdcff';
  for (const kn of r.knees) k.mesh(kn, 'cone', '#bfefff', [0, 0.1, 0.6], [0.2, 0.7, 0.2], [Math.PI / 2, 0, 0], true);
  k.mesh(r.torso, 'sphere', '#f6fcff', [0, 1.7, 0.55], [1.3, 0.8, 0.7]);
  // shaggy back mane and fur skirt as single jagged plates; glacial armour over the chest
  k.mesh(r.torso, fringe(k, 7, 3.6, 1.5, 0.35), '#cfe4f2', [0, 1.6, -0.85], [1, 1, 1], [-0.45, 0, 0]);
  k.mesh(r.torso, fringe(k, 5, 3.0, 0.75, 0.3, 0.2), '#e4f1fa', [0, 0.25, 0.55], [1, -1, 1]);
  k.mesh(r.torso, fringe(k, 5, 2.5, 0.8, 0.25), '#5fb8e8', [0, 0.95, 0.9], [1, 1, 1], [0.1, 0, 0], true);
  k.mesh(r.torso, 'sphere', '#bfefff', [0, 1.45, 1.0], [0.34, 0.5, 0.18], [0, 0, 0], true);
  k.mesh(r.torso, fringe(k, 4, 2.2, 0.9, 0.2), '#9fd6f0', [0, 3.3, 0.1], [1, 1, 1], [-0.1, 0, 0]);
  for (const s of [-1, 1]) {
    k.mesh(r.torso, 'cone', '#8cdcff', [s * 1.1, -0.6, 0.2], [0.18, 0.7, 0.18], [Math.PI, 0, s * 0.2], true);
    k.mesh(r.torso, 'cone', '#bfefff', [s * 2.2, 3.1, 0.2], [0.24, 1.0, 0.24], [0, 0, -s * 0.5], true);
  }
  const c1 = k.mesh(r.torso, 'cone', ice, [-0.4, 3.0, -0.95], [0.4, 2.1, 0.4], [-0.35, 0, 0.12], true);
  const c2 = k.mesh(r.torso, 'cone', ice, [0.5, 2.8, -0.95], [0.34, 1.7, 0.34], [-0.3, 0, -0.2], true);
  r.fx.push(c1, c2);
  for (const [s, arm] of [[1, r.armL], [-1, r.armR]] as [number, THREE.Group][]) {
    r.fx.push(k.mesh(arm, 'cone', ice, [s * 0.5, 0.95, 0], [0.3, 1.5, 0.3], [0, 0, -s * 0.3], true));
    k.mesh(arm, 'cone', ice, [s * 0.95, 0.5, 0.1], [0.26, 1.0, 0.26], [0, 0, -s * 1.0], true);
  }
  const h = r.head;
  k.mesh(h, 'sphere', '#f2f9ff', [0, 0.05, -0.05], [1.15, 1.0, 1.0]);
  k.mesh(h, 'sphere', p.skin, [0, -0.05, 0.62], [0.82, 0.68, 0.5]);
  eyes(k, h, '#d8fbff');
  k.mesh(h, 'sphere', '#243d52', [0, -0.2, 1.05], [0.26, 0.18, 0.16]);
  k.mesh(h, fringe(k, 5, 1.7, 0.7, 0.18), '#e8f6ff', [0, 0.78, 0.35], [1, 1, 1], [-0.2, 0, 0]);
  for (const s of [-1, 1]) {
    k.mesh(h, 'cone', '#f2f9ff', [s * 0.8, 0.85, 0.3], [0.22, 0.8, 0.22], [0, 0, -s * 0.35]);
    const horn = k.mesh(h, 'cone', ice, [s * 0.75, 1.25, -0.05], [0.28, 1.5, 0.28], [0, 0, -s * 0.5], true);
    r.fx.push(horn);
  }
  k.mesh(r.jaw, 'box', '#3a0f1e', [0, 0, 0.1], [1.0, 0.3, 0.7]);
  k.mesh(r.jaw, 'box', '#c94a62', [0, 0.18, 0.2], [0.6, 0.08, 0.4]);
  k.mesh(r.jaw, 'cone', '#fff6df', [0, 0.35, 0.4], [0.3, 0.5, 0.12], [Math.PI, 0, 0]);
  return r;
}

// Ashen Demon: red horned flame brute, bone horns/claws, bat wings, spade tail, glowing chest core
function buildDemon(k: Kit, root: THREE.Group): Rig {
  const p: Pal = { fur: '#8a1c26', furD: '#4a0c14', skin: '#a02430', skinD: '#6a1620', claw: '#f2e6d2', leg: '#6a1620', boot: '#4a0c14' };
  const r = frame(k, root, p, { torsoW: 1.35, legW: 0.55, armW: 0.55, fist: 0.75, comb: true });
  const bone = '#f2e6d2';
  const core = k.mesh(r.torso, 'sphere', '#ffc850', [0, 1.5, 0.75], [0.5, 0.5, 0.25], [0, 0, 0], true);
  r.pulse.push(core);
  k.mesh(r.torso, 'box', '#d4552a', [0, 1.3, 0.8], [0.08, 2.0, 0.05], [0, 0, 0], true);
  for (const s of [-1, 1]) {
    k.mesh(r.torso, 'sphere', '#b02a30', [s * 0.75, 2.3, 0.45], [0.7, 0.5, 0.45]);
    const wing = k.group(r.torso, [s * 0.7, 2.4, -0.7]);
    k.mesh(wing, 'cylinder', '#7a1a22', [s * 1.2, 0.9, 0], [0.12, 2.8, 0.12], [0, 0, -s * 1.0]);
    k.mesh(wing, k.plate([[0, 0], [s * 1.6, 2.0], [s * 2.2, 1.1], [s * 2.5, 0.2], [s * 1.9, -0.3], [s * 1.4, -1.2], [s * 0.6, -0.5]], 0.06), '#4a0f1a', [0, 0, 0]);
    r.fx.push(wing);
    for (let i = 0; i < 2; i++) {
      const fl = k.mesh(r.torso, 'cone', i % 2 ? '#ff9628' : '#ff501e', [s * (0.9 + i * 0.35), 3.0 + i * 0.05, 0.2], [0.26, 0.9 + i * 0.1, 0.26], [0, 0, -s * i * 0.15], true);
      r.pulse.push(fl);
    }
  }
  // obsidian chest plate with ember ribs, spined ridge, shoulder spikes and heated horn tips
  k.mesh(r.torso, fringe(k, 3, 1.5, 0.5, 0.14, 0), '#2a0a10', [0, 0.45, 0.85], [1, 1, 1], [0.1, 0, 0]);
  k.mesh(r.torso, fringe(k, 6, 2.3, 1.1, 0.25), '#3a0a10', [0, 1.4, -0.7], [1, 1, 1], [-0.5, 0, 0]);
  for (const s of [-1, 1]) {
    k.mesh(r.torso, 'cone', '#f2e6d2', [s * 1.45, 2.95, 0.3], [0.2, 0.9, 0.2], [0, 0, -s * 0.55]);
    k.mesh(r.knees[s > 0 ? 0 : 1], 'cone', '#f2e6d2', [0, 0, 0.55], [0.16, 0.6, 0.16], [Math.PI / 2, 0, 0]);
  }
  // tail with spade
  const tail = k.group(r.body, [0, 2.0, -0.9]); r.fx.push(tail);
  k.mesh(tail, 'cylinder', '#8a1c26', [0, -0.2, -0.9], [0.16, 2.0, 0.16], [Math.PI / 2 + 0.3, 0, 0]);
  k.mesh(tail, 'cone', '#ff6a2a', [0, -0.6, -1.95], [0.5, 0.9, 0.12], [-Math.PI / 2 + 0.3, 0, 0], true);
  const h = r.head;
  k.mesh(h, 'sphere', '#b83036', [0, 0.05, 0], [1.0, 0.9, 0.95]);
  k.mesh(h, 'box', '#8a1c26', [0, -0.3, 0.8], [1.1, 0.7, 0.5]);
  k.mesh(h, 'box', '#3a0a10', [0, 0.35, 0.95], [1.5, 0.16, 0.2]);
  eyes(k, h, '#ffe14a');
  for (const s of [-1, 1]) {
    // sweeping bone horns: base, mid, tip
    k.mesh(h, 'cone', bone, [s * 0.65, 0.95, -0.1], [0.34, 1.2, 0.34], [0, 0, -s * 0.5]);
    k.mesh(h, 'cone', '#d8c8a6', [s * 1.25, 1.75, -0.1], [0.22, 1.2, 0.22], [0, 0, -s * 0.15]);
    k.mesh(h, 'cone', '#a8946e', [s * 1.35, 2.45, -0.2], [0.13, 0.7, 0.13], [-0.2, 0, s * 0.35]);
    k.mesh(h, 'cone', '#ff8a2a', [s * 1.39, 2.58, -0.21], [0.08, 0.3, 0.08], [-0.2, 0, s * 0.35], true);
  }
  k.mesh(r.jaw, 'box', '#2a0508', [0, 0, 0.1], [0.9, 0.28, 0.6]);
  k.mesh(r.jaw, 'cone', '#fff2d6', [0, 0.3, 0.35], [0.3, 0.4, 0.1], [Math.PI, 0, 0]);
  return r;
}

// Temple Guardian: golden armoured sentinel, dark visor with glowing slit, crest, sun-staff and glyph
function buildTemple(k: Kit, root: THREE.Group): Rig {
  const p: Pal = { fur: '#c4962e', furD: '#454d5a', skin: '#e6bd52', skinD: '#5f6978', claw: '#dce4ed', leg: '#454d5a', boot: '#d1a13e' };
  const r = frame(k, root, p, { torsoW: 1.4, legW: 0.6, armW: 0.6, fist: 0.7 });
  const gold = '#d1a13e', hi = '#f0d070', dk = '#2a1d1c';
  k.mesh(r.torso, 'box', hi, [0, 1.8, 0.7], [1.9, 0.9, 0.35]);
  k.mesh(r.torso, 'box', '#9d302e', [0, 0.1, 0.85], [0.9, 1.5, 0.12], [0, 0, 0]);
  const gem = k.mesh(r.torso, 'sphere', '#7eeaff', [0, 1.2, 0.95], [0.26, 0.26, 0.16], [0, 0, 0], true);
  r.pulse.push(gem);
  k.mesh(r.torso, 'box', '#33241c', [0, 0.45, 0], [2.9, 0.35, 1.6]);
  for (const s of [-1, 1]) {
    k.mesh(r.torso, 'sphere', gold, [s * 2.0, 2.55, 0], [1.1, 0.75, 1.0], [0, 0, -s * 0.15]);
    k.mesh(r.torso, 'cylinder', hi, [s * 2.0, 2.2, 0], [1.1, 0.12, 1.0]);
    k.mesh(r.torso, 'cone', '#bfc8d2', [s * 2.9, 2.9, 0], [0.26, 1.0, 0.26], [0, 0, -s * 1.2]);
  }
  k.mesh(r.torso, 'box', '#9d302e', [0, -0.6, -0.9], [1.8, 2.2, 0.08]);
  // helmet
  const h = r.head;
  k.mesh(h, 'sphere', dk, [0, 0, 0], [1.0, 1.05, 1.0]);
  k.mesh(h, 'sphere', gold, [0, 0.12, -0.08], [1.12, 1.05, 1.05]);
  k.mesh(h, 'box', dk, [0, -0.15, 0.85], [1.15, 0.85, 0.25]);
  k.mesh(h, 'box', '#7eeaff', [0, -0.05, 1.0], [0.9, 0.1, 0.06], [0, 0, 0], true);
  k.mesh(h, 'box', hi, [0, 0.62, 0.75], [0.25, 0.6, 0.15], [0.2, 0, 0]);
  k.mesh(h, 'box', hi, [0, 0.55, 0.9], [1.3, 0.16, 0.12]);
  for (const s of [-1, 1]) {
    k.mesh(h, 'box', gold, [s * 1.1, -0.2, 0], [0.2, 1.1, 0.8]);
    k.mesh(h, 'cone', hi, [s * 0.9, 1.1, -0.1], [0.2, 0.9, 0.2], [0, 0, -s * 0.5]);
  }
  const plume = k.mesh(h, 'cone', '#b3302e', [0, 1.2, -0.5], [0.4, 1.6, 0.6], [-0.5, 0, 0]);
  r.fx.push(plume);
  // sun staff in right hand
  const w = k.group(r.armR, [0, -2.3, 0.2]); r.weapon = w;
  k.mesh(w, 'cylinder', '#744628', [0, 0.5, 0], [0.16, 4.4, 0.16]);
  k.mesh(w, 'cylinder', gold, [0, -1.5, 0], [0.22, 0.4, 0.22]);
  const top = k.group(w, [0, 2.9, 0]);
  const sun = k.mesh(top, 'ring', hi, [0, 0, 0], [0.7, 0.7, 2.4], [0, 0, 0], true);
  k.mesh(top, 'box', hi, [0, 0, 0], [0.12, 1.6, 0.12], [0, 0, 0], true);
  k.mesh(top, 'box', hi, [0, 0, 0], [1.6, 0.12, 0.12], [0, 0, 0], true);
  const core = k.mesh(top, 'sphere', '#fff3b0', [0, 0, 0], [0.3, 0.3, 0.3], [0, 0, 0], true);
  r.pulse.push(core); r.fx.push(sun);
  // floating glyph ring around the feet (cast tell)
  const glyph = k.mesh(r.body, 'ring', '#ffd86a', [0, 0.12, 0], [2.8, 2.8, 1], [Math.PI / 2, 0, 0], true);
  glyph.visible = false; r.extra.userData.glyph = glyph;
  return r;
}

const BUILD: Record<BossId, (k: Kit, root: THREE.Group) => Rig> = {
  'boss-frost': buildFrost, 'boss-demon': buildDemon, 'boss-temple': buildTemple,
};

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export function createBossModel(id: BossId): CharacterModel {
  const k = createModelKit();
  const root = new THREE.Group(); root.name = id;
  const r = BUILD[id](k, root);
  root.scale.setScalar(0.89);
  const temple = id === 'boss-temple', demon = id === 'boss-demon';
  const glyph = r.extra.userData.glyph as THREE.Object3D | undefined;
  const baseY = new Map<THREE.Object3D, number>();
  r.pulse.forEach((o) => baseY.set(o, o.scale.y));
  const baseScale = new Map<THREE.Object3D, XYZ>();
  r.pulse.forEach((o) => baseScale.set(o, [o.scale.x, o.scale.y, o.scale.z]));

  return k.finish(root, (pose: CharacterPose) => {
    const t = Number.isFinite(pose.time) ? pose.time : 0; const g = clamp01(pose.progress);
    const mode = pose.mode; const run = mode === 'run'; const sw = run ? Math.sin(t * 6) : 0;
    const breath = Math.sin(t * 1.8);
    r.body.position.y = run ? Math.abs(sw) * 0.16 : 0;
    r.torso.scale.set(1, 1 + breath * 0.02, 1);
    r.torso.position.y = 2.3;
    r.torso.rotation.set(run ? 0.14 : 0.04, run ? sw * 0.1 : 0, 0);
    r.hips[0].rotation.x = sw * 0.6; r.hips[1].rotation.x = -sw * 0.6;
    r.knees[0].rotation.x = Math.max(0, -sw) * 0.7; r.knees[1].rotation.x = Math.max(0, sw) * 0.7;
    r.head.rotation.set(0, Math.sin(t * 0.7) * 0.08, 0);
    r.jaw.rotation.x = 0.1 + (breath + 1) * 0.04;
    let lx = run ? sw * 0.5 : breath * 0.04; let rx = run ? -sw * 0.5 : -breath * 0.04;
    let lz = -0.12, rz = 0.12; let wx = 0;
    if (mode === 'attack') {
      const up = ease(Math.min(1, g / 0.4)); const hit = ease(clamp01((g - 0.4) / 0.25));
      const rec = ease(clamp01((g - 0.7) / 0.3));
      const arc = (temple ? 2.0 : 2.5) * up - (temple ? 3.0 : 3.5) * hit + (temple ? 1.0 : 1.0) * rec * hit;
      const a = -arc * 0.0 - (up * (temple ? 2.0 : 2.5)) + hit * (temple ? 2.9 : 3.3) - rec * hit * (temple ? 0.9 : 1.0);
      rx = a; lx = temple ? -0.4 - up * 0.6 + hit * 0.9 : a;
      lz = -0.12 - up * 0.2; rz = 0.12 + up * 0.2;
      r.torso.rotation.x = 0.04 - up * 0.25 + hit * 0.5 - rec * hit * 0.4;
      r.head.rotation.x = -up * 0.2 + hit * 0.35 - rec * hit * 0.3;
      r.jaw.rotation.x = 0.1 + up * 0.5;
      r.body.position.y = up * 0.12 - hit * 0.1 + rec * hit * 0.1;
      if (temple) wx = -hit * 0.3;
    } else if (mode === 'cast') {
      const s = Math.sin(g * Math.PI);
      const lift = temple ? 1.5 : 1.9;
      lx = -0.5 - s * lift; rx = -0.5 - s * lift; lz = -0.15 - s * 0.35; rz = 0.15 + s * 0.35;
      r.torso.rotation.x = 0.04 - s * 0.15; r.head.rotation.x = -s * 0.3; r.jaw.rotation.x = 0.1 + s * 0.45;
      r.body.position.y = s * 0.2;
      if (temple) wx = -s * 0.15;
    }
    r.armL.rotation.set(lx, 0, lz); r.armR.rotation.set(rx, 0, rz);
    if (r.weapon) r.weapon.rotation.set(wx - rx * 0.5, 0, 0);
    const casting = mode === 'cast' ? Math.sin(g * Math.PI) : 0;
    const hot = mode === 'attack' ? Math.sin(g * Math.PI) * 0.5 : casting;
    r.fx.forEach((o, i) => {
      if (demon) { o.rotation.x = 0; o.rotation.z = 0; o.rotation.y = Math.sin(t * 2 + i) * 0.1 + (run ? Math.sin(t * 6) * 0.1 : 0) + hot * 0.2; }
      else if (temple) { o.rotation.z = i === 1 ? t * 0.6 : 0; o.rotation.x = i === 0 ? -0.5 - (run ? 0.3 : 0) - Math.sin(t * 2) * 0.05 : 0; }
      else { o.scale.setScalar(1 + casting * 0.2 + Math.sin(t * 2.5 + i) * 0.03); }
    });
    r.pulse.forEach((o, i) => {
      const b = baseScale.get(o)!; const f = 1 + Math.sin(t * 5 + i * 1.3) * 0.08 + hot * 0.5;
      o.scale.set(b[0] * f, b[1] * f, b[2] * f);
    });
    if (glyph) {
      glyph.visible = casting > 0.02;
      glyph.rotation.set(Math.PI / 2, 0, t * 2);
      glyph.scale.set(1.4 + casting * 0.6, 1.4 + casting * 0.6, 1);
    }
  });
}
