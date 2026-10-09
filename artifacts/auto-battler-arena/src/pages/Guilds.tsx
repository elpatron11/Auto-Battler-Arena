import { useState } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetGuildFoundationQueryKey, useActGuildFoundation, useGetGuildFoundation } from '@workspace/api-client-react';
import type { GuildActionInput } from '@workspace/api-client-react';
import { SiteHeader } from '../components/SiteHeader';
import { GuildDialog } from '../components/GuildDialog';
import { GuildInsignia } from '../components/GuildInsignia';
import '../guild.css';

const EMBLEMS = ['lion', 'raven', 'sword', 'oak', 'flame', 'moon'] as const;
type Emblem = typeof EMBLEMS[number];
type Confirm = { title: string; body: string; input: GuildActionInput } | null;

function Sigil({ emblem }: { emblem: string }) {
  return <div className="gx-sigil"><GuildInsignia emblem={emblem} /></div>;
}

export default function Guilds() {
  const qc = useQueryClient();
  const q = useGetGuildFoundation({ query: { queryKey: getGetGuildFoundationQueryKey(), refetchInterval: 10_000 } });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [name, setName] = useState('');
  const [emblem, setEmblem] = useState<Emblem>('lion');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editName, setEditName] = useState<string | null>(null);
  const [editEmblem, setEditEmblem] = useState<Emblem | null>(null);
  const act = useActGuildFoundation({
    mutation: {
      onSuccess: (data,variables) => { qc.setQueryData(getGetGuildFoundationQueryKey(), data); void qc.invalidateQueries({ queryKey: getGetGuildFoundationQueryKey() }); setMsg({ ok: true, text: 'Done.' }); setConfirm(null); if(variables.data.action==='create')setName('');setEditName(null);setEditEmblem(null); },
      onError: (e) => { setMsg({ ok: false, text: e instanceof Error ? e.message : 'That action was refused by the server.' }); setConfirm(null); },
    },
  });
  const run = (data: GuildActionInput) => { setMsg(null); act.mutate({ data }); };
  const f = q.data;
  const mine = f?.guilds.find((g) => g.members.some((m) => m.playerId === f.playerId));
  const isLeader = !!mine && mine.leaderId === f?.playerId;
  const busy = act.isPending;
  const memberIds = new Set(f?.guilds.flatMap((g) => g.members.map((m) => m.playerId)));
  const invited = new Set(f?.sentInvitations.filter((i) => i.guildId === mine?.id).map((i) => i.playerId));
  const invitable = f?.players.filter((p) => p.playerId !== f.playerId && !memberIds.has(p.playerId) && !invited.has(p.playerId)) ?? [];

  const PAGE = 20;
  const term = search.trim().toLowerCase();
  const matches = invitable.filter((p) => p.name.toLowerCase().includes(term));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = matches.slice(cur * PAGE, cur * PAGE + PAGE);

  return <div className="site gx-page">
    <SiteHeader signedIn />
    <div className="shell">
      <div className="gx-head">
        <div><div className="eyebrow">Guild hall</div><h1 className="display">Your <span>banner</span></h1></div>
        <div className="gx-actions">
          <Link href="/guild-wars" className="btn btn-primary" data-testid="link-guild-wars">Guild Wars prototype</Link>
          <Link href="/play" className="btn" data-testid="link-back-play">Back to play</Link>
        </div>
      </div>
      {msg && <div className={`status-line ${msg.ok ? '' : 'error'}`} style={{ marginTop: 18 }} role="status" data-testid="status-guild-message">{msg.text}</div>}
      {q.isLoading && <div className="gx-cols" data-testid="state-guilds-loading"><div className="skeleton" style={{ height: 320 }} /><div className="skeleton" style={{ height: 320 }} /></div>}
      {q.isError && !f && <div className="status-line error" style={{ marginTop: 22 }} data-testid="state-guilds-error">Could not load guilds. <button className="btn btn-sm" onClick={() => void q.refetch()} data-testid="button-retry-guilds">Retry</button></div>}
      {f && <div className="gx-cols">
        <div className="gx-stack">
          {mine ? <section className="panel" data-testid="panel-my-guild">
            <div className="panel-head"><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Sigil emblem={mine.emblem} /><div><div className="eyebrow">{isLeader ? 'You lead' : 'You belong to'}</div><h2 data-testid="text-my-guild-name">{mine.name}</h2></div></div><span className="mono">{mine.members.length}/10 · {mine.open ? 'open' : 'closed'}</span></div>
            {mine.members.map((m) => <div className="gx-row" key={m.playerId} data-testid={`row-member-${m.playerId}`}>
              <div className="player-avatar">{m.name.slice(0, 1).toUpperCase()}</div>
              <div className="gx-grow"><div className="player-name">{m.name}</div><div className="player-meta">{m.playerId === mine.leaderId ? 'Leader' : 'Member'}{m.playerId === f.playerId ? ' · you' : ''}</div></div>
              {isLeader && m.playerId !== f.playerId && <div className="gx-actions">
                <button className="btn btn-sm" disabled={busy} data-testid={`button-transfer-${m.playerId}`} onClick={() => setConfirm({ title: 'Transfer leadership', body: `Make ${m.name} the leader of ${mine.name}? You will lose leader powers.`, input: { action: 'transfer', guildId: mine.id, playerId: m.playerId } })}>Make leader</button>
                <button className="btn btn-sm gx-danger" disabled={busy} data-testid={`button-kick-${m.playerId}`} onClick={() => setConfirm({ title: 'Remove member', body: `Remove ${m.name} from ${mine.name}?`, input: { action: 'kick', guildId: mine.id, playerId: m.playerId } })}>Kick</button>
              </div>}
            </div>)}
            <div className="gx-body">
              {isLeader && mine.members.length > 1 && <div className="gx-note">You must transfer leadership before leaving a guild that still has members.</div>}
              <button className="btn gx-danger" disabled={busy || (isLeader && mine.members.length > 1)} data-testid="button-leave-guild" onClick={() => setConfirm({ title: 'Leave guild', body: `Leave ${mine.name}?${isLeader ? ' It will be disbanded as you are the only member.' : ''}`, input: { action: 'leave', guildId: mine.id } })}>Leave guild</button>
            </div>
          </section> : <section className="panel" data-testid="panel-no-guild"><div className="empty"><strong>No guild yet</strong>Found your own banner, or join an open guild below.</div></section>}

          <section className="panel" data-testid="panel-guild-directory">
            <div className="panel-head"><h2>All guilds</h2><span className="mono">{f.guilds.length} registered</span></div>
            {f.guilds.length === 0 && <div className="empty"><strong>Quiet halls</strong>No guild has been founded yet.</div>}
            {f.guilds.map((g) => <div className="gx-row" key={g.id} data-testid={`row-guild-${g.id}`}>
              <Sigil emblem={g.emblem} />
              <div className="gx-grow"><div className="player-name">{g.name}</div><div className="player-meta">{g.members.length}/10 members · {g.open ? 'open to join' : 'invite only'}</div></div>
              {!mine && <button className="btn btn-sm" disabled={busy || !g.open || g.members.length >= 10} data-testid={`button-join-${g.id}`} onClick={() => run({ action: 'join', guildId: g.id })}>{g.members.length >= 10 ? 'Full' : g.open ? 'Join' : 'Closed'}</button>}
            </div>)}
          </section>
        </div>

        <div className="gx-stack">
          {!mine && <section className="panel" data-testid="panel-create-guild">
            <div className="panel-head"><h2>Found a guild</h2></div>
            <form className="gx-body" onSubmit={(e) => { e.preventDefault(); run({ action: 'create', name: name.trim(), emblem }); }}>
              <label className="mono gx-label" htmlFor="gx-name">Name (3-24)</label>
              <input id="gx-name" className="form-field" minLength={3} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} data-testid="input-guild-name" />
              <div className="mono gx-label">Emblem</div>
              <div className="gx-emblems">{EMBLEMS.map((e) => <button type="button" key={e} className={emblem === e ? 'on' : ''} aria-pressed={emblem === e} onClick={() => setEmblem(e)} data-testid={`button-emblem-${e}`}><GuildInsignia emblem={e} size={16} /> {e}</button>)}</div>
              <button className="btn btn-primary" disabled={busy || name.trim().length < 3} data-testid="button-create-guild">Create guild</button>
            </form>
          </section>}

          {f.invitations.length > 0 && <section className="panel" data-testid="panel-invitations">
            <div className="panel-head"><h2>Invitations</h2></div>
            {f.invitations.map((i) => <div className="gx-row" key={i.guildId} data-testid={`row-invite-${i.guildId}`}>
              <div className="gx-grow"><div className="player-name">{i.guildName}</div><div className="player-meta">Expires {new Date(i.expiresAt).toLocaleString()}</div></div>
              <button className="btn btn-sm btn-primary" disabled={busy || !!mine} data-testid={`button-accept-${i.guildId}`} onClick={() => run({ action: 'accept', guildId: i.guildId })}>Accept</button>
              <button className="btn btn-sm" disabled={busy} data-testid={`button-decline-${i.guildId}`} onClick={() => run({ action: 'decline', guildId: i.guildId })}>Decline</button>
            </div>)}
          </section>}

          {isLeader && mine && <>
            <section className="panel" data-testid="panel-guild-settings">
              <div className="panel-head"><h2>Guild settings</h2></div>
              <div className="gx-body">
                <label className="mono gx-label" htmlFor="gx-rename">Name</label>
                <input id="gx-rename" className="form-field" minLength={3} maxLength={24} value={editName ?? mine.name} onChange={(e) => setEditName(e.target.value)} data-testid="input-rename-guild" />
                <div className="mono gx-label">Emblem</div>
                <div className="gx-emblems">{EMBLEMS.map((e) => <button type="button" key={e} className={(editEmblem ?? mine.emblem) === e ? 'on' : ''} onClick={() => setEditEmblem(e)} data-testid={`button-edit-emblem-${e}`}><GuildInsignia emblem={e} size={16} /> {e}</button>)}</div>
                <button className="btn btn-primary" disabled={busy || (editName ?? mine.name).trim().length < 3} data-testid="button-save-guild" onClick={() => { run({ action: 'update', guildId: mine.id, name: (editName ?? mine.name).trim(), emblem: editEmblem ?? (mine.emblem as Emblem), open: mine.open }); }}>Save name and emblem</button>
                <button className="btn" disabled={busy} data-testid="button-toggle-open" onClick={() => run({ action: 'update', guildId: mine.id, open: !mine.open })}>{mine.open ? 'Close to new members' : 'Open to new members'}</button>
              </div>
            </section>
            <section className="panel" data-testid="panel-invite">
              <div className="panel-head"><h2>Invite players</h2><span className="mono">{mine.members.length}/10</span></div>
              {f.sentInvitations.filter((i) => i.guildId === mine.id).map((i) => <div className="gx-row" key={i.playerId} data-testid={`row-sent-${i.playerId}`}>
                <div className="gx-grow"><div className="player-name">{f.players.find((p) => p.playerId === i.playerId)?.name ?? i.playerId}</div><div className="player-meta">Pending</div></div>
                <button className="btn btn-sm" disabled={busy} data-testid={`button-revoke-${i.playerId}`} onClick={() => run({ action: 'revoke', guildId: mine.id, playerId: i.playerId })}>Revoke</button>
              </div>)}
              <div className="gx-body" style={{ paddingBottom: 0 }}><label className="mono gx-label" htmlFor="gx-search">Search players ({invitable.length})</label><input id="gx-search" className="form-field" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} data-testid="input-search-players" /></div>
              {matches.length === 0 && <div className="empty">{invitable.length === 0 ? 'No uninvited unguilded players.' : 'No players match that search.'}</div>}
              {shown.map((p) => <div className="gx-row" key={p.playerId} data-testid={`row-player-${p.playerId}`}>
                <div className="gx-grow"><div className="player-name">{p.name}</div></div>
                <button className="btn btn-sm" disabled={busy || mine.members.length >= 10} data-testid={`button-invite-${p.playerId}`} onClick={() => run({ action: 'invite', guildId: mine.id, playerId: p.playerId })}>Invite</button>
              </div>)}
              {pages > 1 && <div className="gx-row"><button className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} data-testid="button-players-prev">Previous</button><span className="mono gx-grow" data-testid="text-players-page">Page {cur + 1} of {pages}</span><button className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} data-testid="button-players-next">Next</button></div>}
            </section>
          </>}
        </div>
      </div>}
    </div>
    {confirm && <GuildDialog label={confirm.title} testId="dialog-confirm" onClose={() => setConfirm(null)}>
      <h2 className="display">{confirm.title}</h2><p>{confirm.body}</p>
      <div className="gx-actions"><button className="btn" onClick={() => setConfirm(null)} data-testid="button-confirm-cancel">Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => run(confirm.input)} data-testid="button-confirm-ok">Confirm</button></div>
    </GuildDialog>}
  </div>;
}
