import * as THREE from 'three';
import { createCharacterModel } from '../characterModel';
import type { CharacterModel } from '../modelKit';
import { countTriangles } from '../../warrior3d/warriorModel';
import { Builder, xf, ratio, type Ring, type RGB } from '../magePremiumGeometry';
import { merge, prism, sheet } from './meleeKit';

/**
 * Premium melee roster (Warrior / Paladin / Rogue). Each model is the real base createCharacterModel()
 * refined in place: same root, rig groups, materials, animate. Meshes are located by traversal order
 * (frozen base build), their geometry swapped for closed indexed vertex-shaded forms (RGB multipliers
 * over each host material) so gold/leather/cloth/metal separate without new meshes or materials.
 */
export type MeleeId = 'warrior' | 'paladin' | 'rogue';
type Mesh = THREE.Mesh;
const odd = (i: number) => i % 2 === 1;
const P2 = Math.PI / 2;

interface Ctx {
  base: CharacterModel; meshes: Mesh[]; owned: THREE.BufferGeometry[];
  put: (ms: Mesh | Mesh[], g: THREE.BufferGeometry, keep?: boolean) => void;
  at: (...i: number[]) => Mesh[];
}

function prepare(id: MeleeId, expect: number): Ctx {
  const base = createCharacterModel(id);
  const meshes: Mesh[] = [];
  base.root.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
  if (meshes.length !== expect) throw new Error(`premium ${id}: base mesh layout changed (${meshes.length} != ${expect})`);
  const owned: THREE.BufferGeometry[] = [];
  const put: Ctx['put'] = (ms, g, keep = false) => {
    owned.push(g);
    for (const m of ([] as Mesh[]).concat(ms)) {
      m.geometry = g;
      if (!keep) { m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); }
      (m.material as THREE.MeshLambertMaterial).vertexColors = true;
    }
  };
  return { base, meshes, owned, put, at: (...i) => i.map((k) => meshes[k]) };
}

const EMPTY_KEY = 'premiumEmpty';
/** Bake static same-parent same-material meshes into one anchor mesh; the rest stay as hidden empty rig nodes. */
function consolidate(c: Ctx, _joints: Set<THREE.Object3D>) {
  const empty = new THREE.BufferGeometry(); empty.setAttribute('position', new THREE.Float32BufferAttribute([], 3)); empty.userData[EMPTY_KEY] = true;
  c.owned.push(empty);
  const groups = new Map<string, Mesh[]>(); const ids = new Map<object, number>();
  const id = (o: object) => { if (!ids.has(o)) ids.set(o, ids.size); return ids.get(o)!; };
  for (const m of c.meshes) {
    if (m.userData.noMerge) continue;
    const key = id(m.parent!) + ':' + id(m.material);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  }
  const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const P: number[] = [], N: number[] = [], C: number[] = [], I: number[] = [];
    const hasC = !!list[0].geometry.attributes.color;
    for (const m of list) {
      const g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
      m.updateMatrix(); _m.copy(m.matrix); _n.getNormalMatrix(_m);
      const off = P.length / 3;
      for (let i = 0; i < pos.count; i++) {
        _p.fromBufferAttribute(pos, i).applyMatrix4(_m); P.push(_p.x, _p.y, _p.z);
        _q.fromBufferAttribute(nor, i).applyMatrix3(_n).normalize(); N.push(_q.x, _q.y, _q.z);
        if (hasC) C.push(col.getX(i), col.getY(i), col.getZ(i));
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + off);
      else for (let i = 0; i < pos.count; i++) I.push(off + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (hasC) g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(I); g.computeBoundingBox(); g.computeBoundingSphere(); c.owned.push(g);
    const a = list[0]; a.geometry = g; a.position.set(0, 0, 0); a.quaternion.identity(); a.scale.set(1, 1, 1);
    for (const m of list.slice(1)) { m.geometry = empty; m.visible = false; }
  }
}

/** Any material that now uses vertex colour must find a colour attribute on every mesh that shares it. */
function finish(c: Ctx, joints: { body: THREE.Object3D; torso: THREE.Object3D; head: THREE.Object3D; cape: THREE.Object3D }): CharacterModel {
  const white = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  for (const m of c.meshes) {
    const mt = m.material as THREE.MeshLambertMaterial;
    if (!mt.vertexColors || m.geometry.attributes.color) continue;
    let g = white.get(m.geometry);
    if (!g) {
      g = m.geometry.clone();
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      white.set(m.geometry, g); c.owned.push(g);
    }
    m.geometry = g;
  }
  if (!(globalThis as { __noMerge?: boolean }).__noMerge) consolidate(c, new Set([joints.body, joints.torso]));
  const j = joints; j.body.userData.premiumJoint = 'body'; j.torso.userData.premiumJoint = 'torso';
  j.head.userData.premiumJoint = 'head'; j.cape.userData.premiumJoint = 'cape';
  const ms = c.meshes.filter((m) => m.visible);
  const stats = { triangles: countTriangles(c.base.root), meshes: ms.length,
    geometries: new Set(ms.map((m) => m.geometry)).size, materials: c.base.stats.materials };
  let disposed = false;
  return {
    root: c.base.root, stats, animate: (p) => c.base.animate(p),
    dispose() { if (disposed) return; disposed = true; c.owned.forEach((g) => g.dispose()); c.base.dispose(); },
  };
}

const B = () => new Builder();
class B6 extends Builder { loft(r: Ring[], o: Parameters<Builder['loft']>[1] = {}) { return super.loft(r, { n: 6, ...o }); } }
type Wob = NonNullable<Parameters<Builder['loft']>[1]>['wob'];
const front = (i: number, n = 8) => i === 0 || i === 1 || i === n - 1;

/** Shared sculpted face parts (head sphere replacement, nose, eyes): head-local coordinates, radius ~0.6. */
function faceGeos(rx: number, ry: number) {
  const k = ry / 0.66, w = rx / 0.6;
  const warm = ratio('d7a078', '#e6a982'), shade = ratio('d7a078', '#a9714f');
  const head = B().loft([
    { y: 0.62 * k, rx: 0.2 * w, s: 0.95 }, { y: 0.36 * k, rx: 0.52 * w, s: 1.02 }, { y: 0.0, rx: 0.61 * w, s: 1.04 },
    { y: -0.3 * k, rx: 0.54 * w, cz: 0.03, s: 0.97 }, { y: -0.5 * k, rx: 0.38 * w, cz: 0.07, s: 0.92 }, { y: -0.67 * k, rx: 0.17 * w, cz: 0.09, s: 0.86 },
  ], { top: true, bottom: true, wob: (ri, i) => {
    if (ri === 1 && (i === 0 || i === 1 || i === 7)) return { dr: 1.08, s: 0.8, k: shade };
    if (ri === 2 && (i === 1 || i === 7)) return { dr: 1.05, s: 1.08, k: warm };
    if (ri === 3 && i === 0) return { dr: 0.95 };
    return undefined;
  } }).build();
  const nose = B().loft([
    { y: 0.08, rx: 0.04, rz: 0.05, cz: 0.6, s: 0.95 }, { y: -0.02, rx: 0.08, rz: 0.1, cz: 0.64, s: 1.05, k: warm },
    { y: -0.14, rx: 0.1, rz: 0.12, cz: 0.66, s: 1, k: warm }, { y: -0.2, rx: 0.05, rz: 0.06, cz: 0.65, s: 0.7 },
  ], { n: 4, top: true, bottom: true }).build();
  const eye = (sx: number, y: number) => B().loft([
    { y: y + 0.07, rx: 0, cx: sx * 0.22, cz: 0.585 }, { y, rx: 0.11, rz: 0.05, cx: sx * 0.22, cz: 0.585, s: 1 }, { y: y - 0.07, rx: 0, cx: sx * 0.22, cz: 0.585 },
  ], { n: 6 }).build();
  return { head, nose, eye };
}

/** Faceted gauntlet / glove fist, hand-local. */
const fist = (cuff: RGB, tip: RGB | undefined, r = 0.22) => new B6().loft([
  { y: 0.3, rx: r * 0.95, s: 1, k: cuff }, { y: 0.14, rx: r * 1.02, s: 1.1, k: cuff }, { y: 0.08, rx: r * 1.12, s: 0.95, k: tip },
  { y: -0.08, rx: r * 1.18, rz: r * 1.1, cz: 0.02, s: 1.05, k: tip }, { y: -0.2, rx: r * 0.8, cz: 0.03, s: 0.85, k: tip },
], { top: true, bottom: true, wob: (ri, i) => (ri === 3 && i === 0 ? { dr: 1.12, s: 1.15 } : ri === 3 && odd(i) ? { dr: 0.94 } : undefined) }).build();

/* ================================ PALADIN ================================ */
function paladin(): CharacterModel {
  const c = prepare('paladin', 43); const { put, at } = c;
  const GOLD = '#d6a83f';
  const gOnNavy = ratio('2b3a5c', GOLD), gOnBlue = ratio('35558a', GOLD), gOnSkin = ratio('d7a078', '#d6a83f');
  const gOnHelm = ratio('d8b34f', '#f1d37a'), navyOnHelm = ratio('d8b34f', '#2f4c86');
  const creamOnGold = ratio('d6a83f', '#f5e8b2'), navyOnGold = ratio('d6a83f', '#2f4a82'), deepOnGold = ratio('d6a83f', '#a47e2c');
  const leatherOnGold = ratio('d6a83f', '#4a2e1a'), leatherOnWood = ratio('6d4829', '#3a2616'), gOnWood = ratio('6d4829', GOLD);
  const goldOnBoot = ratio('24262d', '#c9a23c');
  const navyOnCape = ratio('1f2f52', '#2c58a6'), gOnCape = ratio('1f2f52', GOLD);

  // legs (shared pair geometry): cuisse with gold band, knee cop + front greave, cuffed boots
  put(at(0, 3), new B6().loft([{ y: 0, rx: 0.4, s: 0.85 }, { y: -0.1, rx: 0.44, s: 1, k: gOnNavy }, { y: -0.16, rx: 0.43, s: 0.9 },
    { y: -0.5, rx: 0.37, s: 0.95 }, { y: -0.82, rx: 0.33, s: 0.82 }], { top: true, bottom: true, wob: (ri, i) => ri >= 2 && odd(i) ? { dr: 0.95 } : undefined }).build());
  put(at(1, 4), new B6().loft([{ y: 0.1, rx: 0.3, s: 0.9 }, { y: 0.04, rx: 0.37, s: 1.1, k: gOnNavy }, { y: -0.12, rx: 0.34, s: 1, k: gOnNavy },
    { y: -0.18, rx: 0.3, s: 0.9 }, { y: -0.5, rx: 0.27, s: 0.95 }, { y: -0.75, rx: 0.27, s: 0.8 }], { top: true, bottom: true })
    .box(0.3, 0.55, 0.12, xf(0, -0.42, 0.26), { tx: 0.8, s: 1, sTop: 1.15, k: gOnNavy }).build());
  put(at(2, 5), new B6()
    .box(0.62, 0.1, 1.08, xf(0, -0.74, 0.16), { s: 0.55 })
    .box(0.56, 0.3, 0.78, xf(0, -0.55, 0.06), { tx: 0.88, tz: 0.85, s: 0.9, sTop: 1.05 })
    .box(0.46, 0.18, 0.42, xf(0, -0.64, 0.52), { tx: 0.8, tz: 0.7, s: 1.1, sTop: 1.2 })
    .loft([{ y: -0.4, rx: 0.3, s: 1.1, k: goldOnBoot }, { y: -0.5, rx: 0.3, s: 0.9, k: goldOnBoot }], { top: true, bottom: true }).build());

  // torso cuirass: keeled breastplate with gold banding
  put(at(6)[0], B().loft([
    { y: 1.76, rx: 0.72, rz: 0.4, s: 0.8 }, { y: 1.62, rx: 1.0, rz: 0.55, s: 1.1 }, { y: 1.32, rx: 1.04, rz: 0.6, s: 1.1 },
    { y: 0.92, rx: 0.86, rz: 0.52, s: 0.95 }, { y: 0.5, rx: 0.8, rz: 0.5, s: 0.9 }, { y: 0.2, rx: 0.88, rz: 0.55, s: 0.78 },
  ], { top: true, bottom: true, wob: (ri, i) => {
    if (ri >= 1 && ri <= 3 && i === 0) return { dr: 1.1, s: 1.15 };
    if (ri >= 1 && ri <= 3 && odd(i)) return { dr: 0.95, s: 0.9 };
    return undefined;
  } }).build());
  put(at(7)[0], B().loft([{ y: 0.12, rx: 0.9, rz: 0.58, s: 1.05 }, { y: 0, rx: 0.94, rz: 0.62, s: 0.9 }, { y: -0.12, rx: 0.9, rz: 0.58, s: 0.75 }],
    { top: true, bottom: true, wob: (ri, i) => ri === 1 && odd(i) ? { dr: 0.97 } : undefined }).build());
  put(at(8)[0], B().loft([{ y: 0.2, rx: 0.22, s: 0.9 }, { y: -0.14, rx: 0.25, s: 0.8 }], { top: true, bottom: true })
    .loft([{ y: 0.05, rx: 0.42, s: 1.15, k: gOnSkin }, { y: -0.14, rx: 0.46, rz: 0.4, s: 0.95, k: gOnSkin }, { y: -0.26, rx: 0.5, rz: 0.4, s: 0.8, k: gOnSkin }], { top: true, bottom: true }).build());
  // gold-and-navy tabard skirt: flared faceted skirt (navy host) with gold hem
  put(at(9)[0], B().loft([
    { y: 0.28, rx: 0.78, rz: 0.55, s: 0.85 }, { y: -0.1, rx: 0.9, rz: 0.7, s: 0.95 },
    { y: -0.74, rx: 1.12, rz: 0.88, s: 0.85 }, { y: -0.78, rx: 1.15, rz: 0.9, s: 1, k: gOnNavy }, { y: -0.88, rx: 1.15, rz: 0.9, s: 0.8, k: gOnNavy },
  ], { top: true, bottom: true, wob: (ri, i) => ri >= 3 ? (odd(i) ? { dr: 0.88, dy: 0.12, s: 0.8 } : { s: 0.95 }) : undefined })
    .box(0.62, 0.95, 0.1, xf(0, -0.35, 0.82, -0.14), { s: 0.9, sTop: 1.15, k: ratio('2b3a5c', '#2d56a0') }).build());

  // shoulders: layered pauldron (shared) - blue dome, gold lame bands, gold rim
  const pauld = B().loft([
    { y: 0.34, rx: 0.3, rz: 0.26, s: 1.1 }, { y: 0.26, rx: 0.5, rz: 0.44, s: 1.15 }, { y: 0.08, rx: 0.56, rz: 0.5, s: 1 },
    { y: 0.02, rx: 0.6, rz: 0.54, s: 1, k: gOnBlue }, { y: -0.06, rx: 0.56, rz: 0.5, s: 0.85 }, { y: -0.12, rx: 0.5, rz: 0.46, s: 0.95, k: gOnBlue }, { y: -0.2, rx: 0.4, rz: 0.36, s: 0.7 },
  ], { top: true, bottom: true, wob: (ri, i) => ri >= 1 && ri <= 2 && odd(i) ? { dr: 0.93, s: 0.9 } : undefined })
    .box(0.12, 0.34, 0.56, xf(0, 0.38, 0, 0, 0, 0), { tx: 0.5, s: 1, sTop: 1.25, k: gOnBlue }).build();
  put(at(10, 18), pauld);
  const rim = (sx: number) => B().loft([{ y: 0.12, rx: 0.34, rz: 0.3, cx: sx * 1.37, cy: 0 as never, s: 1 } as Ring,
  ], {}).build();
  void rim;
  const mantle = (sx: number) => B().loft([
    { y: 1.78, rx: 0.3, rz: 0.26, cx: sx * 1.34, cz: 0, s: 1.1 }, { y: 1.7, rx: 0.5, rz: 0.46, cx: sx * 1.37, s: 1 },
    { y: 1.58, rx: 0.54, rz: 0.5, cx: sx * 1.37, s: 0.8, k: creamOnGold }, { y: 1.52, rx: 0.5, rz: 0.46, cx: sx * 1.37, s: 0.7 },
  ], { top: true, bottom: true, wob: (ri, i) => odd(i) && ri < 2 ? { dr: 0.92 } : undefined }).build();
  put(at(37)[0], mantle(-1)); put(at(39)[0], mantle(1));
  // armour sleeves: gold vambraces with blue bands + flared gauntlet cuff
  put(at(11, 19), new B6().loft([{ y: 0.2, rx: 0.24, s: 0.9 }, { y: 0.1, rx: 0.27, s: 1.05 }, { y: -0.2, rx: 0.23, s: 0.95 },
    { y: -0.3, rx: 0.26, s: 1, k: navyOnGold }, { y: -0.6, rx: 0.22, s: 0.9 }], { top: true, bottom: true }).build());
  put(at(12, 20), new B6().loft([{ y: 0.05, rx: 0.2, s: 0.9 }, { y: -0.05, rx: 0.26, s: 1.1, k: deepOnGold }, { y: -0.2, rx: 0.22, s: 0.95 },
    { y: -0.55, rx: 0.2, s: 0.9 }, { y: -0.7, rx: 0.3, s: 1.1, k: creamOnGold }, { y: -0.85, rx: 0.28, s: 0.9, k: creamOnGold }],
  { top: true, bottom: true, wob: (ri, i) => ri >= 4 && odd(i) ? { dr: 0.92 } : undefined }).build());
  put(at(13, 21), fist(ratio('d7a078', '#d6a83f'), undefined, 0.22));

  // shield: strapped to the forearm, face turned out and forward, correct rim/boss/cross
  const N = new THREE.Vector3(0.55, -0.83, 0).normalize(), U = new THREE.Vector3(0, 0, 1), X = new THREE.Vector3().crossVectors(U, N);
  const sm = new THREE.Matrix4().makeBasis(X, U, N).setPosition(0.27, -0.6, 0);
  const sp: [number, number][] = [[-0.56, 0.72], [-0.56, -0.02], [0, -0.88], [0.56, -0.02], [0.56, 0.72], [0, 0.82]];
  const sp2: [number, number][] = sp.map(([x, y]) => [x * 0.8, y * 0.82 - 0.0]);
  at(14, 15, 16, 17).forEach((m) => { m.parent!.position.set(0, 0, 0); m.parent!.rotation.set(0, 0, 0); });
  put(at(14)[0], merge([
    prism(sp, 0, 0.1, { inset: 0.04, s: 0.95, sTop: 1.05, m: sm }),
    prism([[-0.12, 0.2], [0, 0.34], [0.12, 0.2], [0, 0.06]], 0.2, 0.3, { inset: 0.4, s: 1.2, m: sm }),
    B().box(0.14, 0.7, 0.16, xf(-0.2, 0.05, -0.1), { s: 0.7, k: leatherOnGold, m: undefined } as never).build(),
  ].map((g, i) => (i === 2 ? (g.applyMatrix4(sm), g) : g))));
  put(at(15)[0], prism(sp2, 0.08, 0.2, { inset: 0.12, s: 0.9, sTop: 1.1, m: sm }));
  put(at(16)[0], B().box(0.14, 1.2, 0.06, xf(0, 0.0, 0.22), { tx: 0.7, s: 1, sTop: 1.2 }).build().applyMatrix4(sm));
  put(at(17)[0], B().box(0.78, 0.14, 0.06, xf(0, 0.38, 0.22), { s: 1, sTop: 1.2 }).build().applyMatrix4(sm));

  // helmet: faceted gold dome with navy comb, brow band, nasal bar, hinged cheek guards, cream crest
  const face = faceGeos(0.6, 0.66);
  put(at(25)[0], face.head); put(at(28)[0], face.nose);
  put(at(26)[0], face.eye(-1, 0.04)); put(at(27)[0], face.eye(1, 0.04));
  put(at(30)[0], B().loft([
    { y: 0.92, rx: 0.14, s: 1.1 }, { y: 0.8, rx: 0.5, rz: 0.48, s: 1.15 }, { y: 0.5, rx: 0.74, rz: 0.72, cz: -0.03, s: 1.05 },
    { y: 0.22, rx: 0.8, rz: 0.78, cz: -0.03, s: 0.95 }, { y: -0.04, rx: 0.78, rz: 0.76, cz: -0.04, s: 0.8 },
  ], { top: true, wob: (ri, i) => ri >= 1 && ri <= 3 ? (i === 2 || i === 6 ? { dr: 1.02, k: gOnHelm, s: 1.05 } : odd(i) ? { dr: 0.95, s: 0.9 } : undefined) : undefined }).build());
  put(at(31)[0], B().box(0.9, 0.16, 0.26, xf(0, 0.38, 0.6), { s: 1, sTop: 1.2, k: gOnHelm })
    .box(0.24, 0.1, 0.2, xf(0, 0.52, 0.66), { s: 1, sTop: 1.2, k: navyOnHelm }).build());
  put(at(32)[0], B().box(0.1, 0.55, 0.08, xf(0, 0.1, 0.7), { tx: 0.6, s: 1, sTop: 1.2, k: gOnHelm })
    .box(0.18, 0.1, 0.1, xf(0, -0.16, 0.7), { s: 1, sTop: 1.1 }).build());
  const cheek = (sx: number) => B().loft([
    { y: 0.18, rx: 0.1, rz: 0.36, cx: sx * 0.6, cz: 0.04, s: 1.1 }, { y: -0.1, rx: 0.12, rz: 0.4, cx: sx * 0.62, cz: 0.08, s: 0.95 },
    { y: -0.4, rx: 0.1, rz: 0.3, cx: sx * 0.56, cz: 0.2, s: 0.85, k: gOnHelm }, { y: -0.5, rx: 0, cx: sx * 0.5, cz: 0.3 },
  ], { n: 6, top: true }).build();
  put(at(33)[0], cheek(-1)); put(at(34)[0], cheek(1));
  put(at(35)[0], B().loft([
    { y: 0.56, rx: 0.06, rz: 0.1, cz: 0.2, s: 1 }, { y: 0.9, rx: 0.08, rz: 0.55, cz: -0.1, s: 1.1 },
    { y: 0.84, rx: 0.08, rz: 0.7, cz: -0.3, s: 1 }, { y: 0.4, rx: 0.07, rz: 0.4, cz: -0.62, s: 0.85 },
  ], { n: 4, top: true, bottom: true }).build());

  // belt emblem + chevrons
  put(at(41)[0], B().loft([{ y: 0.08, rx: 0.26, s: 1.1 }, { y: 0, rx: 0.3, s: 1.2 }, { y: -0.08, rx: 0.2, s: 0.9 }], { n: 8, top: true, bottom: true, m: xf(0, 0.3, 0.52, P2, 0, 0) })
    .loft([{ y: 0.12, rx: 0.1, s: 1.3, k: creamOnGold }, { y: 0, rx: 0.14, s: 1.2, k: creamOnGold }], { n: 6, top: true, bottom: true, m: xf(0, 0.3, 0.52, P2, 0, 0) }).build());
  put(at(36)[0], B().box(0.76, 0.12, 0.08, xf(-0.3, 1.5, 0.45, 0, 0, 0.6), { tx: 0.9, s: 1, sTop: 1.15 }).build());
  put(at(38)[0], B().box(0.76, 0.12, 0.08, xf(0.3, 1.5, 0.45, 0, 0, -0.6), { tx: 0.9, s: 1, sTop: 1.15 }).build());
  put(at(40)[0], merge([
    prism([[-0.28, 0.5], [-0.28, -0.4], [0, -0.78], [0.28, -0.4], [0.28, 0.5]], 0.5, 0.58, { inset: 0.1, s: 0.95, sTop: 1.1, m: xf(0, 0.95, 0), k: ratio('f5e8b2', '#2d4f90') }),
    B().box(0.5, 0.1, 0.06, xf(0, 1.4, 0.6), { s: 1.05, sTop: 1.2 }).build(),
  ]));

  // cloak: folded blue sheet with gold edge, pointed hem
  const cols = 6;
  put(at(42)[0], merge([sheet(4, cols, (r, j) => {
    const t = r / 4, u = j / cols - 0.5, w = 0.95 + 0.2 * t, edge = j === 0 || j === cols || r === 4;
    const hem = r === 4 ? -0.2 * (1 - Math.abs(u) * 2) - (odd(j) ? 0.1 : 0) : 0;
    return { x: u * 2 * w, y: -2.4 * t + hem, z: Math.sin(j * 1.3) * 0.06 * t - 0.06 * t, s: odd(j) ? 0.88 : 1.06, k: edge ? gOnCape : navyOnCape };
  }, 0.06), B().loft([{ y: 0.14, rx: 0.5, rz: 0.2, s: 1 }, { y: 0.0, rx: 0.8, rz: 0.26, s: 0.9 }, { y: -0.16, rx: 0.98, rz: 0.3, s: 0.8 }], { top: true, bottom: true }).build()]));

  // hammer: short shaft, compact head, gripped by the right hand
  const hm = at(22)[0].parent!; hm.position.set(0, -0.05, 0.02);
  put(at(22)[0], B().loft([
    { y: 1.55, rx: 0.1, s: 1 }, { y: 1.3, rx: 0.12, s: 0.9 }, { y: 1.24, rx: 0.19, s: 1.1, k: gOnWood }, { y: 1.1, rx: 0.19, s: 0.95, k: gOnWood },
    { y: 1.06, rx: 0.12, s: 0.9 }, { y: 0.5, rx: 0.12, s: 1 }, { y: 0.46, rx: 0.16, s: 0.55, k: leatherOnWood }, { y: -0.34, rx: 0.16, s: 0.5, k: leatherOnWood },
    { y: -0.38, rx: 0.2, s: 1, k: gOnWood }, { y: -0.56, rx: 0.15, s: 0.9, k: gOnWood },
  ], { n: 6, top: true, bottom: true }).build());
  put(at(23)[0], B().box(0.5, 0.52, 0.86, xf(0, 0.88, 0), { tx: 0.92, tz: 0.82, s: 0.9, sTop: 1.1 })
    .box(0.58, 0.6, 0.14, xf(0, 0.88, 0.48), { tx: 0.9, s: 0.7, sTop: 0.8, k: deepOnGold })
    .box(0.58, 0.6, 0.14, xf(0, 0.88, -0.48), { tx: 0.9, s: 0.7, sTop: 0.8, k: deepOnGold })
    .loft([{ y: 1.4, rx: 0, s: 1.2 }, { y: 1.15, rx: 0.14, s: 1 }, { y: 1.0, rx: 0.18, s: 0.9 }], { n: 4, bottom: true }).build());
  put(at(24)[0], B().box(0.54, 0.1, 0.9, xf(0, 0.88, 0), { s: 1, sTop: 1.15 })
    .box(0.1, 0.5, 0.72, xf(0, 0.88, 0), { s: 1, sTop: 1.1 }).build());

  const body = c.base.root.children[0], torso = body.children[2];
  return finish(c, { body, torso, head: at(25)[0].parent!, cape: at(42)[0].parent! });
}

/* ================================ ROGUE ================================ */
function rogue(): CharacterModel {
  const c = prepare('rogue', 34); const { put, at } = c;
  const steel = '#9aa3ae';
  const redOnHood = ratio('3a1821', '#8e2230'), redDeep = ratio('3a1821', '#611b27'), leather = ratio('3a1821', '#523022');
  const steelOnCloth = ratio('3a1821', steel), steelOnRed = ratio('a92c38', steel), darkOnRed = ratio('a92c38', '#6e1c27');
  const steelOnDark = ratio('2a1219', '#7d8590'), steelOnBoot = ratio('24262d', '#8a929c'), steelOnBelt = ratio('15151b', steel);
  const leatherOnBelt = ratio('15151b', '#4a2c20'), redOnCloak = ratio('2a1219', '#7e202e'), redTrim = ratio('2a1219', '#b2303d');
  const glove = ratio('d7a078', '#2a1a1c'), gloveTrim = ratio('d7a078', '#6a3a2a');
  const leatherOnLeather = ratio('4b2c20', '#2d1a14'), steelOnLeather = ratio('4b2c20', steel);

  // legs: wrapped trousers, buckled boots with steel toe + cuff
  put(at(0, 3), new B6().loft([{ y: 0, rx: 0.34, s: 0.85 }, { y: -0.08, rx: 0.37, s: 1 }, { y: -0.45, rx: 0.3, s: 0.92 }, { y: -0.8, rx: 0.27, s: 0.82 }, { y: -0.85, rx: 0.24, s: 0.7 }],
    { top: true, bottom: true, wob: (ri, i) => ri >= 1 && odd(i) ? { dr: 0.94 } : undefined }).build());
  put(at(1, 4), new B6().loft([{ y: 0.08, rx: 0.24, s: 0.9 }, { y: -0.05, rx: 0.28, s: 1.05 }, { y: -0.5, rx: 0.23, s: 0.9 }, { y: -0.75, rx: 0.22, s: 0.8 }], { top: true, bottom: true })
    .box(0.12, 0.5, 0.1, xf(0, -0.3, 0.22), { s: 1, sTop: 1.15, k: steelOnDark }).build());
  put(at(2, 5), new B6()
    .box(0.62, 0.1, 1.08, xf(0, -0.74, 0.16), { s: 0.5 })
    .box(0.54, 0.34, 0.78, xf(0, -0.54, 0.04), { tx: 0.85, tz: 0.85, s: 0.9, sTop: 1.05 })
    .box(0.42, 0.18, 0.4, xf(0, -0.64, 0.52), { tx: 0.8, tz: 0.7, s: 1.1, sTop: 1.2, k: steelOnBoot })
    .loft([{ y: -0.34, rx: 0.3, s: 1.15 }, { y: -0.46, rx: 0.3, s: 0.9 }], { top: true, bottom: true })
    .box(0.4, 0.07, 0.06, xf(0, -0.48, 0.3), { s: 1, sTop: 1.2, k: steelOnBoot }).build());

  // layered leather torso: jerkin with chest ridge, steel-buckled bandolier
  put(at(6)[0], merge([B().loft([
    { y: 1.76, rx: 0.5, rz: 0.3, s: 0.75 }, { y: 1.6, rx: 0.8, rz: 0.46, s: 1.1 }, { y: 1.3, rx: 0.82, rz: 0.5, s: 1.08 },
    { y: 0.9, rx: 0.66, rz: 0.4, s: 0.95 }, { y: 0.5, rx: 0.62, rz: 0.4, s: 0.9 }, { y: 0.2, rx: 0.7, rz: 0.44, s: 0.78 },
  ], { top: true, bottom: true, wob: (ri, i) => {
    if (ri >= 1 && ri <= 3 && i === 0) return { dr: 1.06, s: 1.12 };
    if (ri >= 1 && ri <= 4 && odd(i)) return { dr: 0.95, s: 0.9 };
    return undefined;
  } })
    .loft([{ y: 0.12, rx: 0.72, rz: 0.48, s: 1.0, k: leather }, { y: -0.2, rx: 0.78, rz: 0.52, s: 0.8, k: leather }], { top: true, bottom: true }).build(),
  B().box(0.2, 1.7, 0.1, xf(0.1, 0.95, 0.46, 0, 0, -0.62), { s: 0.9, sTop: 1.1, k: leather })
    .box(0.18, 0.2, 0.12, xf(0.06, 1.0, 0.52, 0, 0, -0.62), { s: 1, sTop: 1.25, k: steelOnCloth }).build()]));
  put(at(7)[0], B().loft([{ y: 0.12, rx: 0.78, rz: 0.52, s: 1.05, k: leatherOnBelt }, { y: 0, rx: 0.82, rz: 0.56, s: 0.9, k: leatherOnBelt }, { y: -0.12, rx: 0.78, rz: 0.52, s: 0.75, k: leatherOnBelt }],
    { top: true, bottom: true })
    .box(0.3, 0.26, 0.1, xf(0, 0, 0.56), { s: 1.1, sTop: 1.3, k: steelOnBelt })
    .box(0.12, 0.14, 0.12, xf(0, 0, 0.6), { s: 0.7, sTop: 0.8 }).build());
  put(at(8)[0], B().loft([{ y: 0.22, rx: 0.22, s: 0.9 }, { y: -0.2, rx: 0.26, s: 0.8 }], { top: true, bottom: true })
    .loft([{ y: -0.1, rx: 0.4, rz: 0.36, s: 1.1, k: ratio('d7a078', '#6a1c28') }, { y: -0.3, rx: 0.5, rz: 0.4, s: 0.9, k: ratio('d7a078', '#6a1c28') }], { top: true, bottom: true }).build());
  // red crossed collar flaps, sash, pouch
  put(at(29)[0], B().box(0.7, 0.12, 0.06, xf(-0.28, 1.55, 0.4, 0, 0, 0.6), { tx: 0.85, s: 1, sTop: 1.2 }).build());
  put(at(30)[0], B().box(0.7, 0.12, 0.06, xf(0.28, 1.55, 0.4, 0, 0, -0.6), { tx: 0.85, s: 1, sTop: 1.2 }).build());
  put(at(31)[0], merge([prism([[-0.2, 0.55], [-0.2, -0.45], [0, -0.7], [0.2, -0.45], [0.2, 0.55]], 0, 0.06, { inset: 0.1, s: 1, sTop: 1.12, m: xf(-0.5, 0.1, 0.45, 0, 0, 0.12) }),
    B().box(0.26, 0.12, 0.1, xf(-0.5, 0.58, 0.46, 0, 0, 0.12), { s: 1, sTop: 1.2, k: steelOnRed }).build()]));
  put(at(32)[0], B().box(0.34, 0.3, 0.26, xf(0.66, 0.2, 0.1), { tx: 0.9, tz: 0.9, s: 0.85, sTop: 1.05 })
    .box(0.36, 0.14, 0.28, xf(0.66, 0.34, 0.1), { s: 1, sTop: 1.2, k: leatherOnLeather })
    .box(0.08, 0.1, 0.06, xf(0.66, 0.34, 0.26), { s: 1, sTop: 1.3, k: steelOnLeather }).build());

  // shoulders: layered red lames with steel rim, studded
  put(at(9, 16), B().loft([
    { y: 0.3, rx: 0.26, rz: 0.22, s: 1.1 }, { y: 0.22, rx: 0.46, rz: 0.4, s: 1.15 }, { y: 0.04, rx: 0.5, rz: 0.44, s: 1 },
    { y: -0.0, rx: 0.52, rz: 0.46, s: 0.9, k: steelOnRed }, { y: -0.06, rx: 0.5, rz: 0.44, s: 0.85, k: darkOnRed }, { y: -0.18, rx: 0.44, rz: 0.4, s: 1, k: darkOnRed },
    { y: -0.2, rx: 0.36, rz: 0.32, s: 0.7 },
  ], { top: true, bottom: true, wob: (ri, i) => ri <= 2 && odd(i) ? { dr: 0.92, s: 0.9 } : undefined }).build());
  put(at(10, 17), new B6().loft([{ y: 0.2, rx: 0.22, s: 0.9 }, { y: 0.08, rx: 0.26, s: 1.05 }, { y: -0.3, rx: 0.2, s: 0.95 }, { y: -0.34, rx: 0.23, s: 0.8, k: leather }, { y: -0.6, rx: 0.19, s: 0.9 }], { top: true, bottom: true }).build());
  put(at(11, 18), new B6().loft([{ y: 0.05, rx: 0.19, s: 0.9 }, { y: -0.1, rx: 0.2, s: 1 }, { y: -0.2, rx: 0.23, s: 1.05, k: steelOnCloth }, { y: -0.55, rx: 0.2, s: 0.9, k: steelOnCloth },
    { y: -0.72, rx: 0.26, s: 1.1, k: steelOnCloth }, { y: -0.85, rx: 0.22, s: 0.9, k: leather }], { top: true, bottom: true, wob: (ri, i) => ri >= 4 && odd(i) ? { dr: 0.92 } : undefined }).build());
  put(at(12, 19), fist(glove, gloveTrim, 0.22));

  // daggers: BOTH forward grip, blade along the forearm, identical orientation
  for (const [h, g] of [[13, 14], [20, 21]] as [number, number][]) {
    const grp = at(h)[0].parent!;
    grp.rotation.set(Math.PI - 0.12, 0, h === 13 ? 0.08 : -0.08); grp.position.set(0, 0, 0);
    void g;
  }
  const hilt = (m: Mesh) => m;
  put(hilt(at(13, 20)[0]), B().loft([
    { y: 0.36, rx: 0.1, s: 0.9 }, { y: 0.3, rx: 0.12, s: 1.1, k: steelOnLeather }, { y: 0.2, rx: 0.09, s: 1 }, { y: 0.0, rx: 0.1, s: 0.8 },
    { y: -0.2, rx: 0.09, s: 1 }, { y: -0.32, rx: 0.13, s: 1.1, k: steelOnLeather }, { y: -0.44, rx: 0.07, s: 0.9 },
  ], { n: 6, top: true, bottom: true, wob: (ri, i) => ri >= 2 && ri <= 4 && odd(i) ? { dr: 0.9, s: 0.8 } : undefined }).build());
  c.meshes[20].geometry = c.meshes[13].geometry;
  put(at(14, 21), B().box(0.62, 0.1, 0.18, xf(0, 0.38, 0), { tx: 0.9, s: 1, sTop: 1.2, k: steelOnBelt })
    .box(0.14, 0.14, 0.2, xf(0.34, 0.4, 0, 0, 0, -0.5), { s: 1, sTop: 1.3, k: steelOnBelt })
    .box(0.14, 0.14, 0.2, xf(-0.34, 0.4, 0, 0, 0, 0.5), { s: 1, sTop: 1.3, k: steelOnBelt }).build());
  put(at(15, 22), B().loft([
    { y: 1.6, rx: 0, s: 1.1 }, { y: 1.3, rx: 0.2, rz: 0.05, s: 1 }, { y: 0.7, rx: 0.3, rz: 0.07, s: 0.95 }, { y: 0.4, rx: 0.24, rz: 0.07, s: 0.85 },
  ], { n: 4, bottom: true, wob: (ri, i) => (i === 0 || i === 2) ? { s: ri === 0 ? 1.2 : 0.7 } : undefined }).build());

  // hood: red faceted cowl with pointed tail, open face; mask with nose bridge
  const face = faceGeos(0.6, 0.66);
  put(at(23)[0], face.head);
  put(at(24)[0], B().loft([
    { y: 0.92, rx: 0.2, cz: -0.12, s: 1.1, k: redOnHood }, { y: 0.8, rx: 0.56, rz: 0.54, cz: -0.12, s: 1.12, k: redOnHood }, { y: 0.5, rx: 0.78, rz: 0.76, cz: -0.08, s: 1.05, k: redOnHood },
    { y: 0.15, rx: 0.82, rz: 0.78, cz: -0.08, s: 0.95, k: redOnHood }, { y: -0.2, rx: 0.76, rz: 0.72, cz: -0.1, s: 0.85, k: redDeep }, { y: -0.55, rx: 0.6, rz: 0.56, cz: -0.12, s: 0.75, k: redDeep },
  ], { top: true, bottom: true, wob: (ri, i) => {
    if (ri === 3 && front(i)) return { dy: 0.36, dr: 0.98, s: 0.7, k: redDeep };
    if (ri === 4 && front(i)) return { dy: 0.72, dr: 0.95, s: 0.7, k: redDeep };
    if (ri >= 1 && ri <= 3 && odd(i)) return { dr: 0.95, s: 0.92 };
    return undefined;
  } }).build());
  put(at(25)[0], B().loft([
    { y: 0.1, rx: 0, cz: -0.9, cx: 0, s: 1 }, { y: 0.2, rx: 0.16, rz: 0.14, cz: -0.62, s: 1.05, k: redOnHood }, { y: 0.4, rx: 0.34, rz: 0.3, cz: -0.35, s: 1, k: redOnHood },
    { y: 0.35, rx: 0.5, rz: 0.4, cz: -0.1, s: 0.9, k: redOnHood },
  ], { n: 5, top: true, bottom: true, m: xf(0, 0.3, -0.1, -1.1, 0, 0) }).build());
  put(at(26)[0], B().loft([
    { y: 0.0, rx: 0.6, rz: 0.6, cz: 0.02, s: 0.9 }, { y: -0.2, rx: 0.63, rz: 0.63, cz: 0.04, s: 1 }, { y: -0.48, rx: 0.52, rz: 0.52, cz: 0.07, s: 0.95 }, { y: -0.7, rx: 0.3, rz: 0.3, cz: 0.1, s: 0.8 },
  ], { top: true, bottom: true, wob: (ri, i) => i === 0 && ri <= 2 ? { dr: 1.1, s: 1.15 } : ri === 0 && !(i === 0 || i === 1 || i === 7) ? { s: 0.8 } : undefined })
    .box(0.12, 0.3, 0.1, xf(0, -0.05, 0.64), { tx: 0.6, s: 1, sTop: 1.2 }).build());
  put(at(27)[0], face.eye(-1, 0.09)); put(at(28)[0], face.eye(1, 0.09));

  // cloak: crimson, pleated, scalloped hem, steel clasp chain
  const cols = 6;
  put(at(33)[0], merge([sheet(4, cols, (r, j) => {
    const t = r / 4, u = j / cols - 0.5, w = 0.8 + 0.18 * t, edge = j === 0 || j === cols || r === 4;
    const hem = r === 4 ? -0.3 * (1 - Math.abs(u) * 2) - (odd(j) ? 0.14 : 0) : 0;
    return { x: u * 2 * w, y: -2.3 * t + hem, z: Math.sin(j * 1.4) * 0.07 * t - 0.05 * t, s: odd(j) ? 0.86 : 1.06, k: edge ? redTrim : redOnCloak };
  }, 0.05),
  B().loft([{ y: 0.14, rx: 0.5, rz: 0.2, s: 1 }, { y: 0.0, rx: 0.8, rz: 0.26, s: 0.9 }, { y: -0.16, rx: 0.86, rz: 0.28, s: 0.8 }], { top: true, bottom: true })
    .box(0.18, 0.18, 0.1, xf(0, 0.06, 0.28, 0, 0, Math.PI / 4), { s: 1, sTop: 1.3, k: steelOnDark }).build()]));

  const body = c.base.root.children[0], torso = body.children[2];
  return finish(c, { body, torso, head: at(23)[0].parent!, cape: at(33)[0].parent! });
}

/* ================================ WARRIOR ================================ */
function warrior(): CharacterModel {
  const c = prepare('warrior', 72); const { put, at } = c;
  const GOLD = '#e6bd52';
  const goldOnSteel = ratio('c4962e', GOLD), steelOnSteel = ratio('c4962e', '#b9c3cf'), deepOnSteel = ratio('c4962e', '#8c6a22');
  const goldOnDark = ratio('454d5a', '#c4962e'), goldOnGrey = ratio('5f6978', '#c4962e'), darkOnGrey = ratio('5f6978', '#48505d');
  const goldOnBoot = ratio('20242b', '#b88c2c'), goldOnHelm = ratio('f0d070', '#f0d070');
  const redOnCape = ratio('9d302e', '#b3302e'), goldOnCape = ratio('9d302e', '#d1a13e'), deepCape = ratio('9d302e', '#6e1c1e');
  const leather = ratio('33241c', '#4a3226');

  // legs: cuisse + knee cop with spike + greave + armoured boot (sole stays inside LEG_BOUNDS)
  put(at(0, 5), new B6().loft([{ y: 0.43, rx: 0.4, s: 0.9 }, { y: 0.35, rx: 0.44, s: 1.05 }, { y: 0.0, rx: 0.4, s: 0.95 }, { y: -0.35, rx: 0.36, s: 0.9 },
    { y: -0.39, rx: 0.4, s: 1.0, k: goldOnDark }, { y: -0.43, rx: 0.34, s: 0.8 }], { top: true, bottom: true, wob: (ri, i) => ri >= 1 && ri <= 3 && odd(i) ? { dr: 0.94 } : undefined }).build());
  put(at(1, 6), new B6().loft([{ y: 0.3, rx: 0.2, cz: 0.2, s: 1 }, { y: 0.16, rx: 0.4, rz: 0.34, cz: 0.14, s: 1.1 }, { y: -0.05, rx: 0.4, rz: 0.34, cz: 0.14, s: 0.95 }, { y: -0.2, rx: 0.26, rz: 0.2, cz: 0.14, s: 0.8 }],
    { top: true, bottom: true, wob: (ri, i) => ri === 1 && odd(i) ? { dr: 0.9 } : undefined })
    .loft([{ y: 0.04, rx: 0, cz: 0.62 }, { y: 0.04, rx: 0.12, cz: 0.4, s: 1.1 }], { n: 4, top: false }).build());
  put(at(2, 7), new B6().loft([{ y: 0.31, rx: 0.34, s: 0.9 }, { y: 0.2, rx: 0.4, s: 1.05, k: goldOnGrey }, { y: -0.1, rx: 0.36, s: 0.95 }, { y: -0.31, rx: 0.34, s: 0.85 }],
    { top: true, bottom: true, wob: (ri, i) => ri >= 1 && odd(i) ? { dr: 0.93, k: darkOnGrey } : undefined })
    .box(0.24, 0.55, 0.12, xf(0, -0.0, 0.34), { tx: 0.8, s: 1, sTop: 1.15, k: goldOnGrey }).build());
  put(at(3, 8), new B6()
    .box(1.0, 0.12, 1.1, xf(0, -0.87, 0.22), { s: 0.5 })
    .box(0.86, 0.34, 0.9, xf(0, -0.66, 0.14), { tx: 0.88, tz: 0.88, s: 0.95, sTop: 1.08 })
    .box(0.8, 0.18, 0.5, xf(0, -0.78, 0.5), { tx: 0.85, tz: 0.7, s: 1.1, sTop: 1.2, k: goldOnBoot })
    .loft([{ y: -0.42, rx: 0.44, s: 1.1, k: goldOnBoot }, { y: -0.52, rx: 0.44, s: 0.9, k: goldOnBoot }], { top: true, bottom: true }).build());
  put(at(4, 9), B().box(0.9, 0.2, 0.7, xf(0, -0.5, -0.1), { tx: 0.9, tz: 0.8, s: 0.85, sTop: 1 }).build());

  // torso: broad layered cuirass: waist plate, breastplate, raised pectoral shield, gorget, belt
  put(at(10)[0], B().box(1.5, 0.35, 0.85, xf(0, -0.15, 0), { tx: 1.1, tz: 1.05, s: 0.85, sTop: 1.05 }).box(0.5, 0.4, 0.16, xf(0, -0.24, 0.46, 0.1), { s: 0.9, sTop: 1.1, k: goldOnDark }).build());
  put(at(11)[0], B().loft([
    { y: 1.5, rx: 0.8, rz: 0.4, s: 0.85 }, { y: 1.4, rx: 1.02, rz: 0.52, s: 1.1 }, { y: 1.0, rx: 0.92, rz: 0.46, s: 1 },
    { y: 0.5, rx: 0.8, rz: 0.4, s: 0.9 }, { y: 0.05, rx: 0.75, rz: 0.42, s: 0.8 },
  ], { n: 8, top: true, bottom: true, wob: (ri, i) => ri >= 1 && ri <= 2 && odd(i) ? { dr: 0.95, s: 0.9 } : undefined }).build());
  put(at(12)[0], merge([prism([[-0.74, 1.3], [0.74, 1.3], [0.56, 0.5], [0, 0.18], [-0.56, 0.5]], 0.36, 0.56, { inset: 0.1, s: 0.95, sTop: 1.12 }),
    B().loft([{ y: 1.24, rx: 0, cz: 0.6, s: 1.2 }, { y: 0.9, rx: 0.1, rz: 0.1, cz: 0.58 }, { y: 0.3, rx: 0, cz: 0.6, s: 1 }], { n: 4 }).build()]));
  put(at(13)[0], prism([[-0.22, 1.1], [0.22, 1.1], [0.24, 0.12], [0, 0.04], [-0.24, 0.12]], 0.56, 0.68, { inset: 0.15, s: 0.85, sTop: 1.1 }));
  put(at(14)[0], B().box(0.72, 0.1, 0.08, xf(-0.3, 1.2, 0.7, 0, 0, -0.5), { tx: 0.9, s: 1, sTop: 1.2 }).build());
  put(at(15)[0], B().box(0.72, 0.1, 0.08, xf(0.3, 1.2, 0.7, 0, 0, 0.5), { tx: 0.9, s: 1, sTop: 1.2 }).build());
  put(at(16)[0], B().box(0.12, 1.0, 0.07, xf(0, 0.6, 0.72, 0, 0, 0.8), { s: 1, sTop: 1.2 }).build());
  put(at(17)[0], B().box(0.12, 1.0, 0.07, xf(0, 0.6, 0.72, 0, 0, -0.8), { s: 1, sTop: 1.2 }).build());
  put(at(18, 19), B().box(1.15, 0.07, 0.07, undefined, { s: 1, sTop: 1.2 }).build(), true);
  put(at(20)[0], B().loft([{ y: 0.14, rx: 0.9, rz: 0.52, s: 1.05, k: leather }, { y: 0, rx: 0.94, rz: 0.56, s: 0.9, k: leather }, { y: -0.14, rx: 0.9, rz: 0.52, s: 0.75, k: leather }],
    { n: 8, top: true, bottom: true }).build());
  put(at(21)[0], B().loft([{ y: 0.1, rx: 0.28, s: 1.1 }, { y: 0, rx: 0.32, s: 1.2 }, { y: -0.1, rx: 0.22, s: 0.9 }], { n: 8, top: true, bottom: true, m: xf(0, 0.02, 0.52, P2, 0, 0) })
    .loft([{ y: 0.14, rx: 0.12, s: 1.3, k: ratio('d1a13e', '#b3302e') }, { y: 0, rx: 0.14, s: 1, k: ratio('d1a13e', '#b3302e') }], { n: 6, top: true, bottom: true, m: xf(0, 0.02, 0.52, P2, 0, 0) }).build());
  // tassets: keep each cone's own transform, make them broad faceted leather plates
  put(at(22, 23, 24, 25), B().loft([{ y: 0.5, rx: 0.9, rz: 0.4, s: 1.05 }, { y: 0.1, rx: 0.9, rz: 0.4, s: 0.95, k: leather }, { y: -0.5, rx: 0, s: 0.8 }], { n: 6, top: true }).build(), true);
  put(at(26)[0], B().loft([{ y: 0.3, rx: 0.28, s: 0.9 }, { y: -0.3, rx: 0.3, s: 0.8 }], { top: true, bottom: true })
    .loft([{ y: 0.05, rx: 0.5, s: 1.2, k: ratio('d89a72', '#c4962e') }, { y: -0.3, rx: 0.55, rz: 0.46, s: 0.95, k: ratio('d89a72', '#c4962e') }, { y: -0.45, rx: 0.58, rz: 0.5, s: 0.8, k: ratio('d89a72', '#c4962e') }], { top: true, bottom: true }).build());

  // helmet: dark inner, faceted steel-gold dome with comb, brim band, visor, plume
  put(at(27)[0], B().loft([{ y: 0.78, rx: 0.2, s: 0.9 }, { y: 0.4, rx: 0.62, s: 1 }, { y: -0.2, rx: 0.72, s: 1 }, { y: -0.7, rx: 0.44, s: 0.9 }], { n: 8, top: true, bottom: true }).build());
  put(at(28)[0], B().loft([
    { y: 1.0, rx: 0.14, cz: -0.04, s: 1.1 }, { y: 0.86, rx: 0.5, rz: 0.48, cz: -0.04, s: 1.12 }, { y: 0.5, rx: 0.8, rz: 0.76, cz: -0.04, s: 1.05 },
    { y: 0.1, rx: 0.86, rz: 0.82, cz: -0.04, s: 0.95 }, { y: -0.3, rx: 0.8, rz: 0.76, cz: -0.06, s: 0.8 },
  ], { n: 8, top: true, wob: (ri, i) => ri >= 1 && ri <= 3 ? (i === 0 ? { dr: 1.03, s: 1.1 } : odd(i) ? { dr: 0.95, s: 0.9 } : undefined) : undefined }).build());
  put(at(29)[0], B().loft([{ y: 0.28, rx: 0.4, rz: 0.3, cz: 0.55, s: 0.9 }, { y: -0.2, rx: 0.5, rz: 0.34, cz: 0.55, s: 1 }, { y: -0.7, rx: 0.34, rz: 0.24, cz: 0.5, s: 0.8 }], { top: true, bottom: true }).build());
  put(at(30)[0], B().loft([{ y: 0.07, rx: 0.9, rz: 0.88, s: 1.15 }, { y: -0.07, rx: 0.9, rz: 0.88, s: 0.85 }], { n: 12, top: true, bottom: true, m: xf(0, 0.36, 0.06, -0.2, 0, 0) }).build());
  put(at(31)[0], B().box(0.9, 0.14, 0.14, xf(0, 0.35, 0.8), { s: 1, sTop: 1.25 }).box(0.12, 0.4, 0.1, xf(0, 0.12, 0.86), { tx: 0.6, s: 1, sTop: 1.2 }).build());
  put(at(32)[0], B().loft([{ y: 0.9, rx: 0.06, rz: 0.1, cz: 0, s: 1 }, { y: 0.7, rx: 0.08, rz: 0.5, cz: -0.1, s: 1.1 }, { y: 0.0, rx: 0.08, rz: 0.4, cz: -0.5, s: 0.8 }], { n: 4, top: true, bottom: true, m: xf(0, 0.2, 0.2) }).build(), true);
  const cheek = (sx: number) => B().loft([{ y: 0.4, rx: 0.1, rz: 0.2, s: 1.1 }, { y: 0.0, rx: 0.12, rz: 0.22, s: 0.95 }, { y: -0.5, rx: 0.08, rz: 0.16, s: 0.85 }, { y: -0.6, rx: 0, s: 0.8 }],
    { n: 6, top: true, m: xf(sx * 0.72, -0.28, 0.12, 0, sx * 0.35, 0) }).build();
  put(at(33)[0], cheek(-1)); put(at(37)[0], cheek(1));
  const face = faceGeos(0.6, 0.66);
  const tinyEye = (sx: number, r: number, z: number) => B().loft([{ y: r, rx: 0, cx: sx * 0.24, cz: z }, { y: 0, rx: r * 1.6, rz: r * 0.7, cx: sx * 0.24, cz: z }, { y: -r, rx: 0, cx: sx * 0.24, cz: z }], { n: 6 }).build();
  void face;
  put(at(34)[0], tinyEye(-1, 0.07, 0.85)); put(at(38)[0], tinyEye(1, 0.07, 0.85));
  put(at(35)[0], tinyEye(-1, 0.045, 0.89)); put(at(39)[0], tinyEye(1, 0.045, 0.89));
  put(at(36)[0], B().box(0.34, 0.07, 0.06, xf(-0.25, 0.14, 0.86, 0, 0, -0.2), { s: 1, sTop: 1.2 }).build());
  put(at(40)[0], B().box(0.34, 0.07, 0.06, xf(0.25, 0.14, 0.86, 0, 0, 0.2), { s: 1, sTop: 1.2 }).build());
  put(at(41)[0], B().loft([{ y: 0.14, rx: 0.34, rz: 0.14, cz: 0.5, s: 1 }, { y: -0.02, rx: 0.3, rz: 0.14, cz: 0.52, s: 0.9 }, { y: -0.24, rx: 0.05, rz: 0.1, cz: 0.52, s: 0.8 }], { n: 6, top: true, m: xf(0, -0.52, 0, 0, 0, 0) }).build());
  put(at(42)[0], B().loft([{ y: 1.5, rx: 0, cx: -0.75, cz: -0.1, s: 1 }, { y: 1.05, rx: 0.2, rz: 0.2, cx: -0.4, cz: -0.1, s: 1.1 }, { y: 0.5, rx: 0.24, rz: 0.34, cx: -0.1, cz: -0.1, s: 0.95 }, { y: 0.12, rx: 0.15, rz: 0.26, s: 0.8 }],
    { n: 6, top: false, bottom: true }).build(), true);
  put(at(43)[0], B().loft([{ y: 1.2, rx: 0, cx: 0.05, cz: -0.8, s: 1 }, { y: 0.8, rx: 0.15, rz: 0.2, cz: -0.5, s: 1.1 }, { y: 0.3, rx: 0.2, rz: 0.28, cz: -0.3, s: 0.95 }, { y: 0.1, rx: 0.12, rz: 0.2, s: 0.8 }],
    { n: 6, bottom: true }).build(), true);

  // pauldrons: domed steel + gold lames + rim; spikes keep their transforms
  const paul = (sx: number) => B().loft([
    { y: 1.42, rx: 0.3, rz: 0.26, cx: sx * 1.18, s: 1.1 }, { y: 1.34, rx: 0.64, rz: 0.56, cx: sx * 1.26, s: 1.15 }, { y: 1.1, rx: 0.8, rz: 0.66, cx: sx * 1.32, s: 1 },
    { y: 0.96, rx: 0.86, rz: 0.7, cx: sx * 1.34, s: 0.95, k: goldOnSteel }, { y: 0.84, rx: 0.78, rz: 0.64, cx: sx * 1.34, s: 0.8, k: goldOnSteel }, { y: 0.78, rx: 0.64, rz: 0.52, cx: sx * 1.32, s: 0.6 },
  ], { top: true, bottom: true, wob: (ri, i) => ri >= 1 && ri <= 2 && odd(i) ? { dr: 0.93, s: 0.9 } : undefined }).build();
  put(at(44)[0], paul(-1)); put(at(49)[0], paul(1));
  const lame = (sx: number) => B().loft([{ y: 0.06, rx: 0.8, rz: 0.66, cx: sx * 1.34, s: 1.1, k: goldOnSteel }, { y: -0.06, rx: 0.78, rz: 0.64, cx: sx * 1.34, s: 0.85, k: goldOnSteel }], { n: 8, top: true, bottom: true, m: xf(0, 0.7, 0) }).build();
  put(at(45)[0], lame(-1)); put(at(50)[0], lame(1));
  const stud = (sx: number) => B().loft([{ y: 0.2, rx: 0, cx: sx * 1.05, cz: 0.28, s: 1.2 }, { y: 1.76, rx: 0, cx: sx * 1.05, cz: 0.28 }], {}).build();
  void stud;
  const sphere8 = (sx: number) => B().loft([{ y: 1.93, rx: 0, cx: sx * 1.05, cz: 0.28 }, { y: 1.76, rx: 0.17, cx: sx * 1.05, cz: 0.28, s: 1 }, { y: 1.59, rx: 0, cx: sx * 1.05, cz: 0.28, s: 0.8 }], { n: 6 }).build();
  put(at(46)[0], sphere8(-1)); put(at(51)[0], sphere8(1));
  put(at(47, 48, 52, 53), B().loft([{ y: 0.5, rx: 0, s: 1.15 }, { y: 0.1, rx: 1, s: 1 }, { y: -0.5, rx: 0.9, s: 0.8 }], { n: 5, bottom: true }).build(), true);

  // cape: rich red, folded, gold-trimmed hem, yoke
  const cols = 6;
  put(at(54)[0], merge([sheet(5, cols, (r, j) => {
    const t = r / 5, u = j / cols - 0.5, w = 0.85 + 0.28 * t, edge = j === 0 || j === cols || r === 5;
    const hem = r === 5 ? -0.28 * (1 - Math.abs(u) * 2) - (odd(j) ? 0.16 : 0) : 0;
    return { x: u * 2 * w, y: -2.25 * t + hem, z: Math.sin(j * 1.5) * 0.09 * t - 0.04 * t, s: odd(j) ? 0.82 : 1.1, k: edge ? goldOnCape : (r === 0 || r === 1 ? deepCape : redOnCape) };
  }, 0.05),
  B().loft([{ y: 0.14, rx: 0.6, rz: 0.22, s: 1 }, { y: 0.0, rx: 0.9, rz: 0.28, s: 0.9 }, { y: -0.18, rx: 1.0, rz: 0.3, s: 0.8, k: deepCape }], { top: true, bottom: true }).build()]));

  // sword: bevelled fullered blade, winged guard, wrapped grip, faceted pommel
  const edgeC = ratio('ffffff', '#f4f7fa'), ridgeC = ratio('ffffff', '#7d8997');
  put(at(55)[0], B().loft([
    { y: 3.12, rx: 0, s: 1 }, { y: 2.8, rx: 0.34, rz: 0.07, s: 0.95 }, { y: 2.1, rx: 0.6, rz: 0.1, s: 0.9 }, { y: 0.9, rx: 0.56, rz: 0.1, s: 0.85 }, { y: 0.05, rx: 0.52, rz: 0.1, s: 0.8 },
  ], { n: 8, bottom: true, wob: (ri, i) => {
    if (i === 2 || i === 6) return { s: 1.0, k: edgeC, dr: 1 };
    if (i === 0 || i === 4) return { s: 0.58, k: ridgeC, dr: 1.0 };
    return { s: 0.82, dr: 0.9 };
  } }).build(), true);
  put(at(56)[0], B().box(2.3, 0.2, 0.3, xf(0, 0.02, 0), { tx: 0.85, s: 1, sTop: 1.2 })
    .box(0.55, 0.3, 0.3, xf(1.1, 0.12, 0, 0, 0, 0.5), { tx: 0.7, s: 0.95, sTop: 1.2 })
    .box(0.55, 0.3, 0.3, xf(-1.1, 0.12, 0, 0, 0, -0.5), { tx: 0.7, s: 0.95, sTop: 1.2 })
    .loft([{ y: 0.22, rx: 0.2, s: 1.1 }, { y: 0.0, rx: 0.3, rz: 0.26, s: 1.2 }, { y: -0.22, rx: 0.2, s: 0.9 }], { n: 6, top: true, bottom: true }).build());
  put(at(57)[0], B().loft([{ y: 0.0, rx: 0.17, s: 1 }, { y: -0.2, rx: 0.17, s: 0.8 }, { y: -0.45, rx: 0.18, s: 1 }, { y: -0.7, rx: 0.17, s: 0.8 }, { y: -0.95, rx: 0.18, s: 1 }, { y: -1.2, rx: 0.17, s: 0.8 }, { y: -1.45, rx: 0.17, s: 0.9 }],
    { n: 8, top: true, bottom: true, wob: (ri, i) => odd(ri) ? { dr: 1.1 } : undefined }).build());
  put(at(63)[0], B().loft([{ y: -1.55, rx: 0.2, s: 1 }, { y: -1.72, rx: 0.3, s: 1.1 }, { y: -1.92, rx: 0.25, s: 0.9 }, { y: -2.15, rx: 0.12, s: 0.8 }], { n: 6, top: true, bottom: true }).build());

  // arms (IK driven): unit loft shapes, scale kept by applyPose
  const upper = new B6().loft([{ y: 0.5, rx: 0.9, s: 0.95 }, { y: 0.3, rx: 1.1, s: 1.05 }, { y: -0.05, rx: 1.0, s: 0.95 }, { y: -0.12, rx: 1.12, s: 1.05, k: goldOnSteel }, { y: -0.5, rx: 0.88, s: 0.85 }],
    { top: true, bottom: true, wob: (ri, i) => ri >= 1 && ri <= 2 && odd(i) ? { dr: 0.94 } : undefined }).build();
  const fore = new B6().loft([{ y: 0.5, rx: 0.85, s: 0.9 }, { y: 0.35, rx: 1.0, s: 1.05, k: goldOnDark }, { y: 0.0, rx: 0.95, s: 0.95 }, { y: -0.35, rx: 1.2, s: 1.1, k: goldOnDark }, { y: -0.5, rx: 1.0, s: 0.85 }],
    { top: true, bottom: true, wob: (ri, i) => ri >= 2 && odd(i) ? { dr: 0.92 } : undefined }).build();
  const elb = new B6().loft([{ y: 1, rx: 0, s: 1.1 }, { y: 0.55, rx: 0.8, s: 1 }, { y: -0.2, rx: 1, s: 0.95 }, { y: -0.8, rx: 0.5, s: 0.8 }], { n: 6, top: true, bottom: true }).build();
  const hand = new B6().loft([{ y: 0.9, rx: 0.5, s: 0.9 }, { y: 0.4, rx: 0.95, s: 1.05 }, { y: -0.2, rx: 1.0, rz: 1.1, cz: 0.08, s: 1 }, { y: -0.9, rx: 0.5, s: 0.8 }],
    { n: 6, top: true, bottom: true, wob: (ri, i) => ri === 2 && odd(i) ? { dr: 0.92 } : undefined }).build();
  put(at(64, 68), upper, true); put(at(65, 69), fore, true); put(at(66, 70), elb, true); put(at(67, 71), hand, true);

  at(64, 65, 66, 67, 68, 69, 70, 71).forEach((m) => { m.userData.noMerge = true; });
  const body = c.base.root.children[0], torso = body.children[2];
  return finish(c, { body, torso, head: at(27)[0].parent!, cape: at(54)[0].parent! });
}

export function createPremiumMeleeModel(id: MeleeId): CharacterModel {
  if (id === 'paladin') return paladin();
  if (id === 'rogue') return rogue();
  return warrior();
}
