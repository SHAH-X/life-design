import { expect, type Page, test } from '@playwright/test'
import { expectAboveKeyboard, fakeKeyboard, showKeyboard } from './helpers'
import { restoreSeed } from './seed'

// Phase 3b "Try": the Ikigai map and prototypes. Fictional example data.

const group = (page: Page, title: string | RegExp) =>
  page.locator('section', { has: page.getByRole('heading', { name: title, exact: typeof title === 'string' }) })

test('the Life Design list leads on to the Ikigai map and prototypes', async ({ page }) => {
  await page.goto('./#/design')
  await expect(page.getByRole('link', { name: /^Ikigai map/ })).toContainText('Not yet')
  await expect(page.getByRole('link', { name: /^Prototypes/ })).toContainText('Not yet')
  await page.getByRole('link', { name: /^Ikigai map/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ikigai map' })).toBeVisible()
  await page.getByRole('link', { name: '‹ Life Design' }).click()
  await page.getByRole('link', { name: /^Prototypes/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Prototypes' })).toBeVisible()
})

test('the Ikigai map: name it, tap what is true, and it lands in its group, in words', async ({ page }) => {
  await page.goto('./#/design/ikigai')
  await page.getByRole('button', { name: '+ Add' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add to the map' })
  await sheet.getByLabel('What is it?').fill('Writing')
  for (const statement of ['I love it', "I'm good at it", 'The world needs it']) await sheet.getByRole('button', { name: statement }).click()
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet).toBeHidden()

  await expect(group(page, 'Close to Ikigai')).toContainText('Writing')
  await expect(group(page, 'Close to Ikigai')).toContainText('Not yet: could be paid for it')

  await group(page, 'Close to Ikigai').getByRole('button', { name: /^Writing/ }).click()
  const edit = page.getByRole('dialog', { name: 'Writing' })
  await expect(edit.getByRole('button', { name: 'I love it' })).toHaveAttribute('aria-pressed', 'true')
  await edit.getByRole('button', { name: 'I could be paid for it' }).click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(group(page, 'Ikigai candidates')).toContainText('Writing')
  await expect(group(page, 'Close to Ikigai')).toHaveCount(0)
  // Never a count or a score (v1 ranked items "x/4").
  await expect(page.locator('main')).not.toContainText(/\d\s*(\/|of)\s*4/)

  await page.reload()
  await expect(group(page, 'Ikigai candidates')).toContainText('Writing')
})

test('your days suggest what keeps giving you energy; linked activities add evidence in words', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'))
  await page.goto('./#/design/ikigai')
  const suggest = group(page, 'Your days suggest')
  await expect(suggest.getByRole('listitem')).toHaveText([/^Deep work on the report/, /^Evening run/])

  await suggest.getByRole('button', { name: 'Add Deep work on the report' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add to the map' })
  await expect(sheet.getByLabel('What is it?')).toHaveValue('Deep work on the report')
  const linked = sheet.getByRole('group', { name: 'Which activities are part of it?' })
  await expect(linked.getByRole('button', { name: 'Deep work on the report', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'I love it' }).click()
  await sheet.getByRole('button', { name: "I'm good at it" }).click()
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()

  const passion = group(page, /^Passion/)
  await expect(passion).toContainText('Deep work on the report: almost always gives energy · 5 times · time flew 3 times')
  await expect(suggest.getByRole('listitem')).toHaveText([/^Evening run/])
})

test('the Ikigai sheet sits above the keyboard', async ({ page }) => {
  await fakeKeyboard(page)
  await page.goto('./#/design/ikigai')
  await page.getByRole('button', { name: '+ Add' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add to the map' })
  await showKeyboard(page)
  await expectAboveKeyboard(page, sheet.getByLabel('What is it?'))
  await expectAboveKeyboard(page, sheet.getByRole('button', { name: 'Add', exact: true }))
})

test('plan a prototype from a plan question, then mark it done in words', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'), new Date(), { tryOut: true })
  await page.goto('./#/design')
  await expect(page.getByRole('link', { name: /^Prototypes/ })).toContainText('1 planned · 1 done')
  await page.goto('./#/design/prototypes')

  await page.getByRole('button', { name: '+ New prototype' }).click()
  const sheet = page.getByRole('dialog', { name: 'New prototype' })
  // Your plans' questions, and what is missing on your Ikigai map, are one tap away.
  await expect(sheet.getByRole('button', { name: 'Could I be paid for writing?' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Would I enjoy teaching every day?' }).click()
  await expect(sheet.getByRole('heading', { name: 'How will you find out?' })).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Next' })).toBeDisabled() // nothing preselected
  await sheet.getByRole('button', { name: 'Talk to someone' }).click()
  await sheet.getByLabel('Who?').fill('Maria, a design tutor')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await sheet.getByLabel('When?').fill('2026-10-30')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()

  const planned = group(page, 'Planned')
  const mine = planned.getByRole('button', { name: /^Would I enjoy teaching every day\?/ })
  await expect(mine).toContainText('Talk to Maria, a design tutor')
  await expect(mine).toContainText('Plan 3')

  await mine.click()
  await page.getByRole('dialog', { name: 'Prototype' }).getByRole('button', { name: 'I did it' }).click()
  const done = page.getByRole('dialog', { name: 'Done' })
  await done.getByRole('button', { name: 'Need a start?' }).click()
  await done.getByRole('button', { name: 'I learned that…' }).click()
  await done.getByLabel('What did you learn?').press('End')
  await done.getByLabel('What did you learn?').pressSequentially('evening classes pay')
  await done.getByRole('button', { name: 'Next' }).click()
  await expect(done.getByRole('heading', { name: 'How did it leave you?' })).toBeVisible()
  await done.getByRole('button', { name: 'Energised', exact: true }).click()
  await done.getByRole('button', { name: 'Next' }).click()
  await done.getByRole('button', { name: 'Keep exploring' }).click()
  await done.getByRole('button', { name: 'Save' }).click()
  await expect(done).toBeHidden()

  const finished = group(page, 'Done').getByRole('button', { name: /^Would I enjoy teaching every day\?/ })
  await expect(finished).toContainText('I learned that evening classes pay')
  await expect(finished).toContainText('energised')
  await expect(finished).toContainText('Keep exploring')
  await expect(finished).toHaveAttribute('data-energy', 'gives')
  await expect(page.locator('main')).not.toContainText(/overdue/i)
})

test('a review follows up on planned prototypes, and "not yet" is fine', async ({ page }, testInfo) => {
  await restoreSeed(page, testInfo.outputPath('seed.json'), new Date(), { tryOut: true })
  await page.goto('./#/review')
  await page.getByRole('button', { name: /^(Start review|Review now)$/ }).click()
  for (const step of ['At a glance', 'Balance', 'Best and worst moments']) {
    await expect(page.getByRole('heading', { level: 1, name: step })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Experiments' })).toBeVisible()
  await expect(page.getByText("Not yet is fine: it'll be here next time.")).toBeVisible()
  const item = page.getByRole('listitem').filter({ hasText: 'Could I live on less?' })
  await item.getByRole('button', { name: 'I did it' }).click()
  const done = page.getByRole('dialog', { name: 'Done' })
  await done.getByLabel('What did you learn?').fill('A tight month was easier than I feared')
  await done.getByRole('button', { name: 'Next' }).click()
  await done.getByRole('button', { name: 'Calm', exact: true }).click()
  await done.getByRole('button', { name: 'Next' }).click()
  await done.getByRole('button', { name: 'Enough for now' }).click()
  await done.getByRole('button', { name: 'Save' }).click()
  // It stays in the list, marked done, so nothing moves away mid-review.
  await expect(item).toContainText('Done')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your reflection' })).toBeVisible()
})
