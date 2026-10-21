import { expect, type Page, test } from '@playwright/test'
import { addEntry } from './helpers'
import { restoreSeed } from './seed'

// The guard for Phase 2.6's rule: nothing asks for or shows a rating, score, average or scale.
// Plain counts ("5 times", "on 4 days") and dates are fine; a sign before a number, a decimal,
// "x/5" or "x/10", or the word "average" is not.
const SCORE = /[+−-]\d|\d\s*\/\s*(?:5|10)\b|\b\d\.\d\b|\baverage\b/i

async function expectNoScores(page: Page, where: string) {
  const text = await page.locator('body').innerText()
  expect(text.match(SCORE)?.[0] ?? null, `a score on ${where}`).toBeNull()
}

test('no screen asks for or shows a rating or score', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))

  await page.goto('./#/today')
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expectNoScores(page, 'Today')

  await page.getByRole('button', { name: '+ Add activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill('Choir rehearsal')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await expectNoScores(page, 'What was it like?')
  await sheet.getByRole('button', { name: 'Focused', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await expectNoScores(page, 'How did it leave you?')
  await sheet.getByRole('button', { name: 'Close' }).click()

  await page.goto('./#/insights')
  for (const range of ['7 days', '30 days', 'All']) {
    await page.getByRole('button', { name: range }).click()
    await page.getByText('Show as table').click()
    await expectNoScores(page, `Insights (${range})`)
    await page.getByRole('group', { name: 'Chart' }).getByRole('button', { name: 'Into it' }).click()
    await page.getByText('Show as table').click()
    await expectNoScores(page, `Insights, into it (${range})`)
    await page.getByRole('group', { name: 'Chart' }).getByRole('button', { name: 'Energy' }).click()
  }

  for (const path of ['design', 'design/odyssey', 'design/plan-1', 'design/views']) {
    await page.goto(`./#/${path}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await expectNoScores(page, `Life Design: ${path}`)
  }

  await page.goto('./#/review')
  await expectNoScores(page, 'Review')
  await page.getByRole('button', { name: /^(Start review|Review now)$/ }).click()
  for (const step of ['At a glance', 'Balance', 'Best and worst moments', 'Your reflection', 'Finish']) {
    await expect(page.getByRole('heading', { level: 1, name: step })).toBeVisible()
    await expectNoScores(page, `Review: ${step}`)
    if (step !== 'Finish') await page.getByRole('button', { name: 'Next' }).click()
  }
})

test('an entry logged in words reads back in words', async ({ page }) => {
  await page.goto('./#/today')
  await addEntry(page, { activity: 'Choir rehearsal', during: ['Absorbed', 'Time flew'], after: ['Energised', 'Tired'] })
  await expectNoScores(page, 'Today after logging')
  await page.goto('./#/insights')
  await expectNoScores(page, 'Insights after logging')
})
