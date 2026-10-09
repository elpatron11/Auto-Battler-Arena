import * as THREE from 'three';
import { K, rng, type Kit, type V3 } from './kit';
import type { WarSnapshot } from '../../lib/guildWarTypes';

export type Rect = { x: number; y: number; w: number; h: number };
export type MapInfo = { width: number; height: number; scale: number; walls: Rect[]; ramps: { x: number; y: number }[] };
export const WALL_H = 3.4;
export const TOWER_H = 5.4;

export const FALLBACK_MAP: MapInfo = {
  width: 1200, height: 800, scale: 1, ramps: [],
  walls: [[440, 220, 320, 14], [440, 220, 14, 320], [746, 220, 14, 320], [440, 526, 120, 14], [640, 526, 120, 14]].map(([x, y, w, h]) => ({ x, y, w, h })),
};
export const FALLBACK_CAMPS: [number, number][] = [[120, 120], [1080, 120], [1080, 710], [600, 740], [120, 710]];

export function mapFromSnap(s: WarSnapshot | null): MapInfo {
  const m = s?.map;
  if (!m || !m.width || !m.height) return FALLBACK_MAP;
  return { width: m.width, height: m.height, scale: m.scale || 1, walls: m.walls ?? [], ramps: m.ramps ?? [] };
}
export function mapKey(m: MapInfo) { return `${m.width}x${m.height}x${m.scale}|${m.walls.map((w) => `${w.x},${w.y},${w.w},${w.h}`).join(';')}|${m.ramps.map((r) => `${r.x},${r.y}`).join(';')}`; }
export function bounds(walls: Rect[], m: MapInfo) {
  if (!walls.length) return { x0: m.width * 0.36, y0: m.height * 0.27, x1: m.width * 0.64, y1: m.height * 0.68 };
  return { x0: Math.min(...walls.map((w) => w.x)), y0: Math.min(...walls.map((w) => w.y)), x1: Math.max(...walls.map((w) => w.x + w.w)), y1: Math.max(...walls.map((w) => w.y + w.h)) };
}

export function buildWorld(kit: Kit, map: MapInfo, towers: { x: number; y: number }[]) {
  const root = new THREE.Group();
  const { geo, mat, m, grp } = kit;
  const W = map.width * K, H = map.height * K;
  const R = rng(7);
  const ground = kit.canvasTex(256, (c, n) => {
    c.fillStyle = '#4d6140'; c.fillRect(0, 0, n, n);
    for (let i = 0; i < 700; i++) { const a = R(); c.fillStyle = a < 0.5 ? 'rgba(96,120,70,0.35)' : a < 0.8 ? 'rgba(52,70,44,0.4)' : 'rgba(120,104,70,0.25)'; c.beginPath(); c.arc(R() * n, R() * n, 2 + R() * 7, 0, 7); c.fill(); }
  }, Math.max(4, W / 10), Math.max(3, H / 10));
  const stone = kit.canvasTex(128, (c, n) => {
    c.fillStyle = '#8c929e'; c.fillRect(0, 0, n, n); c.strokeStyle = 'rgba(30,36,50,0.55)'; c.lineWidth = 2;
    for (let r = 0; r < 4; r++) {
      const y = r * n / 4; c.beginPath(); c.moveTo(0, y); c.lineTo(n, y); c.stroke();
      for (let i = 0; i < 3; i++) { const x = ((i + (r % 2) * 0.5) * n) / 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + n / 4); c.stroke(); c.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '20,24,36'},0.08)`; c.fillRect(x + 2, y + 2, n / 3 - 4, n / 4 - 4); }
    }
  });
  const flag = kit.canvasTex(128, (c, n) => {
    c.fillStyle = '#5b6070'; c.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y += 32) for (let x = 0; x < n; x += 32) { c.fillStyle = (x + y) / 32 % 2 ? '#666b7b' : '#4f5463'; c.fillRect(x, y, 32, 32); }
    c.strokeStyle = 'rgba(0,0,0,0.3)'; c.strokeRect(0, 0, n, n);
  }, 8, 6);
  // terrain
  const gp = m(root, geo.plane, mat('#ffffff', { map: ground }), [W / 2, -0.02, H / 2], [W + 120, H + 120, 1], [-Math.PI / 2, 0, 0]);
  gp.matrixAutoUpdate = true;
  m(root, geo.box, mat('#2c3a2a'), [W / 2, -1.2, H / 2], [W + 3, 2, H + 3]);
  // edge hills, trees and rocks outside the playable rectangle
  const trees: V3[] = []; const rocks: V3[] = [];
  for (let i = 0; i < 90; i++) {
    const side = Math.floor(R() * 4), t = R(), d = 2 + R() * 14;
    const x = side === 0 ? t * W : side === 1 ? t * W : side === 2 ? -d : W + d;
    const z = side === 2 || side === 3 ? t * H : side === 0 ? -d : H + d;
    (R() < 0.7 ? trees : rocks).push([x, 0, z]);
  }
  const tg = new THREE.InstancedMesh(geo.cone, mat('#2f5a3c'), trees.length), tt = new THREE.InstancedMesh(geo.cyl, mat('#5a4330'), trees.length), rk = new THREE.InstancedMesh(geo.octa, mat('#7b7f88'), rocks.length);
  const d = new THREE.Object3D();
  trees.forEach((p, i) => { const s = 0.9 + R() * 0.9; d.position.set(p[0], 1.6 * s, p[2]); d.scale.set(1.2 * s, 3.2 * s, 1.2 * s); d.rotation.set(0, R() * 3, 0); d.updateMatrix(); tg.setMatrixAt(i, d.matrix); d.position.set(p[0], 0.3 * s, p[2]); d.scale.set(0.2 * s, 0.6 * s, 0.2 * s); d.updateMatrix(); tt.setMatrixAt(i, d.matrix); });
  rocks.forEach((p, i) => { const s = 0.6 + R() * 1.4; d.position.set(p[0], 0.3 * s, p[2]); d.scale.set(s, 0.7 * s, s * 0.8); d.rotation.set(R(), R() * 3, 0); d.updateMatrix(); rk.setMatrixAt(i, d.matrix); });
  root.add(tg, tt, rk);

  const b = bounds(map.walls, map);
  const cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2;
  // castle courtyard floor + owner tint overlay
  const ow = Math.max(0, (b.x1 - b.x0)) * K, oh = Math.max(0, (b.y1 - b.y0)) * K;
  m(root, geo.plane, mat('#ffffff', { map: flag }), [cx * K, 0.03, cz * K], [ow, oh, 1], [-Math.PI / 2, 0, 0]);
  const ownerMat = new THREE.MeshBasicMaterial({ color: '#c0c6d2', transparent: true, opacity: 0, depthWrite: false });
  const tint = new THREE.Mesh(geo.plane, ownerMat); tint.position.set(cx * K, 0.05, cz * K); tint.scale.set(ow, oh, 1); tint.rotation.x = -Math.PI / 2; tint.userData.keep = true; root.add(tint);

  // walls: exact authoritative collision rectangles
  const stoneM = mat('#ffffff', { map: stone }), capM = mat('#6d7382');
  let merlons = 0; const mer: V3[] = []; const merDims: V3[] = [];
  for (const w of map.walls) {
    const sx = w.w * K, sz = w.h * K;
    const bg = kit.reg(new THREE.BoxGeometry(sx, WALL_H, sz));
    const uv = bg.getAttribute('uv'); const rep = Math.max(sx, sz) / 3;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep, uv.getY(i));
    m(root, bg, stoneM, [(w.x + w.w / 2) * K, WALL_H / 2, (w.y + w.h / 2) * K]);
    m(root, geo.box, capM, [(w.x + w.w / 2) * K, WALL_H + 0.06, (w.y + w.h / 2) * K], [sx + 0.12, 0.14, sz + 0.12]);
    const alongX = sx >= sz, len = alongX ? sx : sz, n = Math.floor(len / 1.0);
    for (let i = 0; i < n; i++) {
      const t = -len / 2 + (i + 0.5) * (len / n);
      mer.push(alongX ? [(w.x + w.w / 2) * K + t, WALL_H + 0.45, (w.y + w.h / 2) * K] : [(w.x + w.w / 2) * K, WALL_H + 0.45, (w.y + w.h / 2) * K + t]);
      merDims.push(alongX ? [0.5, 0.65, sz + 0.12] : [sx + 0.12, 0.65, 0.5]); merlons++;
    }
  }
  if (merlons) {
    const im = new THREE.InstancedMesh(geo.box, mat('#9aa0ae'), merlons);
    mer.forEach((p, i) => { d.position.set(...p); d.scale.set(...merDims[i]); d.rotation.set(0, 0, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    root.add(im);
  }
  // corner buttress turrets at wall corners (visual only, inside the wall rectangle footprints)
  const corners = new Map<string, [number, number]>();
  for (const w of map.walls) for (const [px, py] of [[w.x, w.y], [w.x + w.w, w.y], [w.x, w.y + w.h], [w.x + w.w, w.y + w.h]]) {
    const near = map.walls.filter((o) => px >= o.x - 1 && px <= o.x + o.w + 1 && py >= o.y - 1 && py <= o.y + o.h + 1).length;
    if (near >= 2 && (px <= b.x0 + 1 || px >= b.x1 - 1) && (py <= b.y0 + 1 || py >= b.y1 - 1)) corners.set(`${px},${py}`, [px, py]);
  }
  corners.forEach(([px, py]) => {
    const g2 = grp(root, [px * K + (px <= b.x0 + 1 ? 0.45 : -0.45), 0, py * K + (py <= b.y0 + 1 ? 0.45 : -0.45)]);
    m(g2, geo.cyl, stoneM, [0, (WALL_H + 0.9) / 2, 0], [0.75, WALL_H + 0.9, 0.75]);
    m(g2, geo.cone, mat('#6e3b3b'), [0, WALL_H + 1.8, 0], [0.95, 1.8, 0.95]);
  });

  // ramps leading up to the nearest archer tower / wall walkway
  for (const r of map.ramps) {
    let tx = cx, tz = cz, best = 1e12;
    for (const t of towers) { const dd = (t.x - r.x) ** 2 + (t.y - r.y) ** 2; if (dd < best) { best = dd; tx = t.x; tz = t.y; } }
    const yaw = Math.atan2(tx - r.x, tz - r.y);
    const sh = new THREE.Shape(); sh.moveTo(-3, 0); sh.lineTo(3, 0); sh.lineTo(3, 3.2); sh.closePath();
    const rg = kit.reg(new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: false }));
    rg.translate(0, 0, -1.2);
    const rp = grp(root, [r.x * K, 0, r.y * K]); rp.rotation.y = yaw - Math.PI / 2;
    m(rp, rg, mat('#a79a80')); // wedge rises toward +X of the rotated frame
    for (let i = 0; i < 6; i++) m(rp, geo.box, mat('#6b6354'), [-2.5 + i * 1, 0.45 + i * 0.52, 0], [0.12, 0.08, 2.5]);
  }

  // keep: placed against the north wall, behind the core marker
  const ks = Math.max(1, map.scale * 0.8);
  const keep = grp(root, [cx * K, 0, (b.y0 + 14 * map.scale + 46 * ks) * K]);
  const sc = (v: V3): V3 => [v[0] * ks, v[1] * ks, v[2] * ks];
  m(keep, geo.box, stoneM, [0, 2.6 * ks, 0], sc([6.4, 5.2, 4.2]));
  m(keep, geo.box, stoneM, [0, 6.0 * ks, 0.1 * ks], sc([4.6, 2.6, 3.4]));
  m(keep, geo.pyr, mat('#7a3f3d'), [0, 8.9 * ks, 0.1 * ks], sc([3.6, 3.2, 3.0]));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    m(keep, geo.cyl, stoneM, [sx * 3.3 * ks, 4.1 * ks, sz * 2.2 * ks], sc([0.95, 8.2, 0.95]));
    m(keep, geo.cone, mat('#7a3f3d'), [sx * 3.3 * ks, 9.3 * ks, sz * 2.2 * ks], sc([1.25, 2.2, 1.25]));
    m(keep, geo.box, mat('#1b2030'), [sx * 3.3 * ks, 5.6 * ks, sz * 2.2 * ks + sz * 0.9 * ks], sc([0.18, 0.7, 0.05]));
  }
  for (let i = 0; i < 7; i++) m(keep, geo.box, mat('#a2a8b6'), [(-2.7 + i * 0.9) * ks, 5.4 * ks, 2.05 * ks], sc([0.5, 0.5, 0.35]));
  m(keep, geo.box, mat('#3b2a1c'), [0, 1.2 * ks, 2.15 * ks], sc([1.5, 2.4, 0.12]));
  m(keep, geo.cyl, mat('#3b2a1c'), [0, 2.4 * ks, 2.15 * ks], sc([0.75, 0.12, 0.12]), [0, 0, Math.PI / 2]);
  for (const sx of [-1, 1]) m(keep, geo.box, mat('#1b2030'), [sx * 1.8 * ks, 3.4 * ks, 2.12 * ks], sc([0.4, 0.9, 0.06]));
  const keepFlags: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const pole = grp(keep, [sx * 1.7 * ks, 7.6 * ks, 1.8 * ks]);
    m(pole, geo.cyl, mat('#cdbb8d'), [0, 0.6, 0], [0.05, 1.2, 0.05]);
    keepFlags.push(m(pole, geo.flag, ownerMat.clone() as unknown as THREE.Material, [0.02, 0.8, 0], [1.2, 1.2, 1]));
  }
  keepFlags.forEach((f) => { f.userData.keep = true; });
  const keepFlagMats = keepFlags.map((f) => { const mt = f.material as THREE.MeshBasicMaterial; mt.opacity = 1; mt.transparent = false; mt.color.set('#c0c6d2'); return mt; });
  // courtyard torches
  const flames: THREE.Mesh[] = [];
  for (const [px, pz] of [[b.x0 + 24, b.y0 + 30], [b.x1 - 24, b.y0 + 30], [b.x0 + 24, b.y1 - 30], [b.x1 - 24, b.y1 - 30]]) {
    const t = grp(root, [px * K, 0, pz * K]);
    m(t, geo.cyl, mat('#4a3a2a'), [0, 0.7, 0], [0.08, 1.4, 0.08]);
    { const fl = m(t, geo.cone, mat('#ffae45', { emissive: 0.9 }), [0, 1.6, 0], [0.22, 0.55, 0.22]); fl.userData.keep = true; flames.push(fl); }
  }
  kit.merge(root);
  return { root, ownerMat, keepFlagMats, flames, ground: { W, H }, bounds: b, dispose() { /* kit owns resources */ } };
}

export function buildCamps(kit: Kit, s: WarSnapshot | null, map: MapInfo, gate: { x: number; y: number } | null) {
  const root = new THREE.Group(); const { geo, mat, m, grp } = kit;
  const flags: { mesh: THREE.Object3D; ph: number }[] = []; const fires: THREE.Mesh[] = [];
  const camps = s ? s.guilds.map((g) => ({ x: g.camp.x, y: g.camp.y, color: g.color, name: g.name })) : FALLBACK_CAMPS.map(([x, y]) => ({ x, y, color: '#8d94a3', name: '' }));
  const gp = gate ?? { x: map.width * 0.5, y: map.height * 0.69 };
  const approach = { x: gp.x, y: gp.y + 70 * map.scale };
  // banner route: dirt ribbon + gold waymarkers from each camp to the gate approach
  const mk: V3[] = [];
  camps.forEach((c) => {
    const dx = approach.x - c.x, dy = approach.y - c.y, len = Math.hypot(dx, dy) * K, yaw = Math.atan2(dx, dy);
    const mx = (c.x + approach.x) / 2 * K, mz = (c.y + approach.y) / 2 * K;
    m(root, geo.box, mat('#6f6246', { opacity: 0.55 }), [mx, 0.03, mz], [1.5, 0.02, len], [0, yaw, 0]);
    const n = Math.floor(len / 2.6);
    for (let i = 1; i < n; i++) { const t = i / n; mk.push([(c.x + dx * t) * K, 0.08, (c.y + dy * t) * K]); }
  });
  if (mk.length) {
    const im = new THREE.InstancedMesh(geo.box, mat('#efc563', { emissive: 0.35 }), mk.length); const d = new THREE.Object3D();
    mk.forEach((p, i) => { d.position.set(...p); d.scale.set(0.22, 0.08, 0.5); d.rotation.set(0, i * 1.1, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    root.add(im);
  }
  camps.forEach((c, ci) => {
    const g = grp(root, [c.x * K, 0, c.y * K]); const R = rng(ci * 97 + 3);
    m(g, geo.disc, mat('#6a5a40'), [0, 0.04, 0], [4.8, 1, 4.8]);
    m(g, geo.ring, mat(c.color, { basic: true, opacity: 0.8 }), [0, 0.06, 0], [4.8, 1, 4.8]);
    const body = mat(c.color), dark = mat('#2a2a34'), trim = mat('#d8cfb4');
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.5 + 0.6, r = 3.1 + R() * 0.3;
      if (Math.sin(a) < -0.6 && ci === 0) { /* keep spacing */ }
      const t = grp(g, [Math.cos(a) * r, 0, Math.sin(a) * r]); t.rotation.y = -a + Math.PI / 2;
      m(t, geo.pyr, body, [0, 0.95, 0], [1.7, 1.9, 1.7]);
      m(t, geo.box, dark, [0, 0.6, 1.1], [0.55, 1.1, 0.05]);
      m(t, geo.cyl, trim, [0, 2.05, 0], [0.05, 0.4, 0.05]);
    }
    m(g, geo.cyl, mat('#4d4d55'), [0, 0.1, 0], [0.7, 0.2, 0.7]);
    { const fr = m(g, geo.cone, mat('#ff9a3d', { emissive: 0.9 }), [0, 0.5, 0], [0.32, 0.8, 0.32]); fr.userData.keep = true; fires.push(fr); }
    for (let i = 0; i < 3; i++) m(g, geo.box, mat('#6b5037'), [-1.2 + i * 0.5, 0.25, -0.2 + R() * 0.4], [0.4, 0.4, 0.4], [0, R() * 3, 0]);
    const pole = grp(g, [-0.2, 0, -1.2]);
    m(pole, geo.cyl, mat('#cdbb8d'), [0, 1.7, 0], [0.06, 3.4, 0.06]);
    const f = m(pole, geo.flag, mat(c.color, { basic: true }), [0.03, 3.0, 0], [1.6, 1.3, 1]);
    f.userData.keep = true; flags.push({ mesh: f, ph: ci });
  });
  kit.merge(root);
  return { root, flags, fires, camps };
}

export function buildTower(kit: Kit, color: string) {
  const { geo, mat, m, grp } = kit; const g = grp(new THREE.Group());
  const stone = mat('#8d93a0'), dark = mat('#5f6573'), slit = mat('#171b27');
  m(g, geo.cyl, dark, [0, 0.35, 0], [1.75, 0.7, 1.75]);
  m(g, geo.cyl, stone, [0, TOWER_H / 2, 0], [1.4, TOWER_H, 1.4]);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; m(g, geo.box, slit, [Math.cos(a) * 1.38, 3.2, Math.sin(a) * 1.38], [0.12, 0.7, 0.12], [0, -a, 0]); }
  m(g, geo.cyl, dark, [0, TOWER_H + 0.05, 0], [1.75, 0.3, 1.75]);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; m(g, geo.box, stone, [Math.cos(a) * 1.6, TOWER_H + 0.55, Math.sin(a) * 1.6], [0.5, 0.7, 0.4], [0, -a + Math.PI / 2, 0]); }
  m(g, geo.cyl, mat('#4b3a2a'), [0, TOWER_H + 0.22, 0], [1.3, 0.1, 1.3]);
  const pole = grp(g, [1.2, TOWER_H + 0.2, 0]);
  m(pole, geo.cyl, mat('#cdbb8d'), [0, 1.0, 0], [0.05, 2.0, 0.05]);
  const flag = m(pole, geo.flag, mat(color, { basic: true }), [0.03, 1.55, 0], [1.0, 0.9, 1]);
  flag.userData.keep = true; kit.merge(g);
  return { g, flag };
}

export function buildGate(kit: Kit, x0: number, x1: number, y: number, thick: number) {
  const { geo, mat, m, grp } = kit; const g = new THREE.Group();
  const w = (x1 - x0) * K, cx = (x0 + x1) / 2 * K, cz = y * K, t = Math.max(0.7, thick * K);
  const stone = mat('#8d93a0'), wood = mat('#7a5632'), iron = mat('#2f3340');
  for (const sx of [-1, 1]) {
    const tw = grp(g, [cx + sx * (w / 2 + 0.2), 0, cz]);
    m(tw, geo.cyl, stone, [0, (WALL_H + 1.4) / 2, 0], [1.05, WALL_H + 1.4, 1.05]);
    m(tw, geo.cone, mat('#6e3b3b'), [0, WALL_H + 2.5, 0], [1.3, 2.1, 1.3]);
  }
  m(g, geo.box, stone, [cx, WALL_H - 0.35, cz], [w, 0.8, t * 1.05]);
  const door = grp(g, [cx, 0, cz]);
  for (const sx of [-1, 1]) {
    m(door, geo.box, wood, [sx * w / 4, (WALL_H - 0.8) / 2, 0], [w / 2 - 0.05, WALL_H - 0.8, 0.22]);
    for (const yy of [0.6, 1.5, 2.3]) m(door, geo.box, iron, [sx * w / 4, yy, 0.14], [w / 2 - 0.1, 0.12, 0.06]);
  }
  const rubble = grp(g, [cx, 0, cz]);
  for (let i = 0; i < 7; i++) m(rubble, geo.box, mat(i % 2 ? '#777c88' : '#6a5238'), [(i - 3) * w / 8, 0.15, (i % 3 - 1) * 0.3], [0.5, 0.3 + (i % 3) * 0.08, 0.5], [0.2 * i, i, 0.1 * i]);
  const bridge = grp(g, [cx, 0, cz + t / 2 + 1.2]);
  m(bridge, geo.box, mat('#8a6a3a'), [0, 0.1, 0], [w, 0.2, 2.4]);
  for (let i = 0; i < 8; i++) m(bridge, geo.box, mat('#3a2a14'), [0, 0.22, -1.1 + i * 0.3], [w, 0.02, 0.03]);
  door.userData.keep = true; rubble.userData.keep = true; bridge.userData.keep = true; kit.merge(g);
  return { g, door, rubble, bridge };
}
