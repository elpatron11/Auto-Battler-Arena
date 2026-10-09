import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const src = readFileSync(new URL("../public/roster-polish-art.js", import.meta.url), "utf8");
assert.ok(/^[\x00-\x7f]*$/.test(src), "ASCII only");

function proxyCtx(counter) {
  const target = { canvas: null };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "createLinearGradient") return () => { counter.grad++; return { addColorStop() {} }; };
      return (...a) => { counter[k] = (counter[k] || 0) + 1; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function load() {
  const w = { Math, Map, Number, Object, String, Array, isFinite, parseInt, RegExp };
  w.globalThis = w; w.window = w;
  const built = { n: 0, grad: 0 };
  vm.runInNewContext(src, w);
  w.RosterPolishArt.setCanvasFactory((cw, ch) => { built.n++; return { width: cw, height: ch, getContext: () => proxyCtx(built) }; });
  return { api: w.RosterPolishArt, built, w };
}
const pal = { col: "#4a78c8", dark: "#1c2c58", light: "#9ac0f0" };
const classes = ["frostmage", "priest", "warrior", "rogue", "paladin", "archer", "warlock", "druid", "shaman"];

test("draws all nine classes, rejects unknown", () => {
  const { api } = load();
  for (const c of classes) assert.equal(api.draw(proxyCtx({ grad: 0 }), { id: 1 }, c, pal, 1, { attack: .5, facing: -1 }), true, c);
  assert.equal(api.draw(proxyCtx({ grad: 0 }), {}, "wolf", pal, 0, {}), false);
});

test("humanoid polish preserves pets, transformed Druids and other special bodies", () => {
  const { api } = load(), ctx = proxyCtx({grad:0});
  for(const special of [{isPet:true},{isDungeonMonster:true},{extra:{form:'bear'}},{extra:{form:'tiger'}},
    {extra:{form:'tree'}},{form:'bear'},{status:{polymorphed:true}}])
    assert.equal(api.draw(ctx,special,'druid',pal,1,{}),false);
  assert.equal(api.cacheStats().entries,0);
});

test("weapon slots preserve staff tops without increasing atlas memory", () => {
  const { api } = load();
  for(const cls of classes){
    const args=[];
    const ctx=proxyCtx({grad:0});
    ctx.drawImage=(...data)=>args.push(data);
    api.draw(ctx,{id:1},cls,pal,1,{});
    assert.equal(args.at(-1)[6],cls==='archer'||cls==='rogue'?-24:-34);
    assert.equal(api.cacheStats().entryBytes,384*192*4);
  }
});

test("bow release stays aimed forward, caster staves stay upright, and melee keeps its swing", () => {
  const {api}=load();
  function angle(cls) {
    const ctx=proxyCtx({grad:0}), turns=[];
    let shoulder=false;
    ctx.translate=(x,y)=>{if(x===6.3 && y===-10)shoulder=true;};
    ctx.rotate=value=>{if(shoulder)turns.push(value);};
    api.draw(ctx,{},cls,pal,1,{attack:1,windup:0,cast:0});
    return turns.reduce((sum,value)=>sum+value,0);
  }
  assert.ok(Math.abs(angle('archer'))<.2);
  for(const cls of ['frostmage','priest','warlock','druid','shaman'])assert.ok(Math.abs(angle(cls))<.5);
  assert.ok(angle('warrior')>1.5);
});

test("default Shadow Form and Rampage retain their existing recolor without timer-key churn", () => {
  const {api}=load(),ctx=proxyCtx({grad:0});
  for(const [cls,status,col] of [['priest','shadowForm','#17131d'],['warrior','rampage','#ff3b1f']]){
    const e={extra:{[status]:0}},base={...pal,skinId:'default'};
    const count=api.cacheStats().entries;
    api.draw(ctx,e,cls,base,1,{});
    e.extra[status]=5;
    api.draw(ctx,e,cls,{...base,col},2,{});
    e.extra[status]=4;
    api.draw(ctx,e,cls,{...base,col},3,{});
    e.extra[status]=0;
    api.draw(ctx,e,cls,base,4,{});
    assert.equal(api.cacheStats().entries,count+2);
  }
});

test("cache is time/id independent, bounded, LRU", () => {
  const { api, built } = load();
  const ctx = proxyCtx({ grad: 0 });
  for (let i = 0; i < 50; i++) api.draw(ctx, { id: i }, "warrior", pal, i * .1, { move: 1, stride: Math.sin(i) });
  assert.equal(built.n, 1);
  assert.equal(api.cacheStats().hits, 49);
  for (let i = 0; i < 40; i++) api.draw(ctx, { racial: "cache-case-" + i }, classes[i % 9], pal, 0, {});
  const s = api.cacheStats();
  assert.ok(s.entries <= 16 && s.bytes <= 8 * 1024 * 1024 && s.evictions > 0);
  assert.equal(s.entryBytes, 384 * 192 * 4);
  api.clearCache(); assert.equal(api.cacheStats().entries, 0);
});

test("skins and races build distinct identities; no entity mutation", () => {
  const { api, built } = load();
  const ctx = proxyCtx({ grad: 0 });
  const e = Object.freeze({ id: 3, racial: "orc" });
  api.draw(ctx, e, "paladin", { ...pal, skinId: "dawnBastion" }, 0, {});
  api.draw(ctx, e, "paladin", { ...pal, skinId: "obsidianOath" }, 0, {});
  api.draw(ctx, { id: 3 }, "paladin", { ...pal, skinId: "obsidianOath" }, 0, {});
  assert.equal(built.n, 3);
});

test("restores ctx on throw and returns false without canvas", () => {
  const { api, w } = load();
  let saves = 0, restores = 0;
  const bad = new Proxy({}, { get: (t, k) => k === "save" ? () => saves++ : k === "restore" ? () => restores++ : k === "drawImage" ? () => { throw new Error("x"); } : () => {} });
  assert.throws(() => api.draw(bad, {}, "rogue", pal, 0, {}));
  assert.equal(saves, restores);
  api.setCanvasFactory(null); api.clearCache();
  assert.equal(api.draw(proxyCtx({ grad: 0 }), {}, "rogue", pal, 0, {}), false);
  assert.ok(w.RosterPolishArt);
});
