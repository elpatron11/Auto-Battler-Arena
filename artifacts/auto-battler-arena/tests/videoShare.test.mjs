import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const ts=createRequire(new URL('../../../package.json',import.meta.url))('typescript');
const code=ts.transpileModule(readFileSync(new URL('../src/components/VideoShare.tsx',import.meta.url),'utf8'),{
  compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS},
}).outputText;
function mount({native=false,ok=true,cancel=false}={}){
  const slots=[],shared=[],downloads=[],requests=[];let cursor=0;
  const element=(type,props)=>({type,props:props||{}});
  const module={exports:{}};
  vm.runInNewContext(code,{
    module,exports:module.exports,File,Blob,AbortController,DOMException,Error,
    require:name=>({
      react:{useEffect(){},useRef(value){const i=cursor++;return slots[i]||(slots[i]={current:value});},
        useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{slots[i]=next;}];}},
      'react/jsx-runtime':{jsx:element,jsxs:element},
    })[name],
    navigator:native?{canShare:()=>true,share:async value=>{if(cancel)throw new DOMException('Cancelled','AbortError');shared.push(value);}}:{},
    fetch:async(url,options)=>{requests.push({url,options});return {ok,blob:async()=>new Blob(['recorded video'],{type:'video/webm'})};},
    URL:{createObjectURL:file=>{downloads.push(file);return 'blob:test';},revokeObjectURL(){}},
    document:{createElement:()=>({click(){}})},setTimeout(){},
  });
  const render=()=>{cursor=0;return module.exports.VideoShare({url:'/api/arena/challenges/owned/recording',id:'owned',extension:'webm'});};
  const click=async()=>{render().props.children[0].props.onClick();for(let i=0;i<10;i++)await Promise.resolve();};
  return {render,click,shared,downloads,requests};
}
test('native video sharing sends an authorized video file, not a public private-replay URL',async()=>{
  const h=mount({native:true});await h.click();
  assert.equal(h.shared.length,1);
  assert.equal(h.shared[0].files[0].name,'arena-fight-owned.webm');
  assert.equal(h.shared[0].files[0].type,'video/webm');
  assert.equal(h.shared[0].url,undefined);
  assert.equal(h.requests[0].options.credentials,'include');
});
test('unsupported native sharing downloads the video and keeps a direct download link',async()=>{
  const h=mount();await h.click();
  assert.equal(h.downloads[0].name,'arena-fight-owned.webm');
  assert.equal(h.render().props.children[1].props.download,'arena-fight-owned.webm');
  assert.match(h.render().props.children[2].props.children,/downloaded/);
});
test('share cancellation is quiet and unavailable recordings cannot be shared',async()=>{
  const cancelled=mount({native:true,cancel:true});await cancelled.click();
  assert.equal(cancelled.render().props.children[2],'');
  const missing=mount({native:true,ok:false});await missing.click();
  assert.equal(missing.shared.length,0);assert.equal(missing.downloads.length,0);
  assert.match(missing.render().props.children[2].props.children,/no longer available/);
});