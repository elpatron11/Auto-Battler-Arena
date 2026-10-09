# Phone menu scrolling regression

Start the existing web and API workflows, then run:

```sh
# Run GuestPlay in Chromium and WebKit; with a saved session, also run Play.
pnpm exec playwright test --config artifacts/auto-battler-arena/playwright.mobile.config.mjs
```

The Play check uses a **test account**, not a production session. Save its signed-in Clerk browser storage to a local file and set `ARENA_E2E_STORAGE_STATE=/path/to/state.json` for the same command. Without that variable, Play is explicitly skipped; GuestPlay still runs. Set `ARENA_E2E_URL` if the app is not at `http://localhost:80`. Chromium defaults to the Replit browser binary. WebKit needs `pnpm exec playwright install webkit` **and the native browser libraries on the runner**; the current Replit container lacks those libraries, so run that project on a WebKit-capable CI/macOS runner. Do not commit the storage-state file. A release check should run both projects with the saved test session; skips or missing WebKit libraries are not passing coverage.

The test opens the real Play/GuestPlay iframe on a 390 × 844 touch viewport and switches to the long team-building menu. Chromium uses an Android user agent to exercise outer-page forwarding: timed synthetic swipes must move the outer menu and continue moving after release, reach the final class card, and leave dialog and battle touches alone. WebKit uses the iPhone user agent and **native iframe scrolling**: browser wheel input must move the iframe, reach the final card, scroll the dialog independently, and keep the outer page still. Wheel input does not prove touch-release inertia on iOS. Before release, also swipe a long menu on a **physical iPhone Safari**: confirm it coasts after release, the bottom card is reachable, the profile dialog scrolls without moving the page, and battle controls remain usable. Repeat in mobile Chromium if available. A simulated WebKit pass is not a claim of physical iPhone coverage.