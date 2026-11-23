import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { captureShareSheet, expectNoScores, sharedFile } from './helpers'
import { backupWith, restoreBackup } from './seed'
import { makePdf, type Placed } from '../fixtures/pdf'

// Step 5 (owner-approved plan, 2026-11-23): documents kept on the phone, found by their words, with the dates in them suggested and
// tracked only when you say so. The PDFs are made up here; nothing real is ever kept in the repo.

test.use({ serviceWorkers: 'block', locale: 'en-GB' })

const line = (text: string, y: number, size = 12): Placed => ({ text, x: 40, y, size })
const POLICY = [
  [line('Home insurance policy', 760, 18), line('Policy number EX-0001. Premium 240.00 a year.', 730), line('Policy start date: 12 January 2026', 700), line('Policy renewal date: 12 January 2027', 670)],
  [line('You may cancel within 14 days. After that a notice period of 30 days applies.', 760)],
]

test('Documents: add a PDF, see its dates, track one, link a bill, search its words, view it, send its calendar file, delete it', async ({ page }, testInfo) => {
  const now = new Date(2026, 10, 23, 12, 0)
  await page.clock.setFixedTime(now)
  await captureShareSheet(page)
  const bills = [{ id: 'b1', name: 'Home insurance', kind: 'Insurance', amount: 24000, every: 'year', next: '2027-01-12', renewal: null, method: '', notes: '', payee: null, createdAt: 1, updatedAt: 1 }]
  await restoreBackup(page, testInfo.outputPath('docs.json'), backupWith({ bills }, now))
  const policy = testInfo.outputPath('Home insurance policy.pdf')
  await writeFile(policy, makePdf(POLICY))

  await page.goto('./#/more')
  await expect(page.getByRole('link', { name: /Documents/ })).toContainText('None yet')
  await page.getByRole('link', { name: /Documents/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()
  await expect(page.getByText('Nothing here yet.')).toBeVisible()

  // Added: the type is guessed, its words read, its dates suggested and nothing tracked.
  await page.locator('input[type="file"]').first().setInputFiles(policy)
  const sheet = page.getByRole('dialog', { name: 'Home insurance policy' })
  await expect(sheet).toContainText('PDF · 2 pages')
  await expect(sheet.getByLabel('What kind of document')).toHaveValue('Insurance')
  await expect(sheet).toContainText('Nothing is tracked until you say so.')
  await expect(sheet).toContainText('12 Jan 2026')
  await expect(sheet).toContainText('“Policy start date”')
  await expect(sheet).toContainText('“Policy renewal date”')

  // The renewal is tracked, the start date is not one to track; the tracked date is kept and gone from the suggestions.
  await sheet.locator('li', { hasText: 'Policy renewal date' }).getByRole('button', { name: 'Track as renewal' }).click()
  await sheet.locator('li', { hasText: 'Policy start date' }).getByRole('button', { name: 'Not a date to track' }).click()
  await expect(sheet.locator('.doc-date')).toHaveCount(1)
  await expect(sheet.locator('.doc-date')).toContainText('renewal · tracked')

  // A bill linked, notes kept.
  await sheet.getByLabel('Linked bill').selectOption({ label: 'Home insurance · £240.00 every year' })
  await sheet.getByLabel('Notes').fill('Cancel online, 30 days notice')

  // The calendar file: a one-off event on the tracked day, alerts 30 and 2 days before, the notes inside.
  await sheet.getByRole('button', { name: 'Add the dates to your calendar' }).click()
  const ics = (await sharedFile(page)).text.replace(/\r\n /g, '')
  expect(ics).toContain('SUMMARY:Home insurance policy renews')
  expect(ics).toContain('DTSTART:20270112T090000')
  expect(ics).toContain('TRIGGER:-P30D')
  expect(ics).toContain('TRIGGER:-P2D')
  expect(ics).not.toContain('RRULE')
  expect(ics).toContain('Cancel online\\, 30 days notice')

  // The file is drawn here, page by page, never a link: two pages, and ink on them.
  await sheet.getByRole('button', { name: 'View it here' }).click()
  await expect(sheet.locator('.pdf-pages canvas')).toHaveCount(2)
  await expect(sheet.getByRole('status')).toHaveCount(0)
  const inked = await sheet.locator('.pdf-pages canvas').first().evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    for (let i = 0; i < data.length; i += 4) if (data[i]! < 128) return true
    return false
  })
  expect(inked).toBe(true)

  // Sent through the share menu as the same PDF it was added as.
  await sheet.getByRole('button', { name: 'Send it…' }).click()
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string } }).__shared.name)
  expect(shared).toBe('Home insurance policy.pdf')
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()

  // Needs a look: the tracked date is 50 days off, with the bill beside it.
  const look = page.getByRole('region', { name: 'Needs a look' })
  await expect(look).toContainText('Home insurance policy')
  await expect(look).toContainText('in 50 days')
  await expect(look).toContainText('Renews Tue 12 Jan')
  await expect(look).toContainText('£240.00 a year')

  // Search: the words as the document has them, each match marked, in a document and not in its title.
  await page.getByRole('searchbox', { name: 'Search your documents' }).fill('notice period')
  const found = page.getByRole('region', { name: 'Search results' })
  await expect(found).toContainText('1 document')
  await expect(found.locator('mark')).toHaveText(['notice', 'period'])
  await page.getByRole('searchbox', { name: 'Search your documents' }).fill('banana')
  await expect(found).toContainText('0 documents')
  await page.getByRole('searchbox', { name: 'Search your documents' }).fill('')

  // A scan has no text: it is kept, and said so. A Word file is refused, with what to do.
  const scan = testInfo.outputPath('Car handbook.pdf')
  await writeFile(scan, makePdf([[]]))
  await page.locator('input[type="file"]').first().setInputFiles(scan)
  const scanSheet = page.getByRole('dialog', { name: 'Car handbook' })
  await expect(scanSheet).toContainText('No text was found in it: it may be a scan.')
  await scanSheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('region', { name: 'All documents' })).toContainText('no text found')
  const word = testInfo.outputPath('notes.docx')
  await writeFile(word, 'not a pdf')
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'notes.docx', mimeType: 'application/msword', buffer: Buffer.from('not a pdf') })
  await expect(page.getByRole('alert')).toHaveText('This isn’t a PDF or a photo. Add the document as a PDF, or take a photo of it.')
  await expectNoScores(page, 'Documents', true)

  // Kept: still there after a reload, with its tracked date; then deleted in two taps, only that one.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Needs a look' })).toContainText('in 50 days')
  await page.getByRole('region', { name: 'All documents' }).getByRole('button', { name: /Home insurance policy/ }).click()
  await page.getByRole('dialog', { name: 'Home insurance policy' }).getByRole('button', { name: 'Delete this document' }).click()
  await page.getByRole('dialog', { name: 'Home insurance policy' }).getByRole('button', { name: 'Yes, delete this document and its file' }).click()
  await expect(page.getByRole('region', { name: 'All documents' }).getByRole('listitem')).toHaveText([/Car handbook/])
  await expect(page.getByRole('region', { name: 'Needs a look' })).toHaveCount(0)
})

// A document photographed: shrunk like a receipt's, kept, shown here; its words wait for reading photos, which is offered.
test('Documents: a photographed paper is kept and shown, and says its words are read once reading photos is on', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 23, 12, 0))
  await page.goto('./#/more/documents')
  await expect(page.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible()
  await page.locator('input[type="file"]').nth(1).setInputFiles('tests/fixtures/photos/receipt-clean.png')
  const sheet = page.getByRole('dialog', { name: 'receipt-clean' })
  await expect(sheet).toContainText('Photo · added 23 Nov 2026')
  await expect(sheet).toContainText('Its words haven’t been read yet.')
  await sheet.getByRole('button', { name: 'View it here' }).click()
  const image = sheet.getByRole('img', { name: 'receipt-clean, as photographed' })
  await expect(image).toBeVisible()
  expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(100)
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('region', { name: 'All documents' })).toContainText('Receipt · photo · not read yet')
  await expect(page.getByText('Read the text in photos, so documents you photograph can be searched?')).toBeVisible()
})

// Audit 2026-11-23 (high): a document's title and notes were saved only when their box lost focus, so words typed before a tap on ✕ could be lost.
test('Documents: a title and notes typed are kept at once, also when the sheet is closed straight after', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(2026, 10, 23, 12, 0))
  const path = testInfo.outputPath('Handbook.pdf')
  await writeFile(path, makePdf([[line('Handbook', 760, 18)]]))
  await page.goto('./#/more/documents')
  await page.locator('input[type="file"]').first().setInputFiles(path)
  const sheet = page.getByRole('dialog', { name: 'Handbook' })
  await sheet.getByLabel('Title').fill('Car handbook')
  await sheet.getByLabel('Notes').fill('Service every 12 months')
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await page.reload()
  await page.getByRole('region', { name: 'All documents' }).getByRole('button', { name: /Car handbook/ }).click()
  await expect(page.getByRole('dialog', { name: 'Car handbook' }).getByLabel('Notes')).toHaveValue('Service every 12 months')
})

