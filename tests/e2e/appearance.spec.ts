import { expect, type Page, test } from '@playwright/test'

// More → Appearance (v0.10): Automatic follows the iPhone; Light or Dark is chosen in the app, kept on this phone,
// and applied before the first paint. (Owner: "I don't see where can you get the dark mode from".)

const LIGHT = 'rgb(246, 244, 239)'
const DARK = 'rgb(21, 21, 20)'
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
const statusBar = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content))

test.describe('on a light iPhone', () => {
  test.use({ colorScheme: 'light' })

  test('Dark turns the app dark, status bar too, and stays after a reload; Automatic goes back', async ({ page }) => {
    await page.goto('./#/more')
    await expect.poll(() => background(page)).toBe(LIGHT)
    await expect(page.getByRole('link', { name: /^Appearance/ })).toContainText('Automatic')
    await page.getByRole('link', { name: /^Appearance/ }).click()
    await expect(page.getByRole('radio', { name: /^Automatic/ })).toBeChecked()

    await page.getByRole('radio', { name: /^Dark/ }).check()
    await expect.poll(() => background(page)).toBe(DARK)
    await expect.poll(() => statusBar(page)).toEqual(['#151514', '#151514'])
    await page.reload()
    await expect.poll(() => background(page)).toBe(DARK)
    await expect(page.getByRole('radio', { name: /^Dark/ })).toBeChecked()

    await page.getByRole('radio', { name: /^Automatic/ }).check()
    await expect.poll(() => background(page)).toBe(LIGHT)
    await expect.poll(() => statusBar(page)).toEqual(['#f6f4ef', '#151514'])
  })
})

test.describe('on a dark iPhone', () => {
  test.use({ colorScheme: 'dark' })

  test('Automatic follows the iPhone; Light keeps the app light', async ({ page }) => {
    await page.goto('./#/more/appearance')
    await expect.poll(() => background(page)).toBe(DARK)
    await page.getByRole('radio', { name: /^Light/ }).check()
    await expect.poll(() => background(page)).toBe(LIGHT)
    await page.reload()
    await expect.poll(() => background(page)).toBe(LIGHT)
  })
})
