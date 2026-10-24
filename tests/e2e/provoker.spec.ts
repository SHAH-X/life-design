import { expect, type Page, test } from '@playwright/test'
import { backupWith, freeWriting, restoreBackup } from './seed'

// The provoker (v0.16): one question a day above Today's box, from your own writing. Fictional example data. A next
// step left for 5 weeks needs no model; an open loop needs search by meaning's (real, from this site).

const DAY = 86_400_000

function staleStep(text: string, now = Date.now()) {
  const at = now - 35 * DAY
  return { id: 'st1', text, when: '', kind: 'once', status: 'active', entryIds: [], activity: '', createdAt: at, updatedAt: at, finishedAt: null }
}

const question = (page: Page) => page.getByRole('region', { name: 'A question from your writing' })
const box = (page: Page) => page.getByRole('button', { name: /^What's on your mind\?/ })

test.describe('the provoker', () => {
  test.use({ serviceWorkers: 'block' })

  test('asks about a next step left for weeks; a tap answers it in the writer, which keeps the question', async ({ page }, testInfo) => {
    await restoreBackup(page, testInfo.outputPath('step.json'), backupWith({ steps: [staleStep('Ask for an agenda first')] }))
    await page.goto('./#/today')
    const ask = question(page).getByRole('button', { name: /^“Ask for an agenda first” hasn't come up for 5 weeks\. Still want to\?$/ })
    await ask.click()
    const sheet = page.getByRole('dialog', { name: 'Write freely' })
    const answer = sheet.getByLabel(/Ask for an agenda first/)
    await expect(answer).toBeFocused()
    await answer.fill('Yes, I still want it: tried it once and the meeting was shorter.')
    await sheet.getByRole('button', { name: 'Save' }).click()
    const saved = page.getByRole('dialog', { name: 'Free writing' })
    await expect(saved.getByText(/Ask for an agenda first/)).toBeVisible() // the question, as the part's label
    await saved.getByRole('button', { name: 'Done', exact: true }).click()
    // Answered: nothing more today, even after a reload.
    await expect(question(page)).toHaveCount(0)
    await page.reload()
    await expect(box(page)).toBeVisible()
    await expect(question(page)).toHaveCount(0)
  })

  test('"Not now" leaves it for the rest of the day', async ({ page }, testInfo) => {
    await restoreBackup(page, testInfo.outputPath('step.json'), backupWith({ steps: [staleStep('Ask for an agenda first')] }))
    await page.goto('./#/today')
    await question(page).getByRole('button', { name: 'Not now' }).click()
    await expect(question(page)).toHaveCount(0)
    await page.reload()
    await expect(box(page)).toBeVisible()
    await expect(question(page)).toHaveCount(0)
  })

  test('"Done already" finishes the next step, as "I did it" in Insights does', async ({ page }, testInfo) => {
    await restoreBackup(page, testInfo.outputPath('step.json'), backupWith({ steps: [staleStep('Walk after dinner')] }))
    await page.goto('./#/today')
    await question(page).getByRole('button', { name: 'Done already' }).click()
    await expect(question(page)).toHaveCount(0)
    await page.goto('./#/insights/steps')
    await expect(page.getByText(/Walk after dinner/)).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Not touched lately' })).toHaveCount(0)
  })

  test('asks about an open loop not written about since, quoting your words; not one you wrote about again', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    // Written about again: 0.75 close with the real model (a weaker pair, 0.63, stays asked about: the safe way to err).
    const entries = [
      freeWriting('loop', 'Electricity bill was 230 this quarter. Need to compare tariffs this weekend.', 12),
      freeWriting('again', 'Compared the energy tariffs this weekend and switched supplier: the new fixed tariff saves 30 a month.', 6),
      freeWriting('open', 'Promised Mum I would visit more often, at least once a month.', 9),
      freeWriting('other', 'Long run by the river, 8k. Knees held up fine.', 4),
    ]
    await restoreBackup(page, testInfo.outputPath('loops.json'), backupWith({ entries }))
    await page.goto('./#/more/meaning')
    await page.getByRole('switch', { name: /Find entries by meaning/ }).check()
    // The loops' numbers are worked out in the background; a question that comes up meanwhile waits for the next
    // visit to Today, so visit until it's there. Loops, steps and quiet areas take turns by day: with only loops, a loop.
    await expect(async () => {
      await page.goto('./#/insights')
      await page.goto('./#/today')
      await expect(question(page).getByRole('button').first()).toHaveText(
        /you wrote “Promised Mum I would visit more often, at least once a month”\. Where are you with it\?$/,
        { timeout: 2000 },
      )
    }).toPass({ timeout: 120_000 })
  })
})
