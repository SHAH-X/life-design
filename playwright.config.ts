import { defineConfig, devices } from '@playwright/test'

// Set E2E_BASE_URL to test a deployed site (e.g. https://shah-x.github.io/life-design/) instead of a local build.
const LIVE_URL = process.env.E2E_BASE_URL
const BASE_URL = LIVE_URL ?? 'http://localhost:4173/life-design/'

// End-to-end tests run the production build in WebKit (Safari's engine) at iPhone size.
export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // A missing reference screenshot fails; it's never written quietly (v0.12.2: a run with an old setting wrote two
  // stale ones that nearly got committed). Make new ones on purpose: npm run screens -- --update-snapshots=missing
  updateSnapshots: 'none',
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'iphone-webkit', use: { ...devices['iPhone 17'] } }], // the owner's phone
  webServer: LIVE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: BASE_URL,
        // Never a server already running: a preview left from an older build was tested instead of the code (v0.12.4).
        // With one on the port the run refuses (stop it first: the iOS Simulator check uses its own).
        reuseExistingServer: false,
        timeout: 180_000,
      },
})
