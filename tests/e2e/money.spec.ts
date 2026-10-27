import { writeFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { expectNoScores } from './helpers'
import { backupWith, freeWriting, restoreBackup } from './seed'
import { makePdf, type Placed } from '../fixtures/pdf'
import { FLEX_LIKE, LLOYDS_LIKE, MONZO_LIKE } from '../fixtures/statements'

// Bank and card statements (v0.20, step 1) in WebKit at iPhone size: a statement's PDF chosen in the app, read on the
// phone by PDF.js in its own worker, its lines kept once each. The statements are fictional, laid out like the owner's
// real Monzo and Lloyds PDFs (tests/fixtures/statements.ts). Nothing may leave this site.

test.use({ serviceWorkers: 'block', locale: 'en-GB' })

async function pdf(path: string, pages: Placed[][]) {
  await writeFile(path, makePdf(pages))
  return path
}

async function bringIn(page: Page, path: string) {
  await page.getByRole('button', { name: 'Bring in a statement' }).click()
  const sheet = page.getByRole('dialog', { name: 'Bring in a statement' })
  await sheet.locator('input[type="file"]').setInputFiles(path)
  return sheet
}

test('a statement’s PDF is read on the phone and its accounts kept, each line once; nothing leaves this site', async ({ page, baseURL }, testInfo) => {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  // The statements are September's and today is 26 October: October is still to bring in.
  await page.clock.setFixedTime(new Date(2026, 9, 26, 12, 0))
  await page.goto('./#/money')
  const accounts = page.getByRole('region', { name: 'Your accounts' })
  await expect(accounts.getByText('Bring in your bank and card statements to see all your spending.')).toBeVisible()

  const lloyds = await pdf(testInfo.outputPath('lloyds.pdf'), LLOYDS_LIKE)
  let sheet = await bringIn(page, lloyds)
  await expect(sheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveText([/^Lloyds: 4 new · 1 ?– ?30 Sept?$/])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  const lloydsRow = accounts.getByRole('listitem')
  await expect(lloydsRow).toContainText('Lloyds')
  await expect(lloydsRow).toContainText(/1\s+–\s+30 Sep 2026/)
  await expect(lloydsRow).toContainText(/Missing: 1\s+–\s+26 Oct 2026/)

  // The same statement again: nothing new.
  sheet = await bringIn(page, lloyds)
  await expect(sheet.getByRole('listitem')).toHaveText([/^Lloyds: 4 already here · 1 ?– ?30 Sept?$/])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()

  // Two accounts in one PDF: the current account and a pot.
  sheet = await bringIn(page, await pdf(testInfo.outputPath('monzo.pdf'), MONZO_LIKE))
  await expect(sheet.getByRole('listitem')).toHaveText([/^Monzo: 9 new · /, /^Monzo Savings pot: 2 new · /])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(accounts.getByRole('listitem')).toHaveText([/^Lloyds/, /^Monzo/, /^Monzo Savings pot/])

  // An account named your way (owner, 2026-10-26), and back to its bank's name when left empty.
  await accounts.getByRole('button', { name: 'Change Lloyds' }).click()
  const naming = page.getByRole('dialog', { name: 'Change this account' })
  await expect(naming.getByRole('textbox', { name: 'What do you call it?' })).toBeFocused()
  await naming.getByRole('textbox').fill('Joint account')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(accounts.getByRole('listitem')).toHaveText([/^Joint account/, /^Monzo/, /^Monzo Savings pot/])
  // Closed: nothing is still to bring in after its last statement.
  await accounts.getByRole('button', { name: 'Change Joint account' }).click()
  await naming.getByRole('textbox').fill('')
  await naming.getByRole('checkbox', { name: /This account is closed/ }).check()
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(accounts.getByRole('listitem').first()).toContainText('Closed')

  const site = new URL(baseURL!).origin
  expect(urls.filter((u) => !u.startsWith(site) && !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([])
})

test('account gaps crossing years show the year for each missing period', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  await restoreBackup(
    page,
    testInfo.outputPath('account-gaps.json'),
    backupWith({
      statements: [
        { id: 'example:2025-04-01:2025-04-30', account: 'Example Current', from: '2025-04-01', to: '2025-04-30', lines: 5, createdAt: 1, updatedAt: 1 },
        { id: 'example:2026-01-01:2026-04-30', account: 'Example Current', from: '2026-01-01', to: '2026-04-30', lines: 8, createdAt: 2, updatedAt: 2 },
      ],
    }, now),
  )
  await page.goto('./#/money')

  const account = page.getByRole('region', { name: 'Your accounts' }).getByRole('listitem')
  await expect(account).toContainText('Example Current')
  await expect(account).toContainText('1 Apr 2025 – 30 Apr 2026')
  await expect(account).toContainText('Missing: 1 May – 31 Dec 2025; 1 May – 27 Oct 2026')
})

// A Monzo Flex statement (owner, 2026-10-26: it came in as "Account", 651 lines not matching): named, every line
// following, and an account can be taken out again.
test('a Monzo Flex statement reads as Monzo Flex, every line matching; an account can be removed', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 8, 30, 12, 0))
  await page.goto('./#/money')
  const sheet = await bringIn(page, await pdf(testInfo.outputPath('flex.pdf'), FLEX_LIKE))
  await expect(sheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveText([/^Monzo Flex: 5 new · 1 ?– ?30 Sept?$/])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  const accounts = page.getByRole('region', { name: 'Your accounts', exact: true })
  await expect(accounts.getByRole('listitem')).toContainText(/1\s+–\s+30 Sep 2026/)

  await accounts.getByRole('button', { name: 'Change Monzo Flex' }).click()
  const naming = page.getByRole('dialog', { name: 'Change this account' })
  await naming.getByRole('button', { name: 'Remove', exact: true }).click()
  await naming.getByRole('button', { name: 'Tap again to remove it' }).click()
  await expect(accounts.getByText('Bring in your bank and card statements to see all your spending.')).toBeVisible()
})

test('a PDF that isn’t a statement, or isn’t a PDF, is refused saying why, and nothing is kept', async ({ page }, testInfo) => {
  await page.goto('./#/money')
  const letter = await pdf(testInfo.outputPath('letter.pdf'), [[{ text: 'Dear customer, your new card is on its way.', x: 57, y: 700 }]])
  const sheet = await bringIn(page, letter)
  await expect(sheet.getByRole('alert')).toHaveText('No transactions were found in this PDF. Choose the statement itself, not a letter or a summary.')
  const notPdf = testInfo.outputPath('notes.pdf')
  await writeFile(notPdf, 'just some words')
  await sheet.locator('input[type="file"]').setInputFiles(notPdf)
  await expect(sheet.getByRole('alert')).toHaveText('This file couldn’t be opened as a PDF. Save the statement from your bank’s app as a PDF and try again.')
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('region', { name: 'Your accounts' }).getByRole('listitem')).toHaveCount(0)
})

// Step 2 (v0.20): what came in and went out, money moved between your own accounts left out. The made-up statements are
// September's, so the clock is the 30th.
test('Money adds up your accounts, leaving out Monzo Flex, pots and a payee you say is your own', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 8, 30, 12, 0))
  await page.goto('./#/money')
  for (const [name, layout] of [['lloyds.pdf', LLOYDS_LIKE], ['monzo.pdf', MONZO_LIKE]] as const) {
    const sheet = await bringIn(page, await pdf(testInfo.outputPath(name), layout))
    await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  }
  // Out: energy 45.00, streaming 10.99, corner shop 12.40, supermarket 23.10, software 4.00, gym 25.00, two coffees 3.00.
  // In: A N Other 100.00, the employer 1,500.00, the pot's interest 1.25. Flex and the pot's moves are left out.
  await expect(page.getByRole('strong')).toHaveText('£126.49 out')
  const summary = page.locator('.card').first().locator('summary')
  await expect(summary).toHaveText(['£1601.25 in', '8 payments out'])
  const moved = page.getByRole('region', { name: 'Moved between your accounts' })
  await expect(moved.locator('summary')).toHaveText(['Monzo Flex · 2 moves', 'Pots · 1 move'])

  // A N OTHER is you, paying yourself: once said, its money leaves the totals; and comes back when unsaid.
  const moneyIn = page.getByRole('region', { name: 'Money in' })
  await moneyIn.locator('summary', { hasText: 'A N OTHER' }).click()
  await moneyIn.getByRole('button', { name: 'It’s me, moving money' }).click()
  await expect(summary).toHaveText(['£1501.25 in', '8 payments out'])
  await expect(moved.locator('summary')).toHaveText(['Monzo Flex · 2 moves', 'Pots · 1 move', 'A N OTHER · Your own account · 1 move'])
  // A statement prints your name, not which account: named your way, it's remembered.
  // Each row says where the money went; a pot's move is one row (owner, 2026-10-26).
  await moved.locator('summary', { hasText: 'Pots' }).click()
  await expect(moved.locator('details', { hasText: 'Pots' }).locator('.evidence-list li')).toHaveText([/^Tue,? 8 Sept? ?Monzo Savings pot → Monzo ?£50\.00$/])
  await moved.locator('summary', { hasText: 'Monzo Flex' }).click()
  await expect(moved.locator('details', { hasText: 'Monzo Flex' }).locator('.evidence-list li')).toHaveText([/^Thu,? 10 Sept? ?Paid off, from Monzo ?£12\.40$/, /^Wed,? 2 Sept? ?Spread with Flex ?£12\.40$/])
  await moved.locator('summary', { hasText: 'A N OTHER' }).click()
  await moved.getByRole('button', { name: 'Rename A N OTHER' }).click()
  const naming = page.getByRole('dialog', { name: 'Rename where it went' })
  await naming.getByRole('textbox').fill('Example savings')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(moved.locator('summary').last()).toHaveText('Example savings · Your own account · 1 move')
  // Money that came into Lloyds says so (owner, 2026-10-26: "All from Lloyds" read as leaving it).
  await moved.locator('summary', { hasText: 'Example savings' }).click()
  await expect(moved.locator('details', { hasText: 'Example savings' }).locator('.evidence-list li')).toHaveText([/^Sat,? 5 Sept? ?Example savings → Lloyds ?£100\.00$/])
  await moved.getByRole('button', { name: 'It’s not me: count it again' }).click()
  await expect(summary).toHaveText(['£1601.25 in', '8 payments out'])
  // Paid by card or direct debit: never asked.
  const moneyOut = page.getByRole('region', { name: 'Money out' })
  await moneyOut.locator('summary', { hasText: 'EXAMPLE STREAMING' }).click()
  await expect(moneyOut.getByRole('button', { name: 'It’s me, moving money' })).toHaveCount(0)

  for (const line of await page.locator('details.week-line > summary').all()) await line.click()
  await expectNoScores(page, 'Money, from statements, opened', true)
})

test('the accounts spending chart shows its six-month average and pages through earlier months', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 26, 12, 0)
  await page.clock.setFixedTime(now)
  const payments = [
    ['2025-04-10', 50],
    ['2025-05-10', 700],
    ['2025-06-10', 800],
    ['2025-07-10', 900],
    ['2025-08-10', 1000],
    ['2025-09-10', 1100],
    ['2025-10-10', 1200],
    ['2025-11-10', 100],
    ['2025-12-10', 200],
    ['2026-01-10', 300],
    ['2026-02-10', 400],
    ['2026-03-10', 500],
    ['2026-04-10', 600],
    ['2026-05-10', 1000],
    ['2026-06-10', 2000],
    ['2026-07-10', 3000],
    ['2026-08-10', 4000],
    ['2026-09-10', 5000],
    ['2026-10-10', 6000],
  ].map(([date, amount], index) => ({
    id: `chart-payment-${index}`,
    account: 'Example Current',
    date: String(date),
    amount: -Number(amount),
    description: 'EXAMPLE SHOP',
    type: 'DEB',
    balance: 100000 - index * 100,
    adds: true,
    createdAt: now.getTime(),
    updatedAt: now.getTime(),
  }))
  await restoreBackup(page, testInfo.outputPath('chart-history.json'), backupWith({ bankLines: payments }, now))
  await page.goto('./#/money')

  const chart = page.locator('figure.chart', { hasText: 'Spent each month' })
  const navigation = page.getByRole('navigation', { name: 'Spending chart months' })
  await expect(chart.locator('.chart-average')).toHaveCount(1)
  await expect(chart.locator('.chart-average-label')).toHaveText('Average over these 6 months: £35.00 per month')
  await chart.getByText('Show as table').click()
  await expect(chart.locator('tfoot tr')).toHaveText('Average£35.00–')
  await expect(navigation).toContainText('May–Oct 2026')
  await expect(navigation.getByRole('button', { name: 'Earlier months' })).toBeEnabled()
  await expect(navigation.getByRole('button', { name: 'Later months' })).toBeDisabled()

  await navigation.getByRole('button', { name: 'Earlier months' }).click()
  await expect(navigation).toContainText('Nov 2025–Apr 2026')
  await expect(chart.locator('.chart-average-label')).toHaveText('Average over these 6 months: £3.50 per month')
  await navigation.getByRole('button', { name: 'Earlier months' }).click()
  await expect(navigation).toContainText('May–Oct 2025')
  await expect(chart.locator('.chart-average-label')).toHaveText('Average over these 6 months: £9.50 per month')
  await navigation.getByRole('button', { name: 'Earlier months' }).click()
  await expect(navigation).toContainText('Nov 2024–Apr 2025')
  await expect(chart.locator('.chart-average-label')).toHaveText('Average over these 6 months: £0.08 per month')
  await expect(navigation.getByRole('button', { name: 'Earlier months' })).toBeDisabled()

  await navigation.getByRole('button', { name: 'Later months' }).click()
  await navigation.getByRole('button', { name: 'Later months' }).click()
  await navigation.getByRole('button', { name: 'Later months' }).click()
  await expect(navigation).toContainText('May–Oct 2026')
})

// Step 3 (v0.20.2): a card payment opens the receipt for it.
test('a card payment with its receipt opens the receipt', async ({ page }, testInfo) => {
  const now = new Date(2026, 8, 30, 12, 0)
  await page.clock.setFixedTime(now)
  const reading = { by: 'Gemini · gemini-test', at: 1, text: '', description: '', receipt: { shop: 'Example Streaming', date: '2026-09-12', currency: '£', items: [{ name: 'Monthly plan', price: 1099, quantity: 1 }], total: 1099 } }
  const entry = { ...freeWriting('e-stream', '', 18, now), photos: [{ id: 'p-stream', text: null, ai: reading }] }
  await restoreBackup(page, testInfo.outputPath('receipt.json'), backupWith({ entries: [entry] }, now))
  await page.goto('./#/money')
  const sheet = await bringIn(page, await pdf(testInfo.outputPath('lloyds.pdf'), LLOYDS_LIKE))
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()

  const out = page.getByRole('region', { name: 'Money out' })
  await out.locator('summary', { hasText: 'EXAMPLE STREAMING' }).click()
  // One payee, one account: each row is its day and amount, the account said once below.
  const payment = out.getByRole('button', { name: /^Sat,? 12 Sept? Out of Lloyds · receipt £10\.99$/ })
  await payment.click()
  await page.getByRole('dialog', { name: 'EXAMPLE STREAMING' }).getByRole('button', { name: 'Open its receipt' }).click()
  await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible()
  // A payment with no receipt is only words.
  await page.getByRole('dialog', { name: 'Photo' }).getByRole('button', { name: 'Done', exact: true }).click()
  await out.locator('summary', { hasText: 'EXAMPLE ENERGY' }).click()
  const energy = out.locator('details', { hasText: 'EXAMPLE ENERGY' })
  await expect(energy.locator('.evidence-list li')).toHaveText([/^Wed,? 2 Sept? ?Out of Lloyds ?£45\.00$/])

  // What a payment was for (owner, 2026-10-26): a kind for its payee, kept for all its payments, and a note on one.
  await energy.getByRole('button', { name: 'What EXAMPLE ENERGY is for' }).click()
  await page.getByRole('dialog', { name: 'What is EXAMPLE ENERGY for?' }).getByRole('radio', { name: 'Energy', exact: true }).click()
  await expect(energy.locator('summary')).toHaveText('EXAMPLE ENERGY · Energy · 1 payment · £45.00')
  await expect(page.getByRole('region', { name: 'By what it was for' }).locator('summary', { hasText: 'Energy' })).toHaveText('Energy · 1 payment · £45.00')
  await energy.locator('.evidence-list').getByRole('button').click()
  const paymentSheet = page.getByRole('dialog', { name: 'EXAMPLE ENERGY' })
  await expect(paymentSheet.getByRole('textbox', { name: 'What was it for?' })).toBeFocused()
  await paymentSheet.getByRole('textbox').fill('Winter bill')
  await paymentSheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(energy.locator('.evidence-list li')).toHaveText([/^Wed,? 2 Sept? ?Out of Lloyds · “Winter bill” ?£45\.00$/])
})
