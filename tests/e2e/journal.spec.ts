import { expect, test } from '@playwright/test'
import { addEntry, captureBox, closeSaved, entryButton, openPart, writeEntry } from './helpers'
import { dateKey, restoreBackup } from './seed'

// Purpose journaling (Phase 4): the owner's brief, journey by journey. Fictional example data. Since v0.15 new
// writing goes in Today's one box; activities from before then (restored, as a phone has them) keep their questions.

test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

test("an earlier activity's words: the purpose's questions above its box as helpers; another purpose just for it", async ({ page }) => {
  await addEntry(page, { activity: 'Spanish lesson' })
  const sheet = await openPart(page, 'Spanish lesson', 'Your words')
  await expect(sheet.getByLabel('Questions for')).toHaveValue('know')
  const helpers = sheet.getByRole('list', { name: 'Questions to think about' })
  await expect(helpers.getByRole('listitem')).toHaveCount(3)
  const before = await helpers.getByRole('listitem').allTextContents()
  await sheet.getByRole('button', { name: '↻ Other questions' }).click()
  await expect.poll(() => helpers.getByRole('listitem').allTextContents()).not.toEqual(before)

  // Helpers to think with, not fields to fill: one box, and no openers (the questions do that job).
  await sheet.getByLabel('Questions for').selectOption('learn')
  await expect(helpers.getByRole('listitem').first()).toHaveText('What did you learn or understand?')
  await expect(sheet.getByRole('textbox')).toHaveCount(1)
  await expect(sheet.getByRole('button', { name: 'Need a start?' })).toHaveCount(0)
  await sheet.getByLabel("What's on your mind about it?").fill('The past tense finally made sense. Flashcards helped.')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('dialog', { name: 'Spanish lesson' }).getByRole('button', { name: 'Done', exact: true }).click()

  const edit = await openPart(page, 'Spanish lesson', 'Your words')
  await expect(edit.getByLabel('Questions for')).toHaveValue('learn')
  await expect(edit.getByLabel("What's on your mind about it?")).toHaveValue('The past tense finally made sense. Flashcards helped.')
})

test('a hard time is asked about gently, and "Write freely" as a purpose shows no questions', async ({ page }) => {
  await addEntry(page, { activity: 'Difficult call with family' })
  const sheet = await openPart(page, 'Difficult call with family', 'Your words')
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
  await view.getByRole('button', { name: /^Your words/ }).click()
  const edit = page.getByRole('dialog', { name: 'Book club' })
  await expect(edit.getByLabel('What stood out to you about it?')).toHaveValue('Everyone had read it this time')
  await edit.getByLabel('What stood out to you about it?').fill('Everyone had read it, for once')
  await expect(edit.getByLabel("What's on your mind about it?")).toHaveValue('Stayed late')
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog', { name: 'Book club' })).toContainText('Everyone had read it, for once')
})

test('an earlier activity with its questions skipped shows no words for them: nothing is guessed', async ({ page }) => {
  await addEntry(page, { activity: 'Walk to the shop' })
  const walk = entryButton(page, 'Walk to the shop')
  await expect(walk).toBeVisible()
  await expect(walk).not.toHaveAttribute('data-energy')
  await expect(walk.locator('.entry-feelings')).toHaveCount(0)
})

test('the box: a blank page, saved, and still there after a reload', async ({ page }) => {
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await expect(sheet.getByLabel("What's on your mind?")).toBeFocused()
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled()
  await sheet.getByLabel("What's on your mind?").fill("Couldn't sleep\nKept thinking about the move, and what I'd miss")
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await closeSaved(page, 'Free writing')

  // Called "Free writing" in the list (never the writing itself, v0.12.2), with its words below: all lines, two at most.
  const entry = entryButton(page, 'Free writing')
  await expect(entry).toContainText("Couldn't sleep Kept thinking about the move, and what I'd miss")
  await page.reload()
  await expect(entryButton(page, 'Free writing')).toBeVisible()
  const edit = await openPart(page, 'Free writing', 'Your words')
  await expect(edit.getByLabel("What's on your mind?")).toHaveValue("Couldn't sleep\nKept thinking about the move, and what I'd miss")
})

test('unfinished writing is kept, and carries on where it was left', async ({ page }) => {
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await sheet.getByLabel("What's on your mind?").fill('Half a thought about the garden')
  await sheet.getByRole('button', { name: 'Close' }).click()
  const draft = entryButton(page, 'Free writing')
  await expect(draft).toContainText('Unfinished · Continue')
  await page.reload()
  await entryButton(page, 'Free writing').click()
  await expect(sheet.getByLabel("What's on your mind?")).toHaveValue('Half a thought about the garden')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await closeSaved(page, 'Free writing')
  await expect(entryButton(page, 'Free writing')).not.toContainText('Unfinished')
})

test('an activity left unfinished before v0.15 carries on where it was left; a quick double tap never answers the next question', async ({ page }) => {
  await addEntry(page, { activity: 'Gym', during: ['Focused'], draft: true })
  const gym = entryButton(page, 'Gym')
  await expect(gym).toContainText('Unfinished · Continue')
  await gym.click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await expect(sheet.getByRole('heading', { name: 'What did it do to your energy?' })).toBeVisible()

  // An answer moves straight on; the same spot tapped again just after must not answer the next question.
  const answer = sheet.getByRole('button', { name: 'It gave me energy' })
  const box = await answer.boundingBox()
  if (!box) throw new Error('the answer is not on screen')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.click(x, y)
  await page.waitForFunction(() => document.querySelector('dialog[open] h2.question-text')?.textContent === 'How did you feel?', undefined, {
    polling: 'raf',
  })
  await page.mouse.click(x, y)
  await expect(sheet.getByRole('group', { name: 'How did you feel?' }).getByRole('button', { pressed: true })).toHaveCount(0)

  await sheet.getByRole('button', { name: 'Skip' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await closeSaved(page, 'Gym')
  await expect(entryButton(page, 'Gym')).not.toContainText('Unfinished')
  await expect(entryButton(page, 'Gym')).toContainText('focused · gave energy')
})

test('nothing leaves the phone: every request stays on this site', async ({ page }) => {
  const origin = new URL(page.url()).origin
  const elsewhere: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) elsewhere.push(request.url())
  })
  await writeEntry(page, 'A good day. The harmonies at choir, a lovely evening')
  await page.goto('./#/entries')
  await page.goto('./#/insights')
  await page.goto('./#/more')
  expect(elsewhere).toEqual([])
})
