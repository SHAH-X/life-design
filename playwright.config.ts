import { defineConfig, devices } from '@playwright/test'

// Set E2E_BASE_URL to test a deployed site (e.g. https://shah-x.github.io/life-design/) instead of a local build.
const LIVE_URL = process.env.E2E_BASE_URL
const BASE_URL = LIVE_URL ?? 'http://localhost:4173/life-design/'

// End-to-end tests run the production build in WebKit (Safari's engine) at iPhone size.
export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'iphone-webkit', use: { ...devices['iPhone 16'] } }],
  webServer: LIVE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
