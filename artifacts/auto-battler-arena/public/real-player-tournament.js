(function(){
  'use strict';
  const roundLabel=round=>({round_of_6:'Quarterfinal',semifinal:'Semifinal',final:'Final'})[round]||round;
  function teams(receipt){
    const history=receipt?.history;
    if(!Array.isArray(history))return null;
    const participants=new Map();
    for(const match of history)for(const side of ['A','B']){
      const id=match['player'+side], snapshot=match['player'+side+'Snapshot'];
      if(typeof id!=='string' || id.startsWith('arena-bot-') || !Array.isArray(snapshot?.heroes) ||
        snapshot.heroes.length!==3)return null;
      if(participants.has(id))continue;
      const builds=snapshot.heroes.map(hero=>({...hero,talents:(hero.talents||[]).slice()}));
      participants.set(id,{id,name:match['player'+side+'Name'],roster:builds.map(hero=>hero.classId),
        builds,abilities:Object.fromEntries(builds.map(hero=>[hero.classId,hero.ability||'default'])),
        ults:Object.fromEntries(builds.map(hero=>[hero.classId,hero.ultimate||'default'])),
        captainClass:snapshot.captainClass,captainRacial:snapshot.captainRacial,
        isPlayer:id==='player',rating:Number(snapshot.rating)||1000,tournamentWins:0});
    }
    const quarterfinals=history.filter(match=>roundLabel(match.round)==='Quarterfinal');
    if(participants.size!==6 || !participants.has('player') || quarterfinals.length!==2)return null;
    const firstFour=quarterfinals.flatMap(match=>[match.playerA,match.playerB]);
    if(new Set(firstFour).size!==4)return null;
    const order=[...firstFour,...[...participants.keys()].filter(id=>!firstFour.includes(id))];
    return {you:participants.get('player'),teams:order.map(id=>participants.get(id))};
  }
  window.RealPlayerTournament={teams};
  const originalSim=simSeries;
  simSeries=function(match){
    if(match.done)return match.winner;
    const record=tournament?.serverResult?.history?.find(row=>roundLabel(row.round)===match.round &&
      ((row.playerA===match.a.id&&row.playerB===match.b.id)||(row.playerA===match.b.id&&row.playerB===match.a.id)));
    if(!record || match.a.isPlayer || match.b.isPlayer)return originalSim.apply(this,arguments);
    match.wa=record.winner===match.a.id?2:0;
    match.wb=record.winner===match.b.id?2:0;
    match.winner=record.winner===match.a.id?match.a:match.b;
    match.done=true;finishSeriesRating(match);return match.winner;
  };
  const originalStart=startBattle;
  startBattle=function(options){
    if(options?.tournament && tournament?.current){
      const match=tournament.current,opponent=match.a.isPlayer?match.b:match.a;
      if(opponent.builds)options={...options,enemyBuilds:opponent.builds,
        enemyCaptainClass:opponent.captainClass,enemyCaptainRacial:opponent.captainRacial};
    }
    return originalStart.call(this,options);
  };
})();