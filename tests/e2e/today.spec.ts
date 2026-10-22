import { expect, test } from '@playwright/test'
import { addEntry, entryButton, expectAboveKeyboard, fakeKeyboard, showKeyboard, smallJoy } from './helpers'
import { restoreSeed } from './seed'

// Fictional example data.
test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

test('reflect on an activity in words, never ratings; edit it without losing anything; delete it; keep a small joy', async ({ page }) => {
  await expect(page.getByText('Start with one thing you did.')).toBeVisible()

  await addEntry(page, { activity: 'Repotted the balcony plants', during: ['Absorbed', 'Time flew'], energy: 'It gave me energy', where: 'Balcony' })
  await expect(entryButton(page, 'Repotted the balcony plants')).toContainText('absorbed · time flew · gave energy')

  // A recent activity is one tap and moves straight on; every step after the first can be skipped.
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByRole('button', { name: 'Repotted the balcony plants' }).click()
  await expect(sheet.getByRole('heading', { name: 'What was it like?' })).toBeVisible()
  await sheet.getByRole('button', { name: '‹ Back' }).click()
  await sheet.getByLabel('What did you do?').fill('Answered emails')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await expect(sheet.getByRole('button', { name: 'Skip' })).toBeEnabled()
  await sheet.getByRole('button', { name: 'Distracted', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()

  // The energy question is plain words, and an answer moves straight on.
  await sheet.getByRole('button', { name: 'It used up my energy' }).click()
  await expect(sheet.getByRole('heading', { name: 'How did you feel?' })).toBeVisible()

  // A word of your own is added straight away: the energy question already asked about energy.
  await sheet.getByRole('button', { name: '+ your own word' }).click()
  await sheet.getByLabel('Your own word').fill('Foggy')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Foggy', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Next' }).click()

  // One question for your purpose; it fits what you said (it used up your energy).
  await expect(sheet.getByLabel('For')).toHaveValue('know')
  await sheet.getByLabel('How did you feel, and what might have influenced that?').fill('Too many threads at once')
  await sheet.getByRole('button', { name: 'Next' }).click()

  // Anything else, and feelings found in your words are offered.
  await sheet.getByLabel('What else would you like to record?').fill('I was so tired by the end')
  await sheet.getByRole('button', { name: '+ tired' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  const emails = entryButton(page, 'Answered emails')
  await expect(emails).toContainText('distracted · used up energy · foggy · tired')
  await expect(emails).toContainText('I was so tired by the end')

  // Editing shows everything on one screen, and keeps what isn't changed.
  await emails.click()
  const edit = page.getByRole('dialog', { name: 'Edit activity' })
  await expect(edit.getByRole('button', { name: 'Tired', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(edit.getByRole('button', { name: 'It used up my energy' })).toHaveAttribute('aria-pressed', 'true')
  await expect(edit.getByLabel('How did you feel, and what might have influenced that?')).toHaveValue('Too many threads at once')
  await edit.getByRole('button', { name: 'Anxious', exact: true }).click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(emails).toContainText('foggy · tired · anxious')
  await emails.click()
  await expect(edit.getByLabel('How did you feel, and what might have influenced that?')).toHaveValue('Too many threads at once')
  await expect(edit.getByLabel('What else would you like to record?')).toHaveValue('I was so tired by the end')

  // Delete (with confirmation)
  await edit.getByRole('button', { name: 'Delete' }).click()
  await edit.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(emails).toHaveCount(0)

  // The small joy saves by itself and survives a reload, as do the entries.
  await smallJoy(page).fill('Sun on the balcony at breakfast')
  await expect(page.locator('section.evening .evening-field').first().getByText('Saved')).toBeVisible()
  await page.reload()
  await expect(smallJoy(page)).toHaveValue('Sun on the balcony at breakfast')
  await expect(entryButton(page, 'Repotted the balcony plants')).toBeVisible()

  await page.goto('./#/more/words')
  await expect(page.locator('section.card')).toContainText('Foggy')
})

test('ⓘ explains each question, and a quick double tap never answers the next one', async ({ page }) => {
  await addEntry(page, { activity: 'Choir rehearsal', during: ['Focused'], after: ['Proud'] })
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })

  // Tap a recent activity, then the same spot again just after the next question appears.
  const recent = sheet.getByRole('button', { name: 'Choir rehearsal' })
  const box = await recent.boundingBox()
  if (!box) throw new Error('recent activity not on screen')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.click(x, y)
  await page.waitForFunction(() => document.querySelector('dialog[open] h2.question-text')?.textContent === 'What was it like?', undefined, {
    polling: 'raf',
  })
  await page.mouse.click(x, y)
  const words = sheet.getByRole('group', { name: 'What was it like?' })
  await expect(words.getByRole('button', { pressed: true })).toHaveCount(0)

  await sheet.getByRole('button', { name: 'What does this ask?' }).click()
  await expect(sheet.getByText(/Where was your attention/)).toBeVisible()
  await sheet.getByRole('button', { name: 'Absorbed', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Why ask about energy?' }).click()
  await expect(sheet.getByText(/Good Time Journal/)).toBeVisible()
})

test('a sheet opens on its content, not on ✕ Close', async ({ page }) => {
  // Focus on Close showed a ring on every sheet, and Enter or Space straight away would have closed it.
  await addEntry(page, { activity: 'Reading', during: ['Curious'], after: ['Calm'] })
  await entryButton(page, 'Reading').click()
  const edit = page.getByRole('dialog', { name: 'Edit activity' })
  await expect(edit).toBeVisible()
  await expect(edit.getByRole('button', { name: 'Close' })).not.toBeFocused()
  await edit.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  await expect(page.getByRole('dialog', { name: 'New activity' }).getByLabel('What did you do?')).toBeFocused()
})

test('sheets sit above the keyboard, so what you type into stays in sight', async ({ page }) => {
  // v0.6 on the iPhone: the keyboard covered "What did you do?". iOS doesn't shrink the page for the keyboard,
  // so a sheet pinned to the bottom stayed behind it.
  await fakeKeyboard(page)
  await page.reload()
  await addEntry(page, { activity: 'Reading', during: ['Curious'], after: ['Calm'] })

  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await showKeyboard(page)
  await expectAboveKeyboard(page, sheet.getByText('What did you do?', { exact: true }))
  await expectAboveKeyboard(page, sheet.getByLabel('What did you do?'))
  await expectAboveKeyboard(page, sheet.getByRole('button', { name: 'Reading' }))
  await expectAboveKeyboard(page, sheet.getByRole('button', { name: 'Next' }))

  // A field further down a longer sheet is scrolled into sight too.
  await showKeyboard(page, 0)
  await sheet.getByLabel('What did you do?').fill('Answered emails')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: '+ your own word' }).click()
  await sheet.getByLabel('Your own word').click()
  await showKeyboard(page)
  await expectAboveKeyboard(page, sheet.getByLabel('Your own word'))

  // With the keyboard gone, the sheet is back at the bottom of the screen.
  await showKeyboard(page, 0)
  const screenHeight = await page.evaluate(() => window.innerHeight)
  await expect.poll(async () => Math.round(((await sheet.boundingBox())?.y ?? 0) + ((await sheet.boundingBox())?.height ?? 0))).toBe(screenHeight)
})

test('scrolling inside a sheet never moves the page behind it', async ({ page }, testInfo) => {
  // v0.7 on the iPhone: scrolling inside "New activity" scrolled the screen behind it.
  await restoreSeed(page, testInfo.outputPath('seed.json'), new Date(Date.now() + 86_400_000)) // fictional entries dated today
  await page.goto('./#/today')
  const behind = page.locator('main .entry-list').getByRole('button', { name: /^Commute/ })
  await expect(behind).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 200))
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(200)
  const top = async () => Math.round((await behind.boundingBox())?.y ?? Number.NaN)
  const before = await top()

  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
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
  await addEntry(page, { activity: 'Evening run', during: ['Focused'], energy: 'It gave me energy' })
  await addEntry(page, { activity: 'Commute', during: ['Bored'], energy: 'It used up my energy', after: ['Tired'] })
  await addEntry(page, { activity: 'Lunch', during: ['Fine'], energy: 'Little difference' })
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
  // One list with thin lines between the activities, not a box each.
  await expect(page.locator('.entry-list')).toHaveCSS('border-top-width', '1px')
  await expect(entryButton(page, 'Commute')).toHaveCSS('border-top-width', '0px')
})

test('"Need a start?" offers openers that fit the note question, and types one in', async ({ page }) => {
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill('Team meeting')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Distracted', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'It used up my energy' }).click()
  await sheet.getByRole('button', { name: 'Tired', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Skip' }).click()

  const note = sheet.getByLabel('What else would you like to record?')
  await sheet.getByRole('button', { name: 'Need a start?' }).click()
  const openers = sheet.getByRole('group', { name: 'Openers' })
  await expect(openers.getByRole('button')).toHaveText(['It took energy because…', 'The hard part was…', "Next time I'll…"])
  await openers.getByRole('button', { name: 'It took energy because…' }).click()
  await expect(note).toHaveValue('It took energy because ')
  await expect(note).toBeFocused()
  await expect(sheet.getByRole('button', { name: 'Need a start?' })).toBeHidden()
  await note.press('End')
  await note.pressSequentially('it ran long')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(entryButton(page, 'Team meeting')).toContainText('It took energy because it ran long')
})

test('back after a few days away, Today says missed days don\'t matter: no counts, no streaks', async ({ page }, testInfo) => {
  // The fictional entries end 5 days ago.
  await restoreSeed(page, testInfo.outputPath('seed.json'), new Date(Date.now() - 4 * 86_400_000))
  await page.goto('./#/today')
  await expect(page.getByText("Welcome back. Missed days don't matter: start with one thing you did.")).toBeVisible()
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByText('Start with one thing you did.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next day' }).click()
  await addEntry(page, { activity: 'Reading', during: ['Curious'], after: ['Calm'] })
  await expect(page.getByText(/Welcome back/)).toHaveCount(0)
})

test('log an activity for yesterday', async ({ page }) => {
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeEnabled()
  await addEntry(page, { activity: 'Evening walk', during: ['Fine'], after: ['Calm', 'Fulfilled'] })
  await expect(entryButton(page, 'Evening walk')).toContainText('fine · calm · fulfilled')

  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()
  await expect(entryButton(page, 'Evening walk')).toHaveCount(0)
})
