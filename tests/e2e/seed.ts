import { writeFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'

// Fictional data, dated relative to today so the tests never go stale.
const DAY = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')

export function dateKey(daysAgo: number, now: Date = new Date()): string {
  const d = new Date(now.getTime() - daysAgo * DAY)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Five days of activities (yesterday back to 5 days ago), small joys, and a review schedule of every 2 days.
 * Known answers: gives energy = Deep work (+2.0, 5×), Evening run (+1.0, 3×); drains = Commute (−2.0, 4×),
 * Team meeting (−1.0, 4×); flow = Deep work 3 of 5; where = Home +2.0, Office −1.0; with = Alex −1.0.
 */
export function seedBackup(now: Date = new Date()) {
  const entries: object[] = []
  const add = (daysAgo: number, activity: string, energy: number, engagement: number, extra: object = {}) => {
    const at = now.getTime() - daysAgo * DAY
    entries.push({
      id: `seed-${entries.length}`,
      date: dateKey(daysAgo, now),
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
  const joy = (daysAgo: number, smallJoy: string) => ({ date: dateKey(daysAgo, now), smallJoy, createdAt: 1, updatedAt: 1 })
  return {
    app: 'life-design',
    kind: 'backup',
    schemaVersion: 3,
    exportedAt: now.toISOString(),
    data: {
      entries,
      days: [joy(1, 'Coffee in the sun'), joy(2, 'Sun on the balcony'), joy(3, 'Coffee with Alex')],
      answers: [],
      ikigaiItems: [],
      odysseyPlans: [],
      reviews: [],
      settings: [{ key: 'reviewSchedule', value: { kind: 'days', every: 2 }, updatedAt: 1 }],
    },
  }
}

/** A backup in today's format (8) with just the records given; every other table empty. */
export function backupWith(data: Record<string, unknown[]>, now: Date = new Date()) {
  const tables = ['entries', 'days', 'answers', 'ikigaiItems', 'odysseyPlans', 'planVersions', 'views', 'weeks', 'steps', 'aiReviews', 'reviews', 'settings', 'photos']
  return { app: 'life-design', kind: 'backup', schemaVersion: 8, exportedAt: now.toISOString(), data: Object.fromEntries(tables.map((t) => [t, data[t] ?? []])) }
}

/** Free writing as the box saves it, `daysAgo` days back at noon. */
export function freeWriting(id: string, note: string, daysAgo: number, now: Date = new Date()) {
  const date = dateKey(daysAgo, now)
  const at = new Date(`${date}T12:00:00`).getTime()
  return {
    id,
    date,
    part: 'afternoon',
    activity: '',
    engagement: 3,
    energy: 0,
    flow: false,
    where: [],
    people: [],
    objects: [],
    during: [],
    after: [],
    note,
    source: 'evening',
    kind: 'free',
    purpose: 'free',
    skipped: ['engagement', 'energy'],
    status: 'done',
    createdAt: at,
    updatedAt: at,
  }
}

/** Restores the fictional data through the app's own Restore screen (dated relative to `now`). */
export async function restoreSeed(page: Page, path: string, now: Date = new Date()) {
  await restoreBackup(page, path, seedBackup(now))
}

/** Restores a backup through the app's own Restore screen. */
export async function restoreBackup(page: Page, path: string, backup: object) {
  await writeFile(path, JSON.stringify(backup))
  await page.goto('./#/more/backup')
  await page.getByRole('button', { name: 'Restore from a backup file' }).click()
  const dialog = page.getByRole('dialog', { name: 'Restore' })
  await dialog.locator('input[type="file"]').setInputFiles(path)
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(dialog.getByText('✓ Restored.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
}
