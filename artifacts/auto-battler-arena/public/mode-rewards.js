(function(){
  'use strict';
  let config=null;
  function rewardText(type){
    if(!config)return 'Reward rates load when you sign in.';
    if(/tournament/i.test(type))return `100 Gold entry · ${config.tournament.champion} Gold champion · ${config.tournament.runnerUp} Gold runner-up · Passive encounter wins: 10 Gold · No item drops`;
    if(/dungeon/i.test(type))return `2 or 3 heroes only · ${config.dungeonGold} Gold on your first hourly boss win · Hourly buff · No item drops`;
    if(/single|local|normal|solo|regular|^ai$/i.test(type))return `${config.localGold.firstWinAmount} Gold for your first ${config.localGold.firstWins} local wins, then ${config.localGold.laterWinAmount} Gold/win · No item drops`;
    const drops=config.arenaDrops;
    const pct=value=>`${Number((value*100).toFixed(1))}%`;
    return `Win: ${config.arenaGold.win} Gold · ${pct(drops.win.ultimate)} Ultimate · ${pct(drops.win.spell)} Spell · ${pct(drops.win.talent)} Talent | Loss: ${config.arenaGold.loss} Gold · ${pct(drops.loss.ultimate)} Ultimate · ${pct(drops.loss.spell)} Spell · ${pct(drops.loss.talent)} Talent · Independent rolls; repeat-opponent limits apply`;
  }
  function paint(){
    const hub=document.getElementById('mainHub');if(!hub)return;
    const choices=hub.querySelectorAll('[data-join], [data-join-mode], [data-mode], select');
    document.querySelectorAll('.mg-match-option[data-kind]').forEach(control=>{
      const kind=control.dataset.kind;
      const title=control.querySelector('strong'),description=control.querySelector('small');
      if(title&&kind==='tournament')title.textContent='Arena Tournament (Real players)';
      if(title&&kind==='arena'){const size=selected.length===2?2:3;title.textContent=`Arena PvP ${size}v${size}`;}
      if(description)description.textContent=rewardText(kind);
    });
    choices.forEach(control=>{
      if(control.tagName==='SELECT'){
        const options=Array.from(control.options);
        if(!options.some(option=>/arena|single|tournament|pvp/i.test(option.textContent)))return;
        options.forEach(option=>{
          const title=option.dataset.rewardTitle||option.textContent;
          option.dataset.rewardTitle=title;
          option.textContent=title+' — '+rewardText(option.value+' '+title);
        });
      }else{
        const title=control.dataset.rewardTitle||control.textContent;
        if(!/arena|single|tournament|pvp|dungeon/i.test(title))return;
        control.dataset.rewardTitle=title;
        let note=control.querySelector('.mode-reward-rates');
        if(!note){note=document.createElement('small');note.className='mode-reward-rates';control.appendChild(note);}
        note.textContent=rewardText(control.dataset.join||control.dataset.joinMode||title);
      }
    });
    let details=document.getElementById('modeRewardDetails');
    if(!details){details=document.createElement('div');details.id='modeRewardDetails';details.style.cssText='padding:12px 14px;border:1px solid #485c7a;border-radius:10px;margin:10px 0;color:#cbd8eb;font-size:12px;line-height:1.7';(hub.querySelector('.hubPlayPanel')||hub).appendChild(details);}
    details.replaceChildren();
    ['Arena PvP 2v2 / 3v3','Single / Local AI','Arena Tournament','Hourly Dungeon'].forEach(title=>{
      const line=document.createElement('div');const strong=document.createElement('strong');strong.textContent=title+' — ';
      line.append(strong,document.createTextNode(rewardText(title)));details.appendChild(line);
    });
  }
  const original=showMainHub;
  showMainHub=function(){const result=original.apply(this,arguments);paint();return result;};
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='arena:reward-rates')return;
    config=event.data.config;paint();
  });
  window.ModeRewards={rewardText,paint};
  document.addEventListener('DOMContentLoaded',paint,{once:true});
  document.addEventListener('click',event=>{
    if(event.target.closest?.('#hubJoinBtn, #hubBattleBtn'))queueMicrotask(paint);
  });
  paint();
})();