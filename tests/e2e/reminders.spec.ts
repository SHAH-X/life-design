import { expect, test } from '@playwright/test'

test('the daily reminder links to a real calendar file for the chosen time', async ({ page, request }) => {
  await page.goto('./#/more')
  await page.getByLabel('Time').selectOption('07:30')
  // The schedule is spelled out: every day, at that time, no end date.
  await expect(page.getByText(/Every day at 0?7:30/)).toBeVisible()
  await expect(page.getByText(/no end date/)).toBeVisible()
  const link = page.getByRole('link', { name: 'Add to Calendar' })
  await expect(link).toHaveAttribute('href', /reminders\/daily-log-0730\.ics$/)

  const url = new URL((await link.getAttribute('href')) ?? '', page.url()).toString()
  const response = await request.get(url)
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('text/calendar')
  const ics = (await response.text()).replace(/\r\n /g, '')
  expect(ics).toMatch(/\r\nDTSTART:\d{8}T073000\r\n/)
  expect(ics).toContain('\r\nRRULE:FREQ=DAILY\r\n')

  // The chosen time is remembered.
  await page.reload()
  await expect(page.getByLabel('Time')).toHaveValue('07:30')
})

test('with the offline service worker in control, the calendar file still opens (not the app page)', async ({ page }) => {
  await page.goto('./#/more')
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state), { timeout: 20_000 })
    .toBe('activated')
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  const url = new URL('reminders/daily-log-2100.ics', page.url()).toString()
  const downloading = page.waitForEvent('download')
  await page.evaluate((target) => {
    window.location.href = target
  }, url)
  const download = await downloading
  expect(download.suggestedFilename()).toBe('daily-log-2100.ics')
})
