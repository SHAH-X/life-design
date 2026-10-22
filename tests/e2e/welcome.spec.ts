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

test('the welcome asks what journaling is for, with a follow-up, then starts on Today', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('1 of 3')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'What would you like it to help with?' })).toBeVisible()
  const purposes = page.getByRole('radiogroup', { name: 'What would you like it to help with?' })
  await expect(purposes.getByRole('radio')).toHaveCount(7)
  await expect(purposes.getByRole('radio', { name: /^Understand myself/ })).toBeChecked()
  await purposes.getByRole('radio', { name: /^Improve myself/ }).check()
  await page.getByLabel('What would you like to change or improve?').fill('Staying calm in meetings')
  await expect(page.getByText('Saved')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'A nudge each evening?' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(purposes.getByRole('radio', { name: /^Improve myself/ })).toBeChecked()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

  // An entry reflects for that purpose unless changed.
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill('Team meeting')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Skip' }).click()
  await sheet.getByRole('button', { name: 'Skip' }).click()
  await sheet.getByRole('button', { name: 'Skip' }).click()
  await expect(sheet.getByLabel('For')).toHaveValue('grow')
  await expect(sheet.getByLabel('What went well?')).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()

  await page.goto('./#/more/purpose')
  await expect(page.getByRole('radio', { name: /^Improve myself/ })).toBeChecked()
  await expect(page.getByLabel('What would you like to change or improve?')).toHaveValue('Staying calm in meetings')
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
