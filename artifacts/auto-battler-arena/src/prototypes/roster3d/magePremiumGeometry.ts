import * as THREE from 'three';

/** One cross-section of a loft. Rings are listed top to bottom (same winding as THREE.CylinderGeometry). */
export type RGB = [number, number, number];
/** Per-channel vertex multiplier that turns a host material colour into a target colour (linear space). */
export const ratio = (host: string, target: string): RGB => {
  const f = (c: string) => new THREE.Color(c.startsWith('#') ? c : '#' + c);
  const h = f(host), t = f(target);
  return [t.r / Math.max(h.r, 0.004), t.g / Math.max(h.g, 0.004), t.b / Math.max(h.b, 0.004)];
};
export interface Ring { y: number; rx: number; rz?: number; cx?: number; cz?: number; s?: number; k?: RGB }
export type Wob = (ring: number, i: number, angle: number) => { dr?: number; dy?: number; s?: number; k?: RGB } | void;
export interface LoftOpts { tint?: RGB; n?: number; top?: boolean; bottom?: boolean; wob?: Wob; m?: THREE.Matrix4 }

const _v = new THREE.Vector3();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _one = new THREE.Vector3(1, 1, 1);

export const xf = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)).clone(), _one);

/** Indexed, vertex-shaded geometry builder. Shade is a brightness multiplier on the (shared) material colour. */
export class Builder {
  private p: number[] = [];
  private c: number[] = [];
  private ix: number[] = [];

  private vert(x: number, y: number, z: number, s: number, m?: THREE.Matrix4, k?: RGB) {
    _v.set(x, y, z); if (m) _v.applyMatrix4(m);
    this.p.push(_v.x, _v.y, _v.z); this.c.push(s * (k?.[0] ?? 1), s * (k?.[1] ?? 1), s * (k?.[2] ?? 1));
    return this.p.length / 3 - 1;
  }

  loft(rings: Ring[], o: LoftOpts = {}) {
    const n = o.n ?? 8; const rows: number[][] = [];
    rings.forEach((r, ri) => {
      const rz = r.rz ?? r.rx; const row: number[] = [];
      if (r.rx <= 1e-4) {
        const v = this.vert(r.cx ?? 0, r.y, r.cz ?? 0, r.s ?? 1, o.m, r.k ?? o.tint);
        for (let i = 0; i < n; i++) row.push(v);
      } else {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2; const w = o.wob?.(ri, i, a) || {};
          const dr = w.dr ?? 1;
          row.push(this.vert((r.cx ?? 0) + Math.sin(a) * r.rx * dr, r.y + (w.dy ?? 0), (r.cz ?? 0) + Math.cos(a) * rz * dr, w.s ?? r.s ?? 1, o.m, w.k ?? r.k ?? o.tint));
        }
      }
      rows.push(row);
    });
    const tri = (a: number, b: number, c: number) => { if (a !== b && b !== c && a !== c) this.ix.push(a, b, c); };
    for (let ri = 0; ri < rows.length - 1; ri++) {
      for (let i = 0; i < n; i++) {
        const a = rows[ri][i], b = rows[ri + 1][i], c = rows[ri + 1][(i + 1) % n], d = rows[ri][(i + 1) % n];
        tri(a, b, d); tri(b, c, d);
      }
    }
    const cap = (row: number[], r: Ring, flip: boolean) => {
      if (r.rx <= 1e-4) return;
      const ctr = this.vert(r.cx ?? 0, r.y, r.cz ?? 0, r.s ?? 1, o.m, r.k ?? o.tint);
      for (let i = 0; i < n; i++) { const a = row[i], b = row[(i + 1) % n]; flip ? tri(ctr, b, a) : tri(ctr, a, b); }
    };
    if (o.top) cap(rows[0], rings[0], false);
    if (o.bottom) cap(rows[rows.length - 1], rings[rings.length - 1], true);
    return this;
  }

  /** 8-vertex tapered box (12 triangles). tx/tz scale the top face, dz shifts it. */
  box(w: number, h: number, d: number, m?: THREE.Matrix4, o: { tx?: number; tz?: number; dz?: number; s?: number; sTop?: number; k?: RGB } = {}) {
    const { tx = 1, tz = 1, dz = 0, s = 1, sTop = s } = o;
    const pts: [number, number, number, number][] = [];
    for (const [yy, sx, sz, zz, ss] of [[-h / 2, 1, 1, 0, s], [h / 2, tx, tz, dz, sTop]] as number[][]) {
      for (const [qx, qz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push([qx * w / 2 * sx, yy, qz * d / 2 * sz + zz, ss]);
    }
    const base = this.p.length / 3; const ids = pts.map(([x, y, z, ss]) => this.vert(x, y, z, ss, m, o.k));
    const ctr = new THREE.Vector3(); pts.forEach(([x, y, z]) => ctr.add(_v.set(x, y, z))); ctr.multiplyScalar(1 / 8);
    const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    const pv = (k: number) => new THREE.Vector3(pts[k][0], pts[k][1], pts[k][2]);
    for (const f of faces) for (const t of [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]) {
      const [a, b, c] = t.map(pv); const nrm = b.clone().sub(a).cross(c.clone().sub(a));
      const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(ctr);
      const [i0, i1, i2] = t.map((k) => ids[k]);
      if (nrm.dot(mid) >= 0) this.ix.push(i0, i1, i2); else this.ix.push(i0, i2, i1);
    }
    void base;
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.ix);
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}
