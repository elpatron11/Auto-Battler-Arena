import * as THREE from 'three';
import {
  chamferBox, flatPositions, gadget, Host, kindOf, shadedShared, stripOk,
  type GadgetKind, type GadgetOpts, type Kind, type Paint, type V3,
} from './polishGeometry';
import { enableVertexColors, hexOf, isGlow } from './polishMaterial';

export interface Part {
  mesh: THREE.Mesh; kind: Kind; hex: string; glow: boolean;
  s: V3; p: V3; g: THREE.Object3D; tri0: number; dynamic: boolean; skip: boolean;
}

const placement = new THREE.Matrix4();
const IDENT = new THREE.Matrix4();

/** Editing context for one base model: budgeted, host-based geometry refinement. */
export class PolishContext {
  readonly parts: Part[] = [];
  readonly hosts = new Map<THREE.Mesh, Host>();
  readonly owned: THREE.BufferGeometry[] = [];
  readonly applied: string[] = [];
  readonly skipped: string[] = [];
  readonly baseTriangles: number;
  readonly limit: number;

  constructor(readonly id: string, readonly root: THREE.Object3D, readonly locked: Set<THREE.Mesh>, factor = 1.095) {
    let base = 0;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry; const kind = kindOf(g);
      const idx = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      base += idx;
      const mat = mesh.material as THREE.Material;
      const zero = mesh.position.lengthSq() === 0;
      // meshes whose full transform is rewritten by the base rig every frame (warrior IK limbs) never host gadgets
      const dynamic = id === 'warrior' && zero && (kind === 'cylinder' || kind === 'sphere');
      const skip = !!g.attributes.color;
      const part: Part = { mesh, kind, hex: hexOf(mat), glow: isGlow(mat), s: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
        p: [mesh.position.x, mesh.position.y, mesh.position.z], g: mesh.parent!, tri0: 0, dynamic, skip };
      part.tri0 = skip ? idx : flatPositions(g, stripOk(mesh)).length / 9;
      this.parts.push(part);
    });
    this.baseTriangles = Math.round(base);
    this.limit = Math.floor(base * factor);
  }

  current(): number {
    let n = 0;
    for (const p of this.parts) { const h = this.hosts.get(p.mesh); n += h ? h.tris : p.tri0; }
    return n;
  }
  fits(extra: number) { return this.current() + extra <= this.limit; }

  find(kind?: Kind, hex?: string, f?: (p: Part) => boolean): Part[] {
    return this.parts.filter((p) => (!kind || p.kind === kind) && (!hex || p.hex === hex.replace('#', '').toLowerCase()) && (!f || f(p)));
  }
  one(kind?: Kind, hex?: string, f?: (p: Part) => boolean): Part | undefined { return this.find(kind, hex, f)[0]; }
  sgn(p: Part) { return p.g.position.x < 0 ? -1 : 1; }

  host(p: Part): Host {
    let h = this.hosts.get(p.mesh);
    if (!h) {
      h = new Host(p.mesh, flatPositions(p.mesh.geometry, stripOk(p.mesh)), (p.mesh.material as THREE.MeshLambertMaterial).color);
      h.locked = this.locked.has(p.mesh); this.hosts.set(p.mesh, h);
    }
    return h;
  }
  paint(p: Part | undefined, fn: Paint) { if (p && !p.skip) this.host(p).paint(fn); }

  /** Chamfer the lit edges of a box (hidden bottom stays square unless bottom=true). */
  bevel(p: Part | undefined, b: number, top = true, bottom = false, name = 'bevel') {
    if (!p || p.kind !== 'box' || p.skip) return false;
    const h = this.host(p);
    const next = chamferBox(Math.min(.3, b / p.s[0]), Math.min(.3, b / p.s[1]), Math.min(.3, b / p.s[2]), top, bottom);
    const delta = next.length / 9 - h.tris;
    if (!this.fits(delta)) { this.skipped.push(`${name}:${p.hex}`); return false; }
    h.setBody(next); this.applied.push(name); return true;
  }

  /** Re-tessellate a cylinder side with extra height rings (same silhouette) for banded paint. */
  retess(p: Part | undefined, rings: number, name = 'rings') {
    if (!p || p.kind !== 'cylinder' || p.skip) return false;
    const gp = (p.mesh.geometry as THREE.CylinderGeometry).parameters;
    const g = new THREE.CylinderGeometry(gp.radiusTop, gp.radiusBottom, gp.height, gp.radialSegments, rings, gp.openEnded);
    const next = flatPositions(g); g.dispose();
    const h = this.host(p); const delta = next.length / 9 - h.tris;
    if (!this.fits(delta)) { this.skipped.push(`${name}:${p.hex}`); return false; }
    h.setBody(next); this.applied.push(name); return true;
  }

  /** Parent-frame gadget merged into `p`. abs: accent colour; mul: tint of the host colour (locked hosts). */
  put(p: Part | undefined, kind: GadgetKind, at: V3, size: V3, rot: V3 = [0, 0, 0], abs?: string, mul = 1.2,
    opt: GadgetOpts = {}, name = 'gadget'): boolean {
    if (!p || p.dynamic || p.skip) return false;
    return this.merge(p, gadget(kind, IDENT, at, size, rot, opt), abs, mul, name);
  }
  /** Gadget placed in the host's own rotated frame (offsets in parent units, ignoring host scale). */
  putL(p: Part | undefined, kind: GadgetKind, off: V3, size: V3, rot: V3 = [0, 0, 0], abs?: string, mul = 1.2,
    opt: GadgetOpts = {}, name = 'gadget'): boolean {
    if (!p || p.dynamic || p.skip) return false;
    placement.compose(p.mesh.position, p.mesh.quaternion, new THREE.Vector3(1, 1, 1));
    return this.merge(p, gadget(kind, placement, off, size, rot, opt), abs, mul, name);
  }
  private merge(p: Part, tris: number[], abs: string | undefined, mul: number, name: string) {
    if (!this.fits(tris.length / 9)) { this.skipped.push(name); return false; }
    this.host(p).add(tris, abs, mul); this.applied.push(name); return true;
  }

  /** Swap hosts' geometry in, enable vertex colours, return owned geometries. */
  finish() {
    const cache = new Map<string, THREE.BufferGeometry>(); const mats = new Set<THREE.Material>();
    for (const p of this.parts) {
      const mesh = p.mesh; mats.add(mesh.material as THREE.Material);
      if (p.skip) continue;
      const h = this.hosts.get(mesh);
      let g: THREE.BufferGeometry | undefined;
      if (h) { g = h.build(); this.owned.push(g); }
      else {
        const q = mesh.quaternion; const s = mesh.scale;
        const key = [mesh.geometry.uuid, stripOk(mesh), p.glow, q.x.toFixed(2), q.y.toFixed(2), q.z.toFixed(2),
          (s.y / s.x).toFixed(2), (s.z / s.x).toFixed(2)].join('|');
        g = cache.get(key);
        if (!g) { g = shadedShared(mesh, flatPositions(mesh.geometry, stripOk(mesh)), p.glow); cache.set(key, g); this.owned.push(g); }
      }
      mesh.geometry = g;
    }
    mats.forEach(enableVertexColors);
    return this.owned;
  }
}
