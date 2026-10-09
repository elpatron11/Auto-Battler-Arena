import { useEffect, useState } from 'react';
import type { WebGLRenderer } from 'three';

type SkinClass = 'paladin' | 'warrior';
type Model = ReturnType<typeof import('../prototypes/roster3d/premiumRoster/prestige').createPrestigeRosterModel>;
type Presentation = ReturnType<typeof import('../prototypes/roster3d/prestigePresentation').createPrestigePresentation>;
// Two bounded, static images. Changing tabs never recreates a GPU renderer.
const shots = new Map<SkinClass, Promise<string>>();

async function renderSkin(id: SkinClass): Promise<string> {
  let renderer: WebGLRenderer | undefined;
  let model: Model | undefined;
  let presentation: Presentation | undefined;
  try {
    const THREE = await import('three');
    const { createPrestigeRosterModel } = await import('../prototypes/roster3d/premiumRoster/prestige');
    const { createPrestigePresentation } = await import('../prototypes/roster3d/prestigePresentation');
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(360, 440, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight('#d9deea', 1.7));
    const key = new THREE.DirectionalLight('#fff1d8', 2.6);
    key.position.set(4, 8, 6); scene.add(key);
    const rim = new THREE.DirectionalLight('#8aa0c8', 0.7);
    rim.position.set(-5, 3, -4); scene.add(rim);
    model = createPrestigeRosterModel(id); scene.add(model.root);
    const camera = new THREE.PerspectiveCamera(34, 360 / 440, 0.1, 60);
    camera.position.set(2.2, 4.4, 12.4); camera.lookAt(0, 3.1, 0.2);
    presentation = createPrestigePresentation(id, true); scene.add(presentation.root);
    model.animate({ time: 0.4, mode: 'idle', progress: 0 });
    presentation.update({ time: 0.4, mode: 'idle', progress: 0 }, camera, true);
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  } finally {
    presentation?.dispose(); model?.dispose();
    renderer?.dispose(); renderer?.forceContextLoss();
  }
}

export function StoreSkinArt({ id, label }: { id: SkinClass; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!shots.has(id)) shots.set(id, renderSkin(id));
    void shots.get(id)!.then(image => { if (!cancelled) setSrc(image); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id]);
  if (src) return <img className="st-art st-skin-shot" src={src} alt={`${label} existing 3D skin`} data-testid={`img-skin-${id}`}/>;
  return <div className="st-art st-portrait" data-testid={`img-skin-fallback-${id}`}>
    <img src={`${import.meta.env.BASE_URL}class-portraits/${id}.jpg`} alt={`${id} class portrait`}/>
    <span className="st-tag">{failed ? 'Class portrait — skin preview unavailable' : 'Loading existing skin preview'}</span>
  </div>;
}
