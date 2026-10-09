import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
test('presentation backing stores follow transformed display size and DPR, preserving logical aspect and caps',()=>{
  const context={setTransform(...args){this.transform=args;}};
  const canvas={width:180,height:220,getBoundingClientRect:()=>({width:156,height:190.67}),
    getContext:()=>context};
  const window={devicePixelRatio:3,addEventListener(){}};
  vm.runInNewContext(readFileSync(new URL('../public/menu-preview-canvas.js',import.meta.url),'utf8'),
    {window,document:{getElementById:()=>null}});
  const logical=window.MenuPreviewCanvas.prepare(canvas,180,220);
  assert.equal(logical.width,180);assert.equal(logical.height,220);
  assert.equal(canvas.width,468);assert.equal(canvas.height,572);
  assert.ok(Math.abs(canvas.width/canvas.height-180/220)<.001);
  assert.equal(context.imageSmoothingQuality,'high');
  const old=canvas.width;
  canvas.getBoundingClientRect=()=>({width:260,height:317.78});
  window.MenuPreviewCanvas.prepare(canvas,180,220);
  assert.ok(canvas.width>old,'rotation/resize increases actual backing pixels');
  canvas.getBoundingClientRect=()=>({width:2000,height:2444});
  window.devicePixelRatio=9;window.MenuPreviewCanvas.prepare(canvas,180,220);
  assert.ok(canvas.width<=1024&&canvas.height<=1024);
});
function integration(){
  const created=[];
  const module={exports:{}};
  vm.runInNewContext(compile('../src/prototypes/roster3d/gameIntegration.ts'),{
    module,exports:module.exports,URLSearchParams,
    require:id=>id==='./premiumRoster'?{PREMIUM_ROSTER_FACTORY:{}}:{
      createRosterBattleRenderer:(getEntities,options)=>{
        const renderer={enabled:true,stats:{phase:'loading',tileSize:options.tileSize||160},
          disposed:0,draws:[],reset(){},dispose(){this.disposed++;},
          draw(ctx,e,t){this.draws.push({entities:getEntities(),e,t});return true;},
          handled:()=>false,snapshot(){return this.stats;}};
        created.push({renderer,options});return renderer;
      }
    }
  });
  const root={location:{search:''},localStorage:{getItem:()=>null},
    document:{querySelectorAll:()=>[]},addEventListener(){},setInterval:()=>1,
    GameBody3DSource:{entitiesForRendering:()=>[],paused:()=>false}};
  return {layer:module.exports.installGameBody3D(root),created};
}
test('menu tiles follow destination transform, are cached, and never enlarge the separate battle renderer',()=>{
  const {layer,created}=integration(),e={classId:'paladin',alive:true};
  const before=JSON.stringify(e),ctx={getTransform:()=>({a:6,b:0,c:0,d:6})};
  assert.equal(layer.drawPreview(ctx,e,[e],1),true);
  assert.equal(created.length,2);assert.equal(created[0].options.tileSize,undefined);
  assert.equal(created[1].options.tileSize,512);assert.equal(created[1].options.maxUnits,3);
  assert.equal(layer.snapshot().tileSize,160);
  layer.drawPreview(ctx,e,[e],1);assert.equal(created.length,2,'unchanged size reuses menu atlas');
  layer.drawPreview(ctx,e,[e],2,100000);
  assert.equal(created[1].renderer.disposed,1);assert.equal(created[2].options.tileSize,768);
  layer.beginFrame(3);
  assert.equal(created[2].renderer.disposed,1,'menu GPU resources released on battle entry');
  assert.equal(layer.previewStats,undefined);
  layer.draw(ctx,e,3);assert.equal(created[0].renderer.draws.length,1);
  assert.equal(JSON.stringify(e),before);
  layer.dispose();assert.equal(created[0].renderer.disposed,1);
});
test('disabled 3D never allocates a high-resolution menu context',()=>{
  const {layer,created}=integration();
  layer.enabled=false;
  assert.equal(layer.drawPreview({}, {}, [], 1),false);assert.equal(created.length,1);
});
test('renderer keeps square physical tiles, one-to-one atlas copies, default battle capacity and camera',()=>{
  const source=readFileSync(new URL('../src/prototypes/roster3d/battleRenderer.ts',import.meta.url),'utf8');
  assert.match(source,/const TILE = 160, COLS = 3, MAX_UNITS = 18, INTERVAL = 1000 \/ 30/);
  assert.match(source,/renderer\.setPixelRatio\(1\)/);
  assert.match(source,/setViewport\(x, y, tileSize, tileSize\)/);
  assert.match(source,/bitmapCtx\.drawImage\(renderer\.domElement, 0, 0\)/);
  assert.match(source,/new THREE\.OrthographicCamera\(-5, 5, 5, -5, \.1, 50\)/);
  assert.match(source,/Math\.floor\(renderer\.capabilities\.maxTextureSize\/COLS\/64\)\*64/);
});