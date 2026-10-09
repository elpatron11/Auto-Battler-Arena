import * as THREE from 'three';
import { createCharacterModel } from './characterModel';
import type { CharacterModel, CharacterPose } from './modelKit';
import { countTriangles } from '../warrior3d/warriorModel';
import { Builder, xf, ratio, type Ring } from './magePremiumGeometry';

/**
 * Premium Cryomancer: builds the real base createCharacterModel('frostmage') and refines its existing
 * meshes in place (same nodes, pivots, rig, animate). Geometry is indexed, closed and vertex-painted:
 * RGB multipliers over each host material let gold trim and ice facets live inside existing meshes,
 * so there are no new meshes, materials, textures or lights.
 */
const IDLE: CharacterPose = { time: 0, mode: 'idle', progress: 0 };
const odd = (i: number) => i % 2 === 1;
const GOLD = '#d9b84c';
const ICE = '#a6e8ff';
const ICE_PALE = '#e2f8ff';

export function createPremiumMageModel(): CharacterModel {
  const base = createCharacterModel('frostmage');
  const meshes: THREE.Mesh[] = [];
  base.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const hex = (m: THREE.Mesh) => (m.material as THREE.MeshLambertMaterial).color.getHexString();
  const pick = (h: string, t: string, f: (m: THREE.Mesh) => boolean = () => true) =>
    meshes.filter((m) => hex(m) === h && m.geometry.type === t && f(m));
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

  const SKIN = 'e3b99c';
  const head = pick(SKIN, 'SphereGeometry', (m) => m.scale.x > 0.7)[0];
  const nose = pick(SKIN, 'SphereGeometry', (m) => m.scale.x < 0.2 && m.parent === head?.parent)[0];
  const hands = pick(SKIN, 'SphereGeometry', (m) => m.parent !== head?.parent && m.scale.x < 0.3);
  const neck = pick(SKIN, 'CylinderGeometry')[0];
  const upper = pick('295a9b', 'CylinderGeometry', (m) => Math.abs(m.position.y - 0.75) < 0.01)[0];
  const lower = pick('295a9b', 'CylinderGeometry', (m) => Math.abs(m.position.y + 0.4) < 0.01)[0];
  const sleeves = pick('295a9b', 'CylinderGeometry', (m) => Math.abs(m.position.y + 0.65) < 0.01);
  const pauld = pick('68b9ed', 'SphereGeometry');
  const stripes = pick('dff7ff', 'BoxGeometry');
  const belt = pick('d9b84c', 'BoxGeometry')[0];
  const band = pick('d9b84c', 'CylinderGeometry')[0];
  const bandGem = pick('bff3ff', 'SphereGeometry')[0];
  const boots = pick('24262d', 'BoxGeometry');
  const brows = pick('5d4a42', 'BoxGeometry');
  const hair = pick('e9f4ff', 'SphereGeometry')[0];
  const brim = pick('243d82', 'CylinderGeometry')[0];
  const tip = pick('304d9a', 'ConeGeometry')[0];
  const beard = pick('eef8ff', 'ConeGeometry')[0];
  const stache = pick('eef8ff', 'SphereGeometry')[0];
  const shaft = pick('624a31', 'CylinderGeometry')[0];
  const gems = pick('8de8ff', 'ConeGeometry');
  const gem = gems.find((m) => m.position.y > 2.5);
  const gemLow = gems.find((m) => m.position.y < 2.5);
  const eyeW = pick('eef7ff', 'SphereGeometry');
  const eyeP = pick('1d2230', 'SphereGeometry');
  const shard = pick('efffff', 'ConeGeometry')[0];
  const cape = pick('1f4577', 'ExtrudeGeometry')[0];
  const legs = pick('1f4577', 'CylinderGeometry');
  const hips = legs.filter((m) => m.scale.y > 0.8);
  const knees = legs.filter((m) => m.scale.y <= 0.8);

  // host-to-target colour multipliers
  const goldOnRobe = ratio('295a9b', GOLD), goldOnLight = ratio('68b9ed', GOLD), goldOnWood = ratio('624a31', GOLD);
  const goldOnNavy = ratio('243d82', GOLD), goldOnCloak = ratio('1f4577', GOLD), goldOnPale = ratio('dff7ff', GOLD);
  const goldOnBoot = ratio('24262d', GOLD), goldOnIce = ratio('8de8ff', GOLD);
  const iceOnLight = ratio('68b9ed', ICE), paleOnLight = ratio('68b9ed', ICE_PALE);
  const iceOnGold = ratio('d9b84c', '#8fe4ff'), iceOnCloak = ratio('1f4577', '#7fdcff'), iceOnNavy = ratio('243d82', '#8fe4ff');
  const iceOnGem = ratio('8de8ff', '#bff2ff');
  const leather = ratio('624a31', '#3a2a1e');
  const warm = ratio('e3b99c', '#f0b896'), shadeSkin = ratio('e3b99c', '#b88468');
  const white = ratio('5d4a42', '#e6ecf2');

  // ---- legs: shared closed shaded cylinders (needed so the cloak material can carry vertex colour)
  put(hips, new Builder().loft([{ y: 0.425, rx: 0.37, s: 0.9 }, { y: -0.425, rx: 0.34, s: 0.75 }], { top: true, bottom: true }).build());
  put(knees, new Builder().loft([{ y: 0.325, rx: 0.34, s: 0.85 }, { y: -0.325, rx: 0.34, s: 0.7 }], { top: true, bottom: true }).build());

  // ---- head: brow ridge, warm cheeks, chin
  put(head, new Builder().loft([
    { y: 0.78, rx: 0.3 }, { y: 0.3, rx: 0.72, s: 1.02 }, { y: 0, rx: 0.74, s: 1.04 },
    { y: -0.3, rx: 0.66, s: 0.96 }, { y: -0.52, rx: 0.48, cz: 0.06, s: 0.9 }, { y: -0.76, rx: 0.28, cz: 0.08, s: 0.85 },
  ], { top: true, bottom: true, wob: (ri, i) => {
    if (ri === 1 && (i === 0 || i === 1 || i === 7)) return { dr: 1.1, s: 0.8, k: shadeSkin };
    if (ri === 2 && (i === 1 || i === 7)) return { dr: 1.07, s: 1.08, k: warm };
    if (ri === 2 && i === 0) return { dr: 1.02, s: 1.08 };
    if (ri === 3 && i === 0) return { dr: 0.94 };
    return undefined;
  } }).build(), true, 'head');
  put(nose, new Builder().loft([
    { y: 0.2, rx: 0.05, rz: 0.06, s: 0.9 }, { y: 0.0, rx: 0.1, rz: 0.12, cz: 0.05, s: 1.05 },
    { y: -0.16, rx: 0.14, rz: 0.17, cz: 0.09, s: 1 }, { y: -0.2, rx: 0.07, rz: 0.08, cz: 0.07, s: 0.7 },
  ], { n: 4, top: true, bottom: true, tint: warm }).build());
  put(neck, new Builder().loft([{ y: 0.25, rx: 0.28, s: 0.85 }, { y: -0.25, rx: 0.3, s: 0.75 }], { top: true, bottom: true }).build());
  put(hands, new Builder().loft([
    { y: 0.24, rx: 0.12, s: 1.05 }, { y: 0.1, rx: 0.26, s: 1 }, { y: -0.1, rx: 0.27, s: 0.95 }, { y: -0.26, rx: 0.14, s: 0.85 },
  ], { top: true, bottom: true, tint: warm }).build());
  put(brows, new Builder().box(0.5, 0.13, 0.14, undefined, { tx: 0.75, tz: 0.7, s: 0.9, sTop: 1, k: white }).build());
  put(eyeW, new Builder().loft([{ y: 0.1, rx: 0 }, { y: 0, rx: 0.15, rz: 0.07, cz: 0.01, s: 1 }, { y: -0.1, rx: 0 }], { n: 6 }).build());
  put(eyeP, new Builder().loft([{ y: 0.075, rx: 0 }, { y: 0, rx: 0.07, rz: 0.05, cz: 0.01, s: 1 }, { y: -0.075, rx: 0 }], { n: 6 }).build());

  // ---- hair: side locks and a longer back
  put(hair, new Builder().loft([
    { y: 0.58, rx: 0.3, s: 0.9 }, { y: 0.45, rx: 0.6, s: 1 }, { y: 0.15, rx: 0.8, rz: 0.78, s: 0.95 },
    { y: -0.2, rx: 0.82, rz: 0.78, s: 0.9 }, { y: -0.5, rx: 0.68, rz: 0.66, s: 0.75 },
  ], { top: true, bottom: true, wob: (ri, i, a) => {
    if (ri === 4 && Math.cos(a) < -0.25) return { dy: -0.35, s: 0.7 };
    if (ri >= 2 && (i === 2 || i === 6)) return { dr: 1.06, dy: ri === 4 ? -0.12 : 0 };
    return undefined;
  } }).build());

  // ---- hat: clean broad brim with gold edge, tall bent faceted cone, gold band with diamond gem
  put(brim, new Builder().loft([
    { y: 0.1, rx: 0.75, s: 1.05 }, { y: 0.08, rx: 1.05, s: 1.1 }, { y: 0.0, rx: 1.24, s: 0.95 },
    { y: -0.03, rx: 1.32, s: 1.1, k: goldOnNavy }, { y: -0.09, rx: 1.3, s: 0.9, k: goldOnNavy }, { y: -0.08, rx: 0.9, s: 0.5 },
  ], { top: true, bottom: true, wob: (ri, i, a) => {
    if (ri >= 2 && ri <= 4) return { dy: Math.cos(a) > 0.5 ? -0.08 : 0.07 * (1 - Math.cos(a)) * 0.6 + (odd(i) ? 0.025 : 0) };
    return undefined;
  } }).build(), false, 'brim');
  put(tip, new Builder().loft([
    { y: 0.72, rx: 0, cx: 0.56, cz: -0.98, s: 1.2 }, { y: 0.95, rx: 0.17, cx: 0.4, cz: -0.55, s: 1.15 },
    { y: 0.62, rx: 0.3, cx: 0.2, cz: -0.2, s: 1.1 }, { y: 0.15, rx: 0.5, cx: 0.04, cz: -0.06, s: 1 },
    { y: -0.4, rx: 0.72, s: 0.92 }, { y: -0.95, rx: 0.88, s: 0.78 },
  ], { bottom: true, wob: (ri, i) => (ri === 3 || ri === 4) && odd(i) ? { dr: 0.88, s: 0.82 } : undefined }).build(), false, 'hatCone');
  put(band, new Builder().loft([
    { y: 0.1, rx: 0.84, s: 1.1 }, { y: 0.07, rx: 0.92, s: 1.15 }, { y: -0.07, rx: 0.92, s: 0.9 }, { y: -0.1, rx: 0.86, s: 0.8 },
  ], { top: true, bottom: true })
    .box(0.52, 0.52, 0.1, xf(0, 0.22, 0.8, 0, 0, Math.PI / 4), { tx: 0.8, tz: 0.7, s: 1.1, sTop: 1.25 })
    .box(0.18, 0.12, 0.08, xf(0.5, 0, 0.7, 0, 0.7, 0), { s: 1, sTop: 1.2 })
    .box(0.18, 0.12, 0.08, xf(-0.5, 0, 0.7, 0, -0.7, 0), { s: 1, sTop: 1.2 }).build());
  bandGem.position.set(0, 0.9, 0.86);
  put(bandGem, new Builder().box(0.36, 0.36, 0.16, xf(0, 0, 0, 0, 0, Math.PI / 4), { tx: 0.45, tz: 0.4, s: 0.85, sTop: 1.15 }).build());
  { const sm = bandGem.material as THREE.MeshLambertMaterial; sm.color.multiplyScalar(0.55); sm.emissive.copy(sm.color); sm.emissiveIntensity = 0.1; }

  // ---- face: carved beard (shadowed top, long main mass, side planes), bold moustache lobes
  put(beard, new Builder().loft([
    { y: -0.2, rx: 0.5, rz: 0.22, cz: 0.52, s: 0.6 }, { y: -0.5, rx: 0.6, rz: 0.32, cz: 0.52, s: 0.92 },
    { y: -0.95, rx: 0.46, rz: 0.3, cz: 0.56, s: 1 }, { y: -1.4, rx: 0.26, rz: 0.22, cz: 0.6, s: 0.9 },
    { y: -1.85, rx: 0, cz: 0.68, s: 0.8 },
  ], { top: true, wob: (ri, i) => ri >= 1 && ri <= 3 && odd(i) ? { dr: 0.86, dy: ri === 3 ? -0.14 : 0, s: 0.88 } : undefined })
    .box(0.14, 1.0, 0.52, xf(0.58, -0.45, 0.42, 0, 0, -0.14), { tx: 0.6, s: 0.8, sTop: 1 })
    .box(0.14, 1.0, 0.52, xf(-0.58, -0.45, 0.42, 0, 0, 0.14), { tx: 0.6, s: 0.8, sTop: 1 })
    .build(), true, 'beard');
  const lobe: Ring[] = [{ y: 0.52, rx: 0.02, rz: 0.03, s: 1 }, { y: 0.36, rx: 0.08, rz: 0.12, s: 1 }, { y: 0.14, rx: 0.12, rz: 0.15, s: 0.9 }, { y: 0, rx: 0.08, rz: 0.11, s: 0.72 }];
  put(stache, new Builder()
    .loft(lobe, { n: 6, bottom: true, m: xf(0.02, -0.31, 0.75, 0, 0, -1.07) })
    .loft(lobe, { n: 6, bottom: true, m: xf(-0.02, -0.31, 0.75, 0, 0, 1.07) }).build(), true);

  // ---- robe: faceted chest, long flared skirt with gold hem and overlapping panels
  put(upper, new Builder().loft([
    { y: 0.82, rx: 0.6, rz: 0.4, s: 0.7 }, { y: 0.74, rx: 0.86, rz: 0.5, s: 1.1 }, { y: 0.55, rx: 0.98, rz: 0.56, s: 1.12 },
    { y: 0.2, rx: 0.92, rz: 0.58, s: 1 }, { y: -0.2, rx: 0.8, rz: 0.52, s: 0.92 }, { y: -0.75, rx: 0.78, rz: 0.52, s: 0.85 },
  ], { top: true, bottom: true, wob: (ri, i) => ri >= 2 && ri <= 4 && odd(i) ? { dr: 0.93, s: 0.88 } : undefined })
    .box(0.1, 1.45, 0.06, xf(-0.17, -0.0, 0.57), { s: 0.9, sTop: 1.1, k: goldOnRobe })
    .box(0.1, 1.45, 0.06, xf(0.17, -0.0, 0.57), { s: 0.9, sTop: 1.1, k: goldOnRobe })
    .build(), false, 'robeUpper');
  put(lower, new Builder().loft([
    { y: 0.5, rx: 0.78, rz: 0.52, s: 0.85 }, { y: 0.1, rx: 0.86, rz: 0.62, s: 0.95 },
    { y: -0.38, rx: 1.0, rz: 0.72, s: 0.85 }, { y: -0.41, rx: 1.02, rz: 0.74, s: 0.95, k: goldOnRobe }, { y: -0.5, rx: 1.02, rz: 0.74, s: 0.8, k: goldOnRobe },
  ], { top: true, bottom: true, wob: (ri, i) => ri >= 3 ? (odd(i) ? { dr: 0.84, dy: 0.14, s: 0.8 } : { s: 0.95 }) : undefined })
    .box(0.52, 0.92, 0.1, xf(0, -0.05, 0.64, -0.13, 0, 0), { s: 0.8, sTop: 1.25 })
    .box(0.4, 0.8, 0.08, xf(0.58, -0.08, 0.5, -0.1, 0.55, 0), { s: 0.7, sTop: 1.0 })
    .box(0.4, 0.8, 0.08, xf(-0.58, -0.08, 0.5, -0.1, -0.55, 0), { s: 0.7, sTop: 1.0 }).build());
  put(stripes, new Builder().box(0.7, 0.15, 0.1, undefined, { s: 0.95, sTop: 1.1, k: goldOnPale }).build());
  stripes.forEach((m) => { m.position.z += 0.1; m.position.y += 0.04; });
  put(belt, new Builder().loft([{ y: 0.13, rx: 0.76, rz: 0.46, s: 1.1 }, { y: 0, rx: 0.83, rz: 0.52, s: 0.95 }, { y: -0.13, rx: 0.76, rz: 0.46, s: 0.8 }], { top: true, bottom: true })
    .box(0.52, 0.4, 0.14, xf(0, 0, 0.55), { tx: 0.85, s: 1.1, sTop: 1.3 })
    .box(0.3, 0.3, 0.1, xf(0, 0, 0.66, 0, 0, Math.PI / 4), { tx: 0.4, tz: 0.5, s: 1.0, sTop: 1.2, k: iceOnGold })
    .box(0.085, 0.78, 0.035, xf(-0.27, -0.55, 0.72, -0.13), { s: 0.85, sTop: 1.15 })
    .box(0.085, 0.78, 0.035, xf(0.27, -0.55, 0.72, -0.13), { s: 0.85, sTop: 1.15 })
    .box(0.57, 0.085, 0.035, xf(0, -0.94, 0.774, -0.13), { s: 0.9, sTop: 1.15 }).build());

  // ---- cloak: layered back panels, gold borders, pointed hem, gold-framed ice diamond
  const gC = goldOnCloak;
  put(cape, new Builder()
    .box(2.1, 1.95, 0.08, xf(0, -1.25, 0.0, 0.04), { tx: 0.8, s: 0.85, sTop: 1.25 })
    .box(0.75, 1.8, 0.08, xf(0.92, -1.35, 0.03, 0.04, 0, -0.1), { tx: 0.55, s: 0.7, sTop: 0.95 })
    .box(0.75, 1.8, 0.08, xf(-0.92, -1.35, 0.03, 0.04, 0, 0.1), { tx: 0.55, s: 0.7, sTop: 0.95 })
    .box(1.1, 0.7, 0.09, xf(0, -2.5, -0.05, 0.04, 0, Math.PI), { tx: 0.05, s: 1.0, sTop: 0.8 })
    .box(0.09, 2.0, 0.1, xf(-1.0, -1.3, 0.0, 0.04, 0, -0.05), { s: 0.95, sTop: 1.1, k: gC })
    .box(0.09, 2.0, 0.1, xf(1.0, -1.3, 0.0, 0.04, 0, 0.05), { s: 0.95, sTop: 1.1, k: gC })
    .box(0.09, 0.85, 0.11, xf(-0.28, -2.55, -0.05, 0.04, 0, 0.62), { s: 0.95, sTop: 1.1, k: gC })
    .box(0.09, 0.85, 0.11, xf(0.28, -2.55, -0.05, 0.04, 0, -0.62), { s: 0.95, sTop: 1.1, k: gC })
    .box(1.5, 0.14, 0.11, xf(0, -0.1, -0.02), { s: 1, sTop: 1.2, k: gC })
    .box(0.62, 0.62, 0.1, xf(0, -0.7, -0.07, 0, 0, Math.PI / 4), { tx: 0.8, tz: 0.7, s: 1, sTop: 1.25, k: gC })
    .box(0.36, 0.36, 0.1, xf(0, -0.7, -0.14, 0, 0, Math.PI / 4), { tx: 0.4, tz: 0.5, s: 1.0, sTop: 1.3, k: iceOnCloak })
    .build(), true, 'cloak');

  // ---- arms: integrated faceted ice pauldron on a gold-blue foundation, flared gold cuffs
  const deepIce = ratio('68b9ed', '#2c86d6');
  const slab = (ri: number, i: number) => i % 2 === 0 ? { s: 1.0, k: paleOnLight } : { s: 0.85, k: deepIce };
  const pauldron = (s: number) => new Builder().loft([
    { y: 0.22, rx: 0.4, rz: 0.36, s: 1.1 }, { y: 0.14, rx: 0.62, rz: 0.56, s: 1.05 }, { y: 0.0, rx: 0.68, rz: 0.62, s: 0.95 },
    { y: -0.04, rx: 0.66, rz: 0.6, s: 1.0, k: goldOnLight }, { y: -0.14, rx: 0.6, rz: 0.55, s: 0.9, k: goldOnLight },
    { y: -0.16, rx: 0.52, rz: 0.48, s: 0.5 }, { y: -0.34, rx: 0.36, rz: 0.34, s: 0.5 },
  ], { top: true, bottom: true, wob: (ri, i) => ri === 2 && odd(i) ? { dr: 0.93 } : undefined })
    // three broad hexagonal ice masses rooted in the foundation, sweeping outward (bases buried in the dome)
    .loft([{ y: 0.5, rx: 0, cx: s * 0.98, cz: 0.02 }, { y: 0.2, rx: 0.36, rz: 0.3, cx: s * 0.52, s: 1 }, { y: 0.0, rx: 0.4, rz: 0.34, cx: s * 0.14, s: 0.8 }],
      { n: 6, wob: (ri, i) => ri === 1 ? slab(ri, i) : undefined })
    .loft([{ y: 0.3, rx: 0, cx: s * 0.58, cz: 0.78 }, { y: 0.12, rx: 0.28, rz: 0.26, cx: s * 0.3, cz: 0.4, s: 0.9 }, { y: -0.04, rx: 0.32, rz: 0.3, cx: s * 0.08, cz: 0.1, s: 0.7 }],
      { n: 6, wob: (ri, i) => ri === 1 ? slab(ri, i + 1) : undefined })
    .loft([{ y: 0.36, rx: 0, cx: s * 0.66, cz: -0.74 }, { y: 0.14, rx: 0.28, rz: 0.26, cx: s * 0.34, cz: -0.4, s: 0.9 }, { y: -0.04, rx: 0.32, rz: 0.3, cx: s * 0.08, cz: -0.1, s: 0.7 }],
      { n: 6, wob: (ri, i) => ri === 1 ? slab(ri, i) : undefined })
    .build();
  for (const m of pauld) put(m, pauldron(m.parent && m.parent.position.x < 0 ? -1 : 1), false, 'shoulder');
  put(sleeves, new Builder().loft([
    { y: 0.6, rx: 0.3, s: 0.9 }, { y: -0.16, rx: 0.34, s: 1 }, { y: -0.2, rx: 0.4, s: 1.0, k: goldOnRobe }, { y: -0.34, rx: 0.45, s: 1.05, k: goldOnRobe },
    { y: -0.37, rx: 0.42, s: 1.5 }, { y: -0.6, rx: 0.4, s: 1.3 },
  ], { top: true, bottom: true, wob: (ri, i) => ri === 5 && odd(i) ? { dr: 0.9, s: 1.15 } : undefined }).build());
  put(boots, new Builder()
    .box(0.84, 0.09, 1.06, xf(0, -0.105, 0.02), { s: 0.5 })
    .box(0.72, 0.24, 0.92, xf(0, 0.015, -0.02), { tx: 0.88, tz: 0.82, dz: -0.08, s: 0.9, sTop: 1.05 })
    .box(0.64, 0.1, 0.62, xf(0, 0.18, -0.16), { s: 1.2, sTop: 1.3, k: goldOnBoot }).build());

  // ---- staff: wrapped grip, gold collars and six-prong gold cradle, multi-point ice crystal
  const prongs = new Builder().loft([
    { y: 2.42, rx: 0.11, s: 0.9 }, { y: 2.16, rx: 0.13, s: 0.95 }, { y: 2.12, rx: 0.23, s: 1.1, k: goldOnWood }, { y: 1.98, rx: 0.23, s: 1.0, k: goldOnWood },
    { y: 1.94, rx: 0.13, s: 0.9 }, { y: 0.6, rx: 0.15, s: 1 }, { y: 0.56, rx: 0.22, s: 0.55, k: leather }, { y: -0.3, rx: 0.22, s: 0.5, k: leather },
    { y: -0.34, rx: 0.16, s: 1.0, k: goldOnWood }, { y: -0.4, rx: 0.14, s: 1 }, { y: -1.62, rx: 0.12, s: 0.9 },
    { y: -1.66, rx: 0.14, s: 1.0, k: goldOnWood }, { y: -1.82, rx: 0.1, s: 0.8, k: goldOnWood },
  ], { n: 6, top: true, bottom: true });
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3 + Math.PI / 6; const dx = Math.sin(a), dz = Math.cos(a);
    prongs.loft([{ y: 2.95, rx: 0, cx: dx * 0.42, cz: dz * 0.42, s: 1.3, k: goldOnWood }, { y: 2.05, rx: 0.1, cx: dx * 0.52, cz: dz * 0.52, s: 1.1, k: goldOnWood }], { n: 3, bottom: true });
  }
  put(shaft, prongs.build(), true, 'staff');
  const facet = (ri: number, i: number, hi: number, lo: number) => ({ s: (i % 2 === 0 ? hi : lo) * (ri % 2 === 0 ? 1 : 0.9) });
  const deepGem = ratio('8de8ff', '#2b8fe0');
  const icy = (ri: number, i: number) => i % 2 === 0 ? { s: 1.0, k: iceOnGem } : { s: 0.6, k: deepGem, dr: 0.88 };
  const crystal = new Builder().loft([
    { y: 1.08, rx: 0, cz: 0.04, s: 1.0 }, { y: 0.55, rx: 0.4, s: 0.95 }, { y: 0, rx: 0.62, s: 0.85 }, { y: -0.3, rx: 0.62, s: 0.7 }, { y: -0.54, rx: 0.42, s: 0.5 },
  ], { bottom: true, wob: (ri, i) => ri >= 1 && ri <= 3 ? icy(ri, i) : undefined });
  // three substantial side crystals at different heights, bases buried in the main body
  ([[0.2, 0.95, 0.3], [2.4, 0.7, 0.26], [4.3, 0.5, 0.24]] as [number, number, number][]).forEach(([a, h, r], k) => {
    const dx = Math.sin(a), dz = Math.cos(a);
    crystal.loft([
      { y: -0.1 + h, rx: 0, cx: dx * 0.9, cz: dz * 0.9, s: 1.0 },
      { y: -0.05 + h * 0.2, rx: r, cx: dx * 0.62, cz: dz * 0.62, s: 0.9 },
      { y: -0.3, rx: r * 0.9, cx: dx * 0.32, cz: dz * 0.32, s: 0.6 },
    ], { n: 6, wob: (ri, i) => ri === 1 ? icy(ri, i + k) : undefined });
  });
  put(gem, crystal.build(), false, 'crystal');
  put(gemLow, new Builder().loft([
    { y: 2.38, rx: 0.55, s: 0.6 }, { y: 2.1, rx: 0.62, s: 0.7 }, { y: 1.75, rx: 0.42, s: 0.5 }, { y: 1.35, rx: 0, s: 0.4 },
  ], { top: true, wob: (ri, i) => ri >= 1 && ri <= 2 ? { ...(ri === 1 && odd(i) ? { dr: 0.84 } : {}), ...facet(ri, i, 0.8, 0.35) } : undefined }).build(), true);
  put(shard, new Builder().box(0.18, 0.5, 0.05, xf(0, 3.0, 0.8, -0.38, 0, 0), { tx: 0.25, tz: 1, s: 0.9 }).build(), true);
  for (const mt of new Set([gem, gemLow].map((m) => m!.material as THREE.MeshLambertMaterial))) { mt.color.multiplyScalar(0.85); mt.emissiveIntensity = 0.16; mt.emissive.copy(mt.color); }
  (shard.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.25;
  void goldOnIce;

  // ---- fire variant: alt materials of refined meshes must keep vertex shading (probe once, then restore)
  const objs: THREE.Object3D[] = []; const snap: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; v: boolean }[] = [];
  base.root.traverse((o) => { objs.push(o); snap.push({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible }); });
  const orig = new Map(meshes.map((m) => [m, m.material]));
  const toned = new Set<THREE.Material>();
  base.animate({ ...IDLE, variant: 'fire' });
  meshes.forEach((m) => {
    if (m.material !== orig.get(m) && m.geometry.attributes.color) {
      const mt = m.material as THREE.MeshLambertMaterial; mt.vertexColors = true;
      if ((m === gem || m === gemLow) && !toned.has(mt)) { toned.add(mt); mt.color.multiplyScalar(0.85); mt.emissive.copy(mt.color); mt.emissiveIntensity = 0.16; }
    }
  });
  base.animate(IDLE);
  meshes.forEach((m) => { m.material = orig.get(m)!; });
  objs.forEach((o, i) => { const s = snap[i]; o.position.copy(s.p); o.quaternion.copy(s.q); o.scale.copy(s.s); o.visible = s.v; });

  const stats = { triangles: countTriangles(base.root), meshes: meshes.length,
    geometries: new Set(meshes.map((m) => m.geometry)).size, materials: base.stats.materials };
  let disposed = false;
  return {
    root: base.root, stats, animate: (p) => base.animate(p),
    dispose() {
      if (disposed) return; disposed = true;
      owned.forEach((g) => g.dispose()); base.dispose();
    },
  };
}
