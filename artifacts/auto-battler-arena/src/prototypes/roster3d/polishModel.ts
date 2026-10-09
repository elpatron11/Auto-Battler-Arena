import * as THREE from 'three';
import { createCharacterModel } from './characterModel';
import type { CharacterModel, CharacterPose } from './modelKit';
import type { DruidForm } from './roster';
import type { ModelId } from './creatures';
import { countTriangles } from '../warrior3d/warriorModel';
import { enableVertexColors } from './polishMaterial';
import { PolishContext } from './polishContext';
import { applyRecipe } from './polishRecipes';

/**
 * Opt-in polish adapter. It builds the real base model with createCharacterModel(id, form) and
 * refines that very scene graph in place: nodes, pivots, rig groups and the base animate() are kept.
 *
 *  - Hidden cylinder/cone end caps are dropped (the triangle budget that pays for the refinements).
 *  - Meshes get owned, vertex-coloured geometry: per-face directional facet shading, localized painted
 *    bands (hems, soles, cheeks, scutes, stripes) and accessory gadgets merged into existing meshes.
 *  - Lambert materials are reused (same instances, so base material swaps keep working) with vertexColors.
 *  - No new meshes, materials, textures, lights or shadows. Triangles stay within +9.5% of the base.
 */
export const POLISH_TRIANGLE_FACTOR = 1.095;

const IDLE: CharacterPose = { time: 0, mode: 'idle', progress: 0 };

/** Meshes whose material the base swaps for a variant (priest shadow, cryomancer fire). */
function variantLocked(base: CharacterModel, id: ModelId): Set<THREE.Mesh> {
  const locked = new Set<THREE.Mesh>();
  const variant = id === 'priest' ? 'shadow' : id === 'frostmage' ? 'fire' : undefined;
  if (!variant) return locked;
  const objs: THREE.Object3D[] = []; const snap: { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3; v: boolean }[] = [];
  const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  base.root.traverse((o) => {
    objs.push(o); snap.push({ p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone(), v: o.visible });
    if ((o as THREE.Mesh).isMesh) mats.set(o as THREE.Mesh, (o as THREE.Mesh).material);
  });
  base.animate({ ...IDLE, variant });
  mats.forEach((m, mesh) => {
    if (mesh.material !== m) { locked.add(mesh); enableVertexColors(mesh.material as THREE.Material); }
  });
  base.animate(IDLE);
  mats.forEach((m, mesh) => { mesh.material = m; });
  objs.forEach((o, i) => { const s = snap[i]; o.position.copy(s.p); o.quaternion.copy(s.q); o.scale.copy(s.s); o.visible = s.v; });
  return locked;
}

export function createPolishedCharacterModel(id: ModelId, form: DruidForm = ''): CharacterModel {
  const base = createCharacterModel(id, form);
  const ctx = new PolishContext(id, base.root, variantLocked(base, id), POLISH_TRIANGLE_FACTOR);
  applyRecipe(ctx, id, form);
  const owned = ctx.finish();
  base.root.userData.polished = { id, form, baseTriangles: ctx.baseTriangles, applied: ctx.applied.slice(), skipped: ctx.skipped.slice() };

  let meshes = 0; base.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  const stats = { triangles: countTriangles(base.root), meshes, geometries: owned.length, materials: base.stats.materials };
  let disposed = false;
  return {
    root: base.root,
    stats,
    animate: (p) => base.animate(p),
    dispose() {
      if (disposed) return; disposed = true;
      owned.forEach((g) => g.dispose());
      base.dispose();
    },
  };
}
