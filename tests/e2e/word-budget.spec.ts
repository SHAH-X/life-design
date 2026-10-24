import { expect, type Locator, test } from '@playwright/test'
import { captureBox } from './helpers'
import { restoreSeed } from './seed'

// The guard against clutter creeping back (owner feedback, Phase 2.5: "the app feels wordy").
// Counts the words a person actually sees on each screen, with the same fictional data every time:
// collapsed sections, unselected menu options, chart tooltips and screen-reader-only text don't count.
// Raise a budget only with the owner's OK. Baseline before Phase 2.5 (v0.3.0) in brackets.
const BUDGETS = {
  // v0.8: 63 → 72. "Review due" is gone, so this test browser (not installed) now shows the install notice (10 words;
  // never on the Home Screen app), and Today has two ways in (+4). Owner-approved plan: budgets set from measurements.
  // v0.10: 72 → 85, the time each entry was logged (the owner's request; "8:00 PM" counts as three words here).
  // v0.15: one box ("What's on your mind?" and its hint) in place of the two ways in; v0.16 85 → 87 (87 measured), the
  // owner's OK with the provoker (its question shows only some days: not on this one).
  'Today, a logged day [96]': 87,
  'Write freely': 25,
  // An activity from before v0.15, opened: its parts and a possible insight (Team meeting has 4 fictional entries).
  // 90 until v0.9 (stopped restating the entry), 75 until v0.12.3: its parts as rows with small labels (owner's OK).
  'Entry, read back (an earlier activity)': 105,
  'Logs [the fictional five days]': 180, // 125 until v0.10: + the time each of the 19 entries was logged (called Entries until 2026-10-23)
  // v0.13: one page, the week and the last 30 days (Patterns, 155, is gone). Its history: 80 until v0.9; + the week's
  // energy chart and card titles (the owner's chosen layout); v0.10 + logged times on stand-out entries; v0.11 + the
  // Next steps card; v0.12 + the Review a period row; v0.13 130 → 195 (194 measured), the owner's OK: one page in
  // place of two (Insights 130 + Patterns 155); v0.16 195 → 224 (224 measured), the owner's OK: + Life areas (here its
  // one-line offer, as search by meaning is off).
  'Insights, the fictional week and 30 days': 224,
  'Insights → Next steps (empty)': 30,
  'Insights → Review a period, this week': 60, // v0.12: the period, what's in it, the two ways
  "Insights → What you're learning": 30, // v0.13
  'Insights → Earlier weeks': 30, // v0.13
  'More → AI review (no key yet)': 60, // v0.18: the three services (Gemini's free-tier line kept whole), the key field (57 measured; owner's OK)
  'More → Search by meaning': 20, // v0.14: the switch and its line (17 measured)
  'More → Reading photos': 20, // v0.16: the switch and its line
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

  await page.goto('./#/today')
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
  await measure('Today, a logged day [96]', main)

  await captureBox(page).click()
  await measure('Write freely', sheet)
  await sheet.getByLabel("What's on your mind?").fill('Choir rehearsal tonight')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByText('✓ Saved')).toBeVisible()
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()

  await page.locator('main .entry-list').getByRole('button', { name: /^Team meeting/ }).first().click()
  await expect(sheet.getByRole('region', { name: 'Possible insight' })).toBeVisible()
  await measure('Entry, read back (an earlier activity)', sheet)
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()

  await page.goto('./#/entries')
  await expect(page.getByRole('heading', { level: 1, name: 'Logs' })).toBeVisible()
  await measure('Logs [the fictional five days]', main)

  await page.goto('./#/insights')
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible()
  await measure('Insights, the fictional week and 30 days', main)
  await page.goto('./#/insights/steps')
  await expect(page.getByRole('heading', { level: 1, name: 'Next steps' })).toBeVisible()
  await measure('Insights → Next steps (empty)', main)
  await page.goto('./#/insights/review')
  await expect(page.getByRole('heading', { level: 1, name: 'Review a period' })).toBeVisible()
  await measure('Insights → Review a period, this week', main)
  await page.goto('./#/insights/learning')
  await expect(page.getByRole('heading', { level: 1, name: "What you're learning" })).toBeVisible()
  await measure("Insights → What you're learning", main)
  await page.goto('./#/insights/weeks')
  await expect(page.getByRole('heading', { level: 1, name: 'Earlier weeks' })).toBeVisible()
  await measure('Insights → Earlier weeks', main)

  await page.goto('./#/more')
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
  await measure('More [460]', main)
  for (const [path, screen] of [
    ['reminders', 'More → Reminders [266]'],
    ['purpose', 'More → Your purpose'],
    ['ai', 'More → AI review (no key yet)'],
    ['meaning', 'More → Search by meaning'],
    ['photos', 'More → Reading photos'],
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
  'Welcome: Life Design': 74, // v0.16 60 → 74 (74 measured), the owner's OK: what the one box is for, and two examples of it
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
