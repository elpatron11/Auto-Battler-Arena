import * as THREE from 'three';

/** Lambert-only: enable baked vertex colours on an existing material. Returns true if it was changed. */
export function enableVertexColors(m: THREE.Material): boolean {
  const l = m as THREE.MeshLambertMaterial;
  if (l.vertexColors) return false;
  l.vertexColors = true; l.needsUpdate = true; return true;
}

export const hexOf = (m: THREE.Material): string =>
  ((m as THREE.MeshLambertMaterial).color?.getHexString() ?? '000000').toLowerCase();

export const isGlow = (m: THREE.Material): boolean =>
  ((m as THREE.MeshLambertMaterial).emissiveIntensity ?? 0) > 0;
