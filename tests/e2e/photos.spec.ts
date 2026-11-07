import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { entryButton, swipe } from './helpers'
import { backupWith, freeWriting, restoreBackup } from './seed'

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

  test('a turned receipt read before its lines were put in order is read again by itself, and then counted (v0.24.2)', async ({ page }, testInfo) => {
    // Owner, 2026-11-07: a restaurant receipt photographed a little turned had its prices read on lines of their own, or
    // before their names, so it wasn't taken for a receipt. The photo is fictional, laid out like it.
    test.setTimeout(180_000)
    const now = new Date(2026, 9, 20, 12, 0)
    await page.clock.setFixedTime(now)
    const asReadBefore = 'VAT No：123 4567 89\nRiverside Park\n0.00 No Allergy Declared\n7.25 Halloumi Wrap\n10.40 Chicken Burger\n14.71 Subtotal\n2.94\nTax\n17.65 Eat In Total'
    const data = readFileSync('tests/fixtures/photos/receipt-turned.png').toString('base64')
    const photo = { id: 'p1', entryId: 'e1', type: 'image/jpeg', width: 900, height: 1500, data, createdAt: 1, updatedAt: 1 }
    const entry = { ...freeWriting('e1', '', 6, now), photos: [{ id: 'p1', text: asReadBefore }] }
    await restoreBackup(page, testInfo.outputPath('turned.json'), backupWith({ entries: [entry], photos: [photo] }, now))
    await page.goto('./#/money/2026-10')
    await page.getByRole('button', { name: 'Receipts', exact: true }).click()
    await expect(page.getByText('Receipts you photograph show here.')).toBeVisible()

    await page.goto('./#/more/photos')
    await page.getByRole('switch', { name: /Read the text in photos/ }).check()
    await page.goto('./#/entries')
    await entryButton(page, 'Photo').click()
    const saved = page.getByRole('dialog', { name: 'Photo' })
    await saved.getByText('Text in this photo').click()
    await expect(saved.locator('.photo-text')).toContainText('Halloumi Wrap 7.25', { timeout: MODEL_TIME })
    await expect(saved.locator('.photo-text')).toContainText('Chicken Burger 10.40')
    await saved.getByRole('button', { name: 'Done', exact: true }).click()

    await page.goto('./#/money/2026-10')
    await page.getByRole('button', { name: 'Receipts', exact: true }).click()
    const receipts = page.getByRole('region', { name: 'From your receipts' })
    await expect(receipts.getByText('17.65 spent')).toBeVisible()
    await expect(receipts.getByText('1 receipt from 1 shop')).toBeVisible()
  })
})
