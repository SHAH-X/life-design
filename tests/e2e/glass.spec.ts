import { expect, test } from '@playwright/test'
import { captureBox } from './helpers'
import { daysFrom, restoreSeed } from './seed'

// The glass layer, the floating dock and the sheets' new look (restyle step 3). Measured, so a later edit that breaks the
// recipe fails here and not on the owner's phone.
test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

test('the tab dock floats: inset 12px, 8px up, 64px tall, rounded, glass; the active tab is a 56x32 sage pill', async ({ page }) => {
  const dock = page.locator('nav.tabbar')
  await expect(dock).toBeVisible()
  const box = (await dock.boundingBox())!
  const view = page.viewportSize()!
  expect(box.x).toBe(12)
  expect(Math.round(box.width)).toBe(view.width - 24)
  expect(Math.round(box.height)).toBe(66) // 64px and its 1px border above and below
  expect(Math.round(view.height - (box.y + box.height))).toBe(8)
  const look = await dock.evaluate((el) => {
    const css = getComputedStyle(el)
    return { radius: css.borderTopLeftRadius, blur: css.backdropFilter, bg: css.backgroundColor }
  })
  expect(look.radius).toBe('28px')
  expect(look.blur).toContain('blur(24px)')
  expect(look.bg).toBe('rgba(255, 253, 249, 0.72)')
  // Every tab stays and can be tapped.
  const tabs = dock.getByRole('link')
  await expect(tabs).toHaveCount(6)
  for (const tab of await tabs.all()) expect((await tab.boundingBox())!.width).toBeGreaterThanOrEqual(44)
  const pill = (await dock.locator('a[aria-current="page"] svg').boundingBox())!
  expect([Math.round(pill.width), Math.round(pill.height)]).toEqual([56, 32])
  const pillBg = await dock.locator('a[aria-current="page"] svg').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(pillBg).toBe('rgb(227, 236, 229)')
})

test('a sheet: a 32% scrim, and a 280ms rise; a full-screen sheet has no frame and no scrim blur (it covers the page)', async ({ page }) => {
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await expect(sheet).toBeVisible()
  const backdrop = await sheet.evaluate((el) => {
    const css = getComputedStyle(el, '::backdrop')
    return { bg: css.backgroundColor, blur: css.backdropFilter, border: getComputedStyle(el).borderTopWidth }
  })
  expect(backdrop.bg).toBe('rgba(31, 30, 28, 0.32)')
  expect(backdrop.blur).toBe('none')
  expect(backdrop.border).toBe('0px') // no beige frame on the left, top and right
  // Its header and footer are the glass; a sheet that doesn't cover the page blurs the scrim instead (see polish.spec.ts).
  expect(await sheet.locator('.sheet-header').evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur(24px)')
  const motion = await sheet.evaluate((el) => ({ name: getComputedStyle(el).animationName, ms: getComputedStyle(el).animationDuration }))
  expect(motion).toEqual({ name: 'sheet-rise', ms: '0.28s' })

  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()
})

test('a sheet’s header shows its hairline only once the content has scrolled under it', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'), daysFrom(new Date(), 1)) // fictional entries dated today
  await page.goto('./#/today')
  // A short screen, so an entry's parts run past the bottom of the sheet.
  await page.setViewportSize({ width: 402, height: 380 })
  await page.locator('main .entry-list').getByRole('button', { name: /^Evening run/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Evening run' })
  await expect(sheet).toBeVisible()
  const header = sheet.locator('.sheet-header')
  const body = sheet.locator('.sheet-body')
  await expect(header).not.toHaveAttribute('data-scrolled', /.*/)
  expect(await header.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe('rgba(0, 0, 0, 0)')
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await body.evaluate((el) => {
    el.scrollTop = 80
  })
  await expect(header).toHaveAttribute('data-scrolled', 'true')
  await expect.poll(() => header.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe('rgb(228, 225, 216)')
  await body.evaluate((el) => {
    el.scrollTop = 0
  })
  await expect(header).not.toHaveAttribute('data-scrolled', /.*/)
})

test('with reduced motion a sheet just appears', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await expect(sheet).toBeVisible()
  expect(await sheet.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})
