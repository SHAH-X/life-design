import { expect, test } from '@playwright/test'
import { eveningQuestion } from './helpers'
import { restoreSeed } from './seed'

/** The next evening (today or within two days) that is a "pattern" evening: day number divisible by 3. */
function nextPatternEvening(): Date {
  const now = new Date()
  for (let k = 0; k < 3; k += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 20, 0)
    if (Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000) % 3 === 0) return d
  }
  throw new Error('unreachable: one of three days in a row is divisible by 3')
}

test('the evening question saves as you type, can be swapped until answered, and differs day by day', async ({ page }) => {
  await page.goto('./#/today')
  const field = eveningQuestion(page)
  const question = field.locator('label.question-text')
  const first = (await question.textContent()) ?? ''
  expect(first).toMatch(/\?$/)

  await field.getByRole('button', { name: 'Another question' }).click()
  await expect(question).not.toHaveText(first)
  const second = (await question.textContent()) ?? ''

  await field.getByRole('button', { name: 'Why this question?' }).click()
  await expect(field.locator('.info-panel')).toBeVisible()

  await field.locator('textarea').fill('Naming it helped')
  await expect(field.getByText('Saved')).toBeVisible()
  await expect(field.getByRole('button', { name: 'Another question' })).toHaveCount(0) // answered: it stays

  await page.reload()
  await expect(eveningQuestion(page).locator('label.question-text')).toHaveText(second)
  await expect(eveningQuestion(page).locator('textarea')).toHaveValue('Naming it helped')

  await page.getByRole('button', { name: 'Previous day' }).click()
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible()
  await expect(eveningQuestion(page).locator('label.question-text')).not.toHaveText(second)
})

test('"Need a start?" under the evening question types in an opener that fits it', async ({ page }) => {
  await page.goto('./#/today')
  const field = eveningQuestion(page)
  await field.getByRole('button', { name: 'Need a start?' }).click()
  const openers = field.getByRole('group', { name: 'Openers' })
  await expect(openers.getByRole('button')).toHaveCount(3)
  const opener = ((await openers.getByRole('button').first().textContent()) ?? '').replace('…', ' ')
  await openers.getByRole('button').first().click()

  const box = field.locator('textarea')
  await expect(box).toHaveValue(opener)
  await expect(box).toBeFocused()
  await expect(field.getByRole('button', { name: 'Need a start?' })).toBeHidden()
  await box.press('End')
  await box.pressSequentially('the walk home')
  await expect(field.getByText('Saved')).toBeVisible()
  await page.reload()
  await expect(eveningQuestion(page).locator('textarea')).toHaveValue(`${opener}the walk home`)
})

test('some evenings ask about a pattern in your own last two weeks', async ({ page }, testInfo) => {
  const evening = nextPatternEvening()
  await page.clock.setFixedTime(evening)
  await restoreSeed(page, testInfo.outputPath('seed.json'), evening)
  await page.goto('./#/today')

  // Fictional fortnight: commute drained 4 times, deep work gave energy, time flew during it 3 times.
  const field = eveningQuestion(page)
  await expect(field.locator('label.question-text')).toHaveText(
    /^(Commute took your energy 4 times lately\. What about it drains you\?|Deep work on the report keeps giving you energy\. What is it about it\?|Time flew during deep work on the report 3 times lately\. What made that possible\?)$/,
  )
  await field.getByRole('button', { name: 'Why this question?' }).click()
  await expect(field.locator('.info-panel')).toContainText('A pattern from your last two weeks')
})

test('More → Evening question: choose purposes and set a goal', async ({ page }) => {
  await page.goto('./#/more/evening')
  for (const name of [/^Feel calmer/, /^Grow/, /^Reach a goal/, /^Learn/]) {
    await expect(page.getByRole('switch', { name })).toBeChecked()
  }
  await expect(page.getByText('Goal questions start once this is set.')).toBeVisible()
  await page.getByLabel("What's your goal?").fill('run a half marathon')
  await expect(page.getByText('Saved')).toBeVisible()
  await page.getByRole('switch', { name: /^Feel calmer/ }).uncheck()

  await page.reload()
  await expect(page.getByRole('switch', { name: /^Feel calmer/ })).not.toBeChecked()
  await expect(page.getByLabel("What's your goal?")).toHaveValue('run a half marathon')
  await page.getByRole('link', { name: '‹ More' }).click()
  await expect(page.getByRole('link', { name: /^Evening question/ })).toContainText('Grow · Reach a goal · Learn')
})
