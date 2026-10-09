import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/match-rewards.js',import.meta.url),'utf8');
function fixture({endVisible=true,tournamentVisible=false}={}) {
  const nodes=new Map(),frames=[],timers=new Map();
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.className='';this.attributes={};this.style={setProperty(){}};}
    set id(value){this._id=value;nodes.set(value,this);}
    get id(){return this._id;}
    get isConnected(){return this.tag==='body'||!!this.parentNode?.isConnected;}
    getClientRects(){return this.visible?[{}]:[];}
    appendChild(child){child.remove();this.children.push(child);child.parentNode=this;return child;}
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
    setAttribute(key,value){this.attributes[key]=value;}
    getAttribute(key){return this.attributes[key];}
    querySelector(selector){const cls=selector.slice(1);for(const child of this.children){
      if(child.className.split(' ').includes(cls))return child;const nested=child.querySelector(selector);if(nested)return nested;
    }return null;}
  }
  const body=new Element('body'),overlay=new Element('div'),panel=new Element('div'),tournament=new Element('div');
  overlay.id='endOverlay';overlay.visible=endVisible;panel.className='endPanel';body.appendChild(overlay);overlay.appendChild(panel);
  tournament.id='tournamentModal';tournament.visible=tournamentVisible;body.appendChild(tournament);
  let timerId=0;
  const c=vm.createContext({
    window:{matchMedia:()=>({matches:false})},
    document:{body,createElement:tag=>new Element(tag),getElementById:id=>nodes.get(id)||null,
      querySelector:()=>panel,fullscreenElement:null},
    requestAnimationFrame:fn=>frames.push(fn),setInterval:()=>1,clearInterval(){},
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
  });
  vm.runInContext(source,c);
  return {api:c.window.MatchRewards,nodes,frames,timers,document:c.document};
}
test('a visible result panel gets the Gold count-up and duplicate receipts do not replay it',()=>{
  const f=fixture(),receipt={id:'arena:one',gold:25,balance:125};
  assert.equal(f.api.show(receipt),true);
  const container=f.nodes.get('matchReward'),card=container.children[0];
  assert.ok(card.className.includes('cmr-live'));
  f.frames.shift()(0);f.frames.shift()(2000);
  assert.equal(card.querySelector('.cmr-amt').textContent,'+25');
  f.api.show(receipt);assert.equal(container.children.length,1);
  assert.equal(container.children[0],card);
});
test('late Arena and tournament rewards animate visibly outside a hidden or covered result panel',()=>{
  for(const options of [{endVisible:false},{tournamentVisible:true}]){
    const f=fixture(options);
    assert.equal(f.api.show({id:'tournament:one',gold:500,balance:1000}),true);
    const toast=f.nodes.get('floatingMatchReward');
    assert.equal(toast.parentNode,f.document.body);assert.equal(toast.hidden,false);
    assert.ok(toast.children[0].className.includes('cmr-live'));
    [...f.timers.values()][0]();assert.equal(toast.hidden,true);
  }
});
test('floating receipts stay inside fullscreen and dismissal resets for a newer reward',()=>{
  const f=fixture({endVisible:false});
  f.document.fullscreenElement=f.nodes.get('endOverlay');
  f.api.show({id:'arena:one',gold:25});
  f.api.show({id:'arena:two',gold:5});
  assert.equal(f.nodes.get('floatingMatchReward').parentNode,f.document.fullscreenElement);
  assert.equal(f.timers.size,1);
});
test('replay recovery has no top retry banner or notices and keeps automatic retries',()=>{
  const play=readFileSync(new URL('../src/pages/Play.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(play,/Retry replay|setNotice\([^;\n]*[Rr]eplay/);
  assert.match(play,/setInterval\(retryRecordings, 30000\)/);
  assert.match(play,/addEventListener\('online', retryRecordings\)/);
});

function walletBridge() {
  const html=readFileSync(new URL('../public/game.html',import.meta.url),'utf8');
  const start=html.indexOf('  function applyAuthoritativeProfile(snapshot)');
  const listenerStart=html.indexOf("  window.addEventListener('message',event=>{",start);
  const listenerEnd=html.indexOf("    if(event.data.type!=='arena:economy-result')return;",listenerStart);
  assert.ok(start>0&&listenerStart>start&&listenerEnd>listenerStart);
  const parent={},shown=[];let listener,visibleGold=0;
  const c=vm.createContext({
    window:{parent,addEventListener:(_event,fn)=>{listener=fn;},MatchRewards:{show:r=>shown.push(r)}},
    location:{origin:'https://game.test'},PRACTICE_ONLY:false,PRESTIGE_SKINS:{},state:null,
    playerProfile:{gold:1000,ownedClasses:['warrior','priest','frostmage'],ownedSkins:[]},
    document:{getElementById:id=>id==='matchReward'?null:{style:{display:'none'}}},
    lastFinishedChallengeId:'newer-match',
    updateAccountUI:()=>{visibleGold=c.playerProfile.gold;},
  });
  vm.runInContext(html.slice(start,listenerStart)+html.slice(listenerStart,listenerEnd)+'  });',c);
  return {c,shown,get visibleGold(){return visibleGold;},
    receive:(data,origin='https://game.test')=>listener({data,origin,source:parent})};
}
test('a committed late Arena receipt updates wallet and animation after another match without an inventory fetch',()=>{
  const f=walletBridge();
  f.receive({type:'arena:arena-reward',id:'older-match',reward:{gold:25,balance:1025},profile:{gold:1025}});
  assert.equal(f.c.playerProfile.gold,1025);assert.equal(f.visibleGold,1025);
  assert.equal(f.shown.length,1);assert.equal(f.shown[0].gold,25);
  assert.equal(f.shown[0].floating,true);
  assert.equal(f.c.playerProfile.ownedClasses.length,3,'partial Gold sync preserves owned heroes');
});
test('receipt balance alone updates Gold, but untrusted origins cannot change a wallet',()=>{
  const f=walletBridge();
  f.receive({type:'arena:arena-reward',id:'match',reward:{gold:5,balance:1005}});
  assert.equal(f.visibleGold,1005);
  f.receive({type:'arena:arena-reward',id:'spoof',reward:{gold:9999,balance:9999}},'https://other.test');
  assert.equal(f.visibleGold,1005);assert.equal(f.shown.length,1);
});
