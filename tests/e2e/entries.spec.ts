import { expect, type Page, test } from '@playwright/test'
import { addEntry, closeSaved, entryButton } from './helpers'

// After an entry (Stage E and F) and the Entries tab. Fictional example data.

test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

/** Reflects on an activity and stays on what it reads back afterwards. */
async function saveAndStay(page: Page, activity: string, energy: string, writing?: string) {
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill(activity)
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: 'Distracted', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByRole('button', { name: energy }).click()
  await sheet.getByRole('button', { name: 'Frustrated', exact: true }).click()
  await sheet.getByRole('button', { name: 'Next' }).click()
  if (writing) await sheet.getByLabel("What's on your mind about it?").fill(writing)
  await sheet.getByRole('button', { name: 'Save' }).click()
  const view = page.getByRole('dialog', { name: activity })
  await expect(view.getByText('✓ Saved')).toBeVisible()
  return view
}

test('after saving, your entry reads back first: the words you tapped, then what you wrote; a next step is kept, nothing to tick', async ({ page }) => {
  const view = await saveAndStay(page, 'Team meeting', 'It used up my energy', 'Long agenda, no decisions. We ran over.')
  await expect(view.getByText(/✓ Saved · Today, (morning|afternoon|evening)/)).toBeVisible()
  // The energy answer first, with its red edge, then the words.
  const words = view.getByRole('list', { name: 'How it was' }).getByRole('listitem')
  await expect(words).toHaveText(['used up energy', 'distracted', 'frustrated'])
  await expect(words.first()).toHaveAttribute('data-energy', 'takes')
  await expect(view.getByRole('region', { name: 'Your words' })).toHaveText('Long agenda, no decisions. We ran over.')
  // Nothing restated: no summary repeating the entry.
  await expect(view).not.toContainText('What happened')
  await expect(view).not.toContainText('What you noticed')
  // One entry is not a pattern: nothing is guessed.
  await expect(view.getByRole('region', { name: 'Possible insight' })).toHaveCount(0)
  // Edit and Done share one row, leaving the reading more room.
  const edit = await view.getByRole('button', { name: 'Edit' }).boundingBox()
  const done = await view.getByRole('button', { name: 'Done', exact: true }).boundingBox()
  expect(edit?.y).toBe(done?.y)

  await view.getByRole('button', { name: 'Try something differently' }).click()
  await view.getByLabel('What exactly?').fill('Ask for an agenda first')
  await view.getByRole('button', { name: 'Keep this' }).click()
  const step = view.getByRole('region', { name: 'Next step' })
  await expect(step).toContainText('Next step: Ask for an agenda first')
  // Written for the future: nothing to tick now (owner: "how can I have done it?").
  for (const name of ['Done it', 'Let it go', 'Remove']) await expect(step.getByRole('button', { name })).toHaveCount(0)
  await expect(step.getByRole('link', { name: 'Next steps ›' })).toBeVisible()
  await view.getByRole('button', { name: 'Done', exact: true }).click()

  await entryButton(page, 'Team meeting').click()
  await expect(page.getByRole('dialog', { name: 'Team meeting' }).getByRole('region', { name: 'Next step' })).toContainText('Ask for an agenda first')
})

test('a possible insight needs 3+ entries, lists them, and is yours to dismiss or put your own way', async ({ page }) => {
  for (let i = 0; i < 2; i += 1) await addEntry(page, { activity: 'Commute', energy: 'It used up my energy' })
  const view = await saveAndStay(page, 'Commute', 'It used up my energy')
  const insight = view.getByRole('region', { name: 'Possible insight' })
  await expect(insight).toContainText('Commute has used up your energy in 3 of your 3 entries about it. What would make it easier?')
  // Its own card, with the red edge of what it says.
  await expect(insight).toHaveAttribute('data-energy', 'takes')
  await insight.getByText('See the 3 entries').click()
  await expect(insight.locator('details.evidence li')).toHaveCount(3)

  await insight.getByRole('button', { name: 'Say it your way' }).click()
  await view.getByLabel('Your take').fill('Mondays are the hard ones')
  await view.getByRole('button', { name: 'Keep my take' }).click()
  await expect(view.getByRole('region', { name: 'Your take' })).toContainText('Mondays are the hard ones')
  await expect(view.getByRole('region', { name: 'Possible insight' })).toHaveCount(0)
  await view.getByRole('button', { name: 'Done', exact: true }).click()

  const another = await saveAndStay(page, 'Commute', 'It used up my energy')
  await another.getByRole('button', { name: 'Not quite' }).click()
  await expect(another.getByRole('region', { name: 'Possible insight' })).toHaveCount(0)
})

test('"Remember this" lands in Insights → What I\'m learning', async ({ page }) => {
  const view = await saveAndStay(page, 'Piano practice', 'It gave me energy')
  await view.getByRole('button', { name: 'Remember this' }).click()
  await view.getByLabel('What exactly?').fill('Small steps beat big plans')
  await view.getByRole('button', { name: 'Keep this' }).click()
  await expect(view.getByRole('region', { name: 'Next step' })).toContainText('To remember')
  await view.getByRole('button', { name: 'Done', exact: true }).click()
  await page.goto('./#/insights')
  await expect(page.locator('section.card', { has: page.getByRole('heading', { name: "What I'm learning" }) })).toContainText('Small steps beat big plans')
})

test('Entries: everything, newest first, unfinished on top, found by any word', async ({ page }) => {
  await addEntry(page, { activity: 'Team meeting', energy: 'It used up my energy', writing: 'Long agenda, no decisions' })
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
  await expect(view.getByRole('list', { name: 'How it was' })).toContainText('gave energy')
  await view.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit activity' })).toBeVisible()
})
