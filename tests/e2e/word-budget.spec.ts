import { expect, type Locator, type Page, test } from '@playwright/test'
import { restoreSeed } from './seed'

// The guard against clutter creeping back (owner feedback, Phase 2.5: "the app feels wordy").
// Counts the words a person actually sees on each screen, with the same fictional data every time:
// collapsed sections, unselected menu options, chart tooltips and screen-reader-only text don't count.
// Raise a budget only with the owner's OK. Baseline before Phase 2.5 (v0.3.0) in brackets.
const BUDGETS = {
  // v0.8: 63 → 72. "Review due" is gone, so this test browser (not installed) now shows the install notice (10 words;
  // never on the Home Screen app), and Today has two ways in (+4). Owner-approved plan: budgets set from measurements.
  // v0.10: 72 → 85, the time each entry was logged (the owner's request; "8:00 PM" counts as three words here).
  'Today, a logged day [96]': 85,
  'New activity: what [90 for the whole form]': 25,
  'New activity: what it was like (10 answer words)': 25,
  'New activity: energy (4 answers)': 30,
  'New activity: how you felt (12 answer words)': 30,
  'New activity: write (helpers and one box)': 60, // v0.9: one screen instead of reflect (25) and anything else (30); three helper questions
  'Write freely': 25,
  'Entry, read back after saving': 75, // 90 until v0.9, when it stopped restating the entry: your words, a possible insight, the next-step choices
  'Entries [the fictional five days]': 180, // 125 until v0.10: + the time each of the 19 entries was logged
  'Insights: this week, the fictional week': 130, // 80 until v0.9; + the week's energy chart and card titles (the owner's chosen layout); v0.10 + logged times on stand-out entries; v0.11 + the Next steps card; v0.12 + the Review a period row
  'Insights → Next steps (empty)': 30,
  'Insights → Review a period, this week': 60, // v0.12: the period, what's in it, the two ways
  'More → AI review (no key yet)': 40, // v0.12: the two services, the key field
  'Insights → Patterns, 30 days [236]': 155, // 150 until v0.8: + "Alone or with others" (the owner's brief)
  'More [460]': 60,
  'More → Reminders [266]': 133,
  'More → Your purpose': 95, // seven purposes, each with its one-line explanation (the brief asks for both)
  'More → Backup and restore [67]': 40,
} as const

type Screen = keyof typeof BUDGETS

// A fixed evening, so the day's question (its length varies day to day) is always the same. The day
// before it is a "pattern" evening, so Today is measured with the longest kind of question.
const EVENING = new Date(2026, 9, 23, 20, 0)

async function visibleWords(scope: Locator): Promise<number> {
  return scope.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let words = 0
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement
      if (!el || el.closest('.visually-hidden, title, desc')) continue
      const option = el.closest('option')
      if (option && !option.selected) continue
      const details = el.closest('details')
      if (details && !details.open && !el.closest('summary')) continue
      if (!option && el.getClientRects().length === 0) continue
      words += (node.textContent?.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length
    }
    return words
  })
}

test('every main screen stays within its word budget', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(EVENING)
  await restoreSeed(page, testInfo.outputPath('seed.json'), EVENING)
  const counts: Partial<Record<Screen, number>> = {}
  const main = page.locator('main')
  const sheet = page.locator('dialog[open]')
  const measure = async (screen: Screen, scope: Locator) => {
    counts[screen] = await visibleWords(scope)
  }
  const settled = (p: Page) => p.waitForTimeout(350) // past the fade-in and tap guard

  await page.goto('./#/today')
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
  await measure('Today, a logged day [96]', main)

  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  await measure('New activity: what [90 for the whole form]', sheet)
  await sheet.getByLabel('What did you do?').fill('Choir rehearsal')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await settled(page)
  await measure('New activity: what it was like (10 answer words)', sheet)
  await sheet.getByRole('button', { name: 'Absorbed', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await settled(page)
  await measure('New activity: energy (4 answers)', sheet)
  await sheet.getByRole('button', { name: 'It gave me energy' }).click()
  await settled(page)
  await measure('New activity: how you felt (12 answer words)', sheet)
  await sheet.getByRole('button', { name: 'Happy', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await settled(page)
  await measure('New activity: write (helpers and one box)', sheet)
  await sheet.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Write freely' }).click()
  await measure('Write freely', sheet)
  await sheet.getByRole('button', { name: 'Close' }).click()

  // What an entry reads back just after saving (Team meeting has 4 fictional entries: a possible insight shows).
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  await sheet.getByRole('button', { name: 'Team meeting' }).click()
  await settled(page)
  await sheet.getByRole('button', { name: 'Distracted', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await settled(page)
  await sheet.getByRole('button', { name: 'It used up my energy' }).click()
  await settled(page)
  await sheet.getByRole('button', { name: 'Skip' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByText('✓ Saved')).toBeVisible()
  await measure('Entry, read back after saving', sheet)
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()

  await page.goto('./#/entries')
  await expect(page.getByRole('heading', { level: 1, name: 'Entries' })).toBeVisible()
  await measure('Entries [the fictional five days]', main)

  await page.goto('./#/insights')
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible()
  await measure('Insights: this week, the fictional week', main)
  await page.goto('./#/insights/steps')
  await expect(page.getByRole('heading', { level: 1, name: 'Next steps' })).toBeVisible()
  await measure('Insights → Next steps (empty)', main)
  await page.goto('./#/insights/review')
  await expect(page.getByRole('heading', { level: 1, name: 'Review a period' })).toBeVisible()
  await measure('Insights → Review a period, this week', main)
  await page.goto('./#/insights/patterns')
  await expect(page.getByRole('heading', { level: 1, name: 'Patterns' })).toBeVisible()
  await measure('Insights → Patterns, 30 days [236]', main)

  await page.goto('./#/more')
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
  await measure('More [460]', main)
  for (const [path, screen] of [
    ['reminders', 'More → Reminders [266]'],
    ['purpose', 'More → Your purpose'],
    ['ai', 'More → AI review (no key yet)'],
    ['backup', 'More → Backup and restore [67]'],
  ] as const) {
    await page.goto(`./#/more/${path}`)
    await expect(page.getByRole('link', { name: '‹ More' })).toBeVisible()
    await measure(screen, main)
  }

  testInfo.annotations.push({ type: 'words', description: JSON.stringify(counts) })
  console.log(counts)
  const over = (Object.keys(BUDGETS) as Screen[]).filter((s) => (counts[s] ?? Number.POSITIVE_INFINITY) > BUDGETS[s])
  expect(over.map((s) => `${s}: ${counts[s]} words, budget ${BUDGETS[s]}`)).toEqual([])
})

// The welcome on a new phone (Phase 3a.5). Set from measurements; raise only with the owner's OK.
const WELCOME_BUDGETS = {
  'Welcome: Life Design': 60, // the examples now say what each did to your energy
  'Welcome: what it helps with': 105, // the purpose list, as in More → Your purpose
  'Welcome: a nudge each evening': 20,
} as const

test('the welcome stays within its word budget', async ({ page }, testInfo) => {
  await page.goto('./')
  const main = page.locator('main')
  const counts: Record<string, number> = {}
  for (const [screen, heading] of [
    ['Welcome: Life Design', 'Life Design'],
    ['Welcome: what it helps with', 'What would you like it to help with?'],
    ['Welcome: a nudge each evening', 'A nudge each evening?'],
  ] as const) {
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    counts[screen] = await visibleWords(main)
    if (screen !== 'Welcome: a nudge each evening') await page.getByRole('button', { name: 'Next' }).click()
  }
  testInfo.annotations.push({ type: 'words', description: JSON.stringify(counts) })
  console.log(counts)
  const over = (Object.keys(WELCOME_BUDGETS) as (keyof typeof WELCOME_BUDGETS)[]).filter((s) => (counts[s] ?? Infinity) > WELCOME_BUDGETS[s])
  expect(over.map((s) => `${s}: ${counts[s]} words, budget ${WELCOME_BUDGETS[s]}`)).toEqual([])
})
