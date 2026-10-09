import * as THREE from 'three';
import type { ModelId } from './creatures';
import type { DruidForm } from './roster';
import type { Paint } from './polishGeometry';
import type { Part, PolishContext as C } from './polishContext';

const PI = Math.PI;
const strands: Paint = (f) => (f.i % 2 ? 1.08 : .92);
const facets: Paint = (f) => (f.i % 2 ? 1.13 : .85);
const cd = (p: Part) => {
  const g = (p.mesh.geometry as THREE.CylinderGeometry).parameters;
  return { h: g.height, hh: g.height * p.s[1], rr: Math.max(g.radiusTop, g.radiusBottom) * Math.max(p.s[0], p.s[2]) };
};

/* ---------- shared gear ---------- */
function wraps(c: C, p: Part | undefined, ys: number[], r: number, abs?: string, mul = .6) {
  if (p) ys.forEach((y) => c.put(p, 'cyl', [p.p[0], p.p[1] + y, p.p[2]], [r, .1, r], [0, 0, 0], abs, mul, { seg: 6, open: true }, 'grip-wrap'));
}
function ferrule(c: C, p: Part | undefined, y: number, r: number, abs?: string, mul = .7) {
  if (p) c.put(p, 'cone', [p.p[0], p.p[1] + y, p.p[2]], [r, .34, r], [PI, 0, 0], abs, mul, { seg: 6 }, 'ferrule');
}
function collar(c: C, p: Part | undefined, y: number, r: number, abs?: string, mul = 1.35) {
  if (p) c.put(p, 'cyl', [p.p[0], p.p[1] + y, p.p[2]], [r, .2, r], [0, 0, 0], abs, mul, { seg: 6, open: true }, 'collar');
}

function boots(c: C) {
  for (const b of c.find('box', undefined, (p) => p.s[1] <= .4 && p.s[2] >= .9 && p.s[0] >= .55 && p.p[1] < -.4)) {
    c.bevel(b, .05, true, false, 'boots');
    c.paint(b, (f) => (f.cy < -.3 ? .55 : f.cz > .35 && f.ny > .5 ? 1.12 : 1));
    c.put(b, 'box', [b.p[0], b.p[1] + .02, b.p[2] + b.s[2] * .5 - .1], [b.s[0] * .84, b.s[1] * .96, .22], [0, 0, 0], undefined, 1.28, {}, 'toe-cap');
    c.put(b, 'cyl', [b.p[0], b.p[1] + b.s[1] * .5 + .02, b.p[2] - .1], [Math.max(.3, b.s[0] * .46), .16, Math.max(.3, b.s[0] * .46)], [0, 0, 0],
      undefined, 1.65, { seg: 8, open: true }, 'boot-cuff');
  }
}
function belt(c: C, buckle = '#d6b04a') {
  const b = c.one('box', undefined, (p) => p.s[1] >= .19 && p.s[1] <= .3 && p.s[0] >= 1.2 && p.s[2] >= .85 && p.p[1] < .4 && p.p[1] > -.1);
  if (!b) return undefined;
  c.bevel(b, .04, true, true, 'belt');
  const z = b.p[2] + b.s[2] * .5;
  c.put(b, 'box', [0, b.p[1], z + .02], [.3, .2, .07], [0, 0, 0], buckle, 1.3, {}, 'buckle');
  c.put(b, 'box', [0, b.p[1], z + .06], [.14, .1, .05], [0, 0, 0], '#241a14', .3, {}, 'buckle-inset');
  return b;
}
function headOf(c: C) {
  const e = c.one('sphere', undefined, (p) => (p.hex === 'eef7ff' || p.hex === 'e9f7ff') && p.s[0] < .16);
  return e?.g;
}
function face(c: C) {
  const head = headOf(c); if (!head) return undefined;
  const skin = c.one('sphere', undefined, (p) => p.g === head && p.s[0] >= .55 && Math.hypot(...p.p) < .02);
  if (!skin) return undefined;
  const [sx, sy, sz] = skin.s;
  c.paint(skin, (f) => (f.cz > .45 && f.cy < .05 && f.cy > -.55 && Math.abs(f.cx) > .3 ? [1.07, .93, .93] : f.cy < -.6 ? .9 : f.cy > .55 && f.cz > .2 ? 1.06 : 1));
  for (const s of [-1, 1]) c.put(skin, 'box', [s * sx * .97, -.04 * sy, -.05 * sz], [.1, .22, .15], [0, 0, 0], undefined, .96, {}, 'ear');
  for (const e of c.find('sphere', undefined, (p) => p.g === head && (p.hex === 'eef7ff' || p.hex === 'e9f7ff'))) {
    const s = e.p[0] < 0 ? -1 : 1;
    c.put(skin, 'box', [e.p[0], e.p[1] + e.s[1] * .95, e.p[2] - .01], [e.s[0] * 2.4, .035, .06], [0, 0, -s * .15], '#3a2418', .45, {}, 'eyelid');
  }
  if (!c.find('box', '7a3d2c', (p) => p.g === head).length)
    c.put(skin, 'box', [0, -.46 * sy, sz * .89], [sx * .34, .035, .05], [0, 0, 0], '#7a3d2c', .6, {}, 'mouth');
  return { head, skin };
}
function hands(c: C, skinHex: string | undefined, head: THREE.Object3D | undefined, cuff: string) {
  if (!skinHex) return;
  let i = 0;
  for (const h of c.find('sphere', skinHex, (p) => p.s[0] < .3 && p.s[0] >= .2 && p.g !== head)) {
    const side = i++ % 2 ? -1 : 1;
    c.put(h, 'cyl', [h.p[0], h.p[1] + h.s[1] * .95, h.p[2]], [h.s[0] * 1.25, .17, h.s[2] * 1.25], [0, 0, 0], cuff, 1.2, { seg: 8, open: true }, 'cuff');
    c.put(h, 'box', [h.p[0] + side * h.s[0] * .8, h.p[1] + h.s[1] * .15, h.p[2] + h.s[2] * .35], [.07, .16, .1], [0, 0, side * .3], undefined, .97, {}, 'thumb');
  }
}
function robe(c: C) {
  const t = c.one('cylinder', undefined, (p) => { const d = cd(p); return d.hh >= 1.3 && d.rr >= .55 && p.p[1] > 0; });
  if (t) {
    const d = cd(t); const rings = c.retess(t, 3, 'torso-rings') ? 3 : 1;
    c.paint(t, (f) => { const u = f.cy / d.h + .5; return (u < .3 ? .86 : u > .72 ? 1.1 : 1) * (Math.floor(f.i / 2 / rings) % 2 ? 1.04 : .96); });
  }
  const k = c.one('cylinder', undefined, (p) => { const d = cd(p); return d.hh >= .95 && d.hh <= 1.3 && d.rr >= .65 && p.p[1] < 0; });
  if (k) {
    const d = cd(k); const rings = c.retess(k, 2, 'skirt-rings') ? 2 : 1;
    c.paint(k, (f) => ((f.cy / d.h + .5) < .3 ? .82 : 1) * (Math.floor(f.i / 2 / rings) % 2 ? 1.06 : .94));
  }
  return k;
}
function shoulders(c: C, skinHex: string | undefined, abs: string) {
  for (const sh of c.find('sphere', undefined, (p) => p.s[0] >= .4 && p.s[0] <= .56 && p.s[1] >= .3 && p.s[1] <= .42 && p.p[1] < .2 && p.hex !== skinHex)) {
    c.put(sh, 'cyl', [sh.p[0], sh.p[1] - sh.s[1] * .35, sh.p[2]], [sh.s[0] * 1.02, .09, sh.s[2] * 1.02], [0, 0, 0], abs, 1.3, { seg: 8, open: true }, 'pauldron-lame');
    c.put(sh, 'cone', [sh.p[0], sh.p[1] + sh.s[1] * .95, sh.p[2]], [.08, .18, .08], [0, 0, 0], abs, 1.4, { seg: 4 }, 'pauldron-stud');
  }
}
function humanoid(c: C, o: { cuff: string; buckle?: string; accent: string }) {
  boots(c);
  const b = belt(c, o.buckle);
  const f = face(c);
  hands(c, f?.skin.hex, f?.head, o.cuff);
  const skirt = robe(c);
  shoulders(c, f?.skin.hex, o.accent);
  return { belt: b, skirt, head: f?.head, skin: f?.skin };
}
function hem(c: C, host: Part | undefined, skirt: Part | undefined, abs: string, mul = 1.3) {
  if (!host || !skirt) return;
  const d = cd(skirt);
  c.put(host, 'cyl', [skirt.p[0], skirt.p[1] - d.hh * .5 + .06, skirt.p[2]], [d.rr * 1.03 / Math.max(skirt.s[0], skirt.s[2]) * skirt.s[0], .14, d.rr * 1.03 / Math.max(skirt.s[0], skirt.s[2]) * skirt.s[2]],
    [0, 0, 0], abs, mul, { seg: 8, open: true }, 'hem-trim');
}

/* ---------- casters ---------- */
function priest(c: C) {
  const h = humanoid(c, { cuff: '#d6ad52', accent: '#d6ad52' });
  const bt = h.belt;
  c.put(bt, 'box', [0, .1, .56], [.3, .3, .06], [0, 0, PI / 4], '#fff9dd', 1.3, {}, 'sun-medallion');
  c.put(bt, 'box', [0, .1, .6], [.12, .12, .05], [0, 0, PI / 4], '#c9473a', 1, {}, 'ruby');
  c.put(bt, 'box', [.62, -.3, .52], [.16, .7, .05], [0, 0, .12], '#fff9dd', 1.2, {}, 'sash-end');
  hem(c, bt, h.skirt, '#d6ad52');
  const tome = c.one('box', 'fff9dd', (p) => Math.abs(p.p[0] + .9) < .05);
  c.bevel(tome, .02, true, true, 'tome');
  c.putL(tome, 'box', [-.22, 0, 0], [.1, .66, .22], [0, 0, 0], '#7a5a34', .8, {}, 'tome-spine');
  c.putL(tome, 'box', [.04, 0, .11], [.2, .2, .04], [0, 0, 0], '#d6ad52', 1.2, {}, 'tome-clasp');
  const sh = c.one('cylinder', 'c79b3e');
  wraps(c, sh, [-1.3, -1.05, -.8], .19); ferrule(c, sh, -2.1, .2); collar(c, sh, 2.0, .2);
  if (sh) for (const s of [-1, 1]) c.putL(sh, 'cone', [s * .3, 2.15, 0], [.1, .6, .05], [0, 0, -s * 1.0], undefined, 1.35, { seg: 4 }, 'staff-wing');
  c.paint(c.one('sphere', 'f1dfbd'), strands);
}
function frostmage(c: C) {
  const h = humanoid(c, { cuff: '#dff7ff', buckle: '#68b9ed', accent: '#68b9ed' });
  const bt = h.belt;
  for (const a of [0, 1.047, 2.094]) c.put(bt, 'box', [0, .85, .585], [.5, .06, .04], [0, 0, a], '#dff7ff', 1.3, {}, 'snowflake');
  c.put(bt, 'box', [0, .85, .6], [.1, .1, .05], [0, 0, PI / 4], '#68b9ed', 1.2, {}, 'snowflake-core');
  hem(c, bt, h.skirt, '#68b9ed');
  const band = c.one('cylinder', 'd9b84c', (p) => p.s[0] > .8);
  c.put(band, 'box', [0, .68, .9], [.3, .26, .05], [0, 0, 0], '#f0d070', 1.3, {}, 'hat-buckle');
  c.put(band, 'box', [0, .68, .94], [.15, .14, .05], [0, 0, 0], '#295a9b', 1, {}, 'hat-buckle-inset');
  c.paint(c.one('cylinder', '243d82'), (f) => (f.ny > .5 ? 1.12 : 1));
  const sh = c.one('cylinder', '624a31');
  collar(c, sh, 1.95, .21, '#d9b84c'); wraps(c, sh, [-1.3, -1.05], .19, '#dff7ff', 1.2); ferrule(c, sh, -2.1, .2, '#68b9ed');
  if (sh) for (let i = 0; i < 3; i++) {
    const a = i * 2.094;
    c.putL(sh, 'cone', [Math.cos(a) * .32, 2.05, Math.sin(a) * .32], [.07, .7, .07], [Math.sin(a) * .35, 0, -Math.cos(a) * .35], '#68b9ed', 1.2, { seg: 4 }, 'staff-prong');
  }
}
function warlock(c: C) {
  const h = humanoid(c, { cuff: '#5b2378', buckle: '#a14ac2', accent: '#5b2378' });
  const bt = h.belt;
  c.put(bt, 'box', [0, .1, .56], [.22, .26, .06], [0, 0, 0], '#c9b8d6', 1, {}, 'skull-clasp');
  for (const s of [-1, 1]) c.put(bt, 'box', [s * .06, .13, .6], [.05, .06, .05], [0, 0, 0], '#18101f', .3, {}, 'skull-socket');
  c.put(bt, 'box', [0, -.45, .67], [.1, .9, .04], [0, 0, 0], '#5b2378', 1, {}, 'robe-stitch');
  hem(c, bt, h.skirt, '#5b2378');
  const hood = c.one('sphere', '24152f', (p) => p.s[2] < .5);
  c.put(hood, 'cone', [0, -.45, -.7], [.34, .9, .3], [PI + .3, 0, 0], undefined, 1, { seg: 6 }, 'cowl-tail');
  for (const horn of c.find('cone', '18101f')) {
    c.putL(horn, 'cyl', [0, .1, 0], [.11, .08, .11], [0, 0, 0], '#7f42a4', 1, { seg: 6, open: true }, 'horn-ring');
    c.putL(horn, 'cyl', [0, -.15, 0], [.15, .08, .15], [0, 0, 0], '#7f42a4', 1, { seg: 6, open: true }, 'horn-ring');
  }
  const sh = c.one('cylinder', '443022');
  wraps(c, sh, [-.3, .6], .17, '#a14ac2', 1); ferrule(c, sh, -2.1, .2, '#18101f');
}
function shaman(c: C) {
  const h = humanoid(c, { cuff: '#efe6cf', buckle: '#efe6cf', accent: '#5ea8c5' });
  const bt = h.belt;
  c.put(bt, 'box', [0, .1, .56], [.28, .3, .06], [0, 0, 0], '#efe6cf', 1, {}, 'bone-skull');
  for (const s of [-1, 1]) c.put(bt, 'box', [s * .06, .14, .6], [.06, .07, .05], [0, 0, 0], '#2a1d14', .3, {}, 'skull-socket');
  c.put(bt, 'box', [.55, -.3, .52], [.14, .7, .05], [0, 0, .1], '#8a6a48', 1, {}, 'strap');
  hem(c, bt, h.skirt, '#5ea8c5', 1.2);
  for (const f of c.find('sphere', '8a6a48', (p) => p.s[0] > .6)) {
    const s = f.p[0] < 0 ? -1 : 1;
    for (const i of [-1, 0, 1]) c.put(f, 'cone', [s * 1.3 + i * .28, f.p[1] - .3, f.p[2] + i * .06], [.14, .4, .1], [PI, 0, 0], undefined, .9, { seg: 4 }, 'fur-tuft');
  }
  const hd = c.one('box', '54788a');
  c.bevel(hd, .06, true, true, 'hammer-head');
  for (const x of [-.7, .7]) for (const y of [-.3, .3]) c.put(hd, 'cone', [x, hd ? hd.p[1] + y : y, .58], [.1, .14, .1], [PI / 2, 0, 0], '#b9d9df', 1.3, { seg: 4 }, 'rivet');
  for (const s of [-1, 1]) c.put(hd, 'box', [s * .86, 0, 0], [.2, 1.15, 1.15], [0, 0, 0], '#3d5a69', 1, {}, 'hammer-cap');
  const haft = c.one('cylinder', '68452a');
  wraps(c, haft, [-1.0, -.75, -.5], .24, '#d9c9a0', 1); ferrule(c, haft, -1.5, .22, '#b9d9df');
  c.paint(c.one('sphere', '4b2d1d'), strands);
}

/* ---------- adventurers ---------- */
function rogue(c: C) {
  const h = humanoid(c, { cuff: '#15151b', buckle: '#c9a24a', accent: '#15151b' });
  const mask = c.one('box', '17131a');
  c.bevel(mask, .03, true, false, 'mask');
  c.put(mask, 'box', [0, -.15, .62], [.12, .34, .1], [.2, 0, 0], '#241c28', 1, {}, 'mask-ridge');
  for (const b of c.find('cone', 'eef4f8')) c.paint(b, (f) => (f.i % 2 ? 1.2 : .7));
  for (const g of c.find('box', '15151b', (p) => p.s[0] > .5 && p.s[0] < .6)) c.bevel(g, .02, true, true, 'guard');
  for (const g of c.find('cylinder', '4b2c20', (p) => p.s[0] < .12)) wraps(c, g, [-.12, .1], .13, '#8a2a30', 1);
  const pouch = c.one('box', '4a2c20', (p) => Math.abs(p.s[0] - .3) < .01);
  c.bevel(pouch, .03, true, true, 'pouch');
  c.putL(pouch, 'box', [0, .13, .16], [.3, .1, .05], [0, 0, 0], '#2a1810', 1, {}, 'pouch-flap');
  c.putL(pouch, 'box', [0, .06, .19], [.07, .07, .04], [0, 0, 0], '#c9a24a', 1, {}, 'pouch-buckle');
  const sash = c.one('box', 'a92c38', (p) => p.s[1] > .9 && p.s[1] < 1.1);
  c.put(sash, 'box', [-.5, .62, .47], [.28, .2, .1], [0, 0, .3], '#8a1f2c', 1, {}, 'sash-knot');
  for (const s of c.find('sphere', 'a92c38', (p) => p.s[0] < .5 && p.s[0] > .4)) {
    const sg = s.g.position.x < 0 ? -1 : 1;
    c.put(s, 'cone', [0, s.p[1] + .3, 0], [.09, .3, .09], [0, 0, -sg * .35], '#15151b', 1, { seg: 4 }, 'shoulder-spike');
  }
}
function paladin(c: C) {
  const h = humanoid(c, { cuff: '#d6a83f', buckle: '#d6a83f', accent: '#d6a83f' });
  const helm = c.one('sphere', 'd8b34f');
  c.put(helm, 'cyl', [0, .02, 0], [.7, .07, .69], [0, 0, 0], '#f5e8b2', 1.1, { seg: 8, open: true }, 'helm-band');
  for (const b of c.find('box', 'd8b34f', (p) => p.s[0] < .15 && p.s[1] > .55)) c.bevel(b, .02, true, true, 'cheek-guard');
  c.bevel(c.one('box', 'd8b34f', (p) => p.s[0] > .7), .03, true, true, 'helm-brim');
  const tab = c.one('box', 'f5e8b2', (p) => Math.abs(p.s[1] - 1.1) < .01);
  c.put(tab, 'box', [0, 1.2, .55], [.36, .09, .04], [0, 0, 0], '#35558a', 1, {}, 'tabard-cross');
  c.put(tab, 'box', [0, 1.1, .55], [.09, .55, .04], [0, 0, 0], '#35558a', 1, {}, 'tabard-cross');
  const head = c.one('box', 'd6a83f', (p) => Math.abs(p.s[1] - .9) < .02);
  c.bevel(head, .07, true, true, 'hammer-head');
  for (const z of [-.86, .86]) c.put(head, 'box', [0, head ? head.p[1] : 2, z], [.5, .5, .06], [0, 0, 0], '#f5e8b2', 1.1, {}, 'hammer-face');
  const sh = c.one('cylinder', '6d4829');
  wraps(c, sh, [-.5, -.25, 0], .18, '#2b1c12', 1); ferrule(c, sh, -1.0, .2, '#d6a83f'); collar(c, sh, 1.6, .2, '#d6a83f');
  const rim = c.one('other', 'd6a83f');
  if (rim) {
    for (const [x, y] of [[-.67, .93], [.67, .93], [-.67, 0], [.67, 0], [0, -1.2]]) c.put(rim, 'cone', [x, y, .17], [.07, .1, .07], [PI / 2, 0, 0], '#fff0b8', 1, { seg: 4 }, 'shield-rivet');
    c.put(rim, 'cone', [0, .35, .26], [.2, .2, .14], [PI / 2, 0, 0], '#d6a83f', 1.2, { seg: 6 }, 'shield-boss');
  }
}
function archer(c: C) {
  const h = humanoid(c, { cuff: '#4a321f', buckle: '#c9a24a', accent: '#9bc467' });
  const hood = c.one('sphere', '355b2d', (p) => p.s[0] > .7);
  c.put(hood, 'cone', [.55, .55, -.05], [.07, .6, .05], [0, 0, -.9], '#b8ff68', 1, { seg: 4 }, 'hood-feather');
  c.bevel(c.one('box', '355b2d', (p) => Math.abs(p.s[0] - .82) < .01), .02, true, true, 'hood-peak');
  for (const s of c.find('sphere', '6f9d49', (p) => p.s[0] < .5)) {
    const sg = s.g.position.x < 0 ? -1 : 1;
    for (const i of [-1, 0, 1]) c.put(s, 'cone', [sg * .32, .05, i * .26], [.1, .5, .03], [0, 0, -sg * (PI / 2 + .5)], '#9bc467', 1, { seg: 4 }, 'leaf-pauldron');
  }
  const q = c.one('cylinder', '4a321f', (p) => Math.abs(p.s[0] - 1) < .01 && cd(p).h > 1.5);
  c.put(q, 'cyl', [0, .8, 0], [.31, .1, .31], [0, 0, 0], '#6f4a2a', 1, { seg: 7, open: true }, 'quiver-rim');
  c.put(q, 'cyl', [0, .55, 0], [.3, .08, .3], [0, 0, 0], '#8a5a2e', 1, { seg: 7, open: true }, 'quiver-band');
  c.put(q, 'cyl', [0, -.55, 0], [.24, .08, .24], [0, 0, 0], '#8a5a2e', 1, { seg: 7, open: true }, 'quiver-band');
  const strap = c.one('box', '4a321f', (p) => Math.abs(p.s[1] - 1.7) < .01);
  c.putL(strap, 'box', [0, 0, .04], [.2, .2, .05], [0, 0, 0], '#c9a24a', 1, {}, 'strap-buckle');
  c.paint(c.one('ring', 'b77a35'), (f) => (Math.abs(f.cy) > 1.35 && f.cy > 0 ? .5 : Math.abs(f.cx) > 1.3 ? 1.35 : 1));
  const arrow = c.one('cylinder', 'b8ff68', (p) => p.s[1] > 1);
  c.putL(arrow, 'box', [0, -.78, 0], [.14, .3, .02], [0, 0, 0], '#e7d7ae', 1, {}, 'fletch');
  c.putL(arrow, 'box', [0, -.78, 0], [.02, .3, .14], [0, 0, 0], '#e7d7ae', 1, {}, 'fletch');
}
function druidHuman(c: C) {
  const h = humanoid(c, { cuff: '#6a4529', buckle: '#78a84f', accent: '#78a84f' });
  c.put(h.belt, 'box', [0, h.belt ? h.belt.p[1] : .3, .47], [.2, .2, .06], [0, 0, PI / 4], '#78a84f', 1.2, {}, 'leaf-knot');
  const hair = c.one('sphere', '503522', (p) => p.s[0] > .6);
  for (const i of [-1, 0, 1]) c.put(hair, 'cone', [i * .28, .62, .48], [.1, .38, .03], [.9, 0, -i * .3], '#78a84f', 1, { seg: 4 }, 'leaf-crown');
  c.paint(hair, strands);
  for (const a of c.find('cylinder', '7d5a32')) c.put(a, 'cyl', [a.p[0], a.p[1] - .2, a.p[2]], [.1, .06, .1], [0, 0, 0], '#4a321f', 1, { seg: 5, open: true }, 'bark-band');
  const sh = c.one('cylinder', '79522e');
  wraps(c, sh, [-.6, -.35, 1.0], .14, '#4f8a3a', 1); ferrule(c, sh, -1.8, .14, '#4a321f');
  c.put(sh, 'cone', [.1, .6, 0], [.08, .35, .03], [0, 0, -1.0], '#5fae3f', 1, { seg: 4 }, 'staff-leaf');
}
function quadruped(c: C, bear: boolean) {
  const fur = bear ? '65452f' : 'b66a2d', furL = bear ? 'a47a52' : 'e7a04a', furD = bear ? '33251e' : '4a2b1d';
  const body = c.one('sphere', fur, (p) => p.s[2] > 1.3);
  if (bear) c.paint(c.one('sphere', furL, (p) => p.s[2] > 1.1), (f) => (f.cz > .3 && f.cy < .1 ? 1.12 : 1));
  else c.paint(body, (f) => (f.cy > -.25 && Math.sin(f.cz * 7.5) > .55 ? [.5, .42, .4] : 1));
  const hs = bear ? 1 : .8;
  const head = c.one('sphere', bear ? fur : furL, (p) => p.g !== body?.g && p.p[0] === 0 && p.s[0] > .6 && p.s[0] < .9);
  for (const s of [-1, 1]) c.put(head, 'box', [s * .33 * hs, .36 * hs, .7 * hs], [.3, .07, .1], [0, 0, s * .3], '#' + furD, .5, {}, 'brow');
  for (const e of c.find('sphere', furD, (p) => p.s[2] < .2 && p.s[0] > .25)) {
    const s = e.p[0] < 0 ? -1 : 1;
    c.put(e, 'box', [e.p[0], e.p[1], e.p[2] + .12], [.18, .18, .04], [0, 0, PI / 4], '#d8908a', 1, {}, 'ear-inner');
    void s;
  }
  c.bevel(c.one('box', undefined, (p) => p.hex === (bear ? 'c59b70' : 'e9bd7a') && p.s[0] > .4), .03, true, true, 'muzzle');
  for (const paw of c.find('box', '2a1b14')) {
    c.bevel(paw, .03, true, false, 'paw');
    for (const x of [-.55, 0, .55]) c.put(paw, 'cone', [paw.p[0] + x * paw.s[0] * .5, paw.p[1], paw.p[2] + paw.s[2] * .5 + .04], [.045, .2, .045], [PI / 2, 0, 0], '#f4f0e0', 1, { seg: 3 }, 'claw');
  }
  for (const leg of c.find('cylinder', furD, (p) => cd(p).hh > .5)) c.paint(leg, (f) => (f.cy < -.2 ? .85 : 1));
}
function tree(c: C) {
  const trunk = c.one('cylinder', 'a77943', (p) => cd(p).hh > 3);
  if (trunk) {
    c.retess(trunk, 3, 'trunk-rings');
    c.paint(trunk, (f) => (Math.floor(f.i / 6) % 2 ? 1.08 : .92) * (f.cy < -.9 ? .85 : 1));
    for (const s of [-1, 1]) {
      c.put(trunk, 'box', [s * .3, 2.35, .9], [.24, .12, .05], [0, 0, 0], '#8fe6ff', 1, {}, 'eye');
      c.put(trunk, 'box', [s * .32, 2.58, .92], [.42, .1, .06], [0, 0, -s * .35], '#2d2117', 1, {}, 'brow');
    }
    c.put(trunk, 'cone', [0, 2.05, .9], [.14, .42, .14], [PI - .15, 0, 0], '#7a5430', 1, { seg: 4 }, 'nose');
    c.put(trunk, 'box', [0, 1.7, .92], [.5, .08, .05], [0, 0, 0], '#2d2117', 1, {}, 'mouth');
  }
  c.paint(c.one('cylinder', '7a5430'), (f) => (f.i % 2 ? 1.1 : .9));
  const top = c.one('sphere', 'a0c95c');
  for (let i = 0; i < 4; i++) { const a = i * PI / 2 + .4; c.put(top, 'cone', [.2 + Math.cos(a) * .55, 1.55, .4 + Math.sin(a) * .55], [.12, .5, .1], [Math.sin(a) * .5, 0, -Math.cos(a) * .5], '#c7e37a', 1, { seg: 4 }, 'leaf-spike'); }
  for (const b of c.find('sphere', undefined, (p) => p.s[0] >= .9 && p.s[1] <= 1.3 && p.p[1] > -.5 && p.hex !== '000000' && p.g.position.y > 3)) c.paint(b, (f) => (f.ny > .4 ? 1.14 : 1));
  for (const r of c.find('cone', '2d2117')) c.paint(r, facets);
}

/* ---------- warrior ---------- */
function warrior(c: C) {
  const helm = c.one('sphere', 'c4962e', (p) => p.s[0] > .8 && p.s[0] < .9);
  c.put(helm, 'cyl', [0, -.05, -.02], [.84, .08, .8], [0, 0, 0], '#e6bd52', 1, { seg: 8, open: true }, 'helm-band');
  for (const p of c.find('sphere', 'c4962e', (q) => q.s[0] > 1.1)) {
    const s = p.p[0] < 0 ? -1 : 1;
    c.put(p, 'cyl', [p.p[0], p.p[1] - .18, p.p[2]], [1.17, .12, 1.02], [0, 0, -s * .15], '#e6bd52', 1, { seg: 8, open: true }, 'pauldron-lame');
  }
  for (const k of c.find('sphere', 'c4962e', (q) => q.s[0] < .4 && q.s[0] > .3)) c.put(k, 'cone', [k.p[0], k.p[1], k.p[2] + .24], [.1, .24, .1], [PI / 2, 0, 0], '#bfc8d2', 1, { seg: 4 }, 'knee-spike');
  const bt = c.one('box', '33241c', (p) => p.s[0] > 1.6);
  c.bevel(bt, .04, true, true, 'belt');
  for (const x of [-.75, .75]) c.put(bt, 'box', [x, bt ? bt.p[1] : 0, .5], [.14, .14, .05], [0, 0, 0], '#e6bd52', 1, {}, 'belt-stud');
  c.put(c.one('other', 'c99a3c'), 'box', [0, -.05, .3], [.2, .2, .08], [0, 0, PI / 4], '#9d302e', 1, {}, 'guard-gem');
}

/* ---------- bosses ---------- */
function bossCommon(c: C, skin: string, wrap: string) {
  for (const b of c.find('box', undefined, (p) => p.s[2] >= 1.7 && p.s[1] <= .5 && p.p[1] < -.5)) {
    c.bevel(b, .08, true, false, 'boss-boots');
    c.paint(b, (f) => (f.cy < -.3 ? .55 : f.cz > .35 && f.ny > .5 ? 1.12 : 1));
    c.put(b, 'box', [b.p[0], b.p[1] + .02, b.p[2] + b.s[2] * .5 - .15], [b.s[0] * .85, b.s[1], .3], [0, 0, 0], undefined, 1.25, {}, 'toe-cap');
    c.put(b, 'cyl', [b.p[0], b.p[1] + .25, b.p[2] - .4], [.7, .2, .7], [0, 0, 0], undefined, 1.5, { seg: 8, open: true }, 'boot-cuff');
  }
  for (const f of c.find('sphere', skin, (p) => p.s[0] >= .65 && p.p[1] < -1.5)) {
    c.put(f, 'box', [f.p[0], f.p[1] - .02, f.p[2] + f.s[2] * .85], [f.s[0] * 1.35, .2, .3], [0, 0, 0], undefined, 1.18, {}, 'knuckles');
    const r = f.s[0] * .9;
    c.put(f, 'cyl', [f.p[0], f.p[1] + f.s[1], f.p[2]], [r, .24, r], [0, 0, 0], wrap, 1, { seg: 8, open: true }, 'wrist-wrap');
  }
  const t = c.one('cylinder', undefined, (p) => cd(p).hh >= 2.5 && cd(p).rr > 1.2);
  if (t) {
    const d = cd(t); const rings = c.retess(t, 4, 'torso-rings') ? 4 : 1;
    c.paint(t, (f) => { const u = f.cy / d.h + .5; return (u < .3 ? .88 : u > .75 ? 1.1 : 1) * (Math.floor(f.i / 2 / rings) % 2 ? 1.06 : .94); });
  }
}
function bossFrost(c: C) {
  bossCommon(c, '7fa9c6', '#3b556b');
  const face = c.one('sphere', '7fa9c6', (p) => p.s[0] < .9 && p.s[2] < .6);
  c.put(face, 'box', [0, .34, .98], [.9, .12, .18], [0, 0, 0], '#4a6f8c', 1, {}, 'brow-ridge');
  for (const s of [-1, 1]) {
    c.put(face, 'box', [s * .55, -.15, .95], [.3, .05, .06], [0, 0, s * .5], '#d8fbff', 1.2, {}, 'ice-scar');
    c.put(face, 'cone', [s * .4, -.45, 1.0], [.09, .42, .09], [PI, 0, 0], '#fff6df', 1, { seg: 6 }, 'tusk');
  }
  for (const s of c.find('sphere', 'dcecf7', (p) => p.s[0] < .9 && p.s[0] > .7 && p.p[1] === 0)) {
    c.put(s, 'cyl', [0, 0, 0], [.84, .1, .78], [0, 0, 0], '#8fb8d4', 1, { seg: 8, open: true }, 'ice-band');
  }
  c.paint(c.one('sphere', 'f2f9ff', (p) => p.s[0] > 1), strands);
}
function bossDemon(c: C) {
  bossCommon(c, 'a02430', '#2a0a10');
  const torso = c.one('cylinder', '8a1c26', (p) => cd(p).hh > 2.5);
  for (const s of [-1, 1]) for (const y of [.9, 1.5]) c.put(torso, 'box', [s * .55, y, .8], [.7, .07, .05], [0, 0, -s * .35], '#d4552a', 1.3, {}, 'ember-rib');
  const head = c.one('sphere', 'b83036');
  for (const s of [-1, 1]) c.put(head, 'cone', [s * .95, -.1, .5], [.1, .5, .1], [0, 0, -s * (PI / 2 + .3)], '#d8c8a6', 1, { seg: 4 }, 'cheek-spike');
  for (const p of c.find('sphere', 'b02a30')) {
    const s = p.p[0] < 0 ? -1 : 1;
    c.put(p, 'cone', [p.p[0], p.p[1] + .55, p.p[2]], [.18, .6, .18], [0, 0, -s * .25], '#f2e6d2', 1, { seg: 5 }, 'shoulder-spike');
  }
  for (const k of c.find('cylinder', '6a1620', (p) => Math.abs(p.p[1] + .5) < .01)) c.put(k, 'cone', [0, k.p[1] + .05, .55], [.2, .5, .2], [PI / 2, 0, 0], '#f2e6d2', 1, { seg: 4 }, 'knee-spike');
  const tail = c.one('cylinder', '8a1c26', (p) => Math.abs(p.s[1] - 2) < .01);
  for (const t of [-.6, 0, .6]) c.putL(tail, 'cone', [0, t, 0], [.14, .34, .14], [PI / 2, 0, 0], '#d8c8a6', 1, { seg: 4 }, 'tail-spike');
}
function bossTemple(c: C) {
  bossCommon(c, 'e6bd52', '#454d5a');
  const plate = c.one('box', 'f0d070', (p) => Math.abs(p.s[0] - 1.9) < .01);
  c.bevel(plate, .06, true, true, 'chest-plate');
  c.put(plate, 'box', [0, 1.8, .9], [.1, .7, .04], [0, 0, 0], '#8a6a1e', 1, {}, 'engraving');
  for (const x of [-.8, .8]) for (const y of [1.55, 2.05]) c.put(plate, 'cone', [x, y, .9], [.09, .12, .09], [PI / 2, 0, 0], '#fff3b0', 1, { seg: 4 }, 'rivet');
  const sash = c.one('box', '9d302e', (p) => Math.abs(p.s[0] - .9) < .01);
  c.bevel(sash, .03, true, true, 'sash');
  c.put(sash, 'box', [0, -.62, .92], [.95, .08, .05], [0, 0, 0], '#f0d070', 1, {}, 'sash-hem');
  for (const s of [-1, 1]) c.put(sash, 'box', [s * .45, .1, .92], [.06, 1.5, .05], [0, 0, 0], '#f0d070', 1, {}, 'sash-edge');
  const bt = c.one('box', '33241c', (p) => p.s[0] > 2.5);
  for (const x of [-1.1, -.55, .55, 1.1]) c.put(bt, 'box', [x, 0.45, .82], [.16, .16, .05], [0, 0, 0], '#f0d070', 1, {}, 'belt-stud');
  for (const p of c.find('sphere', 'd1a13e', (q) => q.s[0] > 1)) {
    const s = p.p[0] < 0 ? -1 : 1;
    c.put(p, 'cyl', [p.p[0], p.p[1] - .08, p.p[2]], [1.12, .12, 1.02], [0, 0, -s * .15], '#f0d070', 1.1, { seg: 8, open: true }, 'pauldron-lame');
  }
  const gold = c.one('sphere', 'd1a13e', (p) => p.s[0] > 1.05 && p.s[0] < 1.2 && p.s[1] > 1);
  c.put(gold, 'cyl', [0, -.12, 0], [1.1, .1, 1.04], [0, 0, 0], '#f0d070', 1, { seg: 8, open: true }, 'helm-rim');
  const visor = c.one('box', '2a1d1c', (p) => Math.abs(p.s[0] - 1.15) < .01);
  c.bevel(visor, .04, true, true, 'visor');
  for (const x of [-.3, 0, .3]) c.put(visor, 'box', [x, -.2, .99], [.05, .5, .04], [0, 0, 0], '#454d5a', 1, {}, 'visor-bar');
  for (const cheek of c.find('box', 'd1a13e', (p) => Math.abs(p.s[0] - .2) < .01)) c.bevel(cheek, .03, true, true, 'cheek');
  const cape = c.one('box', '9d302e', (p) => Math.abs(p.s[0] - 1.8) < .01);
  c.put(cape, 'box', [0, -1.68, -.95], [1.85, .1, .05], [0, 0, 0], '#f0d070', 1, {}, 'cape-hem');
  const staff = c.one('cylinder', '744628', (p) => p.s[1] > 4);
  wraps(c, staff, [-1.0, -.7], .22, '#d1a13e', 1); collar(c, staff, 2.0, .24, '#f0d070');
  if (staff) for (let i = 0; i < 4; i++) {
    const a = PI / 4 + i * PI / 2;
    c.put(staff, 'cone', [Math.cos(a) * 1.2, 2.9 + Math.sin(a) * 1.2, 0], [.12, .55, .06], [0, 0, a - PI / 2], '#f0d070', 1, { seg: 4 }, 'sun-ray');
  }
}

/* ---------- pets and minions ---------- */
function hawk(c: C) {
  const body = c.one('sphere', '8a5a34', (p) => p.s[2] > 1);
  c.paint(body, (f) => (f.cy > .3 ? .9 : 1));
  c.paint(c.one('sphere', 'c89a62'), (f) => (f.i % 3 === 0 ? .8 : 1));
  const head = c.one('sphere', '8a5a34', (p) => p.s[0] < .5);
  for (const s of [-1, 1]) c.put(head, 'box', [s * .2, .22, .28], [.22, .05, .1], [0, 0, s * .25], '#2a1a10', .5, {}, 'brow');
  c.put(c.one('cone', 'e0a84a'), 'cone', [0, -.14, .74], [.07, .2, .07], [PI + .4, 0, 0], '#b8832e', 1, { seg: 4 }, 'beak-hook');
  for (const w of c.find('box', '4d3220', (p) => Math.abs(p.s[0] - 1.6) < .01)) {
    const s = w.p[0] < 0 ? -1 : 1;
    for (let i = 0; i < 3; i++) c.put(w, 'box', [w.p[0] + s * (-.5 + i * .5), 0, -.58], [.34, .04, .3], [0, s * .15, 0], '#2a1a10', .6, {}, 'primary-feather');
  }
  const tail = c.one('box', '4d3220', (p) => Math.abs(p.s[0] - .55) < .01);
  for (const s of [-1, 1]) c.put(tail, 'box', [s * .18, tail ? tail.p[1] : 0, tail ? tail.p[2] - .5 : -.95], [.2, .04, .5], [0, s * .2, 0], '#c89a62', 1, {}, 'tail-feather');
  for (const f of c.find('box', 'e0a84a', (p) => Math.abs(p.s[2] - .3) < .01))
    for (const x of [0]) c.put(f, 'cone', [f.p[0] + x, f.p[1], f.p[2] + .18], [.05, .2, .05], [PI / 2, 0, 0], undefined, 1, { seg: 3 }, 'talon');
}
function snake(c: C) {
  for (const s of [...c.find('sphere', '3b6f2c', (p) => Math.abs(p.s[2] - .5) < .01), ...c.find('sphere', '6fb84a', (p) => Math.abs(p.s[2] - .5) < .01)])
    c.paint(s, (f) => (f.ny > .3 && Math.abs(f.cx) < .5 ? .72 : 1));
  const head = c.one('sphere', '6fb84a', (p) => Math.abs(p.s[2] - .7) < .01);
  c.paint(head, (f) => (f.cy > .3 ? [.65, .8, .55] : 1));
  for (const s of [-1, 1]) {
    c.put(head, 'box', [s * .3, .28, .3], [.22, .06, .2], [0, -s * .2, 0], '#3b6f2c', 1, {}, 'brow');
    c.put(head, 'cone', [s * .14, -.2, .5], [.04, .22, .04], [PI, 0, 0], '#f4f0e0', 1, { seg: 3 }, 'fang');
    c.put(head, 'box', [s * .12, .1, .68], [.04, .04, .04], [0, 0, 0], '#1d3a14', .4, {}, 'nostril');
  }
}
function turtle(c: C) {
  const shell = c.one('sphere', '4f8b63', (p) => p.s[2] > 1.2);
  c.paint(shell, (f) => (f.cy < .45 ? .78 : f.i % 2 ? 1.1 : .9));
  const head = c.one('sphere', '7aa86a', (p) => p.s[2] > .5 && p.s[2] < .6);
  c.put(head, 'box', [0, -.14, .52], [.3, .04, .06], [0, 0, 0], '#3b5a30', .8, {}, 'mouth');
  for (const s of [-1, 1]) c.put(head, 'box', [s * .28, .25, .3], [.2, .05, .1], [0, 0, s * .25], '#3b5a30', .8, {}, 'brow');
  for (const f of c.find('box', '315a42', (p) => Math.abs(p.s[2] - .75) < .01))
    for (const x of [-.18, 0, .18]) c.put(f, 'cone', [f.p[0] + x, f.p[1], f.p[2] + .4], [.045, .18, .045], [PI / 2, 0, 0], '#e0f2b8', 1, { seg: 3 }, 'claw');
  for (const l of c.find('box', '7aa86a', (p) => Math.abs(p.s[0] - .55) < .01)) c.paint(l, (f) => (f.i % 2 ? 1.06 : .94));
  c.paint(c.one('cylinder', '315a42'), (f) => (f.cy < 0 ? .8 : 1));
}
function elemental(c: C) {
  for (const k of c.find('cone')) c.paint(k, facets);
  const shape = c.one('cone', 'dffbff', (p) => p.s[1] > 1.7);
  const low = c.one('cone', '7fcff0', (p) => p.s[1] > 1.7);
  for (let i = 0; i < 4; i++) {
    const a = i * PI / 2 + PI / 4; const r = .62;
    c.put(shape, 'cone', [Math.cos(a) * r, 1.1, Math.sin(a) * r], [.15, .6, .15], [Math.sin(a) * .45, 0, -Math.cos(a) * .45], '#bff0ff', 1, { seg: 4 }, 'crystal-fin');
    c.put(low, 'cone', [Math.cos(a) * r, -1.1, Math.sin(a) * r], [.15, .6, .15], [PI + Math.sin(a) * .45, 0, Math.cos(a) * .45], '#7fcff0', 1, { seg: 4 }, 'crystal-fin');
  }
}
function hound(c: C) {
  const body = c.one('sphere', '2a1716', (p) => p.s[2] > 1.5);
  c.paint(body, (f) => (Math.abs(f.cx) > .6 && f.cy < .2 && Math.sin(f.cz * 14) > .2 ? .72 : 1));
  for (const a of [-.9, -.45, 0, .45, .9]) c.put(body, 'cone', [Math.sin(a) * .85, .25 + Math.cos(a) * .6, 1.35], [.1, .32, .1], [0, 0, -a], '#ff6a2a', 1.2, { seg: 4 }, 'collar-spike');
  const head = c.one('sphere', '2a1716', (p) => p.s[0] < .8 && p.s[0] > .6);
  for (const s of [-1, 1]) c.put(head, 'box', [s * .32, .4, .4], [.3, .07, .12], [0, 0, s * .3], '#150c0d', .5, {}, 'brow');
  const muzzle = c.one('box', '2a1716', (p) => Math.abs(p.s[0] - .5) < .01);
  c.bevel(muzzle, .03, true, true, 'muzzle');
  c.put(muzzle, 'box', [0, muzzle ? muzzle.p[1] + .1 : .2, muzzle ? muzzle.p[2] + .3 : 1], [.2, .12, .1], [0, 0, 0], '#0a0506', .3, {}, 'nose-pad');
  c.bevel(c.one('box', '150c0d', (p) => Math.abs(p.s[0] - .5) < .01), .02, true, true, 'jaw');
  for (const l of c.find('box', '2a1716', (p) => Math.abs(p.s[1] - 1.2) < .01)) c.paint(l, (f) => (f.cy < -.25 ? .8 : 1));
}
function guard(c: C) {
  const t = c.one('box', '4a3b45', (p) => Math.abs(p.s[0] - 1.6) < .01);
  c.bevel(t, .07, true, true, 'cuirass');
  c.put(t, 'box', [0, .95, .52], [1.1, .8, .08], [0, 0, 0], '#6a5360', 1, {}, 'breastplate');
  c.put(t, 'box', [0, .95, .58], [.12, .8, .06], [0, 0, 0], '#a8793a', 1, {}, 'breast-ridge');
  for (const p of c.find('cone', '4a3b45')) {
    const s = p.p[0] < 0 ? -1 : 1;
    c.put(p, 'cone', [p.p[0] - s * .1, p.p[1] + .2, p.p[2]], [.1, .3, .1], [0, 0, 0], '#d9c7a0', 1, { seg: 4 }, 'pauldron-spike');
  }
  c.bevel(c.one('box', '4a3b45', (p) => Math.abs(p.s[0] - .95) < .01), .03, true, true, 'helm');
  const shield = c.one('box', '4a3b45', (p) => Math.abs(p.s[0] - .2) < .01);
  c.bevel(shield, .03, true, true, 'shield');
  const blade = c.one('box', 'cfc6c0');
  c.put(blade, 'box', [0, .17, blade ? blade.p[2] + .05 : 1.15], [.1, .04, 1.2], [0, 0, 0], '#8f8780', 1, {}, 'fuller');
  c.bevel(c.one('box', 'a8793a', (p) => Math.abs(p.s[2] - .6) < .01), .02, true, true, 'crossguard');
  for (const l of c.find('box', '241a22', (p) => Math.abs(p.s[1] - 1.2) < .01)) c.paint(l, (f) => (f.cy < -.3 ? .8 : 1));
}

export function applyRecipe(c: C, id: ModelId, form: DruidForm) {
  switch (id) {
    case 'priest': return priest(c);
    case 'frostmage': return frostmage(c);
    case 'warlock': return warlock(c);
    case 'shaman': return shaman(c);
    case 'rogue': return rogue(c);
    case 'paladin': return paladin(c);
    case 'archer': return archer(c);
    case 'warrior': return warrior(c);
    case 'druid': return form === 'bear' ? quadruped(c, true) : form === 'tiger' ? quadruped(c, false) : form === 'tree' ? tree(c) : druidHuman(c);
    case 'boss-frost': return bossFrost(c);
    case 'boss-demon': return bossDemon(c);
    case 'boss-temple': return bossTemple(c);
    case 'pet-archer': return hawk(c);
    case 'pet-archer-snake': return snake(c);
    case 'pet-archer-turtle': return turtle(c);
    case 'pet-frostmage': return elemental(c);
    case 'add-hound': return hound(c);
    case 'add-guard': return guard(c);
  }
}
