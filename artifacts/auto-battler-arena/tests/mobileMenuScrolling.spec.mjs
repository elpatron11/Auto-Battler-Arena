import { expect, test } from '@playwright/test';

// Run with both app and API workflows serving the same origin. A saved Clerk
// session enables /play; /try runs without one. See mobileMenuScrolling.md.
const storageState = process.env.ARENA_E2E_STORAGE_STATE;
test.use({
  baseURL: process.env.ARENA_E2E_URL || 'http://localhost:80',
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
test.setTimeout(120_000);

async function enterMenu(page, signedIn, browserName) {
  await page.goto(signedIn ? '/play' : '/try');
  const selector = signedIn ? '[data-testid="iframe-game"]' : '[data-testid="iframe-guest-game"]';
  const game = page.frameLocator(selector);
  await expect(game.locator('#app')).toBeVisible({ timeout: 30_000 });

  if (await game.locator('#onboardingScreen').isVisible()) {
    await game.locator('#newPlayerName').fill('Scroll Check');
    for (const name of ['Priest', 'Warrior', 'Rogue'])
      await game.locator('#starterGrid .starterCard', { hasText: name }).click();
    await game.locator('#freeRacialGrid .freeRacialCard').first().click();
    await game.locator('#createProfileBtn').click();
  }
  if (await game.locator('#tutorialSkipBtn').isVisible())
    await game.locator('#tutorialSkipBtn').click();

  const frame = page.frame({ url: /game\.html/ });
  expect(frame, 'the real game iframe must load').not.toBeNull();
  await frame.evaluate(() => {
    // Use the game's long team-building menu, not a detached test page. The
    // compact hub may fit within a single phone viewport in guest mode.
    showMainHub();
    showTeamBuilder();
    document.getElementById('onboardingScreen').style.display = 'none';
  });
  await expect(game.locator('#classGrid .card').first()).toBeVisible();
  if (browserName === 'webkit')
    await expect.poll(() => frame.evaluate(() =>
      document.documentElement.scrollHeight - innerHeight)).toBeGreaterThan(300);
  else
    await expect.poll(() => page.locator(selector).evaluate(el =>
      el.parentElement.scrollHeight - el.parentElement.clientHeight)).toBeGreaterThan(300);
  return { frame, selector, game };
}

async function outerPosition(page, selector) {
  return page.locator(selector).evaluate(el => el.parentElement.scrollTop);
}

async function wheelIn(page, locator, distance = 410) {
  const bounds = await locator.boundingBox();
  expect(bounds, 'scroll target must be in the viewport').not.toBeNull();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + Math.min(bounds.height / 2, 180));
  await page.mouse.wheel(0, distance);
}

// Dispatch a timed touch sequence *inside* the same-origin iframe. This
// exercises the hook's non-passive listener and real requestAnimationFrame
// momentum in each engine; synthetic events cannot reproduce iOS hardware
// velocity or native scrolling, so keep the physical-device check in the doc.
async function swipe(frame, target, from = 340, to = 120) {
  const prevented = [];
  for (let index = 0; index <= 6; index++) {
    const phase = index === 0 ? 'touchstart' : 'touchmove';
    const y = from + (to - from) * index / 6;
    prevented.push(await frame.evaluate(({ target, phase, y }) => {
      const element = document.querySelector(target);
      if (!element) throw new Error(`Missing touch target: ${target}`);
      const touch = new Touch({ identifier: 1, target: element, clientX: 180, clientY: y });
      const event = new TouchEvent(phase, {
        bubbles: true, cancelable: true, touches: [touch],
        targetTouches: [touch], changedTouches: [touch],
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    }, { target, phase, y }));
    if (index < 6) await frame.page().waitForTimeout(18);
  }
  await frame.evaluate(target => {
    const element = document.querySelector(target);
    const touch = new Touch({ identifier: 1, target: element, clientX: 180, clientY: 120 });
    element.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true, cancelable: true, touches: [], changedTouches: [touch],
    }));
  }, target);
  return prevented;
}

for (const signedIn of [false, true]) {
  const route = signedIn ? 'Play' : 'GuestPlay';
  test.describe(`${route} phone menu`, () => {
    if (signedIn) {
      test.use(storageState ? { storageState } : {});
      test.skip(!storageState, 'Play requires ARENA_E2E_STORAGE_STATE with a signed-in test account');
    }
    test('scrolls long menus and preserves dialog and battle gestures', async ({ page, browserName }) => {
      const { frame, selector, game } = await enterMenu(page, signedIn, browserName);
      const ua = await page.evaluate(() => navigator.userAgent);
      if (browserName === 'webkit') {
        expect(ua).toMatch(/iPhone/);
        // WebKit on iPhone takes the native *iframe* scroll path. Browser wheel
        // input, unlike dispatchEvent, reaches the engine's scroll handling.
        // Hardware touch momentum still needs the physical-device check.
        expect(await page.locator(selector).evaluate(el => el.clientHeight))
          .toBeLessThanOrEqual(844);
        const firstCard = game.locator('#classGrid .card:first-child');
        await wheelIn(page, firstCard);
        await expect.poll(() => frame.evaluate(() => scrollY)).toBeGreaterThan(80);
        for (let i = 0; i < 12; i++) {
          const reached = await frame.evaluate(() => {
            const rect = document.querySelector('#classGrid .card:last-child').getBoundingClientRect();
            return rect.top >= 0 && rect.bottom <= innerHeight;
          });
          if (reached) break;
          // Keep the pointer over the iframe rather than calling
          // scrollIntoView, which would mask a stuck native scroll surface.
          const box = await page.locator(selector).boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, 410);
        }
        expect(await frame.evaluate(() => {
          const rect = document.querySelector('#classGrid .card:last-child').getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        }), 'the last class card is reachable by browser input').toBe(true);
        expect(await outerPosition(page, selector), 'native scroll remains inside iframe').toBe(0);
      } else {
      expect(ua).toMatch(/Android/);
      await page.locator(selector).evaluate(el => { el.parentElement.scrollTop = 0; });
      const prevented = await swipe(frame, '#classGrid .card:first-child');
      expect(prevented.slice(1).every(Boolean), 'menu moves must be forwarded').toBe(true);
      const atRelease = await outerPosition(page, selector);
      expect(atRelease).toBeGreaterThan(100);
      await expect.poll(() => outerPosition(page, selector), { timeout: 1_500 })
        .toBeGreaterThan(atRelease + 8);

      // Keep swiping without programmatic scrollIntoView: the bottom card must
      // eventually be on screen through the same iframe-to-host gesture.
      for (let i = 0; i < 12; i++) {
        if (await game.locator('#classGrid .card:last-child').isVisible() &&
          await page.locator(selector).evaluate(el => {
            const card = el.contentDocument.querySelector('#classGrid .card:last-child');
            const rect = card.getBoundingClientRect();
            const outer = el.parentElement.getBoundingClientRect();
            return rect.top + el.getBoundingClientRect().top >= outer.top &&
              rect.bottom + el.getBoundingClientRect().top <= outer.bottom;
          })) break;
        await swipe(frame, '#classGrid .card:first-child');
      }
      expect(await page.locator(selector).evaluate(el => {
        const rect = el.contentDocument.querySelector('#classGrid .card:last-child').getBoundingClientRect();
        const frameTop = el.getBoundingClientRect().top;
        const outer = el.parentElement.getBoundingClientRect();
        return rect.top + frameTop >= outer.top && rect.bottom + frameTop <= outer.bottom;
      }), 'the last real menu card is reachable').toBe(true);
      }

      // Show the game's real scrollable dialog without running its unrelated
      // profile collection renderer (the scrolling contract is CSS + target).
      await frame.evaluate(() => {
        const modal = document.getElementById('profileModal');
        modal.style.display = 'flex';
        const box = modal.querySelector('.profileBox');
        const content = document.createElement('div');
        content.style.height = '1500px';
        content.textContent = 'Additional profile details';
        content.dataset.scrollFixture = '';
        box.append(content);
      });
      await expect(game.locator('#profileModal')).toBeVisible();
      expect(await frame.evaluate(() => {
        const box = document.querySelector('#profileModal .profileBox');
        return box.scrollHeight > box.clientHeight;
      }), 'profile dialog must be independently scrollable').toBe(true);
      const beforeDialog = browserName === 'webkit'
        ? await frame.evaluate(() => scrollY)
        : await outerPosition(page, selector);
      if (browserName === 'webkit') {
        await wheelIn(page, game.locator('#profileModal .profileBox'));
        await expect.poll(() => frame.evaluate(() =>
          document.querySelector('#profileModal .profileBox').scrollTop)).toBeGreaterThan(30);
        expect(await frame.evaluate(() => scrollY)).toBe(beforeDialog);
      } else {
        const dialogMoves = await swipe(frame, '#profileModal .profileBox');
        expect(dialogMoves.slice(1).some(Boolean), 'dialog owns its gesture').toBe(false);
        expect(await outerPosition(page, selector)).toBe(beforeDialog);
      }
      await frame.evaluate(() => { document.getElementById('profileModal').style.display = 'none'; });

      await frame.evaluate(() => document.body.classList.add('battleMode'));
      await expect.poll(() => page.locator(selector).evaluate(el => el.getBoundingClientRect().height))
        .toBeLessThanOrEqual(844);
      const beforeBattle = await outerPosition(page, selector);
      if (browserName === 'webkit') {
        expect(await frame.evaluate(() => scrollY)).toBe(0);
        await wheelIn(page, game.locator('#controls'));
        // Battle controls do not hand input to the outer page.
        expect(beforeBattle).toBe(0);
        expect(await outerPosition(page, selector)).toBe(0);
      } else {
        const battleMoves = await swipe(frame, '#controls');
        expect(battleMoves.slice(1).some(Boolean), 'battle controls own their gesture').toBe(false);
        expect(await outerPosition(page, selector)).toBe(beforeBattle);
      }
      await frame.evaluate(() => document.body.classList.remove('battleMode'));
    });
  });
}