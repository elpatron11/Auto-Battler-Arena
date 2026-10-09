import { useGetArenaChallenge } from '@workspace/api-client-react';
import type { ArenaHeroStats } from '@workspace/api-client-react';
import { QueryState } from './QueryState';
import { SnapshotReplay } from './SnapshotReplay';
import { ReplayVideo } from './ReplayVideo';
import './match-detail.css';

type HeroBuild = { classId: string; ability?: string; ultimate?: string };

function heroesIn(snapshot: Record<string, unknown>): HeroBuild[] {
  if (!Array.isArray(snapshot.heroes)) return [];
  return snapshot.heroes.filter((hero): hero is HeroBuild =>
    !!hero && typeof hero === 'object' && typeof hero.classId === 'string');
}

function className(id: string) {
  return id.replace(/[_-]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function format(value: number) {
  return Math.round(value).toLocaleString();
}

function TeamStats({ label, builds, stats, maxDamage, maxHealing }: {
  label: string;
  builds: HeroBuild[];
  stats: ArenaHeroStats[] | undefined;
  maxDamage: number;
  maxHealing: number;
}) {
  return <div className="match-team">
    <h4>{label}</h4>
    {builds.map((hero, index) => {
      const result = stats?.[index] ?? stats?.find(item => item.classId === hero.classId);
      return <article className="match-hero" key={`${hero.classId}-${index}`}>
        <div className="match-hero-head"><strong>{className(hero.classId)}</strong>{result && <span>{result.kills} kills · {result.deaths} deaths · {result.assists} assists</span>}</div>
        <div className="match-build">
          {hero.ability && <span>Spell: {className(hero.ability)}</span>}
          {hero.ultimate && <span>Ultimate: {className(hero.ultimate)}</span>}
        </div>
        {result && <>
          <div className="match-meter-label"><span>Damage</span><b>{format(result.damage)}</b></div>
          <div className="match-meter"><span style={{width:`${Math.min(100, result.damage / maxDamage * 100)}%`}} /></div>
          <div className="match-meter-label"><span>Healing</span><b>{format(result.healing)}</b></div>
          <div className="match-meter heal"><span style={{width:`${Math.min(100, result.healing / maxHealing * 100)}%`}} /></div>
          <div className="match-hero-more">
            <span>Control {result.cc.toFixed(1)}s</span>
            <span>Prevented {format(result.prevented)}</span>
            <span>Shielding {format(result.shielding)}</span>
            <span>Reflected {format(result.reflected)}</span>
            <span>AoE {format(result.aoe)}</span>
            <span>DoT {format(result.dot)}</span>
            <span>Pet {format(result.pet)}</span>
            <span>Self-heal {format(result.selfHeal)}</span>
            <span>Survived {result.survival.toFixed(1)}s</span>
          </div>
        </>}
      </article>;
    })}
  </div>;
}

export function MatchDetail({ id }: { id: string }) {
  const match = useGetArenaChallenge(id);
  if (match.isLoading) return <div className="match-detail"><QueryState label="Loading match details"/></div>;
  if (match.isError || !match.data) return <div className="match-detail"><QueryState error retry={() => match.refetch()}/></div>;
  const detail = match.data;
  const outgoing = detail.direction === 'outgoing';
  const yourBuilds = heroesIn(outgoing ? detail.attack : detail.defense);
  const otherBuilds = heroesIn(outgoing ? detail.defense : detail.attack);
  const yourStats = outgoing ? detail.summary?.player : detail.summary?.enemy;
  const otherStats = outgoing ? detail.summary?.enemy : detail.summary?.player;
  const allStats = [...(yourStats ?? []), ...(otherStats ?? [])];
  const maxDamage = Math.max(1, ...allStats.map(hero => hero.damage));
  const maxHealing = Math.max(1, ...allStats.map(hero => hero.healing));
  return <div className="match-detail" role="region" aria-label={`Match against ${detail.opponentName}`}>
    <div className="match-detail-head">
      <div><span className="eyebrow">Ranked result · affects rating</span><h3>{detail.outcome === 'win' ? 'Victory' : detail.outcome === 'loss' ? 'Defeat' : 'Draw'} vs {detail.opponentName}</h3><p className="muted" style={{fontSize:12,margin:'6px 0 0'}}>Your visible fight: {outgoing ? detail.localOutcome ?? 'not recorded yet' : 'opponent’s fight is not available'}{outgoing && detail.localOutcome && detail.localOutcome !== detail.outcome ? ' · Older match: scored under the previous rules.' : ''}</p></div>
      <span className="mono muted">{detail.summary ? `${Math.floor(detail.summary.durationSeconds / 60)}:${String(Math.floor(detail.summary.durationSeconds % 60)).padStart(2, '0')} battle` : new Date(detail.createdAt).toLocaleDateString()}</span>
    </div>
    <p className="muted">New ranked matches use the reported result of the fight you played. Fight statistics and replays are supplied by the game; older matches may have been scored under separate server rules.</p>
    <div className="match-teams">
      <TeamStats label="Your team" builds={yourBuilds} stats={yourStats} maxDamage={maxDamage} maxHealing={maxHealing}/>
      <TeamStats label={`${detail.opponentName}'s team`} builds={otherBuilds} stats={otherStats} maxDamage={maxDamage} maxHealing={maxHealing}/>
    </div>
    {!detail.summary && <p className="muted match-legacy">This match predates saved combat statistics. New fights will include final damage and healing meters.</p>}
    {detail.hasRecording
      ? <div className="match-replay"><h4>Watch this fight again</h4>
          {detail.recordingContentType === 'application/vnd.arena.replay+json'
            ? <SnapshotReplay id={id} opponentName={detail.opponentName}/>
            : <ReplayVideo id={id} opponentName={detail.opponentName} contentType={detail.recordingContentType}/>}
        </div>
      : <p className="muted match-legacy">No replay was saved for this fight. The capture or upload may not have completed.</p>}
  </div>;
}