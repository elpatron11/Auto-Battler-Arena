import { useEffect, useState } from 'react';
import { Pager } from '../components/Pager';
import { paginate } from '../lib/pagination';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Crown, RefreshCw, ShieldCheck, Swords, ScrollText, UserRound } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import {
  getGetArenaLeaderboardQueryKey, getGetArenaProfileQueryKey, getGetArenaPublicProfileQueryKey, getListArenaChallengesQueryKey, getListArenaOpponentRecordsQueryKey, getListArenaPlayersQueryKey, getSearchArenaProfilesQueryKey,
  useCreateArenaChallenge, useGetArenaLeaderboard, useGetArenaProfile, useGetArenaPublicProfile, useListArenaChallenges, useListArenaPlayers,
  usePublishArenaDefense, useSaveArenaProfile
} from '@workspace/api-client-react';
import type { ArenaPlayer } from '@workspace/api-client-react';
import { SiteHeader } from '../components/SiteHeader';
import { MatchDetail } from '../components/MatchDetail';
import { ArenaHeadToHead } from '../components/ArenaHeadToHead';
import { FeatureMatchButton, ProfileSearch } from '../components/ArenaSocial';
import { QueryState } from '../components/QueryState';
import { ArenaRankBadge, ArenaRankGuide } from '../components/ArenaRankBadge';
import ArenaRewards from '../components/ArenaRewards';
import { readAttack, saveTicket } from '../lib/arena';
import { gameErrorMessage } from '../lib/gameError';
import './ArenaGame.css';

function initials(name:string) { return name.split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase(); }
function PlayerList({players, onChallenge, busy, ranks,teamSize=3}: {teamSize?:2|3;ranks:number[];players:ArenaPlayer[];onChallenge:(player:ArenaPlayer)=>void;busy:boolean}) {
  if (!players.length) return <div className="ag-empty" data-testid="status-no-players"><strong>No defenses in sight</strong>Prepare your squad while other challengers publish defenses.</div>;
  return <div>{players.map((player,index)=><div className="ag-player" key={player.playerId} data-testid={`row-player-${player.playerId}`}>
    <div className="ag-avatar">{initials(player.name)}</div>
    <div className="ag-player-detail"><div className="ag-player-name">{player.isBot ? player.name : <Link href={`/arena/profiles/${encodeURIComponent(player.playerId)}${teamSize===2?'?teamSize=2':''}`} data-testid={`link-player-profile-${player.playerId}`}>{player.name}</Link>} {player.isBot && <span className="arena-bot-badge">BOT</span>}</div><div className="ag-player-meta">{ranks[index]+1 < 10 ? `0${ranks[index]+1}`:ranks[index]+1} / {player.wins}W · {player.losses}L · Defense ready</div></div>
    <span className="ag-rating" data-testid={`text-rating-${player.playerId}`}><ArenaRankBadge rating={player.rating}/></span>
    <button className="ag-button ag-button-small" onClick={()=>onChallenge(player)} disabled={busy} data-testid={`button-challenge-${player.playerId}`}><Swords size={13}/> Challenge</button>
  </div>)}</div>;
}

type ArenaProps = { embedded?: boolean; onClose?: () => void; onOpenPlay?: () => void; teamSize?:2|3 };

export default function Arena({embedded = false, onClose, onOpenPlay, teamSize = Array.isArray(readAttack()?.heroes) && (readAttack()?.heroes as unknown[]).length===2 ? 2 : 3}: ArenaProps) {
  const [,navigate] = useLocation();
  const queryClient = useQueryClient();
  const baseProfile=useGetArenaProfile();
  const mode={teamSize};
  const profileQuery = useGetArenaProfile(mode);
  const activeId=readAttack()?.squadId;
  const squads=profileQuery.data?.state.squadRatings as Record<string,{rating:number;wins:number;losses:number}>|undefined;
  const activeRank=squads?.[`${teamSize}:${typeof activeId==='string'?activeId:'current'}`]||
    (activeId?{rating:1000,wins:0,losses:0}:null);
  const profile={...profileQuery,data:profileQuery.data&&activeRank?{...profileQuery.data,...activeRank}:profileQuery.data};
  const publicProfile = useGetArenaPublicProfile(profile.data?.playerId ?? '',mode,{query:{enabled:!!profile.data?.playerId,queryKey:getGetArenaPublicProfileQueryKey(profile.data?.playerId ?? '',mode)}});
  const players = useListArenaPlayers(mode);
  const leaderboard = useGetArenaLeaderboard(mode);
  const challenges = useListArenaChallenges(mode);
  const saveProfile = useSaveArenaProfile();
  const publish = usePublishArenaDefense();
  const create = useCreateArenaChallenge();
  const [rewardsOpen,setRewardsOpen] = useState(false);
  const [tab,setTab] = useState<'discover'|'leaderboard'>('discover');
  const [pages,setPages] = useState({discover:1,leaderboard:1,history:1});
  const [selectedMatch,setSelectedMatch] = useState<string | null>(null);
  const [name,setName] = useState<string | null>(null);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const activeName = name ?? profile.data?.name ?? '';
  const defense = profile.data?.state?.defenseTeam;
  const hasDefense = !!defense && typeof defense === 'object' && !Array.isArray(defense);
  const shown = tab==='discover' ? players : leaderboard;
  const ranked = (shown.data||[]).map((p,i)=>({p,rank:i})).filter(x=>x.p.playerId!==profile.data?.playerId);
  const listPage = paginate(ranked, pages[tab]);
  const historyPage = paginate(challenges.data ?? [], pages.history);
  const setPage = (key:'discover'|'leaderboard'|'history', n:number) => setPages(prev=>({...prev,[key]:n}));
  useEffect(()=>{ setPages(prev=>{const n={discover:prev.discover,leaderboard:prev.leaderboard,history:prev.history};if(tab==='discover'||tab==='leaderboard')n[tab]=listPage.page;n.history=historyPage.page;return n.discover===prev.discover&&n.leaderboard===prev.leaderboard&&n.history===prev.history?prev:n;}); },[tab,listPage.page,historyPage.page]);
  const recentWins = challenges.data?.filter(match=>match.outcome==='win').slice(0,6) ?? [];
  const attackReady = Array.isArray(readAttack()?.heroes) && (readAttack()?.heroes as unknown[]).length === teamSize;
  const openPlay = () => {
    if (create.isPending) return;
    if (embedded) onOpenPlay?.();
    else navigate('/play');
  };

  const refresh = () => {
    void Promise.all([profile.refetch(),publicProfile.refetch(),players.refetch(),leaderboard.refetch(),challenges.refetch()]);
    void queryClient.invalidateQueries({queryKey:getSearchArenaProfilesQueryKey()});
    void queryClient.invalidateQueries({queryKey:getListArenaOpponentRecordsQueryKey()});
    setMessage('Looking for the latest arena activity…');setError('');
  };
  const publishDefense = () => {
    const attack=readAttack();
    const candidate=Array.isArray(attack?.heroes)&&(attack?.heroes as unknown[]).length===teamSize ? attack : defense;
    if(!candidate || typeof candidate!=='object' || !Array.isArray((candidate as Record<string,unknown>).heroes) ||
      ((candidate as Record<string,unknown>).heroes as unknown[]).length!==teamSize){
      setError(`Select a complete ${teamSize}v${teamSize} squad first.`);return;
    }
    setError('');setMessage('');
    publish.mutate({data:{defense:candidate as Record<string,unknown>}}, {
      onSuccess:() => {
        setMessage('Defense published. Your squad now stands guard.');
        queryClient.invalidateQueries({queryKey:getGetArenaProfileQueryKey()});
        queryClient.invalidateQueries({queryKey:getListArenaPlayersQueryKey()});
        queryClient.invalidateQueries({queryKey:getGetArenaLeaderboardQueryKey()});
        if (profile.data?.playerId) void queryClient.invalidateQueries({queryKey:getGetArenaPublicProfileQueryKey(profile.data.playerId)});
        void queryClient.invalidateQueries({queryKey:getSearchArenaProfilesQueryKey()});
      },
      onError:()=>setError('Your defense could not be published. Please try again.')
    });
  };
  const saveName = () => {
    const trimmed = activeName.trim();
    if (!profile.data || !baseProfile.data || !/^[\p{L}\p{M}\p{N} _.'-]{2,32}$/u.test(trimmed)) {setError('Use 2–32 letters, numbers, spaces, dots, apostrophes, underscores, or hyphens.');return;}
    setError('');setMessage('');
    saveProfile.mutate({data:{name:trimmed,state:baseProfile.data.state}},{
      onSuccess:(updated)=>{setName(null);queryClient.setQueryData(getGetArenaProfileQueryKey(),updated);void queryClient.invalidateQueries({queryKey:getGetArenaProfileQueryKey()});void queryClient.invalidateQueries({queryKey:getGetArenaPublicProfileQueryKey(updated.playerId)});void queryClient.invalidateQueries({queryKey:getSearchArenaProfilesQueryKey()});setMessage('Challenger name updated.');},
      onError:()=>setError('Name could not be saved. Please try again.')
    });
  };
  const issueChallenge = (opponent?:ArenaPlayer) => {
    const attack = readAttack();
    if (!attack || !Array.isArray(attack.heroes) || attack.heroes.length !== teamSize) {
      setError(`Prepare a complete ${teamSize}v${teamSize} squad in Play before issuing a challenge.`);return;
    }
    setError('');setMessage(opponent ? `Issuing challenge to ${opponent.name}…` : 'Finding a random opponent…');
    const key = `arena:challenge-request:${teamSize}:${opponent?.playerId ?? 'random'}`;
    const serialized = JSON.stringify(attack);
    let previous: {attack:string;requestId:string} | null = null;
    try { previous = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { /* replace invalid cache */ }
    const requestId = previous?.attack === serialized && /^[0-9a-f-]{36}$/i.test(previous.requestId)
      ? previous.requestId : crypto.randomUUID();
    sessionStorage.setItem(key, JSON.stringify({attack:serialized,requestId}));
    create.mutate({data:{requestId,...(opponent ? {opponentId:opponent.playerId} : {}),attack}},{
      onSuccess:(ticket)=>{sessionStorage.removeItem(key);saveTicket(ticket);openPlay();},
      onError:(cause)=>{
        setMessage('');
        setError(gameErrorMessage(cause, 'challenge'));
      }
    });
  };

  return <div className="arena-game">
    {!embedded && <SiteHeader signedIn/>}
    <main>
       {embedded && <div className="ag-backbar"><button className="ag-back" onClick={()=>onClose ? onClose() : navigate('/play')} disabled={create.isPending || publish.isPending || saveProfile.isPending} data-testid="button-arena-main-menu"><ArrowLeft size={14}/> Main Menu</button><span className="ag-backnote">ONLINE ARENA</span></div>}
      <div className="ag-frame">
        <div style={{display:'flex',justifyContent:'flex-end',padding:'10px 18px 0'}}><button className="ag-button ag-button-small ag-button-active" onClick={()=>setRewardsOpen(true)} aria-haspopup="dialog" data-testid="button-arena-rewards">Rewards · unlocks by class</button></div>
        {rewardsOpen && <ArenaRewards onClose={()=>setRewardsOpen(false)}/>}
        <header className="ag-hero"><div className="ag-hero-art" aria-hidden="true" style={{backgroundImage:`url(${import.meta.env.BASE_URL}arena-key-art.png)`}}/><div className="ag-hero-copy"><div className="ag-eyebrow">Arena command / Separate ranked ladders</div><h1 data-testid="text-arena-mode">Ranked {teamSize}v{teamSize}</h1><p>Fight a published {teamSize}-hero defense. Your {teamSize}v{teamSize} rank and record are independent of the other ladder.</p><div className="ag-hero-actions"><button className="ag-button ag-button-primary ag-random-fight" onClick={()=>issueChallenge()} disabled={create.isPending} data-testid="button-random-opponent"><Swords size={19}/> {create.isPending ? 'Finding opponent…' : 'Fight random opponent'}</button><button className="ag-button ag-button-small" onClick={refresh} data-testid="button-refresh-arena" aria-label="Refresh arena"><RefreshCw size={15}/> Refresh</button></div></div></header>
        <div className="ag-body">
          <div className="ag-top">
              {profile.isLoading ? <div className="ag-card ag-card-profile ag-compact"><QueryState label="Loading challenger profile"/></div> : profile.isError ? <div className="ag-card ag-card-profile ag-compact"><QueryState error retry={()=>profile.refetch()}/></div> : profile.data && <>
                <section className="ag-card ag-card-profile ag-compact"><span className="ag-card-icon"><UserRound size={20}/></span><span className="ag-eyebrow">Challenger dossier</span><h2 data-testid="text-profile-name">{profile.data.name}</h2><Link href={`/arena/profiles/${encodeURIComponent(profile.data.playerId)}${teamSize===2?'?teamSize=2':''}`} className="ag-side-link" data-testid="link-own-profile">View {teamSize}v{teamSize} public profile <ArrowRight size={13}/></Link><div style={{margin:'8px 0'}}><ArenaRankBadge rating={profile.data.rating} className="arb-lg" testId="badge-own-rank"/></div><div className="ag-stats"><div><strong data-testid="text-profile-rating">{profile.data.rating}</strong><small>Rating</small></div><div><strong data-testid="text-profile-wins">{profile.data.wins}</strong><small>Arenas won</small></div><div><strong data-testid="text-profile-losses">{profile.data.losses}</strong><small>Defeats</small></div></div><div className="ag-wins"><h3>Recent wins against</h3>{recentWins.length ? <p data-testid="text-win-opponents">{recentWins.map(match=>match.opponentName).join(' · ')}</p> : <p data-testid="text-win-opponents">No recent arena victories yet.</p>}</div><label className="ag-name-label" htmlFor="arena-name">Arena name</label><div className="ag-name-row"><input id="arena-name" value={activeName} onChange={e=>setName(e.target.value)} maxLength={32} data-testid="input-arena-name"/><button className="ag-button ag-button-small" onClick={saveName} disabled={saveProfile.isPending || activeName.trim()===profile.data.name} data-testid="button-save-name">{saveProfile.isPending?'Saving…':'Save'}</button></div></section>
            <section className="ag-card ag-card-defense ag-compact"><span className="ag-card-icon"><ShieldCheck size={20}/></span><h2>Your {teamSize}v{teamSize} public defense</h2><p>{profile.data.defensePublished ? `On guard${profile.data.defenseUpdatedAt ? ' · Updated '+new Date(profile.data.defenseUpdatedAt).toLocaleString() : ''}. Save your selected squad here to update only this ladder’s defense.` : 'Save your selected squad as a defense so other challengers can find you. The other ladder’s defense stays unchanged.'}</p><button className="ag-button ag-button-primary" onClick={publishDefense} disabled={(!attackReady && !hasDefense) || publish.isPending} data-testid="button-publish-defense">{publish.isPending?'Saving…':`Save current ${teamSize}v${teamSize} defense`} <ArrowRight size={14}/></button>{!attackReady && (embedded ? <button className="ag-button" onClick={openPlay} data-testid="link-build-defense">Build a defense</button> : <Link href="/play" className="ag-button" data-testid="link-build-defense">Build a defense</Link>)}</section>
              </>}
</div>
           <div className="ag-team-bar"><span><strong>YOUR {teamSize}v{teamSize} SQUAD</strong> · {attackReady ? `${teamSize} heroes ready for battle` : `Prepare a ${teamSize}-hero attack team before you challenge`}</span><button onClick={openPlay} disabled={create.isPending} data-testid="link-edit-squad">Edit your squad <ArrowRight size={11} style={{display:'inline'}}/></button></div>
          {(message || error) && <div className={`ag-feedback ${error?'is-error':''}`} role={error?'alert':'status'} data-testid="status-arena-action">{error || message}</div>}
            <ProfileSearch teamSize={teamSize}/>
          <section className="ag-panel">
            <div className="ag-panel-head"><div><h2 className="ag-panel-title"><ScrollText size={17}/> Battle record</h2><p className="ag-hint">Incoming / Outgoing · Every clash counts</p></div></div>
             <ArenaHeadToHead teamSize={teamSize}/>
             {publicProfile.isLoading && <div className="arena-social" aria-label="Loading replay favorites"><div className="social-skeleton" style={{height:34}}/></div>}
             {publicProfile.isError && <div className="ag-feedback is-error" role="alert" data-testid="status-replay-save-error">Replay favorites are unavailable. <button className="ag-button ag-button-small" onClick={()=>void publicProfile.refetch()} data-testid="button-retry-replay-favorites">Try again</button></div>}
             {challenges.isLoading ? <QueryState/> : challenges.isError ? <QueryState error retry={()=>challenges.refetch()}/> : !challenges.data?.length ? <div className="ag-empty" data-testid="status-no-challenges"><strong>Your story starts here</strong>Your first challenge will write the opening line of your battle record.</div> : <div><p className="ag-hint" data-testid="text-history-scope">Showing your {challenges.data.length} most recent fights retrieved (latest 50 at most), not an all-time record.</p>{historyPage.items.map(item=><div key={item.id}><button className="ag-history" onClick={()=>setSelectedMatch(selectedMatch===item.id?null:item.id)} disabled={!item.outcome} aria-expanded={selectedMatch===item.id} aria-controls={`match-${item.id}`} data-testid={`row-challenge-${item.id}`}><span className={`ag-outcome ${item.outcome||''}`}>Ranked {item.outcome || 'Pending'}</span><div><strong>{item.direction==='incoming'?'Defended vs':'Attacked'} {item.opponentName}</strong><div className="ag-player-meta">{new Date(item.createdAt).toLocaleString()} · {item.direction}{item.direction==='outgoing' && item.localOutcome ? ` · Your fight: ${item.localOutcome}` : ''}{item.hasRecording ? ' · Replay saved' : ''}</div></div><span className="ag-rating">{item.outcome ? `${item.ratingDelta>=0?'+':''}${item.ratingDelta} RP` : '—'} {item.outcome ? selectedMatch===item.id?'−':'+' : ''}</span></button>{item.hasRecording && profile.data?.playerId && !publicProfile.isLoading && !publicProfile.isError && <div style={{padding:'3px 12px 10px'}}><FeatureMatchButton id={item.id} featured={!!publicProfile.data?.featuredMatches.some(match=>match.id===item.id)} count={publicProfile.data?.featuredMatches.length ?? 0} playerId={profile.data.playerId}/></div>}{selectedMatch===item.id && item.outcome && <div className="ag-replay" id={`match-${item.id}`}><MatchDetail id={item.id}/></div>}</div>)}<Pager page={historyPage.page} pages={historyPage.pages} total={historyPage.total} label="Battle record" onPage={n=>setPage('history',n)} testId="history"/></div>}
            <p className="ag-footnote">For new challenges, RP is awarded after your fight ends using the result reported by your game. Older challenges were scored separately and may show a different result.</p>
          </section>
          <div className="ag-grid">
            <div className="ag-stack">
              <section className="ag-panel">
                <div className="ag-panel-head"><div><h2 className="ag-panel-title"><Crown size={17}/> Published challengers</h2><p className="ag-hint">Choose someone specific · 3 fights per UTC day</p></div><div className="ag-actions"><button className={`ag-button ag-button-small ${tab==='discover'?'ag-button-active':''}`} onClick={()=>{setTab('discover');setPage('discover',1);}} data-testid="button-discover">Discover</button><button className={`ag-button ag-button-small ${tab==='leaderboard'?'ag-button-active':''}`} onClick={()=>{setTab('leaderboard');setPage('leaderboard',1);}} data-testid="button-leaderboard"><Crown size={12}/> Ranks</button></div></div>
                {shown.isLoading ? <QueryState/> : shown.isError ? <QueryState error retry={()=>shown.refetch()}/> : <><PlayerList teamSize={teamSize} ranks={listPage.items.map(x=>x.rank)} players={listPage.items.map(x=>x.p)} onChallenge={issueChallenge} busy={create.isPending}/><Pager page={listPage.page} pages={listPage.pages} total={listPage.total} label={tab==='discover'?'Challengers':'Ranks'} onPage={n=>setPage(tab,n)} testId={`players-${tab}`}/></>}
              </section>
            </div>
            <aside className="ag-stack">
              <div className="ag-card ag-card-gold"><span className="ag-eyebrow">Before you challenge</span><p style={{marginTop:8}}>Your attack uses the {teamSize}-hero squad you assembled in Play. A defense stays hidden until your battle begins.</p>{embedded ? <button className="ag-side-link" onClick={openPlay} data-testid="link-edit-squad-card">Edit your squad</button> : <Link href="/play" className="ag-side-link" data-testid="link-edit-squad-card">Edit your squad</Link>}</div>
              <ArenaRankGuide/>
            </aside>
          </div>
        </div>
      </div>
    </main>
  </div>;
}
