import { expect, test } from '@playwright/test'
import { restoreSeed } from './seed'

test('Insights shows what gives and takes energy, when time flew, context and small joys', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))
  await page.goto('./#/insights/patterns')
  await page.getByRole('button', { name: '7 days' }).click()

  // Headline, in words: logged on 5 of the last 7 days, a mixed week, time flew 3 times.
  const kpis = page.locator('.kpi-row')
  await expect(kpis.locator('.stat-tile', { hasText: 'Logged on' })).toContainText('5 days')
  await expect(kpis.locator('.stat-tile', { hasText: 'Energy' })).toContainText('Mixed')
  await expect(kpis.locator('.stat-tile', { hasText: 'Time flew' })).toContainText('3 times')

  const section = (title: string) => page.locator('section.card', { has: page.getByRole('heading', { name: title, exact: true }) })
  const ranked = (title: string) => page.locator('.rank-group', { has: page.getByRole('heading', { name: title, exact: true }) })
  await expect(ranked('Gives energy').locator('.bar-row')).toHaveText([
    /Deep work on the report\s*almost always · 5 times/,
    /Evening run\s*almost always · 3 times/,
  ])
  await expect(ranked('Takes energy').locator('.bar-row')).toHaveText([/Commute\s*almost always · 4 times/, /Team meeting\s*almost always · 4 times/])
  // Cooking dinner was logged only once, so it isn't ranked.
  await expect(page.locator('.bar-label', { hasText: 'Cooking dinner' })).toHaveCount(0)
  // Words first: what gives and takes energy sits above the summary and the chart.
  const top = async (l: ReturnType<typeof page.locator>) => (await l.boundingBox())?.y ?? Number.POSITIVE_INFINITY
  expect(await top(page.getByRole('heading', { name: 'Gives energy', exact: true }))).toBeLessThan(await top(kpis))
  expect(await top(kpis)).toBeLessThan(await top(page.getByRole('group', { name: 'Chart' })))
  await expect(section('Time flew')).toContainText('Deep work on the report · 3 of 5 times')

  // Context shows one list at a time: Where first, then With whom.
  const context = section('Energy by context')
  await expect(context.locator('.bar-row')).toHaveText([/Home\s*almost always gives energy · 5 times/, /Office\s*almost always takes energy · 4 times/])
  await context.getByRole('button', { name: 'With whom' }).click()
  await expect(context.locator('.bar-row')).toHaveText([/Alex\s*almost always takes energy · 4 times/])
  // Long words must never squeeze a name into one letter per line (seen once while building Phase 2.6).
  for (const label of await page.locator('.bar-label').all()) {
    expect((await label.boundingBox())?.width ?? 0).toBeGreaterThan(80)
  }
  await expect(section('Small joys')).toContainText('coffee · twice')
  await expect(section('Small joys')).toContainText('sun · twice')
})

test('the energy chart reads out a day when tapped, and opens as a table', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))
  await page.goto('./#/insights/patterns')
  await page.getByRole('button', { name: '7 days' }).click()
  const chart = page.locator('figure.chart', { hasText: 'Energy by day' })
  await expect(chart.locator('.chart-readout')).toContainText('Mixed')
  await expect(chart.locator('path.chart-col')).not.toHaveCount(0)

  // Yesterday: deep work and the run gave energy, the meeting and the commute took it: mixed, over 4 activities.
  await chart.getByRole('button', { name: /: mixed · 4 activities$/ }).last().click()
  await expect(chart.locator('.chart-readout')).toContainText('mixed · 4 activities')

  await chart.getByText('Show as table').click()
  await expect(chart.locator('table tbody tr')).toHaveCount(7)
  await expect(chart.locator('table')).toContainText('mostly energising')

  // How into it you were has its own chart and scale, one tap away.
  await page.getByRole('group', { name: 'Chart' }).getByRole('button', { name: 'Into it' }).click()
  await expect(page.locator('figure.chart', { hasText: 'Into it by day' })).toBeVisible()
  await expect(page.locator('figure.chart', { hasText: 'Energy by day' })).toHaveCount(0)
})
