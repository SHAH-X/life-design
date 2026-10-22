import { expect, type Page, test } from '@playwright/test'
import { addEntry, entryButton } from './helpers'

// Purpose journaling (Phase 4): the owner's brief, journey by journey. Fictional example data.

test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

async function toReflect(page: Page, activity: string) {
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill(activity)
  await sheet.getByRole('button', { name: 'Next' }).click()
  for (let i = 0; i < 3; i += 1) await sheet.getByRole('button', { name: 'Skip' }).click()
  await expect(sheet.getByLabel('For')).toBeVisible()
  return sheet
}

test('the questions follow the purpose: one at a time, up to three, and another purpose just for this entry', async ({ page }) => {
  const sheet = await toReflect(page, 'Spanish lesson')
  await expect(sheet.getByLabel('For')).toHaveValue('know')
  await expect(sheet.getByLabel('What stood out to you about it?')).toBeVisible()

  await sheet.getByLabel('For').selectOption('learn')
  await expect(sheet.getByLabel('What did you learn or understand?')).toBeVisible()
  await sheet.getByLabel('What did you learn or understand?').fill('The past tense finally made sense')
  await sheet.getByRole('button', { name: '+ Another question' }).click()
  await sheet.getByRole('button', { name: '+ Another question' }).click()
  await expect(sheet.locator('.reflection')).toHaveCount(3)
  await expect(sheet.getByRole('button', { name: '+ Another question' })).toHaveCount(0)
  // A question not answered yet can be swapped for another.
  const third = sheet.locator('.reflection').nth(2)
  const before = await third.locator('label').textContent()
  await third.getByRole('button', { name: 'A different question' }).click()
  await expect(third.locator('label')).not.toHaveText(before ?? '')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()

  await entryButton(page, 'Spanish lesson').click()
  const edit = page.getByRole('dialog', { name: 'Edit activity' })
  await expect(edit.getByLabel('For')).toHaveValue('learn')
  await expect(edit.getByLabel('What did you learn or understand?')).toHaveValue('The past tense finally made sense')
})

test('a hard time is asked about gently, and writing freely asks nothing', async ({ page }) => {
  const sheet = await toReflect(page, 'Difficult call with family')
  await sheet.getByLabel('For').selectOption('calm')
  await expect(sheet.getByText("Write only what feels okay. There doesn't have to be a lesson.")).toBeVisible()
  await expect(sheet.getByLabel('What happened, from your point of view?')).toBeVisible()
  await sheet.getByLabel('For').selectOption('free')
  await expect(sheet.locator('.reflection')).toHaveCount(0)
  await expect(sheet.getByText('No questions: write anything on the next screen.')).toBeVisible()
})

test('every step after the first can be skipped, and the entry still saves', async ({ page }) => {
  await addEntry(page, { activity: 'Walk to the shop' })
  const walk = entryButton(page, 'Walk to the shop')
  await expect(walk).toBeVisible()
  await expect(walk).not.toHaveAttribute('data-energy')
  // Nothing was guessed for the skipped questions.
  await expect(walk.locator('.entry-feelings')).toHaveCount(0)
})

test('write freely: a blank page, saved, and still there after a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Write freely' }).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await expect(sheet.getByLabel("What's on your mind?")).toBeFocused()
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
  await sheet.getByLabel("What's on your mind?").fill("Couldn't sleep\nKept thinking about the move, and what I'd miss")
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()

  const entry = entryButton(page, "Couldn't sleep")
  await expect(entry).toContainText("Kept thinking about the move, and what I'd miss")
  await page.reload()
  await expect(entryButton(page, "Couldn't sleep")).toBeVisible()
  await entryButton(page, "Couldn't sleep").click()
  await expect(page.getByRole('dialog', { name: 'Edit writing' }).getByLabel("What's on your mind?")).toHaveValue(
    "Couldn't sleep\nKept thinking about the move, and what I'd miss",
  )
})

test('an unfinished entry is kept, and carries on where it was left', async ({ page }) => {
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill('Gym')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Focused', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await expect(sheet.getByRole('heading', { name: 'What did it do to your energy?' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()

  const gym = entryButton(page, 'Gym')
  await expect(gym).toContainText('Unfinished · Continue')
  await page.reload()
  await entryButton(page, 'Gym').click()
  await expect(sheet.getByRole('heading', { name: 'What did it do to your energy?' })).toBeVisible()
  await sheet.getByRole('button', { name: 'It gave me energy' }).click()
  await sheet.getByRole('button', { name: 'Skip' }).click()
  await sheet.getByRole('button', { name: 'Skip' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(entryButton(page, 'Gym')).not.toContainText('Unfinished')
  await expect(entryButton(page, 'Gym')).toContainText('focused · gave energy')
  await expect(page.locator('main .entry-list').getByRole('listitem')).toHaveCount(1)
})

test('nothing leaves the phone: every request stays on this site', async ({ page }) => {
  const origin = new URL(page.url()).origin
  const elsewhere: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) elsewhere.push(request.url())
  })
  await addEntry(page, { activity: 'Choir rehearsal', during: ['Absorbed'], energy: 'It gave me energy', after: ['Happy'], reflect: ['The harmonies'], note: 'Lovely evening' })
  await page.getByRole('button', { name: 'Write freely' }).click()
  await page.getByRole('dialog', { name: 'Write freely' }).getByLabel("What's on your mind?").fill('A good day')
  await page.getByRole('dialog', { name: 'Write freely' }).getByRole('button', { name: 'Save' }).click()
  await page.goto('./#/insights')
  await page.goto('./#/more')
  expect(elsewhere).toEqual([])
})
