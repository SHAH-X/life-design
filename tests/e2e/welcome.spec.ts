import { expect, test } from '@playwright/test'
import { addEntry } from './helpers'

// The start page ('./', as the Home Screen icon opens it) on a new phone shows a short welcome, once.

test('a first open shows a short welcome; Skip goes straight to Today, and it never shows again', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Life Design' })).toBeVisible()
  await expect(page.getByText('A few words is enough. Everything stays on this phone.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()

  // Two example activities show what an entry looks like, with the energy edge.
  const examples = page.getByRole('list', { name: 'Examples' })
  await expect(examples.getByRole('listitem')).toHaveCount(2)
  await expect(examples.locator('.entry-row[data-energy="gives"]')).toContainText('Evening run')
  await expect(examples.locator('.entry-row[data-energy="takes"]')).toContainText('Team meeting')
  await expect(examples.getByRole('button')).toHaveCount(0)

  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test('the welcome sets what the evening question helps with, then starts on Today', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('1 of 3')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'What would you like it to help with?' })).toBeVisible()
  await page.getByRole('switch', { name: /^Feel calmer/ }).uncheck()
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'A nudge each evening?' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('switch', { name: /^Feel calmer/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

  await page.goto('./#/more/evening')
  await expect(page.getByRole('switch', { name: /^Feel calmer/ })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: /^Learn/ })).toBeChecked()
})

test('a reminder can be set from the welcome', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Set a reminder' }).click()
  await expect(page).toHaveURL(/#\/more\/reminders$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Reminders' })).toBeVisible()
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test('the welcome stays out of the way: not on a link to a page, not over a journal, and a backup can be restored instead', async ({
  page,
}) => {
  await page.goto('./#/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await addEntry(page, { activity: 'Reading', during: ['Curious'], after: ['Calm'] })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test('"Have a backup? Restore it" opens Backup and restore', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Restore it' }).click()
  await expect(page).toHaveURL(/#\/more\/backup$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Backup and restore' })).toBeVisible()
})
