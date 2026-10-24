import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { RECEIPTS } from '../fixtures/receipts'
import { backupWith, freeWriting, restoreBackup } from './seed'

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

test('a receipt photo reaches the real Gemini by itself and on a tap, and a fake key is refused in plain words', async ({ page }, testInfo) => {
  // A fictional receipt, its text as the phone read it, so it goes to the AI by itself.
  const data = readFileSync('tests/fixtures/photos/receipt-clean.png').toString('base64')
  const entry = { ...freeWriting('e1', '', 2), photos: [{ id: 'p1', text: RECEIPTS.find((r) => r.id === 'greenleaf')!.text }] }
  const photo = { id: 'p1', entryId: 'e1', type: 'image/jpeg', width: 600, height: 800, data, createdAt: 1, updatedAt: 1 }
  await restoreBackup(page, testInfo.outputPath('receipt.json'), backupWith({ entries: [entry], photos: [photo] }))
  await page.evaluate(async () => {
    const open = indexedDB.open('life-design')
    await new Promise((resolve) => (open.onsuccess = resolve))
    const tx = open.result.transaction('settings', 'readwrite')
    const store = tx.objectStore('settings')
    for (const [key, value] of [['aiProvider', 'gemini'], ['aiKey', 'AIza_fake_live_check'], ['aiModel', 'gemini-2.5-flash'], ['photoText', true]] as const)
      store.put({ key, value, updatedAt: 1 })
    await new Promise((resolve) => (tx.oncomplete = resolve))
    open.result.close()
  })
  await page.goto('./#/entries')
  await page.reload()
  await page.getByRole('button', { name: /^Photo/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Photo' })
  const refused = sheet.getByText("The key wasn't accepted. Check it in More → AI review.")
  await expect(refused).toBeVisible({ timeout: 20_000 })
  await sheet.getByRole('button', { name: 'Read with AI' }).click()
  await expect(sheet.getByRole('alert')).toHaveText("The key wasn't accepted. Check it in More → AI review.", { timeout: 20_000 })
})

test('with Groq for Ask and a key of its own for photos, a receipt reaches the real Gemini, and a fake key is refused', async ({ page }, testInfo) => {
  const data = readFileSync('tests/fixtures/photos/receipt-clean.png').toString('base64')
  const entry = { ...freeWriting('e1', '', 2), photos: [{ id: 'p1', text: RECEIPTS.find((r) => r.id === 'greenleaf')!.text }] }
  const photo = { id: 'p1', entryId: 'e1', type: 'image/jpeg', width: 600, height: 800, data, createdAt: 1, updatedAt: 1 }
  await restoreBackup(page, testInfo.outputPath('receipt.json'), backupWith({ entries: [entry], photos: [photo] }))
  const sent: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') sent.push(new URL(request.url()).host)
  })
  await page.evaluate(async () => {
    const open = indexedDB.open('life-design')
    await new Promise((resolve) => (open.onsuccess = resolve))
    const tx = open.result.transaction('settings', 'readwrite')
    const store = tx.objectStore('settings')
    const settings = [
      ['aiProvider', 'groq'],
      ['aiKey', 'gsk_fake_live_check'],
      ['aiModel', 'openai/gpt-oss-120b'],
      ['photoAiProvider', 'gemini'],
      ['photoAiKey', 'AIza_fake_live_check'],
      ['photoAiModel', 'gemini-2.5-flash'],
      ['photoText', true],
    ] as const
    for (const [key, value] of settings) store.put({ key, value, updatedAt: 1 })
    await new Promise((resolve) => (tx.oncomplete = resolve))
    open.result.close()
  })
  await page.goto('./#/entries')
  await page.reload()
  await page.getByRole('button', { name: /^Photo/ }).click()
  // The photo key is the one refused, so it says where that key is kept.
  await expect(page.getByRole('dialog', { name: 'Photo' }).getByText("The key wasn't accepted. Check it in More → Reading photos.")).toBeVisible({ timeout: 20_000 })
  expect(sent).toContain('generativelanguage.googleapis.com')
  expect(sent).not.toContain('api.groq.com')
})

test('the real Gemini refuses a fake key (its 400, not a 401), and the app says so plainly', async ({ page }) => {
  await page.goto('./#/more/ai')
  await page.getByRole('radio', { name: /Gemini/ }).check()
  await page.getByLabel('API key').fill('AIza_fake_live_check')
  await page.getByRole('button', { name: 'Check key' }).click()
  await expect(page.getByText("The key wasn't accepted. Check it in More → AI review.")).toBeVisible({ timeout: 20_000 })
})
