import { expect, test } from '@playwright/test'
import {
  addEntries,
  addEntry,
  captureBox,
  closeSaved,
  entryButton,
  expectAboveKeyboard,
  expectInSheetView,
  expectSheetFillsScreen,
  fakeKeyboard,
  LONG_WRITING,
  openPart,
  showKeyboard,
  sheetSettled,
  smallJoy,
  writeEntry,
} from './helpers'
import { daysFrom, restoreSeed } from './seed'

// Fictional example data. Since v0.15 Today has one way in, a box that opens the writer; activities reflected on
// before then are restored from a backup (addEntry), as a phone has them.
test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

test('one box: write anything, with no title, category or questions; it reads back and stays; a small joy saves', async ({ page }) => {
  await expect(page.getByRole('button', { name: '+ Reflect on an activity' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Write freely' })).toHaveCount(0)
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  const box = sheet.getByLabel("What's on your mind?")
  await expect(box).toBeFocused()
  await expect(sheet.getByRole('textbox')).toHaveCount(1)
  await expect(sheet.getByLabel('Questions for')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
  await box.fill('Quarterly numbers due Friday. Ask Sam about the budget line.')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await closeSaved(page, 'Free writing')
  await expect(entryButton(page, 'Free writing')).toContainText('Quarterly numbers due Friday.')

  await smallJoy(page).fill('Sun on the balcony at breakfast')
  await expect(page.locator('section.evening .evening-field').first().getByText('Saved')).toBeVisible()
  await page.reload()
  await expect(smallJoy(page)).toHaveValue('Sun on the balcony at breakfast')
  await expect(entryButton(page, 'Free writing')).toBeVisible()
})

test('an earlier activity: a part changes on its own and the rest is kept; your own word; delete asks first', async ({ page }) => {
  await addEntry(page, {
    activity: 'Answered emails',
    during: ['Distracted'],
    energy: 'It used up my energy',
    after: ['Tired'],
    writing: 'Too many threads at once. I was so tired by the end',
  })
  const emails = entryButton(page, 'Answered emails')
  await expect(emails).toContainText('distracted · used up energy · tired')

  const part = await openPart(page, 'Answered emails', 'How you felt')
  await expect(part.getByRole('button', { name: 'Tired', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await part.getByRole('button', { name: 'Anxious', exact: true }).click()
  await part.getByRole('button', { name: 'Save' }).click()
  const view = page.getByRole('dialog', { name: 'Answered emails' })
  await expect(view.getByRole('button', { name: /^How you felt/ })).toContainText('tired · anxious')
  await expect(view.getByRole('button', { name: /^What it did to your energy/ })).toContainText('It used up my energy')
  await expect(view.getByRole('button', { name: /^Your words/ })).toContainText('Too many threads at once. I was so tired by the end')

  // A word of your own, added on "What was it like?", is kept for next time.
  await view.getByRole('button', { name: /^What it was like/ }).click()
  await part.getByRole('button', { name: '+ your own word' }).click()
  await part.getByLabel('Your own word').fill('Foggy')
  await part.getByRole('button', { name: 'Add', exact: true }).click()
  // On "What was it like?" a word of your own asks its one question first.
  await part.getByRole('button', { name: 'Not really' }).click()
  await expect(part.getByRole('button', { name: 'Foggy', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await part.getByRole('button', { name: 'Save' }).click()
  await view.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(emails).toContainText('foggy')

  await emails.click()
  await view.getByRole('button', { name: 'Delete' }).click()
  await view.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(emails).toHaveCount(0)

  await page.goto('./#/more/words')
  await expect(page.locator('section.card')).toContainText('Foggy')
})

test('ⓘ explains each question of an earlier activity', async ({ page }) => {
  await addEntry(page, { activity: 'Choir rehearsal', during: ['Focused'], energy: 'It gave me energy', after: ['Proud'] })
  await openPart(page, 'Choir rehearsal', 'What it was like')
  const part = page.getByRole('dialog', { name: 'Choir rehearsal' })
  await part.getByRole('button', { name: 'What does this ask?' }).click()
  await expect(part.getByText(/Where was your attention/)).toBeVisible()
  await part.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('dialog', { name: 'Choir rehearsal' }).getByRole('button', { name: /^What it did to your energy/ }).click()
  await page.getByRole('dialog', { name: 'Choir rehearsal' }).getByRole('button', { name: 'Why ask about energy?' }).click()
  await expect(page.getByRole('dialog', { name: 'Choir rehearsal' }).getByText(/Good Time Journal/)).toBeVisible()
})

test('a sheet opens on its content, not on ✕ Close', async ({ page }) => {
  // Focus on Close showed a ring on every sheet, and Enter or Space straight away would have closed it.
  await addEntry(page, { activity: 'Reading', during: ['Curious'], after: ['Calm'] })
  await entryButton(page, 'Reading').click()
  const view = page.getByRole('dialog', { name: 'Reading' })
  await expect(view).toBeVisible()
  await expect(view.getByRole('button', { name: 'Close' })).not.toBeFocused()
  await view.getByRole('button', { name: /^How you felt/ }).click()
  const part = page.getByRole('dialog', { name: 'Reading' })
  await expect(part.getByRole('heading', { name: 'How did you feel?' })).toBeVisible()
  await expect(part.getByRole('button', { name: 'Close' })).not.toBeFocused()
  await part.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('dialog', { name: 'Reading' }).getByRole('button', { name: 'Done', exact: true }).click()

  await captureBox(page).click()
  await expect(page.getByRole('dialog', { name: 'Write freely' }).getByLabel("What's on your mind?")).toBeFocused()
})

test('sheets sit above the keyboard, so what you type into stays in sight', async ({ page }) => {
  // v0.6 on the iPhone: the keyboard covered the field. iOS mostly doesn't shrink the page for the keyboard, so a
  // sheet pinned to the bottom stayed behind it.
  await fakeKeyboard(page)
  await page.reload()
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await showKeyboard(page)
  await expectAboveKeyboard(page, sheet.getByLabel("What's on your mind?"))
  await expectAboveKeyboard(page, sheet.getByRole('button', { name: 'Save' }))

  // With the keyboard gone, the sheet is back at the bottom of the screen.
  await showKeyboard(page, 0)
  const screenHeight = await page.evaluate(() => window.innerHeight)
  await expect.poll(async () => Math.round(((await sheet.boundingBox())?.y ?? 0) + ((await sheet.boundingBox())?.height ?? 0))).toBe(screenHeight)
  await sheet.getByRole('button', { name: 'Close' }).click()

  // A box that appears further down a sheet comes into sight above the keyboard too.
  await addEntry(page, { activity: 'Reading', during: ['Curious'], after: ['Calm'] })
  const like = await openPart(page, 'Reading', 'What it was like')
  await like.getByRole('button', { name: '+ your own word' }).click()
  await showKeyboard(page)
  await expectAboveKeyboard(page, like.getByLabel('Your own word'))
})

test('a field never hides behind the sheet footer, even with the keyboard up; entry sheets use the whole screen', async ({ page }) => {
  // v0.9 on the iPhone: a word of your own put its box behind the Skip button, and the sheet didn't open to the
  // full screen.
  await fakeKeyboard(page)
  await page.reload()
  await addEntry(page, { activity: 'Answered emails', during: ['Distracted'] })

  // Your own word: its box takes the focus at once, in sight above the footer and the keyboard.
  const like = await openPart(page, 'Answered emails', 'What it was like')
  await expectSheetFillsScreen(page, like)
  await like.getByRole('button', { name: '+ your own word' }).click()
  const own = like.getByLabel('Your own word')
  await expect(own).toBeFocused()
  await showKeyboard(page)
  await expectSheetFillsScreen(page, like)
  await expectInSheetView(like, own)
  await expectAboveKeyboard(page, own)
  await own.fill('Foggy')
  await like.getByRole('button', { name: 'Add', exact: true }).click()
  // Its one question appears in sight too.
  await expectInSheetView(like, like.getByRole('button', { name: 'Not really' }))
  await showKeyboard(page, 0)
  await like.getByRole('button', { name: 'Close' }).click()

  // Where, with the keyboard up.
  const view = page.getByRole('dialog', { name: 'Answered emails' })
  await view.getByRole('button', { name: /^When, how long, where, who/ }).click()
  const details = page.getByRole('dialog', { name: 'Answered emails' })
  const where = details.getByLabel('Add to where')
  await where.click()
  await showKeyboard(page)
  await expectInSheetView(details, where)
  await expectAboveKeyboard(page, where)
  await showKeyboard(page, 0)
  await details.getByRole('button', { name: 'Close' }).click()
  await view.getByRole('button', { name: 'Done', exact: true }).click()

  // Read back after writing: a next step's "What exactly?" stays in sight.
  await writeEntry(page, 'Too many threads at once')
  await entryButton(page, 'Free writing').click()
  const written = page.getByRole('dialog', { name: 'Free writing' })
  await expectSheetFillsScreen(page, written)
  await written.getByRole('button', { name: 'Try something differently' }).click()
  const exactly = written.getByLabel('What exactly?')
  await exactly.click()
  await showKeyboard(page)
  await expectInSheetView(written, exactly)
  await expectAboveKeyboard(page, exactly)
  await showKeyboard(page, 0)
  await written.getByRole('button', { name: 'Done', exact: true }).click()
})

test('editing and writing freely keep every field in sight, on the whole screen', async ({ page }) => {
  await fakeKeyboard(page)
  await page.reload()
  await addEntry(page, { activity: 'Reading', during: ['Curious'], after: ['Calm'] })

  // Each part of an entry opens on the whole screen; its field stays in sight with the keyboard up.
  const view = page.getByRole('dialog', { name: 'Reading' })
  const what = await openPart(page, 'Reading', 'What you did')
  await expectSheetFillsScreen(page, what)
  await what.getByLabel('What did you do?').click()
  await showKeyboard(page)
  await expectSheetFillsScreen(page, what)
  await expectInSheetView(what, what.getByLabel('What did you do?'))
  await showKeyboard(page, 0)
  await what.getByRole('button', { name: 'Close' }).click()
  await view.getByRole('button', { name: /^Your words/ }).click()
  const words = page.getByRole('dialog', { name: 'Reading' })
  await words.getByLabel("What's on your mind about it?").click()
  await showKeyboard(page)
  await expectInSheetView(words, words.getByLabel("What's on your mind about it?"))
  await showKeyboard(page, 0)
  await words.getByRole('button', { name: 'Close' }).click()
  await view.getByRole('button', { name: 'Done', exact: true }).click()

  await captureBox(page).click()
  const free = page.getByRole('dialog', { name: 'Write freely' })
  await expectSheetFillsScreen(page, free)
  await showKeyboard(page)
  await expectSheetFillsScreen(page, free)
  await expectInSheetView(free, free.getByLabel("What's on your mind?"))
  // The mic hint is behind the ⓘ (a permanent help line broke "no help paragraphs"), and in sight when opened.
  await expect(free.getByText('Tap the mic on the keyboard to speak.')).toHaveCount(0)
  await free.getByRole('button', { name: 'How to speak it' }).click()
  await expectInSheetView(free, free.getByText('Tap the mic on the keyboard to speak.'))
})

test('scrolling inside a sheet never moves the page behind it', async ({ page }, testInfo) => {
  // v0.7 on the iPhone: scrolling inside a sheet scrolled the screen behind it.
  await restoreSeed(page, testInfo.outputPath('seed.json'), daysFrom(new Date(), 1)) // fictional entries dated today
  await page.goto('./#/today')
  const behind = page.locator('main .entry-list').getByRole('button', { name: /^Commute/ })
  await expect(behind).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 200))
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(200)
  const top = async () => Math.round((await behind.boundingBox())?.y ?? Number.NaN)
  const before = await top()

  // A sheet opened while the page is scrolled down: an entry from the list (the box sits at the top, out of reach
  // at this scroll). Every sheet is the same Dialog with the same scroll lock.
  await page.locator('main .entry-list').getByRole('button', { name: /^Evening run/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Evening run' })
  await expect(sheet).toBeVisible()
  // Mobile WebKit here can't swipe, so try to scroll the page the way a swipe would: it must not move.
  await page.evaluate(() => window.scrollBy(0, 400))
  await page.waitForTimeout(100)
  expect(await top()).toBe(before)
  // And a scroll that reaches the end of the sheet stays in the sheet.
  await expect(sheet.locator('.sheet-body')).toHaveCSS('overscroll-behavior-y', 'contain')

  // Closing the sheet leaves the page exactly where it was.
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(200)
  expect(await top()).toBe(before)
})

test('a thin coloured edge shows how each activity left you; the words stay in ink', async ({ page }) => {
  await addEntries(page, [
    { activity: 'Evening run', during: ['Focused'], energy: 'It gave me energy' },
    { activity: 'Commute', during: ['Bored'], energy: 'It used up my energy', after: ['Tired'] },
    { activity: 'Lunch', during: ['Fine'], energy: 'Little difference' },
  ])
  await expect(entryButton(page, 'Evening run')).toHaveAttribute('data-energy', 'gives')
  await expect(entryButton(page, 'Commute')).toHaveAttribute('data-energy', 'takes')
  await expect(entryButton(page, 'Lunch')).not.toHaveAttribute('data-energy')

  // Blue gave energy, red took it (the chart colours); the words carry the meaning too.
  const edge = (name: string) => entryButton(page, name).evaluate((el) => getComputedStyle(el, '::before').backgroundColor)
  expect(await edge('Evening run')).toBe('rgb(42, 120, 214)')
  expect(await edge('Commute')).toBe('rgb(227, 73, 72)')
  // Red words read like an error, so every feeling word is the same quiet ink.
  for (const name of ['Evening run', 'Commute']) {
    const colours = await entryButton(page, name)
      .locator('.entry-feelings, .entry-feelings *')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).color))
    expect(new Set(colours).size).toBe(1)
  }
  // One list with thin lines between the entries, not a box each.
  await expect(page.locator('.entry-list')).toHaveCSS('border-top-width', '1px')
  await expect(entryButton(page, 'Commute')).toHaveCSS('border-top-width', '0px')
})

test('"Need a start?" in the writer types in an opener, and the rest is yours', async ({ page }) => {
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  const box = sheet.getByLabel("What's on your mind?")
  await sheet.getByRole('button', { name: 'Need a start?' }).click()
  const openers = sheet.getByRole('group', { name: 'Openers' })
  await expect(openers.getByRole('button')).toHaveText(['Today I…', 'I keep thinking about…', 'Something I want to remember is…'])
  await openers.getByRole('button', { name: 'I keep thinking about…' }).click()
  await expect(box).toHaveValue('I keep thinking about ')
  await expect(box).toBeFocused()
  await expect(sheet.getByRole('button', { name: 'Need a start?' })).toBeHidden()
  await box.press('End')
  await box.pressSequentially('the move')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await closeSaved(page, 'Free writing')
  await expect(entryButton(page, 'Free writing')).toContainText('I keep thinking about the move')
})

test("back after a few days away, Today says missed days don't matter: no counts, no streaks", async ({ page }, testInfo) => {
  // The fictional entries end 5 days ago.
  await restoreSeed(page, testInfo.outputPath('seed.json'), daysFrom(new Date(), -4))
  await page.goto('./#/today')
  await expect(page.getByText("Welcome back. Missed days don't matter.")).toBeVisible()
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByText(/Welcome back/)).toHaveCount(0)
  await expect(captureBox(page)).toBeVisible()
  await page.getByRole('button', { name: 'Next day' }).click()
  await writeEntry(page, 'A slow morning')
  await expect(page.getByText(/Welcome back/)).toHaveCount(0)
})

test('write for yesterday', async ({ page }) => {
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeEnabled()
  await writeEntry(page, 'Evening walk along the canal')
  await expect(entryButton(page, 'Free writing')).toContainText('Evening walk along the canal')

  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()
  await expect(entryButton(page, 'Free writing')).toHaveCount(0)
})

test('a long entry never pushes the box off the first screen; rows show two lines of it', async ({ page }) => {
  // v0.12.2 on the owner's iPhone: free writing was shown whole, in bold, and pushed the ways in and everything
  // after them out of sight. The box comes first, and a row shows at most two lines of your words.
  await writeEntry(page, LONG_WRITING)
  await addEntry(page, { activity: 'An unusually long walk along the river after work', during: ['Focused'], writing: LONG_WRITING })
  await page.reload()

  const tabBar = await page.getByRole('navigation', { name: 'Main' }).boundingBox()
  const box = await captureBox(page).boundingBox()
  expect(box && box.y + box.height <= (tabBar?.y ?? 0), 'the box on the first screen, above the tab bar').toBe(true)
  const row = page.locator('.entry-row', { hasText: 'Free writing' })
  await expect(row).toBeVisible()
  const note = row.locator('.entry-note')
  const lines = await note.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)))
  expect(lines, 'two lines of the writing at most').toBeLessThanOrEqual(2)
})

test('an entry is one screen: tap a part to change just that, "To remember" too', async ({ page }) => {
  // Owner, 2026-10-23: tapping an activity showed one screen, Edit another (a long form), and "there is no option to
  // edit the 'to remember' part". Now the entry reads as its parts; tapping one opens only that question.
  await addEntry(page, { activity: 'Walk', during: ['Absorbed'], energy: 'It gave me energy', after: ['Happy'] })
  await entryButton(page, 'Walk').click()
  const view = page.getByRole('dialog', { name: 'Walk' })
  await expect(view.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  // VoiceOver reads each part as its label and answer, never the › drawn beside it (found in the iOS Simulator).
  await expect(view.getByRole('button', { name: /›/ })).toHaveCount(0)
  await view.getByRole('button', { name: 'Remember this' }).click()
  await view.getByRole('button', { name: 'Keep this' }).click()
  const remember = view.getByRole('button', { name: /^To remember/ })
  await expect(remember).toContainText('The whole entry')

  // "To remember": change its words, then remove it (the next-step question comes back).
  await remember.click()
  const part = page.getByRole('dialog', { name: 'Walk' })
  await part.getByLabel('What exactly?').fill('The view from the bridge')
  await part.getByRole('button', { name: 'Save' }).click()
  await expect(remember).toContainText('The view from the bridge')
  await remember.click()
  await part.getByRole('button', { name: 'Remove' }).click()
  await expect(view.getByRole('heading', { name: "Anything you'd like to do with this?" })).toBeVisible()

  // One part: how you felt. Only that question opens, and the rest is kept.
  await view.getByRole('button', { name: /^How you felt/ }).click()
  await expect(part.getByLabel('What did you do?')).toHaveCount(0)
  await part.getByRole('button', { name: 'Calm', exact: true }).click()
  await part.getByRole('button', { name: 'Save' }).click()
  await expect(view.getByRole('button', { name: /^How you felt/ })).toContainText('happy · calm')
  await expect(view.getByRole('button', { name: /^What it was like/ })).toContainText('absorbed')
  await expect(view.getByRole('button', { name: /^What it did to your energy/ })).toContainText('It gave me energy')
})

test('the writer is a page: no box, serif at reading size, one sage line on focus; a camera and Save share the footer', async ({ page }) => {
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  const box = sheet.getByLabel("What's on your mind?")
  await expect(box).toBeFocused()
  const look = await box.evaluate((el) => {
    const css = getComputedStyle(el)
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize)
    return {
      top: css.borderTopWidth,
      left: css.borderLeftWidth,
      leftColour: css.borderLeftColor,
      bg: css.backgroundColor,
      shadow: css.boxShadow,
      resize: css.resize,
      family: css.fontFamily,
      size: parseFloat(css.fontSize) / root,
      line: parseFloat(css.lineHeight) / parseFloat(css.fontSize),
    }
  })
  expect(look.top).toBe('0px')
  expect(look.left).toBe('2px')
  expect(look.leftColour).toBe('rgb(54, 90, 74)') // the focus line
  expect(look.bg).toBe('rgba(0, 0, 0, 0)')
  expect(look.shadow).toBe('none')
  expect(look.resize).toBe('none')
  expect(look.family).toMatch(/New York|Georgia|serif/)
  expect(look.size).toBeCloseTo(1.125, 2)
  expect(look.line).toBeCloseTo(1.65, 2)

  // One footer row: the camera, then Save across the rest.
  await sheetSettled(sheet)
  const camera = sheet.locator('.sheet-footer label.photo-add')
  await expect(camera).toContainText('Add a photo')
  const save = sheet.getByRole('button', { name: 'Save' })
  const [c, v] = [(await camera.boundingBox())!, (await save.boundingBox())!]
  expect(c.x).toBeLessThan(v.x)
  expect(Math.abs(c.y + c.height / 2 - (v.y + v.height / 2))).toBeLessThan(1)
  expect(c.width).toBe(52)
  expect(v.width).toBeGreaterThan(200)
  // The header title is small and muted.
  const title = await sheet.locator('.sheet-header h2').evaluate((el) => ({ colour: getComputedStyle(el).color, size: parseFloat(getComputedStyle(el).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize) }))
  expect(title.colour).toBe('rgb(95, 94, 88)')
  expect(title.size).toBeCloseTo(0.85, 2)
})

test('Today: the title is left, its date a muted line with no pill, bare day arrows; the box is 96px, serif ink, a 40px sage disc', async ({ page }) => {
  const title = page.locator('.day-title')
  const h1 = (await title.locator('h1').boundingBox())!
  expect(h1.x).toBeLessThanOrEqual(21) // the 20px gutter: left aligned, not centred
  const date = await title.locator('p').evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, radius: getComputedStyle(el).borderRadius }))
  expect(date).toEqual({ bg: 'rgba(0, 0, 0, 0)', radius: '0px' })
  const arrow = page.getByRole('button', { name: 'Previous day' })
  expect(await arrow.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')
  expect((await arrow.boundingBox())!.width).toBeGreaterThanOrEqual(44)
  const box = captureBox(page)
  expect(Math.round((await box.boundingBox())!.height)).toBeLessThanOrEqual(100)
  expect(await box.locator('.capture-prompt').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(31, 30, 28)')
  const disc = (await box.locator('.capture-mark').boundingBox())!
  expect([Math.round(disc.width), Math.round(disc.height)]).toEqual([40, 40])
})

test('the install notice is a 48px glass strip with a sage dot', async ({ page }) => {
  const strip = page.locator('aside.notice.strip')
  await expect(strip).toBeVisible()
  const look = await strip.evaluate((el) => ({ blur: getComputedStyle(el).backdropFilter, bg: getComputedStyle(el).backgroundColor, dot: getComputedStyle(el, '::before').backgroundColor }))
  expect(look.blur).toContain('blur(24px)')
  expect(look.bg).toBe('rgba(255, 253, 249, 0.72)')
  expect(look.dot).toBe('rgb(54, 90, 74)')
  expect((await strip.boundingBox())!.height).toBeGreaterThanOrEqual(48)
})

test('an entry row is 72px with a 3x28 edge inset 4px: blue, red, or a plain line for free writing; the evening card is 32px below', async ({ page }) => {
  await addEntries(page, [
    { activity: 'Walk', during: ['Absorbed'], energy: 'It gave me energy', after: ['Happy'] },
    { activity: 'Meeting', during: ['Distracted'], energy: 'It used up my energy', after: ['Frustrated'] },
  ])
  await writeEntry(page, 'A free thought.')
  const edge = (name: string | RegExp) =>
    entryButton(page, name as string).evaluate((el) => {
      const css = getComputedStyle(el, '::before')
      return { w: css.width, h: css.height, left: css.left, bg: css.backgroundColor, row: el.getBoundingClientRect().height }
    })
  const walk = await edge('Walk')
  expect([walk.w, walk.h, walk.left, walk.bg]).toEqual(['3px', '28px', '4px', 'rgb(42, 120, 214)'])
  expect(walk.row).toBeGreaterThanOrEqual(72)
  expect((await edge('Meeting')).bg).toBe('rgb(227, 73, 72)')
  expect((await edge('Free writing')).bg).toBe('rgb(228, 225, 216)')
  const list = (await page.locator('main .entry-list').boundingBox())!
  const evening = (await page.locator('section.evening').boundingBox())!
  expect(Math.round(evening.y - (list.y + list.height))).toBe(32)
})
