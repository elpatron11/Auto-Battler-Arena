import { useEffect, useState, type RefObject } from 'react';
import './visual-preview-controls.css';

export function VisualPreviewControls({ frame }: { frame: RefObject<HTMLIFrameElement | null> }) {
  const [mode, setMode] = useState<'polished' | 'original'>('polished');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const status = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'arena:visual-status' && ['original', 'polished'].includes(event.data.mode)) {
        setMode(event.data.mode);
        setReady(true);
      }
    };
    const ping = () => frame.current?.contentWindow?.postMessage({ type: 'arena:visual-ping' }, window.location.origin);
    window.addEventListener('message', status);
    ping();
    const timer = window.setInterval(ping, 1000);
    return () => { window.removeEventListener('message', status); window.clearInterval(timer); };
  }, [frame]);
  if (!import.meta.env.DEV) return null;
  const choose = (next: 'original' | 'polished') =>
    frame.current?.contentWindow?.postMessage({ type: 'arena:visual-preview', mode: next }, window.location.origin);
  return <aside className="visual-preview-toolbar" aria-label="Test character visuals">
    <span><strong>Visual test</strong><small data-testid="text-visual-mode">{ready ? 'Preview only · ' + mode : 'Loading preview…'}</small></span>
    <div>
      <button type="button" disabled={!ready} aria-pressed={mode === 'original'} onClick={() => choose('original')} data-testid="button-visual-original">Original</button>
      <button type="button" disabled={!ready} aria-pressed={mode === 'polished'} onClick={() => choose('polished')} data-testid="button-visual-polished">Polished</button>
      <a href={`${import.meta.env.BASE_URL}roster-visual-lab.html`} target="_blank" rel="noreferrer">Compare roster</a>
      <a href={`${import.meta.env.BASE_URL}warrior-3d-preview.html`} target="_blank" rel="noreferrer">3D Warrior</a>
      <a href={`${import.meta.env.BASE_URL}warrior-battle-preview.html`} target="_blank" rel="noreferrer">3D battle</a>
      <a href={`${import.meta.env.BASE_URL}roster-3d-preview.html`} target="_blank" rel="noreferrer">3D roster</a>
      <a href={`${import.meta.env.BASE_URL}roster-battle-preview.html`} target="_blank" rel="noreferrer">Roster battle</a>
    </div>
  </aside>;
}