import { Component, memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createPrestigePresentation } from './prestigePresentation';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cappedDpr } from '../warrior3d/webgl';
import { createCharacterModel } from './characterModel';
import { createPolishedCharacterModel } from './polishModel';
import { createPremiumMageModel } from './magePremiumModel';
import { createPremiumMageMotion } from './magePremiumMotion';
import { createPremiumRosterModel, isPremiumRosterModel } from './premiumRoster';
import { createPrestigeRosterModel, isPrestigeId, type PrestigeId } from './premiumRoster/prestige';
import { createPolishMotion, type PolishMotionModel } from './polishMotion';
import type { CharacterMode, CharacterModel, CharacterPose } from './modelKit';
import type { DruidForm } from './roster';
import type { ModelId } from './creatures';

export type CameraPreset = 'game' | 'reset' | 'front' | 'back' | 'side';
export interface RosterControl {
  mode: CharacterMode;
  variant?: CharacterPose['variant'];
  paused: boolean;
  autoRotate: boolean;
  speed: number;
  time: number;
  dirty: boolean;
  controls: OrbitControls | null;
  applyCamera: ((p: CameraPreset) => void) | null;
  reaction: 'none' | 'hit' | 'death';
}
export function createRosterControl(): RosterControl {
  return { mode: 'idle', paused: false, autoRotate: false, speed: 1, time: 0, dirty: true, controls: null, applyCamera: null, reaction: 'none' };
}
export interface LiveInfo { triangles: number; calls: number; geometries: number; dpr: number }

const TARGET = new THREE.Vector3(0, 2.5, 0.2);
const POS = { reset: new THREE.Vector3(6.8, 5.6, 12.4), game: new THREE.Vector3(0, 7.3, 12.6),
  front: new THREE.Vector3(0, 4.6, 13.2), back: new THREE.Vector3(0, 4.6, -13.2), side: new THREE.Vector3(13.2, 4.6, 0.2) };
const CYCLE = 1.3;

function Ground() {
  const parts = useMemo(() => {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshBasicMaterial({ color: '#2a2c36' }));
    const rim = new THREE.Mesh(new THREE.RingGeometry(6.6, 6.8, 40), new THREE.MeshBasicMaterial({ color: '#d1a13e' }));
    const rim2 = new THREE.Mesh(new THREE.RingGeometry(3.7, 3.76, 40), new THREE.MeshBasicMaterial({ color: '#4a3c24' }));
    [floor, rim, rim2].forEach((m, i) => { m.rotation.x = -Math.PI / 2; m.position.y = -0.02 + i * 0.002; g.add(m); });
    [[2.1, 0.14], [1.7, 0.16], [1.25, 0.2]].forEach(([r, o], i) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24),
        new THREE.MeshBasicMaterial({ color: '#0d0f14', transparent: true, opacity: o, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.005 + i * 0.002; g.add(m);
    });
    return g;
  }, []);
  useEffect(() => () => parts.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  }), [parts]);
  return <primitive object={parts} />;
}

interface SceneProps {
  ctl: { current: RosterControl }; classId: ModelId; form: DruidForm;
  polished?: boolean;
  magePremium?: boolean;
  rosterPremium?: boolean;
  /** Prototype-only prestige skin; ignored unless it matches classId. */
  prestige?: PrestigeId | '';
  onInfo: (i: LiveInfo) => void; onStats: (s: CharacterModel['stats']) => void; onError: (m: string) => void;
}

function Scene({ ctl, classId, form, polished = false, magePremium = false, rosterPremium = false, prestige = '', onInfo, onStats, onError }: SceneProps) {
  const gl = useThree(s => s.gl);
  const camera = useThree(s => s.camera);
  const advance = useThree(s => s.advance);
  const size = useThree(s => s.size);
  const holder = useMemo(() => new THREE.Group(), []);
  const modelRef = useRef<CharacterModel | null>(null);
  const presentationRef = useRef<ReturnType<typeof createPrestigePresentation> | null>(null);
  const poseRef = useRef<CharacterPose>({ time: 0, mode: 'idle', progress: 0 });
  const cb = useRef({ onStats, onError, onInfo });
  cb.current = { onStats, onError, onInfo };
  const preset = useRef<CameraPreset>('reset');
  const bossCamera = useRef(false);
  bossCamera.current = classId.startsWith('boss-');

  // Model switching: only the model is rebuilt; controls/camera persist.
  useEffect(() => {
    let model: CharacterModel;
    const skin = rosterPremium && isPrestigeId(classId) && prestige === classId;
    try { model = skin ? createPrestigeRosterModel(classId) : rosterPremium ? createPremiumRosterModel(classId, classId === 'druid' ? form : '') :
      magePremium && classId === 'frostmage' ? createPremiumMageMotion(createPremiumMageModel()) :
      polished && !magePremium ? createPolishMotion(createPolishedCharacterModel(classId, classId === 'druid' ? form : ''), classId) :
      createCharacterModel(classId, classId === 'druid' ? form : ''); }
    catch (e) { cb.current.onError(`Could not build ${classId}: ${(e as Error).message}`); return; }
    modelRef.current = model;
    holder.add(model.root);
    if (skin) {
      const low = size.width < 600 || window.matchMedia('(pointer: coarse)').matches;
      const presentation = createPrestigePresentation(classId as PrestigeId, low);
      presentationRef.current = presentation; holder.add(presentation.root);
    }
    cb.current.onStats(model.stats);
    ctl.current.dirty = true;
    return () => {
      presentationRef.current?.dispose(); presentationRef.current = null;
      holder.remove(model.root);
      model.dispose();
      if (modelRef.current === model) modelRef.current = null;
    };
  }, [classId, form, polished, magePremium, rosterPremium, prestige, holder, ctl]);

  useEffect(() => { ctl.current.applyCamera?.(preset.current); ctl.current.dirty = true; }, [size, ctl, bossCamera.current]);

  useEffect(() => {
    const c = ctl.current;
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.copy(TARGET);
    controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.1;
    controls.minDistance = 5; controls.maxDistance = 24;
    controls.minPolarAngle = 0.35; controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.autoRotateSpeed = 2.4;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    const mark = () => { c.dirty = true; };
    controls.addEventListener('change', mark);
    c.controls = controls;
    c.applyCamera = (p) => {
      preset.current = p;
      camera.position.copy(POS[p]);
      const aspect = (camera as THREE.PerspectiveCamera).aspect || 1;
      camera.position.sub(TARGET).multiplyScalar(Math.max(1, 0.92 / aspect) * (bossCamera.current ? 1.15 : 1)).add(TARGET);
      controls.target.copy(TARGET); controls.update(); c.dirty = true;
    };
    c.applyCamera('reset');
    return () => { controls.removeEventListener('change', mark); controls.dispose(); c.controls = null; c.applyCamera = null; };
  }, [camera, gl, ctl]);

  // Manual 30 FPS loop; idle when hidden, or paused with no camera change.
  useEffect(() => {
    const c = ctl.current;
    let raf = 0; let last = performance.now();
    const onVis = () => { last = performance.now(); c.dirty = true; };
    document.addEventListener('visibilitychange', onVis);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || (c.paused && !c.dirty)) { last = now; return; }
      if (now - last < 1000 / 30 - 0.5) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now; c.dirty = false;
      if (!c.paused) c.time += dt * c.speed;
      if (c.controls) c.controls.autoRotate = c.autoRotate;
      advance(now / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, [advance, ctl]);

  useFrame(() => {
    const c = ctl.current; const m = modelRef.current;
    if (m) {
      const p = poseRef.current;
      p.time = c.time; p.mode = c.mode; p.variant = c.variant;
      p.progress = (c.time % CYCLE) / CYCLE;
      if (rosterPremium ? isPremiumRosterModel(classId, form) : (magePremium && classId === 'frostmage') || (polished && !magePremium)) (m as PolishMotionModel).setVisualReaction(c.reaction === 'hit' ? Math.max(0, 1 - p.progress * 4) : 0,
        c.reaction === 'death' ? Math.min(1, p.progress * 3) : 0);
      m.animate(p);
      presentationRef.current?.update(p, camera, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    c.controls?.update();
  });

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      cb.current.onInfo({ triangles: gl.info.render.triangles, calls: gl.info.render.calls,
        geometries: gl.info.memory.geometries, dpr: gl.getPixelRatio() });
    }, 700);
    return () => window.clearInterval(id);
  }, [gl]);

  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => { e.preventDefault(); cb.current.onError('The WebGL context was lost.'); };
    el.addEventListener('webglcontextlost', lost);
    return () => el.removeEventListener('webglcontextlost', lost);
  }, [gl]);

  return (
    <>
      <ambientLight intensity={1.7} color="#d9deea" />
      <directionalLight position={[4, 8, 6]} intensity={2.6} color="#fff1d8" />
      <directionalLight position={[-5, 3, -4]} intensity={0.7} color="#8aa0c8" />
      <Ground />
      <primitive object={holder} />
    </>
  );
}

class Boundary extends Component<{ onError: (m: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error) { this.props.onError(e.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

export const RosterStage = memo(function RosterStage(props: SceneProps) {
  const dpr = useMemo(cappedDpr, []);
  return (
    <Boundary onError={props.onError}>
      <Canvas frameloop="never" flat dpr={dpr} shadows={false}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ fov: 34, near: 0.1, far: 60, position: POS.reset.toArray() }}
        data-testid="canvas-roster-3d">
        <Scene {...props} />
      </Canvas>
    </Boundary>
  );
});
