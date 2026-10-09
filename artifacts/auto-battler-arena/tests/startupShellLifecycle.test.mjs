import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
const script=readFileSync(new URL('../public/startup-shell.js',import.meta.url),'utf8');
function fixture({bodyReady=true}={}){
  let clock=10000,seq=0,element;
  const timers=[];
  function node(){
    const classes=new Set(),listeners={},attributes={};
    return {classes,listeners,attributes,complete:false,naturalWidth:0,
      classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},
      setAttribute(k,v){attributes[k]=v;},
      addEventListener(k,fn){listeners[k]=fn;}};
  }
  const html=node(),brand=node(),loading=node(),brandLayer=node(),loadLayer=node(),button=node();
  const body={appendChild(e){element=e;e.parentNode=this;},removeChild(e){e.parentNode=null;}};
  const document={documentElement:html,body:bodyReady?body:null,
    currentScript:{src:'https://arena.test/prefix/startup-shell.js'},
    createElement(){
      const e=node();e.querySelector=s=>({'button':button,'.as-brand':brandLayer,
        '.as-load':loadLayer,'.as-brand img':brand,'.as-load img':loading}[s]);
      return e;
    }};
  const schedule=(fn,delay=0)=>{timers.push({fn,at:clock+delay,id:seq++});return seq;};
  let reloads=0;
  const c=vm.createContext({document,Date:{now:()=>clock},location:{reload(){reloads++;}},
    setTimeout:schedule,requestAnimationFrame:fn=>schedule(fn,16),
    matchMedia:()=>({matches:false})});
  c.window=c;vm.runInContext(script,c);
  function advance(ms){
    const target=clock+ms;let count=0;
    for(;;){
      timers.sort((a,b)=>a.at-b.at||a.id-b.id);
      if(!timers.length||timers[0].at>target)break;
      if(++count>5000)throw Error('Unbounded startup retry/timer');
      const timer=timers.shift();clock=timer.at;timer.fn();
    }
    clock=target;
  }
  function imageLoaded(image){image.complete=true;image.naturalWidth=1024;image.listeners.load();}
  return {c,html,brand,loading,brandLayer,loadLayer,button,advance,
    showBody(){document.body=body;},loadBrand:()=>imageLoaded(brand),loadArtwork:()=>imageLoaded(loading),
    element:()=>element,reloads:()=>reloads};
}
test('startup cannot reveal the dashboard until actual readiness and both images have loaded',()=>{
  const f=fixture();f.loadBrand();f.loadArtwork();f.advance(5000);
  assert.ok(f.html.classes.has('arena-starting'),'initialization is still pending');
  assert.ok(f.loadLayer.classes.has('on'));
  f.c.ArenaStartup.ready();f.advance(600);
  assert.ok(!f.html.classes.has('arena-starting'));
  assert.equal(f.c.ArenaStartup.done,true);assert.equal(f.element().parentNode,null);
});
test('studio branding lasts 1.8 seconds after paint even if image/modules take seconds to download',()=>{
  const f=fixture();f.c.ArenaStartup.ready();f.loadArtwork();f.advance(4000);
  assert.ok(!f.loadLayer.classes.has('on'));
  f.loadBrand();f.advance(1790);
  assert.ok(!f.loadLayer.classes.has('on'));
  assert.ok(f.html.classes.has('arena-starting'));
  f.advance(60);assert.ok(f.loadLayer.classes.has('on'));
  f.advance(1000);assert.equal(f.c.ArenaStartup.done,true);
});
test('artwork download cannot be skipped just because the game is already ready',()=>{
  const f=fixture();f.loadBrand();f.c.ArenaStartup.ready();f.advance(2400);
  assert.ok(f.html.classes.has('arena-starting'));
  f.loadArtwork();f.advance(1100);
  assert.equal(f.c.ArenaStartup.done,true);
  assert.match(f.element().innerHTML,/https:\/\/arena\.test\/prefix\/startup\/loading\.webp/);
});
test('the cover appears before deferred React modules finish and missed readiness is retained',()=>{
  const f=fixture({bodyReady:false});
  f.c.ArenaStartup.ready();f.advance(1000);assert.equal(f.element(),undefined);
  f.showBody();f.advance(20);
  assert.ok(f.element(),'does not depend on DOMContentLoaded');
  f.loadBrand();f.loadArtwork();f.advance(2900);assert.equal(f.c.ArenaStartup.done,true);
});
test('asset failure or deadline keeps all old UI covered and offers a working retry',()=>{
  const f=fixture();f.brand.listeners.error();
  assert.ok(f.element().classes.has('is-failed'));
  assert.ok(f.html.classes.has('arena-starting'));
  f.button.onclick();assert.equal(f.reloads(),1);
  const delayed=fixture({bodyReady:false});delayed.advance(30001);
  delayed.showBody();delayed.advance(20);
  assert.ok(delayed.element().classes.has('is-failed'));
  assert.ok(delayed.html.classes.has('arena-starting'));
});
test('readiness revoked during transition cannot reveal a stale route',()=>{
  const f=fixture();f.loadBrand();f.loadArtwork();f.c.ArenaStartup.ready();f.advance(1900);
  f.c.ArenaStartup.wait();f.advance(1000);
  assert.ok(f.html.classes.has('arena-starting'));
  f.c.ArenaStartup.ready();f.advance(600);assert.equal(f.c.ArenaStartup.done,true);
});
