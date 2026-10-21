import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// Fictional example data.
const DAY = 86_400_000
const V1_FIXTURE = fileURLToPath(new URL('../fixtures/v1-backup.json', import.meta.url))
const DATE_1_OCT = /Oct 1, 2026|1 Oct 2026/

test('write Plan 3 through the guided screens; its card reads in words', async ({ page }) => {
  await page.goto('./#/design')
  const plans = page.getByRole('link', { name: /^Odyssey Plans/ })
  await expect(plans).toContainText('0 of 3 written')
  await plans.click()
  await page.getByRole('link', { name: /If money and image didn't matter/ }).click()

  await expect(page.getByRole('heading', { level: 1, name: "What's this life about?" })).toBeVisible()
  await page.getByRole('textbox', { name: "What's this life about?" }).fill('Teaching design part-time by the sea, more time outdoors')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Year 1').fill('Move to Lisbon\nLearn Portuguese')
  await page.getByLabel('Year 2').fill('Teach my first course')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('textbox', { name: 'A six-word title' }).fill('Teaching design by the Lisbon sea')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Question 1').fill('Would I enjoy teaching every day?')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Excited', exact: true }).click()
  await page.getByRole('button', { name: 'Scared', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Money', exact: true }).click()
  await page.getByLabel('What exactly?').fill('Savings for a year')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('link', { name: 'Write them first ›' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Does it fit your Workview and Lifeview?' }).fill('Yes: work as service. Far from family, though.')
  await page.getByRole('button', { name: 'Finish' }).click()

  const card = page.getByRole('link', { name: /If money and image didn't matter/ })
  await expect(card).toContainText('Teaching design by the Lisbon sea')
  await expect(card).toContainText('excited · scared')
  await expect(card).toContainText('Needs: money')

  // A written plan opens as one page, saved as you edit.
  await card.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Teaching design by the Lisbon sea' })).toBeVisible()
  await expect(page.getByLabel('Year 1')).toHaveValue('Move to Lisbon\nLearn Portuguese')
  await expect(page.getByRole('button', { name: 'Excited', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Hopeful', exact: true }).click()
  await page.getByRole('link', { name: '‹ Odyssey Plans' }).click()
  await expect(card).toContainText('excited · scared · hopeful')
  await page.goto('./#/design')
  await expect(plans).toContainText('1 of 3 written')
})

test('a half-written plan picks up where you left off', async ({ page }) => {
  await page.goto('./#/design/plan-2')
  await page.getByRole('textbox', { name: "What's this life about?" }).fill('Running a small bakery')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Year 1').fill('Learn to bake bread')
  await page.getByRole('link', { name: '‹ Odyssey Plans' }).click()

  const card = page.getByRole('link', { name: /If that path vanished/ })
  await expect(card).toContainText('Continue ›')
  await card.click()
  await expect(page.getByRole('heading', { level: 1, name: 'A six-word title' })).toBeVisible()
})

test('an edit made a week or more later keeps the plan as it was, dated and read-only', async ({ page }) => {
  const start = new Date(2026, 9, 1, 20, 0)
  await page.clock.setFixedTime(start)
  await page.goto('./#/design/plan-1')
  await page.getByRole('textbox', { name: "What's this life about?" }).fill('Leading the analytics team')
  for (let i = 0; i < 6; i += 1) await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByRole('link', { name: /Your current path/ }).click()
  await page.getByRole('textbox', { name: 'A six-word title' }).fill('Leading analytics, home by six')
  await page.waitForTimeout(900) // saved after a pause
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Earlier versions' })).toHaveCount(0) // same week: edited in place

  await page.clock.setFixedTime(new Date(start.getTime() + 8 * DAY))
  await page.reload()
  await page.getByRole('textbox', { name: 'A six-word title' }).fill('Leading the data team, home by six')
  await page.waitForTimeout(900)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Earlier versions' })).toBeVisible()
  await page.getByRole('link', { name: DATE_1_OCT }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Leading analytics, home by six' })).toBeVisible()
  await expect(page.locator('main textarea, main input')).toHaveCount(0) // read-only
})

test('Workview, Lifeview and how they fit save as you type, with a version after a week', async ({ page }) => {
  const start = new Date(2026, 9, 1, 20, 0)
  await page.clock.setFixedTime(start)
  await page.goto('./#/design/views')
  await page.getByLabel('What is work for, to you?').fill('Work is how I serve others and keep learning.')
  await page.getByLabel('What is life for, to you?').fill('Life is for people and curiosity.')
  await page.getByLabel(/Where do they agree/).fill('They agree on service.')
  await page.getByRole('button', { name: 'What could the Workview cover?' }).click()
  await expect(page.getByText(/What makes work good or worthwhile/)).toBeVisible()
  await page.waitForTimeout(900)
  await page.reload()
  await expect(page.getByLabel('What is work for, to you?')).toHaveValue('Work is how I serve others and keep learning.')
  await expect(page.getByLabel(/Where do they agree/)).toHaveValue('They agree on service.')

  await page.clock.setFixedTime(new Date(start.getTime() + 9 * DAY))
  await page.reload()
  await page.getByLabel('What is work for, to you?').fill('Work is craft and service.')
  await page.waitForTimeout(900)
  await page.reload()
  await expect(page.getByLabel('What is work for, to you?')).toHaveValue('Work is craft and service.')
  await page.getByRole('link', { name: DATE_1_OCT }).click()
  await expect(page.getByText('Work is how I serve others and keep learning.')).toBeVisible()

  await page.goto('./#/design')
  await expect(page.getByRole('link', { name: /^Workview & Lifeview/ })).toContainText('Written')
})

test('a plan from the v1 app shows its title and words, never its old slider numbers', async ({ page }) => {
  await page.goto('./#/more/backup')
  await page.getByRole('button', { name: 'Restore from a backup file' }).click()
  const dialog = page.getByRole('dialog', { name: 'Restore' })
  await dialog.locator('input[type="file"]').setInputFiles(V1_FIXTURE)
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(dialog.getByText('✓ Restored.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await page.goto('./#/design/odyssey')
  const card = page.getByRole('link', { name: /Your current path/ })
  await expect(card).toContainText('Open a small bakery')
  await card.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Open a small bakery' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: "What's this life about?" })).toHaveValue('Early mornings, a busy counter')
  await expect(page.getByLabel('Question 1')).toHaveValue('Would I enjoy early starts?')
  expect(await page.locator('main').innerText()).not.toMatch(/\b\d+\s*\/\s*(?:10|40)\b|out of 40/)
})
