import { expect, type Page } from '@playwright/test'

/** Playwright's WebKit can't show an iOS share sheet, so make the app use its download fallback. */
export async function useDownloadsInsteadOfShareSheet(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
}

export interface NewEntry {
  activity: string
  engagement: 'Bored' | 'Low engagement' | 'Some engagement' | 'Engaged' | 'Absorbed'
  energy: 'Drained' | 'A bit drained' | 'Neutral' | 'A bit energised' | 'Energised'
  flow?: boolean
  where?: string
}

export async function addEntry(page: Page, entry: NewEntry) {
  await page.getByRole('button', { name: '+ Add activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill(entry.activity)
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
