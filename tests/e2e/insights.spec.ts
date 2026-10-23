import { expect, test } from '@playwright/test'
import { restoreSeed } from './seed'

// Insights is one page (v0.13, owner: "two graphs showing the same thing", "suboptions which I don't know is a better
// option"). A fixed Saturday, so the fictional five days (Monday 19 to Friday 23 October 2026) fall in one week and
// their weekdays are known.
const SATURDAY = new Date(2026, 9, 24, 20, 0)

test('Insights is one page: the week, then the last 30 days in words, with nothing to choose or fill in', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(SATURDAY)
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)
  await page.goto('./#/insights')
  const days = page.getByRole('region', { name: 'Last 30 days' })
  const card = (title: string) => days.locator('.card', { has: page.getByRole('heading', { name: title, exact: true }) })
  await expect(days).toContainText("In what you've written, not causes.")

  await expect(card('Gives you energy').locator('summary')).toHaveText([/^Deep work on the report · almost always · 5 times/, /^Evening run · almost always · 3 times/])
  await expect(card('Uses up your energy').locator('summary')).toHaveText([/^Commute · almost always · 4 times/, /^Team meeting · almost always · 4 times/])
  // Cooking dinner was logged once: not a pattern (it's only among the entries behind "In the morning").
  await expect(days.locator('summary', { hasText: 'Cooking dinner' })).toHaveCount(0)
  await expect(card('When time flew').locator('summary')).toHaveText([/^Deep work on the report · 3 of 5 times/])

  // Places, people and times, picked for you: only what usually went one way, never what's already said. Home,
  // Office, Alex and the laptop are only ever the deep work and the meetings listed above, so they're left out.
  await expect(card('Places, people and times').locator('summary')).toHaveText([
    /^In the morning · almost always gives energy · 6 times/,
    /^Alone · usually gives energy · 13 times/,
    /^On Tuesdays · usually takes energy · 3 times/,
    /^On Thursdays · usually gives energy · 5 times/,
  ])
  for (const said of ['Home', 'Office', 'Alex', 'Laptop']) await expect(card('Places, people and times')).not.toContainText(said)
  await expect(card('Small joys that came back')).toContainText('coffee · twice')
  await expect(card('Small joys that came back')).toContainText('sun · twice')

  // Nothing to choose (the period, the chart, the context) and nothing to fill in.
  for (const name of ['7 days', '30 days', '90 days', 'All', 'Energy', 'Into it', 'Where', 'With whom', 'Time of day']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  }
  await expect(page.locator('main textarea, main input')).toHaveCount(0)
  // Long words must never squeeze a name into one letter per line (seen once while building Phase 2.6).
  for (const label of await days.locator('summary > span:first-child').all()) {
    expect((await label.boundingBox())?.height ?? 99).toBeLessThan(48)
  }
})

test('a line opens to the entries behind it, and each of those opens the entry', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(SATURDAY)
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)
  await page.goto('./#/insights')
  const deepWork = page.getByRole('region', { name: 'Last 30 days' }).locator('details.week-line', { hasText: 'Deep work on the report' }).first()
  await deepWork.locator('summary').click()
  const behind = deepWork.locator('.evidence-list').getByRole('button')
  await expect(behind).toHaveCount(5)
  await expect(behind.first()).toContainText('Fri 23')
  await behind.first().click()
  const opened = page.getByRole('dialog', { name: 'Deep work on the report' })
  await expect(opened).toBeVisible()
  await opened.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(opened).toBeHidden()
})

test("the week's chart counts what each day held, lists a tapped day's entries, and opens as a table", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(SATURDAY)
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)
  await page.goto('./#/insights')
  const chart = page.locator('figure.chart', { hasText: 'Energy, day by day' })
  // Deep work ×5, the run ×3 and cooking gave energy; the meetings ×4 and commutes ×4 used it up: one segment each.
  await expect(chart.locator('.chart-readout')).toHaveText('9 gave you energy, 8 used it up · tap a day')
  await expect(chart.locator('.chart-col.pos')).toHaveCount(9)
  await expect(chart.locator('.chart-col.neg')).toHaveCount(8)

  // Wednesday held two of each: counted, not averaged into a flat line.
  await chart.getByRole('button', { name: /^Wednesday, October 21/ }).click()
  await expect(chart.locator('.chart-readout')).toHaveText('Wednesday, October 21: 2 gave you energy, 2 used it up')
  const list = chart.locator('.evidence-list').getByRole('button')
  await expect(list).toHaveCount(4)
  await expect(list.first()).toContainText('Deep work on the report') // the day in order: the morning first
  await expect(chart.locator('.evidence-list')).not.toContainText('Wed 21') // one day: its date isn't repeated
  await list.filter({ hasText: 'Team meeting' }).click()
  await expect(page.getByRole('dialog', { name: 'Team meeting' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Team meeting' }).getByRole('button', { name: 'Done', exact: true }).click()

  // Saturday and Sunday: nothing logged.
  await chart.getByRole('button', { name: /^Sunday, October 25/ }).click()
  await expect(chart.locator('.chart-readout')).toHaveText('Sunday, October 25: nothing logged')

  await chart.getByText('Show as table').click()
  await expect(chart.locator('table tbody tr')).toHaveCount(7)
  await expect(chart.locator('table tbody tr').nth(2)).toHaveText(/^Wed 21\s*2\s*2\s*0$/)
})

test('old links to Patterns open Insights', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))
  await page.goto('./#/insights/patterns')
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible()
})
