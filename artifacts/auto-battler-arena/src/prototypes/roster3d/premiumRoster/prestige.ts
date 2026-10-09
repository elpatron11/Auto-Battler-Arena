import * as THREE from 'three';
import { createPremiumRosterModel } from './index';
import { countTriangles } from '../../warrior3d/warriorModel';
import type { ModelId } from '../creatures';
import type { CharacterModel } from '../modelKit';
import type { PolishMotionModel } from '../polishMotion';
import { createPrestigeGlow } from './prestigeGlow';

/**
  * Opt-in reward prestige skins. Each one is the approved premiumRoster model (same root, rig, proportions,
 * animate, weapon) with cloned/recoloured materials and a few merged cosmetic parts parented to existing rig joints.
  * The gallery can preview them freely; gameplay equipment requires a server-owned skin unlock.
 */
export type PrestigeId = 'paladin' | 'warrior';
export const PRESTIGE_IDS: PrestigeId[] = ['paladin', 'warrior'];
export const PRESTIGE_LABEL: Record<PrestigeId, string> = { paladin: 'Winged Paladin', warrior: 'Ember Lord Warrior' };
export const isPrestigeId = (v: unknown): v is PrestigeId => v === 'paladin' || v === 'warrior';
/** Hard overhead budget for added cosmetic geometry (per model). */
export const PRESTIGE_BUDGET = { meshes: 4, triangles: 900 };

type V2 = [number, number];
interface Acc { P: number[]; I: number[] }
const acc = (): Acc => ({ P: [], I: [] });

/** Closed indexed convex prism: polygon in (x,y) extruded +-t/2 in z, baked through m. Flat shaded (duplicated verts). */
function addPrism(a: Acc, poly: V2[], t: number, m: THREE.Matrix4) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; area += x0 * y1 - x1 * y0; }
  const p = area < 0 ? [...poly].reverse() : poly, n = p.length, v = new THREE.Vector3();
  const push = (x: number, y: number, z: number) => { v.set(x, y, z).applyMatrix4(m); a.P.push(v.x, v.y, v.z); return a.P.length / 3 - 1; };
  const h = t / 2;
  let b = a.P.length / 3;
  for (const [x, y] of p) push(x, y, h);
  for (let i = 1; i < n - 1; i++) a.I.push(b, b + i, b + i + 1);
  b = a.P.length / 3;
  for (const [x, y] of p) push(x, y, -h);
  for (let i = 1; i < n - 1; i++) a.I.push(b, b + i + 1, b + i);
  for (let i = 0; i < n; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % n];
    const q = push(x0, y0, -h); push(x1, y1, -h); push(x1, y1, h); push(x0, y0, h);
    a.I.push(q, q + 1, q + 2, q, q + 2, q + 3);
  }
}
function toGeometry(a: Acc) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a.P, 3));
  g.setIndex(a.I); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
/** Kite (root, two shoulders, tip) in plane coordinates; dir is the angle from +y toward +x. */
function kite(root: V2, dir: number, len: number, w: number): V2[] {
  const dx = Math.sin(dir), dy = Math.cos(dir), nx = dy, ny = -dx;
  const at = (f: number, s: number): V2 => [root[0] + dx * len * f + nx * w * s, root[1] + dy * len * f + ny * w * s];
  return [root, at(0.34, 1), at(1, 0), at(0.34, -1)];
}

function tint(m: THREE.Material, id: PrestigeId) {
  const mt = m as THREE.MeshLambertMaterial; if (!mt.color) return;
  const hsl = { h: 0, s: 0, l: 0 }; mt.color.getHSL(hsl);
  const set = (c: string, e?: string) => { mt.color.set(c); if (e && mt.emissive) mt.emissive.set(e); };
  const gold = hsl.h > 0.09 && hsl.h < 0.16 && hsl.s > 0.4;
  if (id === 'paladin') {
    if (hsl.h > 0.55 && hsl.h < 0.72 && hsl.s > 0.2) set('#e6ecf6', '#1c2436');
    else if (gold) set('#f3c94f', '#3d2a05');
  } else {
    if ((hsl.h < 0.05 || hsl.h > 0.94) && hsl.s > 0.35 && hsl.l < 0.55) set('#762331');
    else if (gold) set('#c98a2a', '#2a1804');
    else if (hsl.s < 0.3 && hsl.l > 0.6) set('#d9a636', '#2a1804');
    else if (hsl.l < 0.55 && hsl.s < 0.35) set('#2b2730');
  }
}

function wingGeos() {
  const gold = acc(), pearl = acc();
  for (const sx of [-1, 1]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(sx * 0.45, 1.1, -0.82), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sx * 0.42, sx * 0.08)), new THREE.Vector3(1, 1, 1));
    const root: V2 = [0, 0];
    // Broad ivory feathers with tapered tips; gold is reserved for structural mounts.
    const feather = (r: V2, angle: number, len: number, width: number): V2[] => {
      const dx=Math.sin(angle),dy=Math.cos(angle);
      const at=(f:number,s:number):V2=>[r[0]+dx*len*f+dy*width*s,r[1]+dy*len*f-dx*width*s];
      return [r,at(.24,.6),at(.57,1),at(1,0),at(.57,-1),at(.24,-.6)];
    };
    for (let k = 0; k < 6; k++) addPrism(pearl, feather(root, sx * (0.3 + k * 0.3), 3.1 - k * 0.17, 0.4), 0.08, m);
    for (let k = 0; k < 5; k++) addPrism(pearl, feather([sx * 0.1, -0.05], sx * (0.45 + k * 0.32), 1.7 - k * 0.1, 0.32), 0.1, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.12)));
    addPrism(gold, [[0, -0.2], [sx * 0.2, 0.5], [sx * 1.6, 1.9], [sx * 0.5, 0.2]], 0.14, m);
    // gold structural mount plate at the wing root
    addPrism(gold, [[-0.22, -0.28], [0.22, -0.28], [0.3, 0.1], [0, 0.34], [-0.3, 0.1]], 0.2, m);
  }
  return { gold: toGeometry(gold), pearl: toGeometry(pearl) };
}
/** Royal blue gems: wing-root jewels and a chest stone, torso-local, batched in one mesh. */
function gemGeo() {
  const a = acc(), dia: V2[] = [[0, -0.2], [0.14, 0], [0, 0.2], [-0.14, 0]];
  for (const sx of [-1, 1]) addPrism(a, dia, 0.26, new THREE.Matrix4().compose(new THREE.Vector3(sx * 0.45, 1.1, -0.82), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sx * 0.42, 0)), new THREE.Vector3(1, 1, 1)));
  addPrism(a, dia, 0.1, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.12, 0.74), new THREE.Quaternion(), new THREE.Vector3(1.3, 1.3, 1)));
  return toGeometry(a);
}
/** Horns root deep inside the helm dome (head-local) so they grow out of it continuously; no loose shards. */
function hornGeo() {
  const a = acc();
  for (const sx of [-1, 1]) addPrism(a, kite([sx * 0.42, 0.58], sx * 0.6, 1.25, 0.2), 0.26, new THREE.Matrix4().makeTranslation(0, 0, -0.04));
  // angular crown crest: tall centre blade flanked by two low ones, same plane as the horns
  addPrism(a, kite([0, 0.62], 0, 0.8, 0.16), 0.2, new THREE.Matrix4());
  for (const sx of [-1, 1]) addPrism(a, kite([sx * 0.2, 0.6], sx * 0.25, 0.5, 0.1), 0.18, new THREE.Matrix4());
  return toGeometry(a);
}
/** Slim molten fuller inset, proud of the blade faces by a hair, in blade-local space. */
function bladeInsetGeo() {
  const a = acc();
  addPrism(a, [[-0.11, 0.3], [0.11, 0.3], [0.17, 1.0], [0.14, 2.05],
    [0.08, 2.5], [0, 2.9], [-0.08, 2.5], [-0.14, 2.05], [-0.17, 1.0]],
    0.23, new THREE.Matrix4());
  return toGeometry(a);
}

/** Preserve the reference's cloth colours and tagged gold hems, without touching base geometry. */
function capeGeometry(mesh: THREE.Mesh, source: THREE.MeshLambertMaterial, id: PrestigeId,
  cache: Map<string, THREE.BufferGeometry>, owned: { dispose(): void }[]) {
  if (!mesh.geometry.attributes.color) return false;
  const key=mesh.geometry.uuid+':cape:'+id;
  let geometry=cache.get(key);
  if(!geometry){
    geometry=mesh.geometry.clone();
    const colors=mesh.geometry.attributes.color,out:number[]=[],absolute=new THREE.Color();
    const hsl={h:0,s:0,l:0},cloth=new THREE.Color(id==='paladin'?'#173c88':'#762331');
    const trim=new THREE.Color('#d9a02e');
    for(let i=0;i<colors.count;i++){
      absolute.setRGB(colors.getX(i),colors.getY(i),colors.getZ(i)).multiply(source.color);
      absolute.getHSL(hsl);
      const gold=hsl.h>.065&&hsl.h<.18&&hsl.s>.3;
      const brightness=THREE.MathUtils.clamp(Math.max(absolute.r,absolute.g,absolute.b)*2.2,.42,1.15);
      absolute.copy(gold?trim:cloth).multiplyScalar(brightness);
      out.push(absolute.r,absolute.g,absolute.b);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(out,3));
    cache.set(key,geometry);owned.push(geometry);
  }
  mesh.geometry=geometry;
  return true;
}

const DARK = '#2f2c38', GOLD_TRIM = '#d9a02e', EDGE = '#ff7a1e';
/** Bakes absolute vertex colours so broad surfaces read dark metal while tagged trims / rims keep gold. */
function bakeWarrior(mesh: THREE.Mesh, src: THREE.MeshLambertMaterial, cache: Map<string, THREE.BufferGeometry>, owned: { dispose(): void }[]):
  boolean {
  const g0 = mesh.geometry, col = g0.attributes.color, pos = g0.attributes.position;
  if (!col || !pos || !pos.count) return false;
  const hsl = { h: 0, s: 0, l: 0 }; src.color.getHSL(hsl);
  const gold = hsl.h > 0.08 && hsl.h < 0.16 && hsl.s > 0.4, blade = hsl.l > 0.9 && hsl.s < 0.1;
  g0.computeBoundingBox();
  const bounds=g0.boundingBox!;
  // The merged, silver shoulder spikes are the only shallow upper-torso geometry
  // spanning both outer pauldrons. Turn those existing facets molten, not the whole armor.
  const crystal=hsl.s<.25&&hsl.l>.6&&bounds.min.y>.8&&bounds.max.y<2&&
    bounds.max.x-bounds.min.x>3&&bounds.max.z-bounds.min.z<.75;
  if (!gold && !blade && !crystal) return false;
  const key = g0.uuid + ':' + (crystal ? 'c' : blade ? 'b' : 'g');
  let g = cache.get(key);
  if (!g) {
    g = g0.clone(); owned.push(g);
    g0.computeBoundingBox(); const bb = g0.boundingBox!;
    const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y, hilt = gold && w > 2.4 && w < 3.2 && h > 2;
    const maxX = new Map<number, number>();
    if (blade) for (let i = 0; i < pos.count; i++) { const k = Math.round(pos.getY(i) * 20); maxX.set(k, Math.max(maxX.get(k) ?? 0, Math.abs(pos.getX(i)))); }
    const out: number[] = [], c = new THREE.Color(), host = src.color;
    for (let i = 0; i < pos.count; i++) {
      const r = col.getX(i), gg = col.getY(i), b = col.getZ(i), mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), m = (r + gg + b) / 3;
      const tagged = mx > 0 && (mx - mn) / mx > 0.12;
      const y = pos.getY(i), x = Math.abs(pos.getX(i));
      if(crystal)c.set(EDGE).multiplyScalar(Math.max(m,.7));
      else if (blade) {
        const mxX = maxX.get(Math.round(y * 20)) ?? 0;
        if (y > 2.95 || (y > 0.25 && mxX > 0.05 && x >= mxX * 0.9)) c.set(EDGE).multiplyScalar(Math.max(m, 0.9)); else c.set(DARK).multiplyScalar(m);
      } else if (tagged) c.copy(host).multiply(new THREE.Color(r, gg, b));
      else if (hilt || (y - bb.min.y) / (h || 1) < 0.1) c.set(GOLD_TRIM).multiplyScalar(m);
      else c.set(DARK).multiplyScalar(m);
      out.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(out, 3));
    cache.set(key, g);
  }
  mesh.geometry = g;
  return true;
}

export function createPrestigeRosterModel(id: ModelId): CharacterModel {
  const base = createPremiumRosterModel(id, '');
  if (!isPrestigeId(id)) return base;
  const owned: { dispose(): void }[] = [];
  const mats = new Map<THREE.Material, THREE.Material>();
  const bakeCache = new Map<string, THREE.BufferGeometry>(), bakedMats = new Set<THREE.Material>();
  const objs: THREE.Object3D[] = [];
  base.root.traverse((o) => objs.push(o));
  for (const o of objs) {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) continue;
    let cape=false;
    for(let node:THREE.Object3D|null=mesh;node;node=node.parent)if(node.userData.premiumJoint==='cape')cape=true;
    let m = cape ? undefined : mats.get(mesh.material);
    if (!m) { m = mesh.material.clone(); if(!cape)mats.set(mesh.material, m); owned.push(m); }
    const baked = cape ? capeGeometry(mesh,mesh.material as THREE.MeshLambertMaterial,id,bakeCache,owned) :
      id === 'warrior' && bakeWarrior(mesh, mesh.material as THREE.MeshLambertMaterial, bakeCache, owned);
    if (baked) { (m as THREE.MeshLambertMaterial).color.set('#ffffff'); (m as THREE.MeshLambertMaterial).emissive?.set('#000000'); bakedMats.add(m); }
    else if (!bakedMats.has(m)) tint(m, id);
    mesh.material = m; // hidden merged variants included; base materials are never mutated
  }
  const torso = objs.find((o) => o.userData.premiumJoint === 'torso');
  const head = objs.find((o) => o.userData.premiumJoint === 'head');
  if (!torso || !head) throw new Error(`prestige ${id}: premium rig joints missing`);
  const mk = (g: THREE.BufferGeometry, color: string, emissive: string) => {
    const mat = new THREE.MeshLambertMaterial({ color, emissive }); owned.push(g, mat);
    const m = new THREE.Mesh(g, mat); m.userData.prestige = true; m.frustumCulled = false; return m;
  };
  let wings: THREE.Group | null = null;
  if (id === 'paladin') {
    const g = wingGeos(); wings = new THREE.Group(); wings.userData.prestige = true;
    wings.add(mk(g.gold, '#f0c24a', '#4a3206'), mk(g.pearl, '#f4efe0', '#2a2a34'), mk(gemGeo(), '#2f6fe0', '#0e2a6a')); torso.add(wings);
  } else {
    // ember horns grow out of the helm dome (head joint); molten fuller sits on the existing blade under its own joint
    head.add(mk(hornGeo(), '#e8561c', '#8a2a08'));
    let blade: THREE.Mesh | null = null;
    for (const o of objs) {
      const m = o as THREE.Mesh; if (!m.isMesh || !m.visible || !m.geometry.attributes.position?.count) continue;
      m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox!;
      if (bb.max.y > 3 && bb.max.x - bb.min.x < 1.5 && (!blade || bb.max.y > blade.geometry.boundingBox!.max.y)) blade = m;
    }
    if (!blade || !blade.parent) throw new Error('prestige warrior: sword blade not found');
    const inset = mk(bladeInsetGeo(), '#ff6a1a', '#a83c08');
    inset.position.copy(blade.position); inset.quaternion.copy(blade.quaternion); inset.scale.copy(blade.scale);
    blade.parent.add(inset);
  }
  const glow = createPrestigeGlow(base.root, id);
  const extra: THREE.Mesh[] = [];
  base.root.traverse((o) => { if (o.userData.prestige && (o as THREE.Mesh).isMesh) extra.push(o as THREE.Mesh); });
  const visibleMeshes: THREE.Mesh[] = [];
  base.root.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) visibleMeshes.push(o as THREE.Mesh); });
  const stats = { ...base.stats, triangles: countTriangles(base.root), meshes: base.stats.meshes + extra.length,
    geometries: new Set(visibleMeshes.map(mesh => mesh.geometry)).size,
    materials: new Set(visibleMeshes.map(mesh => mesh.material)).size };
  let disposed = false;
  const inner = base as PolishMotionModel;
  const model = {
    ...inner, stats,
    animate(p: Parameters<CharacterModel['animate']>[0]) {
      inner.animate(p);
      glow.update(p);
      if (wings) { const s = 1 + Math.sin((Number.isFinite(p.time) ? p.time : 0) * 1.6) * 0.025; wings.scale.set(s, 1, 1); }
    },
    dispose() {
      if (disposed) return; disposed = true;
      glow.dispose();
      owned.forEach((o) => o.dispose());
      const loose: THREE.Object3D[] = []; base.root.traverse((o) => { if (o.userData.prestige) loose.push(o); });
      loose.forEach((o) => o.parent?.remove(o));
      base.dispose();
    },
  };
  return model;
}
