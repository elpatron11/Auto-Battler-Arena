import * as THREE from 'three';
import { countTriangles, type WarriorModelStats } from '../warrior3d/warriorModel';

export type CharacterMode = 'idle' | 'run' | 'attack' | 'cast';
export interface CharacterPose {
  time: number;
  mode: CharacterMode;
  progress: number;
  variant?: 'shadow' | 'fire' | 'rampage';
}
export interface CharacterModel {
  root: THREE.Group;
  stats: WarriorModelStats;
  animate(pose: CharacterPose): void;
  dispose(): void;
}
export type Primitive = 'box' | 'sphere' | 'cylinder' | 'cone' | 'ring';
export type XYZ = [number, number, number];

/** Per-model shared primitives/materials keep the small battle meshes inexpensive. */
export function createModelKit() {
  const geometries = new Set<THREE.BufferGeometry>();
  const primitives = new Map<Primitive, THREE.BufferGeometry>();
  const materials = new Map<string, THREE.MeshLambertMaterial>();
  const reg = <T extends THREE.BufferGeometry>(g: T): T => { geometries.add(g); return g; };
  function geometry(shape: Primitive) {
    let g = primitives.get(shape);
    if (!g) {
      g = reg(shape === 'box' ? new THREE.BoxGeometry(1, 1, 1) :
        shape === 'sphere' ? new THREE.SphereGeometry(1, 8, 6) :
        shape === 'cylinder' ? new THREE.CylinderGeometry(1, 1, 1, 8) :
        shape === 'cone' ? new THREE.ConeGeometry(1, 1, 8) :
        new THREE.TorusGeometry(1, .08, 4, 12));
      primitives.set(shape, g);
    }
    return g;
  }
  function material(color: string, glow = false) {
    const key = `${color}:${glow}`;
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide,
        emissive: glow ? color : '#000000', emissiveIntensity: glow ? .45 : 0 });
      materials.set(key, m);
    }
    return m;
  }
  function mesh(parent: THREE.Object3D, shape: Primitive | THREE.BufferGeometry, color: string,
    position: XYZ = [0, 0, 0], scale: XYZ = [1, 1, 1], rotation: XYZ = [0, 0, 0], glow = false) {
    const m = new THREE.Mesh(typeof shape === 'string' ? geometry(shape) : reg(shape), material(color, glow));
    m.position.set(...position); m.scale.set(...scale); m.rotation.set(...rotation); parent.add(m);
    return m;
  }
  function group(parent: THREE.Object3D, position: XYZ = [0, 0, 0]) {
    const g = new THREE.Group(); g.position.set(...position); parent.add(g); return g;
  }
  function taper(top: number, bottom: number, height: number, sides = 8) {
    return reg(new THREE.CylinderGeometry(top, bottom, height, sides));
  }
  function plate(points: [number, number][], depth = .12) {
    const s = new THREE.Shape();
    points.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath();
    return reg(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 }));
  }
  function finish(root: THREE.Group, animate: CharacterModel['animate']): CharacterModel {
    let meshes = 0; root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes++; });
    let disposed = false;
    return { root, animate, stats: { triangles: countTriangles(root), meshes,
      geometries: geometries.size, materials: materials.size },
    dispose() {
      if (disposed) return; disposed = true;
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    } };
  }
  return { mesh, group, taper, plate, finish, material, reg };
}