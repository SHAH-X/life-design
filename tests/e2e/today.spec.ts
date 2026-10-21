import { expect, test } from '@playwright/test'
import { addEntry, entryButton, smallJoy } from './helpers'

// Fictional example data.
test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

test('describe activities with feeling words, never ratings; edit and delete them; keep a small joy', async ({ page }) => {
  await expect(page.getByText('Add the 3–6 main things you did.')).toBeVisible()

  await addEntry(page, { activity: 'Repotted the balcony plants', during: ['Absorbed', 'Time flew'], after: ['Energised'], where: 'Balcony' })
  await expect(entryButton(page, 'Repotted the balcony plants')).toContainText('absorbed · time flew · energised')

  // A recent activity is one tap and moves straight on; each word screen needs a word before Next.
  await page.getByRole('button', { name: '+ Add activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByRole('button', { name: 'Repotted the balcony plants' }).click()
  await expect(sheet.getByRole('heading', { name: 'What was it like?' })).toBeVisible()
  await sheet.getByRole('button', { name: '‹ Back' }).click()
  await sheet.getByLabel('What did you do?').fill('Answered emails')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await expect(sheet.getByRole('button', { name: 'Next' })).toBeDisabled()
  await sheet.getByRole('button', { name: 'Distracted', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()

  // A word of your own is placed once with a plain question, then chosen.
  await expect(sheet.getByRole('heading', { name: 'How did it leave you?' })).toBeVisible()
  await sheet.getByRole('button', { name: '+ your own word' }).click()
  await sheet.getByLabel('Your own word').fill('Foggy')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByText('“Foggy”: Did it give you energy or take it?')).toBeVisible()
  await sheet.getByRole('button', { name: 'Took', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Foggy', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Next' }).click()

  // The note is worded from the answers, and offers feelings it mentions.
  await sheet.getByLabel('What took your energy?').fill('Too many threads and I was so tired')
  await sheet.getByRole('button', { name: '+ tired' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  const emails = entryButton(page, 'Answered emails')
  await expect(emails).toContainText('distracted · foggy · tired')
  await expect(emails).toContainText('Too many threads')

  // Editing shows both sets of words on one screen.
  await emails.click()
  const edit = page.getByRole('dialog', { name: 'Edit activity' })
  await expect(edit.getByRole('button', { name: 'Tired', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await edit.getByRole('button', { name: 'Drained', exact: true }).click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(emails).toContainText('tired · drained')

  // Your word is offered again next time, and listed in More.
  await page.getByRole('button', { name: '+ Add activity' }).click()
  await sheet.getByLabel('What did you do?').fill('Planning')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Fine', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await expect(sheet.getByRole('button', { name: 'Foggy', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await sheet.getByRole('button', { name: 'Close' }).click()

  // Delete (with confirmation)
  await emails.click()
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
  await expect(page.locator('section.card')).toContainText('Foggy · takes energy')
})

test('ⓘ explains each word question, and a quick double tap never answers the next one', async ({ page }) => {
  await addEntry(page, { activity: 'Choir rehearsal', during: ['Focused'], after: ['Proud'] })
  await page.getByRole('button', { name: '+ Add activity' }).click()
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
  await sheet.getByRole('button', { name: 'What does this ask about energy?' }).click()
  await expect(sheet.getByText(/lifted, or flat/)).toBeVisible()
})

test('a sheet opens on its content, not on ✕ Close', async ({ page }) => {
  // Focus on Close showed a ring on every sheet, and Enter or Space straight away would have closed it.
  await addEntry(page, { activity: 'Reading', during: ['Curious'], after: ['Calm'] })
  await entryButton(page, 'Reading').click()
  const edit = page.getByRole('dialog', { name: 'Edit activity' })
  await expect(edit).toBeVisible()
  await expect(edit.getByRole('button', { name: 'Close' })).not.toBeFocused()
  await edit.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: '+ Add activity' }).click()
  await expect(page.getByRole('dialog', { name: 'New activity' }).getByLabel('What did you do?')).toBeFocused()
})

test('log an activity for yesterday', async ({ page }) => {
  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeEnabled()
  await addEntry(page, { activity: 'Evening walk', during: ['Fine'], after: ['Calm', 'Satisfied'] })
  await expect(entryButton(page, 'Evening walk')).toContainText('fine · calm · satisfied')

  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next day' })).toBeDisabled()
  await expect(entryButton(page, 'Evening walk')).toHaveCount(0)
})
