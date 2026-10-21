import { expect, test } from '@playwright/test'
import { restoreSeed } from './seed'

test('Insights shows what gives and drains energy, flow, context and small joys', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))
  await page.goto('./#/insights')
  await page.getByRole('button', { name: '7 days' }).click()

  // Headline numbers: 17 activities over 5 of the last 7 days, 3 flow moments.
  const kpis = page.locator('.kpi-row')
  await expect(kpis.locator('.stat-tile', { hasText: 'Activities' })).toContainText('17')
  await expect(kpis.locator('.stat-tile', { hasText: 'Days logged' })).toContainText('5')
  await expect(kpis.locator('.stat-tile', { hasText: 'Flow moments' })).toContainText('3')

  const section = (title: string) => page.locator('section.card', { has: page.getByRole('heading', { name: title, exact: true }) })
  await expect(section('What gives you energy').locator('.bar-row')).toHaveText([/Deep work on the report\s*\+2\.0 · 5×/, /Evening run\s*\+1\.0 · 3×/])
  await expect(section('What drains you').locator('.bar-row')).toHaveText([/Commute\s*−2\.0 · 4×/, /Team meeting\s*−1\.0 · 4×/])
  // Cooking dinner was logged only once, so it isn't ranked.
  await expect(page.getByText('Cooking dinner')).toHaveCount(0)
  await expect(section('Where you find flow')).toContainText('Deep work on the report · flow 3 of 5 times')
  await expect(section('Context').locator('.context-group', { hasText: 'Where' }).locator('.bar-row')).toHaveText([
    /Home\s*\+2\.0 · 5×/,
    /Office\s*−1\.0 · 4×/,
  ])
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
})
