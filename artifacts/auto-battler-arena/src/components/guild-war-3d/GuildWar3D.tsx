import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { WarEntity, WarSnapshot, WarStructure } from '../../lib/guildWarTypes';
import { createCharacterModel } from '../../prototypes/roster3d/characterModel';
import { isModelId, type ModelId } from '../../prototypes/roster3d/creatures';
import { PREMIUM_ROSTER_FACTORY } from '../../prototypes/roster3d/premiumRoster';
import { createPrestigeRosterModel } from '../../prototypes/roster3d/premiumRoster/prestige';
import type { CharacterModel } from '../../prototypes/roster3d/modelKit';
import { K, createKit, makeLabel, type Kit } from './kit';
import { FALLBACK_MAP, TOWER_H, WALL_H, buildCamps, buildGate, buildTower, buildWorld, mapFromSnap, mapKey, type MapInfo } from './world';

type Props = { snap: WarSnapshot | null; meId: string | null; zoom: number; onFail?: (reason: string) => void };
type Label = ReturnType<typeof makeLabel>;
type Bar = { g: THREE.Group; fill: THREE.Mesh; strip: THREE.Mesh };
type Ent = {
  id: string; group: THREE.Group; body: THREE.Group; mdl: THREE.Group; model: CharacterModel | null; key: string;
  hp: Bar; label: Label; ring: THREE.Mesh; defRing: THREE.Mesh; flash: THREE.Mesh; castRing: THREE.Mesh; shield: THREE.Mesh; ice: THREE.Mesh;
  stun: THREE.Mesh; crown: THREE.Mesh; classic: boolean; pips: THREE.Mesh[]; racial: THREE.Mesh; flag: THREE.Group; meMark: THREE.Mesh; shadow: THREE.Mesh;
  x: number; z: number; lift: number; yaw: number; moving: number; lastHp: number; hitAt: number; attackUntil: number; castUntil: number; ringColor: string; animAcc: number;
};
type Str = { id: string; kind: string; group: THREE.Group; bar: Bar; label: Label; shield: THREE.Mesh; sab: THREE.Group; imm: THREE.Mesh; flag?: THREE.Mesh; door?: THREE.Object3D; rubble?: THREE.Object3D; bridge?: THREE.Object3D; crystal?: THREE.Mesh; maxHp: number; occ: string };
type Sum = { id: string; group: THREE.Group; mdl: THREE.Group; model: CharacterModel; ring: THREE.Mesh; hp: Bar; x: number; z: number; yaw: number; moving: number; color: string };
type Fx = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; kind: 'proj' | 'ring'; t0: number; dur: number; ax: number; az: number; bx: number; bz: number; color: string; busy: boolean };

const MAX_SUMMONS = [12, 8, 5];
function makeModel(id: ModelId, dform: '' | 'bear' | 'tiger' | 'tree', skin: string): CharacterModel {
  // Same selection as live Arena (battleRenderer): prestige skins, then the premium roster, then base models.
  if ((id === 'paladin' && skin === 'wingedPaladin') || (id === 'warrior' && skin === 'emberLord')) return createPrestigeRosterModel(id);
  if (PREMIUM_ROSTER_FACTORY.supports(id, dform)) return PREMIUM_ROSTER_FACTORY.create(id, dform);
  return createCharacterModel(id, dform);
}
const FOV = 34, TILT = (54 * Math.PI) / 180;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angLerp = (a: number, b: number, t: number) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; if (d > Math.PI) d -= Math.PI * 2; return a + d * t; };

export type GuildWar3DStats = Record<string, number | string | boolean>;
declare global { interface Window { __guildWar3DStats?: GuildWar3DStats } }

function fxColor(kind: string, label: string) {
  const k = `${kind} ${label}`.toLowerCase();
  if (/heal|rejuv|renew|restor|regrow/.test(k)) return '#7be08f';
  if (/shield|ward|barrier|aegis/.test(k)) return '#8ec9ee';
  if (/frost|ice|freez|chill|blizz/.test(k)) return '#9fe3ff';
  if (/fire|burn|flame|ignite|meteor/.test(k)) return '#ff8a3d';
  if (/poison|shadow|curse|warlock|drain|fear|sabot/.test(k)) return '#b27ae0';
  if (/arrow|shot|bolt|volley/.test(k)) return '#e9dcae';
  return '#ffd27a';
}

export function GuildWar3D({ snap, meId, zoom, onFail }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapRef = useRef(snap); snapRef.current = snap;
  const meRef = useRef(meId); meRef.current = meId;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const failRef = useRef(onFail); failRef.current = onFail;
  const followRef = useRef(false);
  const ctl = useRef<{ reset: () => void; follow: (on: boolean) => void } | null>(null);
  const [follow, setFollowState] = useState(false);
  const [hud, setHud] = useState('');
  const [height, setHeight] = useState(420);
  const [awaiting, setAwaiting] = useState(true);

  useEffect(() => {
    const el = host.current; if (!el) return;
    const fit = () => {
      const w = el.clientWidth || 360, vh = window.innerHeight || 700;
      const portrait = vh > w;
      setHeight(Math.round(clamp(portrait ? Math.min(vh * 0.7, w * 1.25) : w * 0.62, 280, Math.max(320, vh * 0.82))));
    };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el);
    window.addEventListener('orientationchange', fit); window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('orientationchange', fit); window.removeEventListener('resize', fit); };
  }, []);

  useEffect(() => {
    const cv = canvasRef.current, box = host.current; if (!cv || !box) return;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 700;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !coarse, powerPreference: 'high-performance', alpha: false });
      if (!renderer.getContext()) throw new Error('no context');
    } catch (err) { failRef.current?.(err instanceof Error ? err.message : 'WebGL unavailable'); return; }
    const onLost = (e: Event) => { e.preventDefault(); failRef.current?.('WebGL context lost'); };
    cv.addEventListener('webglcontextlost', onLost);
    renderer.setClearColor('#16202e');
    const dprCap = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    let dpr = Math.min(dprCap, coarse ? 1.25 : 1.75);
    let tier = coarse ? 1 : 0; // 0 full, 1 reduced, 2 minimal
    let interval = coarse ? 1000 / 40 : 1000 / 60;
    const budgets = [48, 28, 14];

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#16202e', 120, 260);
    scene.add(new THREE.HemisphereLight('#c9d8f0', '#40503a', 1.05));
    const sun = new THREE.DirectionalLight('#ffe3b5', 1.7); sun.position.set(-30, 60, 25); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(FOV, 1.5, 0.5, 600);

    const kitS = createKit();
    let kitW: Kit | null = null, kitC: Kit | null = null;
    let world: ReturnType<typeof buildWorld> | null = null, campsB: ReturnType<typeof buildCamps> | null = null;
    const campLabels: Label[] = [];
    let curMap: MapInfo = FALLBACK_MAP, curMapKey = '', curCampKey = '';
    const { geo, mat, m, grp } = kitS;

    // shared HUD materials
    const hpGood = mat('#7fdc9e', { basic: true }), hpLow = mat('#f0645a', { basic: true }), hpBack = mat('#0a0e16', { basic: true, opacity: 0.85 });
    const pipM = mat('#efc563', { basic: true }), racialM = mat('#8ec9ee', { basic: true }); pipM.depthTest = false; racialM.depthTest = false;
    const goldM = mat('#efc563', { basic: true }), whiteM = mat('#ffffff', { basic: true });
    function makeBar(parent: THREE.Object3D, w: number): Bar {
      const g = new THREE.Group(); parent.add(g); g.renderOrder = 8;
      const bg = m(g, geo.plane, hpBack, [0, 0, 0], [w + 0.14, 0.34, 1]);
      const strip = m(g, geo.plane, whiteM, [0, 0.22, 0.001], [w + 0.14, 0.07, 1]);
      const fill = m(g, geo.barL, hpGood, [-w / 2, 0, 0.002], [w, 0.22, 1]);
      for (const o of [bg, strip, fill]) { o.renderOrder = 8; (o.material as THREE.Material).depthTest = false; }
      return { g, fill, strip };
    }
    const colMat = (c: string) => mat(c || '#c0c6d2', { basic: true });
    function setBar(b: Bar, ratio: number, w: number) {
      const r = clamp(ratio, 0, 1); b.fill.scale.x = Math.max(0.001, w * r); b.fill.material = r < 0.35 ? hpLow : hpGood;
    }

    // state
    const ents = new Map<string, Ent>(); const strs = new Map<string, Str>();
    const fxPool: Fx[] = []; let fxActive = 0;
    const st: Record<string, number | string | boolean> = {
      renderer: 'webgl', fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, dpr, tier, drawFpsCap: Math.round(1000 / interval),
      entities: 0, models: 0, modelBuilds: 0, modelDisposals: 0, vfxActive: 0, vfxBudget: budgets[tier], vfxSpawned: 0, vfxDropped: 0,
      eventsProcessed: 0, classicLodModels: 0, lodModelSource: '', summons: 0, modelMeshes: 0, lod: false, staticDrawNote: 'world/camps/towers/gate merged per material', snapshots: 0, mapWidth: 0, mapHeight: 0, canvasW: 0, canvasH: 0, structures: 0, camps: 0, walls: 0, ramps: 0, mobile: coarse, followMode: false, zoomTotal: 1,
    };
    Object.defineProperty(window, '__guildWar3DStats', { configurable: true, enumerable: true, get: () => ({ ...st }) as GuildWar3DStats });

    // boss
    const bossG = new THREE.Group(); scene.add(bossG);
    let bossModel: CharacterModel | null = null;
    try { bossModel = createCharacterModel('boss-temple'); bossModel.root.scale.setScalar(1.7); bossG.add(bossModel.root); st.modelBuilds = (st.modelBuilds as number) + 1; } catch { bossModel = null; }
    const bossRing = m(bossG, geo.ring, mat('#d6786e', { basic: true, opacity: 0.6 }), [0, 0.07, 0], [5.9, 1, 5.9]);
    const bossRing2 = m(bossG, geo.ring, mat('#d6786e', { basic: true, opacity: 0.35 }), [0, 0.07, 0], [5.0, 1, 5.0]);
    const bossGuild = m(bossG, geo.ring, colMat('#c0c6d2'), [0, 0.09, 0], [3.2, 1, 3.2]);
    const bossBar = makeBar(bossG, 3.4); const bossLabel = makeLabel('BOSS', '#f6c9c2'); bossG.add(bossLabel.sprite);
    bossBar.g.position.y = 6.2; bossLabel.sprite.position.y = 6.9; bossLabel.sprite.scale.set(5, 1.25, 1);
    let bossAttackUntil = 0; let bossDeadT = 0;

    // banner
    const bannerG = new THREE.Group(); scene.add(bannerG);
    m(bannerG, geo.cyl, mat('#cdbb8d'), [0, 1.8, 0], [0.07, 3.6, 0.07]);
    const bannerFlag = m(bannerG, geo.flag, mat('#efc563', { basic: true }), [0.04, 3.2, 0], [1.8, 1.5, 1]);
    m(bannerG, geo.cyl, mat('#efc563', { basic: true, opacity: 0.18 }), [0, 7, 0], [0.5, 14, 0.5]);
    m(bannerG, geo.ring, goldM, [0, 0.1, 0], [1.4, 1, 1.4]);
    const bannerLabel = makeLabel('BANNER', '#efc563'); bannerG.add(bannerLabel.sprite); bannerLabel.sprite.position.y = 4.4; bannerLabel.sprite.scale.set(4, 1, 1);

    // camera / interaction state
    const view = { tx: 0, tz: 0, user: 1, w: 1, h: 1 };
    let vw = 1, vh = 1;
    const ex = (d: number) => clamp(d / 52, 1, 1.8);
    function camDist() {
      const z = clamp(zoomRef.current * view.user, 1, 7);
      const aspect = vw / vh, tf = Math.tan((FOV * Math.PI) / 360);
      const W = curMap.width * K, H = curMap.height * K;
      const dW = (W * 1.06) / (2 * tf * aspect), dH = (H * 1.1 * Math.sin(TILT)) / (2 * tf);
      return { d: Math.max(dW, dH) / z, z, tf, aspect };
    }
    function clampView() {
      const { d, tf, aspect } = camDist(); const W = curMap.width * K, H = curMap.height * K;
      const hw = d * tf * aspect, hh = (d * tf) / Math.sin(TILT);
      view.tx = hw * 2 >= W ? W / 2 : clamp(view.tx, hw, W - hw);
      view.tz = hh * 2 >= H ? H / 2 : clamp(view.tz, hh, H - hh);
    }
    function setFollow(on: boolean) {
      followRef.current = on; setFollowState(on); st.followMode = on;
      if (on && zoomRef.current * view.user < 2.4) view.user = 2.4 / zoomRef.current;
    }
    ctl.current = { reset: () => { setFollow(false); view.user = 1; view.tx = (curMap.width * K) / 2; view.tz = (curMap.height * K) / 2; }, follow: setFollow };

    function resize() {
      const w = Math.max(1, box!.clientWidth), h = Math.max(1, box!.clientHeight);
      vw = w; vh = h; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix(); st.canvasW = renderer.domElement.width; st.canvasH = renderer.domElement.height; st.dpr = +dpr.toFixed(2);
    }
    const ro = new ResizeObserver(resize); ro.observe(box); resize();

    const pts = new Map<number, { x: number; y: number }>(); let pinchD = 0;
    const pan = (dx: number, dy: number) => {
      const { d, tf, aspect } = camDist(); const wpp = (2 * d * tf * aspect) / vw;
      view.tx -= dx * wpp; view.tz -= (dy * wpp) / Math.sin(TILT);
      if (followRef.current) setFollow(false);
    };
    const onDown = (e: PointerEvent) => { cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); } };
    const onMove = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) pan(dx, dy);
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const nd = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) view.user = clamp(view.user * (nd / pinchD), 1 / zoomRef.current, 7 / zoomRef.current);
        pinchD = nd; pan(dx / 2, dy / 2);
      }
    };
    const onUp = (e: PointerEvent) => { pts.delete(e.pointerId); pinchD = 0; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); view.user = clamp(view.user * Math.exp(-e.deltaY * 0.0014), 1 / zoomRef.current, 7 / zoomRef.current); };
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp); cv.addEventListener('wheel', onWheel, { passive: false });

    // ---------- builders ----------
    function rebuildWorld(map: MapInfo, towers: { x: number; y: number }[]) {
      if (world) scene.remove(world.root);
      world?.keepFlagMats.forEach((x) => x.dispose()); world?.ownerMat.dispose(); kitW?.dispose();
      kitW = createKit(); world = buildWorld(kitW, map, towers); scene.add(world.root);
      curMap = map; st.mapWidth = map.width; st.mapHeight = map.height; st.walls = map.walls.length; st.ramps = map.ramps.length;
      for (const s of strs.values()) { scene.remove(s.group); s.label.dispose(); } strs.clear();
      view.tx = (map.width * K) / 2; view.tz = (map.height * K) / 2;
    }
    function rebuildCamps(s: WarSnapshot | null, gate: { x: number; y: number } | null) {
      if (campsB) scene.remove(campsB.root);
      campLabels.splice(0).forEach((l) => l.dispose()); kitC?.dispose();
      kitC = createKit(); campsB = buildCamps(kitC, s, curMap, gate); scene.add(campsB.root);
      campsB.camps.forEach((c) => { if (!c.name) return; const l = makeLabel(c.name.slice(0, 16), '#f0e9d7'); l.sprite.position.set(c.x * K, 5.6, c.y * K); l.sprite.scale.set(6, 1.5, 1); scene.add(l.sprite); campLabels.push(l); });
      st.camps = campsB.camps.length;
    }
    const gcol = (s: WarSnapshot, id: string | null) => s.guilds.find((g) => g.id === id)?.color ?? '#c0c6d2';

    function makeStruct(sd: WarStructure): Str {
      const group = new THREE.Group(); group.position.set(sd.x * K, 0, sd.y * K); scene.add(group);
      let flag: THREE.Mesh | undefined, door, rubble, bridge, crystal: THREE.Mesh | undefined;
      let gateGroup: THREE.Group | null = null;
      if (sd.kind === 'tower') { const t = buildTower(kitS, '#c0c6d2'); group.add(t.g); flag = t.flag; }
      else if (sd.kind === 'gate') {
        const wallsNear = curMap.walls.filter((w) => w.w >= w.h && Math.abs(w.y + w.h / 2 - sd.y) < 40 * curMap.scale);
        const left = Math.max(-1, ...wallsNear.filter((w) => w.x + w.w <= sd.x + 1).map((w) => w.x + w.w));
        const right = Math.min(1e9, ...wallsNear.filter((w) => w.x >= sd.x - 1).map((w) => w.x));
        const x0 = left > 0 ? left : sd.x - 40 * curMap.scale, x1 = right < 1e9 ? right : sd.x + 40 * curMap.scale;
        const thick = wallsNear[0]?.h ?? 14;
        const g = buildGate(kitS, x0, x1, sd.y, thick); gateGroup = g.g; g.g.position.set(-sd.x * K, 0, -sd.y * K); group.add(g.g);
        door = g.door; rubble = g.rubble; bridge = g.bridge;
      } else if (sd.kind === 'core' || sd.kind === 'crystal') {
        m(group, geo.cyl, mat('#6d7382'), [0, 0.25, 0], [1.7, 0.5, 1.7]); m(group, geo.cyl, mat('#a79a80'), [0, 0.6, 0], [1.2, 0.2, 1.2]);
        crystal = m(group, geo.octa, mat('#efc563', { emissive: 0.7 }), [0, 2.0, 0], [0.8, 1.3, 0.8]);
      } else { m(group, geo.cyl, mat('#8d93a0'), [0, 1.2, 0], [0.8, 2.4, 0.8]); m(group, geo.cone, mat('#6e3b3b'), [0, 2.9, 0], [1.0, 1, 1.0]); }
      void gateGroup;
      const bar = makeBar(group, 2.8); const label = makeLabel(sd.kind.toUpperCase(), '#f0e9d7'); label.sprite.scale.set(4, 1, 1); group.add(label.sprite);
      const top = sd.kind === 'tower' ? TOWER_H + 2.6 : sd.kind === 'gate' ? WALL_H + 3.6 : 4.4;
      bar.g.position.y = top; label.sprite.position.y = top + 0.9;
      const shield = m(group, geo.sphere, mat('#8ec9ee', { opacity: 0.28, basic: true }), [0, sd.kind === 'tower' ? TOWER_H / 2 : 1.6, 0], [2.4, sd.kind === 'tower' ? TOWER_H / 1.6 : 2.4, 2.4]);
      const sab = new THREE.Group(); sab.position.y = top - 0.8; group.add(sab);
      const red = mat('#e0483c', { emissive: 0.8 }); m(sab, geo.box, red, [0, 0, 0], [1.2, 0.18, 0.18], [0, 0, 0.78]); m(sab, geo.box, red, [0, 0, 0], [1.2, 0.18, 0.18], [0, 0, -0.78]);
      const imm = m(group, geo.ring, goldM, [0, 0.12, 0], [2.4, 1, 2.4]);
      return { id: sd.id, kind: sd.kind, group, bar, label, shield, sab, imm, flag, door, rubble, bridge, crystal, maxHp: sd.maxHp, occ: '' };
    }
    // ice block over the gate
    const iceG = new THREE.Group(); scene.add(iceG); iceG.visible = false;
    m(iceG, geo.box, mat('#a9e4ff', { opacity: 0.55 }), [0, 1.9, 0], [4, 3.6, 1.1]); m(iceG, geo.octa, mat('#d6f0fc', { opacity: 0.7 }), [0, 4, 0], [0.6, 1, 0.6]);
    const iceBar = makeBar(iceG, 2.2); iceBar.g.position.y = 5.6;

    function makeEnt(e: WarEntity): Ent {
      const group = new THREE.Group(); scene.add(group); const body = new THREE.Group(); group.add(body); const mdl = new THREE.Group(); body.add(mdl);
      const shadow = m(body, geo.disc, mat('#05070b', { opacity: 0.38, basic: true }), [0, 0.04, 0], [0.9, 1, 0.9]);
      const ringColor = '#c0c6d2';
      const ring = m(body, geo.ring, colMat(ringColor), [0, 0.07, 0], [1.15, 1, 1.15]);
      const defRing = m(body, geo.ring, goldM, [0, 0.09, 0], [1.5, 1, 1.5]);
      const flash = m(body, geo.ring, mat('#ff5a4a', { basic: true }), [0, 0.11, 0], [1.3, 1, 1.3]);
      const castRing = m(body, geo.ring, mat('#8ec9ee', { basic: true }), [0, 0.13, 0], [1.8, 1, 1.8]);
      const shield = m(body, geo.sphere, mat('#8ec9ee', { opacity: 0.3, basic: true }), [0, 1.0, 0], [1.25, 1.5, 1.25]);
      const ice = m(body, geo.octa, mat('#bfeaff', { opacity: 0.5 }), [0, 1.0, 0], [1.0, 1.4, 1.0]);
      const stun = m(body, geo.ring, mat('#ffcf5a', { basic: true }), [0, 2.5, 0], [0.7, 1, 0.7]);
      const flag = new THREE.Group(); body.add(flag); flag.position.set(0, 1.3, -0.5);
      m(flag, geo.cyl, mat('#cdbb8d'), [0, 0.9, 0], [0.04, 1.8, 0.04]); m(flag, geo.flag, mat('#efc563', { basic: true }), [0.02, 1.5, 0], [0.9, 0.9, 1]);
      const meMark = m(body, geo.cone, goldM, [0, 3.6, 0], [0.35, 0.6, 0.35], [Math.PI, 0, 0]);
      const crown = m(body, geo.pyr, mat('#efc563', { emissive: 0.6 }), [0, 3.15, 0], [0.4, 0.45, 0.4]);
      const hp = makeBar(group, 1.7);
      const pips = [0, 1, 2].map((i) => { const p = m(hp.g, geo.sphere, pipM, [-0.25 + i * 0.25, -0.3, 0.003], [0.07, 0.07, 0.07]); p.renderOrder = 9; p.visible = false; return p; });
      const racial = m(hp.g, geo.octa, racialM, [1.0, -0.3, 0.003], [0.1, 0.1, 0.1]); racial.renderOrder = 9; racial.visible = false; const label = makeLabel(e.name.slice(0, 14)); label.sprite.scale.set(3.4, 0.85, 1); group.add(label.sprite);
      for (const o of [ring, defRing, flash, castRing, shield, ice, stun, meMark, crown]) o.visible = false;
      flag.visible = false;
      return { id: e.id, group, body, mdl, model: null, key: '', hp, label, ring, defRing, flash, castRing, shield, ice, stun, flag, meMark, shadow, crown, classic: false, pips, racial,
        x: e.x * K, z: e.y * K, lift: 0, yaw: Math.PI, moving: 0, lastHp: e.hp, hitAt: -1e9, attackUntil: 0, castUntil: 0, ringColor, animAcc: 0 };
    }
    function disposeEnt(en: Ent) {
      if (en.model) { en.mdl.remove(en.model.root); en.model.dispose(); st.modelDisposals = (st.modelDisposals as number) + 1; }
      scene.remove(en.group); en.label.dispose();
    }
    function ensureModel(en: Ent, e: WarEntity) {
      const f = e.classId === 'druid' ? (e.combat?.form || e.form) : '';
      const dform = f === 'bear' ? 'bear' : f === 'tiger' || f === 'cheetah' ? 'tiger' : f === 'tree' ? 'tree' : '';
      const skin = e.build?.skinId ?? '';
      const key = `${e.classId}:${dform}:${en.classic ? 'classic' : skin}`; if (key === en.key) return; en.key = key;
      if (en.model) { en.mdl.remove(en.model.root); en.model.dispose(); st.modelDisposals = (st.modelDisposals as number) + 1; en.model = null; }
      if (!isModelId(e.classId)) return;
      try { en.model = en.classic ? createCharacterModel(e.classId, dform) : makeModel(e.classId, dform, skin); en.mdl.add(en.model.root); st.modelBuilds = (st.modelBuilds as number) + 1; } catch { en.model = null; }
    }
    const sums = new Map<string, Sum>();
    function disposeSum(so: Sum) { so.mdl.remove(so.model.root); so.model.dispose(); scene.remove(so.group); st.modelDisposals = (st.modelDisposals as number) + 1; }

    // ---------- VFX ----------
    function spawnFx(kind: 'proj' | 'ring', color: string, ax: number, az: number, bx: number, bz: number, dur: number, now: number) {
      if (fxActive >= budgets[tier]) { st.vfxDropped = (st.vfxDropped as number) + 1; return; }
      let f = fxPool.find((x) => !x.busy && x.kind === kind);
      if (!f) {
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(kind === 'proj' ? geo.sphere : geo.ring, material); scene.add(mesh);
        f = { mesh, mat: material, kind, t0: 0, dur: 1, ax: 0, az: 0, bx: 0, bz: 0, color, busy: false }; fxPool.push(f);
      }
      f.busy = true; f.t0 = now; f.dur = dur; f.ax = ax; f.az = az; f.bx = bx; f.bz = bz; f.mat.color.set(color); f.mesh.visible = true; fxActive++;
      st.vfxSpawned = (st.vfxSpawned as number) + 1;
    }
    function updateFx(now: number) {
      for (const f of fxPool) {
        if (!f.busy) continue; const t = (now - f.t0) / f.dur;
        if (t >= 1) {
          f.busy = false; f.mesh.visible = false; fxActive--;
          if (f.kind === 'proj') spawnFx('ring', f.color, f.bx, f.bz, f.bx, f.bz, 380, now);
          continue;
        }
        if (f.kind === 'proj') { f.mesh.position.set(f.ax + (f.bx - f.ax) * t, 1.4 + Math.sin(t * Math.PI) * 0.6, f.az + (f.bz - f.az) * t); f.mesh.scale.setScalar(0.22); f.mat.opacity = 1; }
        else { f.mesh.position.set(f.ax, 0.2 + t * 0.6, f.az); f.mesh.scale.setScalar(0.5 + t * 1.6); f.mat.opacity = 0.9 * (1 - t); }
      }
    }

    // ---------- snapshot sync ----------
    let lastSnap: WarSnapshot | null = null, recvAt = 0, lastEv = -1, lastWar = '';
    function targetPos(s: WarSnapshot, id: string | null): { x: number; z: number } | null {
      if (!id) return null; const e = ents.get(id); if (e) return { x: e.x, z: e.z };
      const sd = s.structures.find((q) => q.id === id); if (sd) return { x: sd.x * K, z: sd.y * K };
      if (id === 'boss' || id.startsWith('boss')) return { x: s.boss.x * K, z: s.boss.y * K };
      return null;
    }
    function sync(s: WarSnapshot, now: number) {
      lastSnap = s; recvAt = now; st.snapshots = (st.snapshots as number) + 1; setAwaiting(false);
      const map = mapFromSnap(s); const mk = mapKey(map);
      const towers = s.structures.filter((q) => q.kind === 'tower');
      if (mk !== curMapKey) { curMapKey = mk; rebuildWorld(map, towers); curCampKey = ''; }
      const gate = s.structures.find((q) => q.kind === 'gate') ?? null;
      const ck = s.guilds.map((g) => `${g.id}:${g.camp.x},${g.camp.y}:${g.color}:${g.name}`).join('|') + (gate ? `g${gate.x},${gate.y}` : '');
      if (ck !== curCampKey) { curCampKey = ck; rebuildCamps(s, gate); }
      if (s.id !== lastWar) { lastWar = s.id; lastEv = -1; for (const en of ents.values()) disposeEnt(en); ents.clear(); }
      const seen = new Set<string>();
      for (const e of s.entities.slice(0, 25)) {
        seen.add(e.id); let en = ents.get(e.id);
        if (!en) { en = makeEnt(e); ents.set(e.id, en); en.x = e.x * K; en.z = e.y * K; }
        ensureModel(en, e);
        if (e.hp < en.lastHp - 0.5 && e.alive) en.hitAt = now; en.lastHp = e.hp;
        const col = gcol(s, e.guildId);
        if (col !== en.ringColor) { en.ringColor = col; en.ring.material = colMat(col); en.hp.strip.material = colMat(col); }
        en.crown.visible = !!e.build?.isCaptain && e.alive;
        const tn = Math.min(3, e.build?.talents?.length ?? 0); en.pips.forEach((p, i) => { p.visible = i < tn; }); en.racial.visible = !!e.build?.racial;
      }
      const smList = s.summons ?? []; const sKeep = new Set<string>(); let sn = 0;
      for (const sm of smList) {
        if (!sm.alive || sn >= MAX_SUMMONS[tier] || !isModelId(sm.classId)) continue; sn++; sKeep.add(sm.id);
        if (sums.has(sm.id)) continue;
        try {
          const model = createCharacterModel(sm.classId); const group = new THREE.Group(); const mdl = new THREE.Group(); group.add(mdl); mdl.add(model.root); mdl.scale.setScalar(0.85); scene.add(group);
          const ring = m(group, geo.ring, colMat(gcol(s, sm.guildId)), [0, 0.07, 0], [0.9, 1, 0.9]);
          const hp = makeBar(group, 1.1); st.modelBuilds = (st.modelBuilds as number) + 1;
          sums.set(sm.id, { id: sm.id, group, mdl, model, ring, hp, x: sm.x * K, z: sm.y * K, yaw: 0, moving: 0, color: '' });
        } catch { /* unsupported summon model: not drawn */ }
      }
      for (const [id, so] of sums) if (!sKeep.has(id)) { disposeSum(so); sums.delete(id); }
      for (const [id, en] of ents) if (!seen.has(id)) { disposeEnt(en); ents.delete(id); }
      for (const sd of s.structures) { if (!strs.has(sd.id)) strs.set(sd.id, makeStruct(sd)); }
      // events: bounded to what the server reported
      const srvNow = s.now;
      for (const ev of s.events ?? []) {
        if (ev.id <= lastEv) continue; lastEv = Math.max(lastEv, ev.id);
        if (ev.at < srvNow - 1500) continue;
        st.eventsProcessed = (st.eventsProcessed as number) + 1;
        const color = fxColor(ev.kind, ev.label); const src = ents.get(ev.sourceId ?? '');
        const heal = /heal|shield|ward/.test(`${ev.kind} ${ev.label}`.toLowerCase());
        if (src) { if (heal || /cast|ult/.test(ev.kind)) src.castUntil = now + 600; else src.attackUntil = now + 520; }
        const sp = src ? { x: src.x, z: src.z } : ev.x || ev.y ? { x: ev.x * K, z: ev.y * K } : null;
        if (!src && ev.sourceId && Math.hypot(ev.x - s.boss.x, ev.y - s.boss.y) < 90) bossAttackUntil = now + 700;
        if (ev.sourceId && /boss/.test(ev.sourceId)) bossAttackUntil = now + 700;
        const tp = targetPos(s, ev.targetId) ?? (ev.tx || ev.ty ? { x: ev.tx * K, z: ev.ty * K } : null);
        if (sp && tp && Math.hypot(tp.x - sp.x, tp.z - sp.z) > 2.2) spawnFx('proj', color, sp.x, sp.z, tp.x, tp.z, clamp(Math.hypot(tp.x - sp.x, tp.z - sp.z) / 30, 0.14, 0.55) * 1000, now);
        else if (tp) spawnFx('ring', color, tp.x, tp.z, tp.x, tp.z, 380, now);
        else if (sp) spawnFx('ring', color, sp.x, sp.z, sp.x, sp.z, 380, now);
      }
    }

    // ---------- frame ----------
    let lodOn = false, lodSince = 0;
    let raf = 0, lastDraw = 0; const dts: number[] = []; let lastHud = 0, lastQ = 0, calmChecks = 0, frameN = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - lastDraw < interval - 3) return;
      const dtms = lastDraw ? now - lastDraw : 16; lastDraw = now; const dt = Math.min(0.1, dtms / 1000);
      const t0 = performance.now(); frameN++;
      dts.push(dtms); if (dts.length > 40) dts.shift();
      const s = snapRef.current;
      if (s && s !== lastSnap) sync(s, now);
      if (!world) { curMapKey = mapKey(FALLBACK_MAP); rebuildWorld(FALLBACK_MAP, []); rebuildCamps(null, null); curCampKey = 'fallback'; }
      const srv = lastSnap ? lastSnap.now + (now - recvAt) : 0; const tsec = now / 1000;
      const { d: dist, z: ztot } = camDist(); const exg = ex(dist);
      const lowAnim = tier >= 1 && frameN % 2 === 1;

      // Classic-model LOD with hysteresis + 3s dwell; entities rebuild only when crossing, max 3 per frame.
      const wantLod = (tier >= 2 || (tier >= 1 && (st.drawCalls as number) > 500)) && ztot < (lodOn ? 2.7 : 2.2);
      if (wantLod !== lodOn && now - lodSince > 3000) { lodOn = wantLod; lodSince = now; }
      const useLod = lodOn; st.lod = useLod; let rebuilds = 0;
      if (lastSnap) {
        const snapNow = lastSnap;
        const me = meRef.current;
        const a = 1 - Math.exp(-dt * 11);
        for (const e of snapNow.entities.slice(0, 25)) {
          const en = ents.get(e.id); if (!en) continue;
          const tx = e.x * K, tz = e.y * K; const dx = tx - en.x, dz = tz - en.z, dd = Math.hypot(dx, dz);
          if (dd > 10) { en.x = tx; en.z = tz; } else { en.x += dx * a; en.z += dz * a; }
          const spd = dd / Math.max(dt, 0.001); en.moving += ((spd > 1.2 ? 1 : 0) - en.moving) * Math.min(1, dt * 8);
          const liftT = e.towerId ? TOWER_H + 0.25 : 0; en.lift += (liftT - en.lift) * Math.min(1, dt * 6);
          en.group.position.set(en.x, en.lift, en.z);
          const tgt = targetPos(snapNow, e.combat?.targetId ?? null);
          const attacking = (e.combat && srv - e.combat.attackAt >= 0 && srv - e.combat.attackAt < 600) || now < en.attackUntil;
          const casting = !!(e.combat?.casting || e.channel) || now < en.castUntil;
          if (e.alive) {
            if ((attacking || casting) && tgt && Math.hypot(tgt.x - en.x, tgt.z - en.z) > 0.1) en.yaw = angLerp(en.yaw, Math.atan2(tgt.x - en.x, tgt.z - en.z), Math.min(1, dt * 14));
            else if (dd > 0.02 && en.moving > 0.3) en.yaw = angLerp(en.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
          }
          en.body.rotation.y = en.yaw; en.body.scale.setScalar(exg);
          en.mdl.rotation.z = e.alive ? 0 : -Math.PI / 2; en.mdl.position.y = e.alive ? 0 : 0.4;
          const mode = attacking ? 'attack' : casting ? 'cast' : en.moving > 0.5 ? 'run' : 'idle';
          const wantClassic = useLod && e.id !== me;
          if (wantClassic !== en.classic && rebuilds < 3) { en.classic = wantClassic; ensureModel(en, e); rebuilds++; }
          if (en.model && e.alive && !lowAnim) {
            const prog = mode === 'attack' ? clamp(e.combat && srv - e.combat.attackAt < 600 && srv >= e.combat.attackAt ? (srv - e.combat.attackAt) / 600 : 1 - (en.attackUntil - now) / 520, 0, 1) : (tsec * 1.1) % 1;
            en.model.animate({ time: tsec + en.x, mode, progress: prog });
          }
          const hitAge = (now - en.hitAt) / 350;
          en.ring.visible = e.alive; en.defRing.visible = e.alive && e.role === 'defender'; en.shadow.visible = e.alive;
          en.flash.visible = e.alive && hitAge < 1; if (en.flash.visible) { en.flash.scale.setScalar(1.2 + hitAge * 0.8); (en.flash.material as THREE.MeshBasicMaterial).opacity = 1 - hitAge; (en.flash.material as THREE.MeshBasicMaterial).transparent = true; }
          en.castRing.visible = e.alive && casting; if (casting) en.castRing.scale.setScalar(1.6 + Math.sin(tsec * 6) * 0.15);
          en.shield.visible = e.alive && (e.combat?.shield ?? 0) > 0;
          const cc = e.combat?.cc ?? []; const frozen = cc.some((c) => /freez|froz|ice|root|chill/i.test(c));
          en.ice.visible = e.alive && frozen; en.stun.visible = e.alive && cc.length > 0 && !frozen; if (en.stun.visible) en.stun.rotation.y = tsec * 4;
          en.crown.visible = !!e.build?.isCaptain && e.alive; if (en.crown.visible) en.crown.rotation.y = tsec * 2;
          en.flag.visible = e.alive && e.carrying; en.meMark.visible = e.id === me && e.alive; if (en.meMark.visible) en.meMark.position.y = 3.5 + Math.sin(tsec * 4) * 0.15;
          // HP + labels (billboards, scaled for readability at fit zoom)
          const hpS = clamp(dist / 38, 0.9, 2.3);
          en.hp.g.visible = e.alive; en.hp.g.position.y = (en.lift > 1 ? 0 : 0) + 2.9 * exg; en.hp.g.scale.setScalar(hpS * 0.8);
          en.hp.g.quaternion.copy(camera.quaternion); setBar(en.hp, e.hp / (e.maxHp || 1), 1.7);
          const showName = e.id === me || ztot >= 2.1 || !e.alive;
          en.label.sprite.visible = showName;
          if (showName) {
            en.label.set(e.alive ? e.name.slice(0, 14) : `${e.name.slice(0, 8)} ${Math.max(0, Math.ceil((e.respawnAt - srv) / 1000))}s`, e.id === me ? '#ffffff' : '#f0e9d7');
            en.label.sprite.position.y = 3.6 * exg + hpS * 0.35; en.label.sprite.scale.set(3.4 * Math.min(hpS, 1.6), 0.85 * Math.min(hpS, 1.6), 1);
          }
        }
        // summons (actual server summons only)
        let sc = 0;
        for (const sm of snapNow.summons ?? []) {
          const so = sums.get(sm.id); if (!so) continue; sc++;
          const tx = sm.x * K, tz = sm.y * K, dx = tx - so.x, dz = tz - so.z, dd = Math.hypot(dx, dz);
          if (dd > 10) { so.x = tx; so.z = tz; } else { so.x += dx * a; so.z += dz * a; }
          so.moving += ((dd / Math.max(dt, 0.001) > 1.2 ? 1 : 0) - so.moving) * Math.min(1, dt * 8);
          if (dd > 0.02 && so.moving > 0.3) so.yaw = angLerp(so.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
          so.group.position.set(so.x, 0, so.z); so.mdl.rotation.y = so.yaw; so.mdl.scale.setScalar(0.85 * exg);
          if (!lowAnim) so.model.animate({ time: tsec + so.x, mode: so.moving > 0.5 ? 'run' : 'idle', progress: 0 });
          const col = gcol(snapNow, sm.guildId); if (col !== so.color) { so.color = col; so.ring.material = colMat(col); so.hp.strip.material = colMat(col); }
          const hs = clamp(dist / 38, 0.9, 2.3); so.hp.g.position.y = 1.9 * exg; so.hp.g.scale.setScalar(hs * 0.6); so.hp.g.quaternion.copy(camera.quaternion); setBar(so.hp, sm.hp / (sm.maxHp || 1), 1.1);
        }
        st.summons = sc;
        // structures
        const gateSt = snapNow.structures.find((q) => q.kind === 'gate');
        for (const sd of snapNow.structures) {
          const so = strs.get(sd.id); if (!so) continue;
          const alive = sd.hp > 0; const hpS = clamp(dist / 38, 0.9, 2.3);
          so.bar.g.visible = alive; so.bar.g.quaternion.copy(camera.quaternion); so.bar.g.scale.setScalar(hpS * 0.85); setBar(so.bar, sd.hp / (sd.maxHp || 1), 2.8);
          so.label.sprite.visible = ztot >= 1.3 || sd.kind !== 'tower'; so.label.sprite.scale.set(4 * Math.min(hpS, 1.6), Math.min(hpS, 1.6), 1);
          so.shield.visible = sd.shield > 0; so.sab.visible = sd.disabledUntil > srv; so.sab.rotation.y = tsec * 2; so.imm.visible = sd.immuneUntil > srv;
          if (so.kind === 'gate') { if (so.door) so.door.visible = alive; if (so.rubble) so.rubble.visible = !alive; if (so.bridge) so.bridge.visible = alive; }
          if (so.crystal) { so.crystal.rotation.y = tsec; so.crystal.position.y = 2 + Math.sin(tsec * 2) * 0.12; (so.crystal.material as THREE.MeshLambertMaterial).opacity = 1; }
          const occ = sd.occupant ? snapNow.entities.find((q) => q.id === sd.occupant) : null;
          const oc = occ ? gcol(snapNow, occ.guildId) : '#c0c6d2';
          if (so.flag && oc !== so.occ) { so.occ = oc; so.flag.material = kitS.mat(oc, { basic: true }); }
        }
        const ice = snapNow.ice;
        iceG.visible = !!ice && !!gateSt && ice.hp > 0;
        if (iceG.visible && ice && gateSt) { iceG.position.set(gateSt.x * K, 0, gateSt.y * K + 0.4); iceBar.g.quaternion.copy(camera.quaternion); setBar(iceBar, ice.hp / (ice.maxHp || 1), 2.2); }
        // boss
        const b = snapNow.boss; bossG.position.set(b.x * K, 0, b.y * K);
        bossGuild.material = colMat(b.guildId ? gcol(snapNow, b.guildId) : '#c0c6d2'); bossRing2.rotation.y = tsec * 0.3;
        bossDeadT += ((b.alive ? 0 : 1) - bossDeadT) * Math.min(1, dt * 3);
        if (bossModel) {
          bossModel.root.rotation.z = -bossDeadT * 1.4; bossModel.root.position.y = -bossDeadT * 0.5;
          if (!lowAnim) { const atk = now < bossAttackUntil; bossModel.animate({ time: tsec, mode: !b.alive ? 'idle' : atk ? 'attack' : 'idle', progress: atk ? 1 - (bossAttackUntil - now) / 700 : 0 }); }
          const target = b.alive ? targetPos(snapNow, b.target) : null; if (target) bossModel.root.rotation.y = angLerp(bossModel.root.rotation.y, Math.atan2(target.x - bossG.position.x, target.z - bossG.position.z), Math.min(1, dt * 4));
        }
        bossBar.g.visible = b.alive; bossBar.g.quaternion.copy(camera.quaternion); bossBar.g.scale.setScalar(clamp(dist / 55, 1, 2)); setBar(bossBar, b.hp / (b.maxHp || 1), 3.4);
        bossLabel.set(b.alive ? 'TEMPLE GUARDIAN' : 'BOSS DOWN', '#f6c9c2'); bossLabel.sprite.scale.set(5.6, 1.4, 1);
        bossRing.visible = bossRing2.visible = b.alive;
        // banner
        const bn = snapNow.banner; const avail = !bn.carrier && bn.availableAt <= srv; bannerG.visible = avail || (!bn.carrier);
        bannerG.position.set(bn.x * K, 0, bn.y * K); bannerLabel.sprite.visible = avail;
        bannerFlag.rotation.y = Math.sin(tsec * 3) * 0.25; bannerG.scale.setScalar(avail ? 1 : 0.6);
        // owner tint
        if (world) {
          const oc = snapNow.owner ? gcol(snapNow, snapNow.owner) : null;
          world.ownerMat.color.set(oc ?? '#c0c6d2'); world.ownerMat.opacity = oc ? 0.3 : 0;
          world.keepFlagMats.forEach((fm) => fm.color.set(oc ?? '#c0c6d2'));
        }
        if (follow_(me)) { const en = me ? ents.get(me) : null; if (en) { const fa = 1 - Math.exp(-dt * 5); view.tx += (en.x - view.tx) * fa; view.tz += (en.z - view.tz) * fa; } }
        st.entities = ents.size; st.structures = strs.size;
      }
      campsB?.flags.forEach((f) => { f.mesh.rotation.y = Math.sin(tsec * 2.2 + f.ph) * 0.3; });
      campsB?.fires.forEach((f, i) => f.scale.set(0.32, 0.8 + Math.sin(tsec * 9 + i) * 0.15, 0.32));
      world?.flames.forEach((f, i) => f.scale.set(0.22, 0.55 + Math.sin(tsec * 10 + i * 2) * 0.12, 0.22));
      updateFx(now); st.vfxActive = fxActive; st.models = [...ents.values()].filter((q) => q.model).length + sums.size + (bossModel ? 1 : 0);
      let mm = 0; for (const q of ents.values()) if (q.model && q.model) mm += q.model.stats.meshes; st.modelMeshes = mm; st.classicLodModels = [...ents.values()].filter((q) => q.classic && q.model).length; st.lodModelSource = 'classic createCharacterModel (real Arena) for far/low tier; premium for own hero and near zoom'; if (tier < 2 && (st.drawCalls as number) > 700 && now - lastQ > 800) { tier++; st.tier = tier; st.vfxBudget = budgets[tier]; }

      // camera
      clampView();
      camera.position.set(view.tx, dist * Math.sin(TILT), view.tz + dist * Math.cos(TILT)); camera.lookAt(view.tx, 0, view.tz);
      st.zoomTotal = +ztot.toFixed(2);
      renderer.render(scene, camera);
      const ri = renderer.info;
      st.drawCalls = ri.render.calls; st.triangles = ri.render.triangles; st.geometries = ri.memory.geometries; st.textures = ri.memory.textures;
      st.frameMs = +(performance.now() - t0).toFixed(2);

      // adaptive quality
      if (now - lastQ > 1500 && dts.length > 20) {
        lastQ = now; const avg = dts.reduce((p, c) => p + c, 0) / dts.length; st.fps = +(1000 / avg).toFixed(1);
        if (avg > interval * 1.35 || (st.frameMs as number) > interval * 0.8) {
          calmChecks = 0;
          if (dpr > 0.75) { dpr = Math.max(0.75, dpr - 0.2); resize(); }
          else if (tier < 2) { tier++; }
          else if (interval < 40) interval = 1000 / 30;
        } else if (avg < interval * 1.12 && (st.frameMs as number) < interval * 0.45) {
          if (++calmChecks >= 4 && dpr < dprCap) { dpr = Math.min(dprCap, dpr + 0.15); calmChecks = 0; resize(); }
        }
        st.tier = tier; st.vfxBudget = budgets[tier]; st.drawFpsCap = Math.round(1000 / interval);
      }
      if (now - lastHud > 600) {
        lastHud = now; setHud(`${st.fps} fps | ${st.drawCalls} calls | ${Math.round((st.triangles as number) / 1000)}k tris | dpr ${st.dpr} | T${tier}${st.lod ? ` classic-LOD ${st.classicLodModels}` : ""} | ${st.entities} units`);
      }
    };
    function follow_(me: string | null) { return followRef.current && !!me; }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); ctl.current = null;
      cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp); cv.removeEventListener('wheel', onWheel); cv.removeEventListener('webglcontextlost', onLost);
      for (const en of ents.values()) disposeEnt(en); ents.clear();
      for (const so of strs.values()) so.label.dispose(); strs.clear();
      bossModel?.dispose(); bossLabel.dispose(); bannerLabel.dispose(); campLabels.splice(0).forEach((l) => l.dispose());
      fxPool.forEach((f) => f.mat.dispose());
      world?.keepFlagMats.forEach((x) => x.dispose()); world?.ownerMat.dispose();
      for (const so of sums.values()) disposeSum(so); sums.clear();
      kitW?.dispose(); kitC?.dispose(); kitS.dispose();
      renderer.dispose();
      if (Object.getOwnPropertyDescriptor(window, '__guildWar3DStats')?.get) delete window.__guildWar3DStats;
    };
  }, []);

  const btn: React.CSSProperties = { pointerEvents: 'auto', font: "700 13px 'Barlow Condensed', sans-serif", letterSpacing: '.08em', textTransform: 'uppercase', padding: '7px 12px', borderRadius: 6, border: '1px solid rgba(239,197,99,.55)', background: 'rgba(14,20,30,.82)', color: '#efc563', cursor: 'pointer' };
  return (
    <div ref={host} data-testid="war-map-3d" style={{ position: 'relative', width: '100%', height, borderRadius: 8, overflow: 'hidden', background: '#16202e', touchAction: 'none' }}>
      <canvas ref={canvasRef} role="img" aria-label="Guild Wars 3D battlefield" data-testid="canvas-war-map" style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, pointerEvents: 'none' }}>
        <button type="button" data-testid="button-war-follow" style={{ ...btn, background: follow ? '#efc563' : btn.background, color: follow ? '#10141c' : '#efc563' }} onClick={() => ctl.current?.follow(!follow)}>{follow ? 'Following' : 'Follow me'}</button>
        <button type="button" data-testid="button-war-reset-view" style={btn} onClick={() => ctl.current?.reset()}>Fit</button>
      </div>
      {awaiting && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', font: "700 22px 'Barlow Condensed', sans-serif", letterSpacing: '.18em', color: '#efc563', textShadow: '0 2px 8px #000' }}>AWAITING THE WAR HORN</div>}
      <div data-testid="text-war-3d-stats" style={{ position: 'absolute', left: 8, bottom: 6, pointerEvents: 'none', font: "600 10px ui-monospace, monospace", color: 'rgba(220,228,240,.55)', textShadow: '0 1px 2px #000' }}>{hud}</div>
    </div>
  );
}
