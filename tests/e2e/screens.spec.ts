import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { entryButton, fakeKeyboard, LONG_WRITING, showKeyboard } from './helpers'
import { expectCleanLayout } from './layout'
import { restoreSeed } from './seed'

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
      // A long free writing, one paragraph as people write, so every list is looked at with it (v0.12.2 on the
      // owner's iPhone: shown whole, in bold, it pushed the buttons and everything after it out of sight).
      await page.getByRole('button', { name: 'Write freely' }).click()
      await sheet.getByLabel("What's on your mind?").fill(LONG_WRITING)
      await sheet.getByRole('button', { name: 'Save' }).click()
      await sheet.getByRole('button', { name: 'Done', exact: true }).click()
      await look(page, at('today'))
      await page.getByRole('button', { name: 'Previous day' }).click()
      await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
      await look(page, at('today-yesterday'))

      // A new activity, one step at a time; the keyboard over each text box.
      await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
      await look(page, at('new-what'))
      const what = sheet.getByLabel('What did you do?')
      await what.fill('Choir rehearsal')
      await lookWithKeyboard(page, at('new-what'), what)
      await sheet.getByRole('button', { name: 'Next' }).click()
      await look(page, at('new-like'))
      await sheet.getByRole('button', { name: 'Absorbed', exact: true }).click()
      await sheet.getByRole('button', { name: '+ your own word' }).click()
      await lookWithKeyboard(page, at('new-like-own-word'), sheet.getByLabel('Your own word'))
      await sheet.getByRole('button', { name: 'Next' }).click()
      await look(page, at('new-energy'))
      await sheet.getByRole('button', { name: 'It gave me energy' }).click()
      await look(page, at('new-felt'))
      await sheet.getByRole('button', { name: 'Happy', exact: true }).click()
      await sheet.getByRole('button', { name: 'Next' }).click()
      await look(page, at('new-write'))
      await lookWithKeyboard(page, at('new-write'), sheet.getByLabel("What's on your mind about it?"))
      await sheet.getByRole('button', { name: '+ How long, where, who' }).click()
      await look(page, at('new-write-details'))
      await sheet.getByRole('button', { name: 'Save' }).click()
      await expect(sheet.getByText('✓ Saved')).toBeVisible()
      await look(page, at('entry-saved'))
      await sheet.getByRole('button', { name: 'Done', exact: true }).click()

      // An entry: read as its parts; each opens its own question; "To remember" too.
      await entryButton(page, 'Choir rehearsal').click()
      const entry = page.getByRole('dialog', { name: 'Choir rehearsal' })
      await entry.getByRole('button', { name: 'Remember this' }).click()
      await entry.getByRole('button', { name: 'Keep this' }).click()
      await look(page, at('entry'))
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

      await page.getByRole('button', { name: 'Write freely' }).click()
      await look(page, at('write-freely'))
      await sheet.getByRole('button', { name: 'Close' }).click()

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

      for (const sub of ['reminders', 'purpose', 'words', 'meaning', 'ai', 'backup', 'export', 'phone', 'delete']) {
        await page.goto(`./#/more/${sub}`)
        await expect(page.getByRole('link', { name: '‹ More' })).toBeVisible()
        await look(page, at(`more-${sub}`))
      }
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
