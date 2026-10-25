import { expect, type Page, test } from '@playwright/test'
import { captureShareSheet, expectNoScores, sharedFile } from './helpers'
import { backupWith, freeWriting, restoreBackup } from './seed'

// The Shopping tab (v0.19) in WebKit: what was spent, from the receipts in photos, worked out on the phone with no AI.
// Fictional receipts, as an AI read them (so every shop, date and price is exact). No AI is called.

const SATURDAY = new Date(2026, 9, 24, 20, 0)

type Item = [name: string, pence: number]
const reading = (shop: string, date: string | null, items: Item[], total?: number) => ({
  by: 'Gemini · gemini-2.5-flash',
  at: SATURDAY.getTime(),
  text: '',
  description: '',
  receipt: { shop, date, currency: '£', items: items.map(([name, price]) => ({ name, price, quantity: 1 })), total: total ?? items.reduce((s, [, p]) => s + p, 0) },
})

const daysBefore = (date: string) => Math.round((new Date(2026, 9, 24).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000)
const receiptEntry = (id: string, date: string, ai: ReturnType<typeof reading>) => ({ ...freeWriting(`e-${id}`, '', daysBefore(date), SATURDAY), photos: [{ id, text: null, ai }] })

const MILK = 'Semi Skimmed Milk 2.27L'
const ENTRIES = [
  receiptEntry('t1', '2026-09-12', reading('Tesco Express', '2026-09-12', [[MILK, 145], ['Bananas', 95]])),
  receiptEntry('t2', '2026-10-03', reading('TESCO', '2026-10-03', [[MILK, 145], ['Bananas', 95], ['Bread', 120]])),
  receiptEntry('a1', '2026-10-05', reading('ALDI', '2026-10-05', [['Coffee', 450]], 999)),
  receiptEntry('t3', '2026-10-10', reading('Tesco', '2026-10-10', [['Bananas', 95], ['Pasta', 80], ['Clubcard saving', -50]])),
  receiptEntry('t4', '2026-10-17', reading('Tesco Stores Ltd', '2026-10-17', [[MILK, 165], ['Pasta', 80]])),
  // No date read: it counts on its entry's day, the 23rd.
  receiptEntry('j1', '2026-10-23', reading('J Sainsbury plc', null, [['Big shop', 4210]])),
]

async function restoreReceipts(page: Page, path: string) {
  await restoreBackup(page, path, backupWith({ entries: ENTRIES }, SATURDAY))
}

const line = (page: Page, text: string | RegExp) => page.locator('details.week-line > summary', { hasText: text })

test.use({ serviceWorkers: 'block', locale: 'en-GB' })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(SATURDAY)
})

test('Shopping has its own tab: the month so far, next to last month by the same day, every line opening its receipts', async ({ page }, testInfo) => {
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Shopping' }).click()
  await expect(page).toHaveURL(/#\/shopping$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Shopping' })).toBeVisible()

  // £3.60 + £9.99 (what Aldi's printed, though its items don't add up) + £1.25 + £2.45 + £42.10, added up in pence.
  await expect(page.getByRole('paragraph').filter({ hasText: /^October so far$/ })).toBeVisible()
  await expect(page.getByRole('strong')).toHaveText('£59.39')
  await expect(line(page, 'By 24 September')).toContainText('£2.40')
  await expect(line(page, '5 receipts from 3 shops')).toBeVisible()
  await expect(line(page, '£0.50 off with offers')).toBeVisible()

  // Where: Tesco's three names as one shop, ranked with 3 receipts; the rest by name.
  const where = page.getByRole('region', { name: 'Where' })
  await expect(where.locator('summary').first()).toHaveText('TESCO · 3 receipts · £7.30')
  await expect(where.getByText('Fewer than 3 receipts, by name')).toBeVisible()
  await expect(where.locator('summary', { hasText: 'ALDI' })).toHaveText('ALDI · 1 receipt · £9.99')
  await expect(where.locator('summary', { hasText: 'J Sainsbury plc' })).toBeVisible()
  await expect(where.locator('summary', { hasText: 'shops under £10' })).toHaveText('4 shops under £10 · £17.29 in all')

  // A line opens to its receipts, and a receipt opens its entry.
  await where.locator('summary').first().click()
  const tesco = where.locator('details.week-line').first().locator('.evidence-list li')
  await expect(tesco).toHaveCount(3)
  await expect(tesco.first()).toHaveText('Sat 17 Oct Tesco Stores Ltd · £2.45')
  await tesco.first().getByRole('button').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click()

  // The same milk at the same shop, at its price before and now.
  await expect(page.getByRole('region', { name: 'Price changes at the same shop' }).locator('summary')).toHaveText(`${MILK} · TESCO: £1.45 on 3 Oct, £1.65 on 17 Oct`)
  const again = page.getByRole('region', { name: 'Bought again and again' }).locator('summary')
  await expect(again).toHaveText([`${MILK} · on 3 receipts · £4.55`, 'Bananas · on 3 receipts · £2.85'])

  // To check: the receipt that doesn't add up, and the one with no date read.
  const check = page.getByRole('region', { name: 'To check' }).locator('li')
  await expect(check).toHaveText([/J Sainsbury plc · £42\.10 · no date read/, /ALDI · £9\.99 · its items don't add up to its total/])

  for (const summary of await page.locator('details.week-line > summary').all()) await summary.click()
  await expectNoScores(page, 'Shopping, opened')
})

test('the chart has a table and a readout, and an earlier month has its own page', async ({ page }, testInfo) => {
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.goto('./#/shopping')

  const chart = page.locator('figure.chart', { hasText: 'Spent each month' })
  await chart.getByText('Show as table').click()
  await expect(chart.locator('tbody tr')).toHaveText([/^May 2026–0$/, /^June 2026–0$/, /^July 2026–0$/, /^August 2026–0$/, /^September 2026£2\.401$/, /^October so far£59\.395$/])
  // A tapped month says what it came to, and opens.
  await chart.locator('.chart-hit').nth(4).click()
  await expect(chart.locator('.chart-readout')).toHaveText('September 2026: £2.40 · 1 receipt')
  await chart.getByRole('link', { name: 'Open September 2026 ›' }).click()
  await expect(page).toHaveURL(/#\/shopping\/2026-09$/)
  await expect(page.getByRole('heading', { level: 1, name: 'September 2026' })).toBeVisible()
  await expect(page.getByRole('strong')).toHaveText('£2.40')
  // The page's month has its amount on its column's cap, in pounds and pence.
  await expect(page.locator('figure.chart svg text', { hasText: '£2.' })).toHaveText('£2.40')
  await expectNoScores(page, 'Shopping → September')

  // From this month, Earlier months lists it too.
  await page.getByRole('link', { name: '‹ Shopping' }).click()
  await expect(page.getByRole('region', { name: 'Earlier months' }).getByRole('link')).toHaveText([/September 2026\s*£2\.40 · 1 receipt/])
})

test('Share as a spreadsheet gives every item, a row each, through the share menu', async ({ page }, testInfo) => {
  await captureShareSheet(page)
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.goto('./#/shopping')
  await page.getByRole('button', { name: 'Share as a spreadsheet' }).click()
  const dialog = page.getByRole('dialog', { name: 'Shopping as a spreadsheet' })
  await expect(dialog.getByText('12 items on 6 receipts')).toBeVisible()
  await dialog.getByRole('button', { name: 'Save or share…' }).click()
  const file = await sharedFile(page)
  expect(file.name).toBe('life-design-shopping-2026-10-24.csv')
  const rows = file.text.replace(/^﻿/, '').trimEnd().split('\r\n')
  expect(rows[0]).toBe('date,shop,item,quantity,price,currency,receipt_total,adds_up,date_read,read_by')
  expect(rows).toHaveLength(13)
  expect(rows).toContain('2026-10-10,Tesco,Clubcard saving,1,-0.50,£,1.25,yes,yes,Gemini · gemini-2.5-flash')
})

test('with no receipts, Shopping says where they come from', async ({ page }) => {
  await page.goto('./#/shopping')
  await expect(page.getByRole('heading', { level: 1, name: 'Shopping' })).toBeVisible()
  await expect(page.getByText('Receipts you photograph show here.')).toBeVisible()
})
