import { expect, type Page, test } from '@playwright/test'
import { addEntry, entryButton, swipe } from './helpers'

// Swipe left to delete, as in iOS Messages (v0.10), with Undo for a few seconds. Fictional example data.

const deleteButton = (page: Page, title: string) => page.getByRole('button', { name: `Delete ${title}` })

test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

test('swipe left on an entry to show Delete; it goes at once, and Undo brings it back', async ({ page }) => {
  await addEntry(page, { activity: 'Team meeting', energy: 'It used up my energy' })
  await addEntry(page, { activity: 'Evening run' })

  await swipe(page, entryButton(page, 'Team meeting'), -150)
  // A swipe isn't a tap: the entry didn't open.
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await deleteButton(page, 'Team meeting').click()
  await expect(entryButton(page, 'Team meeting')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Entry deleted' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(entryButton(page, 'Team meeting')).toContainText('used up energy')

  // In Entries too; without Undo it's gone for good.
  await page.goto('./#/entries')
  await swipe(page, entryButton(page, 'Evening run'), -150)
  await deleteButton(page, 'Evening run').click()
  await expect(entryButton(page, 'Evening run')).toHaveCount(0)
  await page.reload()
  await expect(entryButton(page, 'Team meeting')).toBeVisible()
  await expect(entryButton(page, 'Evening run')).toHaveCount(0)
})

test('a short swipe or a vertical drag leaves Delete hidden; a tap on an open row closes it', async ({ page }) => {
  await addEntry(page, { activity: 'Team meeting' })
  const row = entryButton(page, 'Team meeting')

  await swipe(page, row, -30)
  await expect(deleteButton(page, 'Team meeting')).toHaveCount(0)
  await swipe(page, row, -10, 80)
  await expect(deleteButton(page, 'Team meeting')).toHaveCount(0)

  await swipe(page, row, -150)
  await expect(deleteButton(page, 'Team meeting')).toBeVisible()
  await row.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(deleteButton(page, 'Team meeting')).toHaveCount(0)
  // Closed again, a tap opens the entry.
  await row.click()
  await expect(page.getByRole('dialog', { name: 'Team meeting' })).toBeVisible()
})
