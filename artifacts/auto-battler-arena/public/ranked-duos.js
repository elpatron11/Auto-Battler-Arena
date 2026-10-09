(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const duoMode=()=>selected.length===2 || teamSize===2;
  const originalSnapshot=currentDefenseSnapshot;
  currentDefenseSnapshot=function() {
    if(selected.length!==2)return originalSnapshot();
    return {version:1,savedAt:Date.now(),heroes:selected.map((key,index)=>{
      const build=selectedBuilds[index]?.classId===key ? selectedBuilds[index] : {};
      return {classId:key,talents:Array.isArray(build.talents)?build.talents.slice(0,2):defenseTalentSnapshot(key),ability:build.ability||abilityChoice[key]||'default',
        ultimate:build.ultimate||ultChoice[key]||'default'};
    }),captainClass:selected.includes(captainClass)?captainClass:null,
    captainRacial:selected.includes(captainClass)?captainRacial:null,
    orders:{focus:priorityDraft.focus||teamOrders.focus||null,control:priorityDraft.control||teamOrders.control||null,
      heal:priorityDraft.heal||teamOrders.heal||null,
      switchLow:priorityDraft.switchLow!==undefined?!!priorityDraft.switchLow:!!teamOrders.switchLow}};
  };
  const originalSave=saveCurrentDefense;
  saveCurrentDefense=function(){
    if(!duoMode())return originalSave();
    const snapshot=currentDefenseSnapshot();
    if(!playerProfile || !snapshot){showUnlockToast('Select a complete 2v2 squad first.');return;}
    playerProfile.defenseTeam2=snapshot;
    savePlayerProfile();renderSavedDefense();showUnlockToast('2v2 defense saved and syncing to Arena.');
  };
  if($('saveDefenseBtn'))$('saveDefenseBtn').onclick=saveCurrentDefense;
  const originalRender=renderSavedDefense;
  renderSavedDefense=function(){
    if(!duoMode())return originalRender();
    const original=playerProfile?.defenseTeam;
    if(playerProfile)playerProfile.defenseTeam=playerProfile.defenseTeam2;
    try {
      originalRender();
      if($('saveDefenseBtn'))$('saveDefenseBtn').textContent='Save Current 2v2 as Defense';
      if($('savedDefenseStatus') && !playerProfile?.defenseTeam2)
        $('savedDefenseStatus').textContent='No 2v2 defense saved. Select two characters, then save your defense.';
    } finally {if(playerProfile)playerProfile.defenseTeam=original;}
  };
  const originalLoad=loadSavedDefense;
  loadSavedDefense=function(){
    if(!duoMode())return originalLoad();
    const defense=playerProfile?.defenseTeam2;
    if(!defense || defense.heroes?.length!==2)return;
    if(!window.MobileSavedTeams?.applySquadRecord({...defense,teamSize:2,slotPositions:[0,1]},{quiet:true}))return;
    window.MobileSavedTeams.markEdited();
    savedTeamEditingIndex=null;
    priorityDraft=Object.assign({focus:null,control:null,heal:null,switchLow:true},defense.orders);
    teamOrders=Object.assign({},priorityDraft);
    savePlayerProfile();renderSlots();renderSavedTeams();
    $('defenseModal').style.display='none';showTeamBuilder();
  };
  if($('loadDefenseBtn'))$('loadDefenseBtn').onclick=loadSavedDefense;
  const originalClear=$('clearDefenseBtn')?.onclick;
  if($('clearDefenseBtn'))$('clearDefenseBtn').onclick=function(event){
    if(!duoMode())return originalClear?.call(this,event);
    if(playerProfile)playerProfile.defenseTeam2=null;
    savePlayerProfile();renderSavedDefense();
  };
  function rankLabel(rating){
    const ranks=[['Bronze',0],['Silver',1200],['Gold',1400],['Platinum',1600],['Diamond',1800],['Master',2000],['Grandmaster',2200]];
    let i=0;for(let j=1;j<ranks.length;j++)if(rating>=ranks[j][1])i=j;
    if(i>=5)return ranks[i][0];
    const step=Math.min(2,Math.max(0,Math.floor((rating-ranks[i][1])/((ranks[i+1][1]-ranks[i][1])/3))));
    return `${ranks[i][0]} ${['III','II','I'][step]}`;
  }
  function paintRank(){
    const summary=$('hubTeamSummary');
    if(!summary || !playerProfile)return;
    const size=duoMode()?2:3;
    const rank=size===2 ? playerProfile.ranked2v2 : playerProfile.ranked3v3;
    const value=Number(rank?.rating ?? (size===3 ? playerProfile.rating??1000 : 1000));
    const rating=Number.isFinite(value)?value:1000;
    let label=$('rankedModeSummary');
    if(!label){label=document.createElement('div');label.id='rankedModeSummary';label.style.cssText='padding:10px 14px;border:1px solid #485c7a;border-radius:10px;color:#ffe0a0;font-size:13px;font-weight:800;margin:8px 0;';summary.after(label);}
    label.textContent=`Ranked ${size}v${size} · ${rankLabel(rating)} · ${rating} RP · ${rank?.wins??0}W / ${rank?.losses??0}L`;
    for(const item of summary.querySelectorAll('.ar-team-meta > div')){
      const caption=item.querySelector('span'), value=item.querySelector('strong');
      if(caption?.textContent==='RATING' && value)value.textContent=String(rating);
    }
    if($('saveDefenseBtn'))$('saveDefenseBtn').textContent=`Save Current ${size}v${size} as Defense`;
  }
  for(const name of ['updateHubTeamSummary','showMainHub','setTeamSize']){
    const original=window[name];if(typeof original!=='function')continue;
    window[name]=function(){const result=original.apply(this,arguments);paintRank();return result;};
  }
  window.addEventListener('message',event=>{
    if(event.source!==window.parent || event.origin!==location.origin || event.data?.type!=='arena:ranked-progression')return;
    if(playerProfile){
      playerProfile.ranked2v2=event.data.rank2;
      playerProfile.ranked3v3=event.data.rank3;
      if(Object.hasOwn(event.data,'defenseTeam2'))playerProfile.defenseTeam2=event.data.defenseTeam2;
      playerProfile.rating=event.data.rank3?.rating ?? playerProfile.rating;
      paintRank();
    }
  });
  paintRank();
  window.parent.postMessage({type:'arena:ranked-progression-request'},location.origin);
})();