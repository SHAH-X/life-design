import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'
import { entryDefaults } from '../../src/db/types'
import { deriveEngagement, deriveFlow, energyFrom } from '../../src/domain/feelings'
import { dateKey, restoreBackup } from './seed'

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

// Fictional, and long on purpose: one paragraph, as people write.
export const LONG_WRITING =
  'I noticed how many ideas compete for my attention when I try to plan a good day, and how few of them I can hold at once. ' +
  'Finishing every task I start sounds right, and so does following my curiosity wherever it goes, but doing both at the same ' +
  'time in ordinary work is more than I can keep in mind. Maybe the point is to pick one for the morning and the other for the ' +
  'afternoon, and to notice which one leaves me with more energy by the evening.'

export type EnergyAnswer = 'It gave me energy' | 'It used up my energy' | 'Little difference' | 'A mix of both'

export interface NewEntry {
  activity: string
  /** "What was it like?" words; left out, the step was skipped. */
  during?: string[]
  /** "What did it do to your energy?"; left out, skipped. */
  energy?: EnergyAnswer
  /** "How did you feel?" words; left out, skipped. */
  after?: string[]
  /** What was written in its one box; left out, nothing written. */
  writing?: string
  where?: string
  /** Days before today; 0 when left out. */
  daysAgo?: number
  /** Left unfinished ("Unfinished · Continue"). */
  draft?: boolean
}

const EFFECT = { 'It gave me energy': 'gave', 'It used up my energy': 'used', 'Little difference': 'little', 'A mix of both': 'mixed' } as const

/**
 * An activity entry as the phone saved it before v0.15, when Today had "+ Reflect on an activity": its numbers
 * worked out from its words the way the flow did, and a skipped question recorded, never guessed.
 */
export function activityEntry(entry: NewEntry, at: number) {
  const during = entry.during ?? []
  const after = entry.after ?? []
  const effect = entry.energy ? EFFECT[entry.energy] : null
  const { energy, answered } = energyFrom(effect, after)
  return {
    ...entryDefaults(),
    id: `activity-${randomUUID()}`,
    date: dateKey(entry.daysAgo ?? 0, new Date(at)),
    part: 'evening',
    activity: entry.activity,
    engagement: deriveEngagement(during),
    energy,
    flow: deriveFlow(during),
    where: entry.where ? [entry.where] : [],
    people: [],
    objects: [],
    during,
    after,
    note: entry.writing ?? '',
    source: 'quick',
    kind: 'activity',
    purpose: 'know',
    energyEffect: effect,
    skipped: [...(during.length ? [] : ['engagement']), ...(answered ? [] : ['energy'])],
    status: entry.draft ? 'draft' : 'done',
    createdAt: at,
    updatedAt: at,
  }
}

/**
 * Activities, as a phone has them from before v0.15 (the flow that made them is gone): restored from a backup through
 * the app's own Restore screen, newest last, then back to the page the test was on.
 */
export async function addEntries(page: Page, entries: NewEntry[]) {
  const back = page.url()
  const now = Date.now()
  await restoreBackup(page, join(tmpdir(), `life-design-e2e-${randomUUID()}.json`), {
    app: 'life-design',
    kind: 'backup',
    schemaVersion: 7,
    exportedAt: new Date(now).toISOString(),
    data: { entries: entries.map((e, i) => activityEntry(e, now - (entries.length - 1 - i) * 1000)) },
  })
  await page.goto(back)
}

export const addEntry = (page: Page, entry: NewEntry) => addEntries(page, [entry])

/** Today's one way in (v0.15): looks like a text box, and opens the writer. */
export const captureBox = (page: Page) => page.getByRole('button', { name: /^What's on your mind\?/ })

/** Writes in Today's box the way it's done on the phone: the writer, Save, then the entry read back closed. */
export async function writeEntry(page: Page, text: string) {
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await sheet.getByLabel("What's on your mind?").fill(text)
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await closeSaved(page, 'Free writing')
}

/** The entry just saved, read back: check it says so, then close it. */
export async function closeSaved(page: Page, title: string) {
  const view = page.getByRole('dialog', { name: title })
  await expect(view.getByText('✓ Saved')).toBeVisible()
  await view.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(view).toBeHidden()
}

/**
 * Opens an entry from the list, then one of its parts ("How you felt", "Your words", …): only that question opens,
 * in a sheet with the entry's name (v0.12.3: one screen to read an entry, a part at a time to change it).
 */
export async function openPart(page: Page, title: string, part: string) {
  await entryButton(page, title).click()
  await page.getByRole('dialog', { name: title }).getByRole('button', { name: new RegExp(`^${part}`) }).click()
  return page.getByRole('dialog', { name: title })
}

/** The small joy box on Today. */
export const smallJoy = (page: Page) => page.getByLabel('Small joy of the day?')

/** The evening question's box and its save status on Today (its wording changes daily). */
export const eveningQuestion = (page: Page) => page.locator('section.evening .evening-field').nth(1)

export function entryButton(page: Page, activity: string) {
  return page.getByRole('button', { name: new RegExp(`^${activity}`) })
}

/**
 * How much of Playwright's iPhone 17 (681 tall) the fake keyboard covers: it leaves 384 visible, the smallest
 * visible area measured with the real keyboard up in the iOS Simulator (iPhone 17, iOS 27, a Safari tab with its
 * address pill; the Home Screen app leaves 416). Until v0.12.2 it was 336 (an iPhone 16 keyboard from below the
 * page), which left only 345.
 */
export const KEYBOARD_HEIGHT = 297

/**
 * Stands in for the iPhone keyboard. iOS mostly doesn't shrink the page for it: only the visible area
 * (window.visualViewport) gets shorter. (iOS 27 sometimes shrinks the page too: a unit test covers that with the
 * numbers measured in the iOS Simulator, and `npm run ios-check` uses the real keyboard.) Call before the page loads; then `showKeyboard` opens and closes it.
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

/**
 * Fails unless the whole element is in sight inside its sheet: within the sheet's scrolling body, so never under
 * the footer (Skip, Next, Save) or the header. (v0.9 on the iPhone: "+ your own word" put its box behind Skip.)
 */
export async function expectInSheetView(sheet: Locator, target: Locator) {
  const body = sheet.locator('.sheet-body')
  await expect
    .poll(
      async () => {
        const [view, box] = await Promise.all([body.boundingBox(), target.boundingBox()])
        if (!view || !box) return 'not on screen'
        if (box.y < view.y - 1) return `top hidden by ${Math.round(view.y - box.y)}px`
        const hidden = box.y + box.height - (view.y + view.height)
        return hidden > 1 ? `bottom hidden by ${Math.round(hidden)}px` : 'in view'
      },
      { message: 'wholly inside the sheet, not under its footer' },
    )
    .toBe('in view')
}

/** Fails unless the sheet fills the visible screen: all of it, or all above the (fake) keyboard. */
export async function expectSheetFillsScreen(page: Page, sheet: Locator) {
  await expect
    .poll(
      async () => {
        const visible = await page.evaluate(() => window.visualViewport?.height ?? window.innerHeight)
        const box = await sheet.boundingBox()
        return box ? `${Math.round(box.height)} of ${Math.round(visible)}px` : 'not on screen'
      },
      { message: 'the sheet fills the visible screen' },
    )
    .toMatch(/^(\d+) of \1px$/)
}

/** A finger swipe across a row: right to left with a negative dx (swipe to delete). */
export async function swipe(page: Page, target: Locator, dx: number, dy = 0) {
  const box = await target.boundingBox()
  if (!box) throw new Error('nothing to swipe')
  const x = box.x + box.width - 30
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 10 })
  await page.mouse.up()
}

/** Phase 2.6's rule: nothing shows a rating, score, average or scale. Plain counts ("5 times", "on 4 days") and dates
 *  are fine; a sign before a number, a decimal, "x/5" or "x/10", or the word "average" is not. */
export const SCORE = /[+−-]\d|\d\s*\/\s*(?:5|10)\b|\b\d\.\d\b|\baverage\b/i

export async function expectNoScores(page: Page, where: string) {
  const text = await page.locator('body').innerText()
  expect(text.match(SCORE)?.[0] ?? null, `a score on ${where}`).toBeNull()
}
