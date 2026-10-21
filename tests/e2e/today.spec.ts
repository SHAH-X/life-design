import { expect, test } from '@playwright/test'
import { addEntry, entryButton } from './helpers'

// Fictional example data.
test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

test('log, edit and delete activities, and keep a small joy', async ({ page }) => {
  await expect(page.getByText('Nothing logged yet today.')).toBeVisible()

  await addEntry(page, { activity: 'Repotted the balcony plants', engagement: 'Absorbed', energy: 'Energised', flow: true, where: 'Balcony' })
  const plants = entryButton(page, 'Repotted the balcony plants')
  await expect(plants).toContainText('+2')
  await expect(plants).toContainText('5/5')
  await expect(plants).toContainText('Flow')
  await expect(plants).toContainText('Balcony')

  // Recent activities appear as quick picks, and Save waits for both ratings.
  await page.getByRole('button', { name: '+ Add activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByRole('button', { name: 'Repotted the balcony plants' }).click()
  await expect(sheet.getByLabel('What did you do?')).toHaveValue('Repotted the balcony plants')
  await sheet.getByLabel('What did you do?').fill('Answered emails')
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
  await sheet.getByRole('radio', { name: 'Bored', exact: true }).check()
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
  await sheet.getByRole('radio', { name: 'A bit drained', exact: true }).check()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(entryButton(page, 'Answered emails')).toContainText('−1')

  // Edit
  await entryButton(page, 'Answered emails').click()
  const edit = page.getByRole('dialog', { name: 'Edit activity' })
  await edit.getByRole('radio', { name: 'Drained', exact: true }).check()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(entryButton(page, 'Answered emails')).toContainText('−2')

  // Delete (with confirmation)
  await entryButton(page, 'Answered emails').click()
  await edit.getByRole('button', { name: 'Delete' }).click()
  await edit.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(entryButton(page, 'Answered emails')).toHaveCount(0)

  // The small joy saves by itself and survives a reload, as do the entries.
  await page.getByLabel('Small joy').fill('Sun on the balcony at breakfast')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Small joy')).toHaveValue('Sun on the balcony at breakfast')
  await expect(entryButton(page, 'Repotted the balcony plants')).toBeVisible()
})

test('log an activity for yesterday', async ({ page }) => {
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeEnabled()
  await addEntry(page, { activity: 'Evening walk', engagement: 'Engaged', energy: 'A bit energised' })
  await expect(entryButton(page, 'Evening walk')).toBeVisible()

  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()
  await expect(entryButton(page, 'Evening walk')).toHaveCount(0)
})
