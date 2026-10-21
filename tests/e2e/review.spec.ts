import { expect, test } from '@playwright/test'
import { restoreSeed } from './seed'

test('a due review: glance, balance, best and worst moments, reflection, finish', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))

  // Reviews are every 2 days and logging began 5 days ago, so one is due, and Today says so.
  await page.goto('./#/today')
  await expect(page.locator('aside.notice')).toContainText('Review due')
  await page.getByRole('button', { name: 'Start review' }).click()
  await expect(page.getByRole('heading', { name: 'Review due' })).toBeVisible()

  await page.getByRole('button', { name: 'Change period' }).click()
  await page.getByLabel('Look back over').selectOption('7')
  await page.getByRole('button', { name: 'Start review' }).click()

  // 1. At a glance
  await expect(page.getByRole('heading', { level: 1, name: 'At a glance' })).toBeVisible()
  await expect(page.getByText(/^1 of 5 · /)).toBeVisible()
  await expect(page.locator('.kpi-row .stat-tile', { hasText: 'Days logged' })).toContainText('5')
  await expect(page.locator('section.card', { hasText: 'Gave energy' })).toContainText('Deep work on the report')
  await page.getByRole('button', { name: 'Next' }).click()

  // 2. Balance: sliders start unrated; arrow keys rate them.
  await expect(page.getByRole('heading', { level: 1, name: 'Balance' })).toBeVisible()
  const health = page.getByRole('slider', { name: 'Health' })
  await health.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.gauge', { hasText: 'Health' }).locator('.gauge-value')).toContainText('7')
  await page.getByRole('button', { name: 'What does play mean?' }).click()
  await expect(page.getByText('Things you do just for the joy of it')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  // 3. Best and worst moments are pre-selected; one question each, with AEIOU (pre-filled) to zoom in.
  await expect(page.getByRole('heading', { level: 1, name: 'Best and worst moments' })).toBeVisible()
  const best = page.getByLabel('Which moment gave you the most energy?')
  await expect(best).toHaveValue(/seed-/)
  await expect(best.locator('option:checked')).toContainText('Deep work on the report')
  await page.getByLabel('What made it so good?').fill('Writing the analysis, alone and uninterrupted')
  const bestCard = page.locator('section.card', { has: best })
  await bestCard.getByText('Zoom in with AEIOU').click()
  await expect(bestCard.getByLabel('E · Environment')).toHaveValue('Home')
  await expect(bestCard.getByLabel('O · Objects')).toHaveValue('Laptop')
  await expect(page.getByLabel('Which moment took the most energy?').locator('option:checked')).toContainText('Commute')
  await page.getByRole('button', { name: 'Next' }).click()

  // 4. Reflection and takeaway
  await page.getByLabel('What do you notice?').fill('Mornings at home give me energy; commutes and long meetings drain it.')
  await page.getByLabel('One thing to carry forward?').fill('Protect mornings for deep work')
  await page.getByRole('button', { name: 'Next' }).click()

  // 5. Finish, with a backup nudge (nothing backed up yet)
  await expect(page.getByRole('heading', { level: 1, name: 'Finish' })).toBeVisible()
  await expect(page.getByText('Takeaway: Protect mornings for deep work')).toBeVisible()
  await expect(page.getByText('Nothing is backed up yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Finish review' }).click()
  await expect(page.getByText(/✓ Review complete/)).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()

  // The review is listed, no longer due, and its takeaway and balance reach Insights.
  await expect(page.getByRole('heading', { name: 'Next review' })).toBeVisible()
  await expect(page.locator('.review-item').first()).toContainText('Protect mornings for deep work')
  await page.goto('./#/insights')
  await expect(page.locator('section.card', { hasText: "What I'm learning" })).toContainText('Protect mornings for deep work')
  await expect(page.locator('.meter-row', { hasText: 'Health' })).toContainText('7/10')
})

test('a review in progress is kept, and can be continued or discarded', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))
  await page.goto('./#/review')
  await page.getByRole('button', { name: /^(Start review|Review now)$/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  const love = page.getByRole('slider', { name: 'Love' })
  await love.focus()
  await page.keyboard.press('ArrowLeft') // 5 → 4

  await page.goto('./#/today')
  await page.goto('./#/review')
  await expect(page.getByRole('heading', { name: 'Review in progress' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue review' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.locator('.gauge', { hasText: 'Love' }).locator('.gauge-value')).toContainText('4')

  await page.getByRole('link', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Discard this review' }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Review due' })).toBeVisible()
})
