import { Pager } from './Pager';
import { paginate } from '../lib/pagination';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bookmark, BookmarkCheck, Search } from 'lucide-react';
import { Link } from 'wouter';
import { getGetArenaPublicProfileQueryKey, getListArenaChallengesQueryKey, useFeatureArenaMatch, useSearchArenaProfiles, useUnfeatureArenaMatch } from '@workspace/api-client-react';
import { ArenaRankBadge } from './ArenaRankBadge';
import { gameErrorMessage } from '../lib/gameError';
import './arena-social.css';

export function ProfileSearch({teamSize=3}:{teamSize?:2|3}) {
  const [input,setInput] = useState('');
  const [search,setSearch] = useState('');
  useEffect(() => { const timer = window.setTimeout(()=>setSearch(input.trim()),250);return ()=>window.clearTimeout(timer); },[input]);
  const results = useSearchArenaProfiles({search,teamSize});
  const [page,setPage] = useState(1);
  useEffect(()=>{setPage(1);},[search]);
  const view = paginate(results.data ?? [], page);
  useEffect(()=>{ if (view.page !== page) setPage(view.page); },[view.page,page]);
  return <section className="ag-panel arena-social" aria-label="Find arena players">
    <div className="ag-panel-head"><div><h2 className="ag-panel-title"><Search size={17}/> Find a challenger</h2><p className="ag-hint">Search every player's dossier, even if their defense is not published.</p></div></div>
    <label className="social-search"><Search size={17}/><input aria-label="Search player profiles" data-testid="input-search-profiles" value={input} onChange={event=>setInput(event.target.value)} placeholder="Search by challenger name" maxLength={64}/></label>
    {results.isLoading ? <div aria-label="Loading player profiles"><div className="social-skeleton"/><div className="social-skeleton"/></div>
      : results.isError ? <div className="social-message error" role="alert">Could not find player profiles. <button className="social-button subtle" onClick={()=>void results.refetch()} data-testid="button-retry-profile-search">Try again</button></div>
      : !results.data?.length ? <div className="social-empty" data-testid="status-profile-search-empty"><strong>No challengers found</strong>{search ? 'Try another spelling or a shorter name.' : 'No player profiles have appeared yet.'}</div>
      : <div className="social-search-results">{view.items.map(player=><Link key={player.playerId} href={`/arena/profiles/${encodeURIComponent(player.playerId)}${teamSize===2?'?teamSize=2':''}`} className="social-person" data-testid={`link-profile-search-${player.playerId}`}>
        <span className="social-monogram">{player.name.slice(0,2).toUpperCase()}</span><span className="social-person-info"><strong>{player.name}</strong><ArenaRankBadge rating={player.rating}/><small>{player.wins} W / {player.losses} L · {player.defensePublished ? 'Defense ready' : 'No defense'}</small></span><ArrowRight className="social-chevron" size={15}/>
      </Link>)}<Pager page={view.page} pages={view.pages} total={view.total} label="Challenger search" onPage={setPage} testId="profile-search"/></div>}
  </section>;
}

export function FeatureMatchButton({id,featured,count,playerId}:{id:string;featured:boolean;count:number;playerId:string}) {
  const client = useQueryClient();
  const feature = useFeatureArenaMatch();
  const unfeature = useUnfeatureArenaMatch();
  const [error,setError] = useState('');
  const busy = feature.isPending || unfeature.isPending;
  const change = () => {
    setError('');
    if (!featured && count >= 5) { setError('Five replays are already featured. Remove one before saving another.');return; }
    const mutation = featured ? unfeature : feature;
    mutation.mutate({challengeId:id},{
      onSuccess:()=>{void client.invalidateQueries({queryKey:getGetArenaPublicProfileQueryKey(playerId)});void client.invalidateQueries({queryKey:getListArenaChallengesQueryKey()});},
      onError:(cause)=>setError(gameErrorMessage(cause, 'replay'))
    });
  };
  return <span className="arena-social" style={{display:'inline-flex',flexDirection:'column',alignItems:'flex-start',gap:4}}>
    <button type="button" className={`social-button ${featured?'saved':''}`} onClick={change} disabled={busy} aria-label={featured?'Remove featured replay':'Feature replay'} data-testid={`button-${featured?'unfeature':'feature'}-${id}`}>
      {featured?<BookmarkCheck size={14}/>:<Bookmark size={14}/>} {busy?'Saving…':featured?'Remove from favorites':'Save replay'}
    </button>
    {error && <span role="alert" className="social-message error" data-testid={`status-feature-error-${id}`}>{error}</span>}
  </span>;
}