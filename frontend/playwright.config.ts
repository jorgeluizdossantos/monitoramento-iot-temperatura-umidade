import { defineConfig, devices } from '@playwright/test';
const matrix = process.env.PLAYWRIGHT_MATRIX;
export default defineConfig({
  testDir: './tests/e2e', use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: matrix ? [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 13'], defaultBrowserType: undefined, browserName: 'webkit' } },
    ...(matrix === 'local' ? [
      { name: 'chrome', use: { browserName: 'chromium' as const, channel: 'chrome' } },
      { name: 'edge', use: { browserName: 'chromium' as const, channel: 'msedge' } },
    ] : []),
  ] : [{ name: 'chromium', use: { channel: process.env.PLAYWRIGHT_CHANNEL || undefined } }],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
