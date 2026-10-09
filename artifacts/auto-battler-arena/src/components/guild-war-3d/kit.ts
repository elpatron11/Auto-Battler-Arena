import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const K = 0.05; // world units per map pixel
export type V3 = [number, number, number];
export type MatOpts = { emissive?: number; opacity?: number; basic?: boolean; flat?: boolean; map?: THREE.Texture | null };

/** Per-scene shared unit geometry, materials and textures. Everything is disposed by dispose(). */
export function createKit() {
  const geos: THREE.BufferGeometry[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T): T => { geos.push(x); return x; };
  const geo = {
    box: g(new THREE.BoxGeometry(1, 1, 1)),
    cyl: g(new THREE.CylinderGeometry(1, 1, 1, 10)),
    cone: g(new THREE.ConeGeometry(1, 1, 8)),
    pyr: g(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4)),
    sphere: g(new THREE.SphereGeometry(1, 8, 6)),
    octa: g(new THREE.OctahedronGeometry(1)),
    ring: g(new THREE.RingGeometry(0.82, 1, 24).rotateX(-Math.PI / 2)),
    disc: g(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)),
    barL: g(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0)),
    plane: g(new THREE.PlaneGeometry(1, 1)),
    flag: g(new THREE.PlaneGeometry(1, 0.6).translate(0.5, 0, 0)),
  };
  const mats = new Map<string, THREE.Material>();
  const textures: THREE.Texture[] = [];
  function mat(color: string, o: MatOpts = {}): THREE.Material {
    const key = `${color}|${o.emissive ?? 0}|${o.opacity ?? 1}|${o.basic ? 1 : 0}|${o.map ? o.map.uuid : ''}`;
    let m = mats.get(key);
    if (!m) {
      const common = { color, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, side: THREE.DoubleSide, map: o.map ?? null, depthWrite: (o.opacity ?? 1) >= 1 };
      m = o.basic ? new THREE.MeshBasicMaterial(common)
        : new THREE.MeshLambertMaterial({ ...common, flatShading: true, emissive: o.emissive ? color : '#000000', emissiveIntensity: o.emissive ?? 0 });
      mats.set(key, m);
    }
    return m;
  }
  function m(parent: THREE.Object3D, shape: THREE.BufferGeometry, material: THREE.Material, p: V3 = [0, 0, 0], s: V3 = [1, 1, 1], r: V3 = [0, 0, 0]) {
    const o = new THREE.Mesh(shape, material); o.position.set(...p); o.scale.set(...s); o.rotation.set(...r); parent.add(o); return o;
  }
  function grp(parent: THREE.Object3D, p: V3 = [0, 0, 0]) { const o = new THREE.Group(); o.position.set(...p); parent.add(o); return o; }
  function canvasTex(size: number, paint: (c: CanvasRenderingContext2D, n: number) => void, rx = 1, ry = 1) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const c = cv.getContext('2d'); if (c) paint(c, size);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; textures.push(t); return t;
  }
  function reg<T extends THREE.BufferGeometry>(x: T): T { return g(x); }
  /** Bakes static meshes (same material) into one mesh each; subtrees/meshes with userData.keep stay animatable. */
  function merge(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>(); const victims: THREE.Mesh[] = [];
    const visit = (o: THREE.Object3D, keep: boolean) => {
      const kp = keep || !!o.userData.keep; const me = o as THREE.Mesh;
      if (!kp && me.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && o.visible && !Array.isArray(me.material)) {
        const gm = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
        gm.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld));
        for (const n of Object.keys(gm.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') gm.deleteAttribute(n);
        gm.clearGroups();
        const list = buckets.get(me.material) ?? []; list.push(gm); buckets.set(me.material, list); victims.push(me);
      }
      o.children.slice().forEach((c) => visit(c, kp));
    };
    visit(root, false);
    victims.forEach((v) => v.parent?.remove(v));
    buckets.forEach((list, material) => {
      const merged = mergeGeometries(list, false); list.forEach((x) => x.dispose());
      if (merged) { reg(merged); root.add(new THREE.Mesh(merged, material)); }
    });
  }
  function dispose() { geos.forEach((x) => x.dispose()); mats.forEach((x) => x.dispose()); textures.forEach((x) => x.dispose()); geos.length = 0; mats.clear(); textures.length = 0; }
  return { geo, mat, m, grp, merge, canvasTex, reg, dispose, stats: () => ({ geometries: geos.length, materials: mats.size, textures: textures.length }) };
}
export type Kit = ReturnType<typeof createKit>;

export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function makeLabel(text: string, color = '#f0e9d7', w = 256, h = 64) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mt = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mt); sprite.renderOrder = 10;
  let last = '';
  function set(t: string, col = color) {
    const key = t + col; if (key === last) return; last = key;
    const c = cv.getContext('2d'); if (!c) return;
    c.clearRect(0, 0, w, h); c.font = `700 ${Math.round(h * 0.56)}px 'Barlow Condensed', sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 7; c.lineJoin = 'round'; c.strokeStyle = '#0a0e16';
    c.strokeText(t, w / 2, h / 2 + 2); c.fillStyle = col; c.fillText(t, w / 2, h / 2 + 2); tex.needsUpdate = true;
  }
  set(text, color);
  return { sprite, set, dispose() { tex.dispose(); mt.dispose(); } };
}
