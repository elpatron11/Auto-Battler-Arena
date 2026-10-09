import * as THREE from 'three';
import { createModelKit, type CharacterModel, type CharacterPose, type XYZ } from './modelKit';

export type CasterClassId = 'priest' | 'frostmage' | 'warlock' | 'shaman';
type Kit = ReturnType<typeof createModelKit>;

interface Tag { m: THREE.Mesh; base: THREE.Material; alt: THREE.Material }
interface Rig {
  tags: Tag[];
  body: THREE.Group; torso: THREE.Group; head: THREE.Group; cape: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; weapon: THREE.Group; hips: [THREE.Group, THREE.Group];
  knees: [THREE.Group, THREE.Group]; fx: THREE.Object3D[]; fxB: THREE.Object3D[];
}
interface Palette {
  skin: string; robe: string; robeD: string; trim: string; trimHi: string; boot: string; belt: string;
  eye: string; hair: string; cape: string;
}
const PUPIL = '#1d2230';

interface Alt { robe?: string; robeD?: string; accent?: string; trim?: string; hair?: string; cape?: string; }

/** Tag a mesh so a variant can swap its material and swap back (materials are shared, never mutated). */
function tag(r: Rig, k: Kit, m: THREE.Mesh, alt: string | undefined, glow = false) {
  if (alt) r.tags.push({ m, base: m.material as THREE.Material, alt: k.material(alt, glow) });
  return m;
}

/** Shared chunky humanoid frame. Original V3 is a short tunic over dark legs with a dark back panel. */
function buildFrame(k: Kit, root: THREE.Group, p: Palette, alt: Alt, eyes: 'white' | 'violet' = 'white'): Rig {
  const body = k.group(root);
  const r = { body, tags: [], fx: [], fxB: [] } as unknown as Rig;
  const hips: THREE.Group[] = []; const knees: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const hip = k.group(body, [s * 0.5, 1.4, 0]); const knee = k.group(hip, [0, -0.8, 0]);
    k.mesh(hip, 'cylinder', p.robeD, [0, -0.4, 0], [0.36, 0.85, 0.36]);
    tag(r, k, k.mesh(knee, 'cylinder', p.robeD, [0, -0.3, 0], [0.34, 0.65, 0.34]), alt.robeD);
    k.mesh(knee, 'box', p.boot, [0, -0.58, 0.14], [0.8, 0.3, 1.0]);
    hips.push(hip); knees.push(knee);
  }
  const torso = k.group(body, [0, 1.4, 0]);
  tag(r, k, k.mesh(torso, k.taper(0.85, 0.7, 1.5, 8), p.robe, [0, 0.75, 0], [1, 1, 0.7]), alt.robe);
  k.mesh(torso, 'box', p.belt, [0, 0.1, 0], [1.6, 0.26, 1.0]);
  tag(r, k, k.mesh(torso, k.taper(0.75, 1.0, 1.0, 8), p.robe, [0, -0.4, 0], [1, 1, 0.75]), alt.robe);
  // V-neck trim stripes from the original chest accent
  for (const s of [-1, 1]) tag(r, k, k.mesh(torso, 'box', p.trimHi, [s * 0.32, 1.15, 0.58], [0.6, 0.09, 0.05], [0, 0, -s * 0.6]), alt.trim);
  k.mesh(torso, 'cylinder', p.skin, [0, 1.6, 0], [0.28, 0.5, 0.28]);
  const head = k.group(torso, [0, 2.35, 0]); r.head = head;
  k.mesh(head, 'sphere', p.skin, [0, 0, 0], [0.72, 0.78, 0.72]);
  for (const s of [-1, 1]) {
    if (eyes === 'violet') k.mesh(head, 'sphere', '#e25cff', [s * 0.26, 0, 0.64], [0.15, 0.1, 0.06], [0, 0, 0], true);
    else {
      k.mesh(head, 'sphere', '#eef7ff', [s * 0.26, 0, 0.62], [0.13, 0.09, 0.06]);
      k.mesh(head, 'sphere', PUPIL, [s * 0.26, 0, 0.67], [0.06, 0.06, 0.04]);
    }
    tag(r, k, k.mesh(head, 'box', p.hair, [s * 0.27, 0.17, 0.66], [0.36, 0.08, 0.07], [0, 0, s * 0.22]), alt.hair);
  }
  k.mesh(head, 'sphere', p.skin, [0, -0.1, 0.72], [0.1, 0.14, 0.1]);
  const cape = k.group(torso, [0, 1.35, -0.55]); r.cape = cape;
  tag(r, k, k.mesh(cape, k.plate([[-0.8, 0], [0.8, 0], [1.0, -2.3], [0.3, -2.0], [-0.3, -2.4], [-1.0, -2.1]], 0.06), p.cape, [0, 0, 0]), alt.cape);
  const mkArm = (s: number) => {
    const a = k.group(torso, [s * 1.0, 1.25, 0]);
    tag(r, k, k.mesh(a, 'sphere', p.trim, [0, 0, 0], [0.52, 0.4, 0.5]), alt.accent);
    tag(r, k, k.mesh(a, 'cylinder', p.robe, [0, -0.65, 0], [0.3, 1.2, 0.3]), alt.robe);
    k.mesh(a, 'sphere', p.skin, [0, -1.3, 0], [0.26, 0.24, 0.26]);
    return a;
  };
  r.torso = torso; r.armL = mkArm(1); r.armR = mkArm(-1);
  r.weapon = k.group(r.armR, [0, -1.3, 0.1]);
  r.hips = [hips[0], hips[1]]; r.knees = [knees[0], knees[1]];
  return r;
}

/** Shaft shared by all staff classes. Returns the shaft mesh. */
function shaft(k: Kit, w: THREE.Group, color: string, h = 4.2) {
  return k.mesh(w, 'cylinder', color, [0, 0.3, 0], [0.14, h, 0.14]);
}

// ---------- Priest: #f0e8d8 / #d6ad52 / #fff9dd, blonde hair, gold ring-and-cross staff ----------
function buildPriest(k: Kit, root: THREE.Group): Rig {
  const p: Palette = { skin: '#e2b08a', robe: '#f0e8d8', robeD: '#cfc3a4', trim: '#d6ad52', trimHi: '#fff9dd',
    boot: '#7a5a34', belt: '#d6ad52', eye: PUPIL, hair: '#f1dfbd', cape: '#cfc3a4' };
  const dk = '#17131d';
  const r = buildFrame(k, root, p, { robe: dk, robeD: '#0f0c14', accent: '#4a2f6b', trim: '#7a4fb0', hair: '#2a2236', cape: '#0f0c14' });
  // blonde hair cap with framing locks, gold circlet gem
  tag(r, k, k.mesh(r.head, 'sphere', p.hair, [0, 0.28, -0.1], [0.78, 0.62, 0.76]), '#2a2236');
  for (const s of [-1, 1]) tag(r, k, k.mesh(r.head, 'cylinder', '#d7b87d', [s * 0.7, -0.4, 0.0], [0.12, 1.1, 0.2]), '#2a2236');
  k.mesh(r.head, 'sphere', '#ffd86a', [0, 0.55, 0.7], [0.12, 0.12, 0.08], [0, 0, 0], true);
  const halo = k.group(r.head, [0, 0.95, 0]);
  tag(r, k, k.mesh(halo, 'ring', '#ffe9ae', [0, 0, 0], [1.1, 1.1, 3], [Math.PI / 2, 0, 0], true), '#a56bff', true);
  r.fx.push(halo);
  // staff: gold shaft, ring with cross, bright core
  const w = r.weapon;
  tag(r, k, shaft(k, w, '#c79b3e'), '#2b2236');
  const head = k.group(w, [0, 2.7, 0]);
  tag(r, k, k.mesh(head, 'ring', '#fff0a2', [0, 0, 0], [0.7, 0.7, 2.2], [0, 0, 0], true), '#b98bff', true);
  tag(r, k, k.mesh(head, 'box', '#fff0a2', [0, 0, 0], [0.1, 1.5, 0.1], [0, 0, 0], true), '#b98bff', true);
  tag(r, k, k.mesh(head, 'box', '#fff0a2', [0, 0, 0], [1.5, 0.1, 0.1], [0, 0, 0], true), '#b98bff', true);
  const core = tag(r, k, k.mesh(head, 'sphere', '#fff9d7', [0, 0, 0], [0.25, 0.25, 0.25], [0, 0, 0], true), '#e6d4ff', true);
  r.fxB.push(core);
  // open tome on belt
  k.mesh(r.torso, 'box', '#fff9dd', [-0.9, -0.1, 0.25], [0.5, 0.6, 0.18], [0, 0.3, 0.2]);
  return r;
}

// ---------- Cryomancer: #295a9b / #68b9ed / #dff7ff, navy wizard hat, white beard, crystal staff ----------
function buildFrost(k: Kit, root: THREE.Group): Rig {
  const p: Palette = { skin: '#e3b99c', robe: '#295a9b', robeD: '#1f4577', trim: '#68b9ed', trimHi: '#dff7ff',
    boot: '#24262d', belt: '#d9b84c', eye: PUPIL, hair: '#5d4a42', cape: '#1f4577' };
  const r = buildFrame(k, root, p, { robe: '#9b3a22', robeD: '#6e2a18', accent: '#ff9a4a', trim: '#ffe0a8', cape: '#6e2a18' });
  // white cap hair (original: #e9f4ff, fire variant #a92f1f)
  tag(r, k, k.mesh(r.head, 'sphere', '#e9f4ff', [0, 0.3, -0.1], [0.78, 0.6, 0.76]), '#a92f1f');
  // wizard hat: wide navy brim, bent pointed cone, gold band and cyan gem
  k.mesh(r.head, 'cylinder', '#243d82', [0, 0.55, 0], [1.3, 0.1, 1.3]);
  const tip = k.mesh(r.head, 'cone', '#304d9a', [0, 1.5, 0], [0.85, 1.9, 0.85], [-0.1, 0, 0.12]);
  tag(r, k, tip, '#8a2f1c');
  k.mesh(r.head, 'cylinder', '#d9b84c', [0, 0.68, 0], [0.88, 0.14, 0.88]);
  tag(r, k, k.mesh(r.head, 'sphere', '#bff3ff', [0.3, 0.68, 0.84], [0.13, 0.13, 0.1], [0, 0, 0], true), '#ffd06a', true);
  r.fx.push(tip);
  // beard (original white #eef8ff, fire #ffb05a) and moustache
  tag(r, k, k.mesh(r.head, 'cone', '#eef8ff', [0, -0.95, 0.5], [0.6, 1.4, 0.35], [Math.PI, 0, 0]), '#ffb05a');
  tag(r, k, k.mesh(r.head, 'sphere', '#eef8ff', [0, -0.3, 0.7], [0.4, 0.1, 0.1]), '#ffb05a');
  // staff: brown shaft with diamond ice crystal
  const w = r.weapon;
  shaft(k, w, '#624a31');
  const gem = tag(r, k, k.mesh(w, 'cone', '#8de8ff', [0, 2.9, 0], [0.5, 1.3, 0.5], [0, 0, 0], true), '#ff8a3a', true);
  tag(r, k, k.mesh(w, 'cone', '#8de8ff', [0, 1.9, 0], [0.5, 0.9, 0.5], [Math.PI, 0, 0], true), '#ff8a3a', true);
  tag(r, k, k.mesh(w, 'cone', '#efffff', [0, 2.6, 0.2], [0.2, 0.7, 0.15], [0, 0, 0], true), '#fff0c0', true);
  r.fxB.push(gem);
  return r;
}

// ---------- Warlock: #24152f / #5b2378 / #120b18, hood, swept horns, violet eyes, orb staff ----------
function buildWarlock(k: Kit, root: THREE.Group): Rig {
  const p: Palette = { skin: '#9b7f93', robe: '#24152f', robeD: '#120b18', trim: '#5b2378', trimHi: '#a14ac2',
    boot: '#24262d', belt: '#120b18', eye: '#e25cff', hair: '#18101f', cape: '#241933' };
  const r = buildFrame(k, root, p, {}, 'violet');
  // hood cap over the crown (original: main-colour cap, face open)
  k.mesh(r.head, 'sphere', '#24152f', [0, 0.3, -0.1], [0.8, 0.62, 0.78]);
  k.mesh(r.head, 'sphere', '#24152f', [0, 0.2, -0.45], [0.7, 0.8, 0.4]);
  // swept dark horns with violet rims
  for (const s of [-1, 1]) {
    k.mesh(r.head, 'cone', '#18101f', [s * 0.6, 0.95, -0.05], [0.2, 1.1, 0.2], [0, 0, -s * 0.55]);
    k.mesh(r.head, 'cone', '#7f42a4', [s * 1.05, 1.45, -0.05], [0.12, 0.6, 0.12], [0, 0, s * 0.1]);
    k.mesh(r.head, 'box', '#a14ac2', [s * 0.35, -0.4, 0.6], [0.5, 0.06, 0.05], [0, 0, -s * 0.5]);
    k.mesh(r.torso, 'cone', '#5b2378', [s * 1.7, 1.7, 0], [0.18, 0.7, 0.18], [0, 0, -s * 1.1]);
  }
  k.mesh(r.torso, 'box', '#a14ac2', [0, 0.85, 0.58], [0.1, 0.8, 0.04], [0, 0, 0], true);
  // staff: dark brown shaft, floating violet orb in a claw
  const w = r.weapon;
  shaft(k, w, '#443022');
  for (let i = 0; i < 3; i++) k.mesh(w, 'cone', '#18101f', [Math.cos(i * 2.1) * 0.28, 2.35, Math.sin(i * 2.1) * 0.28], [0.1, 0.7, 0.1], [Math.sin(i * 2.1) * 0.5, 0, -Math.cos(i * 2.1) * 0.5]);
  const orb = k.mesh(w, 'sphere', '#b14cff', [0, 2.95, 0], [0.5, 0.5, 0.5], [0, 0, 0], true);
  r.fxB.push(orb); r.fx.push(orb);
  return r;
}

// ---------- Shaman: #355f73 / #5ea8c5 / #4b3729, dark hair, beard, cyan war paint, rune hammer ----------
function buildShaman(k: Kit, root: THREE.Group): Rig {
  const p: Palette = { skin: '#b97a55', robe: '#355f73', robeD: '#4b3729', trim: '#5ea8c5', trimHi: '#4dd0e1',
    boot: '#24262d', belt: '#4b3729', eye: PUPIL, hair: '#342017', cape: '#4b3729' };
  const r = buildFrame(k, root, p, {});
  k.mesh(r.head, 'sphere', '#4b2d1d', [0, 0.3, -0.1], [0.78, 0.62, 0.76]);
  k.mesh(r.head, 'cone', '#3b2419', [0, -0.85, 0.5], [0.6, 1.2, 0.35], [Math.PI, 0, 0]);
  for (const s of [-1, 1]) {
    k.mesh(r.head, 'box', '#4dd0e1', [s * 0.42, -0.2, 0.65], [0.5, 0.07, 0.05], [0, 0, -s * 0.5], true);
    k.mesh(r.torso, 'sphere', '#8a6a48', [s * 1.3, 1.45, 0], [0.7, 0.3, 0.65]);
  }
  // feather crest and bone beads kept small: elemental tribal read
  ['#2fb8c0', '#e0b058', '#2f8d93'].forEach((c, i) => {
    const f = k.mesh(r.head, 'cone', c, [(i - 1) * 0.35, 1.0, -0.35], [0.18, 1.1, 0.07], [0.2, 0, -(i - 1) * 0.35]);
    r.fx.push(f);
  });
  for (let i = 0; i < 3; i++) k.mesh(r.torso, 'sphere', i === 1 ? '#4dd0e1' : '#efe6cf', [(i - 1) * 0.3, 0.95, 0.62], [0.12, 0.12, 0.1], [0, 0, 0], i === 1);
  // rune hammer: brown haft, chunky steel-blue head with cyan rune zigzag
  const w = r.weapon;
  k.mesh(w, 'cylinder', '#68452a', [0, 0.1, 0], [0.18, 3.0, 0.18]);
  const hm = k.group(w, [0, 1.9, 0]);
  k.mesh(hm, 'box', '#54788a', [0, 0, 0], [1.9, 1.1, 1.1]);
  k.mesh(hm, 'box', '#b9d9df', [0, 0.5, 0], [1.9, 0.12, 1.12]);
  k.mesh(hm, 'box', '#273e49', [0, -0.5, 0], [1.9, 0.12, 1.12]);
  const rune = k.mesh(hm, 'box', '#7eeaff', [0, 0, 0.57], [1.1, 0.14, 0.05], [0, 0, 0.4], true);
  r.fxB.push(rune);
  return r;
}

const BUILDERS: Record<CasterClassId, (k: Kit, root: THREE.Group) => Rig> = {
  priest: buildPriest, frostmage: buildFrost, warlock: buildWarlock, shaman: buildShaman,
};

export function createCaster(classId: CasterClassId): CharacterModel {
  const k = createModelKit();
  const root = new THREE.Group(); root.name = classId;
  const r = BUILDERS[classId](k, root);
  let altOn = false;
  const ease = (t: number) => t * t * (3 - 2 * t);

  return k.finish(root, (pose: CharacterPose) => {
    const wantAlt = (classId === 'priest' && pose.variant === 'shadow') || (classId === 'frostmage' && pose.variant === 'fire');
    if (wantAlt !== altOn) { altOn = wantAlt; r.tags.forEach((x) => { x.m.material = altOn ? x.alt : x.base; }); }
    const { time: t, mode } = pose; const g = Math.max(0, Math.min(1, pose.progress));
    const run = mode === 'run'; const sw = run ? Math.sin(t * 9) : 0;
    const breath = Math.sin(t * 2.2) * (run ? 0.02 : 0.04);
    r.body.position.y = run ? Math.abs(Math.sin(t * 9)) * 0.12 : 0;
    r.torso.scale.y = 1 + breath * 0.5;
    r.torso.rotation.set(run ? 0.12 : 0, run ? sw * 0.08 : 0, 0);
    r.hips[0].rotation.x = sw * 0.7; r.hips[1].rotation.x = -sw * 0.7;
    r.knees[0].rotation.x = run ? Math.max(0, -sw) * 0.8 : 0;
    r.knees[1].rotation.x = run ? Math.max(0, sw) * 0.8 : 0;
    r.head.rotation.set(0, Math.sin(t * 0.8) * 0.08, 0);
    r.cape.rotation.x = 0.05 + (run ? 0.35 + Math.sin(t * 8) * 0.1 : Math.sin(t * 1.8) * 0.04);
    // base arm pose: staff held forward-low in right hand, left hand free
    let rx = -0.35 + (run ? -sw * 0.3 : Math.sin(t * 2.2) * 0.03); let rz = 0.05;
    let lx = run ? sw * 0.6 : Math.sin(t * 2.2 + 1) * 0.04; let lz = -0.08;
    let wx = 0;
    if (mode === 'attack') {
      const up = ease(Math.min(1, g / 0.4)); const hit = ease(Math.max(0, (g - 0.4) / 0.35));
      rx = -0.35 - up * 1.1 + hit * 2.0; wx = -up * 0.3 + hit * 0.7;
      lx = -up * 0.6 + hit * 0.8;
      r.torso.rotation.x += hit * 0.18; r.torso.rotation.y += (hit - up) * 0.25;
    } else if (mode === 'cast') {
      const up = Math.sin(Math.min(1, g) * Math.PI);
      rx = -0.4 - up * 1.7; lx = -0.3 - up * 2.0; rz = 0.1 + up * 0.15; lz = -0.1 - up * 0.2;
      wx = -up * 0.12; r.torso.rotation.x -= up * 0.1; r.head.rotation.x = -up * 0.2;
      r.body.position.y += up * 0.18;
    }
    r.armR.rotation.set(rx, 0, rz); r.armL.rotation.set(lx, 0, lz); r.weapon.rotation.set(wx - rx * 0.45, 0, 0);
    const casting = mode === 'cast' ? Math.sin(g * Math.PI) : 0;
    r.fx.forEach((o, i) => {
      if (classId === 'priest') { o.rotation.z = t * 0.8; o.scale.setScalar(1 + casting * 0.35); }
      else if (classId === 'frostmage') { o.rotation.z = Math.sin(t * 1.6 + i) * 0.05; }
      else if (classId === 'warlock') { o.rotation.y = Math.sin(t * 2) * 0.2; }
      else { o.rotation.z = Math.sin(t * 3 + i * 2) * 0.12; }
    });
    r.fxB.forEach((o) => {
      o.scale.setScalar(1 + Math.sin(t * 4) * 0.06 + casting * 0.4);
    });
  });
}
