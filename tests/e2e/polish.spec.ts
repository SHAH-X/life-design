import { expect, type Locator, type Page, test } from '@playwright/test'
import { addEntries, captureBox, sheetSettled } from './helpers'
import { restoreSeed } from './seed'

// The review of the restyle (2026-11-02, R1-R21), measured so each stays fixed. Fictional data only.

const EVENING = new Date(2026, 9, 23, 20, 0)
test.use({ serviceWorkers: 'block' })

/** The colour of a pixel of the page as drawn (not as computed), so what hides what is seen. */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 8, height: 8 } })
  return page.evaluate(
    async ([b64, px, py]) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      return [...ctx.getImageData(px as number, py as number, 1, 1).data]
    },
    [png.toString('base64'), x, y] as const,
  )
}

const style = (target: Locator, props: string[], pseudo?: string) =>
  target.evaluate((el, [names, ps]) => Object.fromEntries((names as string[]).map((n) => [n, getComputedStyle(el, ps as string | null).getPropertyValue(n)])), [props, pseudo ?? null] as const)

test('R1: the sage wash shows through (the corner is its colour, not the page colour)', async ({ page }) => {
  await page.goto('./#/more')
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
  const [r, g, b] = await pixel(page, 1, 1)
  // --wash-sage #dfe9e1 = 223, 233, 225; the page is 246, 244, 239.
  expect(Math.abs(r! - 223)).toBeLessThanOrEqual(4)
  expect(Math.abs(g! - 233)).toBeLessThanOrEqual(4)
  expect(Math.abs(b! - 225)).toBeLessThanOrEqual(4)
})

test('R2: at most three blur layers: the dock and the one stuck day header in Logs; a sheet that covers the page has none behind it', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'), EVENING)
  await page.clock.setFixedTime(EVENING)
  await page.goto('./#/entries')
  const blurred = () =>
    page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => { const f = getComputedStyle(el).backdropFilter; return f && f !== 'none' }).length)
  await expect(page.locator('.logs-screen .list-section h2').nth(2)).toBeVisible()
  expect(await page.locator('.logs-screen .list-section h2[data-stuck]').count()).toBe(0)
  expect(await blurred()).toBe(1) // the dock
  // Scroll the third day's header to the top: it, and only it, is stuck.
  await page.evaluate(() => {
    const h = document.querySelectorAll('.logs-screen .list-section h2')[2] as HTMLElement
    window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY + 40) // past it, so it sticks
  })
  await expect(page.locator('.logs-screen .list-section h2[data-stuck]')).toHaveCount(1)
  expect(await blurred()).toBe(2)
  const stuck = page.locator('.logs-screen .list-section h2[data-stuck]')
  expect(await style(stuck, ['backdrop-filter', 'background-color'])).toEqual({ 'backdrop-filter': expect.stringContaining('blur(24px)'), 'background-color': 'rgba(255, 253, 249, 0.72)' })
  // The words don't move when the pill appears.
  const plain = page.locator('.logs-screen .list-section h2').nth(0)
  expect(await plain.evaluate((el) => getComputedStyle(el).textTransform)).toBe('none')
  expect(await plain.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/New York|Georgia|serif/)
  expect(await plain.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeCloseTo(1.125, 2)

  // A full-screen sheet: its header and footer are glass, the dock under it too, and the scrim has none: three.
  await page.goto('./#/today')
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await expect(sheet).toBeVisible()
  expect(await blurred()).toBeLessThanOrEqual(3)
})

test('R2: a sheet that does not cover the page blurs the scrim, with a solid header and footer: three layers with the dock', async ({ page }) => {
  await page.goto('./#/money')
  await page.getByRole('button', { name: 'Bring in a statement' }).click()
  const sheet = page.getByRole('dialog', { name: 'Bring in a statement' })
  await expect(sheet).toBeVisible()
  expect(await sheet.evaluate((el) => getComputedStyle(el, '::backdrop').backdropFilter)).toContain('blur(8px)')
  for (const part of ['.sheet-header', '.sheet-footer']) {
    const found = sheet.locator(part)
    if (await found.count()) expect(await found.evaluate((el) => getComputedStyle(el).backdropFilter), part).toBe('none')
  }
  const layers = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => { const f = getComputedStyle(el).backdropFilter; return f && f !== 'none' }).length)
  expect(layers).toBeLessThanOrEqual(2) // the dock, and the scrim counts apart
})

test('R4: choosing a chip never changes its width, so a row cannot re-wrap under the finger', async ({ page }) => {
  await page.goto('./#/more/reminders')
  await page.locator('summary', { hasText: 'Date range' }).click()
  const chips = page.locator('.range .chip')
  const widths = async () => Promise.all((await chips.all()).map(async (c) => Math.round((await c.boundingBox())!.width * 10) / 10))
  const before = await widths()
  await page.getByRole('button', { name: '3 months' }).click()
  await expect(page.getByRole('button', { name: '3 months' })).toHaveAttribute('aria-pressed', 'true')
  expect(await widths()).toEqual(before)
  // The tick shows on the chosen chip and nowhere else.
  const ticks = await Promise.all((await chips.all()).map((c) => c.evaluate((el) => getComputedStyle(el, '::before').backgroundColor)))
  expect(ticks.filter((t) => t === 'rgb(54, 90, 74)')).toHaveLength(1)
  expect(ticks.filter((t) => t === 'rgba(0, 0, 0, 0)')).toHaveLength(ticks.length - 1)
})

test('R5, R20, R21: a placeholder in solid muted; control edges at 3:1; chips and links 44px', async ({ page }) => {
  await page.goto('./#/today')
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await sheet.getByRole('button', { name: 'Need a start?' }).click()
  const chip = sheet.getByRole('group', { name: 'Openers' }).getByRole('button').first()
  expect(Math.round((await chip.boundingBox())!.height)).toBeGreaterThanOrEqual(44)
  expect(await chip.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(143, 140, 131)')
  await sheet.getByRole('button', { name: 'Close' }).click()
  await page.goto('./#/ask')
  // (the Ask composer needs an AI; the shared rule is checked in palette.test.ts) and a field in Money's search:
  await page.goto('./#/more/reminders')
  await expect(page.getByLabel('Daily log time')).toBeVisible()
  await page.getByRole('switch', { name: /^Look back/ }).check()
  await page.getByLabel('Look back repeats').selectOption('days')
  await page.getByLabel('Look back every (days)').fill('')
  const placeholder = await page.getByLabel('Look back every (days)').evaluate((el) => { const css = getComputedStyle(el, '::placeholder'); return { colour: css.color, opacity: css.opacity } })
  expect(placeholder).toEqual({ colour: 'rgb(95, 94, 88)', opacity: '1' })
})

test('R3, R6, R7, R21: Welcome: the title has room below it, every button is a pill, Skip is a 44px target', async ({ page }) => {
  await page.goto('./')
  const h1 = (await page.getByRole('heading', { level: 1 }).boundingBox())!
  const lead = (await page.locator('.welcome-lead').boundingBox())!
  expect(lead.y - (h1.y + h1.height)).toBeGreaterThanOrEqual(12)
  await expect(page.locator('.progress')).toHaveCount(0) // three dots now, no bar
  const skip = (await page.getByRole('button', { name: 'Skip' }).boundingBox())!
  expect(skip.height).toBeGreaterThanOrEqual(44)
  expect(skip.width).toBeGreaterThanOrEqual(44)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  // Primary beside secondary: both pills.
  for (const name of ['Set a reminder', 'Start']) expect(await page.getByRole('button', { name }).evaluate((el) => getComputedStyle(el).borderTopLeftRadius), name).toBe('999px')
})

test('R8, R9, R19: "Need a start?" lines up with the box and is a sage link; the notice balances its lines', async ({ page }) => {
  await page.goto('./#/today')
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await sheetSettled(sheet)
  const label = (await sheet.locator('.question-text').boundingBox())!
  const link = sheet.getByRole('button', { name: 'Need a start?' })
  const box = (await link.boundingBox())!
  // The text starts where the question does (the button's own 4px padding is pulled back by its -4px margin).
  const pad = await link.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))
  expect(Math.abs(box.x + pad - label.x)).toBeLessThan(1)
  expect(box.height).toBeGreaterThanOrEqual(44)
  expect(await link.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(54, 90, 74)')
  await sheet.getByRole('button', { name: 'Close' }).click()
  expect(await page.locator('.notice.strip p').evaluate((el) => getComputedStyle(el).textWrap)).toMatch(/balance/)
})

test('R10, R11: the evening card: the moon sits in the title, a box is 52px and grows, the ⓘ follows the words', async ({ page }) => {
  await page.goto('./#/today')
  const card = page.locator('section.evening')
  const first = card.locator('.question-row').first()
  await expect(first.locator('.question-lead svg')).toHaveCount(1)
  const boxes = card.locator('textarea')
  for (const box of await boxes.all()) expect(Math.round((await box.boundingBox())!.height)).toBe(52)
  const joy = boxes.first()
  await joy.fill('one\ntwo\nthree\nfour')
  expect((await joy.boundingBox())!.height).toBeGreaterThan(80)
  // The ⓘ comes right after the question, not at the far edge.
  const text = (await first.locator('.question-text').boundingBox())!
  const info = (await first.locator('.info-button').boundingBox())!
  expect(info.x - (text.x + text.width)).toBeLessThan(16)
  // Even for a short question (what did it do to your energy) in an entry sheet.
  const view = page.viewportSize()!
  expect(info.x + info.width).toBeLessThan(view.width - 40)
})

test('R12: every page title starts at the same height (Today has its notice above it)', async ({ page }) => {
  const tops: Record<string, number> = {}
  for (const [path, name] of [['entries', 'Logs'], ['ask', 'Ask'], ['money', 'Money'], ['more', 'More']] as const) {
    await page.goto(`./#/${path}`)
    const h1 = page.getByRole('heading', { level: 1, name })
    await expect(h1).toBeVisible()
    tops[name] = Math.round((await h1.boundingBox())!.y * 10) / 10
  }
  const values = Object.values(tops)
  expect(Math.max(...values) - Math.min(...values), JSON.stringify(tops)).toBeLessThanOrEqual(1)
})

test('R13, R14: list dividers are inset 20px on Today too; the active tab is one treatment, with no fill', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'), EVENING)
  await page.clock.setFixedTime(EVENING)
  await page.goto('./#/entries')
  await expect(page.locator('.entry-list li + li').first()).toBeVisible()
  expect(await style(page.locator('.entry-list li + li').first(), ['left', 'right', 'height'], '::before')).toEqual({ left: '20px', right: '20px', height: '1px' })
  expect(await page.locator('.entry-list li + li').first().evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')
  for (const tab of ['Today', 'Logs', 'Ask', 'Money', 'Insights', 'More']) {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: tab }).click()
    const icon = page.locator('nav.tabbar a[aria-current="page"] svg')
    await expect(icon).toBeVisible()
    await expect.poll(() => style(icon, ['fill', 'background-color']), { message: tab }).toEqual({ fill: 'none', 'background-color': 'rgb(227, 236, 229)' })
  }
})

test('R17: an unfilled chip is not a different width from a filled one in the entry sheet either', async ({ page }) => {
  await addEntries(page, [{ activity: 'Walk', during: ['Absorbed'], energy: 'It gave me energy', after: ['Happy'] }])
  await page.goto('./#/today')
  await page.getByRole('button', { name: /^Walk/ }).click()
  await page.getByRole('button', { name: /^What it was like/ }).click()
  const chips = page.getByRole('dialog').locator('.chip[aria-pressed]')
  const widths = async () => Promise.all((await chips.all()).map(async (c) => Math.round((await c.boundingBox())!.width)))
  const before = await widths()
  await chips.nth(2).click()
  expect(await widths()).toEqual(before)
})

/** Whether a hairline of this colour is drawn across `x` within a few pixels of `y` (as drawn, not as computed). */
async function lineAt(page: Page, x: number, y: number, [r, g, b]: number[]): Promise<boolean> {
  const png = await page.screenshot({ clip: { x, y: Math.max(0, y - 3), width: 4, height: 7 } })
  return page.evaluate(
    async ([b64, want]) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const x0 = Math.floor(img.width / 2)
      for (let py = 0; py < img.height; py++) {
        const d = ctx.getImageData(x0, py, 1, 1).data
        if (Math.abs(d[0]! - want[0]!) <= 6 && Math.abs(d[1]! - want[1]!) <= 6 && Math.abs(d[2]! - want[2]!) <= 6) return true
      }
      return false
    },
    [png.toString('base64'), [r, g, b]] as const,
  )
}

test('N1: the dividers between entries are drawn (the next row used to cover them), in Logs and on Today', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'), EVENING)
  await page.clock.setFixedTime(EVENING)
  for (const path of ['entries', 'today']) {
    await page.goto(`./#/${path}`)
    // Today's own day has one entry in the seed: the day before has four.
    if (path === 'today') await page.getByRole('button', { name: 'Previous day' }).click()
    const second = page.locator('.entry-list li + li').first()
    await expect(second).toBeVisible()
    await second.scrollIntoViewIfNeeded()
    const box = (await second.boundingBox())!
    // --border is 228, 225, 216; the row is 255, 253, 249: a line is found a pixel or two either side of the row's top edge.
    expect(await lineAt(page, Math.round(box.x + 120), Math.round(box.y), [228, 225, 216]), path).toBe(true)
  }
})

test('N2: a chip is centred: equal padding either side, the tick hung inside it, so its width never changes', async ({ page }) => {
  await page.goto('./#/more/reminders')
  await page.locator('summary', { hasText: 'Date range' }).click()
  const chip = page.getByRole('button', { name: '6 months' })
  const look = await chip.evaluate((el) => {
    const css = getComputedStyle(el)
    const tick = getComputedStyle(el, '::before')
    return { left: css.paddingLeft, right: css.paddingRight, tick: tick.position, tickLeft: parseFloat(tick.left), tickWidth: parseFloat(tick.width) }
  })
  expect(look.left).toBe(look.right)
  expect(look.tick).toBe('absolute')
  expect(parseFloat(look.left) - (look.tickLeft + look.tickWidth)).toBeGreaterThanOrEqual(4) // clear of the label by 4px
  expect(look.tickLeft).toBeGreaterThanOrEqual(6) // and not tucked into the chip's curve
})

test('N3: the evening card has one left edge: every line starts at the same x, and the moon is in the corner, clear of the border', async ({ page }) => {
  await page.goto('./#/today')
  const card = page.locator('section.evening')
  const xs = {
    joy: (await card.locator('.question-text').first().boundingBox())!.x,
    box: (await card.locator('textarea').first().boundingBox())!.x,
    second: (await card.locator('.question-text').nth(1).boundingBox())!.x,
    start: Math.round((await card.getByRole('button', { name: 'Need a start?' }).boundingBox())!.x + 4),
  }
  expect(new Set(Object.values(xs).map(Math.round)).size, JSON.stringify(xs)).toBe(1)
  const moon = (await card.locator('.question-lead').boundingBox())!
  const edge = (await card.boundingBox())!
  expect(edge.x + edge.width - (moon.x + moon.width)).toBeGreaterThanOrEqual(18) // as far from the right border as the box is
  const text = (await card.locator('.question-text').first().boundingBox())!
  expect(moon.x).toBeGreaterThan(text.x + text.width) // after the words, never over them
})

test('N4: a button is a pill, including Money’s wide one; a two-line action keeps a rounded card', async ({ page }) => {
  await page.goto('./#/money')
  expect(await page.getByRole('button', { name: 'Bring in a statement' }).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('999px')
  await page.goto('./#/more/backup')
  expect(await page.getByRole('button', { name: /^Back up now/ }).evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('20px')
})

test('N5: Welcome’s second example ends where Next ends; the first stops 8px short', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.example-stack li')).toHaveCount(2)
  const [a, b] = await page.locator('.example-stack li').all()
  const [first, second] = [(await a!.boundingBox())!, (await b!.boundingBox())!]
  const next = (await page.getByRole('button', { name: 'Next' }).boundingBox())!
  expect(Math.abs(second.x + second.width - (next.x + next.width))).toBeLessThan(1)
  expect(Math.round(second.x + second.width - (first.x + first.width))).toBe(8)
})
