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
export interface SeedOptions {
  /**
   * Also an Odyssey Plan with questions, three Ikigai items and two prototypes (one planned, one done). Off by
   * default: a planned prototype adds an "Experiments" step to the review.
   */
  tryOut?: boolean
}

/** Phase 3b's fictional Ikigai items, plan and prototypes. */
function tryOutData(now: Date) {
  const at = now.getTime()
  const circles = (text: string, on: string) => ({
    id: `seed-iki-${text}`,
    text,
    love: on.includes('L'),
    goodAt: on.includes('G'),
    worldNeeds: on.includes('N'),
    paidFor: on.includes('P'),
    linkedActivities: [],
    notes: '',
    createdAt: at,
    updatedAt: at,
  })
  const prototype = (id: string, over: object) => ({
    id,
    question: '',
    planSlot: null,
    how: 'talk',
    withWhat: '',
    when: null,
    doneAt: null,
    learned: '',
    after: [],
    next: null,
    createdAt: at,
    updatedAt: at,
    ...over,
  })
  return {
    odysseyPlans: [
      {
        id: 'plan-3',
        slot: 3,
        title: 'Teaching design by the sea',
        description: 'Teaching part-time, more time outdoors',
        years: [[], [], [], [], []],
        questions: ['Would I enjoy teaching every day?', 'Could I live on less?'],
        feelings: ['Excited'],
        needs: ['money'],
        needsNote: '',
        fit: '',
        notes: '',
        writtenAt: at,
        createdAt: at,
        updatedAt: at,
      },
    ],
    ikigaiItems: [circles('Teaching design', 'LGNP'), circles('Writing', 'LGN'), circles('Cooking', 'LG')],
    prototypes: [
      prototype('seed-proto-planned', { question: 'Could I live on less?', planSlot: 3, how: 'try', withWhat: 'a month on a tight budget' }),
      prototype('seed-proto-done', {
        question: "What is a design tutor's week like?",
        how: 'talk',
        withWhat: 'Maria, a design tutor',
        doneAt: at,
        learned: 'Most of the week is marking, not teaching',
        after: ['Inspired'],
        next: 'more',
      }),
    ],
  }
}

export function seedBackup(now: Date = new Date(), options: SeedOptions = {}) {
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
  const tryOut = options.tryOut ? tryOutData(now) : { odysseyPlans: [], ikigaiItems: [], prototypes: [] }
  return {
    app: 'life-design',
    kind: 'backup',
    schemaVersion: options.tryOut ? 5 : 3,
    exportedAt: now.toISOString(),
    data: {
      entries,
      days: [joy(1, 'Coffee in the sun'), joy(2, 'Sun on the balcony'), joy(3, 'Coffee with Alex')],
      answers: [],
      ikigaiItems: tryOut.ikigaiItems,
      odysseyPlans: tryOut.odysseyPlans,
      prototypes: tryOut.prototypes,
      reviews: [],
      settings: [{ key: 'reviewSchedule', value: { kind: 'days', every: 2 }, updatedAt: 1 }],
    },
  }
}

/** Restores the fictional data through the app's own Restore screen (dated relative to `now`). */
export async function restoreSeed(page: Page, path: string, now: Date = new Date(), options: SeedOptions = {}) {
  await writeFile(path, JSON.stringify(seedBackup(now, options)))
  await page.goto('./#/more/backup')
  await page.getByRole('button', { name: 'Restore from a backup file' }).click()
  const dialog = page.getByRole('dialog', { name: 'Restore' })
  await dialog.locator('input[type="file"]').setInputFiles(path)
  await dialog.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(dialog.getByText('✓ Restored.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
}
