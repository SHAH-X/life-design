import { expect, type Page } from '@playwright/test'

/** Playwright's WebKit can't show an iOS share sheet, so make the app use its download fallback. */
export async function useDownloadsInsteadOfShareSheet(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
}

/** Stands in for the iPhone share sheet: accepts any file and keeps a copy for the test to read. */
export async function captureShareSheet(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: { name: string; text: string } | null }
    w.__shared = null
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        const file = data.files?.[0]
        if (file) w.__shared = { name: file.name, text: await file.text() }
      },
    })
  })
}

export async function sharedFile(page: Page): Promise<{ name: string; text: string }> {
  const shared = await page.evaluate(() => (window as unknown as { __shared: { name: string; text: string } | null }).__shared)
  if (!shared) throw new Error('Nothing was shared')
  return shared
}

export interface NewEntry {
  activity: string
  energy: 'Took a lot' | 'Took a little' | 'Neither' | 'Gave a little' | 'Gave a lot'
  into: 'Not at all' | 'A little' | 'Somewhat' | 'Very' | 'Fully'
  /** Asked only after Very or Fully. */
  timeFlew?: boolean
  where?: string
  note?: string
}

/** Logs an activity the way it's done on the phone: one question per screen. */
export async function addEntry(page: Page, entry: NewEntry) {
  await page.getByRole('button', { name: '+ Add activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill(entry.activity)
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: entry.energy, exact: true }).click()
  await sheet.getByRole('button', { name: entry.into, exact: true }).click()
  if (entry.into === 'Very' || entry.into === 'Fully') {
    await sheet.getByRole('button', { name: entry.timeFlew ? 'Yes' : 'No', exact: true }).click()
  }
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeVisible()
  if (entry.note) await sheet.locator('textarea').fill(entry.note)
  if (entry.where) {
    await sheet.getByRole('button', { name: '+ Where, who, what' }).click()
    await sheet.getByLabel('Add to where').fill(entry.where)
    await sheet.getByLabel('Add to where').press('Enter')
  }
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
}

/** The small joy box on Today. */
export const smallJoy = (page: Page) => page.getByLabel('One small joy from the day?')

/** The evening question's box and its save status on Today (its wording changes daily). */
export const eveningQuestion = (page: Page) => page.locator('section.evening .evening-field').nth(1)

export function entryButton(page: Page, activity: string) {
  return page.getByRole('button', { name: new RegExp(`^${activity}`) })
}
