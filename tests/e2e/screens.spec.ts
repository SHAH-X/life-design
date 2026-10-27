import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { captureBox, entryButton, fakeKeyboard, LONG_WRITING, showKeyboard } from './helpers'
import { expectCleanLayout } from './layout'
import { backupWith, freeWriting, restoreBackup, restoreSeed } from './seed'
import { makePdf } from '../fixtures/pdf'
import { MONZO_LIKE } from '../fixtures/statements'

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
        await expect(page.getByRole('link', { name: '‹ More' })).toBeVisible()
        await look(page, at(`more-${sub}`))
      }
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
