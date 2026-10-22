import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, type Page, type TestInfo, test } from '@playwright/test'
import { addEntry, entryButton, eveningQuestion, smallJoy, useDownloadsInsteadOfShareSheet } from './helpers'

// Fictional example data.
const V1_FIXTURE = fileURLToPath(new URL('../fixtures/v1-backup.json', import.meta.url))

test.beforeEach(async ({ page }) => {
  await useDownloadsInsteadOfShareSheet(page)
})

async function backUp(page: Page, testInfo: TestInfo, password?: string): Promise<string> {
  await page.goto('./#/more/backup')
  await page.getByRole('button', { name: 'Back up now' }).click()
  const dialog = page.getByRole('dialog', { name: 'Back up' })
  if (password) {
    await dialog.getByRole('switch', { name: /Protect with a password/ }).check()
    await dialog.getByLabel('Password', { exact: true }).fill(password)
    await dialog.getByLabel('Repeat password').fill(password)
    await dialog.getByRole('button', { name: 'Protect the file' }).click()
  }
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download file' }).click()
  const download = await downloading
  const path = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(path)
  await expect(dialog.getByText('✓ Backup saved.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  return path
}

async function deleteEverything(page: Page) {
  await page.goto('./#/more/delete')
  await page.getByRole('button', { name: 'Delete everything on this phone…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete everything?' })
  await dialog.getByLabel('I understand').check()
  await Promise.all([page.waitForEvent('load'), dialog.getByRole('button', { name: 'Delete everything' }).click()])
}

async function openRestore(page: Page, file: string) {
  await page.goto('./#/more/backup')
  await page.getByRole('button', { name: 'Restore from a backup file' }).click()
  const dialog = page.getByRole('dialog', { name: 'Restore' })
  await dialog.locator('input[type="file"]').setInputFiles(file)
  return dialog
}

test('back up, delete everything, then restore it all', async ({ page }, testInfo) => {
  await page.goto('./#/today')
  await addEntry(page, { activity: 'Choir rehearsal', during: ['Absorbed', 'Time flew'], after: ['Energised'], note: 'The new piece finally clicked' })
  await addEntry(page, { activity: 'Tax paperwork', during: ['Bored'], after: ['Drained'] })
  await smallJoy(page).fill('A neighbour waved')
  await expect(page.locator('section.evening .evening-field').first().getByText('Saved')).toBeVisible()
  await eveningQuestion(page).locator('textarea').fill('Singing with others lifts me')
  await expect(eveningQuestion(page).getByText('Saved')).toBeVisible()

  const file = await backUp(page, testInfo)
  const backup = JSON.parse(await readFile(file, 'utf8'))
  expect(backup).toMatchObject({ app: 'life-design', kind: 'backup', schemaVersion: 5 })
  expect(backup.data.entries).toHaveLength(2)
  expect(backup.data.entries.map((e: { during: string[]; after: string[] }) => [e.during, e.after])).toContainEqual([['Absorbed', 'Time flew'], ['Energised']])
  expect(backup.data.days).toHaveLength(1)
  expect(backup.data.answers).toHaveLength(1)

  // The 7-day reminder now counts from this backup.
  await expect(page.getByText(/^Last backup: /)).toBeVisible()

  await deleteEverything(page)
  await page.goto('./#/today')
  await expect(page.getByText('Start with one thing you did.')).toBeVisible()

  const dialog = await openRestore(page, file)
  await expect(dialog.getByText('Journal entries: 2 new')).toBeVisible()
  await expect(dialog.getByText('Small joys: 1 new')).toBeVisible()
  await expect(dialog.getByText('Evening answers: 1 new')).toBeVisible()
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(dialog.getByText('✓ Restored.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await page.goto('./#/today')
  await expect(entryButton(page, 'Choir rehearsal')).toContainText('The new piece finally clicked')
  await expect(entryButton(page, 'Tax paperwork')).toBeVisible()
  await expect(smallJoy(page)).toHaveValue('A neighbour waved')
  await expect(eveningQuestion(page).locator('textarea')).toHaveValue('Singing with others lifts me')

  // Restoring the same file again adds nothing.
  const again = await openRestore(page, file)
  await expect(again.getByText('Nothing new in this file')).toBeVisible()
})

test('a password-protected backup opens only with the right password', async ({ page }, testInfo) => {
  await page.goto('./#/today')
  await addEntry(page, { activity: 'Pottery class', during: ['Focused'], after: ['Satisfied'] })
  const file = await backUp(page, testInfo, 'a long test password')
  const text = await readFile(file, 'utf8')
  expect(text).toContain('"kind":"locked-backup"')
  expect(text).not.toContain('Pottery class')

  await deleteEverything(page)
  const dialog = await openRestore(page, file)
  await dialog.getByLabel('Password').fill('the wrong password')
  await dialog.getByRole('button', { name: 'Unlock' }).click()
  await expect(dialog.getByText(/That password didn't open this file/)).toBeVisible()

  await dialog.getByLabel('Password').fill('a long test password')
  await dialog.getByRole('button', { name: 'Unlock' }).click()
  await expect(dialog.getByText('Journal entries: 1 new')).toBeVisible()
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(dialog.getByText('✓ Restored.')).toBeVisible()
})

test('a backup from the earlier v1 app is converted and restored', async ({ page }) => {
  const dialog = await openRestore(page, V1_FIXTURE)
  await expect(dialog.getByText(/From the earlier v1 app/)).toBeVisible()
  await expect(dialog.getByText(/1 unreadable items will be left out/)).toBeVisible()
  await expect(dialog.getByText('Journal entries: 2 new')).toBeVisible()
  await expect(dialog.getByText('Ikigai items: 1 new')).toBeVisible()
  await expect(dialog.getByText('Odyssey Plans: 1 new')).toBeVisible()
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(dialog.getByText('✓ Restored.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await page.goto('./#/more/phone')
  await expect(page.getByText('2 entries, 0 small joys')).toBeVisible()

  // v1 ranked Ikigai items "x/4"; here they sit in a group, in words.
  await page.goto('./#/design/ikigai')
  const close = page.locator('section', { has: page.getByRole('heading', { name: 'Close to Ikigai', exact: true }) })
  await expect(close).toContainText('Teaching beginners')
  await expect(close).toContainText('Not yet: could be paid for it')
  await expect(page.locator('main')).not.toContainText(/\d\s*\/\s*4/)
})

test('choosing the wrong kind of file says exactly what it is', async ({ page }, testInfo) => {
  const csv = testInfo.outputPath('life-design-entries.csv')
  await writeFile(csv, '﻿date,part_of_day,activity,engagement_1_to_5\r\n2026-10-20,morning,Run,4\r\n')
  let dialog = await openRestore(page, csv)
  await expect(dialog.getByRole('alert')).toContainText('This is the spreadsheet (CSV) export')
  await expect(dialog.getByRole('alert')).toContainText('File: life-design-entries.csv')

  const page404 = testInfo.outputPath('backup.json')
  await writeFile(page404, '<!DOCTYPE html><html><body>Not found</body></html>')
  dialog = await openRestore(page, page404)
  await expect(dialog.getByRole('alert')).toContainText('This is a web page, not a backup')
})

test('activities export as a CSV spreadsheet', async ({ page }, testInfo) => {
  await page.goto('./#/today')
  await addEntry(page, { activity: 'Choir rehearsal', during: ['Absorbed', 'Time flew'], after: ['Energised'], where: 'Church hall' })
  await page.goto('./#/more/export')
  await page.getByRole('button', { name: 'Export activities (CSV)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Spreadsheet export' })
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download file' }).click()
  const path = testInfo.outputPath('entries.csv')
  await (await downloading).saveAs(path)
  const lines = (await readFile(path, 'utf8')).replace(/^﻿/, '').trimEnd().split('\r\n')
  expect(lines[0]).toMatch(/^date,part_of_day,activity,/)
  expect(lines).toHaveLength(2)
  expect(lines[1]).toContain(',Choir rehearsal,Absorbed; Time flew,Energised,5,2,yes,Church hall,')
})
