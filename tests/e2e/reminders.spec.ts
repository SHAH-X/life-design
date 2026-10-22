import { expect, test } from '@playwright/test'
import { captureShareSheet, sharedFile } from './helpers'

test('choose reminders, times and a date range, then get one calendar file with all of them', async ({ page }) => {
  await captureShareSheet(page)
  await page.goto('./#/more/reminders')
  const card = page.locator('section.card')

  // Defaults: all four reminders on, one year from today.
  for (const name of [/^Daily log/, /^Review \(incl\. AI review\)/, /^Backup/, /^Quarterly check-in/]) {
    await expect(card.getByRole('switch', { name })).toBeChecked()
  }
  await expect(card.getByRole('button', { name: '1 year' })).toHaveAttribute('aria-pressed', 'true')

  // 1 October 2026 to 1 October 2027.
  await card.getByLabel('From', { exact: true }).fill('2026-10-01')
  await card.getByLabel('To', { exact: true }).fill('2027-10-01')
  await card.getByLabel('Daily log time').selectOption('07:30')
  await card.getByLabel('Review repeats').selectOption('monthly')
  await card.getByLabel('Review on the first').selectOption('1') // Monday
  await card.getByRole('switch', { name: /^Backup/ }).uncheck()

  const summary = card.locator('.summary')
  await expect(summary).toContainText(/Daily log: Every day at 0?7:30/)
  await expect(summary).toContainText(/Review \(incl\. AI review\): First Monday of every month/)
  await expect(summary).toContainText(/Quarterly check-in: Every 3 months on the first Sunday/)
  await expect(summary).not.toContainText('Backup:')
  await expect(summary).toContainText(/From (1 Oct 2026|Oct 1, 2026) to (1 Oct 2027|Oct 1, 2027)/)

  await card.getByRole('button', { name: 'Get calendar file…' }).click()
  const shared = await sharedFile(page)
  expect(shared.name).toBe('life-design-reminders.ics')
  const ics = shared.text.replace(/\r\n /g, '')
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3)
  expect(ics).toContain('\r\nDTSTART:20261001T073000\r\n')
  expect(ics).toContain('\r\nRRULE:FREQ=DAILY;UNTIL=20271001T235959\r\n')
  expect(ics).toContain('\r\nDTSTART:20261005T180000\r\n') // the first Monday on or after 1 Oct 2026
  expect(ics).toContain('\r\nRRULE:FREQ=MONTHLY;BYDAY=1MO;UNTIL=20271001T235959\r\n')
  expect(ics).toContain('\r\nRRULE:FREQ=MONTHLY;INTERVAL=3;BYDAY=1SU;UNTIL=20271001T235959\r\n')
  await expect(card.getByText(/^Last calendar file: /)).toBeVisible()

  // Everything is remembered.
  await page.reload()
  await expect(page.getByLabel('Daily log time')).toHaveValue('07:30')
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('2026-10-01')
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('2027-10-01')
  await expect(page.getByRole('switch', { name: /^Backup/ })).not.toBeChecked()
})

test('"No end date" leaves the reminders open-ended', async ({ page }) => {
  await captureShareSheet(page)
  await page.goto('./#/more/reminders')
  await page.getByRole('button', { name: 'No end date' }).click()
  await expect(page.getByLabel('To', { exact: true })).toBeDisabled()
  await expect(page.locator('.summary')).toContainText('with no end date')
  await page.getByRole('button', { name: 'Get calendar file…' }).click()
  expect((await sharedFile(page)).text).not.toContain('UNTIL=')
})

test('typing a multi-digit "every N days" works key by key', async ({ page }) => {
  await page.goto('./#/more/reminders')
  await page.getByLabel('Review repeats').selectOption('days')
  const every = page.getByLabel('Review every (days)')
  await every.fill('')
  await every.pressSequentially('21') // "2" then "21": each keystroke must stick
  await expect(every).toHaveValue('21')
  await expect(page.locator('.summary')).toContainText('Every 21 days')
  await every.fill('')
  await every.pressSequentially('14') // "1" alone is below the minimum, but typing must not snap back
  await expect(every).toHaveValue('14')
  await expect(page.locator('.summary')).toContainText('Every 14 days')
})

test('no link in the app opens a file inside the app (on iPhone that left the app on a blank screen)', async ({ page }) => {
  const fileLinks = page.locator('a[href*=".ics"], a[href^="data:"], a[href^="blob:"], a[download]')
  await page.goto('./')
  for (const step of ['Life Design', 'What would you like it to help with?', 'A nudge each evening?']) {
    await expect(page.getByRole('heading', { level: 1, name: step })).toBeVisible()
    await expect(fileLinks).toHaveCount(0)
    if (step !== 'A nudge each evening?') await page.getByRole('button', { name: 'Next' }).click()
  }
  await page.getByRole('button', { name: 'Start' }).click()
  for (const path of [
    'today',
    'review',
    'insights',
    'design',
    'design/odyssey',
    'design/plan-1',
    'design/views',
    'design/ikigai',
    'design/prototypes',
    'more',
    'more/reminders',
    'more/evening',
    'more/words',
    'more/backup',
    'more/export',
    'more/phone',
    'more/delete',
  ]) {
    await page.goto(`./#/${path}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(fileLinks).toHaveCount(0)
  }
})

test('More is a short list of pages, each with a way back', async ({ page }) => {
  await page.goto('./#/more')
  const list = page.getByRole('navigation', { name: 'Settings' })
  for (const name of ['Reminders', 'Evening question', 'Your feeling words', 'Backup and restore', 'Spreadsheet export', 'This phone', 'Delete everything']) {
    await expect(list.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  await list.getByRole('link', { name: /^Reminders/ }).click()
  await expect(page).toHaveURL(/#\/more\/reminders$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Reminders' })).toBeVisible()
  await page.getByRole('link', { name: '‹ More' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
})
