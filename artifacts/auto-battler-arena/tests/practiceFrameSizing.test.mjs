import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const hook = readFileSync(new URL("../src/lib/useGameFrameScrolling.ts", import.meta.url), "utf8");
const start = hook.indexOf("const refresh = () => {");
const end = hook.indexOf("let resizeRefreshFrame", start);
assert.ok(start >= 0 && end > start);
const refreshSource = hook.slice(start, end);

function scrolling(nativeFrameScroll = false) {
  const classes = new Set();
  const outer = { scrollTop: 200, scrollTo({ top }) { this.scrollTop = top; } };
  const view = { scrollX: 0, scrollY: 30, scrollTo(x, y) { this.scrollX = x; this.scrollY = y; } };
  const frame = { style: {}, parentElement: outer };
  const window = { innerHeight: 600, visualViewport: { height: 600 }, matchMedia: () => ({ matches: true }) };
  const context = vm.createContext({
    window, frame, outer, nativeFrameScroll, topOffset: 0,
    wasBattleLocked: false, wasPracticeLocked: false, menuScroll: { outer: 0, x: 0, y: 0 },
    app: { getBoundingClientRect: () => ({ bottom: 1313 - view.scrollY }) },
    doc: { body: { classList: { contains: name => classes.has(name) }, scrollHeight: 1313 }, defaultView: view,
      getElementById:id=>id==='tutorialModal'?{classList:{contains:()=>classes.has('tutorialOpen')}}:null },
    cancelMomentum() {},
  });
  vm.runInContext(refreshSource, context);
  const refresh = () => vm.runInContext("refresh()", context);
  return { frame, window, outer, view, classes, refresh };
}

test("battle frame subtracts actual preview-toolbar height after rotation", () => {
  const { frame, window, classes, refresh } = scrolling();
  classes.add("battleMode");
  frame.offsetTop = 47;
  window.visualViewport.height = 390;
  refresh();
  assert.equal(frame.style.height, "343px");
  frame.offsetTop = 98;
  window.visualViewport.height = 844;
  refresh();
  assert.equal(frame.style.height, "746px");
});

test("beginner tutorial remains within the visible viewport over a tall menu",()=>{
  const {frame,outer,classes,refresh}=scrolling();
  refresh();assert.equal(frame.style.height,'1313px');
  classes.add('tutorialOpen');refresh();
  assert.equal(frame.style.height,'600px');assert.equal(outer.scrollTop,0);
  classes.delete('tutorialOpen');refresh();
  assert.equal(frame.style.height,'1313px');assert.equal(outer.scrollTop,200);
});

test("practice constrains a long outer-scrolling menu and restores its size/scroll on exit", () => {
  const { frame, outer, view, classes, refresh } = scrolling();
  refresh();
  assert.equal(frame.style.height, "1313px");
  classes.add("adminPracticeOpen");
  refresh();
  assert.equal(frame.style.height, "600px");
  assert.equal(outer.scrollTop, 0);
  assert.equal(view.scrollY, 0);
  refresh();
  classes.delete("adminPracticeOpen");
  refresh();
  assert.equal(frame.style.height, "1313px");
  assert.equal(outer.scrollTop, 200);
  assert.equal(view.scrollY, 30);
});

test("practice follows keyboard/rotation viewport changes without unlocking tall menus", () => {
  const { frame, window, classes, refresh } = scrolling();
  classes.add("adminPracticeOpen");
  refresh();
  window.visualViewport.height = 340;
  refresh();
  assert.equal(frame.style.height, "340px");
  window.visualViewport = undefined;
  window.innerHeight = 280;
  refresh();
  assert.equal(frame.style.height, "280px");
});

test("character-picker and loading overlays use the phone viewport, not expanded menu height", () => {
  for (const className of ["mobileGameDialogOpen", "arenaTipOpen"]) {
    const { frame, classes, refresh } = scrolling();
    refresh();
    assert.equal(frame.style.height, "1313px");
    classes.add(className);
    refresh();
    assert.equal(frame.style.height, "600px");
    classes.delete(className);
    refresh();
    assert.equal(frame.style.height, "1313px");
  }
});

test("an account battle replacing practice stays locked and does not restore menu scroll", () => {
  const { frame, outer, view, classes, refresh } = scrolling();
  classes.add("adminPracticeOpen");
  refresh();
  classes.delete("adminPracticeOpen");
  classes.add("battleMode");
  refresh();
  assert.equal(frame.style.height, "600px");
  assert.equal(outer.scrollTop, 0);
  assert.equal(view.scrollY, 0);
});

test("native iOS menus retain their existing viewport sizing outside practice", () => {
  const { frame, outer, classes, refresh } = scrolling(true);
  refresh();
  assert.equal(frame.style.height, "600px");
  assert.equal(outer.scrollTop, 200);
  classes.add("adminPracticeOpen");
  refresh();
  classes.delete("adminPracticeOpen");
  refresh();
  assert.equal(frame.style.height, "600px");
  assert.equal(outer.scrollTop, 200);
});

test("the hourly Dungeon overview also constrains long menus and restores their scroll", () => {
  const { frame, outer, classes, refresh } = scrolling();
  refresh();
  classes.add("hourlyDungeonDialogOpen");
  refresh();
  assert.equal(frame.style.height, "600px");
  assert.equal(outer.scrollTop, 0);
  classes.delete("hourlyDungeonDialogOpen");
  refresh();
  assert.equal(frame.style.height, "1313px");
  assert.equal(outer.scrollTop, 200);
});

test("ResizeObserver sizing refreshes are coalesced into animation frames and canceled on cleanup", () => {
  const start = hook.indexOf("let resizeRefreshFrame: number | null = null;");
  const end = hook.indexOf("const classObserver =", start);
  assert.ok(start >= 0 && end > start);
  const schedulingSource = hook.slice(start, end)
    .replace("let resizeRefreshFrame: number | null = null;", "let resizeRefreshFrame = null;");

  const callbacks = new Map();
  const canceled = [];
  let nextFrame = 1;
  let observerCallback;
  let refreshCount = 0;
  const context = vm.createContext({
    window: {
      requestAnimationFrame(callback) {
        const id = nextFrame++;
        callbacks.set(id, callback);
        return id;
      },
      cancelAnimationFrame(id) {
        canceled.push(id);
        callbacks.delete(id);
      },
    },
    doc: { body: {} },
    app: null,
    refresh() { refreshCount++; },
    ResizeObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
    },
  });
  vm.runInContext(schedulingSource, context);

  observerCallback();
  observerCallback();
  assert.equal(callbacks.size, 1, "multiple observer notifications share one frame");
  const [frameId, refresh] = callbacks.entries().next().value;
  callbacks.delete(frameId);
  refresh();
  assert.equal(refreshCount, 1);

  observerCallback();
  vm.runInContext("cancelScheduledResizeRefresh()", context);
  assert.deepEqual(canceled, [2]);
  assert.equal(callbacks.size, 0);
  assert.match(hook, /cancelScheduledResizeRefresh\(\);\s*resizeObserver\.disconnect\(\);/);
  assert.match(hook, /const classObserver = new MutationObserver\(refresh\);/);
});