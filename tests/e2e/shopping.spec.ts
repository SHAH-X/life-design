import { expect, type Page, test } from '@playwright/test'
import { captureShareSheet, expectNoScores, sharedFile } from './helpers'
import { REFUND_SLIP } from '../fixtures/receipts'
import { backupWith, freeWriting, restoreBackup } from './seed'

// Money's receipts (v0.19 as the Shopping tab, part of Money from v0.20) in WebKit: what was spent, from the receipts in
// photos, worked out on the phone with no AI.
// Fictional receipts, as an AI read them (so every shop, date and price is exact). No AI is called.

const SATURDAY = new Date(2026, 9, 24, 20, 0)

type Item = [name: string, pence: number, kind?: string]
const reading = (shop: string, date: string | null, items: Item[], total?: number) => ({
  by: 'Gemini · gemini-2.5-flash',
  at: SATURDAY.getTime(),
  text: '',
  description: '',
  receipt: { shop, date, currency: '£', items: items.map(([name, price, kind]) => ({ name, price, quantity: 1, ...(kind ? { kind } : {}) })), total: total ?? items.reduce((s, [, p]) => s + p, 0) },
})

const daysBefore = (date: string) => Math.round((new Date(2026, 9, 24).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000)
const receiptEntry = (id: string, date: string, ai: ReturnType<typeof reading>) => ({ ...freeWriting(`e-${id}`, '', daysBefore(date), SATURDAY), photos: [{ id, text: null, ai }] })

const MILK = 'Semi Skimmed Milk 2.27L'
const ENTRIES = [
  receiptEntry('t1', '2026-09-12', reading('Tesco Express', '2026-09-12', [[MILK, 145, 'Dairy and eggs'], ['Bananas', 95, 'Fruit and veg']])),
  receiptEntry('t2', '2026-10-03', reading('TESCO', '2026-10-03', [[MILK, 145, 'Dairy and eggs'], ['Bananas', 95, 'Fruit and veg'], ['Bread', 120, 'Bread and bakery']])),
  receiptEntry('a1', '2026-10-05', reading('ALDI', '2026-10-05', [['Coffee', 450, 'Drinks']], 999)),
  receiptEntry('t3', '2026-10-10', reading('Tesco', '2026-10-10', [['Bananas', 95, 'Fruit and veg'], ['Pasta', 80, 'Cupboard'], ['Clubcard saving', -50]])),
  receiptEntry('t4', '2026-10-17', reading('Tesco Stores Ltd', '2026-10-17', [[MILK, 165, 'Dairy and eggs'], ['Pasta', 80, 'Cupboard']])),
  // No date read: it counts on its entry's day, the 23rd. Its item has no kind: read before kinds.
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

test('Money has its own tab, receipts and all: the month so far, next to last month by the same day, every line opening its receipts', async ({ page }, testInfo) => {
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Money' }).click()
  await expect(page).toHaveURL(/#\/money$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible()
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()

  // £3.60 + £9.99 (what Aldi's printed, though its items don't add up) + £1.25 + £2.45 + £42.10, added up in pence.
  await expect(page.getByRole('paragraph').filter({ hasText: /^October so far$/ })).toBeVisible()
  await expect(page.getByRole('strong')).toHaveText('£59.39 spent')
  await expect(line(page, 'By 24 September')).toContainText('£2.40')
  await expect(line(page, '5 receipts from 3 shops')).toBeVisible()
  await expect(line(page, '£0.50 off with offers')).toBeVisible()

  // Where: Tesco's three names as one shop, ranked with 3 receipts; the rest by name.
  const where = page.getByRole('region', { name: 'Shops' })
  await expect(where.locator('summary').first()).toHaveText('TESCO · 3 receipts · £7.30')
  await expect(where.getByText('Fewer than 3 receipts, by name')).toBeVisible()
  await expect(where.locator('summary', { hasText: 'ALDI' })).toHaveText('ALDI · 1 receipt · £9.99')
  await expect(where.locator('summary', { hasText: 'J Sainsbury plc' })).toBeVisible()
  await expect(where.locator('summary', { hasText: 'shops under £10' })).toHaveText('4 shops under £10 · £17.29 in all')

  // A line opens to its receipts, and a receipt opens to its items.
  await where.locator('summary').first().click()
  const tesco = where.locator('details.week-line').first().locator('.evidence-list li')
  await expect(tesco).toHaveCount(3)
  await expect(tesco.first()).toHaveText('Sat 17 Oct Tesco Stores Ltd · £2.45')
  await tesco.first().getByRole('button').click()
  await expect(page.getByRole('dialog', { name: 'Tesco Stores Ltd' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()

  // By kind: none has 3 items, so they're in the list's own order, never ranked; then what has no kind.
  const kinds = page.getByRole('region', { name: 'By kind' })
  await expect(kinds.getByText('Items at what you paid, after offers')).toBeVisible()
  await expect(kinds.locator('summary')).toHaveText([
    'Fruit and veg · 2 items · £1.90',
    'Dairy and eggs · 2 items · £3.10',
    'Bread and bakery · 1 item · £1.20',
    // Pasta at what was paid, its Clubcard saving taken off (v0.20.19).
    'Cupboard · 2 items · £1.10',
    'Drinks · 1 item · £4.50',
    'Not sorted · 1 item on 1 receipt · £42.10',
  ])
  await kinds.locator('summary', { hasText: 'Dairy and eggs' }).click()
  const dairy = kinds.locator('details.week-line', { hasText: 'Dairy and eggs' }).locator('.evidence-list li')
  await expect(dairy).toHaveText([`Sat 17 Oct ${MILK} · Tesco Stores Ltd · £1.65`, `Sat 3 Oct ${MILK} · TESCO · £1.45`])

  // The same milk at the same shop, at its price before and now.
  await expect(page.getByRole('region', { name: 'Price changes at the same shop' }).locator('summary')).toHaveText(`${MILK} · TESCO: £1.45 on 3 Oct, £1.65 on 17 Oct`)
  const again = page.getByRole('region', { name: 'Bought again and again' }).locator('summary')
  await expect(again).toHaveText([`${MILK}3× · on 3 receipts · £4.55`, 'Bananas3× · on 3 receipts · £2.85'])

  // To check: the receipt that doesn't add up, and the one with no date read.
  const check = page.getByRole('region', { name: 'Receipts to check' }).locator('li')
  await expect(check.locator('details > summary')).toHaveText([
    /Date not read · using Fri 23 Oct.*J Sainsbury plc · £42\.10/,
    /Total doesn't add up.*ALDI · £9\.99/,
  ])
  await expect(check.locator('details[open]')).toHaveCount(0)

  for (const summary of await page.locator('details.week-line > summary').all()) await summary.click()
  await expectNoScores(page, 'Money, opened')
})

// Owner, 2026-10-31: "i cannot see the item in that receipt or which category the item … is assigned to", and things
// "returned … whose refund is obtained" should not count in the expense.
test('a receipt opens to its items, each with its price and kind; you can choose another kind, or say you returned it', async ({ page }, testInfo) => {
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await line(page, '5 receipts from 3 shops').click()
  await page.getByRole('button', { name: /Sat 3 Oct TESCO/ }).click()

  const receipt = page.getByRole('dialog', { name: 'TESCO' })
  const items = receipt.getByRole('list', { name: 'Items' }).getByRole('listitem')
  await expect(items).toHaveText([`${MILK} · £1.45Dairy and eggs`, 'Bananas · £0.95Fruit and veg', 'Bread · £1.20Bread and bakery'])
  await expect(receipt.getByText('Total £3.60', { exact: true })).toBeVisible()

  // Another kind: Bread moves to Cupboard.
  await items.nth(2).getByRole('button').click()
  const bread = page.getByRole('dialog', { name: 'Bread' })
  await expect(bread.getByRole('radio', { name: 'Bread and bakery' })).toBeChecked()
  await bread.getByText('Cupboard', { exact: true }).click()
  await expect(items.nth(2)).toHaveText('Bread · £1.20Cupboard')

  // Returned: the milk comes off what was spent, its row says so, and it stays on the receipt.
  await items.nth(0).getByRole('button').click()
  await page.getByRole('dialog', { name: MILK }).getByText('I returned it').click()
  await expect(items.nth(0)).toHaveText(`${MILK} · £1.45Dairy and eggs · Returned`)
  await expect(receipt.getByText('Total £3.60 · £1.45 returned · £2.15 spent')).toBeVisible()
  await receipt.getByRole('button', { name: 'Close', exact: true }).click()

  await expect(page.getByRole('strong')).toHaveText('£57.94 spent')
  await expect(page.getByRole('button', { name: /Sat 3 Oct TESCO/ })).toHaveText('Sat 3 Oct TESCO · £2.15 · 1 returned')
  const kinds = page.getByRole('region', { name: 'By kind' })
  await expect(kinds.locator('summary', { hasText: 'Dairy and eggs' })).toHaveText('Dairy and eggs · 1 item · £1.65')
  await expect(kinds.locator('summary', { hasText: 'Cupboard' })).toHaveText('Cupboard · 3 items · £2.30')

  // Kept: after a reload, and the entry still opens from the receipt.
  await page.reload()
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(page.getByRole('strong')).toHaveText('£57.94 spent')
  await line(page, '5 receipts from 3 shops').click()
  await page.getByRole('button', { name: /Sat 3 Oct TESCO/ }).click()
  await page.getByRole('dialog', { name: 'TESCO' }).getByRole('button', { name: 'Open the entry' }).click()
  await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible()
})

// Owner, 2026-11-01: "the infant's formula milk goes into 'dairy and eggs'". A kind chosen for an item is kept for that
// item at that shop, on every receipt, so it is fixed once.
test('a kind chosen for an item follows it on every receipt at that shop, and not at another; "Back to the AI’s guess" undoes it', async ({ page }, testInfo) => {
  const FORMULA = 'EXAMPLE INFANT MILK 800G'
  const entries = [
    receiptEntry('f1', '2026-10-03', reading('Tesco Express', '2026-10-03', [[FORMULA, 1450, 'Dairy and eggs'], ['Bananas', 95, 'Fruit and veg']])),
    receiptEntry('f2', '2026-10-10', reading('TESCO', '2026-10-10', [[FORMULA, 1450, 'Dairy and eggs']])),
    receiptEntry('f3', '2026-10-17', reading('ASDA', '2026-10-17', [[FORMULA, 1399, 'Dairy and eggs']])),
  ]
  await restoreBackup(page, testInfo.outputPath('formula.json'), backupWith({ entries }, SATURDAY))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  const kinds = page.getByRole('region', { name: 'By kind' })
  await expect(kinds.locator('summary', { hasText: 'Dairy and eggs' })).toHaveText('Dairy and eggs · 3 items · £42.99')
  await expect(kinds.locator('summary', { hasText: 'Baby and toddler' })).toHaveCount(0)

  // Chosen on one Tesco receipt: both Tesco receipts follow it, the ASDA one stays as read.
  await line(page, /3 receipts from 2 shops/).click()
  await page.getByRole('button', { name: /Sat 10 Oct TESCO/ }).click()
  const receipt = page.getByRole('dialog', { name: 'TESCO' })
  await receipt.getByRole('list', { name: 'Items' }).getByRole('listitem').nth(0).getByRole('button').click()
  const item = page.getByRole('dialog', { name: FORMULA })
  await expect(item).toContainText('Later receipts with this item at TESCO follow its kind and who it was for.')
  await expect(item.getByRole('radio', { name: /Back to the AI/ })).toHaveCount(0)
  await item.getByText('Baby and toddler', { exact: true }).click()
  await expect(receipt.getByRole('list', { name: 'Items' }).getByRole('listitem').nth(0)).toHaveText(`${FORMULA} · £14.50Baby and toddler`)
  await receipt.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(kinds.locator('summary', { hasText: 'Baby and toddler' })).toHaveText('Baby and toddler · 2 items · £29.00')
  await expect(kinds.locator('summary', { hasText: 'Dairy and eggs' })).toHaveText('Dairy and eggs · 1 item · £13.99')

  // Kept after a reload.
  await page.reload()
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(page.getByRole('region', { name: 'By kind' }).locator('summary', { hasText: 'Baby and toddler' })).toHaveText('Baby and toddler · 2 items · £29.00')

  // From the other Tesco receipt it can be given back to the AI's guess, for them all.
  await line(page, /3 receipts from 2 shops/).click()
  await page.getByRole('button', { name: /Sat 3 Oct Tesco Express/ }).click()
  await page.getByRole('dialog', { name: 'Tesco Express' }).getByRole('list', { name: 'Items' }).getByRole('listitem').nth(0).getByRole('button').click()
  const again = page.getByRole('dialog', { name: FORMULA })
  await expect(again.getByRole('radio', { name: 'Baby and toddler' })).toBeChecked()
  await again.getByText('Back to the AI’s guess', { exact: true }).click()
  await page.getByRole('dialog', { name: 'Tesco Express' }).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('region', { name: 'By kind' }).locator('summary', { hasText: 'Dairy and eggs' })).toHaveText('Dairy and eggs · 3 items · £42.99')
})

// v0.20.39 (owner, 2026-11-01: what goes on one person): an item is filed under who it was for, for that item at that
// shop on every receipt; what was bought is then totalled by name. Receipts and accounts are never added.
test('an item can be filed under who it was for, on every receipt at that shop, and what was bought is totalled by name', async ({ page }, testInfo) => {
  const FORMULA = 'EXAMPLE INFANT MILK 800G'
  const entries = [
    receiptEntry('f1', '2026-10-03', reading('Tesco Express', '2026-10-03', [[FORMULA, 1450, 'Baby and toddler'], ['Bananas', 95, 'Fruit and veg']])),
    receiptEntry('f2', '2026-10-10', reading('TESCO', '2026-10-10', [[FORMULA, 1450, 'Baby and toddler']])),
    receiptEntry('f3', '2026-10-17', reading('ASDA', '2026-10-17', [[FORMULA, 1399, 'Baby and toddler']])),
  ]
  // Priya is in an entry: offered as a name.
  const withPeople = [...entries, { ...freeWriting('e-people', '', 3, SATURDAY), people: ['Priya'] }]
  await restoreBackup(page, testInfo.outputPath('items-for.json'), backupWith({ entries: withPeople }, SATURDAY))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  // Nothing is filed: no block.
  await expect(page.getByRole('region', { name: 'Who it was for' })).toHaveCount(0)

  // On one Tesco receipt: both Tesco receipts follow, the ASDA one does not.
  await line(page, /3 receipts from 2 shops/).click()
  await page.getByRole('button', { name: /Sat 10 Oct TESCO/ }).click()
  const receipt = page.getByRole('dialog', { name: 'TESCO' })
  await receipt.getByRole('list', { name: 'Items' }).getByRole('listitem').nth(0).getByRole('button').click()
  const item = page.getByRole('dialog', { name: FORMULA })
  await item.getByRole('button', { name: '+ Who was it for?' }).click()
  const forSheet = page.getByRole('dialog', { name: 'Who was it for?' })
  await expect(forSheet.getByRole('radiogroup', { name: 'Applies to' })).toHaveCount(0)
  await expect(forSheet.getByRole('button', { name: 'Priya' })).toBeVisible()
  await forSheet.getByRole('textbox', { name: 'A new name' }).fill('Riya')
  await forSheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(item.getByRole('button', { name: 'For: Riya' })).toBeVisible()
  await item.getByRole('button', { name: 'Close' }).click()
  await receipt.getByRole('button', { name: 'Close', exact: true }).click()
  const who = page.getByRole('region', { name: 'Who it was for' })
  await expect(who.locator('summary')).toHaveText(['Riya · 2 items · £29.00', 'Nobody in particular · 2 items · £14.94'])

  // It opens to its items, is kept after a reload, and the ASDA one is filed from its own receipt, from the list.
  await who.locator('summary', { hasText: 'Riya' }).click()
  await expect(who.locator('details', { hasText: 'Riya' }).getByRole('button')).toHaveCount(2)
  await page.reload()
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Who it was for' }).locator('summary')).toHaveText(['Riya · 2 items · £29.00', 'Nobody in particular · 2 items · £14.94'])
  await line(page, /3 receipts from 2 shops/).click()
  await page.getByRole('button', { name: /Sat 17 Oct ASDA/ }).click()
  await page.getByRole('dialog', { name: 'ASDA' }).getByRole('list', { name: 'Items' }).getByRole('listitem').nth(0).getByRole('button').click()
  await page.getByRole('dialog', { name: FORMULA }).getByRole('button', { name: '+ Who was it for?' }).click()
  await page.getByRole('dialog', { name: 'Who was it for?' }).getByRole('radio', { name: 'Riya' }).click()
  await page.getByRole('dialog', { name: FORMULA }).getByRole('button', { name: 'Close' }).click()
  await page.getByRole('dialog', { name: 'ASDA' }).getByRole('button', { name: 'Close', exact: true }).click()
  // Three items now: ranked, with what no name was given to last.
  await expect(page.getByRole('region', { name: 'Who it was for' }).locator('summary')).toHaveText(['Riya · 3 items · £42.99', 'Nobody in particular · 1 item · £0.95'])
})

// Owner, 2026-11-01: a multi-buy offer printed as a saving said "Offer on the whole receipt" and only what it took off; it is
// for those 2 items, and says what the pair cost. The sums are as they were.
test('a "2 for £3.00" offer says it is for 2 items and what they cost together, and the receipt still adds up', async ({ page }, testInfo) => {
  const entries = [
    receiptEntry('c1', '2026-10-12', reading('EXAMPLE CASH & CARRY', '2026-10-12', [
      ['Example snack A, 200g', 199, 'Snacks and sweets'],
      ['Example snack B, 200g', 199, 'Snacks and sweets'],
      ['Snack, 2 for £3.00', -98],
      ['Example snack C, 200g', 199, 'Snacks and sweets'],
      ['Example snack D, 200g', 229, 'Snacks and sweets'],
      ['Snack, 2 for £3.00', -128],
      ['Clubcard saving', -10],
    ])),
  ]
  await restoreBackup(page, testInfo.outputPath('multibuy.json'), backupWith({ entries }, SATURDAY))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await line(page, /1 receipt from 1 shop/).click()
  await page.getByRole('button', { name: /Mon 12 Oct EXAMPLE CASH/ }).click()
  const receipt = page.getByRole('dialog', { name: 'EXAMPLE CASH & CARRY' })
  const items = receipt.getByRole('list', { name: 'Items' }).getByRole('listitem')
  await expect(items).toHaveText([
    'Example snack A, 200g · £1.99Snacks and sweets',
    'Example snack B, 200g · £1.99Snacks and sweets',
    'Snack, 2 for £3.00 · -£0.98Offer on 2 items: £3.00 for the pair',
    'Example snack C, 200g · £1.99Snacks and sweets',
    'Example snack D, 200g · £2.29Snacks and sweets',
    'Snack, 2 for £3.00 · -£1.28Offer on 2 items: £3.00 for the pair',
    'Clubcard saving · -£0.10Offer on the whole receipt',
  ])
  // £8.26 of items less £2.36 of offers: unchanged by the wording.
  await expect(receipt.getByText(/Total £5\.90/)).toBeVisible()
})

// Owner, 2026-11-01: a return slip showed as spent; "just show it as refund receipt at max, don't include in any
// calculation, as I will also be marking it as returned in the original receipt".
test('a refund slip is shown as money back, counted nowhere, and opens to what came back', async ({ page }, testInfo) => {
  // As an AI may read one: plus amounts, its total "the total paid", the slip's own words in its text.
  const slip = { ...reading('ASDA', '2026-10-22', [['Kids Coat', 750, 'Clothes and shoes'], ['Kids Socks', 325, 'Clothes and shoes']]), text: REFUND_SLIP }
  await restoreBackup(page, testInfo.outputPath('receipts.json'), backupWith({ entries: [...ENTRIES, receiptEntry('r1', '2026-10-22', slip)] }, SATURDAY))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()

  // The month as it was without it.
  await expect(page.getByRole('strong')).toHaveText('£59.39 spent')
  await expect(line(page, '5 receipts from 3 shops')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Shops' }).locator('summary', { hasText: 'ASDA' })).toHaveCount(0)

  await line(page, '1 refund · £10.75 back').click()
  await expect(line(page, '1 refund · £10.75 back')).toHaveText('1 refund · £10.75 back · not counted')
  await page.getByRole('button', { name: /Thu 22 Oct ASDA/ }).click()
  const refund = page.getByRole('dialog', { name: 'ASDA refund' })
  await expect(refund.getByRole('list', { name: 'Items' }).getByRole('listitem')).toHaveText(['Kids Coat · £7.50 backClothes and shoes', 'Kids Socks · £3.25 backClothes and shoes'])
  await expect(refund.getByText('Total £10.75 back · to a gift card', { exact: true })).toBeVisible()
  await expect(refund.getByRole('list', { name: 'Items' }).getByRole('button')).toHaveCount(0)
})

// Owner, 2026-11-01: a saving "is just amount saved on that product"; show what was paid, what it was, and the saving.
test('a saving joins the item it follows: what was paid, what it was and what came off, never a row of its own', async ({ page }, testInfo) => {
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await line(page, '5 receipts from 3 shops').click()
  await page.getByRole('button', { name: /Sat 10 Oct Tesco/ }).click()
  const receipt = page.getByRole('dialog', { name: 'Tesco' })
  await expect(receipt.getByRole('list', { name: 'Items' }).getByRole('listitem')).toHaveText(['Bananas · £0.95Fruit and veg', 'Pasta · £0.30Was £0.80 · £0.50 offCupboard'])
  await expect(receipt.getByText('Total £1.25 · £0.50 off with offers', { exact: true })).toBeVisible()
})

test('the chart has a table and a readout, and an earlier month has its own page', async ({ page }, testInfo) => {
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  // An old link to Shopping opens Money.
  await page.goto('./#/shopping')
  await expect(page.getByRole('button', { name: 'Receipts', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const chart = page.locator('figure.chart', { hasText: 'Receipts each month' })
  await chart.getByText('Show as table').click()
  await expect(chart.locator('tbody tr')).toHaveText([/^May 2026–0$/, /^June 2026–0$/, /^July 2026–0$/, /^August 2026–0$/, /^September 2026£2\.401$/, /^October so far£59\.395$/])
  // A tapped month says what it came to, and opens.
  await chart.locator('.chart-hit').nth(4).click()
  await expect(chart.locator('.chart-readout')).toHaveText('September 2026: £2.40 · 1 receipt')
  await chart.getByRole('link', { name: 'Open September 2026 ›' }).click()
  await expect(page).toHaveURL(/#\/money\/2026-09$/)
  await expect(page.getByRole('heading', { level: 1, name: 'September 2026' })).toBeVisible()
  await expect(page.getByRole('strong')).toHaveText('£2.40 spent')
  // The page's month has its amount on its column's cap, in pounds and pence.
  await expect(page.locator('figure.chart svg text', { hasText: '£2.' })).toHaveText('£2.40')
  await expectNoScores(page, 'Money → September')

  // From this month, Earlier months lists it too.
  await page.getByRole('link', { name: '‹ Money' }).click()
  await expect(page.getByRole('region', { name: 'Earlier months' }).getByRole('link')).toHaveText([/September 2026\s*£2\.40 on 1 receipt/])
})

test('Share as a spreadsheet gives every item, a row each, through the share menu', async ({ page }, testInfo) => {
  await captureShareSheet(page)
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await page.getByRole('button', { name: 'Share as a spreadsheet' }).click()
  const dialog = page.getByRole('dialog', { name: 'Receipts as a spreadsheet' })
  await expect(dialog.getByText('11 items on 6 receipts')).toBeVisible()
  await dialog.getByRole('button', { name: 'Save or share…' }).click()
  const file = await sharedFile(page)
  expect(file.name).toBe('life-design-shopping-2026-10-24.csv')
  const rows = file.text.replace(/^﻿/, '').trimEnd().split('\r\n')
  expect(rows[0]).toBe('date,shop,item,as_printed,kind,quantity,price,currency,receipt_total,adds_up,date_read,read_by,returned,saving')
  expect(rows).toHaveLength(12)
  // The Clubcard saving joins the Pasta before it (v0.20.19): what was paid, and what the offer took off.
  expect(rows).toContain('2026-10-10,Tesco,Pasta,Pasta,Cupboard,1,0.30,£,1.25,yes,yes,Gemini · gemini-2.5-flash,,0.50')
  expect(rows).toContain('2026-10-03,TESCO,Bananas,Bananas,Fruit and veg,1,0.95,£,3.60,yes,yes,Gemini · gemini-2.5-flash,,')
})

// Owner, 2026-10-25: "if i upload the same receipt twice, it counts it twice".
test('a duplicate receipt identifies the extra entry, explains deletion, and leaves the original counted', async ({ page }, testInfo) => {
  const tea = reading('Corner Shop', '2026-10-20', [['Tea', 300, 'Drinks'], ['Milk', 120, 'Dairy and eggs']])
  const first = receiptEntry('first', '2026-10-20', tea)
  const again = receiptEntry('again', '2026-10-22', tea) // the same photo, added two days later
  await restoreBackup(page, testInfo.outputPath('receipts.json'), backupWith({ entries: [first, again] }, SATURDAY))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(page.getByRole('strong')).toHaveText('£4.20 spent')
  const check = page.getByRole('region', { name: 'Receipts to check' }).locator('li')
  await expect(check.locator('details > summary')).toContainText('Duplicate · counted once')
  await expect(check).not.toContainText('This deletes the whole entry')
  await check.locator('summary').click()
  await expect(check).toContainText('Extra entry Thu 22 Oct · kept Tue 20 Oct.')
  await check.getByRole('button', { name: 'Open extra entry' }).click()
  const duplicate = page.getByRole('dialog', { name: 'Photo' })
  await expect(duplicate.getByText('Already in Money from an earlier photo: counted once.')).toBeVisible()
  await duplicate.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(duplicate.getByText('Delete this entry and its photos?')).toBeVisible()
  await duplicate.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(page.getByRole('strong')).toHaveText('£4.20 spent')
  await expect(page.getByRole('region', { name: 'Receipts to check' })).toHaveCount(0)
})

test('a duplicate photo in the same entry says no action is needed', async ({ page }, testInfo) => {
  const tea = reading('Corner Shop', '2026-10-20', [['Tea', 300, 'Drinks'], ['Milk', 120, 'Dairy and eggs']])
  const first = receiptEntry('same-entry', '2026-10-20', tea)
  const sameEntry = { ...first, photos: [...first.photos!, { ...first.photos![0]!, id: 'same-entry-copy' }] }
  await restoreBackup(page, testInfo.outputPath('same-entry.json'), backupWith({ entries: [sameEntry] }, SATURDAY))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Receipts to check' })).toHaveCount(0)
})

test('an undated receipt can be accepted or matched to a statement payment, then unlinked', async ({ page }, testInfo) => {
  const undated = receiptEntry('undated', '2026-10-23', reading('Corner Shop', null, [['Tea and milk', 420]]))
  const payment = {
    id: 'statement-payment',
    account: 'Example Current',
    date: '2026-10-24',
    amount: -420,
    description: 'CORNER SHOP',
    type: 'DEB',
    balance: 10000,
    adds: true,
    createdAt: SATURDAY.getTime(),
    updatedAt: SATURDAY.getTime(),
  }
  await restoreBackup(page, testInfo.outputPath('undated-receipt.json'), backupWith({ entries: [undated], bankLines: [payment] }, SATURDAY))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  const check = page.getByRole('region', { name: 'Receipts to check' })
  await expect(check.locator('details > summary')).toHaveText(/Date not read · using Fri 23 Oct.*Corner Shop · £4\.20/)
  await check.locator('summary').click()
  await expect(check).toContainText('Using the day this entry was added.')
  await check.getByRole('button', { name: 'Match a payment' }).click()
  const match = page.getByRole('dialog', { name: 'Match a payment' })
  await expect(match.getByRole('radio', { name: /CORNER SHOP · Sat 24 Oct/ })).toBeVisible()
  await match.getByRole('radio', { name: /CORNER SHOP · Sat 24 Oct/ }).check()
  await match.getByRole('button', { name: 'Match receipt' }).click()
  await expect(check).toHaveCount(0)

  await page.getByRole('button', { name: 'Accounts', exact: true }).click()
  const moneyOut = page.getByRole('region', { name: 'Money out' })
  // Money out is under Spending (v0.20.14); one payment is its own row (v0.20.17), opening directly.
  await page.locator('.acc-tabs').getByRole('button', { name: 'Spending', exact: true }).click()
  await moneyOut.getByRole('button', { name: /CORNER SHOP.*Receipt £4\.20/i }).click()
  const paymentSheet = page.getByRole('dialog', { name: 'CORNER SHOP' })
  await paymentSheet.getByRole('button', { name: 'Unlink receipt' }).click()
  await expect(page.getByRole('dialog', { name: 'CORNER SHOP' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  const needsDate = page.getByRole('region', { name: 'Receipts to check' })
  await needsDate.locator('summary').click()
  await needsDate.getByRole('button', { name: 'Use Fri 23 Oct' }).click()
  await expect(needsDate).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Receipts to check' })).toHaveCount(0)
})

test('a dated receipt can be matched to a smaller debit with an owner-recorded reason', async ({ page }, testInfo) => {
  const datedReceipt = receiptEntry('dated-mismatch', '2026-10-10', reading('Corner Shop', '2026-10-10', [['Groceries', 9650]]))
  const payment = {
    id: 'discounted-card-payment',
    account: 'Example Current',
    date: '2026-10-11',
    amount: -9071,
    description: 'CORNER SHOP',
    type: 'DEB',
    balance: 10000,
    adds: true,
    createdAt: SATURDAY.getTime(),
    updatedAt: SATURDAY.getTime(),
  }
  await restoreBackup(page, testInfo.outputPath('dated-receipt-mismatch.json'), backupWith({ entries: [datedReceipt], bankLines: [payment] }, SATURDAY))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()

  await expect(page.getByRole('strong')).toHaveText('£96.50 spent')
  const check = page.getByRole('region', { name: 'Receipts to check' })
  await expect(check.locator('details > summary')).toContainText('Payment differs')
  await check.locator('summary').click()
  await expect(check).toContainText('receipt £96.50 · debit £90.71 · difference £5.79')
  await check.getByRole('button', { name: 'Review payment' }).click()

  const match = page.getByRole('dialog', { name: 'Match a payment' })
  await expect(match).toContainText('Receipt total: £96.50')
  await expect(match).toContainText('Debit £90.71')
  await expect(match).toContainText('difference £5.79')
  await expect(match.getByRole('button', { name: 'Match receipt' })).toBeDisabled()
  await match.getByRole('radio', { name: /CORNER SHOP/ }).check()
  await expect(match.getByRole('button', { name: 'Match receipt' })).toBeDisabled()
  await match.getByRole('radio', { name: 'Gift-card discount' }).check()
  await expect(match.getByRole('button', { name: 'Match receipt' })).toBeEnabled()
  await match.getByRole('button', { name: 'Match receipt' }).click()
  await expect(check).toHaveCount(0)

  await expect(page.getByRole('strong')).toHaveText('£96.50 spent')
  await page.getByRole('button', { name: 'Accounts', exact: true }).click()
  await expect(page.getByRole('strong')).toHaveText('£90.71 out')
  const moneyOut = page.getByRole('region', { name: 'Money out' })
  await page.locator('.acc-tabs').getByRole('button', { name: 'Spending', exact: true }).click()
  // The row says it has a receipt, at the debit's amount; the sheet gives both amounts and why they differ.
  await moneyOut.getByRole('button', { name: /CORNER SHOP.*Receipt £90\.71$/i }).click()
  const paymentSheet = page.getByRole('dialog', { name: 'CORNER SHOP' })
  await expect(paymentSheet).toContainText('Receipt £96.50 · debit £90.71 · difference £5.79 · Gift-card discount')
  await paymentSheet.getByRole('button', { name: 'Unlink receipt' }).click()
  await expect(paymentSheet).toHaveCount(0)
  await expect(moneyOut).toContainText('£90.71')
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(check).toContainText('Payment differs')
  await check.locator('summary').click()
  await check.getByRole('button', { name: 'Review payment' }).click()
  const secondMatch = page.getByRole('dialog', { name: 'Match a payment' })
  await secondMatch.getByRole('radio', { name: /CORNER SHOP/ }).check()
  await secondMatch.getByRole('radio', { name: 'Another reason' }).check()
  const reason = secondMatch.getByRole('textbox', { name: 'Explain the difference' })
  await expect(reason).toBeFocused()
  await reason.fill('Part paid with a stored-value card')
  await secondMatch.getByRole('button', { name: 'Match receipt' }).click()
  await page.getByRole('button', { name: 'Accounts', exact: true }).click()
  await page.locator('.acc-tabs').getByRole('button', { name: 'Spending', exact: true }).click()
  await moneyOut.getByRole('button', { name: /CORNER SHOP.*Receipt £90\.71$/i }).click()
  await expect(paymentSheet).toContainText('Receipt £96.50 · debit £90.71 · difference £5.79 · Part paid with a stored-value card')
})

test('with no receipts, Money says where they come from', async ({ page }) => {
  await page.goto('./#/money')
  await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible()
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  await expect(page.getByText('Receipts you photograph show here.')).toBeVisible()
})
