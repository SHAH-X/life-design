import { expect, test } from '@playwright/test'
import { backupWith, freeWriting, restoreBackup } from './seed'

// Step 6 (owner-approved plan, 2026-11-23): quick answers about your money and papers, worked out on the phone (no AI sees your bank
// payments), and one quiet line on Today. Everything here is made up.

test.use({ serviceWorkers: 'block', locale: 'en-GB' })

const ACCOUNT = 'Example Current'
let n = 0
const pay = (date: string, pounds: number, description: string) => ({ id: `p${n++}`, account: ACCOUNT, date, amount: Math.round(pounds * 100), description, type: 'DD', balance: null, adds: true, createdAt: 1, updatedAt: 1 })
const BANK = [
  ...[['2026-05-03', 112], ['2026-06-03', 118], ['2026-07-03', 121], ['2026-08-03', 119], ['2026-09-03', 111], ['2026-10-03', 145]].map(([d, p]) => pay(String(d), -Number(p), 'OCTOPUS ENERGY')),
  pay('2026-09-05', -38, 'TESCO STORES 1234'),
  pay('2026-09-15', -55, 'TESCO STORES 1234'),
  pay('2026-09-28', -62, 'TESCO STORES 1234'),
  pay('2026-10-05', -42, 'TESCO STORES 1234'),
  pay('2026-10-12', -185, 'TESCO STORES 1234'),
  pay('2026-10-26', -25, 'TESCO STORES 1234'),
  pay('2026-08-08', -10.99, 'STREAMCO'),
  pay('2026-09-08', -10.99, 'STREAMCO'),
  pay('2026-10-08', -10.99, 'STREAMCO'),
  pay('2026-10-28', 1500, 'EXAMPLE EMPLOYER SALARY'),
]
const STATEMENTS = [{ id: 'example:2026-05-01:2026-10-31', account: ACCOUNT, from: '2026-05-01', to: '2026-10-31', lines: BANK.length, createdAt: 1, updatedAt: 1 }]
const BILLS = [{ id: 'b1', name: 'Home insurance', kind: 'Insurance', amount: 24000, every: 'year', next: '2026-12-10', renewal: '2027-01-12', method: '', notes: '', payee: null, createdAt: 1, updatedAt: 1 }]
const DOCUMENTS = [{ id: 'd1', title: 'Washing machine warranty', type: 'Warranty', kind: 'pdf', mime: 'application/pdf', size: 3, pages: 1, text: '', tracked: [{ date: '2026-12-01', kind: 'ends', label: 'Warranty ends' }], dismissed: [], billId: null, notes: '', createdAt: 1, updatedAt: 1 }]
const FILES = [{ id: 'd1', data: 'QUJD', createdAt: 1, updatedAt: 1 }]

const NOW = new Date(2026, 10, 23, 12, 0)
const daysBefore = (date: string) => Math.round((NOW.getTime() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000)
const reading = (shop: string, date: string, items: [string, number][]) => ({
  by: 'Gemini · gemini-2.5-flash',
  at: NOW.getTime(),
  text: '',
  description: '',
  receipt: { shop, date, currency: '£', items: items.map(([name, price]) => ({ name, price, quantity: 1 })), total: items.reduce((s, [, p]) => s + p, 0) },
})
const receiptEntry = (id: string, date: string, ai: ReturnType<typeof reading>) => ({ ...freeWriting(`e-${id}`, '', daysBefore(date), NOW), photos: [{ id, text: null, ai }] })
const MILK = 'Semi Skimmed Milk 2.27L'
const ENTRIES = [receiptEntry('t1', '2026-10-03', reading('Tesco', '2026-10-03', [[MILK, 145]])), receiptEntry('t2', '2026-10-17', reading('Tesco', '2026-10-17', [[MILK, 165]])), receiptEntry('a1', '2026-10-05', reading('Asda', '2026-10-05', [['Milk Semi Skimmed 2.27L', 155]]))]
const PRODUCTS = [{ id: 'p1', members: ['tesco|semi skimmed milk 2.27l', 'asda|milk semi skimmed 2.27l'], notSame: [], regular: true, createdAt: 1, updatedAt: 1 }]

test('Your money and papers: eight questions answered on the phone, each with its period, nothing sent anywhere', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(NOW)
  const outside: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) outside.push(r.url())
  })
  await restoreBackup(page, testInfo.outputPath('answers.json'), backupWith({ bankLines: BANK, statements: STATEMENTS, bills: BILLS, documents: DOCUMENTS, documentFiles: FILES, entries: ENTRIES, products: PRODUCTS }, NOW))
  await page.goto('./#/ask')
  const card = page.getByRole('region', { name: 'Your money and papers' })
  await expect(card).toContainText('no AI sees your bank payments')
  await expect(card.getByRole('button')).toHaveText(['Spent on a kind last month', 'Biggest expenses', 'How a cost changed', 'Bills and subscriptions', 'Due in the next 30 days', 'Prices that rose', 'Cheapest shop for what I buy', 'What needs a look'])
  const sheet = page.getByRole('dialog')
  const close = () => sheet.getByRole('button', { name: 'Close', exact: true }).click()

  // What was spent on a kind: the total and payments, its payees, the period; a kind's payments open under it.
  await card.getByRole('button', { name: 'Spent on a kind last month' }).click()
  await expect(sheet).toContainText('Groceries in October 2026')
  await expect(sheet).toContainText('1 – 31 October 2026 · from Example Current')
  await expect(sheet.locator('.answer-row').first()).toContainText('All of it£252.003 payments')
  await sheet.locator('.answer-row', { hasText: 'Tesco' }).nth(1).locator('summary').click()
  await expect(sheet.getByRole('list', { name: 'Tesco: the payments' }).getByRole('listitem')).toHaveCount(3)
  await sheet.getByRole('button', { name: 'Energy', exact: true }).click()
  await expect(sheet).toContainText('Energy in October 2026')
  await expect(sheet.locator('.answer-row').first()).toContainText('£145.00')
  await close()

  await card.getByRole('button', { name: 'Biggest expenses' }).click()
  await expect(sheet.getByRole('heading', { name: 'By who was paid' })).toBeVisible()
  await expect(sheet.locator('.answer-row').first()).toContainText('Tesco£252.00')
  await expect(sheet.getByRole('heading', { name: 'Biggest single payments' })).toBeVisible()
  await expect(sheet).toContainText('£185.00')
  await close()

  // How a cost changed: the months from the statements, the latest against the one before, an estimate, a thing to look at: kept apart.
  await card.getByRole('button', { name: 'How a cost changed' }).click()
  await sheet.getByRole('button', { name: 'Energy', exact: true }).click()
  await expect(sheet).toContainText('1 May – 31 October 2026 · from Example Current')
  await expect(sheet.locator('.answer-row')).toHaveText([/May£112\.00/, /June£118\.00/, /July£121\.00/, /August£119\.00/, /September£111\.00/, /October£145\.00/])
  await expect(sheet).toContainText('October is £34.00 more than September.')
  // A row that opens to its payments shows no browser triangle above its label.
  await expect(sheet.locator('.answer-row > summary').first()).toHaveCSS('list-style-type', 'none')
  await expect(sheet.locator('.answer-card').filter({ hasText: 'An estimate' })).toContainText('a year of it would come to £1,740.00 (12 × £145.00)')
  await expect(sheet.locator('.answer-card').filter({ hasText: 'A thing to look at' })).toContainText('Octopus Energy is a regular payment that went up by £34.00 a month')
  await close()

  await card.getByRole('button', { name: 'Bills and subscriptions' }).click()
  await expect(sheet.getByRole('heading', { name: 'Your bills' })).toBeVisible()
  await expect(sheet).toContainText('Home insurance£240.00')
  await expect(sheet.getByRole('heading', { name: 'Found in your statements, not listed' })).toBeVisible()
  await expect(sheet).toContainText('Octopus Energy')
  await expect(sheet).toContainText('Streamco')
  await expect(sheet.locator('.answer-card')).toContainText('A year of the bills you listed comes to £240.00')
  await close()

  await card.getByRole('button', { name: 'Due in the next 30 days' }).click()
  await expect(sheet.locator('.answer-row')).toHaveText([/Washing machine warranty.*ends/, /Octopus Energy.*£145\.00.*around/, /Streamco.*£10\.99.*around/, /Home insurance.*£240\.00.*around/])
  await expect(sheet).toContainText('a pattern, not a promise')
  await expect(sheet.locator('.answer-card')).toContainText('About £395.99 to pay')
  await close()

  await card.getByRole('button', { name: 'Prices that rose' }).click()
  await expect(sheet.locator('.answer-row')).toHaveText([new RegExp(`${MILK}▲ £0\\.20.*Tesco · £1\\.45 → £1\\.65`)])
  await close()

  await card.getByRole('button', { name: 'Cheapest shop for what I buy' }).click()
  await expect(sheet.locator('.answer-row').first()).toContainText(`${MILK}Asda £0.68 a litre`)
  await expect(sheet.locator('.answer-card')).toContainText('Asda was £0.05 a litre less when last bought; it may have changed since.')
  await expect(sheet).toContainText('Not what a shop charges now.')
  await close()

  await card.getByRole('button', { name: 'What needs a look' }).click()
  await expect(sheet.locator('.answer-row')).toHaveText([/Washing machine warranty.*ends.*in 8 days/, /Home insurance.*renews.*in 50 days/, /Example Current.*statement needed: nothing after/])
  await close()

  // Nothing went anywhere: no request to any address but this app's own.
  expect(outside).toEqual([])
})

test('Today: one quiet line about your money, shown once, newest first', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 30, 12, 0)
  await page.clock.setFixedTime(now)
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
  await restoreBackup(page, testInfo.outputPath('notice.json'), backupWith({ bankLines: BANK, statements: STATEMENTS, entries: ENTRIES, products: PRODUCTS, settings: [{ key: 'lastExportAt', value: now.getTime(), updatedAt: 1 }] }, now))
  await page.goto('./#/today')
  const strip = page.getByRole('complementary', { name: 'About your money' })
  // (A backup is marked as made, so its reminder, which comes first, is not showing.) The price that rose on 17 Oct is newer than the payment on 12 Oct.
  await expect(strip).toContainText(`${MILK} rose £0.20 at Tesco on`)
  await expect(page.getByRole('complementary')).toHaveCount(1)
  await strip.getByRole('button', { name: 'Got it' }).click()
  await expect(strip).toContainText('£185.00 to Tesco on')
  await expect(strip).toContainText('The most before was £62.00.')
  // Seen means gone, also after a reload.
  await page.reload()
  await expect(strip).toContainText('£185.00 to Tesco on')
  await strip.getByRole('button', { name: 'See it' }).click()
  await expect(page).toHaveURL(/#\/money\/2026-10$/)
  await page.goto('./#/today')
  await expect(page.getByRole('complementary', { name: 'About your money' })).toHaveCount(0)
})
