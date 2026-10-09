import * as THREE from 'three';
import type { CharacterModel, CharacterPose } from '../modelKit';
import type { DruidForm } from '../roster';
import { createAdventurer } from '../adventurerModels';
import { countTriangles } from '../../warrior3d/warriorModel';
import { Builder, xf, ratio, type Ring, type RGB } from '../magePremiumGeometry';

/**
 * Premium nature roster (Archer, Druid caster / bear / tiger). Refines the real base meshes in place:
 * same nodes, rig, materials, animate. Geometry is indexed + vertex-painted (RGB multipliers over the host
 * material colour), so gold / leather / leaf cloth separation needs no new materials, lights or textures.
 * The tree form is returned as the untouched base model.
 */
const GOLD = '#d9b84c', LEAF = '#7fb04f', DEEP = '#2f5a2a', LEATH = '#4a321f', LEATH2 = '#6b4528', BARK = '#5b3d22';
const odd = (i: number) => i % 2 === 1;
/** Hexagonal-section builder for limbs: faceted read at battle scale, a third cheaper than octagons. */
class LB extends Builder { loft(r: Ring[], o: Parameters<Builder['loft']>[1] = {}) { return super.loft(r, { n: 6, ...o }); } }
type M = THREE.Mesh;
const kids = (o: THREE.Object3D) => o.children.filter((c) => (c as M).isMesh) as M[];
const grps = (o: THREE.Object3D) => o.children.filter((c) => !(c as M).isMesh) as THREE.Group[];
const hexOf = (m: M) => (m.material as THREE.MeshLambertMaterial).color.getHexString();

function setup(owned: THREE.BufferGeometry[]) {
  const put = (ms: M | M[] | undefined, g: THREE.BufferGeometry, o: { abs?: boolean; keepScale?: boolean; part?: string } = {}) => {
    owned.push(g);
    for (const m of ([] as (M | undefined)[]).concat(ms)) {
      if (!m) continue;
      m.geometry = g;
      if (!o.keepScale) m.scale.set(1, 1, 1);
      if (o.abs) { m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); }
      if (o.part) m.userData.part = o.part;
      (m.material as THREE.MeshLambertMaterial).vertexColors = true;
    }
  };
  (put as unknown as { owned: THREE.BufferGeometry[] }).owned = owned;
  return put;
}

/** Fold same-parent / same-material static decoration into the first mesh (draw-call saving). */
function merge(list: M[], owned: THREE.BufferGeometry[]) {
  const [anchor, ...rest] = list.filter(Boolean);
  if (!anchor || !rest.length) return;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  anchor.updateMatrix(); const inv = anchor.matrix.clone().invert();
  const v = new THREE.Vector3();
  for (const m of [anchor, ...rest]) {
    m.updateMatrix(); const mat = m === anchor ? new THREE.Matrix4() : inv.clone().multiply(m.matrix);
    const g = m.geometry; const p = g.attributes.position, c = g.attributes.color; const o = pos.length / 3;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(mat); pos.push(v.x, v.y, v.z); col.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1); }
    for (let i = 0; i < g.index!.count; i++) idx.push(g.index!.getX(i) + o);
    // keep the anchor's own matrix: members share its parent, so only anchor matrix differs from identity
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  owned.push(g); anchor.geometry = g;
  rest.forEach((m) => m.parent?.remove(m));
}

interface Pal { skin: string; cloth: string; shoulder: string; cloth2: string; trim: string; boot: string; iris: string; brow: string }
const SKIN_WARM = ratio('d7a078', '#e8aa84');

/** Shared humanoid body refinement (legs, boots, torso base, arms, hands, head and face). */
function refineHuman(root: THREE.Group, pal: Pal, b: number, put: ReturnType<typeof setup>, style: 'archer' | 'druid') {
  const body = root.children[0] as THREE.Group;
  const hips = grps(body).slice(0, 2), torso = grps(body)[2];
  const tg = (c: string, host: string) => ratio(host, c);
  const gold2 = tg(GOLD, pal.cloth2), goldC = tg(GOLD, pal.cloth), leatC2 = tg(LEATH2, pal.cloth2), leatC = tg(LEATH, pal.cloth);
  const leafC = tg(style === 'archer' ? '#4f8a3a' : '#6aa04a', pal.cloth);
  const goldB = tg(GOLD, pal.boot), bootT = tg(style === 'archer' ? '#5a3a22' : '#4d3a24', pal.boot), bootD = tg('#2b1d14', pal.boot);
  const goldS = tg(GOLD, pal.shoulder), darkS = tg(style === 'archer' ? '#3e6a30' : '#4f7c36', pal.shoulder), leatS = tg(LEATH, pal.shoulder);
  const warm = SKIN_WARM, shade = ratio('d7a078', '#a8745a');

  // legs: shared thigh / calf / boot
  put(kids(hips[0])[0], new LB().loft([
    { y: .425, rx: .35 * b, s: .9 }, { y: .25, rx: .37 * b, s: 1 }, { y: -.1, rx: .345 * b, s: .8, k: leatC2 }, { y: -.2, rx: .33 * b, s: .85, k: leatC2 }, { y: -.425, rx: .285 * b, s: .8 },
  ], { top: true, bottom: true, wob: (ri, i) => ri === 1 && odd(i) ? { dr: .95 } : undefined }).build());
  const thighs = kids(hips[1])[0]; thighs.geometry = kids(hips[0])[0].geometry; thighs.scale.set(1, 1, 1);
  (thighs.material as THREE.MeshLambertMaterial).vertexColors = true;
  const calfG = new LB().loft([
    { y: .375, rx: .29, s: .95 }, { y: .25, rx: .31, s: 1.1, k: gold2 }, { y: .12, rx: .24, s: .9 },
    { y: -.15, rx: .26, s: .8, k: leatC2 }, { y: -.375, rx: .23, s: .7 },
  ], { top: true, bottom: true, wob: (ri, i) => ri === 1 && odd(i) ? { dr: .9 } : undefined }).build();
  const bootG = new Builder()
    .loft([{ y: .2, rx: .29, cz: -.16, s: 1.05, k: bootT }, { y: .12, rx: .3, cz: -.16, s: 1.1, k: goldB }, { y: -.1, rx: .26, cz: -.16, s: .85, k: bootT }], { n: 6, top: true })
    .box(.56, .2, .98, xf(0, -.1, -.02), { tx: .9, tz: .82, dz: .06, s: .8, sTop: 1, k: bootT })
    .box(.62, .08, 1.04, xf(0, -.18, 0), { s: .55, k: bootD })
    .box(.2, .1, .06, xf(0, .06, .15), { s: 1, sTop: 1.2, k: goldB }).build();
  const knees = hips.map((h) => grps(h)[0]);
  const calfMs = knees.map((k) => kids(k)[0]);
  put(calfMs, calfG);
  put(knees.map((k) => kids(k)[1]), bootG);

  // torso neck
  const tk = kids(torso);
  put(tk[2], new Builder().loft([{ y: .16, rx: .22, s: .9 }, { y: .0, rx: .21, s: .85 }, { y: -.16, rx: .25, s: .8 }], { n: 8, top: true, bottom: true, tint: shade }).build());

  // arms
  const shG = grps(torso).slice(0, 2);
  shG.forEach((sg, ix) => {
    const side = sg.position.x < 0 ? -1 : 1;
    const [pad, upper] = kids(sg);
    put(pad, new LB().loft([
      { y: .3, rx: .26, rz: .22, s: .9 }, { y: .2, rx: .46, rz: .4, s: 1.1 }, { y: -.03, rx: .5, rz: .44, s: 1, k: goldS }, { y: -.12, rx: .4, rz: .34, s: .6 },
    ], { top: true, bottom: true, wob: (ri, i) => ri === 1 && odd(i) ? { dr: .93, k: darkS } : undefined })
      .loft([{ y: .1, rx: .0, cx: side * .62, cz: .0 }, { y: -.02, rx: .24, rz: .3, cx: side * .46, s: 1.05 }, { y: -.3, rx: .0, cx: side * .22, s: .8 }], { n: 6, wob: (ri, i) => ri === 1 ? { s: odd(i) ? .8 : 1.05, k: odd(i) ? darkS : leatS } : undefined })
      .build());
    put(upper, new LB().loft([
      { y: .45, rx: .22, s: .9 }, { y: .32, rx: .25, s: 1 }, { y: -.02, rx: .24, s: .85, k: leatC }, { y: -.14, rx: .21, s: .9 }, { y: -.45, rx: .2, s: .8 },
    ], { top: true, bottom: true, wob: (ri, i) => ri === 1 && odd(i) ? { dr: .94 } : undefined }).build());
    const eg = grps(sg)[0];
    put(kids(eg)[0], new LB().loft([
      { y: .4, rx: .2, s: .95 }, { y: .1, rx: .19, s: .9 }, { y: .07, rx: .24, s: 1.05, k: goldC }, { y: -.3, rx: .2, s: .8, k: leatC }, { y: -.4, rx: .17, s: .8, k: leatC },
    ], { top: true, bottom: true, wob: (ri, i) => ri === 3 && odd(i) ? { dr: .92 } : undefined }).build());
    const hand = kids(grps(eg)[0])[0];
    put(hand, new LB().loft([{ y: .2, rx: .1, s: 1 }, { y: .05, rx: .22, s: 1 }, { y: -.2, rx: .1, s: .8 }], { top: true, bottom: true, tint: warm })
      .box(.1, .16, .1, xf(side * .2, .0, .1, 0, 0, side * .5), { s: .95, sTop: 1.1, k: warm }).build());
    void ix;
  });

  // head + face
  const head = grps(torso)[2];
  const hk = kids(head);
  const [skull, eyeL, eyeR, nose, mouth] = hk;
  put(skull, new Builder().loft([
    { y: .66, rx: .3, s: .95 }, { y: .5, rx: .5, s: 1 }, { y: .2, rx: .62, s: 1.02 }, { y: -.05, rx: .62, s: 1.02 },
    { y: -.3, rx: .54, cz: .02, s: .95 }, { y: -.5, rx: .36, cz: .05, s: .9 }, { y: -.66, rx: .16, cz: .07, s: .85 },
  ], { top: true, bottom: true, tint: warm, wob: (ri, i) => {
    if (ri === 3 && (i === 1 || i === 7)) return { dr: 1.07, k: ratio('d7a078', '#ecaa86') };
    if (ri === 2 && i === 0) return { dr: 1.05 };
    if (ri === 4 && (i === 2 || i === 6)) return { dr: .92, k: shade };
    return undefined;
  } }).build(), { abs: false });
  const eyeG = new Builder().loft([{ y: .09, rx: 0 }, { y: 0, rx: .13, rz: .05, s: 1 }, { y: -.09, rx: 0 }], { n: 6 })
    .box(.1, .13, .03, xf(0, 0, .05), { s: 1, k: ratio('eef7ff', pal.iris) })
    .box(.05, .08, .03, xf(0, 0, .065), { s: 1, k: ratio('eef7ff', '#1b1a22') }).build();
  put([eyeL, eyeR], eyeG);
  put(nose, new Builder().loft([
    { y: .1, rx: .05, cz: .55, s: .9 }, { y: .0, rx: .07, cz: .62, s: 1 }, { y: -.12, rx: .1, rz: .1, cz: .66, s: 1 }, { y: -.17, rx: .06, rz: .07, cz: .65, s: .8 },
  ], { n: 6, top: true, bottom: true, tint: warm }).build(), { abs: true });
  const browK = ratio('7a3d2c', pal.brow);
  put(mouth, new Builder()
    .box(.22, .035, .05, xf(0, -.3, .545), { s: 1 })
    .box(.1, .04, .05, xf(0, -.36, .53), { s: 1.1, k: ratio('7a3d2c', '#c07a64') })
    .box(.2, .06, .06, xf(.2, .22, .55, 0, 0, -.22), { s: .9, sTop: 1, k: browK })
    .box(.2, .06, .06, xf(-.2, .22, .55, 0, 0, .22), { s: .9, sTop: 1, k: browK }).build(), { abs: true });
  return { body, torso, head, hips, shG };
}

// ------------------------------------------------------------------------------------------------ ARCHER
function refineArcher(base: CharacterModel, put: ReturnType<typeof setup>) {
  const pal: Pal = { skin: 'd7a078', cloth: '355b2d', shoulder: '6f9d49', cloth2: '2a4423', trim: '4a321f', boot: '24262d', iris: '#4f8a3a', brow: '#3a2616' };
  const r = refineHuman(base.root, pal, .92, put, 'archer');
  const { torso, head, shG } = r; const b = .92;
  const tk = kids(torso);
  const gC = ratio('355b2d', GOLD), lC = ratio('355b2d', LEATH2), lfC = ratio('355b2d', '#5f9a3c'), dkC = ratio('355b2d', '#244a22');
  // torso: green gambeson + leather cuirass + gold rivets
  put(tk[0], new Builder().loft([
    { y: .775, rx: .72 * b, rz: .42, s: .8 }, { y: .7, rx: .83 * b, rz: .52, s: 1.1 }, { y: .35, rx: .78 * b, rz: .5, s: 1 },
    { y: -.1, rx: .7 * b, rz: .44, s: .92 }, { y: -.5, rx: .63 * b, rz: .4, s: .85 }, { y: -.775, rx: .62 * b, rz: .39, s: .8 },
  ], { top: true, bottom: true, wob: (ri, i) => ri >= 2 && ri <= 3 && odd(i) ? { dr: .94, s: .88 } : undefined })
    .box(.95 * b, .8, .12, xf(0, .18, .46, -.08), { tx: .85, s: .9, sTop: 1.1, k: lC })
    .box(.14, .75, .06, xf(0, .18, .53, -.08), { s: 1, sTop: 1.1, k: gC })
    .box(.3 * b, .5, .06, xf(.38 * b, .1, .5, -.05, .3, 0), { s: .9, sTop: 1, k: lfC })
    .box(.3 * b, .5, .06, xf(-.38 * b, .1, .5, -.05, -.3, 0), { s: .9, sTop: 1, k: lfC })
    .box(.1, .1, .08, xf(.3, .5, .53), { s: 1, sTop: 1.3, k: gC }).box(.1, .1, .08, xf(-.3, .5, .53), { s: 1, sTop: 1.3, k: gC })
    .box(.12, .24, .08, xf(0, -.46, .44), { s: 1, k: lfC })
    .build(), { part: 'torso' });
  // belt
  put(tk[1], new Builder().loft([{ y: .1, rx: .7 * b, rz: .46, s: 1 }, { y: 0, rx: .73 * b, rz: .49, s: .9 }, { y: -.1, rx: .7 * b, rz: .46, s: .8 }], { top: true, bottom: true })
    .box(.34, .26, .1, xf(0, 0, .5), { tx: .85, s: 1.05, sTop: 1.3, k: ratio('4a321f', GOLD) })
    .box(.14, .14, .1, xf(0, 0, .56, 0, 0, Math.PI / 4), { s: 1, sTop: 1.2, k: ratio('4a321f', '#7fd05a') })
    .box(.2, .4, .06, xf(.5, -.2, .38, 0, 0, .1), { s: .9, k: ratio('4a321f', LEATH2) })
    .box(.2, .3, .08, xf(-.55, -.15, .3), { s: .9, sTop: 1.1, k: ratio('4a321f', GOLD) }).build());
  // collar (6f9d49 box) + baldric (4a321f box)
  const col = tk.find((m) => hexOf(m) === '6f9d49'); const bal = tk.find((m) => hexOf(m) === '4a321f' && m !== tk[1]);
  put(col, new Builder().box(.96, .12, .5, xf(0, 0, -.06), { s: 1, sTop: 1.1 })
    .box(.34, .1, .1, xf(.3, -.08, .32, 0, 0, -.6), { s: .9, k: ratio('6f9d49', '#4f8a3a') })
    .box(.34, .1, .1, xf(-.3, -.08, .32, 0, 0, .6), { s: .9, k: ratio('6f9d49', '#4f8a3a') })
    .box(.12, .12, .1, xf(0, -.12, .34), { s: 1, k: ratio('6f9d49', GOLD) }).build());
  put(bal, new Builder().box(.14, 1.7, .05, undefined, { s: .9, sTop: 1.05 })
    .box(.2, .14, .08, xf(0, .5, .0), { s: 1, k: ratio('4a321f', GOLD) })
    .box(.2, .14, .08, xf(0, -.5, .0), { s: 1, k: ratio('4a321f', GOLD) })
    .box(.18, .18, .09, xf(0, 0, 0, 0, 0, Math.PI / 4), { s: 1, sTop: 1.2, k: ratio('4a321f', GOLD) }).build());
  // hood
  const hh = kids(head).slice(5);
  const hoodG = ratio('355b2d', '#3f7a35'), hoodD = ratio('355b2d', '#27481f'), hoodGold = ratio('355b2d', GOLD);
  put(hh[0], new Builder().loft([
    { y: .56, rx: .3, cx: 0, cz: -.08, s: 1 }, { y: .42, rx: .62, cz: -.02, s: 1.1, k: hoodG }, { y: .2, rx: .76, cz: .0, s: 1.02 },
    { y: -.05, rx: .78, cz: -.04, s: .95 }, { y: -.28, rx: .7, cz: -.08, s: .85 }, { y: -.5, rx: .46, cz: -.1, s: .75, k: hoodGold },
  ], { top: true, wob: (ri, i, a) => {
    const f = Math.cos(a);
    if (ri >= 3 && f > .35) return { dy: .42 + (ri - 3) * .22, s: .9 };
    if (ri === 4 && f < -.2) return { dy: -.1 };
    if (ri >= 1 && ri <= 3 && odd(i)) return { dr: .94, k: hoodD };
    return undefined;
  } }).build());
  put(hh[1], new Builder().loft([
    { y: .46, rx: 0, cx: 0, cz: -.85, s: 1 }, { y: .3, rx: .22, cx: 0, cz: -.55, s: 1.1, k: hoodG }, { y: -.1, rx: .34, cz: -.3, s: 1 }, { y: -.45, rx: .3, cz: -.1, s: .85 },
  ], { n: 6, bottom: true, wob: (ri, i) => ri === 2 && odd(i) ? { dr: .88, k: hoodD } : undefined }).build(), { abs: true });
  const feather = ratio('355b2d', '#e5e8b8'), featherG = ratio('355b2d', '#8cc65a');
  put(hh[2], new Builder()
    .box(.82, .1, .34, xf(0, 0, 0, .0), { s: 1.05, sTop: 1, k: hoodGold, tz: .8 })
    .box(.74, .1, .3, xf(0, .09, -.02, -.05), { s: 1, sTop: .95, k: hoodG })
    .loft([{ y: .55, rx: 0, cx: .62, cz: -.55 }, { y: .22, rx: .09, rz: .035, cx: .64, cz: -.32, s: 1.1, k: feather }, { y: -.1, rx: .06, rz: .03, cx: .62, cz: -.0, s: .9, k: featherG }, { y: -.2, rx: 0, cx: .6, cz: .08, k: featherG }], { n: 6 })
    .build(), { abs: false });
  // cape (mandatory): layered back panels with gold border, leaf hem
  const capeGrp = grps(torso).find((g) => g.position.y > 1.8 && g.position.z < 0)!;
  capeGrp.userData.premiumJoint = 'cape';
  const cape = kids(capeGrp)[0]; cape.userData.part = 'cape';
  const cg = ratio('2a4423', '#3b6a32'), cd = ratio('2a4423', '#1d3418'), cgd = ratio('2a4423', GOLD), cl = ratio('2a4423', '#4f8a3a');
  const cb = new Builder()
    .box(1.5, .3, .14, xf(0, -.14, .0), { s: 1.05, sTop: 1.1, k: cl })
    .box(1.45, 1.4, .08, xf(0, -.95, -.04, .05), { tx: .8, s: .8, sTop: 1.1, k: cg })
    .box(.5, 1.3, .08, xf(.78, -1.1, -.06, .05, 0, -.12), { tx: .7, s: .75, sTop: .95 })
    .box(.5, 1.3, .08, xf(-.78, -1.1, -.06, .05, 0, .12), { tx: .7, s: .75, sTop: .95 })
    .box(.06, 1.7, .1, xf(.96, -1.0, -.03, .05, 0, .05), { s: .95, sTop: 1.1, k: cgd })
    .box(.06, 1.7, .1, xf(-.96, -1.0, -.03, .05, 0, -.05), { s: .95, sTop: 1.1, k: cgd })
    .box(.2, .2, .1, xf(0, -.1, .12, 0, 0, Math.PI / 4), { s: 1, sTop: 1.2, k: cgd });
  [-.7, -.35, 0, .35, .7].forEach((x, i) => cb.box(.34, .75 + (i === 2 ? .2 : 0), .07, xf(x, -2.0 - (i === 2 ? .1 : 0), -.1, .05, 0, Math.PI), { tx: .1, s: odd(i) ? .75 : .95, sTop: 1, k: odd(i) ? cd : cg }));
  cb.box(1.3, .08, .1, xf(0, -1.6, -.06, .05), { s: 1, k: cgd });
  put(cape, cb.build(), { abs: true, part: 'cape' });

  // quiver + arrows
  const q = grps(torso).find((g) => g.position.x < 0 && g.position.z < -.5)!;
  const qm = kids(q);
  const quiver = qm[0];
  const qK = ratio('4a321f', LEATH2), qG = ratio('4a321f', GOLD), qD = ratio('4a321f', '#2a1d12');
  put(quiver, new Builder().loft([
    { y: .8, rx: .29, s: 1.1, k: qG }, { y: .66, rx: .28, s: 1.05, k: qG }, { y: .1, rx: .25, s: .9 },
    { y: -.05, rx: .26, s: .85, k: qK }, { y: -.5, rx: .23, s: .8 }, { y: -.8, rx: .16, s: .75, k: qD },
  ], { n: 7, top: true, bottom: true, wob: (ri, i) => ri >= 2 && ri <= 4 && odd(i) ? { dr: .94, s: .8 } : undefined })
    .box(.1, 1.4, .06, xf(0, .0, .27), { s: .9, k: qK }).box(.2, .12, .1, xf(0, .3, .29), { s: 1, sTop: 1.2, k: qG })
    .build());
  const shafts = qm.filter((m) => hexOf(m) === 'e7d7ae'), fl = qm.filter((m) => hexOf(m) === 'b8ff68');
  put(shafts, new Builder().loft([{ y: .4, rx: .028, s: 1 }, { y: -.4, rx: .028, s: .8 }], { n: 4, top: true, bottom: true })
    .box(.14, .22, .02, xf(0, .3, 0)).build());
  put(fl, new Builder().loft([{ y: .12, rx: 0, s: 1 }, { y: .0, rx: .08, rz: .025, s: 1 }, { y: -.1, rx: .0 }], { n: 6 }).build());
  fl.forEach((m) => { m.position.y -= .08; });

  merge(shafts, (put as unknown as { owned: THREE.BufferGeometry[] }).owned);
  merge(fl, (put as unknown as { owned: THREE.BufferGeometry[] }).owned);
  // bow: grip at belly, recurve limbs, string drawn to the existing right hand
  const handL = shG[0];
  const hand = kids(grps(grps(handL)[0])[0] ? grps(grps(handL)[0])[0] : handL)[0];
  const handG = grps(grps(handL)[0])[0];
  void hand;
  const bow = grps(handG)[0]; const bowKids = kids(bow); const arc = grps(bow)[0];
  const limb = kids(arc)[0];
  const wood = ratio('b77a35', '#9a6430'), grip = ratio('b77a35', LEATH), gold = ratio('b77a35', GOLD), dark = ratio('b77a35', '#6e4222');
  const rings: Ring[] = [];
  const NS = 12;
  for (let i = 0; i <= NS; i++) {
    const u = 1 - (2 * i) / NS; const Y = 1.55 * u;
    const X = 1.5 * Math.pow(Math.max(0, 1 - u * u), .85) - .1 * Math.pow(Math.abs(u), 6);
    const tip = Math.abs(u); const inGrip = tip < .17; const inCol = Math.abs(tip - .27) < .06 || tip > .94;
    const t = 1 - tip * .6;
    rings.push({ y: Y, rx: Math.max(.05, .1 * t + (inGrip ? .03 : 0)), rz: .09 * t + (inGrip ? .03 : 0), cx: X, s: i % 2 ? .9 : 1.05, k: inGrip ? grip : inCol ? gold : tip > .6 ? dark : wood });
  }
  put(limb, new Builder().loft(rings, { n: 6, top: true, bottom: true, m: xf(0, 0, 0, 0, 0, Math.PI / 2) })
    .loft([{ y: .26, rx: .0, cx: 1.55 }, { y: .2, rx: .07, rz: .12, cx: 1.52, k: gold }, { y: -.2, rx: .07, rz: .12, cx: 1.52, k: gold }, { y: -.26, rx: 0, cx: 1.55 }], { n: 6, m: xf(0, 0, 0, 0, 0, Math.PI / 2) })
    .build(), { abs: true });
  bow.position.set(0, 1.5, 0); // belly of the bow sits in the left palm; string runs back toward the archer
  const str = bowKids.find((m) => hexOf(m) === 'e7d7ae')!;
  const sk = ratio('e7d7ae', '#efe6c4');
  put(str, new Builder().box(.025, 1.76, .025, xf(.5, .725, 0, 0, 0, -.604), { k: sk }).box(.025, 1.76, .025, xf(.5, -.725, 0, 0, 0, .604), { k: sk })
    .box(.06, .12, .06, xf(0, 0, 0), { k: ratio('e7d7ae', GOLD) }).build());
  const arrowG = grps(bow).find((g) => g !== arc)!;
  const ak = kids(arrowG);
  put(ak.find((m) => hexOf(m) === 'b8ff68'), new Builder().loft([{ y: .9, rx: .03, s: .9 }, { y: -.9, rx: .03, s: 1 }], { n: 5, top: true, bottom: true })
    .box(.2, .3, .02, xf(0, .72, 0), { s: 1, k: ratio('b8ff68', '#6fb84a') }).box(.02, .3, .2, xf(0, .72, 0), { s: 1, k: ratio('b8ff68', '#6fb84a') })
    .box(.06, .06, .06, xf(0, .9, 0), { k: ratio('b8ff68', GOLD) }).build());
  put(ak.find((m) => hexOf(m) === 'c9d2da'), new Builder().loft([{ y: .16, rx: 0, s: 1.1 }, { y: .0, rx: .1, rz: .03, s: 1 }, { y: -.15, rx: .03, rz: .02, s: .8 }], { n: 4, top: false, bottom: true }).build());
  // re-orient the nock end: shaft +y is the rear (rotation z = +pi/2), fletching already at +y
  const rightHand = grps(grps(shG[1])[0])[0];
  return { str, arrowG, bow, rightHand, baseQ: bow.quaternion.clone(), basePos: bow.position.clone(), body: r.body, torso, head, capeGrp };
}

// ------------------------------------------------------------------------------------------------ DRUID CASTER
function refineDruid(base: CharacterModel, put: ReturnType<typeof setup>) {
  const pal: Pal = { skin: 'd7a078', cloth: '4d6b35', shoulder: '78a84f', cloth2: '3a4f27', trim: '6a4529', boot: '24262d', iris: '#c8a53a', brow: '#3a2414' };
  const r = refineHuman(base.root, pal, 1, put, 'druid');
  const { torso, head } = r; const tk = kids(torso);
  const lf = ratio('4d6b35', '#6aa04a'), dk = ratio('4d6b35', '#34502a'), gd = ratio('4d6b35', GOLD), lt = ratio('4d6b35', LEATH2);
  put(tk[0], new Builder().loft([
    { y: .775, rx: .72, rz: .4, s: .8 }, { y: .7, rx: .82, rz: .5, s: 1.1 }, { y: .35, rx: .8, rz: .5, s: 1 }, { y: -.1, rx: .72, rz: .44, s: .92 }, { y: -.5, rx: .66, rz: .4, s: .85 }, { y: -.775, rx: .62, rz: .39, s: .8 },
  ], { top: true, bottom: true, wob: (ri, i) => ri >= 2 && ri <= 3 && odd(i) ? { dr: .94, s: .88 } : undefined })
    .box(.8, .7, .1, xf(0, .3, .48, -.06), { tx: .9, s: .9, sTop: 1.1, k: lt })
    .box(.12, .8, .06, xf(0, .3, .55, -.06), { s: 1, k: gd })
    .box(.34, .4, .07, xf(.3, .5, .5, 0, .1, .5), { s: .9, sTop: 1.1, k: lf }).box(.34, .4, .07, xf(-.3, .5, .5, 0, -.1, -.5), { s: .9, sTop: 1.1, k: lf })
    .box(.3, .3, .07, xf(.3, .0, .46, 0, .1, .4), { s: .85, k: dk }).box(.3, .3, .07, xf(-.3, .0, .46, 0, -.1, -.4), { s: .85, k: dk })
    .build(), { part: 'torso' });
  const belt = tk[1];
  put(belt, new Builder().loft([{ y: .1, rx: .72, rz: .46, s: 1 }, { y: 0, rx: .75, rz: .5, s: .9 }, { y: -.1, rx: .72, rz: .46, s: .8 }], { top: true, bottom: true })
    .box(.3, .26, .1, xf(0, 0, .5), { tx: .85, s: 1.05, sTop: 1.3, k: ratio('6a4529', GOLD) })
    .box(.2, .5, .06, xf(.45, -.25, .36, 0, 0, .1), { s: .9, k: ratio('6a4529', '#7a9a45') })
    .box(.16, .16, .1, xf(.5, -.55, .34, 0, 0, Math.PI / 4), { s: 1, sTop: 1.2, k: ratio('6a4529', GOLD) }).build());
  // skirt: layered leaf-cut hem
  const skirt = tk[3];
  const sg = ratio('3a4f27', GOLD), sl = ratio('3a4f27', '#5a8a3a');
  put(skirt, new Builder().loft([
    { y: .6, rx: .72, rz: .6, s: .85 }, { y: .2, rx: .84, rz: .72, s: 1 }, { y: -.3, rx: .98, rz: .84, s: .9 }, { y: -.56, rx: 1.04, rz: .88, s: .85, k: sg }, { y: -.62, rx: 1.04, rz: .88, s: .8, k: sg },
  ], { n: 10, top: true, bottom: true, wob: (ri, i) => ri >= 3 ? (odd(i) ? { dy: .18, dr: .9, s: .75 } : { dy: -.08 }) : ri === 2 && odd(i) ? { dr: .95, s: .85 } : undefined })
    .loft([{ y: .1, rx: .9, rz: .76, s: .9, k: sl }, { y: -.3, rx: 1.08, rz: .92, s: .9, k: sl }, { y: -.5, rx: 1.1, rz: .94, s: .8, k: sl }], { n: 10, wob: (ri, i) => ri === 2 && !odd(i) ? { dy: -.1 } : undefined }).build());
  // head: hair, antlers
  const hk = kids(head).slice(5);
  const hair = hk[0], back = hk[1];
  const hk1 = ratio('503522', '#6b4a2c'), hk2 = ratio('503522', '#3a2616');
  put(hair, new Builder().loft([
    { y: .5, rx: .3, s: .9 }, { y: .4, rx: .62, s: 1.05, k: hk1 }, { y: .1, rx: .72, s: .95 }, { y: -.2, rx: .7, s: .85 }, { y: -.4, rx: .55, s: .75 },
  ], { top: true, wob: (ri, i, a) => {
    const f = Math.cos(a);
    if (ri >= 3 && f > .35) return { dy: .4 + (ri - 3) * .2 };
    if (ri === 1 && odd(i)) return { dr: .95, k: hk2 };
    return undefined;
  } }).build());
  put(back, new Builder().loft([
    { y: .45, rx: .3, rz: .12, s: 1 }, { y: .1, rx: .4, rz: .15, s: .95 }, { y: -.3, rx: .38, rz: .15, s: .85 }, { y: -.55, rx: .1, rz: .08, s: .75 },
  ], { n: 6, top: true, bottom: true, wob: (ri, i) => ri === 2 && odd(i) ? { dr: .9, k: hk2 } : undefined }).build());
  const antG = grps(head);
  antG.forEach((a) => {
    const s = a.position.x < 0 ? -1 : 1; const [beam, side, top] = kids(a);
    const aw = ratio('7d5a32', '#8a6a3a'), ag = ratio('7d5a32', GOLD), ad = ratio('7d5a32', '#5a3f22');
    const tine = (b2: Builder, x: number, y: number, dx: number, dy: number, r: number) =>
      b2.loft([{ y: 0, rx: r, cx: x, cz: 0, s: 1 }, { y: dy * .5, rx: r * .7, cx: x + dx * .5, s: .95 }, { y: dy, rx: 0, cx: x + dx, s: 1.1 }], { n: 5 });
    const b2 = new Builder().loft([
      { y: 0, rx: .1, rz: .1, s: .85, k: ag }, { y: .12, rx: .1, rz: .1, s: .9, k: ag }, { y: .2, rx: .075, cx: 0, s: 1 }, { y: .55, rx: .07, cx: s * .06, s: .9 }, { y: .9, rx: .06, cx: s * .02, s: 1 }, { y: 1.15, rx: 0, cx: -s * .04, s: 1.1, k: aw },
    ], { n: 6, wob: (ri, i) => ri === 3 && odd(i) ? { dr: .88, k: ad } : undefined });
    tine(b2, s * .07, .5, s * .34, .52, .05); tine(b2, s * .03, .85, -s * .2, .38, .04);
    put(beam, b2.build(), { abs: true });
    put(side, new Builder().loft([{ y: .0, rx: .055, cx: s * .08, cz: 0, s: 1 }, { y: .3, rx: .04, cx: s * .38, s: .95, k: aw }, { y: .55, rx: 0, cx: s * .6, s: 1.1 }], { n: 5 }).build(), { abs: true });
    put(top, new Builder().loft([{ y: .95, rx: .045, cx: s * .02, cz: 0, s: 1 }, { y: 1.12, rx: .03, cx: s * .12, s: .95 }, { y: 1.3, rx: 0, cx: s * .26, s: 1.1, k: aw }], { n: 5 }).build(), { abs: true });
  });
  // shoulder leaves, chest gem, loincloth leaves
  const rest = tk.filter((m) => m !== belt && m !== skirt).slice(1);
  const collars = rest.filter((m) => hexOf(m) === '78a84f' && m.geometry.type === 'BoxGeometry');
  const leafs = rest.filter((m) => hexOf(m) === '78a84f' && m.geometry.type === 'ConeGeometry');
  const l1 = ratio('78a84f', '#5a9a3a'), l2 = ratio('78a84f', GOLD), l3 = ratio('78a84f', '#3f7a2f');
  put(collars, new Builder().box(.62, .1, .14, undefined, { s: 1, sTop: 1.1 }).box(.4, .06, .16, xf(0, .04, .02), { s: 1, k: l2 })
    .box(.2, .1, .1, xf(.2, -.05, .06, 0, 0, .5), { s: .9, k: l1 }).build());
  put(leafs, new Builder()
    .loft([{ y: .55, rx: 0, s: 1.1 }, { y: .2, rx: .22, rz: .05, s: 1, k: l1 }, { y: -.15, rx: .14, rz: .04, s: .85 }, { y: -.3, rx: 0, s: .8 }], { n: 6, wob: (ri, i) => ri === 1 && odd(i) ? { dr: .9, k: l3 } : undefined })
    .loft([{ y: .4, rx: 0, cx: .2, s: 1.1 }, { y: .1, rx: .14, rz: .04, cx: .16, s: 1, k: l3 }, { y: -.25, rx: 0, cx: .1, s: .8 }], { n: 6 })
    .loft([{ y: .4, rx: 0, cx: -.2, s: 1.1 }, { y: .1, rx: .14, rz: .04, cx: -.16, s: 1, k: l3 }, { y: -.25, rx: 0, cx: -.1, s: .8 }], { n: 6 }).build());
  const gem = rest.find((m) => hexOf(m) === '74d64d');
  put(gem, new Builder().loft([{ y: .16, rx: 0 }, { y: .0, rx: .15, rz: .08, s: 1 }, { y: -.16, rx: 0 }], { n: 6 }).build());
  const tas = rest.filter((m) => hexOf(m) === '6a4529' && m.geometry.type === 'ConeGeometry');
  put(tas, new Builder().loft([
    { y: .4, rx: .22, rz: .05, s: 1, k: ratio('6a4529', GOLD) }, { y: .3, rx: .26, rz: .05, s: .9, k: ratio('6a4529', '#5a8a3a') }, { y: .0, rx: .2, rz: .05, s: 1, k: ratio('6a4529', '#5a8a3a') }, { y: -.4, rx: 0, s: .9, k: ratio('6a4529', '#3f7a2f') },
  ], { n: 6, top: true, wob: (ri, i) => ri === 2 && odd(i) ? { dr: .85 } : undefined }).build(), { abs: false });
  tas.forEach((m) => { m.rotation.set(0, 0, 0); });
  // staff
  const st = grps(grps(grps(r.shG[1])[0])[0])[0];
  st.userData.premiumJoint = undefined;
  const sk = kids(st);
  const shaft = sk.find((m) => hexOf(m) === '79522e' && m.geometry.type === 'CylinderGeometry')!;
  const orb = sk.find((m) => hexOf(m) === '74d64d')!;
  const twig = sk.find((m) => hexOf(m) === '79522e' && m.geometry.type === 'ConeGeometry')!;
  const wg = ratio('79522e', GOLD), wl = ratio('79522e', '#4d3520'), ww = ratio('79522e', '#8a5e34');
  const sb = new Builder().loft([
    { y: -1.4, rx: .1, s: .8, k: wg }, { y: -1.3, rx: .09, s: .8 }, { y: -.4, rx: .095, s: .9, k: ww }, { y: .2, rx: .12, s: .85, k: wl }, { y: .6, rx: .12, s: .85, k: wl },
    { y: .7, rx: .12, s: 1, k: wg }, { y: 1.2, rx: .1, s: .95 }, { y: 1.7, rx: .11, s: 1 }, { y: 1.9, rx: .17, s: 1.1, k: wg }, { y: 2.0, rx: .14, s: .9 },
  ], { n: 6, top: true, bottom: true, wob: (ri, i) => ri >= 1 && ri <= 7 && odd(i) ? { dr: .9, s: .85 } : undefined });
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3 + .4; const dx = Math.sin(a), dz = Math.cos(a);
    sb.loft([{ y: 1.9, rx: .07, cx: dx * .1, cz: dz * .1, s: 1 }, { y: 2.2, rx: .06, cx: dx * .38, cz: dz * .38, s: .95 }, { y: 2.65, rx: .05, cx: dx * .34, cz: dz * .34, s: 1 }, { y: 2.95, rx: 0, cx: dx * .1, cz: dz * .1, s: 1.1, k: wg }], { n: 4 });
  }
  put(shaft, sb.build(), { abs: true });
  // leaf-crystal orb: unit shape, existing animate scales it (0.3, 0.5, 0.3)
  put(orb, new Builder().loft([
    { y: 1, rx: 0, s: 1.1 }, { y: .55, rx: .75, s: 1, k: ratio('74d64d', '#a4f07a') }, { y: 0, rx: 1, s: .85 }, { y: -.55, rx: .72, s: .75 }, { y: -1, rx: 0, s: .7 },
  ], { n: 6, wob: (ri, i) => ri >= 1 && ri <= 3 && odd(i) ? { dr: .82, s: .65 } : undefined }).build(), { keepScale: true });
  put(twig, new Builder()
    .loft([{ y: 1.55, rx: .0, cx: .45, s: 1 }, { y: 1.78, rx: .13, rz: .04, cx: .34, s: 1, k: ratio('79522e', '#5aa03a') }, { y: 1.98, rx: 0, cx: .18, s: .9 }], { n: 6 })
    .loft([{ y: 1.1, rx: 0, cx: -.4, s: 1 }, { y: 1.3, rx: .12, rz: .04, cx: -.3, s: 1, k: ratio('79522e', '#3f7a2f') }, { y: 1.5, rx: 0, cx: -.15, s: .9 }], { n: 6 }).build(), { abs: true });
  const ow = (put as unknown as { owned: THREE.BufferGeometry[] }).owned;
  merge(collars, ow); merge(leafs, ow); merge(tas, ow);
  antG.forEach((a) => merge(kids(a), ow));
  return { body: r.body, torso, head };
}

// ------------------------------------------------------------------------------------------------ QUADRUPEDS
function refineQuad(base: CharacterModel, put: ReturnType<typeof setup>, bear: boolean) {
  const root = base.root; const body = root.children[0] as THREE.Group;
  const c = body.children; const ms = kids(body); const gs = grps(body);
  const fur = bear ? '65452f' : 'b66a2d', furD = bear ? '33251e' : '4a2b1d', furL = bear ? 'a47a52' : 'e7a04a';
  const girth = bear ? 1.3 : .95, len = bear ? 1.7 : 1.55, legH = bear ? 1.7 : 1.8;
  const hs = bear ? 1 : .8;
  const R = (host: string, t: string) => ratio(host, t);
  const green = R(fur, bear ? '#4f7f3a' : '#5f9a3c'), greenD = R(fur, '#2f5a2a'), gold = R(fur, GOLD), dark = R(fur, bear ? '#2a1c14' : '#2e1a0e');
  const furLg = R(furL, '#d8c58a'); void furLg;
  const ax = xf(0, 0, 0, Math.PI / 2); // loft axis y -> body z
  const prof = (t: number) => Math.sqrt(Math.max(0, 1 - t * t));
  // main barrel
  const ringsB: Ring[] = [];
  const ts = bear ? [.95, .8, .55, .25, -.05, -.35, -.65, -.88] : [.96, .82, .6, .35, .1, -.15, -.4, -.65, -.88];
  ts.forEach((t, i) => {
    let p = prof(t) * (bear ? 1 : (t < -.2 ? .85 : 1)); if (!bear && Math.abs(t + .15) < .2) p *= .9;
    ringsB.push({ y: t * len, rx: Math.max(.08, girth * p), rz: Math.max(.08, girth * .85 * p), s: i % 2 ? .9 : 1.05 });
  });
  const stripeBand = (ri: number) => !bear && ri >= 1 && ri <= ts.length - 2 && ri % 2 === 0;
  const body0 = new Builder().loft(ringsB, { n: 10, top: true, bottom: true, m: ax, wob: (ri, i, a) => {
    const top = Math.cos(a) < -.2, side = Math.abs(Math.sin(a)) > .6;
    if (!bear && stripeBand(ri) && (top || side) && Math.cos(a) < .55) return { k: dark, s: .85 };
    if (bear && ri >= 2 && ri <= 5 && top && !odd(i)) return { k: greenD, dr: 1.04 };
    if (!bear && ri >= 3 && ri <= 5 && Math.cos(a) < -.7) return { k: green, dr: 1.05, s: 1 };
    if (i === 5 && ri >= 1 && ri <= 6) return { dr: 1.05, k: bear ? gold : gold };
    return undefined;
  } }).build();
  put(ms[0], body0, { abs: true });
  // belly / chest plate with gold girth straps
  const belly = new Builder().loft([0.9, .6, .3, 0, -.3, -.6, -.85].map((t, i) => ({ y: t * len * .75, rx: Math.max(.08, girth * .75 * prof(t)), rz: Math.max(.08, girth * .55 * prof(t)), s: i % 2 ? .9 : 1.02, k: i === 3 || i === 4 ? gold : undefined })), { n: 8, top: true, bottom: true, m: ax }).build();
  put(ms[1], belly);
  // hump -> green back cloth (bear only)
  let idx = 2;
  if (bear) {
    const cl = new Builder().loft([.95, .65, .3, -.05, -.4, -.75, -.95].map((t, i) => ({ y: t * len * .45, rx: Math.max(.1, girth * .9 * prof(t)), rz: Math.max(.1, girth * .66 * prof(t)), s: i % 2 ? .85 : 1.1, k: i === 0 || i === 6 ? gold : (i % 2 ? greenD : green) })),
      { n: 10, top: true, bottom: true, m: ax, wob: (ri, i, a) => ri >= 1 && ri <= 5 && Math.sin(a) !== 0 && Math.abs(Math.sin(a)) > .9 ? { dy: -.08, k: greenD, dr: 1.03 } : undefined })
      .box(.14, .1, len * .8, xf(0, girth * .56, 0), { s: 1.1, k: gold }).build();
    put(ms[2], cl); idx = 3;
  }
  // rune -> glowing gem on gold-less flank (cyan glow stays untinted)
  put(ms[idx], new Builder().loft([{ y: .07, rx: 0 }, { y: .035, rx: .32, s: 1.05 }, { y: -.035, rx: .32, s: .85 }, { y: -.07, rx: 0 }], { n: 6 }).build());
  // neck / head
  const neck = gs[0]; neck.userData.premiumJoint = undefined;
  const head = grps(neck)[0]; const hk = kids(head); const hj = grps(head)[0];
  let k = 0;
  if (!bear) {
    const spikeG = (alt: boolean) => new Builder().loft([
      { y: -.3, rx: .3, rz: .3, s: .8 }, { y: .0, rx: .4, rz: .34, s: 1, k: alt ? green : undefined }, { y: .35, rx: .2, rz: .2, s: .9, k: alt ? greenD : gold }, { y: .62, rx: 0, s: 1.1, k: alt ? gold : undefined },
    ], { n: 6, top: true, wob: (ri, i) => ri === 1 && odd(i) ? { dr: .85, s: .75 } : undefined }).build();
    const g0 = spikeG(false), g1 = spikeG(true);
    for (let i = 0; i < 8; i++) {
      const m = hk[k++]; const a = i / 8 * Math.PI * 2;
      put(m, odd(i) ? g1 : g0); m.rotation.set(0, 0, -a);
    }
  }
  const skull = hk[k++], muzzle = hk[k++], nose = hk[k++];
  const cheek = !bear;
  put(skull, new Builder().loft([
    { y: .75 * hs, rx: .3 * hs, s: .95 }, { y: .55 * hs, rx: .7 * hs, rz: .65 * hs, s: 1.05 }, { y: .1 * hs, rx: .87 * hs, rz: .8 * hs, s: 1 },
    { y: -.3 * hs, rx: .8 * hs, rz: .78 * hs, s: .9 }, { y: -.62 * hs, rx: .45 * hs, rz: .5 * hs, s: .8 }, { y: -.75 * hs, rx: .2 * hs, rz: .25 * hs, s: .75 },
  ], { top: true, bottom: true, wob: (ri, i, a) => {
    if (ri === 3 && Math.abs(Math.sin(a)) > .6) return { dr: cheek ? 1.2 : 1.08, k: cheek ? gold : undefined, s: 1 };
    if (ri === 1 && Math.cos(a) > .6) return { dy: .06, s: 1.1, k: bear ? greenD : dark };
    if (ri === 1 && i === 4) return { dr: 1.05, k: bear ? green : dark };
    if (cheek && ri === 2 && Math.abs(Math.sin(a)) > .8) return { k: dark };
    return undefined;
  } }).build());
  const muz = R(bear ? 'c59b70' : 'e9bd7a', bear ? '#b78d62' : '#f2d08e');
  put(muzzle, new Builder().box(.55 * hs, .38 * hs, .65 * hs, undefined, { tx: .85, tz: .85, s: .95, sTop: 1.05 })
    .box(.2 * hs, .14 * hs, .5 * hs, xf(0, .22 * hs, .05), { s: 1, sTop: 1, k: muz })
    .box(.3 * hs, .1 * hs, .3 * hs, xf(.12 * hs, -.2 * hs, .3 * hs), { s: .9, k: muz }).box(.3 * hs, .1 * hs, .3 * hs, xf(-.12 * hs, -.2 * hs, .3 * hs), { s: .9, k: muz })
    .build());
  put(nose, new Builder().loft([{ y: .13, rx: .1, rz: .08, s: 1 }, { y: .0, rx: .17, rz: .1, s: .95 }, { y: -.13, rx: .02, rz: .06, s: .8 }], { n: 6, top: true, bottom: true }).build());
  const jawM = kids(hj);
  put(jawM[0], new Builder().box(.45 * hs, .14, .7 * hs, undefined, { tx: .8, tz: .85, s: .9, sTop: 1.05 })
    .box(.2 * hs, .1, .3 * hs, xf(0, -.1, .25 * hs), { s: .9, k: muz }).build());
  const fang = new Builder().loft([{ y: .09, rx: .0, s: 1.1 }, { y: -.0, rx: .045, s: 1 }, { y: -.09, rx: .02, s: .85 }], { n: 5, top: false, bottom: true }).build();
  put(jawM.slice(1), fang);
  // ears, eyes (head children after jaw group)
  const after = hk.slice(k);
  const ears = after.filter((m) => hexOf(m) === furD), eyes = after.filter((m) => hexOf(m) === 'ffd76b');
  put(ears, new Builder().loft([{ y: .14, rx: .1, rz: .12, s: .85, k: bear ? green : gold }, { y: .06, rx: .27, rz: .27, s: 1 }, { y: -.1, rx: .3, rz: .3, s: .9 }, { y: -.14, rx: .2, rz: .2, s: .75 }], { n: bear ? 8 : 6, top: true, bottom: true, m: xf(0, 0, 0, Math.PI / 2) }).build());
  put(eyes, new Builder().loft([{ y: .08, rx: 0 }, { y: 0, rx: .14, rz: .05, s: 1 }, { y: -.08, rx: 0 }], { n: 6 }).build());
  // tail
  const tail = gs[1]; tail.userData.premiumJoint = undefined;
  const tm = kids(tail);
  if (bear) put(tm[0], new Builder().loft([{ y: .3, rx: 0 }, { y: .1, rx: .26, s: 1 }, { y: -.15, rx: .22, s: .85, k: greenD }, { y: -.3, rx: 0 }], { n: 6 }).build());
  else {
    const stripe = R(furD, '#c4772e');
    const rings: Ring[] = [];
    for (let i = 0; i <= 8; i++) rings.push({ y: .8 - i * .2, rx: .15 - i * .005, cx: Math.sin(i * .3) * .03, s: .9, k: i % 2 ? stripe : undefined });
    put(tm[0], new Builder().loft(rings, { n: 6, top: true, bottom: true }).build());
    put(tm[1], new Builder().loft([{ y: .26, rx: 0, s: 1 }, { y: .1, rx: .22, s: 1, k: R(furD, GOLD) }, { y: -.15, rx: .2, s: .85, k: R(furD, '#5f9a3c') }, { y: -.25, rx: .08, s: .7 }], { n: 6, top: true, bottom: true }).build());
  }
  // legs
  const legs = gs.slice(2);
  const w = bear ? .42 : .3;
  const lgM = legs.map((l) => kids(l)[0]);
  const knM = legs.map((l) => grps(l)[0]);
  const bracer = R(furD, bear ? '#4f7f3a' : '#5f9a3c'), goldL = R(furD, GOLD), stripe = R(furD, bear ? '#4a3228' : '#c4772e');
  const lg = new Builder().loft([
    { y: legH * .275, rx: w * 1.15, s: 1 }, { y: legH * .22, rx: w * 1.25, s: 1.05 }, { y: legH * .05, rx: w * 1.05, s: .95, k: bear ? undefined : stripe },
    { y: -legH * .12, rx: w * .95, s: .9 }, { y: -legH * .15, rx: w * .98, s: .95, k: bracer }, { y: -legH * .275, rx: w * .85, s: .8, k: bracer },
  ], { n: 8, top: true, bottom: true, wob: (ri, i) => ri === 1 && odd(i) ? { dr: .92 } : undefined }).build();
  put(lgM, lg);
  const shinG = new Builder().loft([
    { y: legH * .25, rx: w * .85, s: .95 }, { y: legH * .1, rx: w * .75, s: .9 }, { y: -legH * .05, rx: w * .9, s: .95 }, { y: -legH * .08, rx: w * .92, s: 1, k: bracer }, { y: -legH * .25, rx: w * .78, s: .8, k: goldL },
  ], { n: 8, top: true, bottom: true }).build();
  const shinMs = knM.map((g) => kids(g)[0]); put(shinMs, shinG);
  const pawG = new Builder().box(w * 1.7, .2, w * 2.4, undefined, { tx: .85, tz: .9, s: .85, sTop: 1.05 })
    .box(w * .5, .18, w * .5, xf(w * .55, 0, w * 1.0), { s: .9, sTop: 1 }).box(w * .5, .18, w * .5, xf(-w * .55, 0, w * 1.0), { s: .9, sTop: 1 })
    .box(w * .5, .18, w * .5, xf(0, 0, w * 1.15), { s: .9, sTop: 1 }).build();
  const pawMs = knM.map((g) => kids(g)[1]); put(pawMs, pawG);
  return { body, neck, tail };
}

// ------------------------------------------------------------------------------------------------ factory
export function createPremiumNatureModel(id: 'archer' | 'druid', form: DruidForm = ''): CharacterModel {
  const base = createAdventurer(id, form);
  if (id === 'druid' && form === 'tree') return base; // not pictured: unchanged base
  const owned: THREE.BufferGeometry[] = [];
  const put = setup(owned);
  let animate: CharacterModel['animate'] = (p) => base.animate(p);
  let tags: Record<string, THREE.Object3D | undefined> = {};
  if (id === 'archer') {
    const a = refineArcher(base, put);
    tags = { body: a.body, torso: a.torso, head: a.head, cape: a.capeGrp };
    const _g = new THREE.Vector3(1.5, 0, 0), _h = new THREE.Vector3(), _d = new THREE.Vector3(), _ax = new THREE.Vector3(-1, 0, 0), _q = new THREE.Quaternion();
    animate = (p: CharacterPose) => {
      base.animate(p);
      a.bow.quaternion.copy(a.baseQ); a.bow.position.copy(a.basePos); a.arrowG.scale.set(1, 1, 1); // always start from the pristine grip: no accumulation
      if (p.mode === 'attack') {
        const pr = Math.min(1, Math.max(0, p.progress));
        const w = Math.min(1, pr / .15) * (1 - Math.max(0, (pr - .85) / .15));
        base.root.updateWorldMatrix(true, true);
        a.rightHand.getWorldPosition(_h); a.bow.worldToLocal(_h);
        _d.copy(_h).sub(_g); const len = _d.length();
        if (len > .5) {
          _q.setFromUnitVectors(_ax, _d.divideScalar(len));
          a.bow.quaternion.copy(a.baseQ).slerp(a.baseQ.clone().multiply(_q), w);
          a.bow.position.set(-1.5, 0, 0).applyQuaternion(a.bow.quaternion); // pivot about the palm
          if (pr < .6 && w > .5) {
            const dx = Math.max(-2.6, Math.min(0, 1.5 - len));
            a.str.position.x = Math.min(a.str.position.x, dx * w + a.str.position.x * (1 - w));
            // arrow rest span in group space: nock -0.2 .. tip 1.6. Stretch so nock = string apex and tip passes the palm (x 1.5).
            const ax = a.str.position.x, sx = Math.max(1, (1.72 - ax) / 1.8);
            a.arrowG.scale.x = sx; a.arrowG.position.x = ax + .2 * sx;
          }
        }
      }
      a.str.scale.x = Math.max(.001, -a.str.position.x);
    };
  } else if (form === 'bear' || form === 'tiger') {
    const q = refineQuad(base, put, form === 'bear');
    tags = { body: q.body };
  } else {
    const d = refineDruid(base, put);
    tags = { body: d.body, torso: d.torso, head: d.head };
  }
  for (const [k, o] of Object.entries(tags)) if (o) o.userData.premiumJoint = k;
  // every mesh on a vertex-coloured material needs a colour attribute (others render white)
  const meshes: M[] = [];
  base.root.traverse((o) => { if ((o as M).isMesh) meshes.push(o as M); });
  for (const m of meshes) {
    const g = m.geometry;
    if (!g.attributes.color && (m.material as THREE.MeshLambertMaterial).vertexColors) {
      const n = g.attributes.position.count; g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    }
  }
  const stats = { triangles: countTriangles(base.root), meshes: meshes.length,
    geometries: new Set(meshes.map((m) => m.geometry)).size, materials: base.stats.materials };
  let disposed = false;
  return { root: base.root, stats, animate,
    dispose() { if (disposed) return; disposed = true; owned.forEach((g) => g.dispose()); base.dispose(); } };
}
export type { RGB };
