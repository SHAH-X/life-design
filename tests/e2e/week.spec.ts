import { expect, test } from '@playwright/test'
import { addEntry } from './helpers'
import { restoreSeed } from './seed'

// The weekly review is put together automatically (Phase 4). A fixed Saturday, so the fictional five days before
// it (Monday 19 to Friday 23 October 2026) all fall in one week.
const SATURDAY = new Date(2026, 9, 24, 20, 0)

test('Insights opens on this week, put together from what you wrote; each line opens to its entries', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(SATURDAY)
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)
  await page.goto('./#/insights')
  const week = page.getByRole('region', { name: 'This week' })
  await expect(week).toContainText('17 entries on 5 days')

  const deepWork = week.locator('details.week-line', { hasText: 'Deep work on the report' })
  await expect(deepWork).toContainText('5 times')
  await deepWork.locator('summary').click()
  await expect(deepWork.locator('.evidence-list li')).toHaveCount(5)
  await expect(week.locator('details.week-line', { hasText: 'Commute' })).toContainText('4 times')
  // Something that happened once isn't a pattern.
  await expect(week).not.toContainText('Cooking dinner')
  // The week's energy by day, read in words.
  await expect(week.getByText('Energy by day')).toBeVisible()
  // What stood out lists each activity once, and each opens.
  const stood = week.getByRole('list', { name: 'What stood out' })
  await expect(stood.getByRole('button', { name: /^Deep work on the report/ })).toHaveCount(1)
  await stood.getByRole('button', { name: /^Deep work on the report/ }).click()
  const opened = page.getByRole('dialog', { name: 'Deep work on the report' })
  await expect(opened).toBeVisible()
  await opened.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(opened).toBeHidden()

  // Nothing to fill in; one optional box, saved as you type.
  await week.getByLabel('Anything to carry into next week?').fill('Walk at lunch')
  await expect(week.getByText('Saved')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'This week' }).getByLabel('Anything to carry into next week?')).toHaveValue('Walk at lunch')
})

test("the week's next steps are followed up, not yet is fine, and its feelings open their entries", async ({ page }) => {
  await page.goto('./#/today')
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill('Team meeting')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Skip' }).click()
  await sheet.getByRole('button', { name: 'Skip' }).click()
  await sheet.getByRole('button', { name: 'Frustrated', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  const view = page.getByRole('dialog', { name: 'Team meeting' })
  await view.getByRole('button', { name: 'Try something differently' }).click()
  await view.getByLabel('What exactly?').fill('Ask for an agenda first')
  await view.getByRole('button', { name: 'Keep this' }).click()
  await view.getByRole('button', { name: 'Done', exact: true }).click()
  // A feeling shows once it came up in two entries.
  await addEntry(page, { activity: 'Commute', after: ['Frustrated'] })

  await page.goto('./#/insights')
  const week = page.getByRole('region', { name: 'This week' })
  await expect(week).toContainText('Your next steps')
  await expect(week).toContainText('Ask for an agenda first')
  await expect(week).toContainText("Not yet is fine: it'll be here next time.")
  // The same words as on the entry.
  await week.getByRole('button', { name: 'Done it' }).click()
  await expect(week).toContainText('✓ Done')

  const feeling = week.getByRole('group', { name: 'Feelings' }).getByRole('button', { name: /^frustrated/ })
  await feeling.click()
  await expect(feeling).toHaveAttribute('aria-expanded', 'true')
  await expect(week.locator('.evidence-list li')).toHaveCount(2)
  await expect(week.locator('.evidence-list')).toContainText('Team meeting')
  await expect(week.locator('.evidence-list')).toContainText('Commute')
})

test('earlier weeks open on their own page, put together the same way', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 9, 28, 20, 0)) // the Wednesday after
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)
  await page.goto('./#/insights')
  await expect(page.getByRole('region', { name: 'This week' })).toContainText('Nothing written this week yet')
  await page.getByText('Earlier weeks').click()
  await page.locator('details.earlier-weeks a').first().click()
  await expect(page).toHaveURL(/#\/insights\/week-2026-10-19$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Your week' })).toBeVisible()
  await expect(page.locator('main')).toContainText('17 entries on 5 days')
  await page.getByRole('link', { name: '‹ Insights' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible()
})

test('every pattern opens to the entries behind it; alone or with others shows with enough of each', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))
  await page.goto('./#/insights')
  await page.getByRole('link', { name: /^Patterns over time/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Patterns' })).toBeVisible()
  await expect(page.getByText("In what you've written, not causes.")).toBeVisible()
  const gives = page.locator('.rank-group', { has: page.getByRole('heading', { name: 'Gives energy', exact: true }) })
  const deepWork = gives.locator('details.bar-evidence', { hasText: 'Deep work on the report' })
  await deepWork.locator('summary').click()
  await expect(deepWork.locator('.evidence-list li')).toHaveCount(5)

  const company = page.locator('section.card', { has: page.getByRole('heading', { name: 'Alone or with others' }) })
  await expect(company.locator('.bar-row')).toHaveText([/With others\s*almost always takes energy · 4 times/, /Alone\s*.*13 times/])
})
