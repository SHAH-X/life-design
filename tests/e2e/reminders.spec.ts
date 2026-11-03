import { expect, test } from '@playwright/test'
import { captureShareSheet, sharedFile } from './helpers'

test('choose reminders, times and a date range, then get one calendar file with all of them', async ({ page }) => {
  await captureShareSheet(page)
  await page.goto('./#/more/reminders')
  const card = page.locator('main') // each reminder is a card of its own

  // Defaults: all four reminders on, one year from today.
  for (const name of [/^Daily log/, /^Look back/, /^Backup/, /^Quarterly check-in/]) {
    await expect(card.getByRole('switch', { name })).toBeChecked()
  }

  // The date range is a collapsed row until it's opened.
  await expect(card.getByLabel('From', { exact: true })).toBeHidden()
  await card.locator('summary', { hasText: 'Date range' }).click()
  await expect(card.getByRole('button', { name: '1 year' })).toHaveAttribute('aria-pressed', 'true')

  // 1 October 2026 to 1 October 2027.
  await card.getByLabel('From', { exact: true }).fill('2026-10-01')
  await card.getByLabel('To', { exact: true }).fill('2027-10-01')
  await card.getByLabel('Daily log time').selectOption('07:30')
  await card.getByLabel('Look back repeats').selectOption('monthly')
  await card.getByLabel('Look back on the first').selectOption('1') // Monday
  await card.getByRole('switch', { name: /^Backup/ }).uncheck()

  const summary = card.locator('.summary')
  await expect(summary).toContainText(/Daily log: Every day at 0?7:30/)
  await expect(summary).toContainText(/Look back: First Monday of every month/)
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
  await page.locator('summary', { hasText: 'Date range' }).click()
  await page.getByRole('button', { name: 'No end date' }).click()
  await expect(page.getByLabel('To', { exact: true })).toBeDisabled()
  await expect(page.locator('.summary')).toContainText('with no end date')
  await page.getByRole('button', { name: 'Get calendar file…' }).click()
  expect((await sharedFile(page)).text).not.toContain('UNTIL=')
})

test('typing a multi-digit "every N days" works key by key', async ({ page }) => {
  await page.goto('./#/more/reminders')
  await page.getByLabel('Look back repeats').selectOption('days')
  const every = page.getByLabel('Look back every (days)')
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
    'entries',
    'insights',
    'insights/learning',
    'insights/weeks',
    'insights/steps',
    'insights/review',
    'more',
    'more/reminders',
    'more/purpose',
    'more/words',
    'more/meaning',
    'more/ai',
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
  for (const name of ['Reminders', 'Your purpose', 'Your feeling words', 'Search by meaning', 'AI review', 'Backup and restore', 'Spreadsheet export', 'This phone']) {
    await expect(list.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  // Erasing is a group of its own, 24px below the rest.
  const erase = page.getByRole('navigation', { name: 'Erase' })
  await expect(erase.getByRole('link', { name: /^Delete everything/ })).toBeVisible()
  const [above, below] = [(await list.boundingBox())!, (await erase.boundingBox())!]
  expect(Math.round(below.y - (above.y + above.height))).toBe(24)
  await expect(list.getByRole('link', { name: /^Appearance/ })).toHaveCount(0) // light only since v0.14.1 (owner)
  await list.getByRole('link', { name: /^Reminders/ }).click()
  await expect(page).toHaveURL(/#\/more\/reminders$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Reminders' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to More' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
})

test('More: every row has a 32px sage tile with its icon', async ({ page }) => {
  await page.goto('./#/more')
  const tiles = page.locator('.list-row .icon-tile')
  await expect(tiles).toHaveCount(10)
  for (const tile of await tiles.all()) {
    const box = (await tile.boundingBox())!
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([32, 32])
    await expect(tile.locator('svg')).toHaveCount(1)
  }
  expect(await tiles.first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(227, 236, 229)')
})

test('Reminders: each reminder is a card of its own, its settings only while its switch is on', async ({ page }) => {
  await page.goto('./#/more/reminders')
  // The date range, four reminders, then the calendar file: six cards.
  await expect(page.locator('main .card')).toHaveCount(6)
  const backup = page.locator('main .card', { has: page.getByRole('switch', { name: /^Backup/ }) })
  await expect(backup.getByLabel('Backup repeats')).toBeVisible()
  await page.getByRole('switch', { name: /^Backup/ }).uncheck()
  await expect(backup.getByLabel('Backup repeats')).toHaveCount(0)
  // The other reminders keep theirs.
  await expect(page.getByLabel('Daily log time')).toBeVisible()
  // A select is the app's input look, not the grey native one.
  const select = await page.getByLabel('Daily log time').evaluate((el) => ({ radius: getComputedStyle(el).borderTopLeftRadius, bg: getComputedStyle(el).backgroundColor, h: el.getBoundingClientRect().height }))
  expect(select).toEqual({ radius: '12px', bg: 'rgb(251, 249, 244)', h: 52 })
})
