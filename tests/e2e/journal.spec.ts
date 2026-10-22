import { expect, type Page, test } from '@playwright/test'
import { addEntry, closeSaved, entryButton, openEdit } from './helpers'
import { dateKey, restoreBackup } from './seed'

// Purpose journaling (Phase 4): the owner's brief, journey by journey. Fictional example data.

test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

/** Skips the three taps to the writing step. */
async function toWrite(page: Page, activity: string) {
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill(activity)
  await sheet.getByRole('button', { name: 'Next' }).click()
  for (let i = 0; i < 3; i += 1) await sheet.getByRole('button', { name: 'Skip' }).click()
  await expect(sheet.getByLabel('Questions for')).toBeVisible()
  return sheet
}

test("one box to write in, with the purpose's questions above it as helpers; another purpose just for this entry", async ({ page }) => {
  const sheet = await toWrite(page, 'Spanish lesson')
  await expect(sheet.getByLabel('Questions for')).toHaveValue('know')
  const helpers = sheet.getByRole('list', { name: 'Questions to think about' })
  await expect(helpers.getByRole('listitem')).toHaveText([
    'What stood out to you about it?',
    'How did you feel, and what might have influenced that?',
    'What did it show you about what you like, value or need?',
  ])
  await sheet.getByRole('button', { name: '↻ Other questions' }).click()
  await expect(helpers.getByRole('listitem').first()).toHaveText('Have you noticed something like this before?')

  // Helpers to think with, not fields to fill: one box, and no openers (the questions do that job).
  await sheet.getByLabel('Questions for').selectOption('learn')
  await expect(helpers.getByRole('listitem').first()).toHaveText('What did you learn or understand?')
  await expect(sheet.getByRole('textbox')).toHaveCount(1)
  await expect(sheet.getByRole('button', { name: 'Need a start?' })).toHaveCount(0)
  await sheet.getByLabel("What's on your mind about it?").fill('The past tense finally made sense. Flashcards helped.')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await closeSaved(page, 'Spanish lesson')

  const edit = await openEdit(page, 'Spanish lesson')
  await expect(edit.getByLabel('Questions for')).toHaveValue('learn')
  await expect(edit.getByLabel("What's on your mind about it?")).toHaveValue('The past tense finally made sense. Flashcards helped.')
})

test('a hard time is asked about gently, and writing freely shows no questions', async ({ page }) => {
  const sheet = await toWrite(page, 'Difficult call with family')
  await sheet.getByLabel('Questions for').selectOption('calm')
  await expect(sheet.getByText("Write only what feels okay. There doesn't have to be a lesson.")).toBeVisible()
  await expect(sheet.getByRole('list', { name: 'Questions to think about' })).toContainText('What happened, from your point of view?')
  await sheet.getByLabel('Questions for').selectOption('free')
  await expect(sheet.getByRole('list', { name: 'Questions to think about' })).toHaveCount(0)
  await expect(sheet.getByLabel("What's on your mind about it?")).toBeVisible()
})

test('an entry written with separate answers (v0.8.0) still reads back and edits, each answer under its question', async ({ page }, testInfo) => {
  const now = Date.now()
  await restoreBackup(page, testInfo.outputPath('v080.json'), {
    app: 'life-design',
    kind: 'backup',
    schemaVersion: 5,
    exportedAt: new Date(now).toISOString(),
    data: {
      entries: [
        {
          id: 'v080-book-club',
          date: dateKey(0),
          part: 'evening',
          activity: 'Book club',
          engagement: 4,
          energy: 2,
          flow: false,
          where: [],
          people: [],
          objects: [],
          during: ['Curious'],
          after: ['Happy'],
          note: 'Stayed late',
          source: 'evening',
          createdAt: now,
          updatedAt: now,
          kind: 'activity',
          purpose: 'know',
          energyEffect: 'gave',
          duration: null,
          reflections: [{ question: 'What stood out to you about it?', text: 'Everyone had read it this time' }],
          intention: null,
          take: '',
          insightHidden: false,
          status: 'done',
          skipped: [],
        },
      ],
    },
  })
  await page.goto('./#/today')
  await entryButton(page, 'Book club').click()
  const view = page.getByRole('dialog', { name: 'Book club' })
  await expect(view).toContainText('What stood out to you about it?')
  await expect(view).toContainText('Everyone had read it this time')
  await expect(view).toContainText('Stayed late')
  await view.getByRole('button', { name: 'Edit' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit activity' })
  await expect(edit.getByLabel('What stood out to you about it?')).toHaveValue('Everyone had read it this time')
  await edit.getByLabel('What stood out to you about it?').fill('Everyone had read it, for once')
  await expect(edit.getByLabel("What's on your mind about it?")).toHaveValue('Stayed late')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog', { name: 'Book club' })).toContainText('Everyone had read it, for once')
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
  await closeSaved(page, "Couldn't sleep")

  const entry = entryButton(page, "Couldn't sleep")
  await expect(entry).toContainText("Kept thinking about the move, and what I'd miss")
  await page.reload()
  await expect(entryButton(page, "Couldn't sleep")).toBeVisible()
  const edit = await openEdit(page, "Couldn't sleep", 'Edit writing')
  await expect(edit.getByLabel("What's on your mind?")).toHaveValue(
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
  await sheet.getByRole('button', { name: 'Save' }).click()
  await closeSaved(page, 'Gym')
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
  await addEntry(page, { activity: 'Choir rehearsal', during: ['Absorbed'], energy: 'It gave me energy', after: ['Happy'], writing: 'The harmonies. Lovely evening' })
  await page.getByRole('button', { name: 'Write freely' }).click()
  await page.getByRole('dialog', { name: 'Write freely' }).getByLabel("What's on your mind?").fill('A good day')
  await page.getByRole('dialog', { name: 'Write freely' }).getByRole('button', { name: 'Save' }).click()
  await closeSaved(page, 'A good day')
  await page.goto('./#/entries')
  await page.goto('./#/insights')
  await page.goto('./#/more')
  expect(elsewhere).toEqual([])
})
