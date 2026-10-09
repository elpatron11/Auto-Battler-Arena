import { useEffect, useRef, useState } from 'react';
import { createRosterBattleRenderer, type RosterBattleRenderer, type RosterRenderStats, type RosterEntity } from './battleRenderer';
import { LINEUPS, type LineupConfig } from './lineups';
import { ROSTER, type ClassId } from './roster';
import { isBossEncounter } from './creatures';
import { benchmarkRosterFinish, type FinishBenchmark } from './polishBenchmark';
import { createPremiumMageModel } from './magePremiumModel';
import { PREMIUM_ROSTER_FACTORY } from './premiumRoster';
import type { PolishTotem } from './polishVfx';
import '../warrior3d/warriorBattle.css';
import './rosterBattle.css';

const BASE = import.meta.env.BASE_URL;
type GameSnapshot = { practice: boolean; active: boolean; over: boolean; gold: number;
  encounter?: string;
  creatures?: { name: string; classId: string; alive: boolean }[];
  units: { id: number; classId: string; name?: string; creature?: boolean; team: string; alive: boolean; hp: number; maxHp: number; form: string }[] };
type PracticeWindow = Window & {
  RosterBattleGame?: { start(config: LineupConfig): void; entitiesForRendering(): readonly RosterEntity[]; snapshot(): GameSnapshot; clock(time: number): number };
  RosterBattlePreview?: RosterBattleRenderer;
  GameBody3DSource?: { totemsForRendering(): readonly PolishTotem[] };
};
function initialLineup() {
  const query = new URLSearchParams(location.search);
  if (isBossEncounter(query.get('boss')) || query.get('pets') === '1') return 3;
  const id = query.get('class');
  const found = LINEUPS.findIndex(l => l.player.some(c => c === id));
  return Math.max(0, found);
}
export function RosterBattleApp() {
  const frame = useRef<HTMLIFrameElement>(null);
  const renderer = useRef<RosterBattleRenderer | null>(null);
  const cleanup = useRef<() => void>(() => {});
  const [attempt, setAttempt] = useState(0), [ready, setReady] = useState(false);
  const [threeD, setThreeD] = useState(true), [error, setError] = useState('');
  const [rosterPremium, setRosterPremium] = useState(() => new URLSearchParams(location.search).get('premium') === '1');
  const [compareRoster, setCompareRoster] = useState(() => new URLSearchParams(location.search).get('premium') === '1');
  const [magePremium, setMagePremium] = useState(() => new URLSearchParams(location.search).get('premium') !== '1' && new URLSearchParams(location.search).get('mage') === '1');
  const [compareMage, setCompareMage] = useState(() => new URLSearchParams(location.search).get('mage') === '1');
  const [polished, setPolished] = useState(() => new URLSearchParams(location.search).get('premium') !== '1' && new URLSearchParams(location.search).get('mage') !== '1' && new URLSearchParams(location.search).get('polish') === '1');
  const [benchmark, setBenchmark] = useState<FinishBenchmark | null>(null), [measuring, setMeasuring] = useState(false);
  const finishRef = useRef(polished);
  const mageRef = useRef(magePremium);
  const rosterRef = useRef(rosterPremium);
  finishRef.current = polished;
  mageRef.current = magePremium;
  rosterRef.current = rosterPremium;
  const [stats, setStats] = useState<RosterRenderStats | null>(null);
  const [match, setMatch] = useState<GameSnapshot | null>(null);
  const [player, setPlayer] = useState<ClassId[]>(() => [...LINEUPS[initialLineup()].player]);
  const [enemy, setEnemy] = useState<ClassId[]>(() => [...LINEUPS[initialLineup()].enemy]);
  const [druidAbility, setDruidAbility] = useState<'default' | 'custom'>('default');
  const [encounter, setEncounter] = useState<NonNullable<LineupConfig['encounter']>>(() => {
    const boss = new URLSearchParams(location.search).get('boss');
    return isBossEncounter(boss) ? boss : 'arena';
  });
  const config = useRef<LineupConfig>({ player, enemy, druidAbility, encounter });
  config.current = { player, enemy, druidAbility, encounter };

  useEffect(() => () => cleanup.current(), []);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setError('The practice engine is taking too long to load. Retry the preview.'), 12000);
    return () => clearTimeout(timer);
  }, [ready, attempt]);
  function start() {
    const engine = frame.current?.contentWindow as PracticeWindow | null;
    if (!engine?.RosterBattleGame) { setError('The practice engine is not ready. Retry the preview.'); return; }
    try {
      renderer.current?.reset(); engine.RosterBattleGame.start(config.current); setError(''); setBenchmark(null);
    } catch (failure) { setError(`Practice battle could not start. ${failure instanceof Error ? failure.message : String(failure)}`); }
  }
  function attach() {
    cleanup.current();
    const engine = frame.current?.contentWindow as PracticeWindow | null;
    if (!engine?.RosterBattleGame?.snapshot().practice) {
      setError('The isolated practice engine did not load. Your normal game was not changed.'); return;
    }
    const live = createRosterBattleRenderer(() => engine.RosterBattleGame!.entitiesForRendering(), { polished: finishRef.current,
      premiumMage: mageRef.current ? createPremiumMageModel : undefined,
      premiumRoster: rosterRef.current ? PREMIUM_ROSTER_FACTORY : undefined });
    const standaloneControls = engine.document.querySelectorAll<HTMLElement>('[data-game-graphics], [data-game-graphics-status]');
    standaloneControls.forEach(el => { if (el.matches('select')) el.closest('label')?.style.setProperty('display', 'none'); else el.style.display = 'none'; });
    live.enabled = threeD; renderer.current = live; engine.RosterBattlePreview = live;
    const poll = () => { if (renderer.current) setStats(renderer.current.snapshot()); setMatch(engine.RosterBattleGame!.snapshot()); };
    const timer = setInterval(poll, 600);
    cleanup.current = () => {
      clearInterval(timer); if (engine.RosterBattlePreview === renderer.current) delete engine.RosterBattlePreview;
      renderer.current?.dispose(); renderer.current = null;
    };
    setReady(true); setError(''); start(); poll();
  }
  function mode(enabled: boolean) {
    if (renderer.current) renderer.current.enabled = enabled; setThreeD(enabled);
  }
  function finish(value: boolean, premium = false, fullRoster = false) {
    const engine = frame.current?.contentWindow as PracticeWindow | null;
    if (!engine?.RosterBattleGame || !ready || (value === polished && premium === magePremium && fullRoster === rosterPremium && threeD)) { mode(true); return; }
    renderer.current?.dispose();
    const live = createRosterBattleRenderer(() => engine.RosterBattleGame!.entitiesForRendering(), { polished: value,
      premiumMage: premium ? createPremiumMageModel : undefined,
      premiumRoster: fullRoster ? PREMIUM_ROSTER_FACTORY : undefined });
    renderer.current = live; engine.RosterBattlePreview = live;
    setPolished(value); setMagePremium(premium); setRosterPremium(fullRoster); setThreeD(true); setStats(live.snapshot()); setBenchmark(null);
    if (fullRoster) { setCompareRoster(true); setCompareMage(false); }
    else if (premium) { setCompareMage(true); setCompareRoster(false); }
    else if (value) { setCompareMage(false); setCompareRoster(false); }
    const url = new URL(location.href);
    url.searchParams.set('premium', fullRoster ? '1' : '0'); url.searchParams.set('mage', premium ? '1' : '0'); url.searchParams.set('polish', value ? '1' : '0');
    history.replaceState(null, '', url);
  }
  async function compareCost() {
    const engine = frame.current?.contentWindow as PracticeWindow | null;
    if (!engine?.RosterBattleGame || measuring) return;
    setMeasuring(true); setError('');
    try { setBenchmark(await benchmarkRosterFinish(engine.RosterBattleGame.entitiesForRendering(),
      engine.GameBody3DSource?.totemsForRendering() || [], engine.RosterBattleGame.clock(engine.performance.now() / 1000), compareRoster ? 'roster-premium' : compareMage ? 'mage-premium' : 'roster-polish')); }
    catch (e) { setError(`Comparison unavailable: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setMeasuring(false); }
  }
  function retry() {
    cleanup.current(); setReady(false); setError(''); setStats(null); setMatch(null); setAttempt(n => n + 1);
  }
  function choosePreset(index: number) {
    setPlayer([...LINEUPS[index].player]); setEnemy([...LINEUPS[index].enemy]);
  }
  const className = (id: string) => ROSTER.find(c => c.id === id)?.name || id;
  return <main className="wb-page rb-page">
    <header className="wb-header">
      <nav><a href={BASE}>← Back to game</a><a href={`${BASE}roster-3d-preview.html?class=paladin&premium=1`}>Inspect Premium roster</a><a href={`${BASE}roster-3d-preview.html?class=frostmage&mage=1`}>Inspect Premium Cryomancer</a>
        <a href={`${BASE}warrior-battle-preview.html`}>Single-Warrior comparison</a></nav>
      <div className="wb-heading"><h1>3D roster in battle</h1><span>Preview only</span></div>
      <p>Compare Current 3D with the reference-guided Premium roster in the same ongoing match. Premium refines the eight pictured classes and Druid caster/bear/tiger, retaining the finished Cryomancer. Bosses, pets, minions, Tree Form, camera, gameplay scale, abilities and combat rules stay unchanged. Test-only and unpublished.</p>
      <div className="wb-controls" role="group" aria-label="Roster battle rendering">
        <button aria-pressed={threeD && !polished && !magePremium && !rosterPremium} disabled={!ready} onClick={() => finish(false)} data-testid="button-roster-3d">Current 3D</button>
        <button aria-pressed={threeD && polished} disabled={!ready} onClick={() => finish(true)} data-testid="button-roster-polished">Polished 3D · preview</button>
        <button aria-pressed={threeD && magePremium} disabled={!ready} onClick={() => finish(false, true)} data-testid="button-roster-mage-premium">Premium Cryomancer · test</button>
        <button aria-pressed={threeD && rosterPremium} disabled={!ready} onClick={() => finish(false, false, true)} data-testid="button-roster-premium">Premium roster · test</button>
        <button aria-pressed={!threeD} onClick={() => mode(false)} data-testid="button-roster-original">Original roster</button>
        <button disabled={!ready} onClick={start} data-testid="button-roster-restart">Start practice battle</button>
        <button disabled={!ready || measuring} onClick={compareCost} data-testid="button-benchmark-finish">{measuring ? 'Measuring…' : 'Compare frozen battle cost'}</button>
      </div>
      <details className="rb-setup" data-testid="roster-lineup-setup">
        <summary>Choose teams · lineup changes apply when you start a new battle</summary>
        <label className="rb-druid">Practice encounter
          <select value={encounter} onChange={e => setEncounter(e.target.value as NonNullable<LineupConfig['encounter']>)} data-testid="select-practice-encounter">
            <option value="arena">Arena · 3 vs 3</option>
            <option value="frost">Frostbound Colossus</option>
            <option value="demon">Ashen Demon</option>
            <option value="temple">Temple Guardian</option>
          </select>
        </label>
        <div className="rb-presets" role="group" aria-label="Practice lineups">{LINEUPS.map((l, i) =>
          <button key={l.name} onClick={() => choosePreset(i)} data-testid={`button-lineup-${i}`}>{l.name}</button>)}</div>
        <button onClick={() => { setPlayer(['archer', 'frostmage', 'shaman']); setEnemy(['priest', 'warlock', 'druid']); setEncounter('arena'); }} data-testid="button-lineup-busy">Busy 3v3 · pets, totems & spells</button>
        <div className="rb-team-picks">
          {(['player', 'enemy'] as const).filter(side => side === 'player' || encounter === 'arena').map(side => <fieldset key={side}><legend>{side === 'player' ? 'Your team' : 'Enemy team'} · first slot is captain</legend>
            {(side === 'player' ? player : enemy).map((id, slot) => <label key={slot}>Slot {slot + 1}
              <select value={id} data-testid={`select-${side}-${slot}`} onChange={e => {
                const value = e.target.value as ClassId;
                const update = side === 'player' ? setPlayer : setEnemy;
                update(current => current.map((v, i) => i === slot ? value : v));
              }}>{ROSTER.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>)}</fieldset>)}
        </div>
        <label className="rb-druid">Druid build
          <select value={druidAbility} onChange={e => setDruidAbility(e.target.value as 'default' | 'custom')} data-testid="select-druid-ability">
            <option value="default">Tree Form · healer (default)</option><option value="custom">King of the Jungle · DPS (alternate)</option>
          </select>
        </label>
        <small>Tiger Form and emergency Bear Form use the existing rules. The default healer also has Tree Form; King of the Jungle replaces it with empowered forms. Wild Surge empowers the current form. Inspect every form in the gallery.</small>
      </details>
      <p role="status" className="wb-status" data-testid="text-roster-battle-status">
        {!ready ? 'Loading practice battle…' : stats?.phase === 'failed' ? '3D unavailable — original roster active.' :
          !threeD ? 'Original roster active — same ongoing match.' : stats?.renders ?
             `${rosterPremium ? 'Premium heroes / current creatures' : magePremium ? 'Premium Mage / current other classes' : polished ? 'Polished' : 'Current'} 3D roster active · ${stats.units} units · ${stats.triangles.toLocaleString()} triangles · ${stats.drawCalls} draw calls` : 'Preparing 3D roster…'}
        {match?.over && ' · Match finished. Start another practice battle above.'}
      </p>
      {match?.units.length ? <p className="rb-current">Current battle: {match.units.filter(u => u.team === 'player').map(u => className(u.classId)).join(' / ')}
        {' vs '}{match.units.filter(u => u.team === 'enemy').map(u => u.creature ? u.name : className(u.classId)).join(' / ')}</p> : null}
      {match?.creatures?.some(c => c.alive) && <p className="rb-current" data-testid="text-live-creatures">Live creatures: {match.creatures.filter(c => c.alive).map(c => c.name).join(' / ')}</p>}
      <small>No Gold, drops, ranked rating or saved squad changes. One shared graphics context; only 3D body updates are capped at 30 FPS. Full-roster iPhone performance still needs checking.</small>
      {benchmark && <section className="rb-current" data-testid="finish-benchmark-result" aria-live="polite">
        <strong>Matched snapshot workload · {benchmark.units} units · {benchmark.totems} totems · {benchmark.samples} paired samples</strong>
        <p>Current: {benchmark.base.median.toFixed(2)} ms median / {benchmark.base.p95.toFixed(2)} ms p95 · {benchmark.base.calls} calls · {benchmark.base.triangles.toLocaleString()} triangles</p>
        <p>{benchmark.comparison === 'roster-premium' ? 'Premium roster' : benchmark.comparison === 'mage-premium' ? 'Premium Mage only' : 'Polished'}: {benchmark.polished.median.toFixed(2)} ms median / {benchmark.polished.p95.toFixed(2)} ms p95 · {benchmark.polished.calls} calls · {benchmark.polished.triangles.toLocaleString()} triangles</p>
        <small>Atlas + accents only, not iPhone FPS or full-game frame time. Same captured units and cast/attack/hit phases; movement frozen/idle. No combat or rewards changed.</small>
      </section>}
      {error && <p role="alert" className="wb-error">{error} <button onClick={retry}>Retry preview</button></p>}
      {stats?.phase === 'failed' && <p role="alert" className="wb-error">{stats.error} <button onClick={retry}>Retry 3D preview</button></p>}
    </header>
    <iframe key={attempt} ref={frame} title="3D roster in real practice combat" className="wb-game"
      src={`${BASE}game.html?guest=1&practice=1&rosterBattlePreview=1`} onLoad={attach} data-testid="iframe-roster-battle" />
  </main>;
}