import { expect, test } from '@playwright/test'

test('the app shell loads, navigates, and is an installable offline-ready PWA', async ({ page, request }) => {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('./')
  await expect(page).toHaveTitle('Life Design')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const label of ['Today', 'Review', 'Insights', 'Life Design', 'More']) {
    await expect(nav.getByRole('link', { name: label })).toBeVisible()
  }

  await nav.getByRole('link', { name: 'More' }).click()
  await expect(page).toHaveURL(/#\/more$/)
  await expect(page.getByText(/^v\d+\.\d+\.\d+ · /)).toBeVisible()

  // The built page carries a Content-Security-Policy.
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)

  // Manifest is served with the right scope for GitHub Pages.
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()
  const manifestResponse = await request.get(new URL(manifestHref ?? '', page.url()).toString())
  expect(manifestResponse.ok()).toBe(true)
  expect(await manifestResponse.json()).toMatchObject({
    name: 'Life Design',
    start_url: '/life-design/',
    scope: '/life-design/',
    display: 'standalone',
  })

  // A service worker takes control, which is what makes the app open offline.
  // `ready` resolves while the worker may still be "activating" (precaching over a slow network), so poll.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state), { timeout: 20_000 })
    .toBe('activated')

  expect(consoleErrors).toEqual([])
})
