import { writeFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { expectNoScores } from './helpers'
import { backupWith, freeWriting, restoreBackup } from './seed'
import { makePdf, type Placed } from '../fixtures/pdf'
import { FLEX_LIKE, FLEX_TABLE_ON_PAGE_2, LLOYDS_LIKE, MONZO_LIKE } from '../fixtures/statements'

// Bank and card statements (v0.20, step 1) in WebKit at iPhone size: a statement's PDF chosen in the app, read on the
// phone by PDF.js in its own worker, its lines kept once each. The statements are fictional, laid out like the owner's
// real Monzo and Lloyds PDFs (tests/fixtures/statements.ts). Nothing may leave this site.

test.use({ serviceWorkers: 'block', locale: 'en-GB' })

async function pdf(path: string, pages: Placed[][]) {
  await writeFile(path, makePdf(pages))
  return path
}

async function bringIn(page: Page, path: string) {
  // With statements in, "Bring in a statement" is under Statements; with none, it's the whole page.
  const statements = page.locator('.acc-tabs').getByRole('button', { name: 'Statements', exact: true })
  if (await statements.count()) await statements.click()
  await page.getByRole('button', { name: 'Bring in a statement' }).click()
  const sheet = page.getByRole('dialog', { name: 'Bring in a statement' })
  await sheet.locator('input[type="file"]').setInputFiles(path)
  return sheet
}

async function accountView(page: Page, name: 'Overview' | 'Spending' | 'Statements') {
  await page.locator('.acc-tabs').getByRole('button', { name, exact: true }).click()
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
  await accountView(page, 'Statements')
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
  await accountView(page, 'Statements')
  const accounts = page.getByRole('region', { name: 'Your accounts', exact: true })
  await expect(accounts.getByRole('listitem')).toContainText(/1\s+–\s+30 Sep 2026/)

  await accounts.getByRole('button', { name: 'Change Monzo Flex' }).click()
  const naming = page.getByRole('dialog', { name: 'Change this account' })
  await naming.getByRole('button', { name: 'Remove', exact: true }).click()
  await naming.getByRole('button', { name: 'Tap again to remove it' }).click()
  await expect(accounts.getByText('Bring in your bank and card statements to see all your spending.')).toBeVisible()
})

// A longer Flex statement (owner, 2026-11-01: it came in as "Account", dated by its first and last lines, and each
// purchase counted twice): its title and dates on page 1, its table alone on page 2.
test('a Flex statement whose table is on a later page than its title is still Monzo Flex, for the dates it says', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 8, 30, 12, 0))
  await page.goto('./#/money')
  const sheet = await bringIn(page, await pdf(testInfo.outputPath('flex-page-2.pdf'), FLEX_TABLE_ON_PAGE_2))
  await expect(sheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveText([/^Monzo Flex: 5 new · 1 ?– ?30 Sept?$/])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await accountView(page, 'Statements')
  const accounts = page.getByRole('region', { name: 'Your accounts', exact: true })
  await expect(accounts.getByRole('listitem')).toContainText('Monzo Flex')
  // The statement's own dates, not its first and last lines' (1 to 20 Sep): nothing is missing up to the 30th.
  await expect(accounts.getByRole('listitem')).toContainText(/1\s+–\s+30 Sep 2026/)
  await expect(accounts.getByRole('listitem')).not.toContainText('Missing')
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
  const summary = page.getByRole('group', { name: 'Money in and payments out' }).getByRole('button')
  await expect(summary).toHaveText(['Money in £1601.25', 'Payments out 8 payments'])
  await accountView(page, 'Spending')

  // A N OTHER is you, paying yourself: once said, its money leaves the totals; and comes back when unsaid. Paid once,
  // it's its payment: one tap opens it, and the sheet says so.
  const moneyIn = page.getByRole('region', { name: 'Money in' })
  await moneyIn.getByRole('button', { name: /^A N OTHER/ }).click()
  await page.getByRole('dialog', { name: 'A N OTHER' }).getByRole('button', { name: 'It’s me, moving money' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(summary).toHaveText(['Money in £1501.25', 'Payments out 8 payments'])
  const moved = page.getByRole('region', { name: 'Moved between your accounts' })
  await expect(moved.locator('summary')).toHaveText(['Monzo Flex 2 moves', 'Pots 1 move', 'A N OTHER Your own account · 1 move'])
  // A statement prints your name, not which account: named your way, it's remembered.
  // Each row says where the money went; a pot's move is one row (owner, 2026-10-26).
  await moved.locator('summary', { hasText: 'Pots' }).click()
  await expect(moved.locator('details', { hasText: 'Pots' }).locator('.acc-lines li')).toHaveText([/^Tue,? 8 Sept? ?Monzo Savings pot → Monzo ?£50\.00$/])
  await moved.locator('summary', { hasText: 'Monzo Flex' }).click()
  await expect(moved.locator('details', { hasText: 'Monzo Flex' }).locator('.acc-lines li')).toHaveText([/^Thu,? 10 Sept? ?Paid off, from Monzo ?£12\.40$/, /^Wed,? 2 Sept? ?Spread with Flex ?£12\.40$/])
  await moved.locator('summary', { hasText: 'A N OTHER' }).click()
  await moved.getByRole('button', { name: 'Rename A N OTHER' }).click()
  const naming = page.getByRole('dialog', { name: 'Rename where it went' })
  await naming.getByRole('textbox').fill('Example savings')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(moved.locator('summary').last()).toHaveText('Example savings Your own account · 1 move')
  // Money that came into Lloyds says so (owner, 2026-10-26: "All from Lloyds" read as leaving it).
  await moved.locator('summary', { hasText: 'Example savings' }).click()
  await expect(moved.locator('details', { hasText: 'Example savings' }).locator('.acc-lines li')).toHaveText([/^Sat,? 5 Sept? ?Example savings → Lloyds ?£100\.00$/])
  await moved.getByRole('button', { name: 'It’s not me: count it again' }).click()
  await expect(summary).toHaveText(['Money in £1601.25', 'Payments out 8 payments'])
  // Paid by card or direct debit: never asked.
  const moneyOut = page.getByRole('region', { name: 'Money out' })
  await moneyOut.getByRole('button', { name: /^EXAMPLE STREAMING/ }).click()
  const streaming = page.getByRole('dialog', { name: 'EXAMPLE STREAMING' })
  await expect(streaming.getByRole('button', { name: 'Rename transaction' })).toBeVisible()
  await expect(streaming.getByRole('button', { name: 'It’s me, moving money' })).toHaveCount(0)
  await streaming.getByRole('button', { name: 'Close' }).click()

  for (const line of await page.locator('details.acc-item > summary').all()) await line.click()
  await expectNoScores(page, 'Money, from statements, opened', true)
})

test('a regular payment can be renamed across existing transactions and a later statement', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const bankLines = ['2026-07-14', '2026-08-13', '2026-09-12'].map((date, index) => ({
    id: `regular-${index}`,
    account: 'Lloyds ···4321',
    date,
    amount: -1099,
    description: 'EXAMPLE STREAMING',
    type: 'DD',
    balance: null,
    adds: true,
    createdAt: index + 1,
    updatedAt: index + 1,
  }))
  await restoreBackup(page, testInfo.outputPath('regular-payments.json'), backupWith({ bankLines }, now))
  await page.goto('./#/money')

  const regularPayments = page.getByRole('region', { name: 'Regular payments' })
  // Coming up is a row of its own above the payments, so pick the payment's row: it says "every month".
  const regular = regularPayments.locator('details.acc-item', { hasText: 'every month' })
  await expect(regular.locator('summary')).toContainText('EXAMPLE STREAMING')
  await regular.locator('summary').click()
  await regular.getByRole('button', { name: 'Rename EXAMPLE STREAMING' }).click()
  const naming = page.getByRole('dialog', { name: 'Rename regular payment' })
  await naming.getByRole('textbox').fill('Example streaming')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(regular.locator('summary')).toContainText('Example streaming')

  for (const month of ['2026-07', '2026-08', '2026-09']) {
    await page.goto(`./#/money/${month}`)
    await accountView(page, 'Spending')
    const monthOut = page.getByRole('region', { name: 'Money out' })
    await expect(monthOut.getByRole('button', { name: /^Example streaming/ })).toBeVisible()
  }

  const octoberPages = LLOYDS_LIKE.map((page) =>
    page.map((piece) => ({
      ...piece,
      text: piece.text.replaceAll('September 2026', 'October 2026').replaceAll('Sep 26', 'Oct 26'),
    })),
  )
  const statement = await pdf(testInfo.outputPath('october-lloyds.pdf'), octoberPages)
  const sheet = await bringIn(page, statement)
  await expect(sheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveCount(1)
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()

  await page.goto('./#/money')
  await accountView(page, 'Spending')
  const octoberOut = page.getByRole('region', { name: 'Money out' })
  await expect(octoberOut.getByRole('button', { name: /^Example streaming.* £10\.99$/ })).toBeVisible()
})

test('regular payments total as a year: a monthly payment 12 times and a weekly one 52, never added as one figure', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const payment = (id: string, date: string, amount: number, description: string, createdAt: number) => ({
    id,
    account: 'Lloyds ···4321',
    date,
    amount,
    description,
    type: 'DD',
    balance: null,
    adds: true,
    createdAt,
    updatedAt: createdAt,
  })
  const bankLines = [
    ...['2026-07-14', '2026-08-13', '2026-09-12'].map((date, i) => payment(`month-${i}`, date, -1099, 'EXAMPLE STREAMING', i + 1)),
    ...['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((date, i) => payment(`week-${i}`, date, -500, 'EXAMPLE WEEKLY BOX', i + 10)),
  ]
  await restoreBackup(page, testInfo.outputPath('regular-total.json'), backupWith({ bankLines }, now))
  await page.goto('./#/money')

  const regularPayments = page.getByRole('region', { name: 'Regular payments' })
  const total = regularPayments.locator('li.acc-total')
  // £10.99 x 12 + £5.00 x 52 = £131.88 + £260.00; the old mixed figure was £15.99.
  await expect(total).toContainText('Total regular payments')
  await expect(total).toContainText('£391.88 a year')
  await expect(total).toContainText('£10.99 a month + £5.00 a week')
  await expect(total).not.toContainText('£15.99')
})

test('Money splits the month into committed and everyday, says when each regular payment is next due and what it costs a year, and lists what is coming up', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const payment = (id: string, date: string, amount: number, description: string, createdAt: number) => ({
    id,
    account: 'Lloyds ···4321',
    date,
    amount,
    description,
    type: 'DD',
    balance: null,
    adds: true,
    createdAt,
    updatedAt: createdAt,
  })
  const bankLines = [
    ...['2026-07-14', '2026-08-13', '2026-09-12'].map((date, i) => payment(`month-${i}`, date, -1099, 'EXAMPLE STREAMING', i + 1)),
    ...['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((date, i) => payment(`week-${i}`, date, -500, 'EXAMPLE WEEKLY BOX', i + 10)),
    payment('shop', '2026-10-05', -2000, 'EXAMPLE CORNER SHOP', 20),
  ]
  await restoreBackup(page, testInfo.outputPath('regular-next.json'), backupWith({ bankLines }, now))
  await page.goto('./#/money')

  // October so far: £40.00 out, of which the four weekly payments (£20.00) are committed.
  await expect(page.getByText('£40.00 out')).toBeVisible()
  await expect(page.getByText('Committed £20.00 · Everyday £20.00')).toBeVisible()

  const regularPayments = page.getByRole('region', { name: 'Regular payments' })
  // A payment's row says how often; Coming up (closed) holds the same names, so the names alone would match it too.
  const streaming = regularPayments.locator('details.acc-item', { hasText: 'every month' })
  const weekly = regularPayments.locator('details.acc-item', { hasText: 'every week' })
  // Last paid 12 Sep, so the 12 Oct one is past and the next is 12 Nov; weekly, last paid 22 Oct, next 29 Oct.
  await expect(streaming.locator('summary')).toContainText('every month · next around 12 Nov · £131.88 a year')
  await expect(weekly.locator('summary')).toContainText('every week · next around 29 Oct · £260.00 a year')

  // The next 30 days from 27 Oct run to 26 Nov: the weekly box on 29 Oct, 5, 12, 19 and 26 Nov, the streaming one on 12 Nov.
  const coming = regularPayments.locator('details.acc-item', { hasText: 'Coming up' })
  await expect(coming.locator('summary')).toContainText('6 payments in the next 30 days')
  await expect(coming.locator('summary')).toContainText('£35.99')
  await coming.locator('summary').click()
  await expect(coming.locator('li.acc-li')).toHaveCount(6)
  await expect(coming.locator('li.acc-li').first()).toContainText('EXAMPLE WEEKLY BOX')
  await expect(coming.locator('li.acc-li').first()).toContainText('around 29 Oct')

  // An earlier month says nothing of what's next: no Coming up, no "next around".
  await page.goto('./#/money/2026-09')
  const earlier = page.getByRole('region', { name: 'Regular payments' })
  await expect(earlier).toContainText('every month')
  await expect(earlier).not.toContainText('next around')
  await expect(earlier).not.toContainText('Coming up')
})

const LLOYDS = 'Lloyds ···4321'
const statementRecord = (to: string) => ({ id: `lloyds:2026-01-01:${to}`, account: LLOYDS, from: '2026-01-01', to, lines: 9, createdAt: 1, updatedAt: 1 })
const monthlyPayments = (description: string, dates: string[], amounts: number[]) =>
  dates.map((date, i) => ({ id: `${description}-${i}`, account: LLOYDS, date, amount: amounts[i]!, description, type: 'DD', balance: null, adds: true, createdAt: i + 1, updatedAt: i + 1 }))

test('What changed tells of a regular payment that went up, one that is new and one that has stopped, and a stopped one leaves the list', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const bankLines = [
    // Paid since March, so it went up and is not new.
    ...monthlyPayments('EXAMPLE BROADBAND', ['2026-03-05', '2026-04-05', '2026-05-05', '2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'], [-3250, -3250, -3250, -3250, -3250, -3250, -3250, -3650]),
    ...monthlyPayments('EXAMPLE NEW SUB', ['2026-08-12', '2026-09-12', '2026-10-12'], [-899, -899, -899]),
    ...monthlyPayments('EXAMPLE GYM CLUB', ['2026-06-10', '2026-07-10', '2026-08-10'], [-1000, -1000, -1000]),
  ]
  await restoreBackup(page, testInfo.outputPath('what-changed.json'), backupWith({ bankLines, statements: [statementRecord('2026-10-27')] }, now))
  await page.goto('./#/money')

  const changed = page.getByRole('region', { name: 'What changed' })
  const row = (name: string) => changed.locator('details.acc-item', { hasText: name })
  const summary = (name: string) => row(name).locator(':scope > summary')
  await expect(summary('EXAMPLE BROADBAND')).toContainText('went up from £32.50 to £36.50 · +£48.00 a year')
  await expect(summary('EXAMPLE NEW SUB')).toContainText('new · first paid 12 Aug · every month')
  await expect(summary('EXAMPLE GYM CLUB')).toContainText('no payment since 10 Aug · was every month')
  // It opens to its payments.
  await summary('EXAMPLE GYM CLUB').click()
  await expect(row('EXAMPLE GYM CLUB')).toContainText('10 Jul')

  // The stopped one is no longer a regular payment: not in the list, the total or Coming up. The others are.
  const regularPayments = page.getByRole('region', { name: 'Regular payments' })
  await expect(regularPayments).toContainText('EXAMPLE BROADBAND')
  await expect(regularPayments).toContainText('EXAMPLE NEW SUB')
  await expect(regularPayments).not.toContainText('EXAMPLE GYM CLUB')
  await expect(regularPayments.locator('li.acc-total')).toContainText('2 payments, all monthly')
})

test('a missing statement is never a stopped payment', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const bankLines = monthlyPayments('EXAMPLE GYM CLUB', ['2026-06-10', '2026-07-10', '2026-08-10'], [-1000, -1000, -1000])
  // Its account's statements stop on 31 Aug: nothing is known of the days it should have been paid after 10 Aug.
  await restoreBackup(page, testInfo.outputPath('what-changed-gap.json'), backupWith({ bankLines, statements: [statementRecord('2026-08-31')] }, now))
  await page.goto('./#/money')

  await expect(page.getByRole('region', { name: 'What changed' })).toHaveCount(0)
  await expect(page.getByText('no payment since')).toHaveCount(0)
})

test('each month says what came in against what went out, and Overview opens the year: its totals, what it was for, the days with no statement, and the years either side', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const bankLines = [
    ...monthlyPayments('EXAMPLE EMPLOYER', ['2025-11-26', '2026-09-26', '2026-10-26'], [100000, 100000, 100000]),
    ...monthlyPayments('EXAMPLE OLD SHOP', ['2025-11-05'], [-3000]),
    ...monthlyPayments('EXAMPLE CORNER SHOP', ['2026-09-10', '2026-10-05'], [-4000, -2000]),
    ...monthlyPayments('EXAMPLE STREAMING', ['2026-08-14', '2026-09-14', '2026-10-14'], [-1099, -1099, -1099]),
  ]
  // 31 May to 1 July has no statement: June is missing from 2026.
  const statements = [
    { id: 'a', account: LLOYDS, from: '2025-01-01', to: '2026-05-31', lines: 4, createdAt: 1, updatedAt: 1 },
    { id: 'b', account: LLOYDS, from: '2026-07-01', to: '2026-10-27', lines: 8, createdAt: 2, updatedAt: 2 },
  ]
  await restoreBackup(page, testInfo.outputPath('year.json'), backupWith({ bankLines, statements }, now))

  // A month: £1000.00 in, £20.00 + £10.99 out in October; £1000.00 in, £40.00 + £10.99 out in September.
  await page.goto('./#/money')
  await expect(page.getByText('£969.01 more in than out so far', { exact: true })).toBeVisible()
  await page.goto('./#/money/2026-09')
  await expect(page.getByText('£949.01 more in than out', { exact: true })).toBeVisible()

  // Overview ends with the way in to the year: £40 + £20 + 3 x £10.99 out in 2026.
  await page.goto('./#/money')
  await page.getByRole('link', { name: /2026 so far/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: '2026' })).toBeVisible()
  await expect(page.getByText('£92.97 out', { exact: true })).toBeVisible()
  await expect(page.getByText('From your accounts · Aug – Oct', { exact: true })).toBeVisible()
  await expect(page.getByText('Money in £2000.00 · 5 payments out', { exact: true })).toBeVisible()
  await expect(page.getByText('£1907.03 more in than out so far', { exact: true })).toBeVisible()
  await expect(page.getByText('Committed £32.97 · Everyday £60.00', { exact: true })).toBeVisible()

  // The regular payment it paid in the year, and the month with no statement.
  const regular = page.getByRole('region', { name: 'Regular payments' })
  await expect(regular).toContainText('EXAMPLE STREAMING')
  await expect(regular).toContainText('every month · 3 payments')
  await expect(regular).toContainText('£32.97')
  const missing = page.getByRole('region', { name: 'Not brought in' })
  await expect(missing).toContainText('Lloyds')
  await expect(missing).toContainText('Jun 2026')
  // The biggest payees are those paid 3 times or more.
  await expect(page.getByRole('region', { name: 'Biggest payees' })).toContainText('EXAMPLE STREAMING')

  // The years either side: 2025 had one payment out of £30.00 and nothing to say about missing statements after it.
  await page.getByRole('link', { name: 'Earlier: 2025' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '2025' })).toBeVisible()
  await expect(page.getByText('£30.00 out', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Earlier:/ })).toHaveCount(0)
  await page.getByRole('link', { name: 'Later: 2026' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '2026' })).toBeVisible()

  // And back to Money.
  await page.getByRole('link', { name: '‹ Money' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible()
})

test('the year page shows what you hold at each month’s end, what you owe apart, and says when a month cannot be told', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const CARD = 'M&S Card ···9999'
  const row = (id: string, account: string, date: string, amount: number, balance: number, description: string, createdAt: number) => ({ id, account, date, amount, description, type: '', balance, adds: true, createdAt, updatedAt: createdAt })
  // The bank holds £1000.00 at the start: -£200.00 on 5 Jul, then -£50.00 and -£25.00 on 10 Aug (given to the app the
  // wrong way round), then +£100.00 on 2 Oct. The card owes £50.00: a £30.00 purchase on 20 Jul, a £20.00 payment on 10 Oct.
  const bankLines = [
    row('b1', LLOYDS, '2026-07-05', -20000, 80000, 'EXAMPLE RENT', 1),
    row('b3', LLOYDS, '2026-08-10', -2500, 72500, 'EXAMPLE SHOP TWO', 3),
    row('b2', LLOYDS, '2026-08-10', -5000, 75000, 'EXAMPLE SHOP ONE', 2),
    row('b4', LLOYDS, '2026-10-02', 10000, 82500, 'EXAMPLE EMPLOYER', 4),
    row('c1', CARD, '2026-07-20', -3000, 8000, 'EXAMPLE CLOTHES', 5),
    row('c2', CARD, '2026-10-10', 2000, 6000, 'EXAMPLE PAYMENT', 6),
  ]
  // The bank has no statement for September.
  const statements = [
    { id: 'l1', account: LLOYDS, from: '2026-07-01', to: '2026-08-31', lines: 3, createdAt: 1, updatedAt: 1 },
    { id: 'l2', account: LLOYDS, from: '2026-10-01', to: '2026-10-27', lines: 1, createdAt: 2, updatedAt: 2 },
    { id: 'c', account: CARD, from: '2026-07-01', to: '2026-10-27', lines: 2, createdAt: 3, updatedAt: 3 },
  ]
  await restoreBackup(page, testInfo.outputPath('balances.json'), backupWith({ bankLines, statements }, now))
  await page.goto('./#/money/2026')

  const ends = page.getByRole('region', { name: 'At each month’s end' })
  // Tapping a month says what is held and what is owed, apart.
  await ends.getByRole('button', { name: /^August 2026/ }).click()
  await expect(ends.getByText('August 2026: £725.00 held · £80.00 owed', { exact: true })).toBeVisible()
  await ends.getByRole('button', { name: /^September 2026/ }).click()
  await expect(ends.getByText('September 2026: not known: no statement for Lloyds · £80.00 owed', { exact: true })).toBeVisible()

  // Every month, as a table.
  await ends.getByText('Show as table').click()
  const table = ends.locator('table')
  await expect(table.getByRole('row', { name: /^July 2026/ })).toContainText('£800.00 held')
  await expect(table.getByRole('row', { name: /^July 2026/ })).toContainText('£80.00 owed')
  await expect(table.getByRole('row', { name: /^October so far/ })).toContainText('£825.00 held')
  await expect(table.getByRole('row', { name: /^October so far/ })).toContainText('£60.00 owed')
  // Nothing before the accounts began.
  await expect(table.getByRole('row')).toHaveCount(1 + 4)
})

test('a purchase moved to Flex counts once even when its Flex statement came in as "Account"', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const row = (id: string, account: string, amount: number, description: string, createdAt: number) => ({ id, account, date: '2026-10-08', amount, description, type: '', balance: null, adds: true, createdAt, updatedAt: createdAt })
  // The same £41.17: paid from the current account, and "moved to Flex" on a Flex statement whose title wasn't read.
  const bankLines = [row('paid', 'Monzo ···5678', -4117, 'EXAMPLE VISA CENTRE LONDON', 1), row('flex', 'Account', -4117, 'Example Visa Centre moved to Flex', 2)]
  await restoreBackup(page, testInfo.outputPath('flex-account.json'), backupWith({ bankLines }, now))
  await page.goto('./#/money')

  // The month's headline: £41.17 once, not £82.34.
  await expect(page.locator('.acc-figure')).toHaveText('£41.17 out')
  await accountView(page, 'Spending')
  await expect(page.getByRole('region', { name: 'Money out' }).getByRole('button', { name: /EXAMPLE VISA CENTRE/ })).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Money out' }).getByText('moved to Flex')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Moved between your accounts' })).toContainText('Monzo Flex')
})

test('the accounts spending chart averages the months with every statement in, and pages through earlier months', async ({ page }, testInfo) => {
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
  // One account whose statements run from April 2025 to today: the months before it began are unknown, not £0.
  const statements = [{ id: 'chart', account: 'Example Current', from: '2025-04-01', to: '2026-10-26', lines: 19, createdAt: 1, updatedAt: 1 }]
  await restoreBackup(page, testInfo.outputPath('chart-history.json'), backupWith({ bankLines: payments, statements }, now))
  await page.goto('./#/money')

  const chart = page.locator('figure.chart', { hasText: 'Spent each month' })
  const navigation = page.getByRole('navigation', { name: 'Spending chart months' })
  await expect(chart.locator('.chart-average')).toHaveCount(1)
  // May to October: October isn't over, so the average is of the 5 months before it (£10 + 20 + 30 + 40 + 50).
  await expect(chart.locator('.chart-average-label')).toHaveText('Average of the 5 months with every statement in: £30.00 per month')
  await chart.getByText('Show as table').click()
  await expect(chart.locator('tfoot tr')).toHaveText('Average£30.00–')
  await expect(navigation).toContainText('May–Oct 2026')
  await expect(navigation.getByRole('button', { name: 'Earlier months' })).toBeEnabled()
  await expect(navigation.getByRole('button', { name: 'Later months' })).toBeDisabled()

  await navigation.getByRole('button', { name: 'Earlier months' }).click()
  await expect(navigation).toContainText('Nov 2025–Apr 2026')
  await expect(chart.locator('.chart-average-label')).toHaveText('Average of the 6 months with every statement in: £3.50 per month')
  await navigation.getByRole('button', { name: 'Earlier months' }).click()
  await expect(navigation).toContainText('May–Oct 2025')
  await expect(chart.locator('.chart-average-label')).toHaveText('Average of the 6 months with every statement in: £9.50 per month')
  await navigation.getByRole('button', { name: 'Earlier months' }).click()
  await expect(navigation).toContainText('Nov 2024–Apr 2025')
  // Before April 2025 nothing is known, which isn't the same as nothing spent: one month left, so no average.
  await expect(chart.locator('.chart-average')).toHaveCount(0)
  await expect(chart.locator('.chart-average-label')).toHaveCount(0)
  await expect(navigation.getByRole('button', { name: 'Earlier months' })).toBeDisabled()

  await navigation.getByRole('button', { name: 'Later months' }).click()
  await navigation.getByRole('button', { name: 'Later months' }).click()
  await navigation.getByRole('button', { name: 'Later months' }).click()
  await expect(navigation).toContainText('May–Oct 2026')
})

// Step 3 (v0.20.2): a card payment opens the receipt for it.
test('a month with an account’s statements missing, or not begun, is left out of the average and says which statements are missing', async ({ page }, testInfo) => {
  // 1 November: November hasn't begun, and the card's statements stop at the end of August.
  const now = new Date(2026, 10, 1, 12, 0)
  await page.clock.setFixedTime(now)
  const spent = [['2026-05-10', 1000], ['2026-06-10', 2000], ['2026-07-10', 3000], ['2026-08-10', 4000], ['2026-09-10', 5000], ['2026-10-10', 6000]]
  const bankLines = spent.map(([date, amount], i) => ({ id: `m-${i}`, account: 'Example Current', date: String(date), amount: -Number(amount), description: 'EXAMPLE SHOP', type: 'DEB', balance: 100000 - i * 100, adds: true, createdAt: i + 1, updatedAt: i + 1 }))
  const statements = [
    { id: 'current', account: 'Example Current', from: '2026-05-01', to: '2026-10-31', lines: 6, createdAt: 1, updatedAt: 1 },
    { id: 'card', account: 'Example Card', from: '2026-05-01', to: '2026-08-31', lines: 0, createdAt: 2, updatedAt: 2 },
  ]
  await restoreBackup(page, testInfo.outputPath('chart-missing.json'), backupWith({ bankLines, statements }, now))
  await page.goto('./#/money')

  const chart = page.locator('figure.chart', { hasText: 'Spent each month' })
  // June to November: only June, July and August have both accounts' statements (£20 + 30 + 40), not 6 months counting November as nothing.
  await expect(chart.locator('.chart-average-label')).toHaveText('Average of the 3 months with every statement in: £30.00 per month')
  await chart.getByRole('button', { name: /^October 2026/ }).click()
  await expect(chart.locator('.chart-readout')).toHaveText('October 2026: £60.00 · 1 payment · not every statement is in: Example Card')
  await chart.getByRole('button', { name: /^August 2026/ }).click()
  await expect(chart.locator('.chart-readout')).toHaveText('August 2026: £40.00 · 1 payment')
  // The month you are in has no note: it is still being brought in.
  await chart.getByRole('button', { name: /^November so far/ }).click()
  await expect(chart.locator('.chart-readout')).toHaveText('November so far: no payments')
})

test('Spending finds any payment across every month and year: by name, by amount, by your note; each year says what it comes to', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const bankLines = [
    ...monthlyPayments('AMAZON.CO.UK*AB12 LONDON', ['2025-03-02'], [-2499]),
    ...monthlyPayments('AMAZON* 9X8 LUXEMBOURG', ['2025-11-05'], [-1000]),
    ...monthlyPayments('EXAMPLE SHOP SOMETOWN GBR', ['2026-02-10'], [-2499]),
    ...monthlyPayments('EXAMPLE EMPLOYER', ['2026-09-26', '2026-10-26'], [100000, 100000]),
  ]
  await restoreBackup(page, testInfo.outputPath('search.json'), backupWith({ bankLines }, now))
  await page.goto('./#/money')
  await accountView(page, 'Spending')
  const search = page.getByRole('searchbox', { name: 'Search every payment' })
  // The month's own lists, until you search (October has only the employer's payment in).
  await expect(page.getByRole('region', { name: 'Money in' })).toBeVisible()

  // By name: both amazon payments, in two years, each year with what it comes to.
  await search.fill('amazon')
  await expect(page.getByRole('region', { name: 'Money in' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '2025' })).toContainText('2 payments · £34.99')
  await expect(page.getByRole('region', { name: '2025' }).getByRole('button')).toHaveCount(2)
  await expect(page.getByRole('region', { name: '2026' })).toHaveCount(0)

  // By amount, as far as typed: £24.99 in 2025 and again in 2026, newest year first.
  await search.fill('24.9')
  await expect(page.getByRole('region')).toContainText(['1 payment · £24.99', '1 payment · £24.99'])
  await expect(page.getByRole('heading', { level: 2, name: /^20/ })).toHaveText(['2026', '2025'])

  // A payment opens, as everywhere else, and your note on it can be found.
  await page.getByRole('region', { name: '2026' }).getByRole('button').first().click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox').fill('birthday present')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()
  await search.fill('birthday')
  await expect(page.getByRole('region', { name: '2026' })).toContainText('1 payment · £24.99')
  await expect(page.getByRole('region', { name: '2025' })).toHaveCount(0)

  // Money in, and nothing found.
  await search.fill('employer')
  await expect(page.getByRole('region', { name: '2026' })).toContainText('£2000.00 in')
  await search.fill('zzzz')
  await expect(page.getByText('Nothing found.')).toBeVisible()

  // One character is not a search, and clearing brings the month's lists back.
  await search.fill('a')
  await expect(page.getByRole('region', { name: 'Money in' })).toBeVisible()
  await search.fill('amazon')
  await search.fill('')
  await expect(page.getByRole('region', { name: 'Money in' })).toBeVisible()
})

// v0.20.34: a purchase on Monzo Flex is on the bank's statement and again on Flex's ("… moved to Flex"); a search read as
// two payments of one amount, the second naming nobody (owner, 2026-11-01), and the box didn't say what it searched.
test('Spending’s search lists a purchase once, its Flex side apart and named; the box says what it searches and has a ✕', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const line = (id: string, account: string, amount: number, description: string) => ({ id, account, date: '2026-10-08', amount, description, type: '', balance: null, adds: true, createdAt: 1, updatedAt: 1 })
  const bankLines = [
    line('pass-bank', 'Example Current', -4117, 'EXAMPLE PASSPORT OFFICE'),
    line('pass-back', 'Example Current', 4117, 'Flex'),
    line('pass-flex', 'Monzo Flex', -4117, 'EXAMPLE PASSPORT OFFICE moved to Flex'),
  ]
  await restoreBackup(page, testInfo.outputPath('search-flex.json'), backupWith({ bankLines }, now))
  await page.goto('./#/money')
  await accountView(page, 'Spending')
  const search = page.getByRole('searchbox', { name: 'Search every payment' })
  await expect(search).toHaveAttribute('placeholder', 'Search by name, note or amount')
  const clear = page.getByRole('button', { name: 'Clear the search' })
  await expect(clear).toHaveCount(0)

  await search.fill('passport')
  const year = page.getByRole('region', { name: '2026' })
  // One payment, one row, naming where it went; money moved is not counted in the year's line.
  await expect(year.locator('.acc-status')).toHaveText('1 payment · £41.17')
  await expect(year.locator(':scope > ul.acc-lines > li')).toHaveText([/^Thu,? 8 Oct ?EXAMPLE PASSPORT OFFICE · out of Example Current ?£41\.17$/])
  // Its Flex side is under money moved, closed until asked for, and says whose purchase it paid off.
  const moved = year.locator('details', { hasText: 'Moved between your accounts' })
  await expect(moved.locator('summary')).toHaveText('Moved between your accounts 1 move, left out')
  await moved.locator('summary').click()
  await expect(moved.locator('.acc-lines li')).toHaveText([/^Thu,? 8 Oct ?EXAMPLE PASSPORT OFFICE · paid off, from Monzo Flex ?£41\.17$/])

  // A ✕ clears the search and the keyboard stays up for the next one; the month's lists come back.
  await expect(clear).toBeVisible()
  await clear.click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await expect(clear).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Money out' })).toBeVisible()
})

// v0.20.35: renaming a payee names every payment to it, right for rent and wrong for three different medicines from one
// pharmacy (owner, 2026-11-01). From a payment, the rename can be for that payment alone.
test('a payment can be named alone: the others to the same shop keep their name, and emptying it goes back', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const bankLines = [['2026-10-03', -500], ['2026-10-07', -499], ['2026-10-15', -499]].map(([date, amount], i) => ({ id: `pharmacy-${i}`, account: LLOYDS, date: String(date), amount: Number(amount), description: 'EXAMPLE PHARMACY LEICESTER', type: 'DEB', balance: null, adds: true, createdAt: i + 1, updatedAt: i + 1 }))
  await restoreBackup(page, testInfo.outputPath('named-alone.json'), backupWith({ bankLines }, now))
  await page.goto('./#/money')
  await accountView(page, 'Spending')
  const out = page.getByRole('region', { name: 'Money out' })
  const group = out.locator('details', { hasText: 'EXAMPLE PHARMACY LEICESTER' })
  await group.locator('summary').click()
  const rows = group.locator('.acc-lines li')
  const open = async (day: string) => {
    await rows.filter({ hasText: day }).getByRole('button').click()
  }

  // The 7th: renamed for this payment only.
  await open('7 Oct')
  await page.getByRole('dialog', { name: 'EXAMPLE PHARMACY LEICESTER' }).getByRole('button', { name: 'Rename transaction' }).click()
  const naming = page.getByRole('dialog', { name: 'Rename transaction' })
  await expect(naming.getByRole('radio', { name: /All payments to EXAMPLE PHARMACY LEICESTER/ })).toBeChecked()
  await naming.getByRole('radio', { name: /Only this payment/ }).check()
  await naming.getByRole('textbox').fill('Fever medicine')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'EXAMPLE PHARMACY LEICESTER' }).getByRole('button', { name: 'Close' }).click()
  // It is still one payee of three payments; only that row has a name of its own.
  await expect(group.locator('summary')).toContainText('EXAMPLE PHARMACY LEICESTER')
  await expect(group.locator('summary')).toContainText('3 payments')
  await expect(rows).toHaveText([/^Thu,? 15 Oct ?Out of Lloyds[^£]*£4\.99$/, /^Wed,? 7 Oct ?Fever medicine · out of Lloyds[^£]*£4\.99$/, /^Sat,? 3 Oct ?Out of Lloyds[^£]*£5\.00$/])

  // Search finds it by its name, and the shop's name still finds all three.
  await accountView(page, 'Spending')
  const search = page.getByRole('searchbox', { name: 'Search every payment' })
  await search.fill('fever')
  await expect(page.getByRole('region', { name: '2026' })).toContainText('1 payment · £4.99')
  await search.fill('pharmacy')
  await expect(page.getByRole('region', { name: '2026' })).toContainText('3 payments · £14.98')
  await search.fill('')

  // Its sheet says who was paid; the choice opens on "Only this payment" with its own name in the box.
  await group.locator('summary').click()
  await open('7 Oct')
  const sheet = page.getByRole('dialog', { name: 'Fever medicine' })
  await expect(sheet).toContainText('Paid to: EXAMPLE PHARMACY LEICESTER')
  await sheet.getByRole('button', { name: 'Rename transaction' }).click()
  await expect(naming.getByRole('radio', { name: /Only this payment/ })).toBeChecked()
  await expect(naming.getByRole('textbox')).toHaveValue('Fever medicine')

  // All payments to the shop can still be named together, and the one named alone keeps its own name.
  await naming.getByRole('radio', { name: /All payments to/ }).check()
  await expect(naming.getByRole('textbox')).toHaveValue('EXAMPLE PHARMACY LEICESTER')
  await naming.getByRole('textbox').fill('The pharmacy')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(out.locator('details', { hasText: 'The pharmacy' }).locator('summary')).toContainText('3 payments')
  await expect(rows.nth(1)).toContainText('Fever medicine · out of Lloyds')
  await expect(rows.nth(0)).toContainText('Out of Lloyds')

  // Emptying its name goes back to the shop's.
  await open('7 Oct')
  await page.getByRole('dialog', { name: 'Fever medicine' }).getByRole('button', { name: 'Rename transaction' }).click()
  await naming.getByRole('textbox').fill('')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'Fever medicine' }).getByRole('button', { name: 'Close' }).click()
  await expect(rows).toHaveText([/^Thu,? 15 Oct ?Out of Lloyds[^£]*£4\.99$/, /^Wed,? 7 Oct ?Out of Lloyds[^£]*£4\.99$/, /^Sat,? 3 Oct ?Out of Lloyds[^£]*£5\.00$/])
})

test('a card payment with its receipt opens the receipt', async ({ page }, testInfo) => {
  const now = new Date(2026, 8, 30, 12, 0)
  await page.clock.setFixedTime(now)
  const reading = { by: 'Gemini · gemini-test', at: 1, text: '', description: '', receipt: { shop: 'Example Streaming', date: '2026-09-12', currency: '£', items: [{ name: 'Monthly plan', price: 1099, quantity: 1 }], total: 1099 } }
  const entry = { ...freeWriting('e-stream', '', 18, now), photos: [{ id: 'p-stream', text: null, ai: reading }] }
  await restoreBackup(page, testInfo.outputPath('receipt.json'), backupWith({ entries: [entry] }, now))
  await page.goto('./#/money')
  const sheet = await bringIn(page, await pdf(testInfo.outputPath('lloyds.pdf'), LLOYDS_LIKE))
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await accountView(page, 'Spending')

  const out = page.getByRole('region', { name: 'Money out' })
  // One payment is already its complete row: it opens directly, with no empty disclosure to expand.
  const payment = out.getByRole('button', { name: /^EXAMPLE STREAMING Sat,? 12 Sept? · Out of Lloyds · Receipt £10\.99$/ })
  await payment.click()
  await page.getByRole('dialog', { name: 'EXAMPLE STREAMING' }).getByRole('button', { name: 'Open its receipt' }).click()
  // The receipt opens to its items (v0.20.18), and from there its entry.
  const receipt = page.getByRole('dialog', { name: 'Example Streaming' })
  await expect(receipt.getByRole('list', { name: 'Items' })).toContainText('Monthly plan · £10.99')
  await receipt.getByRole('button', { name: 'Open the entry' }).click()
  await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible()
  // A payment with no receipt is still a direct row.
  await page.getByRole('dialog', { name: 'Photo' }).getByRole('button', { name: 'Done', exact: true }).click()
  const energy = out.getByRole('button', { name: /^EXAMPLE ENERGY Wed,? 2 Sept? · Out of Lloyds £45\.00$/ })
  await expect(energy).toBeVisible()

  // What a payment was for (owner, 2026-10-26): a kind for its payee, kept for all its payments, and a note on one.
  await energy.click()
  const paymentSheet = page.getByRole('dialog', { name: 'EXAMPLE ENERGY' })
  await paymentSheet.getByRole('button', { name: /^(\+ Assign category|Category: )/ }).click()
  await page.getByRole('dialog', { name: 'What is EXAMPLE ENERGY for?' }).getByRole('radio', { name: 'Energy', exact: true }).click()
  await expect(paymentSheet.getByRole('button', { name: 'Category: Energy' })).toBeVisible()
  await paymentSheet.getByRole('textbox', { name: 'What was it for?' }).fill('Winter bill')
  await paymentSheet.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(out.getByRole('button', { name: /Winter bill/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'By what it was for' }).locator('summary', { hasText: 'Energy' })).toHaveText('Energy 1 payment £45.00')
})

// Accounts (v0.20.22): the month's figure first, the months either side a tap away, what's open staying open between
// them, the two small figures opening their lists, and a line (and a dot on Statements) when an account needs a statement.
test('Accounts steps between months, keeps its part open, and says when an account needs a statement', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const bankLines = ['2026-08-10', '2026-09-10', '2026-10-10'].map((date, index) => ({
    id: `step-${index}`,
    account: 'Example Current',
    date,
    amount: -1000 * (index + 1),
    description: 'EXAMPLE SHOP',
    type: 'DEB',
    balance: null,
    adds: true,
    createdAt: index + 1,
    updatedAt: index + 1,
  }))
  const statements = [{ id: 'example:2026-08-01:2026-09-30', account: 'Example Current', from: '2026-08-01', to: '2026-09-30', lines: 2, createdAt: 1, updatedAt: 1 }]
  await restoreBackup(page, testInfo.outputPath('months.json'), backupWith({ bankLines, statements }, now))
  await page.goto('./#/money')
  const months = page.getByRole('navigation', { name: 'Months' })
  const tab = (name: string) => page.locator('.acc-tabs').getByRole('button', { name, exact: true })

  // October is the latest month: nothing later to step to. Its statements stop at 30 Sep, and it says so.
  await expect(page.getByRole('strong')).toHaveText('£30.00 out')
  await expect(months.getByRole('link', { name: /^Later: / })).toHaveCount(0)
  const notice = page.getByRole('button', { name: /1 account needs a newer statement/ })
  await expect(notice).toBeVisible()
  await expect(tab('Statements')).toHaveAttribute('data-attention', '')

  // The payments figure opens Spending at Money out.
  await page.getByRole('group', { name: 'Money in and payments out' }).getByRole('button', { name: /^Payments out/ }).click()
  await expect(tab('Spending')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Money out' })).toBeInViewport()

  // Stepping back keeps Spending open, down to the first month with anything in it, and forward again.
  await months.getByRole('link', { name: 'Earlier: September 2026' }).click()
  await expect(page.getByRole('strong')).toHaveText('£20.00 out')
  await expect(tab('Spending')).toHaveAttribute('aria-pressed', 'true')
  await months.getByRole('link', { name: 'Earlier: August 2026' }).click()
  await expect(page.getByRole('strong')).toHaveText('£10.00 out')
  await expect(months.getByRole('link', { name: /^Earlier: / })).toHaveCount(0)
  await months.getByRole('link', { name: 'Later: September 2026' }).click()
  await months.getByRole('link', { name: 'Later: October 2026' }).click()
  await expect(page.getByRole('strong')).toHaveText('£30.00 out')

  // Review opens Statements, where the account and what it's missing are.
  await notice.click()
  await expect(tab('Statements')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Your accounts' }).getByRole('listitem')).toContainText('Needs statement')
})
