import { expect, test } from '@playwright/test'
import { addEntry, entryButton, smallJoy } from './helpers'

// Fictional example data.
test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

test('log activities one question at a time, edit and delete them, and keep a small joy', async ({ page }) => {
  await expect(page.getByText('Add the 3–6 main things you did.')).toBeVisible()

  await addEntry(page, { activity: 'Repotted the balcony plants', energy: 'Gave a lot', into: 'Fully', timeFlew: true, where: 'Balcony' })
  const plants = entryButton(page, 'Repotted the balcony plants')
  await expect(plants).toContainText('gave a lot of energy')
  await expect(plants).toContainText('fully into it')
  await expect(plants).toContainText('time flew')
  await expect(plants).toContainText('Balcony')

  // A recent activity is one tap and moves straight on; Back returns to it.
  await page.getByRole('button', { name: '+ Add activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByRole('button', { name: 'Repotted the balcony plants' }).click()
  await expect(sheet.getByRole('heading', { name: 'Did it give you energy, or take it?' })).toBeVisible()
  await sheet.getByRole('button', { name: '‹ Back' }).click()
  await expect(sheet.getByLabel('What did you do?')).toHaveValue('Repotted the balcony plants')
  await sheet.getByLabel('What did you do?').fill('Answered emails')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Took a little', exact: true }).click()
  // "Did time fly?" is asked only after Very or Fully, and the follow-up is worded from the answers.
  await sheet.getByRole('button', { name: 'Not at all', exact: true }).click()
  await expect(sheet.getByLabel('What took your energy?')).toBeVisible()
  await expect(sheet.getByText('Did time fly?')).toHaveCount(0)
  await sheet.getByLabel('What took your energy?').fill('Too many threads at once')
  await sheet.getByRole('button', { name: 'Save' }).click()
  const emails = entryButton(page, 'Answered emails')
  await expect(emails).toContainText('took a little energy')
  await expect(emails).toContainText('Too many threads at once')

  // Editing shows every answer on one screen.
  await emails.click()
  const edit = page.getByRole('dialog', { name: 'Edit activity' })
  await expect(edit.getByRole('button', { name: 'Took a little', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await edit.getByRole('button', { name: 'Took a lot', exact: true }).click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(emails).toContainText('took a lot of energy')

  // Delete (with confirmation)
  await emails.click()
  await edit.getByRole('button', { name: 'Delete' }).click()
  await edit.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(emails).toHaveCount(0)

  // The small joy saves by itself and survives a reload, as do the entries.
  await smallJoy(page).fill('Sun on the balcony at breakfast')
  await expect(page.locator('section.evening .evening-field').first().getByText('Saved')).toBeVisible()
  await page.reload()
  await expect(smallJoy(page)).toHaveValue('Sun on the balcony at breakfast')
  await expect(entryButton(page, 'Repotted the balcony plants')).toBeVisible()
})

test('ⓘ explains each question, and a quick double tap never answers the next one', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill('Choir rehearsal')
  await sheet.getByRole('button', { name: 'Next' }).click()

  const info = sheet.getByRole('button', { name: 'What does energy mean?' })
  await info.click()
  await expect(sheet.getByText(/How did you come out of it/)).toBeVisible()
  await info.click()
  await expect(sheet.getByText(/How did you come out of it/)).toBeHidden()

  // Tap an answer, then tap the same spot again just after the next question appears.
  const gave = sheet.getByRole('button', { name: 'Gave a lot', exact: true })
  const box = await gave.boundingBox()
  if (!box) throw new Error('answer button not on screen')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.click(x, y)
  await page.waitForFunction(() => document.querySelector('dialog[open] h2.question-text')?.textContent === 'How into it were you?', undefined, {
    polling: 'raf',
  })
  await page.mouse.click(x, y)
  const into = sheet.getByRole('group', { name: 'How into it were you?' })
  await expect(into.getByRole('button', { pressed: true })).toHaveCount(0)
  await expect(sheet.getByRole('heading', { name: 'How into it were you?' })).toBeVisible()

  await sheet.getByRole('button', { name: 'What does into it mean?' }).click()
  await expect(sheet.getByText(/Where was your attention/)).toBeVisible()
})

test('log an activity for yesterday', async ({ page }) => {
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeEnabled()
  await addEntry(page, { activity: 'Evening walk', energy: 'Gave a little', into: 'Very', timeFlew: false })
  await expect(entryButton(page, 'Evening walk')).toContainText('very into it')

  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()
  await expect(entryButton(page, 'Evening walk')).toHaveCount(0)
})

test('a sheet opens on its content, not on ✕ Close', async ({ page }) => {
  // Focus on Close showed a ring on every sheet, and Enter or Space straight away would have closed it.
  await addEntry(page, { activity: 'Reading', energy: 'Gave a little', into: 'Somewhat' })
  await entryButton(page, 'Reading').click()
  const edit = page.getByRole('dialog', { name: 'Edit activity' })
  await expect(edit).toBeVisible()
  await expect(edit.getByRole('button', { name: 'Close' })).not.toBeFocused()
  await edit.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: '+ Add activity' }).click()
  await expect(page.getByRole('dialog', { name: 'New activity' }).getByLabel('What did you do?')).toBeFocused()
})
