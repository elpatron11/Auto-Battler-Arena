import * as THREE from 'three';

/**
 * Geometry toolkit for the polish adapter. Every mesh the adapter touches is converted to an owned,
 * non-indexed position + vertex-colour buffer ("Host"). Gadgets (belts buckles, cuffs, rivets, ...)
 * are merged into an existing host so draw calls and materials never grow.
 * Vertex colours are linear multipliers of the host material colour (floats may exceed 1), so any
 * absolute accent colour can be painted onto any host without extra materials.
 */
export type V3 = [number, number, number];
export type Kind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'ring' | 'other';

export function kindOf(g: THREE.BufferGeometry): Kind {
  switch (g.type) {
    case 'BoxGeometry': return 'box';
    case 'SphereGeometry': return 'sphere';
    case 'CylinderGeometry': return 'cylinder';
    case 'ConeGeometry': return 'cone';
    case 'TorusGeometry': return 'ring';
    default: return 'other';
  }
}

/** Non-indexed positions of a geometry. `strip` keeps only the side group of cylinders/cones (drops hidden end caps). */
export function flatPositions(src: THREE.BufferGeometry, strip = false): number[] {
  const pos = src.attributes.position; const idx = src.index;
  let start = 0; let count = idx ? idx.count : pos.count;
  if (strip && src.groups.length > 1) { start = src.groups[0].start; count = src.groups[0].count; }
  const out: number[] = [];
  for (let i = start; i < start + count; i++) {
    const v = idx ? idx.getX(i) : i;
    out.push(pos.getX(v), pos.getY(v), pos.getZ(v));
  }
  return out;
}

/** Whether the base mesh's end caps are hidden/redundant (limbs, shafts, horns, spikes). */
/** Caps are always preserved: no aspect-ratio heuristics, only (future) explicitly verified occluded faces. */
export function stripOk(_mesh: THREE.Mesh): boolean { return false; }

const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _e = new THREE.Euler();
const _v = new THREE.Vector3(); const _s = new THREE.Vector3();

export type GadgetKind = 'box' | 'cyl' | 'cone' | 'sph';
export interface GadgetOpts { seg?: number; open?: boolean; top?: number }

/** Gadget triangles in the parent frame. `m` is the placement matrix (host frame -> parent frame). */
export function gadget(kind: GadgetKind, m: THREE.Matrix4, o: V3, s: V3, r: V3 = [0, 0, 0], opt: GadgetOpts = {}): number[] {
  const seg = opt.seg ?? 6; const open = opt.open ?? false;
  let g: THREE.BufferGeometry;
  if (kind === 'box') g = new THREE.BoxGeometry(1, 1, 1);
  else if (kind === 'cyl') g = new THREE.CylinderGeometry(opt.top ?? 1, 1, 1, seg, 1, open);
  else if (kind === 'cone') g = new THREE.ConeGeometry(1, 1, seg, 1, open);
  else g = new THREE.SphereGeometry(1, seg, Math.max(3, seg - 2));
  const p = flatPositions(g, open); g.dispose();
  const local = new THREE.Matrix4().compose(_v.set(...o), _q.setFromEuler(_e.set(...r)), _s.set(...s));
  _m.multiplyMatrices(m, local);
  const out: number[] = []; const v = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) { v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(_m); out.push(v.x, v.y, v.z); }
  return out;
}

/** Rectangular ring stack (chamfered / lipped box). Unit space (+-0.5), rings = [y, halfX, halfZ]. */
export function ringStack(rings: [number, number, number][], capTop = true, capBottom = true): number[] {
  const out: number[] = [];
  const corner = (r: [number, number, number], i: number): V3 => {
    const sx = i === 0 || i === 3 ? 1 : -1; const sz = i < 2 ? 1 : -1; return [sx * r[1], r[0], sz * r[2]];
  };
  const tri = (a: V3, b: V3, c: V3) => out.push(...a, ...b, ...c);
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const a = corner(rings[k], i), b = corner(rings[k], j), c = corner(rings[k + 1], j), d = corner(rings[k + 1], i);
      tri(a, b, c); tri(a, c, d);
    }
  }
  if (capTop) { const r = rings[rings.length - 1]; tri(corner(r, 0), corner(r, 1), corner(r, 2)); tri(corner(r, 0), corner(r, 2), corner(r, 3)); }
  if (capBottom) { const r = rings[0]; tri(corner(r, 0), corner(r, 2), corner(r, 1)); tri(corner(r, 0), corner(r, 3), corner(r, 2)); }
  return fixWinding(out);
}

/** Flip triangles that face inwards (convex shapes only). */
export function fixWinding(p: number[]): number[] {
  let cx = 0, cy = 0, cz = 0; const n = p.length / 3;
  for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const mx = (p[i] + p[i + 3] + p[i + 6]) / 3 - cx, my = (p[i + 1] + p[i + 4] + p[i + 7]) / 3 - cy, mz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) {
      for (let c = 0; c < 3; c++) { const t = p[i + 3 + c]; p[i + 3 + c] = p[i + 6 + c]; p[i + 6 + c] = t; }
    }
  }
  return p;
}

/** Chamfered unit box replacement; insets are per-axis fractions of the unit box. */
export function chamferBox(ix: number, iy: number, iz: number, top = true, bottom = false): number[] {
  const rings: [number, number, number][] = [];
  if (bottom) { rings.push([-.5, .5 - ix, .5 - iz], [-.5 + iy, .5, .5]); } else rings.push([-.5, .5, .5]);
  if (top) { rings.push([.5 - iy, .5, .5], [.5, .5 - ix, .5 - iz]); } else rings.push([.5, .5, .5]);
  return ringStack(rings, true, true); // both caps always closed
}

export interface FaceInfo {
  i: number; cx: number; cy: number; cz: number; nx: number; ny: number; nz: number;
}
export type Paint = (f: FaceInfo) => number | [number, number, number] | undefined;

/** Baseline directional facet shade: lighter on top, darker beneath, small front kick. */
export function shade(nx: number, ny: number, nz: number): number {
  const u = ny * .5 + .5;
  return (0.66 + 0.30 * u + 0.06 * Math.max(0, nz)) * 1.12;
}

function faceNormal(p: number[], i: number): V3 {
  const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
  const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l];
}

export class Host {
  pos: number[]; fac: number[] = []; nBody = 0; locked = false;
  private readonly inv = new THREE.Matrix4();
  private readonly nq = new THREE.Quaternion();
  constructor(readonly mesh: THREE.Mesh, positions: number[], readonly base: THREE.Color) {
    mesh.updateMatrix(); this.inv.copy(mesh.matrix).invert(); this.nq.copy(mesh.quaternion);
    this.pos = positions; this.shadeBody();
  }
  get tris() { return this.pos.length / 9; }
  /** Host-frame matrix (host local -> parent frame). */
  get frame() { this.mesh.updateMatrix(); return this.mesh.matrix; }
  private bodyShade(i: number): number {
    const n = faceNormal(this.pos, i); const s = this.mesh.scale;
    _v.set(n[0] / (s.x || 1), n[1] / (s.y || 1), n[2] / (s.z || 1)).normalize().applyQuaternion(this.nq);
    return shade(_v.x, _v.y, _v.z);
  }
  shadeBody() {
    this.fac.length = 0; this.nBody = this.pos.length / 9;
    for (let i = 0; i < this.pos.length; i += 9) { const f = this.bodyShade(i); for (let k = 0; k < 3; k++) this.fac.push(f, f, f); }
  }
  /** Swap the body for new unit-space positions (bevels, re-tessellation). */
  setBody(positions: number[]) { this.pos = positions; this.shadeBody(); }
  paint(fn: Paint) {
    for (let t = 0; t < this.nBody; t++) {
      const i = t * 9; const p = this.pos;
      const n = faceNormal(p, i);
      const r = fn({ i: t, cx: (p[i] + p[i + 3] + p[i + 6]) / 3, cy: (p[i + 1] + p[i + 4] + p[i + 7]) / 3,
        cz: (p[i + 2] + p[i + 5] + p[i + 8]) / 3, nx: n[0], ny: n[1], nz: n[2] });
      if (r === undefined) continue;
      const m: V3 = typeof r === 'number' ? [r, r, r] : r;
      for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) this.fac[t * 9 + v * 3 + c] *= m[c];
    }
  }
  /** Merge parent-frame triangles. abs = accent colour, mul = multiplier of the host colour (used when locked). */
  add(tris: number[], abs?: string, mul = 1.2) {
    const c = new THREE.Color(); const v = new THREE.Vector3();
    const useAbs = abs !== undefined && !this.locked;
    if (useAbs) c.set(abs!);
    const b = this.base;
    const rr = useAbs ? c.r / Math.max(b.r, .03) : mul, rg = useAbs ? c.g / Math.max(b.g, .03) : mul, rb = useAbs ? c.b / Math.max(b.b, .03) : mul;
    for (let i = 0; i < tris.length; i += 9) {
      const n = faceNormal(tris, i); const f = shade(n[0], n[1], n[2]);
      for (let k = 0; k < 3; k++) {
        v.set(tris[i + k * 3], tris[i + k * 3 + 1], tris[i + k * 3 + 2]).applyMatrix4(this.inv);
        this.pos.push(v.x, v.y, v.z); this.fac.push(f * rr, f * rg, f * rb);
      }
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.fac, 3));
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** Shared per-geometry shaded buffer for meshes that receive no gadgets. */
export function shadedShared(mesh: THREE.Mesh, positions: number[], glow: boolean): THREE.BufferGeometry {
  const fac: number[] = []; const s = mesh.scale; const q = mesh.quaternion;
  for (let i = 0; i < positions.length; i += 9) {
    const n = faceNormal(positions, i);
    _v.set(n[0] / (s.x || 1), n[1] / (s.y || 1), n[2] / (s.z || 1)).normalize().applyQuaternion(q);
    let f = shade(_v.x, _v.y, _v.z);
    if (glow) f = 1 + (f - 1) * .6;
    for (let k = 0; k < 3; k++) fac.push(f, f, f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(fac, 3));
  g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
