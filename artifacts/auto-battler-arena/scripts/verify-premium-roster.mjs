import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const base = 'http://127.0.0.1:18236', errors = [], stats = [], cards = [];
let busyPhaseReached = false;
await mkdir('screenshots', { recursive: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1050 } });
page.on('pageerror', e => errors.push(e.message));
const shot = async name => {
  const buffer = await page.locator('[data-testid="canvas-roster-3d"] canvas').screenshot();
  await writeFile(`screenshots/premium-roster-${name}.png`, buffer);
  return buffer.toString('base64');
};
const pause = async () => {
  if (!(await page.getByTestId('text-current-animation').textContent()).includes('paused')) await page.getByTestId('button-pause').click();
};
const waitStats = () => page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="text-model-triangles"]');
  return el && el.textContent !== '...';
});
try {
  if (!process.argv.includes('--battle-only')) {
  await page.goto(`${base}/roster-3d-preview.html?class=paladin&premium=1`);
  await waitStats(); await page.waitForTimeout(450); await pause();
  for (const [id, form] of [['paladin',''],['rogue',''],['archer',''],['warrior',''],
    ['priest',''],['shaman',''],['warlock',''],['druid',''],['druid','bear'],['druid','tiger'],['frostmage','']]) {
    await page.getByTestId(`button-class-${id}`).click();
    if (form) await page.getByTestId(`button-form-${form}`).click();
    await waitStats(); await page.getByTestId('button-camera-reset').click(); await page.waitForTimeout(120);
    const name = id + (form ? `-${form}` : '');
    stats.push({ name, triangles: await page.getByTestId('text-model-triangles').textContent(),
      meshes: await page.getByTestId('text-model-meshes').textContent(),
      materials: await page.getByTestId('text-model-materials').textContent() });
    cards.push({ name, png: await shot(name) });
  }
  for (const id of ['paladin', 'rogue', 'archer']) {
    await page.getByTestId(`button-class-${id}`).click(); await waitStats();
    await page.getByTestId('button-camera-reset').click();
    for (const mode of ['idle', 'run', 'attack', 'cast']) {
      await page.getByTestId(`button-animation-${mode}`).click();
      await page.getByTestId('button-pause').click(); await page.waitForTimeout(620); await pause();
      await shot(`${id}-${mode}`);
    }
    await page.getByTestId('button-animation-idle').click();
    await page.getByTestId('button-camera-game').click();
    const box = await page.locator('[data-testid="canvas-roster-3d"] canvas').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + box.height / 2, box.y + box.height / 2, { steps: 20 });
    await page.mouse.up(); await page.waitForTimeout(450); await shot(`${id}-back`);
  }
  await page.getByTestId('button-class-priest').click(); await waitStats();
  await page.getByTestId('button-camera-reset').click(); await page.getByTestId('button-variant-shadow').click();
  await page.waitForTimeout(150); await shot('priest-shadow');
  await page.getByTestId('button-class-druid').click(); await page.getByTestId('button-form-tree').click(); await waitStats();
  assert.equal(await page.getByTestId('button-finish-roster-premium').count(), 0);
  assert.equal(await page.getByTestId('button-finish-base').getAttribute('aria-pressed'), 'true');
  await page.getByTestId('button-class-archer').click(); await waitStats();
  await page.getByTestId('button-mage-compare-idle').click();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label*="actual battle-size comparison"] figure img').length === 2);
  await page.locator('[aria-label*="actual battle-size comparison"]').screenshot({ path: 'screenshots/premium-roster-small-archer.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('button-camera-game').click(); await page.waitForTimeout(180);
  await page.screenshot({ path: 'screenshots/premium-roster-phone-gallery.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByTestId('button-camera-game').click(); await page.waitForTimeout(180);
  await page.locator('[data-testid="canvas-roster-3d"] canvas').screenshot({ path: 'screenshots/premium-roster-phone-landscape.png' });
  await page.close();
  } else { await page.close(); }

  const battle = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  battle.on('pageerror', e => errors.push(e.message));
  await battle.goto(`${base}/roster-battle-preview.html?premium=1&class=paladin`);
  await battle.waitForFunction(() => !document.querySelector('[data-testid="button-roster-premium"]').disabled);
  await battle.locator('summary').click(); await battle.getByTestId('button-lineup-busy').click();
  await battle.getByTestId('select-druid-ability').selectOption('custom'); await battle.getByTestId('button-roster-restart').click();
  await battle.waitForFunction(() => {
    const w = document.querySelector('iframe')?.contentWindow;
    return w?.RosterBattlePreview?.snapshot().phase === 'ready';
  });
  await battle.evaluate(() => document.querySelector('iframe').contentWindow.eval('if(rafId!==null)cancelAnimationFrame(rafId);rafId=null;'));
  const firstSwitch = await battle.evaluate(() => {
    const w = document.querySelector('iframe').contentWindow;
    const before = JSON.stringify(w.RosterBattleGame.snapshot());
    document.querySelector('[data-testid="button-roster-3d"]').click();
    return before === JSON.stringify(w.RosterBattleGame.snapshot());
  });
  await battle.waitForFunction(() => document.querySelector('[data-testid="button-roster-3d"]').getAttribute('aria-pressed') === 'true');
  const secondSwitch = await battle.evaluate(() => {
    const w = document.querySelector('iframe').contentWindow;
    const before = JSON.stringify(w.RosterBattleGame.snapshot());
    document.querySelector('[data-testid="button-roster-premium"]').click();
    return before === JSON.stringify(w.RosterBattleGame.snapshot());
  });
  const sameMatch = firstSwitch && secondSwitch;
  assert(sameMatch, 'finish switching must preserve exact ongoing match snapshot');
  await battle.waitForFunction(() => document.querySelector('[data-testid="button-roster-premium"]').getAttribute('aria-pressed') === 'true');
  await battle.evaluate(() => document.querySelector('iframe').contentWindow.eval('rafId=requestAnimationFrame(loop);'));
  try { await battle.waitForFunction(() => {
    const w = document.querySelector('iframe')?.contentWindow;
    return w?.RosterBattlePreview?.snapshot().modeCounts.attack > 0 && w.GameBody3DSource.totemsForRendering().length > 0;
  }, null, { timeout: 12000 }); busyPhaseReached = true; }
  catch (e) {
    console.log('Busy phase observation:', await battle.evaluate(() => {
      const w = document.querySelector('iframe').contentWindow;
      return { snapshot: w.RosterBattleGame.snapshot(), renderer: w.RosterBattlePreview.snapshot(),
        totems: w.GameBody3DSource?.totemsForRendering(), premiumPressed: document.querySelector('[data-testid="button-roster-premium"]').getAttribute('aria-pressed') };
    }));
    console.log('Full summon/totem phase was not reached in the bounded software-browser run; this is not a phone FPS approval.');
  }
  await battle.evaluate(() => document.querySelector('iframe').contentWindow.eval('if(rafId!==null)cancelAnimationFrame(rafId);rafId=null;'));
  await battle.locator('iframe').screenshot({ path: 'screenshots/premium-roster-battle.png' });
  await battle.getByTestId('button-benchmark-finish').click();
  await battle.waitForSelector('[data-testid="finish-benchmark-result"]', { timeout: 30000 });
  const cost = await battle.getByTestId('finish-benchmark-result').innerText();
  const live = await battle.evaluate(() => document.querySelector('iframe').contentWindow.RosterBattlePreview.snapshot());
  assert.equal(live.phase, 'ready');
  await battle.setViewportSize({ width: 390, height: 844 }); await battle.waitForTimeout(200);
  await battle.locator('iframe').screenshot({ path: 'screenshots/premium-roster-phone-battle.png' });
  await battle.setViewportSize({ width: 844, height: 390 }); await battle.waitForTimeout(200);
  await battle.locator('iframe').screenshot({ path: 'screenshots/premium-roster-landscape-battle.png' });

  const report = { stats, sameMatch, cost, live, busyPhaseReached, errors,
    note: 'SwiftShader desktop verification, not physical iPhone FPS. Warm paired atlas medians are not sustained full-game frame time. Mobile battle captures hold the same practice frame.' };
  console.log(JSON.stringify(report, null, 2));
  await writeFile('screenshots/premium-roster-verification.json', JSON.stringify(report, null, 2));
  if (cards.length) {
  const collage = await battle.evaluate(async cards => {
    const canvas = document.createElement('canvas'); canvas.width = 1800; canvas.height = 1530;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#14171d'; ctx.fillRect(0,0,1800,1530);
    ctx.fillStyle = '#edd497'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('Premium roster · actual procedural model captures', 28, 44);
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#b9c1cb'; ctx.fillText('Unpublished preview · same rigs · approved Cryomancer unchanged · phone FPS not verified', 28, 76);
    for (let i = 0; i < cards.length; i++) {
      const img = new Image(); img.src = 'data:image/png;base64,' + cards[i].png; await img.decode();
      const x = 20 + (i % 3) * 595, y = 105 + Math.floor(i / 3) * 350;
      ctx.drawImage(img, x, y, 575, 310); ctx.fillStyle = '#edd497'; ctx.font = 'bold 20px sans-serif';
      ctx.fillText(cards[i].name.replaceAll('-', ' '), x + 10, y + 338);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, cards);
  await writeFile('screenshots/premium-roster-overview.png', Buffer.from(collage, 'base64'));
  }
  assert.equal(errors.length, 0, errors.join('\n'));
} finally { await browser.close(); }