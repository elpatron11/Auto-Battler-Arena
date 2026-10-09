import { useState } from 'react';
import { Crown, X } from 'lucide-react';
import { useGetArenaLeaderboard } from '@workspace/api-client-react';
import { ArenaRankBadge } from '../components/ArenaRankBadge';
import { QueryState } from '../components/QueryState';
import './ArenaGame.css';

export default function ArenaLeaderboard({ onClose }: { onClose?: () => void }) {
  const [teamSize, setTeamSize] = useState<2 | 3>(3);
  const q = useGetArenaLeaderboard({ teamSize });
  return <div className="arena-game" data-testid="section-arena-leaderboard">
    <section className="ag-panel">
      <div className="ag-panel-head"><div><h2 className="ag-panel-title"><Crown size={17} /> Arena leaderboard</h2><p className="ag-hint">Read-only ranked ladders</p></div>
        <div className="ag-actions" role="tablist" aria-label="Ladder">
          {([3, 2] as const).map(n => <button key={n} role="tab" aria-selected={teamSize === n} className={`ag-button ag-button-small ${teamSize === n ? 'ag-button-active' : ''}`} onClick={() => setTeamSize(n)} data-testid={`tab-leaderboard-${n}s`}>Arena {n}s</button>)}
          {onClose && <button className="ag-button ag-button-small" onClick={onClose} data-testid="button-close-leaderboard"><X size={13} /> Close</button>}
        </div></div>
      {q.isLoading ? <QueryState label="Loading leaderboard" /> : q.isError ? <QueryState error retry={() => void q.refetch()} /> :
        !q.data?.length ? <div className="ag-empty" data-testid="status-leaderboard-empty"><strong>No ranked players yet</strong>Arena {teamSize}s has no published defenses.</div> :
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>{q.data.map((p, i) => <li className="ag-player" key={p.playerId} data-testid={`row-leaderboard-${p.playerId}`}>
          <div className="ag-avatar">{String(i + 1).padStart(2, '0')}</div>
          <div className="ag-player-detail"><div className="ag-player-name">{p.name} {p.isBot && <span className="arena-bot-badge">BOT</span>}</div><div className="ag-player-meta">{p.wins}W · {p.losses}L</div></div>
          <span className="ag-rating"><ArenaRankBadge rating={p.rating} /></span>
        </li>)}</ol>}
    </section>
  </div>;
}
