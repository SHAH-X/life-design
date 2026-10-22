import { expect, test } from '@playwright/test'

// A live check with fake data (CLAUDE.md: anything that calls an outside API gets one). It calls the real Groq, through
// the real code path, with a fake key that can only be refused: the app must say so in plain words. Only runs when
// asked: AI_LIVE=1 npx playwright test tests/e2e/ai-live.spec.ts (add E2E_BASE_URL for the live site).
test.skip(!process.env.AI_LIVE, 'Live check only: set AI_LIVE=1')

test('the real Groq refuses a fake key, and the app says so plainly', async ({ page }) => {
  await page.goto('./#/more/ai')
  await page.getByLabel('API key').fill('gsk_fake_live_check')
  await page.getByRole('button', { name: 'Check key' }).click()
  await expect(page.getByText("The key wasn't accepted. Check it in More → AI review.")).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('API key')).toBeVisible()
})
