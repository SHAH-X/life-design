import { expect, type Page, test } from '@playwright/test'
import { entryButton, swipe } from './helpers'

// Photos (v0.16) in WebKit at iPhone size: added in the writer, kept, read on the phone by the real model (from this
// site) in its own worker, found by their words. The photo is a fictional receipt (tests/fixtures/photos/).

const RECEIPT = 'tests/fixtures/photos/receipt-clean.png'
const MODEL_TIME = 90_000

/** Every request the page and its workers make. */
function watchRequests(page: Page) {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  return urls
}

async function addReceipt(page: Page) {
  await page.goto('./#/today')
  await page.getByRole('button', { name: /^What's on your mind\?/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await sheet.locator('input[type="file"]').setInputFiles(RECEIPT)
  await expect(sheet.getByRole('img', { name: 'Photo 1' })).toBeVisible()
  return sheet
}

test.describe('photos', () => {
  test.use({ serviceWorkers: 'block' })

  test('a photo can be the whole entry; turned on, its text is read on the phone and found by its words, and nothing leaves this site', async ({ page, baseURL }) => {
    test.setTimeout(180_000)
    const urls = watchRequests(page)
    const sheet = await addReceipt(page)
    const offer = sheet.locator('aside.notice', { hasText: 'Read the text in photos' })
    await offer.getByRole('button', { name: 'Turn on' }).click()
    await expect(offer).toBeHidden()
    await sheet.getByRole('button', { name: 'Save' }).click()

    const saved = page.getByRole('dialog', { name: 'Photo' })
    await expect(saved.getByRole('img', { name: 'Photo 1' })).toBeVisible()
    const text = saved.getByText('Text in this photo')
    await expect(text).toBeVisible({ timeout: MODEL_TIME })
    await text.click()
    await expect(saved.locator('.photo-text')).toContainText(/GREENLEAF MARKET/i)
    await saved.getByRole('button', { name: 'Done', exact: true }).click()

    await page.goto('./#/entries')
    await page.getByLabel('Search your logs').fill('sourdough')
    await expect(entryButton(page, 'Photo')).toBeVisible()

    const site = new URL(baseURL!).origin
    expect(urls.filter((u) => !u.startsWith(site) && !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([])
  })

  test('a photo taken off in the writer is gone; deleting the entry takes its photo, and Undo brings both back', async ({ page }) => {
    const sheet = await addReceipt(page)
    await sheet.getByRole('button', { name: 'Remove photo 1' }).click()
    await expect(sheet.getByRole('img', { name: 'Photo 1' })).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
    await sheet.locator('input[type="file"]').setInputFiles(RECEIPT)
    await sheet.getByLabel("What's on your mind?").fill('Shopping for the week')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('dialog', { name: 'Free writing' }).getByRole('button', { name: 'Done', exact: true }).click()

    const row = entryButton(page, 'Free writing')
    await expect(row).toContainText('Photo')
    await swipe(page, row, -150)
    await page.getByRole('button', { name: 'Delete Free writing' }).click()
    await expect(row).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()
    await row.click()
    await expect(page.getByRole('dialog', { name: 'Free writing' }).getByRole('img', { name: 'Photo 1' })).toBeVisible()
  })
})
