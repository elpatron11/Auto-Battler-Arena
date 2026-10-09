import { test, expect } from '@playwright/test';

// Run against a fresh, signed-in test account whose Clerk browser storage state
// has been saved to ARENA_E2E_STORAGE_STATE. The app and API workflows must be
// running. Example: ARENA_E2E_STORAGE_STATE=/tmp/arena-user.json
// pnpm exec playwright test artifacts/auto-battler-arena/tests/matchEnd.spec.mjs
const storageState = process.env.ARENA_E2E_STORAGE_STATE;
test.use({
  baseURL: process.env.ARENA_E2E_URL || 'http://localhost:80',
  ...(storageState ? { storageState } : {}),
  launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium' },
});
test.setTimeout(120_000);

test('signed-in local match reveals its result after Priest resurrection and a failed final-hit effect, then plays again', async ({ page }) => {
  expect(storageState, 'Save a fresh signed-in Clerk test account as ARENA_E2E_STORAGE_STATE').toBeTruthy();
  await page.goto('/play');
  const game = page.frameLocator('[data-testid="iframe-game"]');
  // Fresh test accounts complete onboarding through the real game UI. Do not
  // seed a profile or bypass the React Play host / iframe bridge.
  await expect(game.locator('#onboardingScreen')).toBeVisible({ timeout: 30_000 });
  await game.locator('#newPlayerName').fill('Match End Test');
  for (const name of ['Priest', 'Warrior', 'Rogue'])
    await game.locator('#starterGrid .starterCard', { hasText: name }).click();
  await game.locator('#freeRacialGrid .freeRacialCard').first().click();
  await game.locator('#createProfileBtn').click();
  await game.locator('#tutorialSkipBtn').click();
  await expect(game.locator('#mainHub')).toBeVisible();
  await game.locator('#hubModeMount .modeBtn[data-size="1"]').click();
  await game.locator('#hubTeamBtn').click();
  await game.locator('#classGrid .card[data-key="priest"]').click();
  await game.locator('#buildModal .buildAdd').click();
  await game.locator('#mirrorToggle').check();
  await game.locator('#teamBuilderBackBtn').click();
  await expect(game.locator('#hubJoinBtn')).toBeEnabled();
  await game.locator('#hubJoinBtn').click();
  await game.locator('#priorityFightBtn').click();
  await expect(game.locator('#battleScreen')).toBeVisible();

  const iframe = page.frame({ url: /game\.html/ });
  expect(iframe, 'Play must contain the real game iframe').not.toBeNull();
  await iframe.evaluate(() => {
    // The UI launched the real combat loop. Only tune combatants to make the
    // Priest passive deterministic and fast; never set over/result or call
    // handleDeath, checkBattleEnd, finishBattle, or showOverlay from this test.
    const player = state.entities.find(e => e.team === 'player' && e.classId === 'priest');
    const enemy = state.entities.find(e => e.team === 'enemy' && e.classId === 'priest');
    if (!player || !enemy) throw new Error('The mirror match must contain both Priests');
    player.maxHp = 800;
    player.hp = 800;
    player.dmg = 180;
    player.atkCd = 0.25;
    // Priests otherwise sustain a mirror match with repeat heals and shields
    // for minutes. Disable only the opponent's casts, not its death passive:
    // the player's AI still has to land both killing blows through the
    // resurrection shield and the normal match-end check.
    enemy.maxHp = 12;
    enemy.hp = 1;
    enemy.status.shield = 0;
    enemy.status.silenceTimer = 120;
    enemy.casting = null;
    window.__firstMatch = state;
    window.__effectFailureCount = 0;
    window.__finalHitEffectCount = 0;
    const original = drawEffects;
    drawEffects = function(dt) {
      if (state === window.__firstMatch && state.over && state.effects.length && !window.__effectFailureCount) {
        window.__finalHitEffectCount = state.effects.length;
        window.__effectFailureCount++;
        throw new Error('Regression check: final-hit canvas effect failed');
      }
      return original(dt);
    };
  });

  await expect.poll(() => iframe.evaluate(() => state?.over), { timeout: 75_000 }).toBe(true);
  await expect(game.locator('#overlay')).toBeVisible({ timeout: 2_000 });
  await expect(game.locator('#resultText')).toHaveText(/^(Victory!|Defeat\.\.\.)$/);
  await expect(game.locator('#againBtn')).toBeVisible();
  expect(await iframe.evaluate(() => ({
    resurrected: window.__firstMatch.entities.some(e => e.classId === 'priest' && e.extra.hasResurrected),
    effectFailures: window.__effectFailureCount,
    finalHitEffects: window.__finalHitEffectCount,
  }))).toMatchObject({ resurrected: true, effectFailures: 1 });
  expect(await iframe.evaluate(() => window.__finalHitEffectCount)).toBeGreaterThan(0);

  await game.locator('#againBtn').click();
  await game.locator('#priorityFightBtn').click();
  await expect(game.locator('#battleScreen')).toBeVisible();
  await expect.poll(() => iframe.evaluate(() =>
    state !== window.__firstMatch && !state.over && document.getElementById('overlay').style.display === 'none'
  ), { timeout: 5_000 }).toBe(true);
  await expect.poll(() => iframe.evaluate(() => state.entities.some(e => e.team === 'enemy' && e.hp < e.maxHp)),
    { timeout: 15_000 }).toBe(true);
});