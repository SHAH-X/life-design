import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { captureBox, entryButton, expectInSheetView, fakeKeyboard, LONG_WRITING, showKeyboard } from './helpers'
import { expectCleanLayout } from './layout'
import { backupWith, freeWriting, restoreBackup, restoreSeed } from './seed'
import { makePdf } from '../fixtures/pdf'
import { MONZO_LIKE } from '../fixtures/statements'
import { activityLike } from '../fixtures/trading212'

// Every main screen and sheet (light only: no dark mode since v0.14.1, owner's choice), with the fictional seed at a fixed evening: the general layout
// check on each, plus a reference screenshot. A changed screenshot fails until it's looked at and accepted with
// `npm run screens -- --update-snapshots` (CLAUDE.md: look at every changed screen before saying done).

const EVENING = new Date(2026, 9, 23, 20, 0) // the same evening as the word budgets: the longest kind of question

const settled = (page: Page) => page.waitForTimeout(350) // past the fade-in and the 300 ms tap guard

// Real values that change from run to run, hidden from the screenshots only (the layout check still sees them).
const changing = (page: Page) => [
  // Storage in use: the whole row, so the mask keeps one size (masking just the value, its width followed the
  // number's length, and the screenshot differed at its edge now and then, v0.12.4).
  page.locator('.kv', { hasText: 'Stored' }),
  page.locator('p', { hasText: /^v\d+\.\d+\.\d+ · / }), // the build's version, commit and time
]

const SHOT = { scale: 'css', animations: 'disabled', caret: 'hide' } as const

// A whole main screen: its fixed tab bar hidden (see the stylesheet).
const WHOLE_PAGE = { fullPage: true, stylePath: fileURLToPath(new URL('./screens-whole-page.css', import.meta.url)) } as const

/**
 * The layout check and a screenshot: a main screen whole, a sheet as it fills the screen. Then, if it scrolls,
 * the same at the end, as a person sees it (the last thing must clear the tab bar or the sheet's footer).
 */
async function look(page: Page, name: string) {
  await settled(page)
  const sheet = page.locator('dialog[open]')
  const inSheet = (await sheet.count()) > 0
  await expectCleanLayout(page, name)
  await expect
    .soft(page)
    .toHaveScreenshot(`${name}.png`, { ...SHOT, mask: changing(page), ...(inSheet ? {} : WHOLE_PAGE) })

  const scrolled = await page.evaluate(() => {
    const body = document.querySelector('dialog[open] .sheet-body')
    const scroller = body ?? document.scrollingElement
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) return false
    scroller.scrollTop = scroller.scrollHeight
    return true
  })
  if (!scrolled) return
  await settled(page)
  await expectCleanLayout(page, `${name}, scrolled to the end`)
  await expect.soft(page).toHaveScreenshot(`${name}-end.png`, { ...SHOT, mask: changing(page) })
  await page.evaluate(() => {
    const scroller = document.querySelector('dialog[open] .sheet-body') ?? document.scrollingElement
    if (scroller) scroller.scrollTop = 0
  })
}

/** Insights' life areas worked out (the real model, in the background): their lines shown, nothing still sorting. */
async function areasDone(page: Page) {
  const areas = page.getByRole('region', { name: 'Life areas' })
  await expect(areas.locator('summary').first()).toBeVisible({ timeout: 90_000 })
  await expect(areas.getByRole('status')).toHaveCount(0, { timeout: 90_000 })
}

/** With the (fake) iPhone keyboard up over `field`, then down again. */
async function lookWithKeyboard(page: Page, name: string, field: ReturnType<Page['getByLabel']>) {
  await field.focus()
  await showKeyboard(page)
  await look(page, `${name}-keyboard`)
  await showKeyboard(page, 0)
}

for (const scheme of ['light'] as const) {
  test.describe(`${scheme}`, () => {
    // No service worker: its "Ready to work offline" banner fades by itself after 5 s, at no fixed moment.
    test.use({ colorScheme: scheme, serviceWorkers: 'block' })

    test(`every screen and sheet, ${scheme}`, async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      await fakeKeyboard(page)
      await page.clock.setFixedTime(EVENING)
      await restoreSeed(page, testInfo.outputPath('seed.json'), EVENING)
      const sheet = page.locator('dialog[open]')
      const at = (s: string) => `${scheme}-${s}`

      await page.goto('./#/today')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // A new day: the one box (v0.15), nothing else to choose.
      await look(page, at('today-empty'))

      // The writer, from the box; the keyboard over it.
      await captureBox(page).click()
      await look(page, at('write-freely'))
      const writing = sheet.getByLabel("What's on your mind?")
      await lookWithKeyboard(page, at('write-freely'), writing)
      // A long free writing, one paragraph as people write, so every list is looked at with it (v0.12.2 on the
      // owner's iPhone: shown whole, in bold, it pushed the buttons and everything after it out of sight).
      await writing.fill(LONG_WRITING)
      await sheet.getByRole('button', { name: 'Save' }).click()
      await expect(sheet.getByText('✓ Saved')).toBeVisible()
      await look(page, at('entry-saved'))
      await sheet.getByRole('button', { name: 'Done', exact: true }).click()
      await look(page, at('today'))
      await page.getByRole('button', { name: 'Previous day' }).click()
      await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
      await look(page, at('today-yesterday'))

      // An activity from before v0.15: read as its parts; each opens its own question (a word of your own with the
      // keyboard up); "To remember" too.
      await entryButton(page, 'Evening run').click()
      const entry = page.getByRole('dialog', { name: 'Evening run' })
      await entry.getByRole('button', { name: 'Remember this' }).click()
      await entry.getByRole('button', { name: 'Keep this' }).click()
      await look(page, at('entry'))
      await entry.getByRole('button', { name: /^What it was like/ }).click()
      await look(page, at('entry-part-like'))
      await sheet.getByRole('button', { name: '+ your own word' }).click()
      await lookWithKeyboard(page, at('entry-part-like-own-word'), sheet.getByLabel('Your own word'))
      await sheet.getByRole('button', { name: 'Close' }).click()
      for (const [label, name] of [
        ['What it did to your energy', 'entry-part-energy'],
        ['How you felt', 'entry-part-felt'],
        ['When, how long, where, who', 'entry-part-details'],
        ['To remember', 'entry-part-remember'],
      ] as const) {
        await entry.getByRole('button', { name: new RegExp(`^${label}`) }).click()
        await look(page, at(name))
        await sheet.getByRole('button', { name: 'Close' }).click()
      }
      await entry.getByRole('button', { name: 'Done', exact: true }).click()

      for (const [route, heading] of [
        ['entries', 'Logs'],
        ['insights', 'Insights'],
        ['insights/steps', 'Next steps'],
        ['insights/review', 'Review a period'],
        ['insights/learning', "What you're learning"],
        ['insights/weeks', 'Earlier weeks'],
        ['insights/week-2026-10-12', 'Your week'],
        ['more', 'More'],
      ] as const) {
        await page.goto(`./#/${route}`)
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
        await look(page, at(route.replace('/', '-')))
      }
      // Search by meaning (v0.14): offered the first time you search, then what it finds below the word matches,
      // and Review narrowed to the entries about its focus. The real model, so it may take a few seconds.
      await page.goto('./#/entries')
      await page.getByLabel('Search your logs').fill('meeting')
      await expect(page.getByText('Also find entries by meaning?')).toBeVisible()
      await look(page, at('entries-meaning-offer'))
      await page.getByRole('button', { name: 'Turn on' }).click()
      await expect(page.getByRole('region', { name: 'Also about this' })).toBeVisible({ timeout: 60_000 })
      // Turned on, life areas (v0.16) are worked out in the background and name free writing by its area: wait for
      // them, so no screen changes while it's looked at.
      await page.goto('./#/insights')
      await areasDone(page)
      await page.goto('./#/entries')
      await page.getByLabel('Search your logs').fill('meeting')
      await expect(page.getByRole('region', { name: 'Also about this' })).toBeVisible({ timeout: 60_000 })
      await look(page, at('entries-by-meaning'))
      await page.goto('./#/insights/review')
      await page.getByLabel(/Anything to focus on/).fill('Why am I tired?')
      await page.getByRole('switch', { name: 'Only entries about this' }).check()
      await expect(page.getByText(/about this on \d+ days?/)).toBeVisible({ timeout: 60_000 })
      await look(page, at('insights-review-about'))

      // What opens on Insights (v0.13): a day of the chart with its entries, the chart's table, and a line with the
      // entries behind it (links in opened parts went unstyled unseen in v0.11).
      await page.goto('./#/insights')
      await page.getByRole('button', { name: /^Tuesday, October 20/ }).click()
      await page.getByText('Show as table').click()
      await page.locator('details.week-line > summary', { hasText: 'Commute' }).click()
      await look(page, at('insights-opened'))

      for (const sub of ['reminders', 'purpose', 'words', 'meaning', 'photos', 'ai', 'backup', 'export', 'phone', 'delete']) {
        await page.goto(`./#/more/${sub}`)
        await expect(page.getByRole('link', { name: 'Back to More' })).toBeVisible()
        await look(page, at(`more-${sub}`))
      }
    })

    // Ask (v0.18, a main tab): until v0.20.41 it had no reference screenshot, which is how its link stayed the browser's
    // default blue. The AI is a stand-in for Gemini that answers at once; no key is real.
    test(`Ask, ${scheme}`, async ({ page }, testInfo) => {
      await fakeKeyboard(page)
      await page.clock.setFixedTime(EVENING)
      await restoreSeed(page, testInfo.outputPath('ask-seed.json'), EVENING)
      const at = (s: string) => `${scheme}-${s}`
      await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
        const body = route.request().url().endsWith('/models')
          ? { data: [{ id: 'models/gemini-2.5-flash' }] }
          : { choices: [{ message: { content: 'You wrote about the evening run three times this month, and it gave you energy each time.' } }] }
        return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) })
      })

      // Nothing set up yet: a card that goes to the setting.
      await page.goto('./#/ask')
      await expect(page.getByRole('region', { name: 'Set up an AI service' })).toBeVisible()
      await look(page, at('ask-setup'))

      await page.goto('./#/more/ai')
      await page.getByRole('radio', { name: /Gemini/ }).check()
      await page.getByLabel('API key').fill('AIza_test_abcd')
      await page.getByRole('button', { name: 'Check key' }).click()
      await expect(page.getByText('Key saved on this phone only · ends abcd')).toBeVisible()
      await page.goto('./#/ask')
      await expect(page.getByLabel('What would you like to know?')).toBeVisible()
      await look(page, at('ask'))
      await lookWithKeyboard(page, at('ask-question'), page.getByLabel('What would you like to know?'))
      await page.getByLabel('What would you like to know?').fill('How often did I run this month?')
      await page.getByRole('button', { name: 'Ask', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Answer' })).toBeVisible()
      await look(page, at('ask-answer'))
      await page.getByLabel('What would you like to know?').fill('And what gave me energy?')
      await page.getByRole('button', { name: 'Ask', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Earlier questions' })).toBeVisible()
      await look(page, at('ask-earlier'))
    })

    test(`Money, ${scheme}`, async ({ page }, testInfo) => {
      await fakeKeyboard(page)
      await page.clock.setFixedTime(EVENING)
      await restoreSeed(page, testInfo.outputPath('money-seed.json'), EVENING)
      const at = (s: string) => `${scheme}-${s}`
      await page.goto('./#/money')
      await expect(page.getByRole('heading', { level: 1, name: 'Money' })).toBeVisible()
      await look(page, at('money'))
      await page.getByRole('button', { name: 'Receipts', exact: true }).click()
      await look(page, at('money-receipts'))
      await page.getByRole('button', { name: 'Accounts' }).click()

      const statementPath = testInfo.outputPath('money-statement.pdf')
      await writeFile(statementPath, makePdf(MONZO_LIKE))
      await page.getByRole('button', { name: 'Bring in a statement' }).click()
      const statementSheet = page.getByRole('dialog', { name: 'Bring in a statement' })
      await statementSheet.locator('input[type="file"]').setInputFiles(statementPath)
      await expect(statementSheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveCount(2)
      await statementSheet.getByRole('button', { name: 'Done', exact: true }).click()
      await look(page, at('money-accounts'))
      // The other two parts of Accounts: where September's money went (the statement is September's), and the accounts.
      await page.goto('./#/money/2026-09')
      await page.getByRole('group', { name: 'Money sections' }).getByRole('button', { name: 'Spending', exact: true }).click()
      await look(page, at('money-spending'))
      await page.locator('.money-title').getByRole('button', { name: 'Statements', exact: true }).click()
      await look(page, at('money-statements'))
      // An account's own statement (its name), and a payment in it opened: the same sheet as anywhere a payment is listed.
      await page.getByRole('region', { name: 'Your accounts', exact: true }).getByRole('button', { name: 'Monzo', exact: true }).click()
      const statement = page.getByRole('dialog', { name: 'Monzo', exact: true })
      await expect(statement.getByRole('heading', { name: 'September 2026' })).toBeVisible()
      await look(page, at('money-account-statement'))
      await statement.getByRole('listitem').first().getByRole('button').click()
      await expect(page.getByRole('button', { name: 'Rename transaction' })).toBeVisible()
      await look(page, at('money-payment-sheet'))
    })

    test(`Money regular payment rename, ${scheme}`, async ({ page }, testInfo) => {
      await fakeKeyboard(page)
      await page.clock.setFixedTime(EVENING)
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
      await restoreBackup(page, testInfo.outputPath('money-regular-rename.json'), backupWith({ bankLines }, EVENING))
      await page.goto('./#/money')
      await page.getByRole('group', { name: 'More about this month' }).getByRole('button', { name: /^Regular payments/ }).click()
      const regularPayments = page.getByRole('region', { name: 'Regular payments' })
      // Coming up is a row above the payments (this month): pick the payment's row, which says "every month".
      const regular = regularPayments.locator('details.acc-item', { hasText: 'every month' })
      await look(page, `${scheme}-money-regular-payment`)
      await regular.locator('summary').click()
      await regular.getByRole('button', { name: 'Rename EXAMPLE STREAMING' }).click()
      const sheet = page.getByRole('dialog', { name: 'Rename transaction' })
      const field = sheet.getByRole('textbox', { name: 'What do you call it?' })
      await expectInSheetView(sheet, field)
      await showKeyboard(page)
      await look(page, `${scheme}-money-regular-payment-rename`)
    })

    // Money's sheets and states (audit 2026-11-20: they were not in the tour, so nothing checked their layout).
    test(`Money sheets and states, ${scheme}`, async ({ page }, testInfo) => {
      const sept = new Date(2026, 8, 30, 12, 0)
      await page.clock.setFixedTime(sept)
      const at = (s: string) => `${scheme}-${s}`
      await page.goto('./#/money')
      const statementPath = testInfo.outputPath('money-states-statement.pdf')
      await writeFile(statementPath, makePdf(MONZO_LIKE))
      await page.getByRole('button', { name: 'Bring in a statement' }).click()
      const bring = page.getByRole('dialog', { name: 'Bring in a statement' })
      await look(page, at('money-bring-in'))
      await bring.locator('input[type="file"]').setInputFiles(statementPath)
      await expect(bring.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveCount(2)
      await look(page, at('money-bring-in-done'))
      await bring.getByRole('button', { name: 'Done', exact: true }).click()
      // The accounts: changing one.
      await page.locator('.money-title').getByRole('button', { name: 'Statements', exact: true }).click()
      await page.getByRole('region', { name: 'Your accounts', exact: true }).getByRole('button', { name: 'Change' }).first().click()
      await look(page, at('money-change-account'))
      await page.getByRole('dialog', { name: 'Change this account' }).getByRole('button', { name: 'Close' }).click()
      // Spending: its lists opened, a search, and a payment's sheets.
      await page.getByRole('group', { name: 'Money sections' }).getByRole('button', { name: 'Spending', exact: true }).click()
      for (const name of ['Money out', 'Money in', 'Moved between your accounts']) {
        const fold = page.getByRole('region', { name }).getByRole('button', { name: new RegExp(`^${name}`) })
        if (await fold.count()) await fold.click()
      }
      await look(page, at('money-spending-open'))
      const search = page.getByRole('searchbox', { name: 'Search every payment' })
      await search.fill('example')
      await look(page, at('money-search'))
      await page.getByRole('button', { name: /Example Supermarket/ }).first().click()
      await page.getByRole('dialog', { name: /Example Supermarket/ }).getByRole('button', { name: /^(\+ Assign category|Category: )/ }).click()
      await look(page, at('money-category-sheet'))
      await page.getByRole('dialog', { name: /^What is/ }).getByRole('button', { name: 'Close' }).click()
      await page.getByRole('dialog', { name: /Example Supermarket/ }).getByRole('button', { name: '+ Who was it for?' }).click()
      await look(page, at('money-who-sheet'))
      await page.getByRole('dialog', { name: 'Who was it for?' }).getByRole('button', { name: 'Close' }).click()
      await page.getByRole('dialog', { name: /Example Supermarket/ }).getByRole('button', { name: 'Rename transaction' }).click()
      await look(page, at('money-rename-transaction'))
    })

    test(`Money overview with its bar, the tiles opened, and the year, ${scheme}`, async ({ page }, testInfo) => {
      const now = new Date(2026, 9, 27, 12, 0)
      await page.clock.setFixedTime(now)
      const payment = (id: string, date: string, amount: number, description: string, createdAt: number) => ({ id, account: 'Lloyds ···4321', date, amount, description, type: 'DD', balance: null, adds: true, createdAt, updatedAt: createdAt })
      const bankLines = [
        ...['2026-07-14', '2026-08-13', '2026-09-12'].map((date, i) => payment(`month-${i}`, date, -1099, 'EXAMPLE STREAMING', i + 1)),
        ...['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24'].map((date, i) => payment(`sept-${i}`, date, -500, 'EXAMPLE WEEKLY BOX', i + 5)),
        ...['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((date, i) => payment(`week-${i}`, date, -500, 'EXAMPLE WEEKLY BOX', i + 10)),
        payment('shop', '2026-10-05', -2000, 'EXAMPLE CORNER SHOP', 20),
        payment('big', '2026-10-06', -4500, 'EXAMPLE ENERGY', 21),
      ]
      const statements = [{ id: 'lloyds:2026-07-01:2026-10-27', account: 'Lloyds ···4321', from: '2026-07-01', to: '2026-10-27', lines: bankLines.length, createdAt: 1, updatedAt: 1 }]
      await restoreBackup(page, testInfo.outputPath('money-overview-bar.json'), backupWith({ bankLines, statements }, now))
      const at = (s: string) => `${scheme}-${s}`
      await page.goto('./#/money')
      await expect(page.locator('.acc-hero .acc-split')).toBeVisible()
      await look(page, at('money-overview-bar'))
      await page.getByRole('group', { name: 'More about this month' }).getByRole('button', { name: /^What moved/ }).click()
      await look(page, at('money-what-moved'))
      await page.goto('./#/money/2026')
      await expect(page.getByRole('heading', { level: 1, name: '2026' })).toBeVisible()
      await look(page, at('money-year'))
    })

    test(`a duplicate receipt says which entry is extra and how to remove it, ${scheme}`, async ({ page }, testInfo) => {
      await page.clock.setFixedTime(EVENING)
      const receipt = {
        by: 'Gemini · gemini-2.5-flash',
        at: EVENING.getTime(),
        text: '',
        description: '',
        receipt: {
          shop: 'Example Market',
          date: '2026-10-20',
          currency: '£',
          items: [{ name: 'Tea', price: 300, quantity: 1 }],
          total: 300,
        },
      }
      const original = { ...freeWriting('money-original', '', 5, EVENING), photos: [{ id: 'money-original-photo', text: null, ai: receipt }] }
      const extra = { ...freeWriting('money-extra', '', 1, EVENING), photos: [{ id: 'money-extra-photo', text: null, ai: receipt }] }
      const noDate = {
        ...freeWriting('money-undated', '', 2, EVENING),
        photos: [{
          id: 'money-undated-photo',
          text: null,
          ai: { ...receipt, by: 'Gemini · gemini-2.5-flash', receipt: { ...receipt.receipt, shop: 'Another Market', date: null, items: [{ name: 'Milk', price: 420, quantity: 1 }], total: 420 } },
        }],
      }
      await restoreBackup(page, testInfo.outputPath('money-duplicate.json'), backupWith({ entries: [original, extra, noDate] }, EVENING))
      await page.goto('./#/money')
      await page.getByRole('button', { name: 'Receipts', exact: true }).click()
      await expect(page.getByText(/Duplicate · counted once/)).toBeVisible()
      await expect(page.getByText(/Date not read · using Wed, Oct 21/)).toBeVisible()
      await look(page, `${scheme}-money-duplicate`)
    })

    // v0.36.0: Money → Investing, from a Trading 212 Activity statement (fictional): profit and loss, costs and charges, income.
    test(`Money investing, ${scheme}`, async ({ page }, testInfo) => {
      await page.clock.setFixedTime(new Date(2026, 9, 18, 12, 0))
      await page.goto('./#/money')
      const statementPath = testInfo.outputPath('trading212-activity.pdf')
      await writeFile(statementPath, makePdf(activityLike()))
      await page.getByRole('button', { name: 'Bring in a statement' }).click()
      const statementSheet = page.getByRole('dialog', { name: 'Bring in a statement' })
      await statementSheet.locator('input[type="file"]').setInputFiles(statementPath)
      await expect(statementSheet.getByRole('list', { name: 'Brought in' })).toBeVisible()
      await statementSheet.getByRole('button', { name: 'Done', exact: true }).click()
      await page.getByRole('group', { name: 'Money sections' }).getByRole('button', { name: 'Investing' }).click()
      await expect(page.getByRole('region', { name: 'Profit and loss' })).toBeVisible()
      await look(page, `${scheme}-money-investing`)
      await page.getByRole('group', { name: 'More about this month' }).getByRole('button', { name: /^Costs and charges/ }).click()
      for (const summary of await page.getByRole('region', { name: 'Costs and charges' }).locator('summary').all()) await summary.click()
      await page.getByRole('region', { name: 'Profit and loss' }).locator('summary', { hasText: 'Other instruments' }).click()
      await look(page, `${scheme}-money-investing-open`)
    })

    // v0.35.0: a month's receipts and payments from both sides, each list opened.
    test(`receipts and payments, ${scheme}`, async ({ page }, testInfo) => {
      const sept = new Date(2026, 8, 30, 12, 0)
      await page.clock.setFixedTime(sept)
      const ai = (shop: string, date: string, pence: number) => ({ by: 'Gemini · gemini-2.5-flash', at: sept.getTime(), text: '', description: '', receipt: { shop, date, currency: '£', items: [{ name: 'Thing', price: pence, quantity: 1 }], total: pence } })
      const entries = [
        { ...freeWriting('mt-corner', '', 29, sept), photos: [{ id: 'mt-corner-p', text: null, ai: ai('Corner Shop', '2026-09-01', 1240) }] },
        { ...freeWriting('mt-pharmacy', '', 20, sept), photos: [{ id: 'mt-pharmacy-p', text: null, ai: ai('Greenleaf Pharmacy', '2026-09-10', 500) }] },
        { ...freeWriting('mt-coffee', '', 10, sept), photos: [{ id: 'mt-coffee-p', text: null, ai: ai('Coffee Place', '2026-09-20', 300) }] },
      ]
      await restoreBackup(page, testInfo.outputPath('matches.json'), backupWith({ entries }, sept))
      await page.goto('./#/money')
      const statementPath = testInfo.outputPath('matches-statement.pdf')
      await writeFile(statementPath, makePdf(MONZO_LIKE))
      await page.getByRole('button', { name: 'Bring in a statement' }).click()
      const statementSheet = page.getByRole('dialog', { name: 'Bring in a statement' })
      await statementSheet.locator('input[type="file"]').setInputFiles(statementPath)
      await statementSheet.getByRole('button', { name: 'Done', exact: true }).click()
      await page.getByRole('button', { name: 'Receipts', exact: true }).click()
      const matches = page.getByRole('region', { name: 'Receipts and payments' })
      for (const summary of await matches.locator('summary').all()) await summary.click()
      await look(page, `${scheme}-money-receipts-matches`)
    })

    // v0.32.0: a receipt's entry is listed by its shop and what it came to, in Today and in Logs.
    test(`receipt entries in Today and Logs, ${scheme}`, async ({ page }, testInfo) => {
      await page.clock.setFixedTime(EVENING)
      const ai = (text: string, shop: string, items: [string, number][]) => ({
        by: 'Gemini · gemini-2.5-flash',
        at: EVENING.getTime(),
        text,
        description: '',
        receipt: { shop, date: '2026-10-23', currency: '£', items: items.map(([name, price]) => ({ name, price, quantity: 1 })), total: items.reduce((sum, [, price]) => sum + price, 0) },
      })
      const entries = [
        { ...freeWriting('rcpt-market', '', 0, EVENING), createdAt: EVENING.getTime() - 3 * 3_600_000, photos: [{ id: 'rcpt-market-p', text: null, ai: ai('GREENLEAF MARKET TEL: 0116 000 0000 VAT 123 4567 89 THANK YOU FOR SHOPPING', 'Greenleaf Market', [['Oat milk', 165], ['Bread', 120], ['Eggs', 249]]) }] },
        { ...freeWriting('rcpt-two', '', 0, EVENING), createdAt: EVENING.getTime() - 2 * 3_600_000, photos: [{ id: 'rcpt-two-a', text: null, ai: ai('CORNER CHEMIST', 'Corner Chemist', [['Plasters', 299]]) }, { id: 'rcpt-two-b', text: null, ai: ai('GREENLEAF MARKET', 'Greenleaf Market', [['Soap', 150]]) }] },
        { ...freeWriting('rcpt-slip', '', 0, EVENING), createdAt: EVENING.getTime() - 3_600_000, photos: [{ id: 'rcpt-slip-p', text: '***For a chance to win £1,000!*** Please tell us how we did today', receipt: true, ai: { by: 'Gemini · gemini-2.5-flash', at: EVENING.getTime(), text: '***For a chance to win £1,000!*** Please tell us how we did today', description: '', receipt: null } }] },
        { ...freeWriting('rcpt-sea', '', 0, EVENING), photos: [{ id: 'rcpt-sea-p', text: 'A view of the sea from the cliff path' }] },
      ]
      await restoreBackup(page, testInfo.outputPath('receipt-entries.json'), backupWith({ entries }, EVENING))
      await page.goto('./#/today')
      await expect(page.locator('.entry-row', { hasText: 'Greenleaf Market' }).first()).toBeVisible()
      await look(page, `${scheme}-today-receipts`)
      await page.goto('./#/entries')
      await expect(page.locator('.entry-row', { hasText: 'Greenleaf Market' }).first()).toBeVisible()
      await look(page, `${scheme}-logs-receipts`)
    })

    // v0.16: life areas, the provoker's question and photos, on fictional writing of their own (the seed is activities).
    test(`life areas, the provoker and photos, ${scheme}`, async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      await fakeKeyboard(page)
      await page.clock.setFixedTime(EVENING)
      const at = (s: string) => `${scheme}-${s}`
      const sheet = page.locator('dialog[open]')
      const stale = EVENING.getTime() - 35 * 86_400_000
      const writing = [
        'Trading review for the week: 7 trades, 3 winners. Two losses were revenge trades after the Tuesday stop-out.',
        'Rent went up by 120 a month. The budget is tight this winter.',
        'Salary came in, moved 500 into the index fund and 200 into savings.',
        'Electricity bill was 230 this quarter, almost double last year.',
        'Ran 5k in 27 minutes, best this year. Knees a bit sore.',
        'Doctor said the blood pressure is borderline. Less salt, more walking.',
        'Caught the flu. Fever, aching, stayed in bed all day with tea.',
      ]
      await restoreBackup(
        page,
        testInfo.outputPath('v016.json'),
        backupWith(
          {
            entries: writing.map((note, i) => freeWriting(`w${i}`, note, i + 1, EVENING)),
            steps: [{ id: 'st1', text: 'Ask for an agenda first', when: '', kind: 'once', status: 'active', entryIds: [], activity: '', createdAt: stale, updatedAt: stale, finishedAt: null }],
          },
          EVENING,
        ),
      )
      await page.goto('./#/more/meaning')
      await page.getByRole('switch', { name: /Find entries by meaning/ }).check()
      await page.goto('./#/insights')
      await areasDone(page)
      await look(page, at('insights-areas'))
      await page.getByRole('region', { name: 'Life areas' }).locator('summary').first().click()
      await look(page, at('insights-areas-opened'))

      // Today: the provoker's question above the box (here a next step left for 5 weeks); a tap answers it.
      await page.goto('./#/today')
      const ask = page.getByRole('region', { name: 'A question from your writing' })
      await expect(ask).toBeVisible()
      await look(page, at('today-provoker'))
      await ask.getByRole('button', { name: /Ask for an agenda first/ }).click()
      await look(page, at('write-answering'))
      await lookWithKeyboard(page, at('write-answering'), sheet.getByLabel(/Ask for an agenda first/))
      await sheet.getByRole('button', { name: 'Close' }).click()

      // A photo in the writer, with reading its text offered; then the entry it makes, its text read on the phone.
      await captureBox(page).click()
      await sheet.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL('../fixtures/photos/receipt-clean.png', import.meta.url)))
      await expect(sheet.getByRole('img', { name: 'Photo 1' })).toBeVisible()
      await look(page, at('write-photo'))
      await lookWithKeyboard(page, at('write-photo'), sheet.getByLabel("What's on your mind?"))
      await sheet.getByRole('button', { name: 'Turn on' }).click()
      await sheet.getByRole('button', { name: 'Save' }).click()
      await expect(sheet.getByText('Text in this photo')).toBeVisible({ timeout: 90_000 })
      await sheet.getByText('Text in this photo').click()
      await look(page, at('entry-photo'))
      await sheet.getByRole('button', { name: 'Done', exact: true }).click()
    })

    // Steps 2-6 of the household plan (v0.54-v0.58): the screens they added, each with the layout check and a reference screenshot, with the
    // keyboard up over each field. Made-up data only; today is Monday 23 November 2026.
    const STEPS_DAY = new Date(2026, 10, 23, 12, 0)
    const stepsSeed = async (page: Page, path: string) => {
      let n = 0
      const pay = (date: string, pounds: number, description: string) => ({ id: `s${n++}`, account: 'Example Current', date, amount: Math.round(pounds * 100), description, type: 'DD', balance: null, adds: true, createdAt: 1, updatedAt: 1 })
      const bankLines = [
        ...[['2026-05-03', 112], ['2026-06-03', 118], ['2026-07-03', 121], ['2026-08-03', 119], ['2026-09-03', 111], ['2026-10-03', 145]].map(([d, p]) => pay(String(d), -Number(p), 'OCTOPUS ENERGY')),
        pay('2026-09-28', -62, 'TESCO STORES 1234'), pay('2026-10-05', -42, 'TESCO STORES 1234'), pay('2026-10-12', -185, 'TESCO STORES 1234'), pay('2026-10-26', -25, 'TESCO STORES 1234'),
        pay('2026-08-08', -10.99, 'STREAMCO'), pay('2026-09-08', -10.99, 'STREAMCO'), pay('2026-10-08', -10.99, 'STREAMCO'),
      ]
      const statements = [{ id: 'example:2026-05-01:2026-10-31', account: 'Example Current', from: '2026-05-01', to: '2026-10-31', lines: bankLines.length, createdAt: 1, updatedAt: 1 }]
      const daysBefore = (date: string) => Math.round((STEPS_DAY.getTime() - new Date(`${date}T12:00:00`).getTime()) / 86_400_000)
      const reading = (shop: string, date: string, items: [string, number][], total?: number) => ({
        by: 'Gemini · gemini-2.5-flash',
        at: STEPS_DAY.getTime(),
        text: '',
        description: '',
        receipt: { shop, date, currency: '£', items: items.map(([name, price]) => ({ name, price, quantity: 1 })), total: total ?? items.reduce((sum, [, price]) => sum + price, 0) },
      })
      const receipt = (id: string, date: string, ai: ReturnType<typeof reading>) => ({ ...freeWriting(`e-${id}`, '', daysBefore(date), STEPS_DAY), photos: [{ id, text: null, ai }] })
      const MILK = 'Semi Skimmed Milk 2.27L'
      const entries = [
        receipt('t1', '2026-10-03', reading('Tesco', '2026-10-03', [[MILK, 145]])),
        receipt('t2', '2026-10-17', reading('Tesco', '2026-10-17', [[MILK, 165]])),
        receipt('a1', '2026-10-05', reading('Asda', '2026-10-05', [['Milk Semi Skimmed 2.27L', 155]])),
        receipt('h1', '2026-10-21', reading('Aldi', '2026-10-21', [['Coffee', 450]], 999)),
      ]
      const products = [{ id: 'p1', members: ['tesco|semi skimmed milk 2.27l', 'asda|milk semi skimmed 2.27l'], notSame: [], regular: true, createdAt: 1, updatedAt: 1 }]
      const bills = [{ id: 'b1', name: 'Home insurance', kind: 'Insurance', amount: 24000, every: 'year', next: '2026-12-10', renewal: '2027-01-12', method: 'Direct debit', notes: 'Cancel online', payee: null, createdAt: 1, updatedAt: 1 }]
      const budgets = [{ id: 'Groceries', kind: 'Groceries', amount: 30000, createdAt: 1, updatedAt: 1 }]
      const pdf = Buffer.from(makePdf([[{ text: 'Home insurance policy', x: 40, y: 760, size: 18 }, { text: 'Policy renewal date: 12 January 2027', x: 40, y: 730, size: 12 }], [{ text: 'You may cancel within 14 days. A notice period of 30 days applies.', x: 40, y: 760, size: 12 }]])).toString('base64')
      const documents = [
        { id: 'd1', title: 'Home insurance policy', type: 'Insurance', kind: 'pdf', mime: 'application/pdf', size: 900, pages: 2, text: 'Home insurance policy\nPolicy renewal date: 12 January 2027\n\nYou may cancel within 14 days. A notice period of 30 days applies.', tracked: [], dismissed: [], billId: null, notes: '', createdAt: STEPS_DAY.getTime(), updatedAt: STEPS_DAY.getTime() },
        { id: 'd2', title: 'Washing machine warranty', type: 'Warranty', kind: 'pdf', mime: 'application/pdf', size: 900, pages: 1, text: '', tracked: [{ date: '2026-12-01', kind: 'ends', label: 'Warranty ends' }], dismissed: [], billId: 'b1', notes: '', createdAt: STEPS_DAY.getTime() - 86_400_000, updatedAt: STEPS_DAY.getTime() - 86_400_000 },
      ]
      const documentFiles = [{ id: 'd1', data: pdf, createdAt: 2, updatedAt: 2 }, { id: 'd2', data: pdf, createdAt: 1, updatedAt: 1 }]
      await restoreBackup(page, path, backupWith({ bankLines, statements, entries, products, bills, budgets, documents, documentFiles, settings: [{ key: 'lastExportAt', value: STEPS_DAY.getTime(), updatedAt: 1 }] }, STEPS_DAY))
    }

    test(`Receipts: a receipt held back, corrected, and the prices you've paid, ${scheme}`, async ({ page }, testInfo) => {
      await fakeKeyboard(page)
      await page.clock.setFixedTime(STEPS_DAY)
      await stepsSeed(page, testInfo.outputPath('steps-seed.json'))
      const at = (name: string) => `${scheme}-${name}`
      await page.goto('./#/money')
      await page.getByRole('button', { name: 'Receipts', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Prices you’ve paid' })).toBeVisible()
      await look(page, at('receipts-prices'))
      // A product's sheet: the shops on one scale, one shop over time.
      await page.getByRole('region', { name: 'Prices you’ve paid' }).getByRole('button', { name: /Semi Skimmed Milk/ }).click()
      await look(page, at('product-sheet'))
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
      // October, where the Aldi receipt is held back: listed to check, not counted.
      await page.goto('./#/money/2026-10')
      await page.getByRole('button', { name: 'Receipts', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Receipts to check' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Prices you’ve paid' })).toHaveCount(0)
      await look(page, at('receipts-held'))
      // The held receipt, opened to correct, and the form with the keyboard up over its fields.
      const check = page.getByRole('region', { name: 'Receipts to check' }).locator('li')
      await check.locator('details', { hasText: 'Aldi' }).locator('summary').click()
      await check.locator('details', { hasText: 'Aldi' }).getByRole('button', { name: 'Open to correct' }).click()
      await look(page, at('receipt-held-sheet'))
      await page.getByRole('dialog').getByRole('button', { name: 'Correct this receipt' }).click()
      const form = page.getByRole('dialog', { name: 'Correct this receipt' })
      await look(page, at('correct-receipt'))
      await lookWithKeyboard(page, at('correct-receipt-shop'), form.getByLabel('Shop'))
      await form.getByRole('button', { name: '+ Add an item' }).click()
      await lookWithKeyboard(page, at('correct-receipt-item'), form.getByLabel('Name of item 2'))
    })

    test(`Bills and budgets, ${scheme}`, async ({ page }, testInfo) => {
      await fakeKeyboard(page)
      await page.clock.setFixedTime(STEPS_DAY)
      await stepsSeed(page, testInfo.outputPath('steps-seed.json'))
      const at = (name: string) => `${scheme}-${name}`
      await page.goto('./#/money')
      await expect(page.getByRole('button', { name: /Bills and budgets/ })).toContainText('£240.00 a year')
      await look(page, at('money-bills-tile'))
      await page.getByRole('button', { name: /Bills and budgets/ }).click()
      const sheet = page.getByRole('dialog', { name: 'Bills and budgets' })
      await look(page, at('bills-sheet'))
      await sheet.getByRole('button', { name: '+ Add a bill' }).click()
      const editor = page.getByRole('dialog', { name: 'Add a bill' })
      await look(page, at('bill-editor'))
      await lookWithKeyboard(page, at('bill-editor-name'), editor.getByLabel('Name'))
      await lookWithKeyboard(page, at('bill-editor-notes'), editor.getByLabel('Notes, such as how to cancel'))
      await editor.getByRole('button', { name: 'Close', exact: true }).click()
      await sheet.getByRole('button', { name: '+ Set a budget' }).click()
      await look(page, at('budget-editor'))
      await lookWithKeyboard(page, at('budget-editor-amount'), page.getByRole('dialog', { name: 'Set a budget' }).getByLabel('Set aside each month'))
    })

    test(`Documents, ${scheme}`, async ({ page }, testInfo) => {
      await fakeKeyboard(page)
      await page.clock.setFixedTime(STEPS_DAY)
      await stepsSeed(page, testInfo.outputPath('steps-seed.json'))
      const at = (name: string) => `${scheme}-${name}`
      await page.goto('./#/more/documents')
      await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()
      await expect(page.getByRole('region', { name: 'All documents' })).toContainText('Home insurance policy')
      await look(page, at('documents'))
      await page.getByRole('searchbox', { name: 'Search your documents' }).fill('notice period')
      await look(page, at('documents-search'))
      await page.getByRole('region', { name: 'Search results' }).getByRole('button', { name: /Home insurance policy/ }).click()
      const sheet = page.getByRole('dialog', { name: 'Home insurance policy' })
      await look(page, at('document-sheet'))
      await lookWithKeyboard(page, at('document-sheet-title'), sheet.getByLabel('Title'))
      await sheet.getByRole('button', { name: 'View it here' }).click()
      await expect(sheet.locator('.pdf-pages canvas')).toHaveCount(2)
      await look(page, at('document-sheet-pdf'))
    })

    test(`Quick answers and Today's quiet line, ${scheme}`, async ({ page }, testInfo) => {
      await fakeKeyboard(page)
      await page.clock.setFixedTime(STEPS_DAY)
      await stepsSeed(page, testInfo.outputPath('steps-seed.json'))
      const at = (name: string) => `${scheme}-${name}`
      await page.goto('./#/ask')
      const card = page.getByRole('region', { name: 'Your money and papers' })
      await expect(card.getByRole('button')).toHaveCount(8)
      await look(page, at('ask-quick'))
      await card.getByRole('button', { name: 'How a cost changed' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Energy', exact: true }).click()
      await expect(page.getByRole('dialog').getByText('October is £34.00 more than September.')).toBeVisible()
      await look(page, at('answer-cost-change'))
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
      await card.getByRole('button', { name: 'Biggest expenses' }).click()
      await expect(page.getByRole('dialog').getByRole('heading', { name: 'Biggest single payments' })).toBeVisible()
      await look(page, at('answer-biggest'))
      await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
      await card.getByRole('button', { name: 'What needs a look' }).click()
      await expect(page.getByRole('dialog').getByText('statement needed')).toBeVisible()
      await look(page, at('answer-needs-a-look'))
    })

    test(`Today with the quiet line about money, ${scheme}`, async ({ page }, testInfo) => {
      await page.clock.setFixedTime(new Date(2026, 9, 30, 12, 0))
      await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
      await stepsSeed(page, testInfo.outputPath('steps-seed.json'))
      await page.goto('./#/today')
      await expect(page.getByRole('complementary', { name: 'About your money' })).toBeVisible()
      await look(page, `${scheme}-today-money-notice`)
    })

    test(`the welcome, ${scheme}`, async ({ page }) => {
      await page.clock.setFixedTime(EVENING)
      await page.goto('./')
      for (const [step, heading] of [
        ['welcome-1', 'Life Design'],
        ['welcome-2', 'What would you like it to help with?'],
        ['welcome-3', 'A nudge each evening?'],
      ] as const) {
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
        await look(page, `${scheme}-${step}`)
        if (step !== 'welcome-3') await page.getByRole('button', { name: 'Next' }).click()
      }
    })
  })
}
