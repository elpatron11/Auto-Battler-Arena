import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'mobileMenuScrolling.spec.mjs',
  reporter: 'list',
  workers: 1,
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        // Chromium follows the non-iOS outer-scroll branch of the hook.
        userAgent: devices['Pixel 7'].userAgent,
        launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium' },
      },
    },
    { name: 'webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});