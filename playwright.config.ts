import { defineConfig, devices } from '@playwright/test'

// The browser scenario runs against the production server: built `dist/` plus the API, real time.
// Port 3100 keeps clear of the dev API daemon on 3000.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts', // not *.test.ts, so Vitest never picks these files up
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://127.0.0.1:3100/api/health',
    env: { PORT: '3100' },
    reuseExistingServer: false,
  },
})
