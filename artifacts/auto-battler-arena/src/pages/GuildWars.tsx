import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetEconomy, getGetGuildWarsLobbyQueryKey, useCommandGuildWar, useGetGuildFoundation, useGetGuildWarsLobby,
  useJoinGuildWar, useLeaveGuildWar, getGetGuildFoundationQueryKey, useGetArenaProfile,
} from '@workspace/api-client-react';
import type { GuildWarJoinInput } from '@workspace/api-client-react';
import { SiteHeader } from '../components/SiteHeader';
import { GuildWarMap } from '../components/GuildWarMap';
import type { WarObjective, WarSnapshot } from '../lib/guildWarTypes';
import { GuildDialog } from '../components/GuildDialog';
import '../guild.css';

const CLASSES: { id: GuildWarJoinInput['classId']; name: string; rule: string }[] = [
  { id: 'warrior', name: 'Warrior', rule: 'Gate damage +50%.' },
  { id: 'archer', name: 'Archer', rule: 'On towers: 2x range.' },
  { id: 'rogue', name: 'Rogue', rule: 'Interruptible 2s sabotage disables a tower Archer for 5s. Cooldown 30s; same tower immune for 15s after recovery.' },
  { id: 'frostmage', name: 'Frost Mage', rule: 'Ice defender at the gate: 150 HP, 2s cast, lasts 12s, cooldown 60s.' },
  { id: 'warlock', name: 'Warlock', rule: 'Near owned boss: sacrifice 25% of your current HP for +30% boss gate/tower damage for 10s. Cooldown 60s.' },
  { id: 'druid', name: 'Druid', rule: 'Banner carry 25. Respawn 60. Cheetah +50% speed; Bear 20% damage reduction.' },
  { id: 'paladin', name: 'Paladin', rule: 'Shield 150, cooldown 30s, does not stack. Cast after the gate falls.' },
  { id: 'shaman', name: 'Shaman', rule: 'Owned boss heal 20%, 3s cast, cooldown 30s, does not stack.' },
  { id: 'priest', name: 'Priest', rule: 'Own killed boss: rebirth after 5s at 50% HP; corpse lasts 15s; once only.' },
];
const OBJ: { id: WarObjective; label: string }[] = [
  { id: 'auto', label: 'Auto' }, { id: 'castle', label: 'Castle' }, { id: 'gate', label: 'Gate' },
  { id: 'tower', label: 'Tower' }, { id: 'boss', label: 'Boss' }, { id: 'banner', label: 'Banner' },
  { id: 'defend', label: 'Defend' }, { id: 'regroup', label: 'Regroup' }, { id: 'wall', label: 'Wall' },
];
const COOLDOWN = 2000;

function fmt(ms: number) { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); return `${h ? h + 'h ' : ''}${String(Math.floor(s / 60) % 60).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`; }
function errText(e: unknown) { return e instanceof Error ? e.message : 'Request failed.'; }

const GUIDE = [
  'Scheduled events start every 3 hours and last 20 minutes. Practice rooms can be joined immediately.',
  'Every playable room includes one server-controlled AI guild. It mirrors the largest human squad with 1–5 distinct classes, uses the same combat rules, and counts toward the 5-guild / 25-character caps. Real guilds fill the remaining slots first. AI gets no currency or items.',
  'Score: the castle owner holds it for points; holding the castle during the last 3 minutes scores 50. Castle ownership goes to the guild that dealt the most damage.',
  'Banner: only a Druid can carry it (25 carry value, 60s respawn). Other classes cannot pick it up.',
  'Defense abilities (Frost Mage ice defender, Paladin shield, Shaman heal) run on their own cooldowns and do not stack.',
  'Objective commands have a 2 second cooldown and can be sent at any time.',
  'All nine Arena classes are available, except Monk. New rooms run extracted Arena class AI, spells, talents and ultimates using server-validated equipped builds. Legacy rooms keep their original kits. Full multi-guild parity and restart restoration remain under verification. No payouts or rewards.',
];
function Rules({ onClose }: { onClose: () => void }) {
  return <GuildDialog label="Rule guide" testId="dialog-rules" onClose={onClose} wide>
      <h2 className="display">Rule guide</h2>
      {GUIDE.map((g, i) => <div className="gw-rule" key={i} data-testid={`guide-${i}`}>{g}</div>)}
      <h2 className="display" style={{ fontSize: 28, marginTop: 14 }}>Class roles</h2>
      {CLASSES.map((c) => <div className="gw-rule" key={c.id} data-testid={`rule-${c.id}`}><b>{c.name}</b><br />{c.rule}</div>)}
      <div className="gx-actions" style={{ marginTop: 16 }}><button className="btn btn-primary" onClick={onClose} data-testid="button-close-rules">Close</button></div>
  </GuildDialog>;
}

function Room({ roomId, meId, onLeave, leaving, leaveError }: { roomId: string; meId: string | null; onLeave: () => void; leaving: boolean; leaveError:string|null }) {
  const [snap, setSnap] = useState<WarSnapshot | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'reconnecting' | 'closed'>('connecting');
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [last, setLast] = useState(0);
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const offset = useRef(0);
  const cmd = useCommandGuildWar({ mutation: { onError: (e) => setErr(errText(e)) } });

  useEffect(() => {
    setStatus(navigator.onLine?'connecting':'reconnecting');
    let receivedAt=Date.now();
    const es = new EventSource(`${import.meta.env.BASE_URL}api/guild-wars/rooms/${encodeURIComponent(roomId)}/stream`, { withCredentials: false });
    es.onopen = () => setStatus('live');
    es.onmessage = (ev) => {
      try { const s = JSON.parse(ev.data) as WarSnapshot; receivedAt=Date.now(); offset.current = s.now - receivedAt; setSnap(s); setStatus(navigator.onLine?'live':'reconnecting'); } catch { /* ignore malformed frame; stale-frame timer detects failed delivery */ }
    };
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting');
    const offline=()=>setStatus('reconnecting');
    const online=()=>setAttempt(n=>n+1);
    const stale=window.setInterval(()=>{if(es.readyState!==EventSource.CLOSED&&(!navigator.onLine||Date.now()-receivedAt>6000))setStatus('reconnecting');},2000);
    window.addEventListener('offline',offline);window.addEventListener('online',online);
    return () => {es.close();window.clearInterval(stale);window.removeEventListener('offline',offline);window.removeEventListener('online',online);};
  }, [roomId, attempt]);
  useEffect(() => { const t = window.setInterval(() => setTick((n) => n + 1), 250); return () => window.clearInterval(t); }, []);

  const me = snap?.entities.find((e) => e.id === meId) ?? null;
  const wait = Math.max(0, COOLDOWN - (Date.now() - last));
  void tick;
  const send = (objective: WarObjective, form?: 'normal' | 'cheetah' | 'bear') => {
    if (wait > 0) return; setErr(null); setLast(Date.now());
    cmd.mutate({ roomId, data: form ? { objective: me?.objective ?? objective, form } : { objective } });
  };
  const nowServer = Date.now() + offset.current;
  const nameOf = (id: string | null) => snap?.guilds.find((g) => g.id === id)?.name ?? 'none';

  return <div className="shell">
    <div className="gx-head" style={{ paddingTop: 22 }}>
      <div><div className="eyebrow">Room {roomId} · prototype</div><h1 className="display" style={{ fontSize: 'clamp(40px,6vw,72px)' }}>Guild Wars</h1></div>
      <div className="gx-actions">
        <span className="mono" data-testid="status-stream">{status === 'live' ? 'Live' : status === 'closed' ? 'Disconnected' : status === 'reconnecting' ? 'Reconnecting' : 'Connecting'}</span>
        <button className="btn btn-sm" onClick={() => setRules(true)} data-testid="button-open-rules">Rule guide</button>
        <button className="btn btn-sm gx-danger" disabled={leaving} onClick={() => setConfirmLeave(true)} data-testid="button-leave-room">Leave room</button>
      </div>
    </div>
    {status === 'closed' && <div className="status-line error" style={{ marginTop: 14 }} data-testid="state-stream-closed">The stream closed. Your session may have expired or the room ended. <button className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)} data-testid="button-reconnect">Reconnect</button> <Link href="/sign-in" className="btn btn-sm" data-testid="link-sign-in-again">Sign in</Link></div>}
    {!snap && status !== 'closed' && <div className="skeleton" style={{ height: 420, marginTop: 16 }} data-testid="state-room-loading" />}
    {snap && <div className="gw-room">
      <section className="panel" style={{ minWidth: 0 }}>
        <div className="gw-tools">
          <span className="mono">Zoom</span>
          {[1, 2, 3].map((z) => <button key={z} className={`btn btn-sm ${zoom === z ? 'btn-primary' : ''}`} onClick={() => setZoom(z)} data-testid={`button-zoom-${z}`}>{z === 1 ? 'Fit' : `${z}x`}</button>)}
          <span className="mono" style={{ marginLeft: 'auto' }} data-testid="text-event-timer">{snap.finished ? 'Finished' : `Ends in ${fmt(snap.endsAt - nowServer)}`}</span>
        </div>
        <div className="gw-mapwrap"><GuildWarMap snap={snap} meId={meId} zoom={zoom} /></div>
      </section>
      <aside className="gw-side">
        {snap.finished && <div className="status-line" data-testid="status-finished">Event finished. Winners: {snap.winners.map(nameOf).join(', ') || 'none'}. No payouts in this prototype.</div>}
        <section className="panel">
          <div className="panel-head"><h2>Commands</h2><span className="mono" data-testid="text-current-objective">Now: {me?.objective ?? 'spectating'}</span></div>
          <div className="gw-cmds">{OBJ.map((o) => <button key={o.id} className={`btn ${me?.objective === o.id ? 'cur' : ''}`} disabled={!me || status!=='live' || snap.finished || wait > 0 || cmd.isPending} onClick={() => send(o.id)} data-testid={`button-objective-${o.id}`}>{o.label}</button>)}</div>
          {me?.classId === 'druid' && <div className="gw-cmds" style={{ paddingTop: 0 }}>{(['normal', 'cheetah', 'bear'] as const).map((f) => <button key={f} className={`btn ${me.form === f ? 'cur' : ''}`} disabled={status!=='live' || snap.finished || wait > 0 || cmd.isPending} onClick={() => send(me.objective, f)} data-testid={`button-form-${f}`}>{f}</button>)}</div>}
          <div className="gx-body" style={{ paddingTop: 0 }}><span className="mono" data-testid="text-command-cooldown">{wait > 0 ? `Cooldown ${(wait / 1000).toFixed(1)}s` : me ? 'Ready' : 'Watching only'}</span>{(err||leaveError) && <div className="status-line error" role="alert" data-testid="status-command-error">{err||leaveError}</div>}</div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Scoreboard</h2><span className="mono">Owner: {nameOf(snap.owner)}{snap.contested ? ' (contested)' : snap.guilds.some(g=>g.isBot)?' (AI opponent)':''}</span></div>
          {[...snap.guilds].sort((a, b) => b.score - a.score).map((g) => <div className="gw-score" key={g.id} data-testid={`row-score-${g.id}`}><span className="gw-dot" style={{ background: g.color }} /><span className="gx-grow">{g.name}{g.isBot?' · AI':''}</span><b className="rating">{Math.round(g.score)}</b></div>)}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Field</h2></div>
          <div className="gx-body" style={{ fontSize: 12, gap: 8 }}>
            {me && <div data-testid="text-my-hero">You: {me.classId} · {me.alive ? `${Math.round(me.hp)}/${me.maxHp} HP` : `dead, respawn ${Math.max(0, Math.ceil((me.respawnAt - snap.now) / 1000))}s`}{me.channel ? ` · channeling ${me.channel.kind}` : ''}</div>}
            <div data-testid="text-boss">Boss: {snap.boss.alive ? `${Math.round(snap.boss.hp)}/${snap.boss.maxHp} HP` : 'down'} · allegiance {nameOf(snap.boss.guildId)}{snap.boss.resurrected ? ' · reborn' : ''}</div>
            <div data-testid="text-banner">Banner: {snap.banner.carrier ? `carried by ${snap.entities.find((e) => e.id === snap.banner.carrier)?.name ?? 'unknown'}` : 'on the ground'}</div>
            {snap.structures.map((s) => <div key={s.id} data-testid={`row-structure-${s.id}`}>{s.kind} {s.id}: {Math.round(s.hp)}/{s.maxHp}{s.shield > 0 ? ` +${Math.round(s.shield)} shield` : ''}{s.occupant ? ` · held by ${snap.entities.find((e) => e.id === s.occupant)?.name ?? s.occupant}` : ''}
              <div className="gw-bar"><i style={{ width: `${Math.min(100, (s.hp / (s.maxHp || 1)) * 100)}%` }} /></div></div>)}
            {snap.ice && <div>Ice defender: {Math.round(snap.ice.hp)}/{snap.ice.maxHp}</div>}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Heroes</h2><span className="mono">{snap.entities.length}</span></div>
          <div className="gw-log" data-testid="list-heroes">{snap.entities.map((e) => <div key={e.id}>{e.name} · {e.classId} · {nameOf(e.guildId)} · {e.alive ? `${Math.round(e.hp)}/${e.maxHp}` : 'dead'}{e.towerId ? ` · tower ${e.towerId}` : ''}</div>)}</div>
        </section>
        <section className="panel"><div className="panel-head"><h2>Log</h2></div><div className="gw-log" data-testid="list-log">{[...snap.log].reverse().map((l, i) => <div key={i}>{l.text}</div>)}</div></section>
        <div className="gx-note" data-testid="text-disclosure">No payouts. {snap.combatVersion?.startsWith('arena-extracted:') ? 'Actual Arena class AI and equipped combat code run on the server. Full multi-guild spell parity and restart restoration are still under verification.' : 'Legacy room: simplified combat. New rooms use extracted Arena combat.'} Physical-phone performance and release capacity are not verified.</div>
      </aside>
    </div>}
    {rules && <Rules onClose={() => setRules(false)} />}
    {confirmLeave && <GuildDialog label="Leave room" testId="dialog-leave" onClose={() => setConfirmLeave(false)}><h2 className="display">Leave room</h2><p>Your hero leaves the battle.</p><div className="gx-actions"><button className="btn" onClick={() => setConfirmLeave(false)} data-testid="button-leave-cancel">Stay</button><button className="btn btn-primary" onClick={onLeave} data-testid="button-leave-confirm">Leave</button></div></GuildDialog>}
  </div>;
}

export default function GuildWars() {
  const qc = useQueryClient();
  const lobby = useGetGuildWarsLobby({ query: { queryKey: getGetGuildWarsLobbyQueryKey(), refetchInterval: 5000 } });
  const found = useGetGuildFoundation({ query: { queryKey: getGetGuildFoundationQueryKey(), refetchInterval: 10_000 } });
  const eco = useGetEconomy();
  const profile = useGetArenaProfile();
  const activeBuild = profile.data?.state.activeBuild as { heroes?: {classId:string;ability?:string;ultimate?:string;talents?:string[]}[];captainClass?:string;captainRacial?:string } | undefined;
  const owned = new Set((eco.data?.unlocks ?? []).filter((u) => u.kind === 'class').map((u) => u.itemId));
  const [classId, setClassId] = useState<GuildWarJoinInput['classId']>('warrior');
  const [heroIndex, setHeroIndex] = useState<number | undefined>();
  const equippedSlots=(activeBuild?.heroes??[]).map((hero,index)=>({hero,index})).filter(slot=>slot.hero.classId===classId);
  const selectedSlot=equippedSlots.find(slot=>slot.index===heroIndex)??equippedSlots[0];
  const joinData=(event:GuildWarJoinInput['event']):GuildWarJoinInput=>({classId,event,...(selectedSlot?{heroIndex:selectedSlot.index}:{})});
  const [watch, setWatch] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rules, setRules] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => { void qc.invalidateQueries({ queryKey: getGetGuildWarsLobbyQueryKey() }); }, [qc]);
  const join = useJoinGuildWar({ mutation: { onSuccess: (r) => { setErr(null); setWatch(r.roomId); refresh(); }, onError: (e) => setErr(errText(e)) } });
  const leave = useLeaveGuildWar({ mutation: { onSuccess: () => { setWatch(null); qc.setQueryData(getGetGuildWarsLobbyQueryKey(),(old:typeof lobby.data)=>old?{...old,activeRoomId:null}:old); refresh(); }, onError: (e) => setErr(errText(e)) } });
  useEffect(() => { const t = window.setInterval(() => setTick((n) => n + 1), 1000); return () => window.clearInterval(t); }, []);
  const d = lobby.data;
  const roomId = watch ?? d?.activeRoomId ?? null;
  const ref = useRef({ at: Date.now(), now: 0 });
  if (d && ref.current.now !== d.now) ref.current = { at: Date.now(), now: d.now };
  void tick;
  const serverNow = d ? ref.current.now + (Date.now() - ref.current.at) : 0;
  const meId = found.data?.playerId ?? null;

  if (roomId) return <div className="site gx-page"><SiteHeader signedIn />
    <Room key={roomId} roomId={roomId} meId={meId} leaving={leave.isPending} leaveError={err} onLeave={() => { if (watch && watch !== d?.activeRoomId) setWatch(null); else leave.mutate({ roomId }); }} /></div>;

  return <div className="site gx-page"><SiteHeader signedIn />
    <div className="shell">
      <div className="gx-head">
        <div><div className="eyebrow">Prototype · live rooms</div><h1 className="display">Guild <span>Wars</span></h1></div>
        <div className="gx-actions"><button className="btn" onClick={() => setRules(true)} data-testid="button-open-rules">Rule guide</button><Link href="/guilds" className="btn" data-testid="link-guilds">Guild hall</Link><Link href="/play" className="btn" data-testid="link-back-play">Back to play</Link></div>
      </div>
      {lobby.isLoading && <div className="gx-cols" data-testid="state-lobby-loading"><div className="skeleton" style={{ height: 300 }} /><div className="skeleton" style={{ height: 300 }} /></div>}
      {lobby.isError && !d && <div className="status-line error" style={{ marginTop: 22 }} data-testid="state-lobby-error">Could not load the lobby. <button className="btn btn-sm" onClick={() => void lobby.refetch()} data-testid="button-retry-lobby">Retry</button></div>}
      {d && !d.enabled && <div className="empty panel" style={{ marginTop: 24 }} data-testid="state-disabled"><strong>Lobby unavailable</strong>Guild Wars is enabled in development only.</div>}
      {d && d.enabled && <div className="gx-cols">
        <div className="gx-stack">
          <section className="panel"><div className="panel-head"><h2>Pick your hero</h2></div>
            <div className="gx-body"><div className="gw-classes">{CLASSES.map((c) => <button key={c.id} disabled={eco.isSuccess && !owned.has(c.id)} className={`gw-class ${classId === c.id ? 'on' : ''}`} aria-pressed={classId === c.id} onClick={() => {setClassId(c.id);setHeroIndex(undefined);}} data-testid={`button-class-${c.id}`}><img className="gw-class-portrait" src={`${import.meta.env.BASE_URL}class-portraits/${c.id}.jpg`} alt="" loading="lazy" /><strong>{c.name}</strong>{eco.isSuccess && !owned.has(c.id) && <span className="mono" data-testid={`text-locked-${c.id}`}>Locked</span>}<span>{c.rule}</span></button>)}</div>
              <div className="gx-note" data-testid="text-equipped-build">
                {profile.isPending?'Loading equipped character…':selectedSlot?<>
                  <label>Equipped character <select data-testid="select-war-character" aria-label="Equipped character slot" value={selectedSlot.index} onChange={e=>setHeroIndex(Number(e.target.value))}>
                    {equippedSlots.map(slot=><option key={slot.index} value={slot.index}>Squad slot {slot.index+1} · {classId}</option>)}
                  </select></label>
                  <div>Spell: {selectedSlot.hero.ability??'default'} · Ultimate: {selectedSlot.hero.ultimate??'default'} · Talent: {selectedSlot.hero.talents?.slice(0,1).join(', ')||'none'}</div>
                  {activeBuild?.captainClass===classId&&<div>Captain · Racial: {activeBuild.captainRacial??'none'}</div>}
                </>:profile.isError?'Could not load the equipped character. Try again before joining.':'No equipped squad slot for this class. It will use the standard Arena kit with no equipped talent or Captain racial.'}
              </div>{eco.isError && <div className="status-line error">Could not load owned classes; the server will still validate your pick.</div>}</div></section>
          <section className="panel"><div className="panel-head"><h2>Rooms</h2><span className="mono">{d.rooms.length} open</span></div>
            {d.rooms.length === 0 && <div className="empty"><strong>No rooms yet</strong>Join to have the server allocate one.</div>}
            {d.rooms.map((r) => <div className="gx-row" key={r.id} data-testid={`row-room-${r.id}`}><div className="gx-grow"><div className="player-name">{r.id}</div><div className="player-meta">{r.eventId} · {r.players} characters (includes AI) · {r.guilds} guilds · {r.finished ? 'finished' : `ends in ${fmt(r.endsAt - serverNow)}`}</div></div>
              <button className="btn btn-sm" onClick={() => setWatch(r.id)} data-testid={`button-watch-${r.id}`}>Watch</button></div>)}
          </section>
        </div>
        <div className="gx-stack">
          <section className="panel"><div className="panel-head"><h2>Next event</h2></div><div className="gx-body">
            <div className="display" style={{ fontSize: 44, color: '#efc563' }} data-testid="text-next-event">{d.scheduledOpen ? 'Open now' : `In ${fmt(d.scheduledStart - serverNow)}`}</div>
             <div className="player-meta">Server time {new Date(serverNow).toLocaleTimeString()}. Events start every 3 hours and last 20 minutes.</div>
            {err && <div className="status-line error" role="alert" data-testid="status-join-error">{err}</div>}
            <button className="btn btn-primary" disabled={profile.isPending||profile.isError||join.isPending || (eco.isSuccess && !owned.has(classId))} onClick={() => join.mutate({ data: joinData('practice') })} data-testid="button-join-practice">Join practice now</button>
             <div className="gx-note">Each room includes one AI guild, scaled to 1–5 distinct classes to match the largest human guild squad. AI counts toward the 5-guild / 25-character limits and receives no currency or items.</div>
            <button className="btn" disabled={profile.isPending||profile.isError||join.isPending || !d.scheduledOpen || (eco.isSuccess && !owned.has(classId))} onClick={() => join.mutate({ data: joinData('scheduled') })} data-testid="button-join-scheduled">{d.scheduledOpen ? 'Join scheduled event' : 'Scheduled event not open'}</button>
            {!found.data?.guilds.some((g) => g.members.some((m) => m.playerId === found.data?.playerId)) && !found.isLoading && <div className="gx-note">You are not in a guild. <Link href="/guilds" data-testid="link-find-guild" style={{ color: '#efc563' }}>Visit the guild hall</Link>.</div>}
          </div></section>
          <div className="gx-note" data-testid="text-disclosure">Unpublished prototype. New rooms use the larger 3D battlefield and extracted Arena combat with the selected server-held equipped character. Existing rooms keep their original rules. Full spell parity, restart effect restoration and physical-phone performance are still under verification. No payouts or economy changes.</div>
        </div>
      </div>}
    </div>
    {rules && <Rules onClose={() => setRules(false)} />}
  </div>;
}
