import { expect, type Locator, type Page } from '@playwright/test'

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

export type EnergyAnswer = 'It gave me energy' | 'It used up my energy' | 'Little difference' | 'A mix of both'

export interface NewEntry {
  activity: string
  /** "What was it like?" words; left out, the step is skipped. */
  during?: string[]
  /** "What did it do to your energy?"; left out, skipped. */
  energy?: EnergyAnswer
  /** "How did you feel?" words; left out, skipped. */
  after?: string[]
  /** Answers to the purpose questions, in order (a second one adds "+ Another question"). */
  reflect?: string[]
  where?: string
  note?: string
}

/** Reflects on an activity the way it's done on the phone: one question per screen, anything after the first skippable. */
export async function addEntry(page: Page, entry: NewEntry) {
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill(entry.activity)
  await sheet.getByRole('button', { name: 'Next' }).click()

  await expect(sheet.getByRole('heading', { name: 'What was it like?' })).toBeVisible()
  for (const word of entry.during ?? []) await sheet.getByRole('button', { name: word, exact: true }).click()
  await sheet.getByRole('button', { name: entry.during?.length ? 'Next' : 'Skip' }).click()

  await expect(sheet.getByRole('heading', { name: 'What did it do to your energy?' })).toBeVisible()
  await sheet.getByRole('button', { name: entry.energy ?? 'Skip', exact: true }).click() // an answer moves straight on

  await expect(sheet.getByRole('heading', { name: 'How did you feel?' })).toBeVisible()
  for (const word of entry.after ?? []) await sheet.getByRole('button', { name: word, exact: true }).click()
  await sheet.getByRole('button', { name: entry.after?.length ? 'Next' : 'Skip' }).click()

  await expect(sheet.getByLabel('For')).toBeVisible()
  for (const [i, text] of (entry.reflect ?? []).entries()) {
    if (i > 0) await sheet.getByRole('button', { name: '+ Another question' }).click()
    await sheet.locator('.reflection textarea').nth(i).fill(text)
  }
  await sheet.getByRole('button', { name: entry.reflect?.length ? 'Next' : 'Skip' }).click()

  await expect(sheet.getByRole('button', { name: 'Save' })).toBeVisible()
  if (entry.note) await sheet.getByLabel('What else would you like to record?').fill(entry.note)
  if (entry.where) {
    await sheet.getByRole('button', { name: '+ How long, where, who' }).click()
    await sheet.getByLabel('Add to where').fill(entry.where)
    await sheet.getByLabel('Add to where').press('Enter')
  }
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  // Saving shows the entry read back (its summary and a next step); Done closes it.
  await closeSaved(page, entry.activity)
}

/** The entry just saved, read back: check it says so, then close it. */
export async function closeSaved(page: Page, title: string) {
  const view = page.getByRole('dialog', { name: title })
  await expect(view.getByText('✓ Saved')).toBeVisible()
  await view.getByRole('button', { name: 'Done' }).click()
  await expect(view).toBeHidden()
}

/** Opens an entry from the list: first it reads back, then Edit shows everything on one screen. */
export async function openEdit(page: Page, title: string, dialogName = 'Edit activity') {
  await entryButton(page, title).click()
  await page.getByRole('dialog', { name: title }).getByRole('button', { name: 'Edit' }).click()
  return page.getByRole('dialog', { name: dialogName })
}

/** The small joy box on Today. */
export const smallJoy = (page: Page) => page.getByLabel('Small joy of the day?')

/** The evening question's box and its save status on Today (its wording changes daily). */
export const eveningQuestion = (page: Page) => page.locator('section.evening .evening-field').nth(1)

export function entryButton(page: Page, activity: string) {
  return page.getByRole('button', { name: new RegExp(`^${activity}`) })
}

/** An iPhone keyboard's height in portrait, with its suggestion bar. */
export const KEYBOARD_HEIGHT = 336

/**
 * Stands in for the iPhone keyboard. iOS never shrinks the page for it: only the visible area
 * (window.visualViewport) gets shorter. Call before the page loads; then `showKeyboard` opens and closes it.
 */
export async function fakeKeyboard(page: Page) {
  await page.addInitScript(() => {
    const viewport = new EventTarget()
    const state = { keyboard: 0 }
    Object.defineProperties(viewport, {
      width: { get: () => window.innerWidth },
      height: { get: () => window.innerHeight - state.keyboard },
      offsetLeft: { value: 0 },
      offsetTop: { value: 0 },
      pageLeft: { get: () => window.scrollX },
      pageTop: { get: () => window.scrollY },
      scale: { value: 1 },
    })
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => viewport })
    ;(window as unknown as { __keyboard: (height: number) => void }).__keyboard = (height) => {
      state.keyboard = height
      viewport.dispatchEvent(new Event('resize'))
    }
  })
}

export async function showKeyboard(page: Page, height = KEYBOARD_HEIGHT) {
  await page.evaluate((h) => (window as unknown as { __keyboard: (height: number) => void }).__keyboard(h), height)
}

/** Fails unless the whole element is on screen and above the (fake) keyboard. */
export async function expectAboveKeyboard(page: Page, target: Locator) {
  const visibleBottom = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight)
  await expect.poll(async () => (await target.boundingBox())?.y ?? -1, { message: 'top on screen' }).toBeGreaterThanOrEqual(0)
  await expect
    .poll(
      async () => {
        const box = await target.boundingBox()
        return box ? Math.round(box.y + box.height) : Number.POSITIVE_INFINITY
      },
      { message: `bottom above the keyboard (${visibleBottom}px)` },
    )
    .toBeLessThanOrEqual(visibleBottom)
}
