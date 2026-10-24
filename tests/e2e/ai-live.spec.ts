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

test('Ask your journal reaches the real Groq with its tools, and a fake key is refused in plain words', async ({ page }) => {
  // The key can't be saved through "Check key" when it's refused, so it's put on this test phone directly.
  await page.goto('./#/entries')
  await expect(page.getByLabel('Search your logs')).toBeVisible()
  await page.evaluate(async () => {
    const open = indexedDB.open('life-design')
    await new Promise((resolve) => (open.onsuccess = resolve))
    const tx = open.result.transaction('settings', 'readwrite')
    const store = tx.objectStore('settings')
    store.put({ key: 'aiKey', value: 'gsk_fake_live_check', updatedAt: 1 })
    store.put({ key: 'aiModel', value: 'openai/gpt-oss-120b', updatedAt: 1 })
    await new Promise((resolve) => (tx.oncomplete = resolve))
    open.result.close()
  })
  await page.goto('./#/ask')
  await page.reload() // the app sees a change made outside it once it reads the database again
  await page.getByLabel('What would you like to know?').fill('What groceries did I buy this month?')
  const ask = page.getByRole('region', { name: 'Ask your journal' })
  await ask.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(ask.getByText("The key wasn't accepted. Check it in More → AI review.")).toBeVisible({ timeout: 20_000 })
})

test('the real Gemini refuses a fake key (its 400, not a 401), and the app says so plainly', async ({ page }) => {
  await page.goto('./#/more/ai')
  await page.getByRole('radio', { name: /Gemini/ }).check()
  await page.getByLabel('API key').fill('AIza_fake_live_check')
  await page.getByRole('button', { name: 'Check key' }).click()
  await expect(page.getByText("The key wasn't accepted. Check it in More → AI review.")).toBeVisible({ timeout: 20_000 })
})
