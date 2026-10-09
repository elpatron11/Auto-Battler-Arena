import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const hook=readFileSync(new URL('../src/lib/useGameFrameScrolling.ts',import.meta.url),'utf8');
const source=hook.slice(hook.indexOf('let lastTouchY:'),hook.indexOf('const onTouchEnd'))
  .replace(': number | null','').replaceAll(': TouchEvent','').replaceAll('outer!.','outer.');

function touch(forward=true){
  const outer={scrollTop:200};
  let prevented=0,time=0;
  const context=vm.createContext({outer,lastTouchAt:0,touchVelocity:0,forwardingTouch:false,
    cancelMomentum(){},shouldForward:()=>forward});
  vm.runInContext(source,context);
  const send=(handler,ys)=>{
    context.event={touches:ys.map(clientY=>({clientY})),timeStamp:time+=16,cancelable:true,
      preventDefault(){prevented++;}};
    vm.runInContext(`${handler}(event)`,context);
  };
  return {outer,start:y=>send('onTouchStart',[y]),move:ys=>send('onTouchMove',ys),
    prevented:()=>prevented};
}

test('notification taps with small finger jitter retain the browser click',()=>{
  const t=touch();t.start(100);t.move([102]);t.move([98]);t.move([104]);
  assert.equal(t.prevented(),0);assert.equal(t.outer.scrollTop,200);
});
test('real menu swipes still forward their full movement after the tap threshold',()=>{
  const t=touch();t.start(100);t.move([97]);t.move([80]);
  assert.equal(t.outer.scrollTop,220);assert.equal(t.prevented(),1);
  t.move([98]);
  assert.equal(t.outer.scrollTop,202);assert.equal(t.prevented(),2);
  t.start(98);t.move([99]);
  assert.equal(t.prevented(),2);
});
test('inner dialogs and multi-touch keep their native gestures',()=>{
  const t=touch(false);t.start(100);t.move([40]);
  assert.equal(t.prevented(),0);assert.equal(t.outer.scrollTop,200);
  const multiple=touch();multiple.start(100);multiple.move([70,80]);multiple.move([40]);
  assert.equal(multiple.prevented(),0);assert.equal(multiple.outer.scrollTop,200);
});

const notificationCode=readFileSync(new URL('../public/account-menu.js',import.meta.url),'utf8');
function notificationTap(){
  let now=1000,calls=0;
  const handlers=new Map();
  const button={
    disabled:false,
    addEventListener(name,fn){handlers.set(name,[...(handlers.get(name)||[]),fn]);},
    click(){if(!emit('click',{isTrusted:false}))calls++;},
  };
  function emit(type,event){
    let blocked=false;
    event.preventDefault=()=>{};
    event.stopImmediatePropagation=()=>{blocked=true;};
    for(const fn of handlers.get(type)||[])fn(event);
    return blocked;
  }
  const context=vm.createContext({touchWired:new WeakSet(),performance:{now:()=>now}});
  vm.runInContext(notificationCode.slice(notificationCode.indexOf('function wireNotificationTap'),notificationCode.indexOf('function ensureButton')),context);
  context.wireNotificationTap(button);
  const point=(x,y)=>({identifier:1,clientX:x,clientY:y});
  return {button,emit,point,context,handlers,get calls(){return calls;},advance(value){now+=value;}};
}
test('direct notification taps retain the native handler and suppress the compatibility click',()=>{
  const h=notificationTap();
  h.emit('touchstart',{touches:[h.point(20,20)]});
  h.emit('touchmove',{touches:[h.point(23,22)]});
  h.advance(100);
  h.emit('touchend',{changedTouches:[h.point(23,22)]});
  assert.equal(h.calls,1);
  assert.equal(h.emit('click',{isTrusted:true}),true);
  h.advance(900);
  assert.equal(h.emit('click',{isTrusted:true}),false);
});
test('swipes, cancelled touches, long presses and disabled notification buttons are ignored',()=>{
  for(const kind of ['swipe','cancel','long','disabled']){
    const h=notificationTap();
    h.emit('touchstart',{touches:[h.point(20,20)]});
    if(kind==='swipe')h.emit('touchmove',{touches:[h.point(20,42)]});
    if(kind==='cancel')h.emit('touchcancel',{});
    if(kind==='long')h.advance(700);
    if(kind==='disabled')h.button.disabled=true;
    h.emit('touchend',{changedTouches:[h.point(20,20)]});
    assert.equal(h.calls,0,kind);
  }
});
test('notification touch binding is idempotent and mouse/keyboard clicks remain intact',()=>{
  const h=notificationTap();
  h.context.wireNotificationTap(h.button);
  assert.equal(h.handlers.get('touchend').length,1);
  assert.equal(h.emit('click',{isTrusted:true}),false);
  h.button.click();
  assert.equal(h.calls,1);
});