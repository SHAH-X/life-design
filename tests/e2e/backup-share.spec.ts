import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { addEntry, captureShareSheet, sharedFile } from './helpers'

// The iPhone path: the backup leaves through the share sheet ("Save to Files"), with a password and with the
// characters an iPhone keyboard produces (emoji, curly quotes, dashes). Fictional example data.
test('a password-protected backup saved through the share sheet restores, emoji and all', async ({ page }, testInfo) => {
  await captureShareSheet(page)
  await page.goto('./#/today')
  await addEntry(page, {
    activity: 'Coffee ☕️ with “Sam” — it’s been ages',
    engagement: 'Absorbed',
    energy: 'Energised',
    note: 'Talked for hours… felt great 🙌',
  })
  await page.getByLabel('Small joy').fill('Sunset 🌅 over the river · 日本語')
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  await page.goto('./#/more')
  await page.getByRole('button', { name: 'Back up now' }).click()
  const dialog = page.getByRole('dialog', { name: 'Back up' })
  // Without a password the file is ready straight away: one tap saves it.
  await expect(dialog.getByRole('button', { name: 'Save or share…' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Download/ })).toHaveCount(0)

  await dialog.getByRole('switch', { name: /Protect with a password/ }).check()
  await dialog.getByLabel('Password', { exact: true }).fill('Pa55 wörd—“quoted”')
  await dialog.getByLabel('Repeat password').fill('Pa55 wörd—“quoted”')
  await dialog.getByRole('button', { name: 'Protect the file' }).click()
  await dialog.getByRole('button', { name: 'Save or share…' }).click()
  await expect(dialog.getByText('✓ Backup saved.')).toBeVisible()

  const shared = await sharedFile(page)
  expect(shared.name).toMatch(/^life-design-backup-\d{4}-\d{2}-\d{2}-locked\.json$/)
  expect(shared.text).not.toContain('Sam')
  const path = testInfo.outputPath(shared.name)
  await writeFile(path, shared.text, 'utf8')
  await dialog.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Restore from a backup file' }).click()
  const restore = page.getByRole('dialog', { name: 'Restore' })
  await restore.locator('input[type="file"]').setInputFiles(path)
  await expect(restore.getByText('This backup is protected with a password.')).toBeVisible()
  await restore.getByLabel('Password').fill('Pa55 wörd—“quoted”')
  await restore.getByRole('button', { name: 'Unlock' }).click()
  await expect(restore.getByText('Journal entries: 1 already here')).toBeVisible()
  await expect(restore.getByText('Small joys: 1 already here')).toBeVisible()
})
