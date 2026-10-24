import { expect, test } from '@playwright/test'
import { addEntries, addEntry, captureBox, entryButton, writeEntry } from './helpers'

// After an entry (Stage E and F) and the Logs tab (Entries until 2026-10-23). Fictional example data. Since v0.15
// new writing goes in Today's one box; activities from before then are restored, as a phone has them.

test.beforeEach(async ({ page }) => {
  await page.goto('./#/today')
})

test('after saving, your writing reads back first; a next step is kept, nothing to tick', async ({ page }) => {
  await captureBox(page).click()
  const sheet = page.getByRole('dialog', { name: 'Write freely' })
  await sheet.getByLabel("What's on your mind?").fill('Long agenda, no decisions. We ran over.')
  await sheet.getByRole('button', { name: 'Save' }).click()
  const view = page.getByRole('dialog', { name: 'Free writing' })
  await expect(view.getByText(/✓ Saved · Today, (morning|afternoon|evening)/)).toBeVisible()
  const entry = view.getByRole('region', { name: 'Your entry' })
  await expect(entry.getByRole('button', { name: /^Your words/ })).toContainText('Long agenda, no decisions. We ran over.')
  // Nothing restated, nothing guessed from one entry.
  await expect(view).not.toContainText('What happened')
  await expect(view.getByRole('region', { name: 'Possible insight' })).toHaveCount(0)
  // Delete and Done share one row, leaving the reading more room; there's no separate Edit (v0.12.3).
  await expect(view.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  const remove = await view.getByRole('button', { name: 'Delete' }).boundingBox()
  const done = await view.getByRole('button', { name: 'Done', exact: true }).boundingBox()
  expect(remove?.y).toBe(done?.y)

  await view.getByRole('button', { name: 'Try something differently' }).click()
  await view.getByLabel('What exactly?').fill('Ask for an agenda first')
  await view.getByRole('button', { name: 'Keep this' }).click()
  const step = view.getByRole('region', { name: 'Next step' })
  // Written for the future: nothing to tick now (owner: "how can I have done it?"); it opens your list.
  await expect(step.getByRole('link', { name: /^Next step/ })).toContainText('Ask for an agenda first')
  for (const name of ['Done it', 'Let it go', 'Remove']) await expect(step.getByRole('button', { name })).toHaveCount(0)
  await view.getByRole('button', { name: 'Done', exact: true }).click()

  await entryButton(page, 'Free writing').click()
  await expect(page.getByRole('dialog', { name: 'Free writing' }).getByRole('region', { name: 'Next step' })).toContainText('Ask for an agenda first')
})

test('an earlier activity reads as its parts, in plain words, with the red edge of what it did to your energy', async ({ page }) => {
  await addEntry(page, { activity: 'Team meeting', during: ['Distracted'], energy: 'It used up my energy', after: ['Frustrated'], writing: 'Long agenda, no decisions. We ran over.' })
  await entryButton(page, 'Team meeting').click()
  const view = page.getByRole('dialog', { name: 'Team meeting' })
  const entry = view.getByRole('region', { name: 'Your entry' })
  await expect(entry.getByRole('button', { name: /^What it was like/ })).toContainText('distracted')
  const energy = entry.getByRole('button', { name: /^What it did to your energy/ })
  await expect(energy).toContainText('It used up my energy')
  await expect(energy.locator('[data-energy="takes"]')).toHaveCount(1)
  await expect(entry.getByRole('button', { name: /^How you felt/ })).toContainText('frustrated')
  await expect(entry.getByRole('button', { name: /^Your words/ })).toContainText('Long agenda, no decisions. We ran over.')
  // One entry is not a pattern: nothing is guessed.
  await expect(view.getByRole('region', { name: 'Possible insight' })).toHaveCount(0)
})

test('a possible insight needs 3+ entries, lists them, and is yours to dismiss or put your own way', async ({ page }) => {
  await addEntries(page, [1, 2, 3].map(() => ({ activity: 'Commute', energy: 'It used up my energy' as const })))
  await entryButton(page, 'Commute').first().click()
  const view = page.getByRole('dialog', { name: 'Commute' })
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

  await entryButton(page, 'Commute').nth(1).click()
  await view.getByRole('button', { name: 'Not quite' }).click()
  await expect(view.getByRole('region', { name: 'Possible insight' })).toHaveCount(0)
})

test('"Remember this" lands in Insights → What you\'re learning', async ({ page }) => {
  await writeEntry(page, 'Practised the piano for ten minutes, and it stuck')
  await entryButton(page, 'Free writing').click()
  const view = page.getByRole('dialog', { name: 'Free writing' })
  await view.getByRole('button', { name: 'Remember this' }).click()
  await view.getByLabel('What exactly?').fill('Small steps beat big plans')
  await view.getByRole('button', { name: 'Keep this' }).click()
  await expect(view.getByRole('region', { name: 'Next step' }).getByRole('button', { name: /^To remember/ })).toContainText('Small steps beat big plans')
  await view.getByRole('button', { name: 'Done', exact: true }).click()
  await page.goto('./#/insights')
  await expect(page.locator('section.card', { has: page.getByRole('heading', { name: "What you're learning" }) })).toContainText('Small steps beat big plans')
})

test('Logs: everything, newest first, unfinished on top, found by any word', async ({ page }) => {
  await addEntries(page, [
    { activity: 'Team meeting', energy: 'It used up my energy', writing: 'Long agenda, no decisions' },
    { activity: 'Evening run', energy: 'It gave me energy' },
    { activity: 'Gym', draft: true },
  ])
  await writeEntry(page, 'Thinking about the move') // free writing is called that; its words show in the row

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Logs' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Logs' })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search your logs' })).toHaveAttribute('placeholder', 'Search your logs')
  await expect(page.getByRole('region', { name: 'Unfinished' })).toContainText('Gym')
  const list = page.locator('main .entry-list')
  await expect(list.getByRole('button')).toHaveCount(4)

  await page.getByLabel('Search your logs').fill('agenda')
  await expect(list.getByRole('button')).toHaveCount(1)
  await expect(list.getByRole('button')).toContainText('Team meeting')
  await page.getByLabel('Search your logs').fill('nothing like this')
  await expect(page.getByText('Nothing matches that yet.')).toBeVisible()
  await page.getByLabel('Search your logs').fill('')

  await entryButton(page, 'Evening run').click()
  const view = page.getByRole('dialog', { name: 'Evening run' })
  await expect(view.getByRole('button', { name: /^What it did to your energy/ })).toContainText('It gave me energy')
  await view.getByRole('button', { name: /^What it was like/ }).click()
  await expect(page.getByRole('dialog', { name: 'Evening run' }).getByRole('heading', { name: 'What was it like?' })).toBeVisible()
})
