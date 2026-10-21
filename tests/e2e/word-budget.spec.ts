import { expect, type Locator, type Page, test } from '@playwright/test'
import { restoreSeed } from './seed'

// The guard against clutter creeping back (owner feedback, Phase 2.5: "the app feels wordy").
// Counts the words a person actually sees on each screen, with the same fictional data every time:
// collapsed sections, unselected menu options, chart tooltips and screen-reader-only text don't count.
// Raise a budget only with the owner's OK. Baseline before Phase 2.5 (v0.3.0) in brackets.
const BUDGETS = {
  'Today, a logged day [96]': 60,
  'New activity: what [90 for the whole form]': 25,
  'New activity: energy': 25,
  'New activity: into it, time flew': 25,
  'New activity: why': 25,
  'Review home [47]': 30,
  'Review: at a glance [114]': 90,
  'Review: moments [255]': 80,
  'Insights, 30 days [236]': 150,
  'More [460]': 60,
  'More → Reminders [266]': 133,
  'More → Evening question': 60,
  'More → Backup and restore [67]': 40,
} as const

type Screen = keyof typeof BUDGETS

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
  await restoreSeed(page, testInfo.outputPath('seed.json'))
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

  await page.getByRole('button', { name: '+ Add activity' }).click()
  await measure('New activity: what [90 for the whole form]', sheet)
  await sheet.getByLabel('What did you do?').fill('Choir rehearsal')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await settled(page)
  await measure('New activity: energy', sheet)
  await sheet.getByRole('button', { name: 'Gave a lot', exact: true }).click()
  await sheet.getByRole('button', { name: 'Fully', exact: true }).click()
  await measure('New activity: into it, time flew', sheet)
  await sheet.getByRole('button', { name: 'Yes', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeVisible()
  await settled(page)
  await measure('New activity: why', sheet)
  await sheet.getByRole('button', { name: 'Close' }).click()

  await page.goto('./#/review')
  await expect(page.getByRole('heading', { level: 1, name: 'Review' })).toBeVisible()
  await measure('Review home [47]', main)
  await page.getByRole('button', { name: /^(Start review|Review now)$/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'At a glance' })).toBeVisible()
  await measure('Review: at a glance [114]', main)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Best and worst moments' })).toBeVisible()
  await measure('Review: moments [255]', main)

  await page.goto('./#/insights')
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible()
  await measure('Insights, 30 days [236]', main)

  await page.goto('./#/more')
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
  await measure('More [460]', main)
  for (const [path, screen] of [
    ['reminders', 'More → Reminders [266]'],
    ['evening', 'More → Evening question'],
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
