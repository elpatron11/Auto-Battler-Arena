import { useEffect, useRef, useState } from 'react';
import { createBattleRenderer, type BattleRenderer, type BattleRendererSnapshot } from './battleRenderer';

const BASE = import.meta.env.BASE_URL;
type GameSnapshot = {
  practice: boolean;
  active: boolean;
  over: boolean;
  units: number;
  gold: number;
  hero: { id: number; alive: boolean; hp: number; maxHp: number } | null;
};
type PracticeWindow = Window & {
  WarriorBattleGame?: { start(): void; snapshot(): GameSnapshot };
  WarriorBattlePreview?: BattleRenderer;
};

export function WarriorBattleApp() {
  const frame = useRef<HTMLIFrameElement>(null);
  const renderer = useRef<BattleRenderer | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [threeD, setThreeD] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<BattleRendererSnapshot | null>(null);
  const [match, setMatch] = useState<GameSnapshot | null>(null);

  useEffect(() => () => cleanup.current(), []);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setError('The practice battle is taking too long to load. Retry the preview.'), 12000);
    return () => window.clearTimeout(timer);
  }, [ready, attempt]);

  function start() {
    const engine = frame.current?.contentWindow as PracticeWindow | null;
    if (!engine?.WarriorBattleGame) {
      setError('The practice engine is not ready. Retry the preview.');
      return;
    }
    try {
      renderer.current?.reset();
      engine.WarriorBattleGame.start();
      setError('');
    } catch (failure) {
      setError(`The practice battle could not start. ${failure instanceof Error ? failure.message : String(failure)}`);
    }
  }
  function attach() {
    cleanup.current();
    const engine = frame.current?.contentWindow as PracticeWindow | null;
    if (!engine?.WarriorBattleGame?.snapshot().practice) {
      setError('The isolated practice engine did not load. Your normal game was not changed.');
      return;
    }
    const live = createBattleRenderer();
    live.enabled = threeD;
    renderer.current = live;
    engine.WarriorBattlePreview = live;
    const poll = () => {
      setStats(live.snapshot());
      setMatch(engine.WarriorBattleGame!.snapshot());
    };
    const timer = window.setInterval(poll, 600);
    cleanup.current = () => {
      window.clearInterval(timer);
      if (engine.WarriorBattlePreview === live) delete engine.WarriorBattlePreview;
      live.dispose();
      renderer.current = null;
    };
    setReady(true);
    setError('');
    start();
    poll();
  }
  function chooseMode(enabled: boolean) {
    if (renderer.current) renderer.current.enabled = enabled;
    setThreeD(enabled);
  }
  function retry() {
    cleanup.current();
    setReady(false);
    setError('');
    setStats(null);
    setMatch(null);
    setAttempt(n => n + 1);
  }

  return <main className="wb-page">
    <header className="wb-header">
      <nav><a href={BASE}>← Back to game</a><a href={`${BASE}warrior-3d-preview.html`}>View 3D model</a><a href={`${BASE}roster-battle-preview.html`}>Try full 3D roster</a></nav>
      <div className="wb-heading"><h1>Warrior in battle</h1><span>Preview only</span></div>
      <p>Your Warrior captain is 3D. Everyone else stays original 2D. This is the real 3v3 practice engine, not a staged animation.</p>
      <div className="wb-controls" role="group" aria-label="Warrior battle preview">
        <button aria-pressed={threeD} disabled={!!stats?.failed} onClick={() => chooseMode(true)} data-testid="button-battle-3d">3D Warrior</button>
        <button aria-pressed={!threeD} onClick={() => chooseMode(false)} data-testid="button-battle-original">Original Warrior</button>
        <button disabled={!ready} onClick={start} data-testid="button-battle-restart">New practice battle</button>
      </div>
      <p className="wb-status" role="status" data-testid="text-battle-status">
        {!ready ? 'Loading practice battle…' : stats?.failed ? '3D unavailable — original Warrior active.' :
          !threeD ? 'Original Warrior active — same ongoing match.' :
          stats?.ready ? `3D Warrior active · ${stats.triangles.toLocaleString()} triangles · ${stats.drawCalls} draw calls` : 'Preparing 3D Warrior…'}
        {match?.over && ' · Match finished. Start another practice battle above.'}
      </p>
      <small>No Gold, drops, ranked rating or saved squad changes. Only the 3D body updates are capped at 30 FPS; combat rules are unchanged. Actual iPhone performance is still unverified.</small>
      {error && <p role="alert" className="wb-error">{error} <button onClick={retry}>Retry preview</button></p>}
      {stats?.failed && <p role="alert" className="wb-error">{stats.error} <button onClick={retry}>Retry 3D preview</button></p>}
    </header>
    <iframe key={attempt} ref={frame} title="3D Warrior in a real practice battle"
      src={`${BASE}game.html?guest=1&practice=1&warriorBattlePreview=1`}
      onLoad={attach} data-testid="iframe-warrior-battle" className="wb-game" />
  </main>;
}