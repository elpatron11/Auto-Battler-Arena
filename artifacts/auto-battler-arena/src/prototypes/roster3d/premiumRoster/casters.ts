import * as THREE from 'three';
import { createCharacterModel } from '../characterModel';
import type { CharacterModel, CharacterPose } from '../modelKit';
import { countTriangles } from '../../warrior3d/warriorModel';
import { Builder, xf, ratio, type Ring, type RGB } from '../magePremiumGeometry';

/**
 * Premium Priest / Shaman / Warlock. Refines the real base createCharacterModel(id) meshes in place
 * (same nodes, rig groups, materials, animate). Closed indexed vertex-shaded geometry; gold / cloth /
 * leather / metal separation is done with per-vertex multipliers over the host material colour.
 */
export type PremiumCasterId = 'priest' | 'shaman' | 'warlock';
const IDLE: CharacterPose = { time: 0, mode: 'idle', progress: 0 };
const odd = (i: number) => i % 2 === 1;
const PI = Math.PI;

interface Cfg {
  skin: string; robe: string; robeD: string; trim: string; trimHi: string; boot: string; belt: string;
  hair: string; cape: string; gold: string; acc: string; dark: string; alt: string;
}
const CFG: Record<PremiumCasterId, Cfg> = {
  priest: { skin: 'e2b08a', robe: 'f0e8d8', robeD: 'cfc3a4', trim: 'd6ad52', trimHi: 'fff9dd', boot: '7a5a34', belt: 'd6ad52',
    hair: 'f1dfbd', cape: 'cfc3a4', gold: '#e0b44a', acc: '#8fd0ff', dark: '#8a7a58', alt: 'shadow' },
  shaman: { skin: 'b97a55', robe: '355f73', robeD: '4b3729', trim: '5ea8c5', trimHi: '4dd0e1', boot: '24262d', belt: '4b3729',
    hair: '4b2d1d', cape: '4b3729', gold: '#d8a944', acc: '#6fe6f5', dark: '#1d3a52', alt: '' },
  warlock: { skin: '9b7f93', robe: '24152f', robeD: '120b18', trim: '5b2378', trimHi: 'a14ac2', boot: '24262d', belt: '120b18',
    hair: '24152f', cape: '241933', gold: '#c9a24a', acc: '#c46bff', dark: '#3a1850', alt: '' },
};

export function createPremiumCasterModel(id: PremiumCasterId): CharacterModel {
  const c = CFG[id];
  const base = createCharacterModel(id);
  const meshes: THREE.Mesh[] = [];
  base.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const hex = (m: THREE.Mesh) => (m.material as THREE.MeshLambertMaterial).color.getHexString();
  const pick = (h: string, t: string, f: (m: THREE.Mesh) => boolean = () => true) =>
    meshes.filter((m) => hex(m) === h.replace('#', '') && m.geometry.type === t && f(m));
  const owned: THREE.BufferGeometry[] = [];
  const put = (ms: THREE.Mesh | THREE.Mesh[] | undefined, g: THREE.BufferGeometry, absolute = false, part?: string) => {
    owned.push(g);
    for (const m of ([] as (THREE.Mesh | undefined)[]).concat(ms)) {
      if (!m) continue;
      m.geometry = g; m.scale.set(1, 1, 1);
      if (absolute) { m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); }
      if (part) m.userData.part = part;
      (m.material as THREE.MeshLambertMaterial).vertexColors = true;
    }
  };

  // ---- joint tagging for shared motion overlay
  const body = base.root.children[0] as THREE.Object3D | undefined;
  body && (body.userData.premiumJoint = 'body');
  let torso: THREE.Object3D | undefined; let head: THREE.Object3D | undefined; let capeG: THREE.Object3D | undefined;
  body?.children.forEach((o) => { if (!torso && o.type === 'Group' && Math.abs(o.position.y - 1.4) < 0.01 && o.position.x === 0) torso = o; });
  torso?.children.forEach((o) => {
    if (o.type !== 'Group') return;
    if (Math.abs(o.position.y - 2.35) < 0.01) head = o;
    else if (Math.abs(o.position.y - 1.35) < 0.01 && Math.abs(o.position.z + 0.55) < 0.01) capeG = o;
  });
  if (torso) torso.userData.premiumJoint = 'torso';
  if (head) head.userData.premiumJoint = 'head';
  if (capeG) capeG.userData.premiumJoint = 'cape';

  // ---- hosts
  const skinH = pick(c.skin, 'SphereGeometry');
  const headM = skinH.find((m) => m.scale.x > 0.7);
  const nose = skinH.find((m) => m.scale.x < 0.2 && m.parent === headM?.parent);
  const hands = skinH.filter((m) => m.parent !== headM?.parent && m.scale.x < 0.3);
  const neck = pick(c.skin, 'CylinderGeometry')[0];
  const upper = pick(c.robe, 'CylinderGeometry', (m) => Math.abs(m.position.y - 0.75) < 0.01)[0];
  const lower = pick(c.robe, 'CylinderGeometry', (m) => Math.abs(m.position.y + 0.4) < 0.01)[0];
  const sleeves = pick(c.robe, 'CylinderGeometry', (m) => Math.abs(m.position.y + 0.65) < 0.01);
  const pauld = pick(c.trim, 'SphereGeometry', (m) => m.scale.x > 0.4 && m.scale.x < 0.6);
  const stripes = pick(c.trimHi, 'BoxGeometry', (m) => Math.abs(m.position.x) < 0.5 && m.position.y > 1);
  const beltM = pick(c.belt, 'BoxGeometry', (m) => m.scale.x > 1.4)[0];
  const boots = pick(c.boot, 'BoxGeometry');
  const legs = pick(c.robeD, 'CylinderGeometry', (m) => m.scale.x < 0.4);
  const hips = legs.filter((m) => m.scale.y > 0.8); const knees = legs.filter((m) => m.scale.y <= 0.8);
  const cape = pick(c.cape, 'ExtrudeGeometry')[0];
  const eyeW = pick('eef7ff', 'SphereGeometry'); const eyeP = pick('1d2230', 'SphereGeometry');
  const brows = meshes.filter((m) => m.geometry.type === 'BoxGeometry' && m.parent === headM?.parent && m.position.y > 0.1 && m.position.y < 0.25 && Math.abs(m.scale.x - 0.36) < 0.01);
  const hairCap = pick(c.hair, 'SphereGeometry', (m) => m.parent === headM?.parent && m.scale.x > 0.6)[0];

  const R = (h: string, t: string) => ratio(h, t);
  const gR = R(c.robe, c.gold), gD = R(c.robeD, c.gold), gT = R(c.trim, c.gold), gC = R(c.cape, c.gold), gB = R(c.belt, c.gold);
  const aR = R(c.robe, c.acc), aC = R(c.cape, c.acc), aT = R(c.trim, c.acc), aD = R(c.robeD, c.acc);
  const dkR = R(c.robe, c.dark), dkC = R(c.cape, c.dark);
  const warm = R(c.skin, '#' + c.skin), shade = [0.78, 0.74, 0.74] as RGB;
  const goldBoot = R(c.boot, c.gold);

  // ---- legs / body base
  put(hips, new Builder().loft([{ y: 0.425, rx: 0.37, s: 0.9 }, { y: -0.425, rx: 0.34, s: 0.75 }], { top: true, bottom: true }).build());
  put(knees, new Builder().loft([{ y: 0.325, rx: 0.34, s: 0.85 }, { y: -0.325, rx: 0.34, s: 0.7 }], { top: true, bottom: true }).build());
  put(boots, new Builder()
    .box(0.84, 0.09, 1.06, xf(0, -0.105, 0.02), { s: 0.5 })
    .box(0.72, 0.24, 0.92, xf(0, 0.015, -0.02), { tx: 0.88, tz: 0.82, dz: -0.08, s: 0.9, sTop: 1.05 })
    .box(0.64, 0.1, 0.62, xf(0, 0.18, -0.16), { s: 1.2, sTop: 1.3, k: goldBoot }).build());

  // ---- head: brow, cheeks, jaw
  put(headM, new Builder().loft([
    { y: 0.78, rx: 0.3 }, { y: 0.3, rx: 0.72, s: 1.02 }, { y: 0, rx: 0.74, s: 1.04 },
    { y: -0.3, rx: 0.66, s: 0.96 }, { y: -0.52, rx: 0.48, cz: 0.06, s: 0.9 }, { y: -0.76, rx: 0.28, cz: 0.08, s: 0.85 },
  ], { top: true, bottom: true, wob: (ri, i) => {
    if (ri === 1 && (i === 0 || i === 1 || i === 7)) return { dr: 1.1, s: 0.8, k: shade };
    if (ri === 2 && (i === 1 || i === 7)) return { dr: 1.07, s: 1.08, k: warm };
    if (ri === 3 && i === 0) return { dr: 0.94 };
    return undefined;
  } }).build(), true, 'head');
  put(nose, new Builder().loft([
    { y: 0.2, rx: 0.05, rz: 0.06, s: 0.9 }, { y: 0, rx: 0.1, rz: 0.12, cz: 0.05, s: 1.05 },
    { y: -0.16, rx: 0.14, rz: 0.17, cz: 0.09 }, { y: -0.2, rx: 0.07, rz: 0.08, cz: 0.07, s: 0.7 },
  ], { n: 4, top: true, bottom: true }).build());
  put(neck, new Builder().loft([{ y: 0.25, rx: 0.28, s: 0.85 }, { y: -0.25, rx: 0.3, s: 0.75 }], { top: true, bottom: true }).build());
  put(hands, new Builder().loft([
    { y: 0.24, rx: 0.12, s: 1.05 }, { y: 0.1, rx: 0.26 }, { y: -0.1, rx: 0.27, s: 0.95 }, { y: -0.26, rx: 0.14, s: 0.85 },
  ], { top: true, bottom: true }).build());
  put(eyeW, new Builder().loft([{ y: 0.1, rx: 0 }, { y: 0, rx: 0.15, rz: 0.07, cz: 0.01 }, { y: -0.1, rx: 0 }], { n: 6 }).build());
  put(eyeP, new Builder().loft([{ y: 0.075, rx: 0 }, { y: 0, rx: 0.07, rz: 0.05, cz: 0.01 }, { y: -0.075, rx: 0 }], { n: 6 }).build());
  put(brows, new Builder().box(0.5, 0.13, 0.14, undefined, { tx: 0.75, tz: 0.7, s: 0.9, sTop: 1 }).build());

  // ---- robe: faceted chest, flared skirt, gold trim
  put(upper, new Builder().loft([
    { y: 0.82, rx: 0.6, rz: 0.4, s: 0.7 }, { y: 0.74, rx: 0.86, rz: 0.5, s: 1.1 }, { y: 0.55, rx: 0.98, rz: 0.56, s: 1.12 },
    { y: 0.2, rx: 0.92, rz: 0.58 }, { y: -0.2, rx: 0.8, rz: 0.52, s: 0.92 }, { y: -0.75, rx: 0.78, rz: 0.52, s: 0.85 },
  ], { top: true, bottom: true, wob: (ri, i) => ri >= 2 && ri <= 4 && odd(i) ? { dr: 0.93, s: 0.88 } : undefined })
    .box(0.12, 1.4, 0.07, xf(-0.2, 0, 0.57, 0, 0, 0.1), { s: 0.95, sTop: 1.1, k: gR })
    .box(0.12, 1.4, 0.07, xf(0.2, 0, 0.57, 0, 0, -0.1), { s: 0.95, sTop: 1.1, k: gR })
    .box(1.0, 0.18, 0.1, xf(0, 0.5, 0.52), { s: 1, sTop: 1.2, k: gR })
    .build(), false, 'robeUpper');
  put(lower, new Builder().loft([
    { y: 0.5, rx: 0.78, rz: 0.52, s: 0.85 }, { y: 0.1, rx: 0.86, rz: 0.62, s: 0.95 },
    { y: -0.38, rx: 1.0, rz: 0.72, s: 0.85 }, { y: -0.41, rx: 1.02, rz: 0.74, k: gR }, { y: -0.5, rx: 1.02, rz: 0.74, s: 0.8, k: gR },
  ], { top: true, bottom: true, wob: (ri, i) => ri >= 3 ? (odd(i) ? { dr: 0.84, dy: 0.14, s: 0.8 } : { s: 0.95 }) : undefined })
    .box(0.52, 0.92, 0.1, xf(0, -0.05, 0.64, -0.13, 0, 0), { s: 0.85, sTop: 1.25, k: id === 'priest' ? undefined : dkR })
    .box(0.4, 0.8, 0.08, xf(0.58, -0.08, 0.5, -0.1, 0.55, 0), { s: 0.7 })
    .box(0.4, 0.8, 0.08, xf(-0.58, -0.08, 0.5, -0.1, -0.55, 0), { s: 0.7 }).build());
  put(stripes, new Builder().box(0.7, 0.15, 0.1, undefined, { s: 0.95, sTop: 1.1 }).build());
  stripes.forEach((m) => { m.position.z += 0.1; });
  const beltB = new Builder().loft([{ y: 0.13, rx: 0.78, rz: 0.48, s: 1.1 }, { y: 0, rx: 0.85, rz: 0.54, s: 0.95 }, { y: -0.13, rx: 0.78, rz: 0.48, s: 0.8 }], { top: true, bottom: true })
    .box(0.5, 0.42, 0.14, xf(0, 0, 0.56), { tx: 0.85, s: 1.1, sTop: 1.3, k: id === 'priest' ? undefined : gB })
    .box(0.24, 0.24, 0.1, xf(0, 0, 0.66, 0, 0, PI / 4), { tx: 0.5, s: 1, sTop: 1.3, k: R(c.belt, c.acc) });
  if (id !== 'priest') beltB.box(0.12, 0.8, 0.04, xf(-0.4, -0.5, 0.62, -0.1), { s: 0.9, sTop: 1.2 }).box(0.12, 0.8, 0.04, xf(0.4, -0.5, 0.62, -0.1), { s: 0.9, sTop: 1.2 });
  else beltB.box(0.1, 0.85, 0.04, xf(-0.27, -0.55, 0.72, -0.13), { s: 0.85, sTop: 1.15 }).box(0.1, 0.85, 0.04, xf(0.27, -0.55, 0.72, -0.13), { s: 0.85, sTop: 1.15 });
  put(beltM, beltB.build());

  // ---- cape: layered panels, gold borders, pointed hem, medallion
  put(cape, new Builder()
    .box(2.1, 1.9, 0.08, xf(0, -1.2, 0, 0.04), { tx: 0.8, s: 0.85, sTop: 1.25 })
    .box(0.75, 1.75, 0.08, xf(0.92, -1.35, 0.03, 0.04, 0, -0.1), { tx: 0.55, s: 0.7, sTop: 0.95, k: id === 'priest' ? undefined : dkC })
    .box(0.75, 1.75, 0.08, xf(-0.92, -1.35, 0.03, 0.04, 0, 0.1), { tx: 0.55, s: 0.7, sTop: 0.95, k: id === 'priest' ? undefined : dkC })
    .box(1.1, 0.7, 0.09, xf(0, -2.45, -0.05, 0.04, 0, PI), { tx: 0.05, s: 1, sTop: 0.8 })
    .box(0.09, 2.0, 0.1, xf(-1.0, -1.3, 0, 0.04, 0, -0.05), { s: 0.95, sTop: 1.1, k: gC })
    .box(0.09, 2.0, 0.1, xf(1.0, -1.3, 0, 0.04, 0, 0.05), { s: 0.95, sTop: 1.1, k: gC })
    .box(0.09, 0.85, 0.11, xf(-0.28, -2.5, -0.05, 0.04, 0, 0.62), { s: 0.95, sTop: 1.1, k: gC })
    .box(0.09, 0.85, 0.11, xf(0.28, -2.5, -0.05, 0.04, 0, -0.62), { s: 0.95, sTop: 1.1, k: gC })
    .box(1.5, 0.14, 0.11, xf(0, -0.1, -0.02), { s: 1, sTop: 1.2, k: gC })
    .box(0.6, 0.6, 0.1, xf(0, -0.8, -0.07, 0, 0, PI / 4), { tx: 0.8, tz: 0.7, s: 1, sTop: 1.25, k: gC })
    .box(0.34, 0.34, 0.1, xf(0, -0.8, -0.14, 0, 0, PI / 4), { tx: 0.4, tz: 0.5, s: 1, sTop: 1.3, k: aC })
    .build(), true, 'cloak');

  // ---- shoulders
  const spike = id !== 'priest';
  const pld = (s: number) => {
    const b = new Builder().loft([
      { y: 0.22, rx: 0.4, rz: 0.36, s: 1.1 }, { y: 0.14, rx: 0.62, rz: 0.56, s: 1.05 }, { y: 0, rx: 0.68, rz: 0.62, s: 0.95 },
      { y: -0.04, rx: 0.66, rz: 0.6, k: gT }, { y: -0.14, rx: 0.6, rz: 0.55, s: 0.9, k: gT }, { y: -0.2, rx: 0.5, rz: 0.46, s: 0.5 },
      { y: -0.34, rx: 0.34, rz: 0.32, s: 0.5 },
    ], { top: true, bottom: true, wob: (ri, i) => ri === 2 && odd(i) ? { dr: 0.93, s: 0.85 } : undefined });
    if (spike) {
      b.loft([{ y: 0.95, rx: 0.06, cx: s * 1.0, s: 1.2, k: aT }, { y: 0.5, rx: 0.34, rz: 0.3, cx: s * 0.55, s: 1.1 }, { y: 0.1, rx: 0.5, rz: 0.46, cx: s * 0.15, s: 0.8 }], { n: 5, top: true, wob: (ri, i) => ri === 1 ? (i % 2 ? { s: 0.8 } : { s: 1.1, k: aT }) : undefined });
      b.loft([{ y: 0.55, rx: 0, cx: s * 0.5, cz: 0.7 }, { y: 0.1, rx: 0.2, rz: 0.2, cx: s * 0.25, cz: 0.3, s: 0.9 }, { y: -0.02, rx: 0.24, cx: s * 0.05, cz: 0.1, s: 0.7 }], { n: 5 });
      b.loft([{ y: 0.6, rx: 0, cx: s * 0.5, cz: -0.7 }, { y: 0.1, rx: 0.2, rz: 0.2, cx: s * 0.25, cz: -0.3, s: 0.9 }, { y: -0.02, rx: 0.24, cx: s * 0.05, cz: -0.1, s: 0.7 }], { n: 5 });
    } else {
      b.loft([{ y: 0.46, rx: 0.2, rz: 0.16, cx: s * 0.6, s: 1.1, k: gT }, { y: 0.36, rx: 0.3, rz: 0.24, cx: s * 0.6, k: aT }, { y: 0.28, rx: 0.2, rz: 0.16, cx: s * 0.6, s: 0.8, k: gT }], { n: 4, top: true, bottom: true });
    }
    return b.build();
  };
  const pgL = pld(-1), pgR = pld(1); owned.push(pgL, pgR);
  for (const m of pauld) { put(m, m.parent && m.parent.position.x < 0 ? pgL : pgR, false, 'shoulder'); owned.pop(); }
  owned.splice(owned.indexOf(pgL), 1); owned.push(pgL);
  put(sleeves, new Builder().loft([
    { y: 0.6, rx: 0.3, s: 0.9 }, { y: -0.16, rx: 0.34 }, { y: -0.2, rx: 0.4, k: gR }, { y: -0.34, rx: 0.45, s: 1.05, k: gR },
    { y: -0.37, rx: 0.42, s: 1.5 }, { y: -0.6, rx: 0.4, s: 1.3 },
  ], { top: true, bottom: true, wob: (ri, i) => ri === 5 && odd(i) ? { dr: 0.9, s: 1.15 } : undefined }).build());

  // ---- hair / hood cap
  const weapon = (n: string) => base.root.getObjectByName(n);
  void weapon;
  const hairK = id === 'priest' ? R(c.hair, '#f7dc8c') : undefined;
  if (id === 'priest') {
    put(hairCap, new Builder().loft([
      { y: 0.58, rx: 0.3, s: 0.9, k: hairK }, { y: 0.45, rx: 0.6, k: hairK }, { y: 0.15, rx: 0.8, rz: 0.78, s: 0.95, k: hairK },
      { y: -0.2, rx: 0.82, rz: 0.78, s: 0.9, k: hairK }, { y: -0.5, rx: 0.68, rz: 0.66, s: 0.75 },
    ], { top: true, bottom: true, wob: (ri, i) => ri >= 2 && (i === 2 || i === 6) ? { dr: 1.06 } : undefined }).build());
  } else if (hairCap) {
    put(hairCap, new Builder().loft([
      { y: 0.58, rx: 0.3, s: 0.9 }, { y: 0.45, rx: 0.62 }, { y: 0.15, rx: 0.82, rz: 0.78, s: 0.95 },
      { y: -0.2, rx: 0.82, rz: 0.78, s: 0.85 }, { y: -0.5, rx: 0.64, rz: 0.62, s: 0.7 },
    ], { top: true, bottom: true, wob: (ri, i) => ri >= 2 && odd(i) ? { dr: 1.04, s: 0.85 } : undefined }).build());
  }

  // ---- class specifics
  const w = base.root.getObjectByName('') ?? undefined; void w;
  const find = (h: string, t: string, f?: (m: THREE.Mesh) => boolean) => pick(h, t, f);

  if (id === 'priest') {
    const gHalo = new Builder();
    const seg = 14;
    for (let i = 0; i < seg; i++) { const a = (i / seg) * PI * 2; gHalo.box(0.42, 0.14, 0.2, xf(Math.sin(a) * 0.95, 0, Math.cos(a) * 0.95, 0, a, 0), { s: i % 2 ? 0.85 : 1.1 }); }
    const halo = find('ffe9ae', 'TorusGeometry')[0] ?? meshes.find((m) => hex(m) === 'ffe9ae');
    put(halo, gHalo.build(), true);
    const ringG = new Builder();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; ringG.box(0.34, 0.14, 0.16, xf(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0, 0, 0, a + PI / 2), { s: i % 2 ? 0.85 : 1.1 }); }
    const ring = meshes.find((m) => hex(m) === 'fff0a2' && m.geometry.type === 'TorusGeometry');
    put(ring, ringG.build(), true);
    const bx = meshes.filter((m) => hex(m) === 'fff0a2' && m.geometry.type === 'BoxGeometry');
    put(bx[0], new Builder().box(0.2, 1.7, 0.16, undefined, { tx: 0.7, tz: 0.8, s: 0.9, sTop: 1.15 }).build());
    put(bx[1], new Builder().box(1.5, 0.2, 0.16, undefined, { tx: 0.8, tz: 0.7, s: 0.9, sTop: 1.15 }).build());
    const shaft = meshes.find((m) => hex(m) === 'c79b3e');
    put(shaft, new Builder().loft([
      { y: 2.4, rx: 0.12 }, { y: 2.1, rx: 0.2, k: [1.1, 1.1, 1.1] }, { y: 1.8, rx: 0.13 }, { y: 0.4, rx: 0.15, s: 0.9 }, { y: 0.35, rx: 0.2, s: 0.6 },
      { y: -0.4, rx: 0.2, s: 0.5 }, { y: -0.45, rx: 0.18, s: 1.15 }, { y: -1.8, rx: 0.1, s: 0.8 },
    ], { n: 6, top: true, bottom: true }).build(), true, 'staff');
    const core = meshes.find((m) => hex(m) === 'fff9d7');
    put(core, new Builder().loft([{ y: 0.4, rx: 0 }, { y: 0.12, rx: 0.34, rz: 0.3 }, { y: -0.12, rx: 0.34, rz: 0.3, s: 0.85 }, { y: -0.4, rx: 0 }], { n: 6 }).build());
    // belt tome
    const tome = meshes.find((m) => hex(m) === 'fff9dd' && m.position.x < -0.5);
    put(tome, new Builder().box(0.5, 0.6, 0.18, undefined, { tx: 0.95, s: 1, sTop: 1.1 }).box(0.54, 0.1, 0.22, xf(0, 0.2, 0.0), { s: 0.8, sTop: 1, k: R('fff9dd', c.gold) }).build());
    const circ = meshes.find((m) => hex(m) === 'ffd86a');
    put(circ, new Builder().box(0.2, 0.2, 0.12, xf(0, 0, 0, 0, 0, PI / 4), { tx: 0.5, tz: 0.6, s: 1, sTop: 1.3 }).build());
    for (const l of meshes.filter((m) => hex(m) === 'd7b87d' && m.geometry.type === 'CylinderGeometry')) {
      put(l, new Builder().loft([{ y: 0.55, rx: 0.12, rz: 0.2 }, { y: 0, rx: 0.14, rz: 0.22, s: 0.9 }, { y: -0.55, rx: 0.02, rz: 0.04, s: 0.7 }], { top: true }).build());
    }
  } else if (id === 'shaman') {
    const feath = ['2fb8c0', 'e0b058', '2f8d93'].map((h) => meshes.find((m) => hex(m) === h && m.geometry.type === 'ConeGeometry'));
    const fg = new Builder().loft([{ y: 0.55, rx: 0 }, { y: 0.2, rx: 0.2, rz: 0.06, s: 1.15 }, { y: -0.2, rx: 0.22, rz: 0.07 }, { y: -0.55, rx: 0.06, rz: 0.04, s: 0.6 }], { n: 6, bottom: true }).build();
    put(feath[0], fg); put(feath[1], fg); put(feath[2], fg); owned.pop(); owned.pop();
    const brow = new Builder().box(0.5, 0.08, 0.07, undefined, { tx: 0.5, s: 1, sTop: 1.2 }).build();
    put(meshes.filter((m) => hex(m) === '4dd0e1' && m.geometry.type === 'BoxGeometry' && m.parent === headM?.parent), brow);
    const beard = meshes.find((m) => hex(m) === '3b2419');
    put(beard, new Builder().loft([{ y: 0.6, rx: 0.5, rz: 0.3, s: 0.7 }, { y: 0.1, rx: 0.4, rz: 0.28, s: 1 }, { y: -0.6, rx: 0, s: 0.8 }], { top: true, wob: (ri, i) => ri === 1 && odd(i) ? { dr: 0.8, s: 0.8 } : undefined }).build(), false);
    for (const fur of meshes.filter((m) => hex(m) === '8a6a48' && m.geometry.type === 'SphereGeometry')) {
      put(fur, new Builder().loft([{ y: 0.3, rx: 0.35, rz: 0.3, s: 1.1 }, { y: 0.1, rx: 0.7, rz: 0.65 }, { y: -0.1, rx: 0.7, rz: 0.65, s: 0.8 }, { y: -0.3, rx: 0.45, rz: 0.4, s: 0.7 }], { top: true, bottom: true, wob: (ri, i) => ri >= 1 && odd(i) ? { dr: 1.1, s: 0.8 } : undefined }).build());
    }
    const bead = new Builder().loft([{ y: 0.14, rx: 0 }, { y: 0, rx: 0.14, s: 1 }, { y: -0.14, rx: 0 }], { n: 6 }).build();
    const beads = meshes.filter((m) => m.geometry.type === 'SphereGeometry' && m.parent === torso && m.position.y > 0.9 && m.position.y < 1 && m.scale.x < 0.15);
    put(beads, bead);
    const haft = meshes.find((m) => hex(m) === '68452a');
    put(haft, new Builder().loft([{ y: 1.5, rx: 0.18 }, { y: 1.4, rx: 0.2, s: 0.7 }, { y: 0.8, rx: 0.18, s: 0.85 }, { y: -0.5, rx: 0.2, s: 0.6 }, { y: -0.55, rx: 0.26, k: R('68452a', c.gold) },
      { y: -1.3, rx: 0.2, s: 0.8 }, { y: -1.5, rx: 0.3, s: 1 }, { y: -1.6, rx: 0, s: 0.8 }], { n: 6, top: true }).build(), true, 'staff');
    const hm = meshes.find((m) => hex(m) === '54788a');
    put(hm, new Builder()
      .box(1.9, 1.1, 1.1, undefined, { tx: 0.92, tz: 0.88, s: 0.95, sTop: 1.1 })
      .box(0.5, 0.7, 0.7, xf(1.15, 0, 0, 0, 0, -PI / 2), { tx: 0.4, tz: 0.4, s: 0.9, sTop: 1.2 })
      .box(0.5, 0.7, 0.7, xf(-1.15, 0, 0, 0, 0, PI / 2), { tx: 0.4, tz: 0.4, s: 0.9, sTop: 1.2 })
      .box(0.3, 0.3, 0.8, xf(0, 0.72, 0), { tx: 0.5, s: 1.1, sTop: 1.3, k: R('54788a', c.gold) })
      .box(0.5, 0.3, 1.2, xf(0.62, -0.1, 0), { s: 0.8, sTop: 0.9, k: R('54788a', '#2f4d5c') })
      .box(0.5, 0.3, 1.2, xf(-0.62, -0.1, 0), { s: 0.8, sTop: 0.9, k: R('54788a', '#2f4d5c') })
      .build());
    put(meshes.find((m) => hex(m) === 'b9d9df'), new Builder().box(1.9, 0.12, 1.12, undefined, { tx: 0.95, s: 1.05, sTop: 1.15 }).build());
    put(meshes.find((m) => hex(m) === '273e49'), new Builder().box(1.9, 0.12, 1.12, undefined, { tx: 1.05, s: 0.9, sTop: 0.8 }).build());
    put(meshes.find((m) => hex(m) === '7eeaff'), new Builder().box(1.1, 0.14, 0.06, xf(0, 0, 0, 0, 0, 0.4), { tx: 0.4, s: 1.1, sTop: 1.3 }).build());
  } else {
    // warlock
    const horn = (len: number, w: number, side: number) => new Builder().loft([
      { y: len / 2, rx: 0, cx: side * 0.35, s: 1.2 }, { y: len * 0.3, rx: w * 0.5, cx: side * 0.22, s: 1.1 },
      { y: -len * 0.1, rx: w * 0.8, cx: side * 0.05, s: 1 }, { y: -len / 2, rx: w, s: 0.7 },
    ], { n: 5, bottom: true, wob: (_ri, i) => odd(i) ? { dr: 0.85, s: 0.8 } : undefined }).build();
    const hornG = [horn(1.7, 0.34, 1), horn(1.7, 0.34, -1)], tipG = [horn(0.9, 0.22, -1), horn(0.9, 0.22, 1)];
    owned.push(...hornG, ...tipG);
    for (const m of meshes.filter((m) => hex(m) === '18101f' && m.geometry.type === 'ConeGeometry' && m.parent === headM?.parent)) put(m, hornG[m.position.x > 0 ? 0 : 1]);
    for (const m of meshes.filter((m) => hex(m) === '7f42a4' && m.geometry.type === 'ConeGeometry')) put(m, tipG[m.position.x > 0 ? 0 : 1]);
    owned.splice(owned.length - 4 - 0, 0);
    const hoodBack = meshes.filter((m) => hex(m) === '24152f' && m.geometry.type === 'SphereGeometry' && m.parent === headM?.parent && m.scale.z < 0.5)[0];
    put(hoodBack, new Builder().loft([{ y: 0.5, rx: 0.4, s: 0.9 }, { y: 0, rx: 0.8, rz: 0.5 }, { y: -0.6, rx: 0.1, rz: 0.1, s: 0.6 }], { top: true, bottom: true, wob: (ri, i) => odd(i) ? { s: 0.8 } : undefined }).build());
    const mask = meshes.filter((m) => hex(m) === 'a14ac2' && m.geometry.type === 'BoxGeometry');
    for (const m of mask) {
      if (m.parent === headM?.parent) put(m, new Builder().box(0.5, 0.07, 0.07, undefined, { tx: 0.5, s: 1.1, sTop: 1.3 }).build());
      else put(m, new Builder().box(0.14, 0.9, 0.06, undefined, { tx: 0.5, s: 1.2, sTop: 1.4 }).box(0.34, 0.34, 0.07, xf(0, 0.1, 0.01, 0, 0, PI / 4), { s: 1.0, sTop: 1.2, k: R('a14ac2', c.gold) }).build());
    }
    for (const m of meshes.filter((m) => hex(m) === '5b2378' && m.geometry.type === 'ConeGeometry')) put(m, horn(0.9, 0.3, 0));
    const sh = meshes.find((m) => hex(m) === '443022' && m.geometry.type === 'CylinderGeometry');
    const wb = new Builder().loft([
      { y: 2.1, rx: 0.14 }, { y: 1.9, rx: 0.22, k: R('443022', c.gold) }, { y: 1.8, rx: 0.14 }, { y: 0.6, rx: 0.16, s: 0.9 },
      { y: 0.55, rx: 0.22, s: 0.55 }, { y: -0.3, rx: 0.22, s: 0.5 }, { y: -0.35, rx: 0.17, k: R('443022', c.gold) }, { y: -1.8, rx: 0.1, s: 0.8 },
    ], { n: 6, top: true, bottom: true });
    for (let k = 0; k < 3; k++) { const a = k * 2.1; wb.loft([{ y: 2.9, rx: 0, cx: Math.cos(a) * 0.1, cz: Math.sin(a) * 0.1 }, { y: 2.2, rx: 0.08, cx: Math.cos(a) * 0.45, cz: Math.sin(a) * 0.45 }, { y: 1.95, rx: 0.14, cx: Math.cos(a) * 0.2, cz: Math.sin(a) * 0.2, s: 0.8 }], { n: 4 }); }
    put(sh, wb.build(), true, 'staff');
    const orb = meshes.find((m) => hex(m) === 'b14cff');
    put(orb, new Builder().loft([
      { y: 0.55, rx: 0, s: 1.0 }, { y: 0.34, rx: 0.34, s: 0.9 }, { y: 0.1, rx: 0.52, s: 0.8 }, { y: -0.1, rx: 0.52, s: 0.7 }, { y: -0.34, rx: 0.34, s: 0.6 }, { y: -0.55, rx: 0, s: 0.55 },
    ], { n: 8, wob: (ri, i) => ri >= 1 && ri <= 4 ? (i % 2 ? { s: 0.7, k: aD } : { s: 0.95, k: R('b14cff', '#d070ff') }) : undefined }).build());
  }
  void gD; void aR;

  // ---- alt materials of refined meshes keep vertex shading (probe once, then restore)
  const objs: THREE.Object3D[] = []; const snap: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; v: boolean }[] = [];
  base.root.traverse((o) => { objs.push(o); snap.push({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible }); });
  const orig = new Map(meshes.map((m) => [m, m.material]));
  if (id === 'priest') {
    base.animate({ ...IDLE, variant: 'shadow' });
    meshes.forEach((m) => { if (m.material !== orig.get(m) && m.geometry.attributes.color) (m.material as THREE.MeshLambertMaterial).vertexColors = true; });
    base.animate(IDLE);
    meshes.forEach((m) => { m.material = orig.get(m)!; });
  }
  objs.forEach((o, i) => { const s = snap[i]; o.position.copy(s.p); o.quaternion.copy(s.q); o.scale.copy(s.s); o.visible = s.v; });

  const stats = { triangles: countTriangles(base.root), meshes: meshes.length,
    geometries: new Set(meshes.map((m) => m.geometry)).size, materials: base.stats.materials };
  let disposed = false;
  void (null as unknown as Ring);
  return {
    root: base.root, stats, animate: (p) => base.animate(p),
    dispose() { if (disposed) return; disposed = true; owned.forEach((g) => g.dispose()); base.dispose(); },
  };
}
