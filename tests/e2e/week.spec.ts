import { expect, test } from '@playwright/test'
import { addEntry } from './helpers'
import { restoreSeed } from './seed'

// The weekly review is put together automatically (Phase 4). A fixed Saturday, so the fictional five days before
// it (Monday 19 to Friday 23 October 2026) all fall in one week.
const SATURDAY = new Date(2026, 9, 24, 20, 0)

test('Insights opens on this week, put together from what you wrote, with nothing to fill in', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(SATURDAY)
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)
  await page.goto('./#/insights')
  const week = page.getByRole('region', { name: 'This week' })
  await expect(week).toContainText('17 entries on 5 days')
  // The week's energy, day by day (what gives and uses it up is in the last 30 days, said once).
  await expect(week.getByText('Energy, day by day')).toBeVisible()
  await expect(week.locator('details.week-line', { hasText: 'Deep work on the report' })).toHaveCount(0)
  // What stood out lists each activity once, and each opens.
  const stood = week.getByRole('list', { name: 'What stood out' })
  await expect(stood.getByRole('button', { name: /^Deep work on the report/ })).toHaveCount(1)
  await stood.getByRole('button', { name: /^Deep work on the report/ }).click()
  const opened = page.getByRole('dialog', { name: 'Deep work on the report' })
  await expect(opened).toBeVisible()
  await opened.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(opened).toBeHidden()

  // Nothing to fill in: the box to carry into next week is gone (v0.13); next steps do that job.
  await expect(page.locator('main textarea, main input')).toHaveCount(0)
})

test("the week's feelings open their entries; next steps show in their own card", async ({ page }) => {
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
  const steps = page.getByRole('region', { name: 'Next steps' })
  await expect(steps).toContainText('Ask for an agenda first')
  await expect(steps.getByRole('link', { name: 'All next steps ›' })).toBeVisible()

  // A feeling is a line like every other: it opens to its entries, and each of those opens.
  const feeling = week.locator('details.week-line', { hasText: 'frustrated' })
  await expect(feeling.locator('summary')).toHaveText(/^frustrated · twice/)
  await feeling.locator('summary').click()
  const behind = feeling.locator('.evidence-list').getByRole('button')
  await expect(behind).toHaveCount(2)
  await expect(feeling.locator('.evidence-list')).toContainText('Team meeting')
  await expect(feeling.locator('.evidence-list')).toContainText('Commute')
  await behind.filter({ hasText: 'Commute' }).click()
  await expect(page.getByRole('dialog', { name: 'Commute' })).toBeVisible()
})

test('earlier weeks are a page of their own, each put together the same way, with a note kept to carry on', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 9, 28, 20, 0)) // the Wednesday after
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)
  // A note written in the box before v0.13, to carry into the next week.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('life-design')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const tx = request.result.transaction('weeks', 'readwrite')
          tx.objectStore('weeks').put({ id: '2026-10-19', carry: 'Walk at lunch', createdAt: 1, updatedAt: 1 })
          tx.oncomplete = () => {
            request.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
  )
  await page.goto('./#/insights')
  await expect(page.getByRole('region', { name: 'This week' })).toContainText('Nothing written this week yet')
  await page.getByRole('link', { name: 'Earlier weeks' }).click()
  await expect(page).toHaveURL(/#\/insights\/weeks$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Earlier weeks' })).toBeVisible()
  const first = page.getByRole('navigation', { name: 'Earlier weeks' }).getByRole('link').first()
  await expect(first).toContainText('17 entries on 5 days')
  await first.click()
  await expect(page).toHaveURL(/#\/insights\/week-2026-10-19$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Your week' })).toBeVisible()
  await expect(page.locator('main')).toContainText('17 entries on 5 days')
  // The note shows as written, read-only.
  const carried = page.locator('.card', { has: page.getByRole('heading', { name: 'To carry into the next week' }) })
  await expect(carried).toContainText('Walk at lunch')
  await expect(page.locator('main textarea, main input')).toHaveCount(0)
  await page.getByRole('link', { name: '‹ Earlier weeks' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Earlier weeks' })).toBeVisible()
})
