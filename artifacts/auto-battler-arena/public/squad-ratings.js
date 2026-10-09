(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const size=()=>[2,3].includes(selected.length)?selected.length:teamSize===2?2:3;
  function activeTeam(n=size()){
    const id=playerProfile?.activeRankedSquads?.[n];
    return playerProfile?.savedTeams?.find(team=>team&&team.id===id)||null;
  }
  function activeScore(){
    const n=size(),team=activeTeam(n),ranks=playerProfile?.squadRatings||{};
    if(ranks[`${n}:${team?.id||'current'}`])return ranks[`${n}:${team?.id||'current'}`];
    if(team){
      const defense=playerProfile?.[n===2?'defenseTeam2':'defenseTeam'];
      const ids=t=>(t?.heroes||[]).map(hero=>hero.classId).sort().join(',');
      if(ranks[`${n}:current`]&&!Object.keys(ranks).some(k=>k.startsWith(`${n}:`)&&k!==`${n}:current`)&&ids(team)===ids(defense))
        return ranks[`${n}:current`];
      return {rating:1000,wins:0,losses:0};
    }
    return playerProfile?.[n===2?'ranked2v2':'ranked3v3']||{rating:playerProfile?.rating||1000,wins:0,losses:0};
  }
  const snapshot=currentDefenseSnapshot;
  currentDefenseSnapshot=function(){
    const result=snapshot.apply(this,arguments);
    if(result)result.squadId=activeTeam()?.id||null;
    return result;
  };
  function paint(){
    if(!playerProfile)return;
    const rank=activeScore(),team=activeTeam();
    const label=$('rankedModeSummary');
    if(label)label.textContent=`${team?.name||'Current squad'} · Ranked ${size()}v${size()} · ${rank.rating} RP · ${rank.wins}W / ${rank.losses}L`;
    for(const item of $('hubTeamSummary')?.querySelectorAll('.ar-team-meta > div')||[]){
      if(item.querySelector('span')?.textContent==='RATING'){
        const value=item.querySelector('strong');if(value)value.textContent=String(rank.rating);
      }
    }
    document.querySelectorAll('.mobileSavedSlot.occupied').forEach(row=>{
      const slot=Number(row.querySelector('.mobileSavedSlotLabel')?.textContent?.replace(/\D/g,''))-1;
      const team=playerProfile.savedTeams?.[slot];if(!team)return;
      const n=team.teamSize||team.heroes?.length;
      const score=playerProfile.squadRatings?.[`${n}:${team.id}`]||{rating:1000,wins:0,losses:0};
      let note=row.querySelector('.squad-rating-note');
      if(!note){note=document.createElement('p');note.className='squad-rating-note';row.querySelector('.mobileSavedSlotSummary')?.appendChild(note);}
      note.textContent=`Ranked ${n}v${n}: ${score.rating} RP · ${score.wins}W / ${score.losses}L`;
    });
  }
  for(const name of ['updateHubTeamSummary','showMainHub','setTeamSize','renderSavedTeams']){
    const original=window[name];
    if(typeof original==='function')window[name]=function(){const result=original.apply(this,arguments);paint();return result;};
  }
  const profile=openProfile;
  openProfile=function(){
    const result=profile.apply(this,arguments);
    if(playerProfile){
      let note=$('highestSquadRatings');
      if(!note){note=document.createElement('section');note.id='highestSquadRatings';note.className='onlineSection';$('profileModal')?.querySelector('.profileStats')?.after(note);}
      if(note){
        const best=n=>Object.entries(playerProfile.squadRatings||{}).filter(([key])=>key.startsWith(`${n}:`))
          .map(([,v])=>Number(v.rating)||1000).reduce((a,b)=>Math.max(a,b),Number(playerProfile[n===2?'ranked2v2':'ranked3v3']?.rating)||1000);
        note.textContent=`Highest squad ratings — 2v2: ${best(2)} RP · 3v3: ${best(3)} RP · Overall: ${Math.max(best(2),best(3))} RP`;
        if($('pRating'))$('pRating').textContent=String(Math.max(best(2),best(3)));
      }
    }
    return result;
  };
  if($('profileBtn'))$('profileBtn').onclick=openProfile;
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='arena:ranked-progression')return;
    if(playerProfile&&event.data.squadRatings)playerProfile.squadRatings=event.data.squadRatings;
    paint();
  });
  window.SquadRatings={activeScore,activeTeam,paint};
  paint();
})();