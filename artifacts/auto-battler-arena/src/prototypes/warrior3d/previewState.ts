import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AnimationMode } from './warriorAnimation';

/** Mutable, non-React control block read by the render loop (no per-frame React updates). */
export interface PreviewControl {
  mode: AnimationMode;
  paused: boolean;
  speed: number;
  time: number;
  dirty: boolean;
  autoRotate: boolean;
  controls: OrbitControls | null;
  applyCamera: ((preset: 'game' | 'reset') => void) | null;
}

export interface RenderInfoSnapshot {
  triangles: number;
  calls: number;
  geometries: number;
  dpr: number;
}

export function createControl(mode: AnimationMode): PreviewControl {
  return { mode, paused: false, speed: 1, time: 0, dirty: true, autoRotate: false, controls: null, applyCamera: null };
}
