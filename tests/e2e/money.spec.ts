import { writeFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'
import { makePdf, type Placed } from '../fixtures/pdf'
import { LLOYDS_LIKE, MONZO_LIKE } from '../fixtures/statements'

// Bank and card statements (v0.20, step 1) in WebKit at iPhone size: a statement's PDF chosen in the app, read on the
// phone by PDF.js in its own worker, its lines kept once each. The statements are fictional, laid out like the owner's
// real Monzo and Lloyds PDFs (tests/fixtures/statements.ts). Nothing may leave this site.

test.use({ serviceWorkers: 'block', locale: 'en-GB' })

async function pdf(path: string, pages: Placed[][]) {
  await writeFile(path, makePdf(pages))
  return path
}

async function bringIn(page: Page, path: string) {
  await page.getByRole('button', { name: 'Bring in a statement' }).click()
  const sheet = page.getByRole('dialog', { name: 'Bring in a statement' })
  await sheet.locator('input[type="file"]').setInputFiles(path)
  return sheet
}

test('a statement’s PDF is read on the phone and its accounts kept, each line once; nothing leaves this site', async ({ page, baseURL }, testInfo) => {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await page.goto('./#/shopping')
  const accounts = page.getByRole('region', { name: 'Your accounts' })
  await expect(accounts.getByText('Bring in your bank and card statements to see all your spending.')).toBeVisible()

  const lloyds = await pdf(testInfo.outputPath('lloyds.pdf'), LLOYDS_LIKE)
  let sheet = await bringIn(page, lloyds)
  await expect(sheet.getByRole('list', { name: 'Brought in' }).getByRole('listitem')).toHaveText([/^Lloyds ···4321: 4 new · 1 ?– ?30 Sept?$/])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(accounts.getByRole('listitem')).toHaveText([/^Lloyds ···4321 · 4 lines · 1 ?– ?30 Sept?$/])

  // The same statement again: nothing new.
  sheet = await bringIn(page, lloyds)
  await expect(sheet.getByRole('listitem')).toHaveText([/^Lloyds ···4321: 4 already here · 1 ?– ?30 Sept?$/])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()

  // Two accounts in one PDF: the current account and a pot.
  sheet = await bringIn(page, await pdf(testInfo.outputPath('monzo.pdf'), MONZO_LIKE))
  await expect(sheet.getByRole('listitem')).toHaveText([/^Monzo ···5678: 9 new · /, /^Monzo Savings pot: 2 new · /])
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(accounts.getByRole('listitem')).toHaveText([/^Lloyds ···4321 · 4 lines/, /^Monzo ···5678 · 9 lines/, /^Monzo Savings pot · 2 lines/])

  const site = new URL(baseURL!).origin
  expect(urls.filter((u) => !u.startsWith(site) && !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([])
})

test('a PDF that isn’t a statement, or isn’t a PDF, is refused saying why, and nothing is kept', async ({ page }, testInfo) => {
  await page.goto('./#/shopping')
  const letter = await pdf(testInfo.outputPath('letter.pdf'), [[{ text: 'Dear customer, your new card is on its way.', x: 57, y: 700 }]])
  const sheet = await bringIn(page, letter)
  await expect(sheet.getByRole('alert')).toHaveText('No transactions were found in this PDF. Choose the statement itself, not a letter or a summary.')
  const notPdf = testInfo.outputPath('notes.pdf')
  await writeFile(notPdf, 'just some words')
  await sheet.locator('input[type="file"]').setInputFiles(notPdf)
  await expect(sheet.getByRole('alert')).toHaveText('This file couldn’t be opened as a PDF. Save the statement from your bank’s app as a PDF and try again.')
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('region', { name: 'Your accounts' }).getByRole('listitem')).toHaveCount(0)
})
