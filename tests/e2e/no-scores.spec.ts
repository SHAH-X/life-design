import { expect, test } from '@playwright/test'
import { addEntry, captureBox, expectNoScores } from './helpers'
import { restoreSeed } from './seed'

// The guard for Phase 2.6's rule: nothing asks for or shows a rating, score, average or scale (expectNoScores).
// Search by meaning's screens are checked in meaning.spec.ts, which has the model.

/** A Thursday, so the seed's entries (yesterday back to 5 days ago) fill this week's chart: on a Monday they'd all be
 *  last week's, and the chart isn't there to open (it failed so on 26 Oct 2026). */
const THURSDAY = new Date(2026, 9, 22, 12, 0)

test('no screen asks for or shows a rating or score', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(THURSDAY)
  await restoreSeed(page, testInfo.outputPath('seed.json'), THURSDAY)

  await page.goto('./#/today')
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expectNoScores(page, 'Today')

  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await expectNoScores(page, 'the writer')
  await sheet.getByRole('button', { name: 'Close' }).click()

  await page.goto('./#/entries')
  await expectNoScores(page, 'Logs')
  await page.getByRole('button', { name: /^Team meeting/ }).first().click()
  await expectNoScores(page, 'An entry read back')
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  await page.goto('./#/shopping')
  await expectNoScores(page, 'Shopping') // with receipts and every line opened: shopping.spec.ts

  await page.goto('./#/insights')
  await expectNoScores(page, 'Insights')
  // Everything that opens on it (v0.13): a day of the chart, its table, a line's entries.
  const chart = page.locator('figure.chart', { hasText: 'Energy, day by day' })
  await chart.locator('.chart-hit').nth(1).click()
  await chart.getByText('Show as table').click()
  for (const line of await page.locator('details.week-line > summary').all()) await line.click()
  await expectNoScores(page, 'Insights, opened')
  for (const sub of ['steps', 'review', 'learning', 'weeks']) {
    await page.goto(`./#/insights/${sub}`)
    await expectNoScores(page, `Insights → ${sub}`)
  }
})

test('the welcome shows no scores', async ({ page }) => {
  await page.goto('./')
  for (const step of ['Life Design', 'What would you like it to help with?', 'A nudge each evening?']) {
    await expect(page.getByRole('heading', { level: 1, name: step })).toBeVisible()
    await expectNoScores(page, `Welcome: ${step}`)
    if (step !== 'A nudge each evening?') await page.getByRole('button', { name: 'Next' }).click()
  }
})

test('an entry logged in words reads back in words', async ({ page }) => {
  await page.goto('./#/today')
  await addEntry(page, { activity: 'Choir rehearsal', during: ['Absorbed', 'Time flew'], energy: 'A mix of both', after: ['Inspired', 'Tired'] })
  await expectNoScores(page, 'Today after logging')
  await page.goto('./#/insights')
  await expectNoScores(page, 'Insights after logging')
})
