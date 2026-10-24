import { expect, type Page, test } from '@playwright/test'
import { captureBox, swipe } from './helpers'

// Next steps you can manage (v0.11). Fictional example data. Since v0.15 they're kept after writing in Today's box.

test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

/** Writes in Today's box and stays on what it reads back. */
async function write(page: Page, words: string) {
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await sheet.getByLabel("What's on your mind?").fill(words)
  await sheet.getByRole('button', { name: 'Save' }).click()
  return page.getByRole('dialog', { name: 'Free writing' })
}

async function keepStep(page: Page, writing: string, choice: string, words: string, when = '') {
  const view = await write(page, writing)
  await view.getByRole('button', { name: choice }).click()
  await view.getByLabel('What exactly?').fill(words)
  if (when) await view.getByLabel(/^When\?/).fill(when)
  await view.getByRole('button', { name: 'Keep this' }).click()
  return view
}

const stepsPage = (page: Page) => page.goto('./#/insights/steps')

test('a next step joins the list, says where it came from, and a one-off is ticked off there', async ({ page }) => {
  const view = await keepStep(page, 'The team meeting ran over again', 'Try something differently', 'Ask for an agenda first', 'before the meeting')
  await expect(view.getByRole('region', { name: 'Next step' }).getByRole('link', { name: /^Next step/ })).toContainText('Before the meeting: Ask for an agenda first')
  await view.getByRole('button', { name: 'Done', exact: true }).click()

  // In Insights: on the first page, and in the whole list.
  await page.goto('./#/insights')
  await expect(page.getByRole('region', { name: 'Next steps' })).toContainText('Before the meeting: Ask for an agenda first')
  await page.getByRole('link', { name: 'All next steps ›' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Next steps' })).toBeVisible()
  const row = page.getByRole('button', { name: /^Before the meeting: Ask for an agenda first/ })
  await expect(row).toContainText('Once · from Free writing')

  await row.click()
  await page.getByRole('dialog', { name: 'Next step' }).getByRole('button', { name: 'I did it' }).click()
  await expect(page.getByText('Nothing yet.')).toBeVisible()
  await page.getByText('Finished (1)').click()
  await expect(page.getByRole('button', { name: /^Before the meeting: Ask for an agenda first/ })).toContainText('Done')
})

test('keeping a step that looks like one you have joins it, instead of adding another', async ({ page }) => {
  const first = await keepStep(page, 'Evening walk', 'Do it again', 'Walk 10 minutes every evening')
  await first.getByRole('button', { name: 'Done', exact: true }).click()

  const second = await keepStep(page, 'Walk', 'Do it again', 'walk 10 min each evening')
  await expect(second.getByText('Same as “Walk 10 minutes every evening”?')).toBeVisible()
  await second.getByRole('button', { name: 'Same', exact: true }).click()
  await expect(second.getByRole('region', { name: 'Next step' }).getByRole('link', { name: /^Next step/ })).toContainText('Walk 10 minutes every evening')
  await second.getByRole('button', { name: 'Done', exact: true }).click()

  await stepsPage(page)
  const row = page.getByRole('button', { name: /^Walk 10 minutes every evening/ })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Ongoing')
  await row.click()
  const step = page.getByRole('dialog', { name: 'Next step' })
  await expect(step.locator('.evidence-list li')).toHaveCount(2)
})

test('add one by hand, change it, merge two that say the same, and swipe to delete with Undo', async ({ page }) => {
  await stepsPage(page)
  await page.getByRole('button', { name: '+ Add a next step' }).click()
  let sheet = page.getByRole('dialog', { name: 'New next step' })
  await sheet.getByLabel('What will you do?').fill('Read before bed')
  await sheet.getByLabel(/^When\?/).fill('at 10pm')
  await sheet.getByRole('button', { name: 'Ongoing' }).click()
  await sheet.getByRole('button', { name: 'Keep' }).click()
  const reading = page.getByRole('button', { name: /^At 10pm: Read before bed/ })
  await expect(reading).toContainText('Ongoing · added by you')

  // A look-alike, kept anyway, then merged.
  await page.getByRole('button', { name: '+ Add a next step' }).click()
  sheet = page.getByRole('dialog', { name: 'New next step' })
  await sheet.getByLabel('What will you do?').fill('Read for 20 minutes before bed')
  await sheet.getByRole('button', { name: 'Keep' }).click()
  await sheet.getByRole('button', { name: 'Different' }).click()
  const alike = page.getByRole('region', { name: 'These look alike' })
  await expect(alike).toContainText('“Read before bed”')
  await expect(alike).toContainText('“Read for 20 minutes before bed”')
  await alike.getByRole('button', { name: 'Merge' }).click()
  await expect(alike).toHaveCount(0)
  await expect(page.locator('main .entry-list').getByRole('button', { name: /bed/ })).toHaveCount(1)

  // Change it.
  await reading.click()
  sheet = page.getByRole('dialog', { name: 'Next step' })
  await sheet.getByLabel('What will you do?').fill('Read a chapter before bed')
  await sheet.getByRole('button', { name: 'Save' }).click()
  const chapter = page.getByRole('button', { name: /^At 10pm: Read a chapter before bed/ })
  await expect(chapter).toBeVisible()

  // Swipe to delete, then Undo.
  await swipe(page, chapter, -150)
  await page.getByRole('button', { name: 'Delete Read a chapter before bed' }).click()
  await expect(chapter).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(chapter).toBeVisible()
})
