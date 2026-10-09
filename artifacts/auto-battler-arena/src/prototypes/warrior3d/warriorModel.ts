import * as THREE from 'three';

/** Original drawWarriorV3 default palette (Steel Vanguard skin). */
export const COLORS = {
  skin: '#d89a72',
  hair: '#4b2919',
  beard: '#351d14',
  steel: '#c4962e',
  steelHi: '#e6bd52',
  steelD: '#454d5a',
  grey: '#5f6978',
  visor: '#2a1d1c',
  plume: '#b3302e',
  steelL: '#dce4ed',
  gold: '#d1a13e',
  swordGold: '#c99a3c',
  red: '#9d302e',
  redD: '#8e2a29',
  boot: '#20242b',
  belt: '#33241c',
  skirt: '#725849',
  grip: '#744628',
  spike: '#bfc8d2',
} as const;

export interface ArmRig {
  side: number;
  shoulder: THREE.Vector3;
  upper: THREE.Mesh;
  fore: THREE.Mesh;
  elbow: THREE.Mesh;
  hand: THREE.Mesh;
  /** local sword Y of the grip point this hand holds */
  gripY: number;
}

export interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
}

export interface WarriorRig {
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  cape: THREE.Group;
  sword: THREE.Group;
  legs: [LegRig, LegRig]; // [left (+x), right (-x)]
  arms: [ArmRig, ArmRig];
  armLength: number;
}

export interface WarriorModelStats {
  triangles: number;
  meshes: number;
  geometries: number;
  materials: number;
}

export interface WarriorModel {
  root: THREE.Group;
  rig: WarriorRig;
  stats: WarriorModelStats;
  dispose: () => void;
}

export function countTriangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const g = m.geometry;
      n += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
  });
  return Math.round(n);
}

/** Broad tapered blade with a diamond cross-section: bright cutting edges, darker centre ridge/fuller. */
export function createBladeGeometry(): THREE.BufferGeometry {
  const edge = new THREE.Color('#ffffff');
  const ridge = new THREE.Color('#7d8997');
  const rings = [
    { y: 0.05, w: 0.52, t: 0.1 },
    { y: 2.1, w: 0.6, t: 0.1 },
  ];
  const pos: number[] = [];
  const col: number[] = [];
  const push = (x: number, y: number, z: number, c: THREE.Color) => {
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
  };
  for (const r of rings) {
    push(-r.w, r.y, 0, edge); // L
    push(0, r.y, r.t, ridge); // F
    push(r.w, r.y, 0, edge); // R
    push(0, r.y, -r.t, ridge); // B
  }
  push(0, 3.1, 0, edge); // tip = 8
  const idx: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = i, b = (i + 1) % 4;
    idx.push(a, b, 4 + b, a, 4 + b, 4 + a);
    idx.push(4 + a, 4 + b, 8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function createWarrior(): WarriorModel {
  const geos: THREE.BufferGeometry[] = [];
  const mats = new Map<string, THREE.Material>();

  const reg = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };
  const mat = (color: string, opts: THREE.MeshLambertMaterialParameters = {}) => {
    const key = color + JSON.stringify(opts);
    let m = mats.get(key);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
      mats.set(key, m);
    }
    return m;
  };
  const add = (
    parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material,
    x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1,
  ) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  };
  const plate = (pts: [number, number][], depth: number, bevel: number) => {
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
    });
    g.translate(0, 0, -depth / 2);
    return reg(g);
  };

  // Shared primitives
  const sphere = reg(new THREE.SphereGeometry(1, 9, 7));
    const cyl7 = reg(new THREE.CylinderGeometry(1, 1, 1, 7, 1));
  const cone4 = reg(new THREE.ConeGeometry(1, 1, 4));
  const cone5 = reg(new THREE.ConeGeometry(1, 1, 5));
  const cone3 = reg(new THREE.ConeGeometry(1, 1, 3));
  const box = reg(new THREE.BoxGeometry(1, 1, 1));
  const ringG = reg(new THREE.TorusGeometry(1, 0.07, 4, 12));

  const M = {
    skin: mat(COLORS.skin), hair: mat(COLORS.hair), beard: mat(COLORS.beard),
    steel: mat(COLORS.steel), steelHi: mat(COLORS.steelHi), steelD: mat(COLORS.steelD),
    gold: mat(COLORS.gold), swordGold: mat(COLORS.swordGold), red: mat(COLORS.red),
    redD: mat(COLORS.redD), boot: mat(COLORS.boot), belt: mat(COLORS.belt),
    skirt: mat(COLORS.skirt), grip: mat(COLORS.grip), spike: mat(COLORS.spike),
    grey: mat(COLORS.grey), goldHi: mat('#f0d070'), visor: mat(COLORS.visor), plume: mat(COLORS.plume),
    white: mat('#e9f7ff'), pupil: mat('#263a4c'), brow: mat('#3a2015'), mouth: mat('#754126'),
    cape: mat(COLORS.red, { side: THREE.DoubleSide }),
    blade: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
  };
  mats.set('blade', M.blade);

  const root = new THREE.Group();
  root.name = 'warrior';
  const body = new THREE.Group();
  root.add(body);

  // ---- Legs: wide plated legs, dark boots ----
  const makeLeg = (side: number): LegRig => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.55, 1.4, 0);
    body.add(hip);
    add(hip, cyl7, M.steelD, 0, -0.42, 0, 0.4, 0.86, 0.4);
    const knee = new THREE.Group();
    knee.position.set(0, -0.82, 0);
    hip.add(knee);
    add(knee, sphere, M.steel, 0, 0.02, 0.16, 0.38, 0.3, 0.3);
    add(knee, cyl7, M.grey, 0, -0.35, 0, 0.38, 0.62, 0.38);
    add(knee, plate([[-0.5, 0.25], [0.5, 0.25], [0.46, -0.2], [0.55, -0.26], [-0.55, -0.26], [-0.46, -0.2]], 1.0, 0.05), M.boot, 0, -0.62, 0.22);
    add(knee, box, M.boot, 0, -0.5, -0.1, 0.9, 0.2, 0.7);
    return { hip, knee };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // ---- Torso (pivot at belt) ----
  const torso = new THREE.Group();
  torso.position.set(0, 1.4, 0);
  body.add(torso);
  add(torso, box, M.steelD, 0, -0.15, 0, 1.5, 0.35, 0.85); // pelvis guard
  add(torso, plate([[-0.95, 1.45], [0.95, 1.45], [0.72, -0.05], [-0.72, -0.05]], 0.8, 0.09), M.steel, 0, 0, 0);
  add(torso, plate([[-0.78, 1.3], [0.78, 1.3], [0.55, 0.45], [0, 0.2], [-0.55, 0.45]], 0.2, 0.06), M.steelHi, 0, 0.0, 0.44);
  add(torso, plate([[-0.25, 1.15], [0.25, 1.15], [0.25, 0.1], [-0.25, 0.1]], 0.1, 0.04), M.grey, 0, 0.05, 0.6);
  const chevL = add(torso, box, M.goldHi, -0.3, 1.2, 0.7, 0.65, 0.09, 0.06); chevL.rotation.z = -0.5;
  const chevR = add(torso, box, M.goldHi, 0.3, 1.2, 0.7, 0.65, 0.09, 0.06); chevR.rotation.z = 0.5;
  const xA = add(torso, box, M.goldHi, 0, 0.6, 0.72, 0.1, 1.0, 0.05); xA.rotation.z = 0.8;
  const xB = add(torso, box, M.goldHi, 0, 0.6, 0.72, 0.1, 1.0, 0.05); xB.rotation.z = -0.8;
  for (const ry of [0.3, 0.8]) add(torso, box, M.gold, 0, ry, 0.7, 1.15, 0.06, 0.05);
  add(torso, box, M.belt, 0, 0.02, 0, 1.75, 0.27, 0.98);
  const buckle = add(torso, cyl7, M.gold, 0, 0.02, 0.52, 0.22, 0.08, 0.22);
  buckle.rotation.x = Math.PI / 2;
  [-0.62, -0.21, 0.21, 0.62].forEach((x) => {
    const t = add(torso, cone3, M.skirt, x, -0.38, 0.36, 0.3, 0.6, 0.2);
    t.rotation.x = Math.PI;
  });

  // Neck + head
  add(torso, cyl7, M.skin, 0, 1.6, 0, 0.3, 0.55, 0.3);
  const head = new THREE.Group();
  head.position.set(0, 2.35, 0);
  torso.add(head);
  // Enclosed gold helmet: dark visor opening with narrow eye slit, brim band, red plume
  add(head, sphere, M.visor, 0, 0, 0, 0.74, 0.8, 0.74);
  add(head, sphere, M.steel, 0, 0.1, -0.04, 0.83, 0.84, 0.8);
  add(head, sphere, M.visor, 0, -0.18, 0.55, 0.52, 0.55, 0.32);
  const brim = add(head, ringG, M.goldHi, 0, 0.36, 0.06, 0.82, 0.8, 1.6);
  brim.rotation.x = Math.PI / 2 - 0.2;
  add(head, box, M.goldHi, 0, 0.35, 0.78, 0.9, 0.14, 0.12);
  add(head, box, M.steelHi, 0, 0.62, 0.45, 0.14, 0.6, 0.2).rotation.x = -0.9;
  for (const sx of [-1, 1]) {
    add(head, plate([[-0.18, 0.4], [0.18, 0.4], [0.22, -0.4], [-0.22, -0.55]], 0.14, 0.04), M.steel, sx * 0.72, -0.28, 0.12).rotation.y = sx * 0.35;
    add(head, sphere, M.white, sx * 0.24, 0.0, 0.85, 0.11, 0.075, 0.05);
    add(head, sphere, M.pupil, sx * 0.24, 0.0, 0.88, 0.05, 0.05, 0.04);
    add(head, box, M.brow, sx * 0.25, 0.14, 0.86, 0.34, 0.07, 0.06).rotation.z = sx * 0.2;
  }
  add(head, sphere, M.beard, 0, -0.52, 0.5, 0.34, 0.14, 0.14);
  const plumeA = add(head, cone5, M.plume, -0.2, 1.0, -0.1, 0.22, 0.7, 0.3);
  plumeA.rotation.z = 0.55;
  const plumeB = add(head, cone5, M.plume, -0.05, 0.85, -0.2, 0.2, 0.5, 0.28);
  plumeB.rotation.set(-0.3, 0, 0.3);

  // Pauldrons: broad, lower than head, gold accents, small outer spikes
  for (const s of [-1, 1]) {
    const p = add(torso, sphere, M.steel, s * 1.3, 1.1, 0, 1.15, 0.72, 1.0);
    p.rotation.z = -s * 0.15;
    add(torso, ringG, M.gold, s * 1.3, 0.98, 0, 1.12, 0.98, 1).rotation.x = Math.PI / 2;
    add(torso, sphere, M.gold, s * 1.05, 1.76, 0.28, 0.17, 0.17, 0.17);
    const sp = add(torso, cone4, M.spike, s * 2.15, 1.3, 0, 0.2, 0.62, 0.2);
    sp.rotation.z = -s * 1.2;
    const sp2 = add(torso, cone4, M.spike, s * 1.9, 1.45, -0.25, 0.14, 0.42, 0.14);
    sp2.rotation.z = -s * 0.9;
  }

  // ---- Cape (behind the body) ----
  const cape = new THREE.Group();
  cape.position.set(0, 1.35, -0.5);
  torso.add(cape);
  const capeMesh = add(cape, plate([[-0.8, 0], [0.8, 0], [1.05, -2.2], [0.4, -1.95], [-0.2, -2.35], [-1.0, -2.05]], 0.06, 0.04), M.cape, 0, 0, 0);
  capeMesh.rotation.x = 0.03;

  // ---- Two-handed longsword ----
  const sword = new THREE.Group();
  torso.add(sword);
  const blade = reg(createBladeGeometry());
  add(sword, blade, M.blade);
  const guard = plate([[-1.2, 0.1], [-0.8, 0.26], [-0.4, -0.04], [0.4, -0.04], [0.8, 0.26], [1.2, 0.1], [0.82, -0.4], [0.3, -0.24], [-0.3, -0.24], [-0.82, -0.4]], 0.28, 0.05);
  add(sword, guard, M.swordGold, 0, 0, 0);
  add(sword, cyl7, M.grip, 0, -0.92, 0, 0.17, 1.5, 0.17);
  for (let i = 0; i < 5; i++) add(sword, cyl7, M.swordGold, 0, -0.35 - i * 0.28, 0, 0.2, 0.04, 0.2);
  add(sword, sphere, M.swordGold, 0, -1.85, 0, 0.27, 0.32, 0.27);

  // ---- Arms (positioned each frame by two-bone IK onto the grip) ----
  const makeArm = (side: number, gripY: number): ArmRig => ({
    side,
    shoulder: new THREE.Vector3(side * 0.9, 1.1, 0),
    upper: add(torso, cyl7, M.steel, 0, 0, 0),
    fore: add(torso, cyl7, M.steelD, 0, 0, 0),
    elbow: add(torso, sphere, M.steel, 0, 0, 0, 0.3, 0.3, 0.3),
    hand: add(torso, sphere, M.skin, 0, 0, 0, 0.3, 0.27, 0.3),
    gripY,
  });
  const armR = makeArm(-1, -0.45); // upper hand
  const armL = makeArm(1, -1.05);

  const root_ = root;
  const dispose = () => {
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
  };
  let meshes = 0;
  root_.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });

  return {
    root,
    rig: { body, torso, head, cape, sword, legs: [legL, legR], arms: [armL, armR], armLength: 0.95 },
    stats: { triangles: countTriangles(root), meshes, geometries: geos.length, materials: mats.size },
    dispose,
  };
}
