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
  engagement: 'Bored' | 'Low engagement' | 'Some engagement' | 'Engaged' | 'Absorbed'
  energy: 'Drained' | 'A bit drained' | 'Neutral' | 'A bit energised' | 'Energised'
  flow?: boolean
  where?: string
  note?: string
}

export async function addEntry(page: Page, entry: NewEntry) {
  await page.getByRole('button', { name: '+ Add activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill(entry.activity)
  if (entry.note) await sheet.getByLabel('What stood out?').fill(entry.note)
  await sheet.getByRole('radio', { name: entry.engagement, exact: true }).check()
  await sheet.getByRole('radio', { name: entry.energy, exact: true }).check()
  if (entry.flow) await sheet.getByRole('switch', { name: /I lost track of time/ }).check()
  if (entry.where) {
    await sheet.getByRole('button', { name: /Where, with whom/ }).click()
    await sheet.getByLabel('Add to where').fill(entry.where)
    await sheet.getByLabel('Add to where').press('Enter')
  }
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
}

export function entryButton(page: Page, activity: string) {
  return page.getByRole('button', { name: new RegExp(`^${activity}`) })
}
