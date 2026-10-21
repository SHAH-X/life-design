import { writeFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'

// Fictional data, dated relative to today so the tests never go stale.
const DAY = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')

export function dateKey(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * DAY)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Five days of activities (yesterday back to 5 days ago), small joys, and a review schedule of every 2 days.
 * Known answers: gives energy = Deep work (+2.0, 5×), Evening run (+1.0, 3×); drains = Commute (−2.0, 4×),
 * Team meeting (−1.0, 4×); flow = Deep work 3 of 5; where = Home +2.0, Office −1.0; with = Alex −1.0.
 */
export function seedBackup() {
  const entries: object[] = []
  const add = (daysAgo: number, activity: string, energy: number, engagement: number, extra: object = {}) => {
    const at = Date.now() - daysAgo * DAY
    entries.push({
      id: `seed-${entries.length}`,
      date: dateKey(daysAgo),
      part: 'morning',
      activity,
      engagement,
      energy,
      flow: false,
      where: [],
      people: [],
      objects: [],
      note: '',
      source: 'evening',
      createdAt: at,
      updatedAt: at,
      ...extra,
    })
  }
  for (let d = 1; d <= 5; d += 1) add(d, 'Deep work on the report', 2, 5, { flow: d % 2 === 1, where: ['Home'], objects: ['Laptop'] })
  for (let d = 1; d <= 4; d += 1) add(d, 'Team meeting', -1, 2, { where: ['Office'], people: ['Alex'], part: 'afternoon' })
  for (let d = 1; d <= 4; d += 1) add(d, 'Commute', -2, 1, { part: 'evening' })
  for (let d = 1; d <= 3; d += 1) add(d, 'Evening run', 1, 4, { part: 'evening' })
  add(2, 'Cooking dinner', 2, 4)
  const joy = (daysAgo: number, smallJoy: string) => ({ date: dateKey(daysAgo), smallJoy, createdAt: 1, updatedAt: 1 })
  return {
    app: 'life-design',
    kind: 'backup',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    data: {
      entries,
      days: [joy(1, 'Coffee in the sun'), joy(2, 'Sun on the balcony'), joy(3, 'Coffee with Alex')],
      ikigaiItems: [],
      odysseyPlans: [],
      reviews: [],
      settings: [{ key: 'reviewSchedule', value: { kind: 'days', every: 2 }, updatedAt: 1 }],
    },
  }
}

/** Restores the fictional data through the app's own Restore screen. */
export async function restoreSeed(page: Page, path: string) {
  await writeFile(path, JSON.stringify(seedBackup()))
  await page.goto('./#/more')
  await page.getByRole('button', { name: 'Restore from a backup file' }).click()
  const dialog = page.getByRole('dialog', { name: 'Restore' })
  await dialog.locator('input[type="file"]').setInputFiles(path)
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(dialog.getByText('✓ Restored.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
}
