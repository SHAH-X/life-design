import { expect, test } from '@playwright/test'
import { restoreSeed } from './seed'

test('Insights shows what gives and takes energy, when time flew, context and small joys', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))
  await page.goto('./#/insights')
  await page.getByRole('button', { name: '7 days' }).click()

  // Headline numbers: 5 of the last 7 days logged, time flew 3 times.
  const kpis = page.locator('.kpi-row')
  await expect(kpis.locator('.stat-tile', { hasText: 'Days logged' })).toContainText('5')
  await expect(kpis.locator('.stat-tile', { hasText: 'Time flew' })).toContainText('3')

  const section = (title: string) => page.locator('section.card', { has: page.getByRole('heading', { name: title, exact: true }) })
  const ranked = (title: string) => page.locator('.rank-group', { has: page.getByRole('heading', { name: title, exact: true }) })
  await expect(ranked('Gives energy').locator('.bar-row')).toHaveText([/Deep work on the report\s*\+2\.0 · 5×/, /Evening run\s*\+1\.0 · 3×/])
  await expect(ranked('Takes energy').locator('.bar-row')).toHaveText([/Commute\s*−2\.0 · 4×/, /Team meeting\s*−1\.0 · 4×/])
  // Cooking dinner was logged only once, so it isn't ranked.
  await expect(page.getByText('Cooking dinner')).toHaveCount(0)
  await expect(section('Time flew')).toContainText('Deep work on the report · 3 of 5')

  // Context shows one list at a time: Where first, then With whom.
  const context = section('Energy by context')
  await expect(context.locator('.bar-row')).toHaveText([/Home\s*\+2\.0 · 5×/, /Office\s*−1\.0 · 4×/])
  await context.getByRole('button', { name: 'With whom' }).click()
  await expect(context.locator('.bar-row')).toHaveText([/Alex\s*−1\.0 · 4×/])
  await expect(section('Small joys')).toContainText('coffee ×2')
  await expect(section('Small joys')).toContainText('sun ×2')
})

test('the energy chart reads out a day when tapped, and opens as a table', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))
  await page.goto('./#/insights')
  await page.getByRole('button', { name: '7 days' }).click()
  const chart = page.locator('figure.chart', { hasText: 'Energy by day' })
  await expect(chart.locator('.chart-readout')).toContainText('Average')
  await expect(chart.locator('path.chart-col')).not.toHaveCount(0)

  // Yesterday: deep work +2, meeting −1, commute −2, run +1 → average 0.0 over 4 activities.
  await chart.getByRole('button', { name: /energy · .* · 4 activities/ }).last().click()
  await expect(chart.locator('.chart-readout')).toContainText('4 activities')

  await chart.getByText('Show as table').click()
  await expect(chart.locator('table tbody tr')).toHaveCount(7)

  // How into it you were has its own chart and scale, one tap away.
  await page.getByRole('group', { name: 'Chart' }).getByRole('button', { name: 'Into it' }).click()
  await expect(page.locator('figure.chart', { hasText: 'Into it by day' })).toBeVisible()
  await expect(page.locator('figure.chart', { hasText: 'Energy by day' })).toHaveCount(0)
})
