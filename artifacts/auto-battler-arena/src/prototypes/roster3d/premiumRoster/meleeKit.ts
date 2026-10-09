import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RGB } from '../magePremiumGeometry';

/** Melee-only geometry helpers: convex prisms and closed two-layer sheets (cloaks, tabards), indexed + vertex shaded. */
const _v = new THREE.Vector3();

class Raw {
  p: number[] = []; c: number[] = []; ix: number[] = [];
  v(x: number, y: number, z: number, s = 1, k?: RGB, m?: THREE.Matrix4) {
    _v.set(x, y, z); if (m) _v.applyMatrix4(m);
    this.p.push(_v.x, _v.y, _v.z); this.c.push(s * (k?.[0] ?? 1), s * (k?.[1] ?? 1), s * (k?.[2] ?? 1));
    return this.p.length / 3 - 1;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.ix); g.computeVertexNormals();
    return g;
  }
}

export interface PrismOpts { inset?: number; s?: number; sTop?: number; k?: RGB; kTop?: RGB; m?: THREE.Matrix4 }
/** Closed prism from a convex / star-shaped CCW polygon (viewed from +z); top face optionally inset (bevel). */
export function prism(poly: [number, number][], z0: number, z1: number, o: PrismOpts = {}) {
  const r = new Raw(); const n = poly.length; let cx = 0, cy = 0;
  poly.forEach(([x, y]) => { cx += x; cy += y; }); cx /= n; cy /= n;
  const ins = o.inset ?? 0, s = o.s ?? 1, st = o.sTop ?? s, kt = o.kTop ?? o.k;
  const bot = poly.map(([x, y]) => r.v(x, y, z0, s, o.k, o.m));
  const top = poly.map(([x, y]) => r.v(cx + (x - cx) * (1 - ins), cy + (y - cy) * (1 - ins), z1, st, kt, o.m));
  const cb = r.v(cx, cy, z0, s, o.k, o.m), ct = r.v(cx, cy, z1, st, kt, o.m);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    r.ix.push(bot[i], bot[j], top[j], bot[i], top[j], top[i], ct, top[i], top[j], cb, bot[j], bot[i]);
  }
  return r.build();
}

export interface SheetPt { x: number; y: number; z: number; s?: number; k?: RGB }
/** Closed two-layer sheet over a (rows+1) x (cols+1) grid, back layer offset by -thick in z. */
export function sheet(rows: number, cols: number, f: (r: number, c: number) => SheetPt, thick: number, m?: THREE.Matrix4) {
  const r = new Raw(); const F: number[][] = [], B: number[][] = [];
  for (let i = 0; i <= rows; i++) {
    F.push([]); B.push([]);
    for (let j = 0; j <= cols; j++) {
      const p = f(i, j);
      F[i].push(r.v(p.x, p.y, p.z, p.s ?? 1, p.k, m));
      B[i].push(r.v(p.x, p.y, p.z - thick, (p.s ?? 1) * 0.82, p.k, m));
    }
  }
  const q = (L: number[][], i: number, j: number, flip: boolean) => {
    const a = L[i][j], b = L[i + 1][j], c = L[i + 1][j + 1], d = L[i][j + 1];
    if (flip) r.ix.push(a, d, b, b, d, c); else r.ix.push(a, b, d, b, c, d);
  };
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { q(F, i, j, false); q(B, i, j, true); }
  const edge = (a: number, b: number, c: number, d: number) => r.ix.push(a, b, c, a, c, d);
  for (let i = 0; i < rows; i++) {
    edge(F[i][0], B[i][0], B[i + 1][0], F[i + 1][0]);
    edge(F[i][cols], F[i + 1][cols], B[i + 1][cols], B[i][cols]);
  }
  for (let j = 0; j < cols; j++) {
    edge(F[0][j], F[0][j + 1], B[0][j + 1], B[0][j]);
    edge(F[rows][j], B[rows][j], B[rows][j + 1], F[rows][j + 1]);
  }
  return r.build();
}

export const merge = (gs: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(gs, false)!;
  gs.forEach((x) => x.dispose());
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
};
