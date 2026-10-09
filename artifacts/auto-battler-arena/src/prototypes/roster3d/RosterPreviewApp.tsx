import { useCallback, useMemo, useRef, useState } from 'react';
import { RosterStage, createRosterControl, type LiveInfo, type CameraPreset } from './RosterStage';
import { type DruidForm } from './roster';
import { MODEL_ROSTER, isModelId, type ModelId } from './creatures';
import type { CharacterMode, CharacterModel, CharacterPose } from './modelKit';
import { detectWebGL } from '../warrior3d/webgl';
import { MageBattleComparison } from './MageBattleComparison';
import cryomancerReference from '../../../../../attached_assets/3DC12370-B10E-40E1-83DC-5DF3ABDCF59D_1790911559180.png';
import rosterReference from '../../../../../attached_assets/45E1942B-2B0E-4BA7-8139-2821CF395C92_1790915144686.png';
import { isPremiumRosterModel } from './premiumRoster';
import { isPrestigeId, PRESTIGE_LABEL, type PrestigeId } from './premiumRoster/prestige';

const BASE = import.meta.env.BASE_URL;
const MODES: CharacterMode[] = ['idle', 'run', 'attack', 'cast'];
const FORMS: { id: DruidForm; label: string }[] = [
  { id: '', label: 'Caster' }, { id: 'bear', label: 'Bear' }, { id: 'tiger', label: 'Tiger' }, { id: 'tree', label: 'Tree' },
];
const VARIANTS: { id: CharacterPose['variant'] | ''; label: string }[] = [
  { id: '', label: 'Default' }, { id: 'shadow', label: 'Shadow' }, { id: 'fire', label: 'Fire' },
];

export function RosterPreviewApp() {
  const initial = useMemo<ModelId>(() => {
    const sp = new URLSearchParams(window.location.search), q = sp.get('class'), pr = sp.get('prestige');
    return isModelId(q) ? q : isPrestigeId(pr) ? pr : 'warrior';
  }, []);
  const ctl = useRef(createRosterControl());
  const [classId, setClassId] = useState<ModelId>(initial);
  const [form, setForm] = useState<DruidForm>('');
  const [mode, setMode] = useState<CharacterMode>('idle');
  const [variant, setVariant] = useState<CharacterPose['variant'] | ''>('');
  const [paused, setPaused] = useState(false);
  const [spin, setSpin] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(useMemo(detectWebGL, []));
  const [attempt, setAttempt] = useState(0);
  const [stats, setStats] = useState<CharacterModel['stats'] | null>(null);
  const [info, setInfo] = useState<LiveInfo | null>(null);
  // Prototype-only skin choice. Bound to a class so it can never leak onto another one.
  const [prestige, setPrestige] = useState<PrestigeId | ''>(() => {
    const sp = new URLSearchParams(location.search), pr = sp.get('prestige'), q = sp.get('class');
    return isPrestigeId(pr) && (!q || q === pr) ? pr : '';
  });
  const [rosterPremium, setRosterPremium] = useState(() => { const sp = new URLSearchParams(location.search); return sp.get('premium') === '1' || isPrestigeId(sp.get('prestige')); });
  const [magePremium, setMagePremium] = useState(() => new URLSearchParams(location.search).get('premium') !== '1' && new URLSearchParams(location.search).get('mage') === '1');
  const [polished, setPolished] = useState(() => new URLSearchParams(location.search).get('premium') !== '1' && new URLSearchParams(location.search).get('mage') !== '1' && new URLSearchParams(location.search).get('polish') === '1');
  const [reaction, setReaction] = useState<'none' | 'hit' | 'death'>('none');
  const entry = MODEL_ROSTER.find((r) => r.id === classId)!;
  const premiumSupported = isPremiumRosterModel(classId, form);
  const prestigeActive = rosterPremium && isPrestigeId(classId) && prestige === classId;
  const battleQuery = classId.startsWith('boss-') ? `boss=${classId.slice(5)}` :
    classId.startsWith('add-') ? 'boss=demon' : classId.startsWith('pet-') ? 'pets=1' : `class=${classId}`;
  const supportedVariants = VARIANTS.filter(v => !v.id ||
    (classId === 'priest' && v.id === 'shadow') || (classId === 'frostmage' && v.id === 'fire'));

  const onInfo = useCallback((i: LiveInfo) => setInfo((p) => (p && p.triangles === i.triangles && p.calls === i.calls && p.geometries === i.geometries ? p : i)), []);
  const onError = useCallback((m: string) => setError(m), []);
  const onStats = useCallback((s: CharacterModel['stats']) => setStats(s), []);

  const pick = (id: ModelId) => {
    if (id === classId && form === '') return;
    setClassId(id); setForm(''); setStats(null); setVariant(''); setPrestige('');
    ctl.current.variant = undefined; ctl.current.dirty = true;
    const url = new URL(window.location.href);
    url.searchParams.set('class', id); url.searchParams.delete('prestige');
    window.history.replaceState(null, '', url);
  };
  const chooseMode = (m: CharacterMode) => { const c = ctl.current; c.mode = m; c.time = 0; c.dirty = true; setMode(m); };
  const chooseFinish = (value: boolean) => {
    setPrestige('');
    if (!magePremium && !rosterPremium && value === polished) return;
    setMagePremium(false); setRosterPremium(false); setPolished(value); setStats(null); setInfo(null); ctl.current.dirty = true;
    const url = new URL(location.href); url.searchParams.set('polish', value ? '1' : '0');
    url.searchParams.delete('mage');
    url.searchParams.delete('premium');
    history.replaceState(null, '', url);
  };
  const choosePremium = () => {
    setPrestige('');
    if (magePremium && !rosterPremium) return;
    setMagePremium(true); setRosterPremium(false); setPolished(false); setStats(null); setInfo(null); ctl.current.dirty = true;
    const url = new URL(location.href); url.searchParams.set('mage', '1'); url.searchParams.set('polish', '0');
    url.searchParams.delete('premium');
    history.replaceState(null, '', url);
  };
  const choosePrestige = (v: boolean) => {
    if (!isPrestigeId(classId)) return;
    setPrestige(v ? classId : ''); setRosterPremium(true); setMagePremium(false); setPolished(false); setStats(null); setInfo(null); ctl.current.dirty = true;
    const url = new URL(location.href); url.searchParams.set('premium', '1'); url.searchParams.delete('mage'); url.searchParams.delete('polish');
    if (v) url.searchParams.set('prestige', classId); else url.searchParams.delete('prestige');
    history.replaceState(null, '', url);
  };
  const choosePremiumRoster = () => {
    if (rosterPremium) return;
    setRosterPremium(true); setMagePremium(false); setPolished(false); setStats(null); setInfo(null); ctl.current.dirty = true;
    const url = new URL(location.href); url.searchParams.set('premium', '1'); url.searchParams.delete('mage'); url.searchParams.delete('polish');
    history.replaceState(null, '', url);
  };
  const chooseVariant = (v: CharacterPose['variant'] | '') => { ctl.current.variant = v || undefined; ctl.current.dirty = true; setVariant(v); };
  const togglePause = () => { const c = ctl.current; c.paused = !c.paused; c.dirty = true; setPaused(c.paused); };
  const toggleSpin = () => { const c = ctl.current; c.autoRotate = !c.autoRotate; c.dirty = true; setSpin(c.autoRotate); };
  const chooseSpeed = (s: number) => { ctl.current.speed = s; setSpeed(s); };
  const camera = (p: CameraPreset) => {
    if (p === 'reset') { ctl.current.autoRotate = false; setSpin(false); }
    ctl.current.applyCamera?.(p);
  };
  const retry = () => { setError(detectWebGL()); setAttempt((a) => a + 1); ctl.current.dirty = true; };

  return (
    <main className="r3d-page">
      <header className="r3d-head">
        <div className="r3d-links">
          <a href={BASE} data-testid="link-back-to-game">&larr; Back to game</a>
          <a href={`${BASE}warrior-3d-preview.html`} data-testid="link-single-warrior">Original Warrior gallery</a>
          <a href={`${BASE}warrior-battle-preview.html`} data-testid="link-warrior-battle">Warrior battle</a>
        </div>
        <h1>{classId === 'frostmage' ? 'Cryomancer 3D' : 'Roster 3D'} <span data-testid="status-preview-only">Model gallery</span></h1>
        <p className="r3d-note">{classId === 'frostmage' ? 'Reference-guided Cryomancer: layered blue-and-gold robes, integrated ice armor, a sculpted face and beard, a shaped wizard hat and a crystal-crowned wooden staff. Same procedural base and rig; the finished Cryomancer stays unchanged in Premium roster. Combat rules are unchanged.' : 'Polished finish is preview/test only — not published. These are the same base models, silhouettes and rigs. Compare before deciding.'}</p>
        <p className="r3d-note">Premium roster follows the uploaded reference: Paladin, Rogue, Archer, Warrior, Priest, Shaman, Warlock and Druid caster/bear/tiger. The finished Cryomancer is retained unchanged as the benchmark. Bosses, pets, dungeon minions and Druid Tree Form keep their current models. Premium roster is the normal 3D graphics option; choose 3D or Classic in Profile.</p>
        <div className="r3d-row" role="group" aria-label="Model finish">
          <button aria-pressed={!polished && (!magePremium || classId !== 'frostmage') && (!rosterPremium || !premiumSupported)} onClick={() => chooseFinish(false)} data-testid="button-finish-base">Current 3D</button>
          <button aria-pressed={polished} onClick={() => chooseFinish(true)} data-testid="button-finish-polished">Polished 3D · preview</button>
          {classId === 'frostmage' && <button aria-pressed={magePremium} onClick={choosePremium} data-testid="button-finish-mage-premium">Premium Cryomancer · test</button>}
          {premiumSupported && <button aria-pressed={rosterPremium} onClick={choosePremiumRoster} data-testid="button-finish-roster-premium">Premium roster · test</button>}
        </div>
        {isPrestigeId(classId) && <div className="r3d-row" role="group" aria-label="Prestige prototype" data-testid="group-prestige">
          <button aria-pressed={rosterPremium && !prestigeActive} onClick={() => choosePrestige(false)} data-testid="button-prestige-off">Approved Premium {entry.name}</button>
          <button aria-pressed={prestigeActive} onClick={() => choosePrestige(true)} data-testid={`button-prestige-${classId}`}>{PRESTIGE_LABEL[classId]} · prototype</button>
        </div>}
        {prestigeActive && isPrestigeId(classId) && <p className="r3d-note" data-testid="status-prestige-prototype">COSMETIC PREVIEW: {PRESTIGE_LABEL[classId]} uses the approved Premium rig. Unlock through ranked rewards or rare Dungeon/Arena drops, then equip in Profile. Previewing here grants no ownership; stats, hitboxes and abilities are unchanged.</p>}
      </header>

      <nav className="r3d-categories" aria-label="3D models">
        {(['Heroes', 'Bosses', 'Pets', 'Dungeon minions'] as const).map(group => <section key={group}>
        <h2>{group}</h2><div className="r3d-roster">
        {MODEL_ROSTER.filter(r => r.group === group).map((r) => (
          <button key={r.id} type="button" aria-pressed={classId === r.id} onClick={() => pick(r.id)} data-testid={`button-class-${r.id}`}>{r.name}</button>
        ))}
        </div></section>)}
      </nav>

      <section className="r3d-stage" aria-label={`${entry.name} 3D viewport`}>
        {error ? (
          <div className="r3d-error" role="alert" data-testid="status-webgl-error">
            <strong>3D preview unavailable</strong>
            <p>{error}</p>
            <button type="button" onClick={retry} data-testid="button-retry">Retry</button>
          </div>
        ) : (
          <RosterStage key={attempt} ctl={ctl} classId={classId} form={form} polished={polished} magePremium={magePremium} rosterPremium={rosterPremium} prestige={prestige} onInfo={onInfo} onStats={onStats} onError={onError} />
        )}
        <div className="r3d-chip" data-testid="text-current-animation">
          {entry.name}{classId === 'druid' && form ? ` / ${form}` : ''} - {mode}{paused ? ' - paused' : ''}
        </div>
        <div className="r3d-hint">Drag to orbit - pinch or scroll to zoom</div>
      </section>

      <section className="r3d-panel" aria-label="Controls">
        <p className="r3d-role" data-testid="text-class-role">{entry.role}</p>
        <div className="r3d-row" role="group" aria-label="Animation">
          {MODES.map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => chooseMode(m)} data-testid={`button-animation-${m}`}>{m}</button>)}
        </div>
        {(polished || (magePremium && classId === 'frostmage') || (rosterPremium && premiumSupported)) && <div className="r3d-row" role="group" aria-label="Visual reaction">
          {(['none', 'hit', 'death'] as const).map(value => <button key={value} aria-pressed={reaction === value}
            data-testid={`button-reaction-${value}`} onClick={() => { ctl.current.reaction = value; ctl.current.time = 0; ctl.current.dirty = true; setReaction(value); }}>
            {value === 'none' ? 'Normal motion' : `${value} preview`}
          </button>)}
        </div>}
        {classId === 'druid' && (
          <div className="r3d-row" role="group" aria-label="Druid form">
            {FORMS.map((f) => <button key={f.label} type="button" aria-pressed={form === f.id} onClick={() => { if (form !== f.id) { setForm(f.id); setStats(null); } }} data-testid={`button-form-${f.id || 'caster'}`}>{f.label}</button>)}
          </div>
        )}
        {supportedVariants.length > 1 && <div className="r3d-row" role="group" aria-label="Variant">
          {supportedVariants.map((v) => <button key={v.label} type="button" aria-pressed={variant === v.id} onClick={() => chooseVariant(v.id)} data-testid={`button-variant-${v.id || 'default'}`}>{v.label}</button>)}
        </div>}
        <div className="r3d-row">
          <button type="button" aria-pressed={paused} onClick={togglePause} data-testid="button-pause">{paused ? 'Resume' : 'Pause'}</button>
          {[0.5, 1].map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => chooseSpeed(s)} data-testid={`button-speed-${s}`}>{s === 1 ? 'Full speed' : 'Half speed'}</button>)}
        </div>
        <div className="r3d-row">
          <button type="button" onClick={() => camera('game')} data-testid="button-camera-game">Game angle</button>
          {(['front', 'back', 'side'] as const).map((p) => <button key={p} type="button" onClick={() => camera(p)} data-testid={`button-camera-${p}`}>{p[0].toUpperCase() + p.slice(1)}</button>)}
          <button type="button" aria-pressed={spin} onClick={toggleSpin} data-testid="button-rotate-around">Rotate around</button>
          <button type="button" onClick={() => camera('reset')} data-testid="button-camera-reset">Reset camera</button>
        </div>
      </section>

      {classId === 'frostmage' && <>
        <details className="r3d-card" data-testid="cryomancer-design-reference">
          <summary>Uploaded Cryomancer design reference</summary>
          <p className="r3d-note">The visual target—not a promise to copy every ornament. Large shapes and material separation take priority at battle scale.</p>
          <img src={cryomancerReference} alt="Uploaded premium Cryomancer concept with front, side and back views, blue-and-gold robes, crystal armor and animation poses"
            loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
        </details>
      </>}
      {premiumSupported && <MageBattleComparison key={`${classId}-${form}-${rosterPremium}`} classId={classId} form={form} label={entry.name} rosterPremium={classId !== 'frostmage' || rosterPremium} />}
      <details className="r3d-card" data-testid="premium-roster-design-reference">
        <summary>Uploaded complete premium roster reference</summary>
        <p className="r3d-note">Shared visual specification. Large shapes and material contrast take priority over small ornaments at battle scale.</p>
        <img src={rosterReference} alt="Premium Paladin, Rogue, Archer, Warrior, Priest, Shaman, Warlock and Druid caster, bear and tiger reference" loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
      </details>
      <section className="r3d-cols">
        <div className="r3d-card">
          <h2>Model stats</h2>
          <dl data-testid="panel-model-stats">
            <div><dt>Triangles</dt><dd data-testid="text-model-triangles">{stats ? stats.triangles.toLocaleString() : '...'}</dd></div>
            <div><dt>Meshes</dt><dd data-testid="text-model-meshes">{stats ? stats.meshes : '...'}</dd></div>
            <div><dt>Geometries</dt><dd data-testid="text-model-geometries">{stats ? stats.geometries : '...'}</dd></div>
            <div><dt>Materials</dt><dd data-testid="text-model-materials">{stats ? stats.materials : '...'}</dd></div>
          </dl>
        </div>
        <div className="r3d-card">
          <h2>Live render</h2>
          <dl data-testid="panel-render-info">
            <div><dt>Triangles</dt><dd>{info ? info.triangles.toLocaleString() : '...'}</dd></div>
            <div><dt>Draw calls</dt><dd>{info ? info.calls : '...'}</dd></div>
            <div><dt>GPU geometries</dt><dd>{info ? info.geometries : '...'}</dd></div>
            <div><dt>Pixel ratio</dt><dd>{info ? info.dpr.toFixed(2) : '...'} (cap 1.25)</dd></div>
          </dl>
          <p className="r3d-note">Inspect the game’s 3D models here. Targets 30 FPS and stops drawing when hidden or paused. Combat rules remain unchanged.</p>
        </div>
        <div className="r3d-card r3d-try">
          <h2>Try {entry.name} in battle</h2>
          <p className="r3d-note">Opens an isolated practice battle with this hero, boss or pet’s team. Pets and minions appear through their existing combat rules.</p>
          <a className="r3d-cta" href={`${BASE}roster-battle-preview.html?${battleQuery}&polish=${polished ? '1' : '0'}&mage=${magePremium ? '1' : '0'}&premium=${rosterPremium ? '1' : '0'}`} data-testid="link-try-roster-battle">Practice battle &rarr;</a>
        </div>
      </section>
    </main>
  );
}
