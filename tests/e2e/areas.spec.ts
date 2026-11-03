import { expect, type Page, test } from '@playwright/test'
import { entryButton, expectNoScores } from './helpers'
import { backupWith, freeWriting, restoreBackup } from './seed'

// Life areas (v0.16) with the real model, in WebKit at iPhone size, on fictional free writing from the last ten days.
// The model's files come from this site (the build refuses without them: npm run model).

const MODEL_TIME = 90_000

const WRITING = [
  ['m1', 'Trading review for the week: 7 trades, 3 winners. Two losses were revenge trades after the Tuesday stop-out.'],
  ['m2', "Rent went up by 120 a month. Need to redo the budget, cut the subscriptions I don't use."],
  ['m3', 'Salary came in, moved 500 into the index fund and 200 into savings.'],
  ['m4', 'Electricity bill was 230 this quarter, almost double last year.'],
  ['h1', 'Ran 5k in 27 minutes, best this year. Knees a bit sore.'],
  ['h2', 'Doctor said the blood pressure is borderline. Less salt, more walking, check again in three months.'],
  ['h3', 'Caught the flu. Fever, aching, stayed in bed all day with tea.'],
  ['s1', 'ok day.'],
] as const

const areasBackup = () => backupWith({ entries: WRITING.map(([id, note], i) => freeWriting(id, note, i + 1)) })

/** Every request the page and its workers make. */
function watchRequests(page: Page) {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  return urls
}

/** Money and Health written about on 3 of the same days (and each on others), Work on the days between: a line between them. */
const MAP_WRITING: readonly (readonly [string, string, number])[] = [
  ['mm1', 'Trading review for the week: 7 trades, 3 winners. Two losses were revenge trades after the Tuesday stop-out.', 1],
  ['mm2', "Rent went up by 120 a month. Need to redo the budget, cut the subscriptions I don't use.", 2],
  ['mm3', 'Salary came in, moved 500 into the index fund and 200 into savings.', 3],
  ['mm4', 'Electricity bill was 230 this quarter, almost double last year.', 4],
  ['mh1', 'Ran 5k in 27 minutes, best this year. Knees a bit sore.', 1],
  ['mh2', 'Doctor said the blood pressure is borderline. Less salt, more walking, check again in three months.', 2],
  ['mh3', 'Caught the flu. Fever, aching, stayed in bed all day with tea.', 3],
  ['mh4', 'Went to the gym and did a workout, then stretched and slept well.', 9],
  ['mw1', 'Manager moved the deadline up by a week without asking anyone. The whole team is annoyed.', 5],
  ['mw2', 'Performance review went better than expected. She said I should go for the senior role next cycle.', 6],
  ['mw3', 'Three hours of meetings and none of them needed me. Got nothing done on the actual project.', 7],
  ['mw4', 'Presented the quarterly roadmap to the directors. Nervous at first but the questions were fair.', 8],
]

const areasSection = (page: Page) => page.getByRole('region', { name: 'Life areas' })

test.describe('life areas', () => {
  test.use({ serviceWorkers: 'block' })

  test('Insights offers them; turned on, writing sorts itself, each area opens to its entries, and nothing leaves this site', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(180_000)
    const urls = watchRequests(page)
    await restoreBackup(page, testInfo.outputPath('areas.json'), areasBackup())
    await page.goto('./#/insights')
    const section = areasSection(page)
    await expect(section.getByText('Sort what you write into areas?')).toBeVisible()
    await section.getByRole('button', { name: 'Turn on' }).click()

    const money = section.locator('summary', { hasText: /^Money · \d+ entries$/ })
    await expect(money).toBeVisible({ timeout: MODEL_TIME })
    await expect(section.locator('summary', { hasText: /^Health · \d+ entries$/ })).toBeVisible()
    await money.click()
    // Each entry by how it starts (its title is the area, the same on every line).
    await expect(section.getByRole('button', { name: /Salary came in/ })).toBeVisible()
    await expectNoScores(page, 'Insights with life areas')

    // Rows are named by their area; a one-liner stays "Free writing".
    await page.goto('./#/entries')
    await expect(entryButton(page, 'Money')).not.toHaveCount(0)
    await expect(entryButton(page, 'Health')).not.toHaveCount(0)
    await expect(entryButton(page, 'Free writing')).toHaveCount(1)

    const site = new URL(baseURL!).origin
    expect(urls.filter((u) => !u.startsWith(site) && !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([])
  })

  test('the map of your thinking joins areas written about on the same days, opens to the entries, and shows no score', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await restoreBackup(page, testInfo.outputPath('map.json'), backupWith({ entries: MAP_WRITING.map(([id, note, ago]) => freeWriting(id, note, ago)) }))
    await page.goto('./#/insights')
    const areas = areasSection(page)
    await expect(areas.getByText('Sort what you write into areas?')).toBeVisible()
    // Without life areas on there is no map.
    await expect(page.getByRole('region', { name: 'Map of your thinking' })).toHaveCount(0)
    await areas.getByRole('button', { name: 'Turn on' }).click()

    const map = page.getByRole('region', { name: 'Map of your thinking' })
    await expect(map).toBeVisible({ timeout: MODEL_TIME })
    await expect(map.getByText('Tap an area.')).toBeVisible()
    await expect(map.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')

    // A dot says what it holds and what came up with it on the same days.
    await map.getByRole('button', { name: /^Money: 4 entries$/ }).click()
    await expect(map.getByText(/^Money: 4 entries\. With Health on 3 days$/)).toBeVisible()
    await expect(map.getByRole('button', { name: /Salary came in/ })).toBeVisible()

    // The line is in words and opens to its entries.
    const line = map.locator('summary', { hasText: /^Health and Money · 3 days$/ })
    await line.click()
    await expect(map.getByRole('button', { name: /Caught the flu/ })).toBeVisible()

    await map.getByText('Show as table').click()
    await expect(map.getByRole('row', { name: /Money 4 Health 3/ })).toBeVisible()

    await map.getByRole('button', { name: 'All time' }).click()
    await expect(map.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true')
    await expect(map.getByRole('button', { name: /^Health: 4 entries$/ })).toBeVisible()
    await expectNoScores(page, 'Insights with the map')
  })
})
