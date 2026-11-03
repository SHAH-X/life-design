import { expect, test } from '@playwright/test'
import { addEntry, captureBox } from './helpers'

// The start page ('./', as the Home Screen icon opens it) on a new phone shows a short welcome, once.

test('a first open shows a short welcome; Skip goes straight to Today, and it never shows again', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: 'Life Design' })).toBeVisible()
  await expect(page.getByText('A few words is enough. Everything stays on this phone.')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()

  // Two examples show that what you write is listed as it is: no title or category to pick (v0.15).
  const examples = page.getByRole('list', { name: 'Examples' })
  await expect(examples.getByRole('listitem')).toHaveCount(2)
  await expect(examples.locator('.entry-row').first()).toContainText('Free writing')
  await expect(examples).toContainText('Say sorry tomorrow.')
  await expect(examples.getByRole('button')).toHaveCount(0)

  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()

  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
})

test('the welcome asks what journaling is for, with a follow-up, then starts on Today', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('img', { name: 'Step 1 of 3' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0) // nothing to go back to
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
  await expect(captureBox(page)).toBeVisible()

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

test('the welcome opens on the 64px mark, with three dots, two stacked examples and one primary with Back as a link', async ({ page }) => {
  await page.goto('./')
  const mark = page.locator('.welcome-mark')
  await expect(mark).toBeVisible()
  const box = (await mark.boundingBox())!
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([64, 64])
  // The title is serif at the large size.
  const title = await page.getByRole('heading', { level: 1 }).evaluate((el) => ({ family: getComputedStyle(el).fontFamily, size: parseFloat(getComputedStyle(el).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize) }))
  expect(title.family).toMatch(/New York|Georgia|serif/)
  expect(title.size).toBeCloseTo(2, 2)

  // Three dots like the sheets' steps: one filled on the first step, two on the second.
  const dots = page.locator('.welcome-top .step-dots i')
  await expect(dots).toHaveCount(3)
  await expect(page.locator('.welcome-top .step-dots i.on')).toHaveCount(1)

  // The examples are stacked: the second 8px to the right of the first, tucked 8px under it.
  const [first, second] = await page.locator('.example-stack li').all()
  const [a, b] = [(await first!.boundingBox())!, (await second!.boundingBox())!]
  expect(Math.round(b.x - a.x)).toBe(8)
  expect(Math.round(a.y + a.height - b.y)).toBe(8)

  // Next is the one primary, across the width; no Back on the first step.
  const next = page.getByRole('button', { name: 'Next' })
  expect(await next.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(54, 90, 74)')
  await next.click()
  await expect(page.locator('.welcome-mark')).toHaveCount(0)
  await expect(page.locator('.welcome-top .step-dots i.on')).toHaveCount(2)
  const back = page.getByRole('button', { name: 'Back' })
  expect(await back.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopWidth }))).toEqual({ bg: 'rgba(0, 0, 0, 0)', border: '0px' })
})
