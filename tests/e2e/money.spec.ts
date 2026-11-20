import { writeFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { expectNoScores } from './helpers'
import { backupWith, freeWriting, restoreBackup } from './seed'
import { makePdf, type Placed } from '../fixtures/pdf'
import { activityLike, TRANSACTIONS_LIKE } from '../fixtures/trading212'
import { FIRSTDIRECT_LIKE, FLEX_LIKE, FLEX_TABLE_ON_PAGE_2, LLOYDS_LIKE, MONZO_LIKE } from '../fixtures/statements'

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
  const statements = page.locator('.money-title').getByRole('button', { name: 'Statements', exact: true })
  // (It toggles, so only open it when it isn't.)
  if ((await statements.count()) && (await statements.getAttribute('aria-pressed')) !== 'true') await statements.click()
  await page.getByRole('button', { name: 'Bring in a statement' }).click()
  const sheet = page.getByRole('dialog', { name: 'Bring in a statement' })
  await sheet.locator('input[type="file"]').setInputFiles(path)
  return sheet
}

/** Money's one row of parts (v0.40.0): Overview, Spending, Receipts and Investing; Statements is a button in the title row. */
const part = (page: Page, name: 'Overview' | 'Spending' | 'Receipts' | 'Investing' | 'Statements') =>
  (name === 'Statements' ? page.locator('.money-title') : page.getByRole('group', { name: 'Money sections' })).getByRole('button', { name, exact: true })

/** Overview's tiles (v0.41.0) open the lists that used to be on the screen: opens one, unless it already is. */
async function openTile(page: Page, name: 'Regular payments' | 'What moved') {
  const tile = page.getByRole('group', { name: 'More about this month' }).getByRole('button', { name: new RegExp(`^${name}`) })
  if ((await tile.getAttribute('aria-expanded')) !== 'true') await tile.click()
}

/** Spending's lists of payments (v0.42.0) are folded to one row each: opens one, unless it already is (or there is none). */
async function openFold(page: Page, name: 'Money out' | 'Money in' | 'Who it was for' | 'Moved between your accounts') {
  const fold = page.getByRole('region', { name }).getByRole('button', { name: new RegExp(`^${name}`) })
  if ((await fold.count()) && (await fold.getAttribute('aria-expanded')) !== 'true') await fold.click()
}

async function accountView(page: Page, name: 'Overview' | 'Spending' | 'Statements') {
  await part(page, name).click()
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

// A first direct statement (owner, 2026-11-19: it came back as "no-table"): one heading over a code and its words, the
// date on a day's first line and the balance on its last, over two pages.
test('a first direct statement is read as one account, every line once and matching its balances', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 9, 18, 12, 0))
  await page.goto('./#/money')
  const sheet = await bringIn(page, await pdf(testInfo.outputPath('first-direct.pdf'), FIRSTDIRECT_LIKE))
  await expect(sheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveText([/^First Direct: 11 new · 18 Sept? ?– ?18 Oct$/])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await accountView(page, 'Statements')
  const accounts = page.getByRole('region', { name: 'Your accounts', exact: true })
  await expect(accounts.getByRole('listitem')).toContainText('First Direct')
  await expect(accounts.getByRole('listitem')).toContainText(/18 Sep\s+–\s+18 Oct 2026/)
  await expect(accounts.getByRole('listitem')).not.toContainText('Missing')
  await expect(accounts.getByRole('listitem')).not.toContainText('not adding')
})

// Several statements at once, and an account's own statement (v0.30.0, owner 2026-11-19): choose the PDFs of every account
// together, each filed under its own account and a file that isn't one told apart; then tap an account's name to read its
// statement, a month at a time.
test('several PDFs are brought in at once, and an account’s name opens its statement a month at a time', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 9, 18, 12, 0))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Bring in a statement' }).click()
  const sheet = page.getByRole('dialog', { name: 'Bring in a statement' })
  const letter = await pdf(testInfo.outputPath('letter.pdf'), [[{ text: 'Dear customer, your new card is on its way.', x: 57, y: 700 }]])
  const files = [await pdf(testInfo.outputPath('first-direct.pdf'), FIRSTDIRECT_LIKE), await pdf(testInfo.outputPath('lloyds.pdf'), LLOYDS_LIKE), letter]
  await sheet.locator('input[type="file"]').setInputFiles(files)
  await expect(sheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveText([
    /^First Direct: 11 new · 18 Sept? ?– ?18 Oct$/,
    /^Lloyds: 4 new · 1 ?– ?30 Sept?$/,
    'letter.pdf: No transactions were found in this PDF. Choose the statement itself, not a letter or a summary.',
  ])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await accountView(page, 'Statements')
  const accounts = page.getByRole('region', { name: 'Your accounts', exact: true })
  await accounts.getByRole('button', { name: 'First Direct', exact: true }).click()
  const view = page.getByRole('dialog', { name: 'First Direct', exact: true })
  // The latest month: its days newest first, a day's lines in the order its balances give, and what the month came to.
  await expect(view.getByRole('heading', { name: 'October 2026' })).toBeVisible()
  await expect(view.getByRole('group', { name: 'The month in figures' })).toHaveText(/^In\s*£0\.00\s*Out\s*£77\.30\s*Balance at the end\s*£146\.25$/)
  const rows = view.getByRole('listitem')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Example Shopping Card Sometown')
  await expect(rows.nth(0)).toContainText('£7.30')
  await expect(rows.nth(0)).toContainText('MAS · Balance £146.25')
  await expect(rows.nth(1)).toContainText('Example Broker BRK00EXAMPLE3')
  await expect(rows.nth(2)).toContainText('BRK00EXAMPLE2')
  // The month before.
  await view.getByRole('button', { name: 'Earlier: September 2026' }).click()
  await expect(view.getByRole('heading', { name: 'September 2026' })).toBeVisible()
  await expect(view.getByRole('group', { name: 'The month in figures' })).toHaveText(/^In\s*£350\.00\s*Out\s*£126\.45\s*Balance at the end\s*£223\.55$/)
  await expect(view.getByRole('listitem')).toHaveCount(8)
  await expect(view.getByRole('button', { name: /^Earlier/ })).toHaveCount(0)
  await view.getByRole('button', { name: 'Close' }).click()
  // Another account has its own statement.
  await accounts.getByRole('button', { name: 'Lloyds', exact: true }).click()
  const lloyds = page.getByRole('dialog', { name: 'Lloyds', exact: true })
  await expect(lloyds.getByRole('group', { name: 'The month in figures' })).toHaveText(/^In\s*£1600\.00\s*Out\s*£55\.99\s*Balance at the end\s*£1744\.01$/)
  await expect(lloyds.getByRole('listitem')).toHaveCount(4)
})

// Audit 2026-11-20 (high): in an account's own statement a line moved between your accounts looked the same in as out (no sign,
// no words) and the day's band left moved money in out of "in". Every line says which way it went, and the bands add up to
// the month's In and Out.
test('an account’s statement says in or out on every line, and its days add up to the month’s In and Out, moves between your accounts included', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 9, 18, 12, 0))
  await page.goto('./#/money')
  const sheet = await bringIn(page, await pdf(testInfo.outputPath('monzo.pdf'), MONZO_LIKE))
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await accountView(page, 'Statements')
  await page.getByRole('region', { name: 'Your accounts', exact: true }).getByRole('button', { name: 'Monzo', exact: true }).click()
  const view = page.getByRole('dialog', { name: 'Monzo', exact: true })
  await expect(view.getByRole('heading', { name: 'September 2026' })).toBeVisible()
  const subs = await view.locator('.acc-row-sub').allInnerTexts()
  expect(subs.length).toBeGreaterThan(3)
  for (const sub of subs) expect(sub, sub).toMatch(/^(In|Out|Refund) · /)
  const pence = (text: string) => Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100)
  const figure = async (label: string) => pence((await view.getByRole('group', { name: 'The month in figures' }).locator('.acc-stat', { hasText: new RegExp(`^${label}`) }).locator('.acc-stat-value').innerText()) ?? '')
  const bands = await view.locator('.acc-day-total').allInnerTexts()
  const total = (word: string) => bands.reduce((sum, band) => sum + (band.split(' · ').map((part) => part.match(new RegExp(`^\\+?(£[\\d,.]+) ${word}$`))?.[1]).filter(Boolean).map((v) => pence(v!))[0] ?? 0), 0)
  expect(total('in')).toBe(await figure('In'))
  expect(total('out')).toBe(await figure('Out'))
})

// Audit 2026-11-20 (high): a month no statement covers, with nothing in it, said "£0.00 out · 0 payments" like a month where
// nothing was spent, and the chart drew months before any statement as £0.
test('a month no statement covers says so instead of "£0.00 out", and the chart says the same of its months', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const bankLines = [{ id: 'p1', account: 'Example Current', date: '2026-09-10', amount: -1200, description: 'EXAMPLE SHOP', type: 'DD', balance: null, adds: true, createdAt: 1, updatedAt: 1 }]
  const statements = [{ id: 'example:2026-09-01:2026-09-30', account: 'Example Current', from: '2026-09-01', to: '2026-09-30', lines: 1, createdAt: 1, updatedAt: 1 }]
  await restoreBackup(page, testInfo.outputPath('uncovered.json'), backupWith({ bankLines, statements }, now))
  await page.goto('./#/money')
  // October: nothing in it and no statement reaching it.
  await expect(page.locator('.acc-hero')).toContainText('No statement yet')
  await expect(page.locator('.acc-hero')).toContainText('Bring in a statement that covers October')
  await expect(page.getByText('£0.00 out')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Money in and payments out' })).toHaveCount(0)
  // The chart's months before the first statement say so (in what a tap reads out and in its table); September does not.
  const chart = page.locator('.acc-chart')
  await expect(chart.getByRole('button', { name: /^May/ })).toHaveAttribute('aria-label', /no statement for this month/)
  await expect(chart.getByRole('button', { name: /^Sep/ })).not.toHaveAttribute('aria-label', /no statement for this month/)
  await chart.getByText('Show as table').click()
  await expect(chart.getByRole('row', { name: /^May/ })).toContainText('no statement for this month')
  // September has its figure.
  await page.goto('./#/money/2026-09')
  await expect(page.locator('.acc-hero')).toContainText('£12.00 out')
})

// Audit 2026-11-20 (high): stepping to an earlier month swapped the title for the month, put a back link above it and wrapped it,
// so the month arrows and the Statements button moved down under the finger. The title row is the same on every month.
test('the title row does not move when you step to an earlier month, and This month brings you back', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const bankLines = ['2026-08-10', '2026-09-10', '2026-10-10'].map((date, i) => ({ id: `m${i}`, account: 'Example Current', date, amount: -1000 * (i + 1), description: 'EXAMPLE SHOP', type: 'DD', balance: null, adds: true, createdAt: i + 1, updatedAt: i + 1 }))
  const statements = [{ id: 'example:2026-08-01:2026-10-31', account: 'Example Current', from: '2026-08-01', to: '2026-10-31', lines: 3, createdAt: 1, updatedAt: 1 }]
  await restoreBackup(page, testInfo.outputPath('title-row.json'), backupWith({ bankLines, statements }, now))
  const where = async () => ({
    title: await page.locator('.money-title h1').boundingBox(),
    arrows: await page.locator('.money-title .acc-step').first().boundingBox(),
    statements: await page.locator('.money-title .money-statements').boundingBox(),
    switchRow: await page.locator('.money-switch').boundingBox(),
  })
  await page.goto('./#/money')
  await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible()
  const now0 = await where()
  await page.getByRole('navigation', { name: 'Months' }).getByRole('link', { name: 'Earlier: September 2026' }).click()
  await expect(page.locator('.acc-hero')).toContainText('September 2026')
  await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible()
  const before = await where()
  for (const key of ['title', 'arrows', 'statements', 'switchRow'] as const) {
    expect(Math.round(before[key]!.y), key).toBe(Math.round(now0[key]!.y))
    expect(Math.round(before[key]!.x), key).toBe(Math.round(now0[key]!.x))
  }
  // And back to this month in one tap.
  await page.getByRole('link', { name: 'This month' }).click()
  await expect(page.locator('.acc-hero')).toContainText('October so far')
  await expect(page.getByRole('link', { name: 'This month' })).toHaveCount(0)
})

// Trading 212 (v0.34.0, owner 2026-11-19: nearly all of a month's "money out" was what he sent to it): both of its
// documents are read for the cash that moved, the bank's side is paired with it, and neither counts as spending.
test('a payment to Trading 212 is paired with its deposit and counts as neither spending nor money in', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 9, 18, 12, 0))
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Bring in a statement' }).click()
  const sheet = page.getByRole('dialog', { name: 'Bring in a statement' })
  const files = [await pdf(testInfo.outputPath('first-direct.pdf'), FIRSTDIRECT_LIKE), await pdf(testInfo.outputPath('trading212-transactions.pdf'), TRANSACTIONS_LIKE), await pdf(testInfo.outputPath('trading212-activity.pdf'), activityLike())]
  await sheet.locator('input[type="file"]').setInputFiles(files)
  // The two Trading 212 documents cover the same days: the second adds nothing.
  await expect(sheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveText([
    /^First Direct: 11 new/,
    /^Trading 212 Stocks ISA: 3 new · 20 Sept? ?– ?18 Oct$/,
    /^Trading 212 Stocks ISA investing: 3 interest lines · 3 new$/,
    /^Trading 212 Stocks ISA: 3 already here · 20 Sept? ?– ?18 Oct$/,
    /^Trading 212 Stocks ISA investing: 6 trades · 2 dividends · 3 interest lines · 8 new · 3 already here$/,
  ])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  // October's payments to the broker: £50 was paired with a deposit, £20 was not, so two payments went out (it and the shop).
  await expect(page.getByRole('group', { name: 'Money in and payments out' })).toContainText('2 payments')
  await accountView(page, 'Spending')
  await openFold(page, 'Moved between your accounts')
  const moved = page.getByRole('region', { name: 'Moved between your accounts' })
  await expect(moved).toContainText('Between your accounts')
  // The account is listed, and its statement is its transfers.
  await accountView(page, 'Statements')
  await page.getByRole('region', { name: 'Your accounts', exact: true }).getByRole('button', { name: 'Trading 212 Stocks ISA', exact: true }).click()
  const view = page.getByRole('dialog', { name: 'Trading 212 Stocks ISA', exact: true })
  await expect(view.getByRole('heading', { name: 'October 2026' })).toBeVisible()
  await expect(view.getByRole('listitem')).toHaveCount(2)
})

// Trading 212's Investing view (v0.36.0, owner 2026-11-19: "profit made, cost and charges, etc"): what its Activity statement
// prints of trades, dividends and interest, a month at a time as plain sums.
test('Money → Investing shows a month’s profit and loss, costs and charges and income from the Trading 212 statement, each opening to its lines', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 9, 18, 12, 0))
  await page.goto('./#/money')
  // With nothing from Trading 212 brought in, there is no Investing part.
  await expect(page.getByRole('group', { name: 'Money sections' }).getByRole('button', { name: 'Investing' })).toHaveCount(0)
  const sheet = await bringIn(page, await pdf(testInfo.outputPath('trading212-activity.pdf'), activityLike()))
  await expect(sheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveText([
    /^Trading 212 Stocks ISA: 3 new · 20 Sept? ?– ?18 Oct$/,
    /^Trading 212 Stocks ISA investing: 6 trades · 2 dividends · 3 interest lines · 11 new$/,
  ])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  // Each Trading 212 account is told by its type, not only its digits (v0.44.0).
  await accountView(page, 'Statements')
  await expect(page.getByRole('region', { name: 'Your accounts', exact: true })).toContainText('Trading 212 Stocks ISA')
  await expect(page.getByRole('region', { name: 'Your accounts', exact: true })).not.toContainText('Trading 212 ···0001')
  await page.getByRole('group', { name: 'Money sections' }).getByRole('button', { name: 'Investing' }).click()
  await expect(page.getByText('Checked against the totals your statement prints.')).toBeVisible()

  // Profit and loss: what the month's sales made or lost, by ticker, and what the statement still held.
  const profit = page.getByRole('region', { name: 'Profit and loss' })
  await expect(profit.getByText('+£12.74').first()).toBeVisible()
  // The total, then what it is made up of (owner 2026-11-20: "APP and other instruments don't look like a breakdown"): a
  // sign and green for made, a true minus and red for lost, never the words "made" or "lost".
  await expect(profit.locator('.acc-row-value[data-in]').first()).toHaveText('+£12.74')
  await expect(profit.getByText('Made up of')).toBeVisible()
  await expect(profit.locator('.acc-madeof')).toContainText('Other instruments')
  await expect(profit).not.toContainText(/\bmade\b(?! up)/)
  await expect(profit).not.toContainText(/\blost\b/)
  // The statement's result is before charges (its fees are printed apart); the card says so and takes them off in one row.
  await expect(profit).toContainText('Before charges')
  await expect(profit.locator('.acc-pair li', { hasText: 'After charges' })).toContainText('+£11.09')
  // Fewer than 3 sales of an instrument: all in one line that opens, by name.
  await profit.locator('summary', { hasText: 'Other instruments' }).click()
  await expect(profit.getByText('3 instruments, fewer than 3 sales each')).toBeVisible()
  await expect(profit.getByText('EXMQ').first()).toBeVisible()
  await expect(profit).toContainText('+£5.23')
  // A sale that lost: its minus and its red, a gain's green, and plain ink for the rest.
  await profit.locator('summary', { hasText: 'EXMQ' }).click()
  const lost = profit.locator('.acc-row-value[data-loss]')
  await expect(lost).toHaveText('−£3.33')
  await expect(lost).toHaveCSS('color', 'rgb(179, 38, 30)')
  await expect(profit.locator('.acc-row-value[data-in]').first()).toHaveCSS('color', 'rgb(31, 122, 77)')
  // What is held is a tile of its own (v0.43.0), beside Costs and charges and Income, which open under the tiles.
  const tiles = page.getByRole('group', { name: 'More about this month' })
  await expect(tiles).toContainText('Held at')
  await expect(tiles).toContainText('open result −£412.50')
  await expect(tiles).toContainText('£5000.00 in all')

  // Costs and charges: FX fees, exchange and government fees, and tax withheld, with the trades they came on.
  await expect(page.getByRole('region', { name: 'Costs and charges' })).toHaveCount(0)
  await tiles.getByRole('button', { name: /^Costs and charges/ }).click()
  const costs = page.getByRole('region', { name: 'Costs and charges' })
  await expect(costs).toContainText('£1.76 in all, on 6 trades')
  await expect(costs.locator('summary', { hasText: 'FX fees' })).toContainText('£1.15')
  await expect(costs.locator('summary', { hasText: 'Exchange and government fees' })).toContainText('£0.50')
  await expect(costs.locator('summary', { hasText: 'Tax withheld on dividends' })).toContainText('£0.11')

  // Income: dividends after tax, and interest on cash.
  await tiles.getByRole('button', { name: /^Income/ }).click()
  const income = page.getByRole('region', { name: 'Income' })
  await expect(income.locator('summary', { hasText: 'Dividends' })).toContainText('£3.92')
  await expect(income.getByText('Interest on cash')).toBeVisible()
  // Nothing in it reads as a rating or a percentage.
  await expect(page.locator('.money-screen')).not.toContainText('%')
})

// Wherever a payment is listed it opens the same sheet, with Rename, Assign category and Who was it for (owner, 2026-11-19:
// "I can't do that from everywhere where I see an entry").
test('every list of payments opens the same payment sheet: an account’s statement, Spending, and Search', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 9, 18, 12, 0))
  await page.goto('./#/money')
  const sheet = await bringIn(page, await pdf(testInfo.outputPath('first-direct.pdf'), FIRSTDIRECT_LIKE))
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  const expectSheet = async (name: string | RegExp) => {
    const payment = page.getByRole('dialog', { name })
    await expect(payment.getByRole('button', { name: 'Rename transaction' })).toBeVisible()
    await expect(payment.getByRole('button', { name: '+ Assign category' })).toBeVisible()
    await expect(payment.getByRole('button', { name: '+ Who was it for?' })).toBeVisible()
    await payment.getByRole('button', { name: 'Close' }).click()
  }

  // An account's statement.
  await accountView(page, 'Statements')
  await page.getByRole('region', { name: 'Your accounts', exact: true }).getByRole('button', { name: 'First Direct', exact: true }).click()
  const statement = page.getByRole('dialog', { name: 'First Direct', exact: true })
  await statement.getByRole('button', { name: /Example Shopping Card Sometown/ }).click()
  await expectSheet('Example Shopping Card Sometown')
  // Closing the sheet leaves the statement where it was.
  await expect(statement.getByRole('heading', { name: 'October 2026' })).toBeVisible()
  await statement.getByRole('button', { name: 'Close' }).click()

  // Spending: a payee paid once.
  await accountView(page, 'Spending')
  await openFold(page, 'Money out')
  await page.getByRole('button', { name: /Example Broker BRK00EXAMPLE2/ }).click()
  await expectSheet('Example Broker BRK00EXAMPLE2')

  // Search lists payments from every month (the same list a group of payments opens to), and each one opens it too.
  await page.getByRole('searchbox', { name: 'Search every payment' }).fill('shopping card')
  await expect(page.getByRole('button', { name: /Example Shopping Card Sometown/ })).toHaveCount(2)
  await page.getByRole('button', { name: /Example Shopping Card Sometown/ }).first().click()
  await expectSheet('Example Shopping Card Sometown')
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
  await openFold(page, 'Money in')
  const moneyIn = page.getByRole('region', { name: 'Money in' })
  await moneyIn.getByRole('button', { name: /^A N Other/ }).click()
  await page.getByRole('dialog', { name: 'A N Other' }).getByRole('button', { name: 'It’s me, moving money' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(summary).toHaveText(['Money in £1501.25', 'Payments out 8 payments'])
  await openFold(page, 'Moved between your accounts')
  const moved = page.getByRole('region', { name: 'Moved between your accounts' })
  await expect(moved.locator('summary')).toHaveText(['Monzo Flex 2 moves', 'Pots 1 move', 'A N Other Your own account · 1 move'])
  // A statement prints your name, not which account: named your way, it's remembered.
  // Each row says where the money went; a pot's move is one row (owner, 2026-10-26).
  await moved.locator('summary', { hasText: 'Pots' }).click()
  await expect(moved.locator('details', { hasText: 'Pots' }).locator('.acc-lines li')).toHaveText([/^Withdrawal Tue,? 8 Sept? · Monzo Savings pot → Monzo ?£50\.00$/])
  await moved.locator('summary', { hasText: 'Monzo Flex' }).click()
  await expect(moved.locator('details', { hasText: 'Monzo Flex' }).locator('.acc-lines li')).toHaveText([/^Thu,? 10 Sept? ?Paid off, from Monzo ?£12\.40$/, /^Wed,? 2 Sept? ?Spread with Flex ?£12\.40$/])
  await moved.locator('summary', { hasText: 'A N Other' }).click()
  await moved.getByRole('button', { name: 'Rename A N Other' }).click()
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
  await openFold(page, 'Money out')
  const moneyOut = page.getByRole('region', { name: 'Money out' })
  await moneyOut.getByRole('button', { name: /^Example Streaming/ }).click()
  const streaming = page.getByRole('dialog', { name: 'Example Streaming' })
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

  await openTile(page, 'Regular payments')

  const regularPayments = page.getByRole('region', { name: 'Regular payments' })
  // Coming up is a row of its own above the payments, so pick the payment's row: it says "every month".
  const regular = regularPayments.locator('details.acc-item', { hasText: 'every month' })
  await expect(regular.locator('summary')).toContainText('Example Streaming')
  await regular.locator('summary').click()
  await regular.getByRole('button', { name: 'Rename Example Streaming' }).click()
  const naming = page.getByRole('dialog', { name: 'Rename regular payment' })
  await naming.getByRole('textbox').fill('Example streaming')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(regular.locator('summary')).toContainText('Example streaming')

  for (const month of ['2026-07', '2026-08', '2026-09']) {
    await page.goto(`./#/money/${month}`)
    await accountView(page, 'Spending')
    await openFold(page, 'Money out')
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
  await openFold(page, 'Money out')
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

  await openTile(page, 'Regular payments')

  const regularPayments = page.getByRole('region', { name: 'Regular payments' })
  const total = regularPayments.locator('.acc-total')
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

  await openTile(page, 'Regular payments')

  const regularPayments = page.getByRole('region', { name: 'Regular payments' })
  // A payment's row says how often; Coming up (closed) holds the same names, so the names alone would match it too.
  const streaming = regularPayments.locator('details.acc-item', { hasText: 'every month' })
  const weekly = regularPayments.locator('details.acc-item', { hasText: 'every week' })
  // Last paid 12 Sep, so the 12 Oct one is past and the next is 12 Nov; weekly, last paid 22 Oct, next 29 Oct.
  await expect(streaming.locator('summary')).toContainText('every month · next around 12 Nov · £131.88 a year')
  await expect(weekly.locator('summary')).toContainText('every week · next around 29 Oct · £260.00 a year')

  // The next 30 days from 27 Oct run to 26 Nov: the weekly box on 29 Oct, 5, 12, 19 and 26 Nov, the streaming one on 12 Nov.
  // Coming up is a part of its own (v0.45.0, owner 2026-11-20: "3 different types of information, all looking part of the same
  // list"): a labelled run of dated payments, not a row that opens, and apart from the total and from each regular payment.
  const coming = regularPayments.getByRole('region', { name: 'Coming up' })
  await expect(coming).toContainText('6 payments in the next 30 days')
  await expect(coming).toContainText('£35.99')
  await expect(coming.getByRole('listitem')).toHaveCount(6)
  await expect(coming.getByRole('listitem').first()).toContainText('Example Weekly Box')
  await expect(coming.getByRole('listitem').first()).toContainText('29 Oct')
  // The total is a header, not a row of the list; the payments are under their own label.
  await expect(regularPayments.locator('.acc-total')).toContainText('Total regular payments')
  await expect(regularPayments.locator('li.acc-total')).toHaveCount(0)
  await expect(regularPayments.getByText('Each regular payment')).toBeVisible()

  // An earlier month says nothing of what's next: no Coming up, no "next around".
  await page.goto('./#/money/2026-09')
  await openTile(page, 'Regular payments')
  const earlier = page.getByRole('region', { name: 'Regular payments' })
  await expect(earlier).toContainText('every month')
  await expect(earlier).not.toContainText('next around')
  await expect(earlier).not.toContainText('Coming up')
})

// Money's Overview (v0.41.0, owner 2026-11-20: "each and every tab looks monotonous and like lists"): a bar for committed and
// everyday under the figure, and tiles that open what used to be a stack of lists.
test('Overview: a committed and everyday bar, and tiles that open Regular payments, What moved and the year', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const payment = (id: string, date: string, amount: number, description: string, createdAt: number) => ({ id, account: 'Lloyds ···4321', date, amount, description, type: 'DD', balance: null, adds: true, createdAt, updatedAt: createdAt })
  const bankLines = [
    ...['2026-07-14', '2026-08-13', '2026-09-12'].map((date, i) => payment(`month-${i}`, date, -1099, 'EXAMPLE STREAMING', i + 1)),
    ...['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((date, i) => payment(`week-${i}`, date, -500, 'EXAMPLE WEEKLY BOX', i + 10)),
    payment('shop', '2026-10-05', -2000, 'EXAMPLE CORNER SHOP', 20),
  ]
  await restoreBackup(page, testInfo.outputPath('overview-tiles.json'), backupWith({ bankLines }, now))
  await page.goto('./#/money')

  // The bar: committed £20 and everyday £20 of £40, half and half, and the words say the same.
  const bar = page.locator('.acc-split')
  await expect(bar).toBeVisible()
  const widths = await bar.locator('span[data-part]').evaluateAll((els) => els.map((el) => Math.round((el as HTMLElement).getBoundingClientRect().width)))
  expect(Math.abs(widths[0]! - widths[1]!)).toBeLessThanOrEqual(2)
  await expect(page.getByText('Committed £20.00 · Everyday £20.00')).toBeVisible()

  // The tiles: one number each. The lists they open are not on the screen until asked for.
  const tiles = page.getByRole('group', { name: 'More about this month' })
  await expect(tiles.getByRole('button', { name: /^Regular payments/ })).toContainText('£10.99 a month + £5.00 a week')
  await expect(tiles.getByRole('link', { name: /^2026 so far/ })).toContainText('£72.97 out')
  await expect(page.getByRole('region', { name: 'Regular payments' })).toHaveCount(0)
  await tiles.getByRole('button', { name: /^Regular payments/ }).click()
  await expect(tiles.getByRole('button', { name: /^Regular payments/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('region', { name: 'Regular payments' })).toBeVisible()
  await tiles.getByRole('button', { name: /^Regular payments/ }).click()
  await expect(page.getByRole('region', { name: 'Regular payments' })).toHaveCount(0)
})

// Money's Spending (v0.42.0, owner 2026-11-20): one bar of the month by kind and the five biggest kinds under it, the rest and
// every list of payments folded to one row each.
test('Spending: a bar by kind with the five biggest kinds under it, the rest folded, and every list of payments one row that opens', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const shops = [['EXAMPLE GROCER', 'Groceries', 3000], ['EXAMPLE CAFE', 'Eating out', 2500], ['EXAMPLE BUS', 'Transport', 2000], ['EXAMPLE POWER', 'Bills', 1500], ['EXAMPLE CHEMIST', 'Health', 1000], ['EXAMPLE CINEMA', 'Fun', 500]] as const
  const bankLines = [
    ...shops.flatMap(([description, , pence], s) => [3, 10, 17].map((day, i) => ({ id: `${s}-${i}`, account: 'Lloyds ···4321', date: `2026-10-${String(day + s).padStart(2, '0')}`, amount: -pence, description, type: 'DD', balance: null, adds: true, createdAt: s * 10 + i, updatedAt: s * 10 + i }))),
    { id: 'u1', account: 'Lloyds ···4321', date: '2026-10-20', amount: -700, description: 'EXAMPLE MARKET STALL', type: 'DD', balance: null, adds: true, createdAt: 90, updatedAt: 90 },
  ]
  const settings = [{ key: 'payeeKinds', value: Object.fromEntries(shops.map(([description, kind]) => [description.toLowerCase(), kind])), updatedAt: 1 }]
  await restoreBackup(page, testInfo.outputPath('spending-bar.json'), backupWith({ bankLines, settings }, now))
  await page.goto('./#/money')
  await accountView(page, 'Spending')

  // The bar: the five biggest kinds, then everything else in one grey piece, widest first; the rows say the figures.
  const bar = page.locator('.acc-kinds-bar')
  await expect(bar).toBeVisible()
  const widths = await bar.locator('span[data-part]').evaluateAll((els) => els.map((el) => Math.round((el as HTMLElement).getBoundingClientRect().width)))
  expect(widths).toHaveLength(6)
  expect(widths.slice(0, 5)).toEqual([...widths.slice(0, 5)].sort((a, b) => b - a))
  const kinds = page.getByRole('region', { name: 'By what it was for' })
  await expect(kinds.locator(':scope > ul > li > details > summary')).toHaveText([/^Groceries 3 payments £90\.00$/, /^Eating out 3 payments £75\.00$/, /^Transport 3 payments £60\.00$/, /^Bills 3 payments £45\.00$/, /^Health 3 payments £30\.00$/, /^Everything else /])
  await kinds.locator('summary', { hasText: 'Everything else' }).click()
  await expect(kinds).toContainText('Fun')
  await expect(kinds).toContainText('Not sorted yet')

  // Every list of payments is one row; it opens to its list.
  const out = page.getByRole('region', { name: 'Money out' })
  const outFold = out.getByRole('button', { name: /^Money out/ })
  await expect(outFold).toHaveAttribute('aria-expanded', 'false')
  await expect(out.locator('summary', { hasText: 'Example Grocer' })).toHaveCount(0)
  await outFold.click()
  await expect(out.locator('summary', { hasText: 'Example Grocer' })).toBeVisible()
  await outFold.click()
  await expect(out.locator('summary', { hasText: 'Example Grocer' })).toHaveCount(0)
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

  await openTile(page, 'What moved')

  const changed = page.getByRole('region', { name: 'What changed' })
  const row = (name: string) => changed.locator('details.acc-item', { hasText: name })
  const summary = (name: string) => row(name).locator(':scope > summary')
  await expect(summary('Example Broadband')).toContainText('went up from £32.50 to £36.50 · +£48.00 a year')
  await expect(summary('Example New Sub')).toContainText('new · first paid 12 Aug · every month')
  await expect(summary('Example Gym Club')).toContainText('no payment since 10 Aug · was every month')
  // It opens to its payments.
  await summary('EXAMPLE GYM CLUB').click()
  await expect(row('Example Gym Club')).toContainText('10 Jul')

  // The stopped one is no longer a regular payment: not in the list, the total or Coming up. The others are.
  await openTile(page, 'Regular payments')
  const regularPayments = page.getByRole('region', { name: 'Regular payments' })
  await expect(regularPayments).toContainText('Example Broadband')
  await expect(regularPayments).toContainText('Example New Sub')
  await expect(regularPayments).not.toContainText('Example Gym Club')
  await expect(regularPayments.locator('.acc-total')).toContainText('2 payments, all monthly')
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
  // The year is a page of its own, with its back link: the row of parts (which would do nothing here) is not on it (audit 2026-11-20).
  await expect(page.getByRole('heading', { level: 1, name: '2026' })).toBeVisible()
  await expect(page.locator('.money-switch')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: '2026' })).toBeVisible()
  await expect(page.getByText('£92.97 out', { exact: true })).toBeVisible()
  await expect(page.getByText('From your accounts · Aug – Oct', { exact: true })).toBeVisible()
  await expect(page.getByText('Money in £2000.00 · 5 payments out', { exact: true })).toBeVisible()
  await expect(page.getByText('£1907.03 more in than out so far', { exact: true })).toBeVisible()
  await expect(page.getByText('Committed £32.97 · Everyday £60.00', { exact: true })).toBeVisible()

  // The regular payment it paid in the year, and the month with no statement.
  const regular = page.getByRole('region', { name: 'Regular payments' })
  await expect(regular).toContainText('Example Streaming')
  await expect(regular).toContainText('every month · 3 payments')
  await expect(regular).toContainText('£32.97')
  const missing = page.getByRole('region', { name: 'Not brought in' })
  await expect(missing).toContainText('Lloyds')
  await expect(missing).toContainText('Jun 2026')
  // The biggest payees are those paid 3 times or more.
  await expect(page.getByRole('region', { name: 'Biggest payees' })).toContainText('Example Streaming')

  // The years either side: 2025 had one payment out of £30.00 and nothing to say about missing statements after it.
  await page.getByRole('link', { name: 'Earlier: 2025' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '2025' })).toBeVisible()
  await expect(page.getByText('£30.00 out', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Earlier:/ })).toHaveCount(0)
  await page.getByRole('link', { name: 'Later: 2026' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '2026' })).toBeVisible()

  // And back to Money.
  await page.getByRole('link', { name: 'Back to Money' }).click()
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
  await openFold(page, 'Money out')
  await expect(page.getByRole('region', { name: 'Money out' }).getByRole('button', { name: /Example Visa Centre/ })).toHaveCount(1)
  await openFold(page, 'Money out')
  await expect(page.getByRole('region', { name: 'Money out' }).getByText('moved to Flex')).toHaveCount(0)
  await openFold(page, 'Moved between your accounts')
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
  // The month you are in has no "not every statement" note (it is still being brought in), but when no statement reaches it at
  // all it says so, as the figure above does.
  await chart.getByRole('button', { name: /^November so far/ }).click()
  await expect(chart.locator('.chart-readout')).toHaveText('November so far: no payments · no statement for this month')
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
  await openFold(page, 'Money in')
  await expect(page.getByRole('region', { name: 'Money in' })).toBeVisible()

  // By name: both amazon payments, in two years, each year with what it comes to.
  await search.fill('amazon')
  await openFold(page, 'Money in')
  await expect(page.getByRole('region', { name: 'Money in' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '2025' })).toContainText('2 payments · £34.99')
  await expect(page.getByRole('region', { name: '2025' }).getByRole('button')).toHaveCount(2)
  await expect(page.getByRole('region', { name: '2026' })).toHaveCount(0)

  // By amount, as far as typed: £24.99 in 2025 and again in 2026, newest year first.
  await search.fill('24.9')
  await expect(page.getByRole('region')).toContainText(['1 payment · £24.99', '1 payment · £24.99'])
  await expect(page.getByRole('heading', { level: 2, name: /^20/ })).toHaveText(['2026', '2025'])

  // A payment opens, as everywhere else, and the name you give it alone can be found.
  await page.getByRole('region', { name: '2026' }).getByRole('button').first().click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByRole('textbox')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Rename transaction' }).click()
  const naming = page.getByRole('dialog', { name: 'Rename transaction' })
  await naming.getByRole('radio', { name: /Only this payment/ }).check()
  await naming.getByRole('textbox').fill('birthday present')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'birthday present' }).getByRole('button', { name: 'Close' }).click()
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
  await openFold(page, 'Money in')
  await expect(page.getByRole('region', { name: 'Money in' })).toBeVisible()
  await search.fill('amazon')
  await search.fill('')
  await openFold(page, 'Money in')
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
  await expect(search).toHaveAttribute('placeholder', 'Search by name or amount')
  const clear = page.getByRole('button', { name: 'Clear the search' })
  await expect(clear).toHaveCount(0)

  await search.fill('passport')
  const year = page.getByRole('region', { name: '2026' })
  // One payment, one row, naming where it went; money moved is not counted in the year's line.
  await expect(year.locator('.acc-status')).toHaveText('1 payment · £41.17')
  await expect(year.locator(':scope > ul.acc-lines > li')).toHaveText([/^Example Passport Office Thu,? 8 Oct · Out of Example Current ?£41\.17$/])
  // Its Flex side is under money moved, closed until asked for, and says whose purchase it paid off.
  const moved = year.locator('details', { hasText: 'Moved between your accounts' })
  await expect(moved.locator('summary')).toHaveText('Moved between your accounts 1 move, left out')
  await moved.locator('summary').click()
  await expect(moved.locator('.acc-lines li')).toHaveText([/^Example Passport Office Thu,? 8 Oct · Paid off, from Monzo Flex ?£41\.17$/])

  // A ✕ clears the search and the keyboard stays up for the next one; the month's lists come back.
  await expect(clear).toBeVisible()
  await clear.click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await expect(clear).toHaveCount(0)
  await openFold(page, 'Money out')
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
  await openFold(page, 'Money out')
  const out = page.getByRole('region', { name: 'Money out' })
  const group = out.locator('details', { hasText: 'Example Pharmacy Leicester' })
  await group.locator('summary').click()
  const rows = group.locator('.acc-lines li')
  const open = async (day: string) => {
    await rows.filter({ hasText: day }).getByRole('button').click()
  }

  // The 7th: renamed for this payment only.
  await open('7 Oct')
  await page.getByRole('dialog', { name: 'Example Pharmacy Leicester' }).getByRole('button', { name: 'Rename transaction' }).click()
  const naming = page.getByRole('dialog', { name: 'Rename transaction' })
  await expect(naming.getByRole('radio', { name: /All payments to Example Pharmacy Leicester/ })).toBeChecked()
  await naming.getByRole('radio', { name: /Only this payment/ }).check()
  await naming.getByRole('textbox').fill('Fever medicine')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  // The sheet it was named from shows the new name at once, and who was paid under it.
  const named = page.getByRole('dialog', { name: 'Fever medicine' })
  await expect(named).toContainText('Paid to: Example Pharmacy Leicester')
  await named.getByRole('button', { name: 'Close' }).click()
  // It is still one payee of three payments; only that row has a name of its own.
  await expect(group.locator('summary')).toContainText('Example Pharmacy Leicester')
  await expect(group.locator('summary')).toContainText('3 payments')
  await expect(rows).toHaveText([/^Thu,? 15 Oct Out of Lloyds[^£]*£4\.99$/, /^Fever medicine Wed,? 7 Oct · Out of Lloyds[^£]*£4\.99$/, /^Sat,? 3 Oct Out of Lloyds[^£]*£5\.00$/])

  // Search finds it by its name, and the shop's name still finds all three.
  await accountView(page, 'Spending')
  const search = page.getByRole('searchbox', { name: 'Search every payment' })
  await search.fill('fever')
  await expect(page.getByRole('region', { name: '2026' })).toContainText('1 payment · £4.99')
  await search.fill('pharmacy')
  await expect(page.getByRole('region', { name: '2026' })).toContainText('3 payments · £14.98')
  await search.fill('')
  await openFold(page, 'Money out') // (a search closes what was open)

  // Its sheet says who was paid; the choice opens on "Only this payment" with its own name in the box.
  await group.locator('summary').click()
  await open('7 Oct')
  const sheet = page.getByRole('dialog', { name: 'Fever medicine' })
  await expect(sheet).toContainText('Paid to: Example Pharmacy Leicester')
  await sheet.getByRole('button', { name: 'Rename transaction' }).click()
  await expect(naming.getByRole('radio', { name: /Only this payment/ })).toBeChecked()
  await expect(naming.getByRole('textbox')).toHaveValue('Fever medicine')

  // All payments to the shop can still be named together, and the one named alone keeps its own name.
  await naming.getByRole('radio', { name: /All payments to/ }).check()
  await expect(naming.getByRole('textbox')).toHaveValue('Example Pharmacy Leicester')
  await naming.getByRole('textbox').fill('The pharmacy')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(out.locator('details', { hasText: 'The pharmacy' }).locator('summary')).toContainText('3 payments')
  await expect(rows.nth(1)).toContainText('Fever medicine')
  await expect(rows.nth(1)).toContainText('Out of Lloyds')
  await expect(rows.nth(0)).toContainText('Out of Lloyds')

  // Emptying its name goes back to the shop's.
  await open('7 Oct')
  await page.getByRole('dialog', { name: 'Fever medicine' }).getByRole('button', { name: 'Rename transaction' }).click()
  await naming.getByRole('textbox').fill('')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'The pharmacy' }).getByRole('button', { name: 'Close' }).click()
  await expect(rows).toHaveText([/^Thu,? 15 Oct ?Out of Lloyds[^£]*£4\.99$/, /^Wed,? 7 Oct ?Out of Lloyds[^£]*£4\.99$/, /^Sat,? 3 Oct ?Out of Lloyds[^£]*£5\.00$/])
})

// v0.20.38 (owner, 2026-11-01: what goes on one person): a payment is filed under who it was for, for itself or for all
// its payee's; money out is then totalled by name, on the month and on the year, each name opening to its payments.
test('a payment can be filed under who it was for, alone or for all its shop’s, and money out is totalled by name', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 27, 12, 0)
  await page.clock.setFixedTime(now)
  const pay = (id: string, date: string, amount: number, description: string, n: number) => ({ id, account: LLOYDS, date, amount, description, type: 'DEB', balance: null, adds: true, createdAt: n, updatedAt: n })
  const bankLines = [
    pay('p1', '2026-10-03', -500, 'EXAMPLE PHARMACY LEICESTER', 1),
    pay('p2', '2026-10-07', -499, 'EXAMPLE PHARMACY LEICESTER', 2),
    pay('p3', '2026-10-15', -499, 'EXAMPLE PHARMACY LEICESTER', 3),
    pay('g1', '2026-10-10', -2000, 'EXAMPLE GROCER', 4),
  ]
  // Priya is a person in an entry: offered, not yet a name.
  const entries = [{ ...freeWriting('e-people', '', 3, now), people: ['Priya'] }]
  await restoreBackup(page, testInfo.outputPath('who-for.json'), backupWith({ bankLines, entries }, now))
  await page.goto('./#/money')
  await accountView(page, 'Spending')
  await openFold(page, 'Money out')
  const out = page.getByRole('region', { name: 'Money out' })
  await openFold(page, 'Who it was for')
  const who = page.getByRole('region', { name: 'Who it was for' })
  // Nothing is filed: no block.
  await expect(who).toHaveCount(0)

  const open = async (day: string) => {
    const group = out.locator('details', { hasText: 'Example Pharmacy Leicester' })
    if (!(await group.evaluate((el) => (el as HTMLDetailsElement).open))) await group.locator('summary').click()
    await group.locator('.acc-lines li').filter({ hasText: day }).getByRole('button').click()
  }
  const sheet = page.getByRole('dialog', { name: 'Example Pharmacy Leicester' })
  const forSheet = page.getByRole('dialog', { name: 'Who was it for?' })

  // The 7th, for itself alone, under a name typed; a person from an entry is offered.
  await open('7 Oct')
  await sheet.getByRole('button', { name: '+ Who was it for?' }).click()
  await expect(forSheet.getByRole('radio', { name: 'Only this payment' })).toBeChecked()
  await expect(forSheet.getByRole('button', { name: 'Priya' })).toBeVisible()
  await forSheet.getByRole('textbox', { name: 'A new name' }).fill('Riya')
  await forSheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'For: Riya' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await openFold(page, 'Who it was for')
  await expect(who.locator('summary')).toHaveText(['Riya 1 payment £4.99', 'Nobody in particular 3 payments £29.99'])

  // The 15th, for all the pharmacy's payments, under the name now in the list.
  await open('15 Oct')
  await sheet.getByRole('button', { name: '+ Who was it for?' }).click()
  await forSheet.getByRole('radio', { name: /All payments to Example Pharmacy Leicester/ }).check()
  await forSheet.getByRole('radio', { name: 'Riya' }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await openFold(page, 'Who it was for')
  await expect(who.locator('summary')).toHaveText(['Riya 3 payments £14.98', 'Nobody in particular 1 payment £20.00'])

  // The 3rd says nobody, alone, over the pharmacy's name.
  await open('3 Oct')
  await sheet.getByRole('button', { name: 'For: Riya' }).click()
  await expect(forSheet.getByRole('radio', { name: /All payments to Example Pharmacy Leicester/ })).toBeChecked()
  await forSheet.getByRole('radio', { name: 'Only this payment' }).check()
  await forSheet.getByRole('radio', { name: 'Nobody in particular' }).click()
  await expect(sheet.getByRole('button', { name: '+ Who was it for?' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await openFold(page, 'Who it was for')
  await expect(who.locator('summary')).toHaveText(['Riya 2 payments £9.98', 'Nobody in particular 2 payments £25.00'])

  // A name opens to its payments; the search finds it; the year has it; it is kept.
  await who.locator('summary', { hasText: 'Riya' }).click()
  await expect(who.locator('details', { hasText: 'Riya' }).locator('.acc-lines li')).toHaveText([/^Thu,? 15 Oct ?Out of Lloyds[^£]*£4\.99$/, /^Wed,? 7 Oct ?Out of Lloyds[^£]*£4\.99$/])
  await page.getByRole('searchbox', { name: 'Search every payment' }).fill('riya')
  await expect(page.getByRole('region', { name: '2026' })).toContainText('2 payments · £9.98')
  await page.goto('./#/money/2026')
  await openFold(page, 'Who it was for')
  await expect(page.getByRole('region', { name: 'Who it was for' }).locator('summary')).toHaveText(['Riya 2 payments £9.98', 'Nobody in particular 2 payments £25.00'])
  await page.reload()
  await openFold(page, 'Who it was for')
  await expect(page.getByRole('region', { name: 'Who it was for' }).locator('summary')).toHaveText(['Riya 2 payments £9.98', 'Nobody in particular 2 payments £25.00'])
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

  await openFold(page, 'Money out')
  const out = page.getByRole('region', { name: 'Money out' })
  // One payment is already its complete row: it opens directly, with no empty disclosure to expand.
  const payment = out.getByRole('button', { name: /^Example Streaming Sat,? 12 Sept? · Out of Lloyds · Receipt £10\.99$/ })
  await payment.click()
  await page.getByRole('dialog', { name: 'Example Streaming' }).getByRole('button', { name: 'Open its receipt' }).click()
  // The receipt opens to its items (v0.20.18), and from there its entry.
  const receipt = page.getByRole('dialog', { name: 'Example Streaming' })
  await expect(receipt.getByRole('list', { name: 'Items' })).toContainText('Monthly plan · £10.99')
  await receipt.getByRole('button', { name: 'Open the entry' }).click()
  await expect(page.getByRole('dialog', { name: 'Photo' })).toBeVisible()
  // A payment with no receipt is still a direct row.
  await page.getByRole('dialog', { name: 'Photo' }).getByRole('button', { name: 'Done', exact: true }).click()
  const energy = out.getByRole('button', { name: /^Example Energy Wed,? 2 Sept? · Out of Lloyds £45\.00$/ })
  await expect(energy).toBeVisible()

  // What a payment was for (owner, 2026-10-26): a kind for its payee, kept for all its payments, and a name for one.
  await energy.click()
  const paymentSheet = page.getByRole('dialog', { name: 'Example Energy' })
  await paymentSheet.getByRole('button', { name: /^(\+ Assign category|Category: )/ }).click()
  await page.getByRole('dialog', { name: 'What is Example Energy for?' }).getByRole('radio', { name: 'Energy', exact: true }).click()
  await expect(paymentSheet.getByRole('button', { name: 'Category: Energy' })).toBeVisible()
  await paymentSheet.getByRole('button', { name: 'Rename transaction' }).click()
  const naming = page.getByRole('dialog', { name: 'Rename transaction' })
  await naming.getByRole('radio', { name: /Only this payment/ }).check()
  await naming.getByRole('textbox').fill('Winter bill')
  await naming.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('dialog', { name: 'Winter bill' }).getByRole('button', { name: 'Close' }).click()
  await expect(out.getByRole('button', { name: /Winter bill/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'By what it was for' }).locator('summary', { hasText: 'Energy' })).toHaveText('Energy 1 payment £45.00')
})

// Receipts and payments from both sides (v0.35.0, owner 2026-11-19: "I can't see the link from both sides").
test('a month’s receipts say which payment each was matched to or why there is none, and the payments with no receipt are listed', async ({ page }, testInfo) => {
  const now = new Date(2026, 8, 30, 12, 0)
  await page.clock.setFixedTime(now)
  const ai = (shop: string, date: string, pence: number) => ({ by: 'Gemini · gemini-test', at: 1, text: '', description: '', receipt: { shop, date, currency: '£', items: [{ name: 'Thing', price: pence, quantity: 1 }], total: pence } })
  const entries = [
    { ...freeWriting('e-corner', '', 29, now), photos: [{ id: 'p-corner', text: null, ai: ai('Corner Shop', '2026-09-01', 1240) }] },
    { ...freeWriting('e-pharmacy', '', 20, now), photos: [{ id: 'p-pharmacy', text: null, ai: ai('Greenleaf Pharmacy', '2026-09-10', 500) }] },
    // Two coffees were paid on the 20th; one receipt, so one payment is left with none.
    { ...freeWriting('e-coffee', '', 10, now), photos: [{ id: 'p-coffee', text: null, ai: ai('Coffee Place', '2026-09-20', 300) }] },
  ]
  await restoreBackup(page, testInfo.outputPath('matches.json'), backupWith({ entries }, now))
  await page.goto('./#/money')
  const sheet = await bringIn(page, await pdf(testInfo.outputPath('monzo.pdf'), MONZO_LIKE))
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  // The month's lines are tiles two to a row (v0.43.0), one of them how many receipts sit against a payment, which takes you to the
  // card that says which.
  const tiles = page.locator('.receipt-overview .money-overview-breakdown > li')
  const matchedTile = page.getByRole('button', { name: /receipts? matched to your bank$/ })
  await expect(matchedTile).toHaveText(/^\d of \d receipts? matched to your bank$/)
  const [a, b] = [await tiles.nth(0).boundingBox(), await tiles.nth(1).boundingBox()]
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2)
  expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1)
  await matchedTile.click()
  await expect(page.getByRole('region', { name: 'Receipts and payments' })).toBeInViewport()
  const matches = page.getByRole('region', { name: 'Receipts and payments' })
  await expect(matches.locator('summary', { hasText: 'matched to a payment' })).toHaveText(/^2 receipts matched to a payment$/)
  await matches.locator('summary', { hasText: 'matched to a payment' }).click()
  await expect(matches.getByRole('button', { name: /Corner Shop/ })).toContainText(/paid .* · Monzo/)
  await matches.locator('summary', { hasText: 'with no payment matched' }).click()
  await expect(matches.getByRole('button', { name: /Greenleaf Pharmacy/ })).toContainText('No payment of £5.00 within 3 days at Greenleaf Pharmacy')
  // Payments since the first receipt that no receipt is linked to.
  await expect(matches.locator('summary', { hasText: 'with no receipt' })).toHaveText(/^1 payment with no receipt · since your first receipt$/)
  // The payment with no receipt is a payment like any other (audit 2026-11-20): one tap opens the same sheet.
  await matches.locator('summary', { hasText: 'with no receipt' }).click()
  await matches.locator('button.acc-row', { hasText: 'Coffee Place Sometown' }).click()
  const sheet2 = page.getByRole('dialog', { name: /Coffee Place/ })
  await expect(sheet2.getByRole('button', { name: 'Rename transaction' })).toBeVisible()
  await expect(sheet2.getByRole('button', { name: '+ Assign category' })).toBeVisible()
})

// Which card paid (v0.24.0, owner 2026-11-06: "detect the card from the receipt … so I know which account to look for
// the statement to see its transaction"). Made-up card number.
test('a receipt says which card paid; said once which account that is, every receipt with it says so and is matched only there', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 5, 12, 0)
  await page.clock.setFixedTime(now)
  const read = (shop: string, date: string, pence: number) => ({
    by: 'Gemini · gemini-test',
    at: 1,
    text: `${shop.toUpperCase()}\nThing £${(pence / 100).toFixed(2)}\nTOTAL £${(pence / 100).toFixed(2)}\nVISA DEBIT\n************4417\nAUTH CODE 000000`,
    description: '',
    receipt: { shop, date, currency: '£', items: [{ name: 'Thing', price: pence, quantity: 1 }], total: pence },
  })
  const entries = [
    { ...freeWriting('e-stream', '', 20, now), photos: [{ id: 'p-stream', text: null, ai: read('Example Streaming', '2026-09-12', 1099) }] },
    { ...freeWriting('e-coffee', '', 14, now), photos: [{ id: 'p-coffee', text: null, ai: read('Coffee Place', '2026-09-20', 300) }] },
    { ...freeWriting('e-corner', '', 2, now), photos: [{ id: 'p-corner', text: null, ai: read('Corner Shop', '2026-10-03', 500) }] },
  ]
  await restoreBackup(page, testInfo.outputPath('cards.json'), backupWith({ entries }, now))
  await page.goto('./#/money')
  for (const [name, statement] of [['lloyds', LLOYDS_LIKE], ['monzo', MONZO_LIKE]] as const) {
    const sheet = await bringIn(page, await pdf(testInfo.outputPath(`${name}.pdf`), statement))
    await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  }
  const openReceipt = async (month: string, count: string, shop: string) => {
    await page.goto(`./#/money${month}`)
    await page.getByRole('button', { name: 'Receipts', exact: true }).click()
    await page.locator('details.week-line > summary', { hasText: count }).click()
    await page.getByRole('button', { name: new RegExp(shop) }).click()
    return page.getByRole('dialog', { name: shop })
  }
  const said = (sheet: ReturnType<Page['getByRole']>, text: string) => expect(sheet.locator('p', { hasText: text })).toBeVisible()

  // Not said yet: the payment found by its amount says which account it's in.
  let receipt = await openReceipt('/2026-09', '2 receipts from 2 shops', 'Example Streaming')
  await said(receipt, 'Paid from Lloyds · Visa ending 4417')
  await expect(receipt.getByText(/^Payment on 12 Sept? · £10\.99$/)).toBeVisible()
  await receipt.getByRole('button', { name: 'Which account?', exact: true }).click()
  let which = page.getByRole('dialog', { name: 'Which account is it?' })
  await expect(which.getByRole('radio', { name: /^Lloyds.*Its payment is here/ })).toBeVisible()
  // Said to be Monzo, it's looked for in Monzo alone, where there is no such payment.
  await which.getByRole('radio', { name: 'Monzo', exact: true }).click()
  await said(receipt, 'Paid from Monzo · Visa ending 4417')
  await expect(receipt.getByText('No payment matched yet', { exact: true })).toBeVisible()
  await receipt.getByRole('button', { name: 'Change', exact: true }).click()
  which = page.getByRole('dialog', { name: 'Which account is it?' })
  await which.getByRole('radio', { name: /^Lloyds/ }).click()
  await said(receipt, 'Paid from Lloyds · Visa ending 4417')
  await expect(receipt.getByText(/^Payment on 12 Sept? · £10\.99$/)).toBeVisible()
  await receipt.getByRole('button', { name: 'Close', exact: true }).click()

  // Another receipt with that card follows, and isn't matched to Monzo's coffee of the same amount and day.
  receipt = page.getByRole('dialog', { name: 'Coffee Place' })
  await page.getByRole('button', { name: /Coffee Place/ }).click()
  await said(receipt, 'Paid from Lloyds · Visa ending 4417')
  await expect(receipt.getByText('No payment matched yet', { exact: true })).toBeVisible()
  await receipt.getByRole('button', { name: 'Close', exact: true }).click()

  // A day its account has no statement for yet says so.
  receipt = await openReceipt('', '1 receipt from 1 shop', 'Corner Shop')
  await said(receipt, 'Paid from Lloyds · Visa ending 4417')
  await expect(receipt.getByText(/^Lloyds statement for 3 Oct not in yet$/)).toBeVisible()
  // None of your accounts: it's never matched, and nothing is said to be missing.
  await receipt.getByRole('button', { name: 'Change', exact: true }).click()
  await page.getByRole('dialog', { name: 'Which account is it?' }).getByRole('radio', { name: /^Not one of my accounts/ }).click()
  await said(receipt, 'Paid with Visa ending 4417 · not one of your accounts')
  await expect(receipt.getByText(/not in yet/)).toHaveCount(0)
  await receipt.getByRole('button', { name: 'Change', exact: true }).click()
  await page.getByRole('dialog', { name: 'Which account is it?' }).getByRole('radio', { name: /^Lloyds/ }).click()
  await receipt.getByRole('button', { name: 'Close', exact: true }).click()

  // Your accounts lists the cards you said are each.
  await accountView(page, 'Statements')
  await expect(page.locator('.acc-account', { hasText: 'Lloyds' })).toContainText('Card ending 4417')
  await expect(page.locator('.acc-account', { hasText: 'Monzo' }).first()).not.toContainText('ending')
})

// Gift cards (v0.24.1, owner 2026-11-06: "payments done through GIFT card, mostly they are marked as starting with Blc
// in the account statements": bought through Blue Light Card, the line not saying which shop's). Made-up lines.
test('a receipt paid by gift card is never matched to another purchase; one paid partly is matched at the rest; Blc lines are gift cards bought', async ({ page }, testInfo) => {
  const now = new Date(2026, 9, 5, 12, 0)
  await page.clock.setFixedTime(now)
  const payment = (id: string, date: string, pence: number, description: string) => ({ id, account: 'Example Current', date, amount: pence, description, type: 'DEB', balance: null, adds: true, createdAt: 1, updatedAt: 1 })
  const bankLines = [
    payment('blc-sep', '2026-09-02', -4750, 'BLC GIFTCARD DEMOTOWN'),
    payment('blc-oct', '2026-10-01', -1900, 'BLC GIFTCARD DEMOTOWN'),
    payment('tesco-rest', '2026-10-02', -340, 'TESCO SOMETOWN'),
    payment('tesco-other', '2026-10-03', -1500, 'TESCO SOMETOWN'),
  ]
  const statements = [{ id: 'current', account: 'Example Current', from: '2026-09-01', to: '2026-10-04', lines: 4, createdAt: 1, updatedAt: 1 }]
  const read = (date: string, pence: number, tender: string) => ({
    by: 'Gemini · gemini-test',
    at: 1,
    text: `TESCO\nThing £${(pence / 100).toFixed(2)}\nTOTAL £${(pence / 100).toFixed(2)}\n${tender}`,
    description: '',
    receipt: { shop: 'Tesco', date, currency: '£', items: [{ name: 'Thing', price: pence, quantity: 1 }], total: pence },
  })
  const entries = [
    { ...freeWriting('e-part', '', 3, now), photos: [{ id: 'p-part', text: null, ai: read('2026-10-02', 2340, 'Gift Card £20.00\nVISA ************2468 £3.40') }] },
    { ...freeWriting('e-whole', '', 2, now), photos: [{ id: 'p-whole', text: null, ai: read('2026-10-03', 1500, 'Gift Card £15.00\nNew Balance £0.00') }] },
  ]
  await restoreBackup(page, testInfo.outputPath('gift-cards.json'), backupWith({ entries, bankLines, statements }, now))
  await page.goto('./#/money')

  // A Blc payment says what it bought.
  await accountView(page, 'Spending')
  await openFold(page, 'Money out')
  await page.getByRole('region', { name: 'Money out' }).getByRole('button', { name: /^Blc Giftcard Demotown .*£19\.00$/i }).click()
  await expect(page.getByRole('dialog', { name: /Blc Giftcard Demotown/i })).toContainText('A gift card bought through Blue Light Card')
  await page.getByRole('dialog', { name: /Blc Giftcard Demotown/i }).getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: 'Receipts', exact: true }).click()
  // Neither needs a look: the whole one has no payment to find, the other's is found at what the gift card didn't pay.
  await expect(page.getByRole('region', { name: 'Receipts to check' })).toHaveCount(0)
  await page.locator('details.week-line > summary', { hasText: '2 receipts from 1 shop' }).click()

  await page.getByRole('button', { name: /2 Oct Tesco £23\.40/ }).click()
  let receipt = page.getByRole('dialog', { name: 'Tesco' })
  await expect(receipt.getByText('£20.00 of it by gift card', { exact: true })).toBeVisible()
  await expect(receipt.locator('p', { hasText: 'Paid from Example Current · Visa ending 2468' })).toBeVisible()
  await expect(receipt.getByText(/^Payment on 2 Oct · £3\.40$/)).toBeVisible()
  await expect(receipt.getByRole('list', { name: 'Gift cards bought before it' }).getByRole('listitem')).toHaveText(['1 Oct · £19.00 · Example Current', /^2 Sept? · £47\.50 · Example Current$/])
  await receipt.getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: /3 Oct Tesco £15\.00/ }).click()
  receipt = page.getByRole('dialog', { name: 'Tesco' })
  await expect(receipt.getByText('Paid by gift card', { exact: true })).toBeVisible()
  await expect(receipt.getByText(/^Payment on/)).toHaveCount(0)
  await expect(receipt.getByRole('list', { name: 'Gift cards bought before it' }).getByRole('listitem')).toHaveCount(2)
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
  const tab = (name: 'Overview' | 'Spending' | 'Statements') => part(page, name)

  // October is the latest month: nothing later to step to. Its statements stop at 30 Sep, and it says so.
  await expect(page.getByRole('strong')).toHaveText('£30.00 out')
  await expect(months.getByRole('link', { name: /^Later: / })).toHaveCount(0)
  const notice = page.getByRole('button', { name: /1 account needs a newer statement/ })
  await expect(notice).toBeVisible()
  await expect(tab('Statements')).toHaveAttribute('data-attention', '')

  // The payments figure opens Spending at Money out.
  await page.getByRole('group', { name: 'Money in and payments out' }).getByRole('button', { name: /^Payments out/ }).click()
  await expect(tab('Spending')).toHaveAttribute('aria-pressed', 'true')
  await openFold(page, 'Money out')
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
  // "To check" said the same of each account again ("statements up to 30 Sep"), which Your accounts already says with the days it
  // covers and is missing (owner 2026-11-20: "I don't know what is the purpose of To check"): it is gone.
  await expect(page.getByRole('region', { name: 'To check' })).toHaveCount(0)
  await expect(page.getByText(/^statements up to/)).toHaveCount(0)
})

test('Money: one row of parts, Statements a button in the title row, the month arrows in the title row, names in title case, "Not sorted yet" in neutral ink', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 8, 30, 12, 0))
  await page.goto('./#/money')
  for (const [name, layout] of [['lloyds.pdf', LLOYDS_LIKE], ['monzo.pdf', MONZO_LIKE]] as const) {
    const sheet = await bringIn(page, await pdf(testInfo.outputPath(name), layout))
    await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  }

  // One row (owner 2026-11-20: "the money section is too congested"): Overview / Spending / Receipts, as pills, 44px, and no
  // second row under the figures. Statements is not one of them: it is a button in the title row.
  const bar = page.locator('.money-switch')
  await part(page, 'Overview').click() // (bringing the statements in left Statements open)
  await expect(bar).toHaveClass(/segmented/)
  await expect(bar.getByRole('button')).toHaveText(['Overview', 'Spending', 'Receipts'])
  await expect(page.locator('.acc-tabs')).toHaveCount(0)
  expect(await bar.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('999px')
  const pressed = bar.locator('button[aria-pressed="true"]')
  await expect(pressed).toHaveText('Overview')
  expect(Math.round((await pressed.boundingBox())!.height)).toBe(44)
  await expect(pressed).toHaveCSS('background-color', 'rgb(255, 253, 249)') // (it eases in after the tap)
  expect(await pressed.evaluate((el) => getComputedStyle(el, '::before').content)).not.toBe('""') // no underline bar
  // Statements: in the title row, pressed while it is open, and pressing it again goes back to Overview.
  const statements = part(page, 'Statements')
  await expect(statements).toHaveAttribute('aria-pressed', 'false')
  await statements.click()
  await expect(statements).toHaveAttribute('aria-pressed', 'true')
  await expect(pressed).toHaveCount(0)
  await statements.click()
  await expect(pressed).toHaveText('Overview')

  // The month arrows share the title's row (and are 44px), no longer in the figure's block.
  const title = (await page.locator('.money-title h1').boundingBox())!
  const stepper = (await page.locator('.money-title .acc-stepper').boundingBox())!
  expect(Math.abs(title.y + title.height / 2 - (stepper.y + stepper.height / 2))).toBeLessThan(2)
  expect(stepper.x).toBeGreaterThan(title.x)
  await expect(page.locator('.acc-hero .acc-stepper')).toHaveCount(0)
  expect((await page.locator('.money-title .acc-step').first().boundingBox())!.width).toBeGreaterThanOrEqual(44)

  // The bank prints names in capitals; they are shown in title case, and an acronym-free name has no capitals left over.
  await accountView(page, 'Spending')
  await openFold(page, 'Money out')
  const out = page.getByRole('region', { name: 'Money out' })
  await expect(out).toContainText('Example Energy')
  await expect(out).not.toContainText('EXAMPLE ENERGY')

  // The kind still to sort has a neutral bar (ink at 30%), not the green that reads as success.
  const unsorted = page.locator('.acc-meter[data-unsorted] > span').first()
  await expect(unsorted).toBeAttached()
  const ink = await unsorted.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(ink).toMatch(/^rgba\(31, 30, 28, 0\.3\)$|^color\(srgb 0\.12\d* 0\.11\d* 0\.10\d* \/ 0\.3\)$/)
})
