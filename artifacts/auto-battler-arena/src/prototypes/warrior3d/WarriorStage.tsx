import { Component, memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PreviewControl, RenderInfoSnapshot } from './previewState';
import { applyPose, createPose, samplePose } from './warriorAnimation';
import { createWarrior } from './warriorModel';
import { cappedDpr } from './webgl';

const TARGET = new THREE.Vector3(0, 2.5, 0.2);
const RESET_POS = new THREE.Vector3(5.6, 4.9, 9.4);
const GAME_POS = new THREE.Vector3(0, 6.6, 9.2);

function Ground() {
  const parts = useMemo(() => {
    const g = new THREE.Group();
    const dark = new THREE.MeshBasicMaterial({ color: '#0d0f14', transparent: true, depthWrite: false });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshBasicMaterial({ color: '#2a2c36' }));
    const rim = new THREE.Mesh(new THREE.RingGeometry(6.6, 6.8, 40), new THREE.MeshBasicMaterial({ color: '#d1a13e' }));
    const rim2 = new THREE.Mesh(new THREE.RingGeometry(3.7, 3.76, 40), new THREE.MeshBasicMaterial({ color: '#4a3c24' }));
    [floor, rim, rim2].forEach((m, i) => { m.rotation.x = -Math.PI / 2; m.position.y = -0.02 + i * 0.002; g.add(m); });
    // static cheap contact shadow: stacked translucent discs
    [[2.1, 0.14], [1.7, 0.16], [1.25, 0.2]].forEach(([r, o], i) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), dark.clone());
      (m.material as THREE.MeshBasicMaterial).opacity = o;
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.005 + i * 0.002, 0);
      g.add(m);
    });
    return g;
  }, []);
  useEffect(() => () => {
    parts.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
  }, [parts]);
  return <primitive object={parts} />;
}

function Scene({ ctl, onInfo }: { ctl: { current: PreviewControl }; onInfo: (i: RenderInfoSnapshot) => void }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const advance = useThree((s) => s.advance);
  const size = useThree((s) => s.size);
  const warrior = useMemo(() => createWarrior(), []);
  const pose = useMemo(() => createPose(), []);
  const cameraPreset = useRef<'game' | 'reset'>('reset');

  useEffect(() => () => warrior.dispose(), [warrior]);
  useEffect(() => {
    ctl.current.applyCamera?.(cameraPreset.current);
    ctl.current.dirty = true;
  }, [size, ctl]);

  // Camera controls
  useEffect(() => {
    const c = ctl.current;
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.copy(TARGET);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 6;
    controls.maxDistance = 24;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.autoRotateSpeed = 2.4;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    const mark = () => { c.dirty = true; };
    controls.addEventListener('change', mark);
    c.controls = controls;
    c.applyCamera = (preset) => {
      cameraPreset.current = preset;
      camera.position.copy(preset === 'game' ? GAME_POS : RESET_POS);
      // Preserve the full sword and shoulders on narrow phone viewports.
      const aspect = (camera as THREE.PerspectiveCamera).aspect || 1;
      camera.position.sub(TARGET).multiplyScalar(Math.max(1, .92 / aspect)).add(TARGET);
      controls.target.copy(TARGET);
      controls.update();
      c.dirty = true;
    };
    c.applyCamera('reset');
    return () => {
      controls.removeEventListener('change', mark);
      controls.dispose();
      c.controls = null;
      c.applyCamera = null;
    };
  }, [camera, gl, ctl]);

  // Render loop: drives r3f manually so hidden/paused tabs render nothing.
  useEffect(() => {
    const c = ctl.current;
    let raf = 0;
    let last = performance.now();
    const onVis = () => { last = performance.now(); c.dirty = true; };
    document.addEventListener('visibilitychange', onVis);
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || (c.paused && !c.dirty)) { last = now; return; }
      // A single-character look test does not need a 60 Hz battery cost.
      if (now - last < 1000 / 30 - 0.5) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      c.dirty = false;
      if (!c.paused) c.time += dt * c.speed;
      c.controls && (c.controls.autoRotate = c.autoRotate);
      advance(now / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); };
  }, [advance, ctl]);

  useFrame(() => {
    const c = ctl.current;
    applyPose(warrior.rig, samplePose(c.mode, c.time, pose));
    c.controls?.update();
  });

  // Low-frequency info readout (not per frame)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      onInfo({
        triangles: gl.info.render.triangles,
        calls: gl.info.render.calls,
        geometries: gl.info.memory.geometries,
        dpr: gl.getPixelRatio(),
      });
    }, 600);
    return () => window.clearInterval(id);
  }, [gl, onInfo]);

  return (
    <>
      <ambientLight intensity={1.7} color="#d9deea" />
      <directionalLight position={[4, 8, 6]} intensity={2.6} color="#fff1d8" />
      <directionalLight position={[-5, 3, -4]} intensity={0.7} color="#8aa0c8" />
      <Ground />
      <primitive object={warrior.root} />
    </>
  );
}

class Boundary extends Component<{ onError: (m: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error) { this.props.onError(e.message); }
  render() { return this.state.failed ? null : this.props.children; }
}

function LossWatcher({ onError }: { onError: (m: string) => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => { e.preventDefault(); onError('The WebGL context was lost. Reload the page to try again.'); };
    el.addEventListener('webglcontextlost', lost);
    return () => el.removeEventListener('webglcontextlost', lost);
  }, [gl, onError]);
  return null;
}

export const WarriorStage = memo(function WarriorStage(props: {
  ctl: { current: PreviewControl };
  onInfo: (i: RenderInfoSnapshot) => void;
  onError: (m: string) => void;
}) {
  const dpr = useMemo(cappedDpr, []);
  return (
    <Boundary onError={props.onError}>
      <Canvas
        frameloop="never"
        flat
        dpr={dpr}
        shadows={false}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ fov: 34, near: 0.1, far: 60, position: RESET_POS.toArray() }}
        data-testid="canvas-warrior-3d"
      >
        <LossWatcher onError={props.onError} />
        <Scene ctl={props.ctl} onInfo={props.onInfo} />
      </Canvas>
    </Boundary>
  );
});
