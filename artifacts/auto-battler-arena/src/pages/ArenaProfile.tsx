import { useState } from 'react';
import { ArrowLeft, Crown, Play, Shield, ShieldCheck } from 'lucide-react';
import { Link, useParams, useSearch } from 'wouter';
import { getGetArenaPublicProfileQueryKey, useGetArenaPublicProfile } from '@workspace/api-client-react';
import type { ArenaFeaturedMatch, ArenaPublicProfile } from '@workspace/api-client-react';
import { SiteHeader } from '../components/SiteHeader';
import { FeatureMatchButton } from '../components/ArenaSocial';
import { ArenaRankBadge } from '../components/ArenaRankBadge';
import { ReplayVideo } from '../components/ReplayVideo';
import { SnapshotReplay } from '../components/SnapshotReplay';
import '../components/arena-social.css';
import '../components/match-detail.css';

const classNames: Record<NonNullable<ArenaPublicProfile['defenseTeam']>['heroes'][number]['classId'], string> = {
  frostmage: 'Cryomancer',
  priest: 'Priest',
  warrior: 'Warrior',
  rogue: 'Rogue',
  paladin: 'Paladin',
  archer: 'Archer',
  warlock: 'Warlock',
  druid: 'Druid',
  shaman: 'Shaman',
};

function DefenseLineup({ team }: { team: ArenaPublicProfile['defenseTeam'] }) {
  return <section className="social-defense" aria-labelledby="defense-lineup-title" data-testid="section-public-defense-team">
    <div className="social-defense-heading">
      <div>
        <span className="social-kicker">The challenger dossier / 01</span>
        <h2 id="defense-lineup-title" className="social-heading">The posted guard<span className="social-defense-period">.</span></h2>
        <p>Meet the lineup waiting on the other side of the arena.</p>
      </div>
      <div className="social-defense-seal"><Shield size={15} strokeWidth={1.7}/><span>{team ? 'Published defense' : 'Defense unavailable'}</span></div>
    </div>
    {team ? <>
      <div className="social-defense-roster" data-testid="list-public-defense-heroes">
        {team.heroes.map((hero, index) => {
          const isCaptain = hero.classId === team.captainClass;
          const name = classNames[hero.classId];
          return <article className={`social-defense-card${isCaptain ? ' is-captain' : ''}`} key={`${index}-${hero.classId}`} data-testid={`card-public-defense-hero-${index}`}>
            <div className="social-defense-art">
              <img src={`${import.meta.env.BASE_URL}class-portraits/${hero.classId==='druid'?'druid-full.png':`${hero.classId}.jpg`}`} alt={`${name} portrait`} data-testid={`img-public-defense-hero-${index}`}/>
              <span className="social-defense-order" aria-label={`Position ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
              {isCaptain && <span className="social-defense-captain"><Crown size={13} fill="currentColor" strokeWidth={1.5}/> Captain</span>}
            </div>
            <div className="social-defense-card-info">
              <div><span className="social-defense-role">Defender / {String(index + 1).padStart(2, '0')}</span><h3 data-testid={`text-public-defense-class-${index}`}>{name}</h3></div>
              <span className="social-defense-mark" aria-hidden="true">{isCaptain ? <Crown size={19} strokeWidth={1.5}/> : <Shield size={19} strokeWidth={1.5}/>}</span>
            </div>
          </article>;
        })}
      </div>
      <div className="social-defense-footnote"><span className="social-defense-rule"/><span>Shown in team order. Only the published defense is visible.</span></div>
    </> : <div className="social-defense-unpublished" data-testid="status-no-public-defense-team">
      <div className="social-defense-unpublished-icon"><Shield size={27} strokeWidth={1.25}/></div>
      <div><strong>No defender team published yet.</strong><p>When this challenger posts a defense, their lineup will appear here. Private builds are never shown.</p></div>
      <span className="social-defense-unpublished-index" aria-hidden="true">— / —</span>
    </div>}
  </section>;
}

function MatchRow({match,owner,playerId,count}:{match:ArenaFeaturedMatch;owner:boolean;playerId:string;count:number}) {
  const [playing,setPlaying] = useState(false);
  return <article className="social-match" data-testid={`card-profile-match-${match.id}`}>
    <div className="social-match-top">
      <span className={`social-match-result ${match.outcome}`}>{match.outcome}</span>
      <div className="social-match-name"><strong>vs <Link href={`/arena/profiles/${encodeURIComponent(match.opponentId)}`} data-testid={`link-profile-opponent-${match.id}`}>{match.opponentName}</Link></strong><small>{new Date(match.createdAt).toLocaleString()}</small></div>
      <span className="social-delta">{match.ratingDelta>=0?'+':''}{match.ratingDelta} RP</span>
      {owner && <FeatureMatchButton id={match.id} featured={match.featured} count={count} playerId={playerId}/>}
      <button type="button" className="social-button" onClick={()=>setPlaying(value=>!value)} aria-expanded={playing} data-testid={`button-watch-replay-${match.id}`}><Play size={13}/>{playing?'Close replay':'Watch replay'}</button>
    </div>
    {playing && <div className="social-replay" data-testid={`panel-replay-${match.id}`}>
      {match.recordingContentType === 'application/vnd.arena.replay+json'
        ? <SnapshotReplay id={match.id} opponentName={match.opponentName}/>
        : <ReplayVideo id={match.id} opponentName={match.opponentName} contentType={match.recordingContentType}/>}
    </div>}
  </article>;
}

export default function ArenaProfile() {
  const {playerId = ''} = useParams<{playerId:string}>();
  const teamSize=new URLSearchParams(useSearch()).get('teamSize')==='2' ? 2 : 3;
  const profile = useGetArenaPublicProfile(playerId,{teamSize},{query:{queryKey:getGetArenaPublicProfileQueryKey(playerId,{teamSize}),refetchOnMount:'always',refetchOnWindowFocus:true}});
  const data = profile.data;
  const recent = data?.isOwnProfile ? [...data.recentMatches].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,3) : [];
  return <div className="social-profile-page arena-social">
    <SiteHeader signedIn/>
    <main className="social-profile-shell">
      <Link href="/arena" className="social-back" data-testid="link-back-arena"><ArrowLeft size={14}/> Back to Arena</Link>
      {profile.isLoading ? <><div className="social-skeleton" style={{height:240}}/><div className="social-skeleton" style={{height:180}}/></>
        : profile.isError || !data ? <div className="social-empty" role="alert"><strong>Profile unavailable</strong>This challenger could not be loaded. <button className="social-button" onClick={()=>void profile.refetch()} data-testid="button-retry-public-profile">Try again</button></div>
        : <>
          <header className="social-profile-hero" style={{backgroundImage:`linear-gradient(115deg,rgba(10,19,34,.97),rgba(17,37,63,.7)),url(${import.meta.env.BASE_URL}arena-key-art.png)`}}>
            <span className="social-kicker">Arena dossier / {data.isOwnProfile?'Your profile':'Challenger profile'}</span>
            <div className="social-profile-identity"><span className="social-monogram">{data.name.slice(0,2).toUpperCase()}</span><div><h1 className="social-heading" data-testid="text-public-profile-name">{data.name}</h1><p><ShieldCheck size={13} style={{verticalAlign:'middle'}}/> {data.defensePublished?'Defense standing · Open for challenges':'Defense not published'}</p></div></div>
            <div style={{margin:'10px 0'}}><ArenaRankBadge rating={data.rating} className="arb-lg" testId="badge-public-rank"/></div><div className="social-stats"><div><strong data-testid="text-public-profile-rating">{data.rating}</strong><span>Rating points</span></div><div><strong data-testid="text-public-profile-wins">{data.wins}</strong><span>Victories</span></div><div><strong data-testid="text-public-profile-losses">{data.losses}</strong><span>Defeats</span></div></div>
          </header>
          <DefenseLineup team={data.defenseTeam}/>
          {data.ranked2v2&&data.ranked3v3&&<section className="social-section" aria-label="Highest squad ratings">
            <h2 className="social-heading">Highest squad ratings</h2>
            <div className="social-stats"><div><strong>{data.ranked2v2.rating} RP</strong><span>2v2 · {data.ranked2v2.wins}W / {data.ranked2v2.losses}L</span></div>
              <div><strong>{data.ranked3v3.rating} RP</strong><span>3v3 · {data.ranked3v3.wins}W / {data.ranked3v3.losses}L</span></div></div>
          </section>}
          <section className="social-section"><div className="social-section-title"><div><span className="social-kicker">The highlight reel</span><h2 className="social-heading">Featured fights</h2></div><p>{data.featuredMatches.length} / 5 saved replays</p></div>
            {data.featuredMatches.length ? data.featuredMatches.slice(0,5).map(match=><MatchRow key={match.id} match={match} owner={data.isOwnProfile} playerId={data.playerId} count={data.featuredMatches.length}/>)
              : <div className="social-empty" data-testid="status-no-featured-matches"><strong>Nothing on the wall yet</strong>{data.isOwnProfile?'Save a recorded fight from your battle record to show it here.':'This challenger has not featured any fights yet.'}</div>}
          </section>
          {data.isOwnProfile && <section className="social-section"><div className="social-section-title"><div><span className="social-kicker">Your recent fights</span><h2 className="social-heading">Recent recordings</h2></div><p>Your latest three · Unsaved matches stay private</p></div>
            {recent.length ? recent.map(match=><MatchRow key={match.id} match={match} owner playerId={data.playerId} count={data.featuredMatches.length}/>)
              : <div className="social-empty" data-testid="status-no-recent-matches"><strong>No private recordings</strong>Finish a recorded Arena fight to start your collection.</div>}
          </section>}
        </>}
    </main>
  </div>;
}