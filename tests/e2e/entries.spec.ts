import { expect, type Page, test } from '@playwright/test'
import { addEntry, closeSaved, entryButton } from './helpers'

// After an entry (Stage E and F) and the Entries tab. Fictional example data.

test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

/** Reflects on an activity and stays on what it reads back afterwards. */
async function saveAndStay(page: Page, activity: string, energy: string, reflect?: string) {
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill(activity)
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Distracted', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: energy }).click()
  await sheet.getByRole('button', { name: 'Frustrated', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  if (reflect) await sheet.locator('.reflection textarea').first().fill(reflect)
  await sheet.getByRole('button', { name: reflect ? 'Next' : 'Skip' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  const view = page.getByRole('dialog', { name: activity })
  await expect(view.getByText('✓ Saved')).toBeVisible()
  return view
}

test('after saving, the entry reads back in your words; a next step can be kept and followed up', async ({ page }) => {
  const view = await saveAndStay(page, 'Team meeting', 'It used up my energy', 'Long agenda, no decisions. We ran over.')
  const summary = view.getByRole('region', { name: 'Summary' })
  await expect(summary).toContainText('What happened')
  await expect(summary).toContainText('Team meeting · “Long agenda, no decisions.”')
  await expect(summary).toContainText('It used up your energy')
  await expect(summary).toContainText('You felt frustrated')
  await expect(summary).toContainText('While doing it: distracted')
  // One entry is not a pattern: nothing is guessed.
  await expect(summary).not.toContainText('Possible insight')

  await view.getByRole('button', { name: 'Try something differently' }).click()
  await view.getByLabel('What exactly?').fill('Ask for an agenda first')
  await view.getByRole('button', { name: 'Keep this' }).click()
  const step = view.getByRole('region', { name: 'Next step' })
  await expect(step).toContainText('Try something differently: Ask for an agenda first')
  await step.getByRole('button', { name: 'Done it' }).click()
  await expect(step).toContainText('✓ Done')
  await view.getByRole('button', { name: 'Done' }).click()

  await entryButton(page, 'Team meeting').click()
  await expect(page.getByRole('dialog', { name: 'Team meeting' }).getByRole('region', { name: 'Next step' })).toContainText('✓ Done')
})

test('a possible insight needs 3+ entries, lists them, and is yours to dismiss or put your own way', async ({ page }) => {
  for (let i = 0; i < 2; i += 1) await addEntry(page, { activity: 'Commute', energy: 'It used up my energy' })
  const view = await saveAndStay(page, 'Commute', 'It used up my energy')
  const summary = view.getByRole('region', { name: 'Summary' })
  await expect(summary).toContainText('Possible insight')
  await expect(summary).toContainText('Commute has used up your energy in 3 of your 3 entries about it. What would make it easier?')
  await summary.getByText('See the 3 entries').click()
  await expect(summary.locator('details.evidence li')).toHaveCount(3)

  await summary.getByRole('button', { name: 'Say it your way' }).click()
  await view.getByLabel('Your take').fill('Mondays are the hard ones')
  await view.getByRole('button', { name: 'Keep my take' }).click()
  await expect(summary).toContainText('Your take')
  await expect(summary).toContainText('Mondays are the hard ones')
  await expect(summary).not.toContainText('Possible insight')
  await view.getByRole('button', { name: 'Done' }).click()

  const another = await saveAndStay(page, 'Commute', 'It used up my energy')
  await another.getByRole('button', { name: 'Not quite' }).click()
  await expect(another.getByRole('region', { name: 'Summary' })).not.toContainText('Possible insight')
})

test('"Remember this" lands in Insights → What I\'m learning', async ({ page }) => {
  const view = await saveAndStay(page, 'Piano practice', 'It gave me energy')
  await view.getByRole('button', { name: 'Remember this' }).click()
  await view.getByLabel('What exactly?').fill('Small steps beat big plans')
  await view.getByRole('button', { name: 'Keep this' }).click()
  await expect(view.getByRole('region', { name: 'Next step' })).toContainText('To remember')
  await view.getByRole('button', { name: 'Done' }).click()
  await page.goto('./#/insights')
  await expect(page.locator('section.card', { has: page.getByRole('heading', { name: "What I'm learning" }) })).toContainText('Small steps beat big plans')
})

test('Entries: everything, newest first, unfinished on top, found by any word', async ({ page }) => {
  await addEntry(page, { activity: 'Team meeting', energy: 'It used up my energy', reflect: ['Long agenda, no decisions'] })
  await addEntry(page, { activity: 'Evening run', energy: 'It gave me energy' })
  await page.getByRole('button', { name: 'Write freely' }).click()
  await page.getByRole('dialog', { name: 'Write freely' }).getByLabel("What's on your mind?").fill('Thinking about the move')
  await page.getByRole('dialog', { name: 'Write freely' }).getByRole('button', { name: 'Save' }).click()
  await closeSaved(page, 'Thinking about the move')
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  await page.getByRole('dialog', { name: 'New activity' }).getByLabel('What did you do?').fill('Gym')
  await page.getByRole('dialog', { name: 'New activity' }).getByRole('button', { name: 'Next' }).click()
  await page.waitForTimeout(700) // the draft saves half a second after the last change
  await page.getByRole('dialog', { name: 'New activity' }).getByRole('button', { name: 'Close' }).click()

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Entries' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Entries' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Unfinished' })).toContainText('Gym')
  const list = page.locator('main .entry-list')
  await expect(list.getByRole('button')).toHaveCount(4)

  await page.getByLabel('Search your entries').fill('agenda')
  await expect(list.getByRole('button')).toHaveCount(1)
  await expect(list.getByRole('button')).toContainText('Team meeting')
  await page.getByLabel('Search your entries').fill('nothing like this')
  await expect(page.getByText('Nothing matches that yet.')).toBeVisible()
  await page.getByLabel('Search your entries').fill('')

  await entryButton(page, 'Evening run').click()
  const view = page.getByRole('dialog', { name: 'Evening run' })
  await expect(view.getByRole('region', { name: 'Summary' })).toContainText('It gave you energy')
  await view.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit activity' })).toBeVisible()
})
