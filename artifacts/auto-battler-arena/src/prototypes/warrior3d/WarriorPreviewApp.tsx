import { useCallback, useMemo, useRef, useState } from 'react';
import { WarriorStage } from './WarriorStage';
import { createControl, type RenderInfoSnapshot } from './previewState';
import { ANIMATION_MODES, parseAnimation, type AnimationMode } from './warriorAnimation';
import { detectWebGL } from './webgl';

const BASE = import.meta.env.BASE_URL;

export function WarriorPreviewApp() {
  const initial = useMemo(() => parseAnimation(window.location.search), []);
  const webglError = useMemo(detectWebGL, []);
  const ctl = useRef(createControl(initial));
  const [mode, setMode] = useState<AnimationMode>(initial);
  const [paused, setPaused] = useState(false);
  const [spin, setSpin] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(webglError);
  const [info, setInfo] = useState<RenderInfoSnapshot | null>(null);
  const [refOk, setRefOk] = useState(true);

  const onInfo = useCallback((i: RenderInfoSnapshot) => {
    setInfo((p) => (p && p.triangles === i.triangles && p.calls === i.calls && p.dpr === i.dpr && p.geometries === i.geometries ? p : i));
  }, []);
  const onError = useCallback((m: string) => setError(m), []);

  const chooseMode = (m: AnimationMode) => {
    const c = ctl.current;
    c.mode = m; c.time = 0; c.dirty = true;
    setMode(m);
    const url = new URL(window.location.href);
    url.searchParams.set('animation', m);
    window.history.replaceState(null, '', url);
  };
  const togglePause = () => { const c = ctl.current; c.paused = !c.paused; c.dirty = true; setPaused(c.paused); };
  const toggleSpin = () => { const c = ctl.current; c.autoRotate = !c.autoRotate; c.dirty = true; setSpin(c.autoRotate); };
  const chooseSpeed = (s: number) => { ctl.current.speed = s; setSpeed(s); };
  const camera = (p: 'game' | 'reset') => {
    if (p === 'reset') { ctl.current.autoRotate = false; setSpin(false); }
    ctl.current.applyCamera?.(p);
  };

  return (
    <main className="w3d-page">
      <header className="w3d-head">
        <a className="w3d-back" href={BASE} data-testid="link-back-to-game">&larr; Back to game</a>
        <a className="w3d-back" href={`${BASE}warrior-battle-preview.html`} data-testid="link-try-battle">Try Warrior in a practice battle &rarr;</a>
        <div className="w3d-title">
          <h1>Warrior 3D</h1>
          <span className="w3d-badge" data-testid="status-preview-only">Preview only - not in the game</span>
        </div>
      </header>

      <section className="w3d-stage" aria-label="Warrior 3D viewport">
        {error ? (
          <div className="w3d-error" role="alert" data-testid="status-webgl-error">
            <strong>3D preview unavailable</strong>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()} data-testid="button-retry">Retry</button>
          </div>
        ) : (
          <WarriorStage ctl={ctl} onInfo={onInfo} onError={onError} />
        )}
        <div className="w3d-chip" data-testid="text-current-animation">
          {mode}{paused ? ' - paused' : ''}
        </div>
        <div className="w3d-hint">Drag to orbit - pinch or scroll to zoom</div>
      </section>

      <section className="w3d-panel" aria-label="Controls">
        <div className="w3d-row" role="group" aria-label="Animation">
          {ANIMATION_MODES.map((m) => (
            <button key={m} type="button" className="w3d-btn" aria-pressed={mode === m} onClick={() => chooseMode(m)} data-testid={`button-animation-${m}`}>
              {m}
            </button>
          ))}
        </div>
        <div className="w3d-row">
          <button type="button" className="w3d-btn" aria-pressed={paused} onClick={togglePause} data-testid="button-pause">{paused ? 'Resume' : 'Pause'}</button>
          {[0.5, 1].map((s) => (
            <button key={s} type="button" className="w3d-btn" aria-pressed={speed === s} onClick={() => chooseSpeed(s)} data-testid={`button-speed-${s}`}>{s === 1 ? 'Full speed' : 'Half speed'}</button>
          ))}
        </div>
        <div className="w3d-row">
          <button type="button" className="w3d-btn" onClick={() => camera('game')} data-testid="button-camera-game">Game angle</button>
          <button type="button" className="w3d-btn" aria-pressed={spin} onClick={toggleSpin} data-testid="button-rotate-around">Rotate around</button>
          <button type="button" className="w3d-btn" onClick={() => camera('reset')} data-testid="button-camera-reset">Reset camera</button>
        </div>
      </section>

      <section className="w3d-cols">
        <div className="w3d-card">
          <h2>Render info</h2>
          <dl data-testid="panel-render-info">
            <div><dt>Triangles</dt><dd data-testid="text-triangles">{info ? info.triangles.toLocaleString() : '...'}</dd></div>
            <div><dt>Draw calls</dt><dd data-testid="text-drawcalls">{info ? info.calls : '...'}</dd></div>
            <div><dt>Geometries</dt><dd data-testid="text-geometries">{info ? info.geometries : '...'}</dd></div>
            <div><dt>Pixel ratio</dt><dd data-testid="text-dpr">{info ? info.dpr.toFixed(2) : '...'} (cap 1.25)</dd></div>
          </dl>
          <p className="w3d-note" data-testid="text-perf-note">
            Live browser counts, not an iPhone performance guarantee. This isolated preview targets 30 FPS with capped resolution; the playable game still uses 2D characters.
            Hidden tabs stop drawing. Pause freezes animation; moving the camera can still render.
          </p>
        </div>
        <div className="w3d-card">
          <h2>Original 2D reference</h2>
          {refOk ? (
            <img className="w3d-ref" src={`${BASE}original-warrior-reference.png`} alt="Original 2D Warrior sprite" onError={() => setRefOk(false)} data-testid="img-original-reference" />
          ) : (
            <p className="w3d-note">Reference image not found. Expected at original-warrior-reference.png.</p>
          )}
          <p className="w3d-note">Two-handed longsword, steel plate, burgundy cape, gold buckle, brown beard.</p>
        </div>
      </section>
    </main>
  );
}
