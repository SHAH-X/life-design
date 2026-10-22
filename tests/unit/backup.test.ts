import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyImport, BACKUP_SCHEMA_VERSION, createBackup, detectFile, planImport, type RawData } from '../../src/db/backup'
import { lockText, unlockText } from '../../src/db/crypto'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { newReview } from '../../src/db/repo'
import { emptyPlan } from '../../src/domain/lifeDesign'
import { type AiReview, type Answer, type Entry, entryDefaults, type Step } from '../../src/db/types'

// Fictional example data.
const entry = (id: string, updatedAt: number, over: Partial<Entry> = {}): Entry => ({
  id,
  date: '2026-10-20',
  part: 'morning',
  activity: 'Gardening',
  engagement: 4,
  energy: 2,
  flow: true,
  where: ['Allotment'],
  people: [],
  objects: ['Spade'],
  during: ['Absorbed', 'Time flew'],
  after: ['Energised'],
  note: '',
  source: 'evening',
  createdAt: 1000,
  updatedAt,
  ...entryDefaults(),
  ...over,
})

const emptyRaw = (): RawData => ({
  entries: [],
  days: [],
  answers: [],
  ikigaiItems: [],
  odysseyPlans: [],
  planVersions: [],
  views: [],
  weeks: [],
  steps: [],
  aiReviews: [],
  reviews: [],
  settings: [],
})

let phone: LifeDesignDB
let newPhone: LifeDesignDB

beforeEach(() => {
  phone = openDb(`phone-${crypto.randomUUID()}`)
  newPhone = openDb(`new-phone-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await phone.delete()
  await newPhone.delete()
})

describe('backup and restore', () => {
  it('restores everything onto an empty phone, except the AI key', async () => {
    await phone.entries.bulkPut([entry('a', 1000), entry('b', 2000, { activity: 'Choir rehearsal' })])
    await phone.days.put({ date: '2026-10-20', smallJoy: 'Fresh bread', createdAt: 1000, updatedAt: 1000 })
    await phone.settings.bulkPut([
      { key: 'reminderDailyTime', value: '21:30', updatedAt: 1000 },
      { key: 'aiKey', value: 'gsk_test_secret', updatedAt: 1000 },
    ])

    const text = JSON.stringify(await createBackup(phone, new Date('2026-10-21T12:00:00Z')))
    expect(text).not.toContain('gsk_test_secret')
    expect(text).not.toContain('aiKey')

    const detected = detectFile(text)
    if (detected.format !== 'backup') throw new Error(`expected a backup, got ${detected.format}`)

    const preview = await planImport(detected.raw, newPhone)
    expect(preview.tables.entries).toEqual({ incoming: 2, added: 2, updated: 0, unchanged: 0, skipped: 0 })
    expect(await newPhone.entries.count()).toBe(0) // a preview changes nothing

    await applyImport(detected.raw, newPhone)
    expect(await newPhone.entries.toArray()).toEqual(await phone.entries.toArray())
    expect(await newPhone.days.get('2026-10-20')).toMatchObject({ smallJoy: 'Fresh bread' })
    expect(await newPhone.settings.get('reminderDailyTime')).toMatchObject({ value: '21:30' })
    expect(await newPhone.settings.get('aiKey')).toBeUndefined()
  })

  it('keeps the newest version of each record and never deletes anything', async () => {
    await newPhone.entries.bulkPut([entry('a', 5000, { activity: 'Edited on the phone' }), entry('b', 1000), entry('c', 1000)])
    const raw = emptyRaw()
    raw.entries = [entry('a', 4000, { activity: 'Older copy' }), entry('b', 3000, { activity: 'Newer copy' }), entry('d', 1000)]

    const result = await applyImport(raw, newPhone)
    expect(result.tables.entries).toMatchObject({ added: 1, updated: 1, unchanged: 1 })
    expect((await newPhone.entries.get('a'))?.activity).toBe('Edited on the phone')
    expect((await newPhone.entries.get('b'))?.activity).toBe('Newer copy')
    expect(await newPhone.entries.get('c')).toBeDefined()
    expect(await newPhone.entries.get('d')).toBeDefined()
  })

  it('importing the same file twice changes nothing the second time', async () => {
    const raw = emptyRaw()
    raw.entries = [entry('a', 1000)]
    await applyImport(raw, newPhone)
    const again = await applyImport(raw, newPhone)
    expect(again.changes).toBe(0)
    expect(again.tables.entries.unchanged).toBe(1)
  })

  it('skips invalid records and secret settings found in a file', async () => {
    const raw = emptyRaw()
    raw.entries = [entry('ok', 1), { id: 'broken' }, entry('bad-energy', 1, { energy: 7 as never })]
    raw.settings = [{ key: 'aiKey', value: 'gsk_x', updatedAt: 1 }]
    const plan = await planImport(raw, newPhone)
    expect(plan.tables.entries).toMatchObject({ incoming: 3, added: 1, skipped: 2 })
    expect(plan.tables.settings).toMatchObject({ incoming: 1, added: 0, skipped: 1 })
  })

  it('backs up and restores reviews', async () => {
    const review = newReview('2026-10-12', '2026-10-18', new Date('2026-10-18T19:00:00Z'))
    await phone.reviews.put({ ...review, balance: { health: 6, work: 4, play: 3, love: 8 }, takeaway: 'Protect mornings', completedAt: 5 })
    const detected = detectFile(JSON.stringify(await createBackup(phone)))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const plan = await applyImport(detected.raw, newPhone)
    expect(plan.tables.reviews).toMatchObject({ added: 1, skipped: 0 })
    expect(await newPhone.reviews.get(review.id)).toMatchObject({ takeaway: 'Protect mornings', balance: { play: 3 } })
  })

  it('backs up and restores evening answers', async () => {
    const answer: Answer = {
      id: 'ans-1',
      date: '2026-10-20',
      promptId: 'learn-1',
      purpose: 'learn',
      question: 'What did you learn today, and how will you use it?',
      text: 'Pairing beats debugging alone',
      createdAt: 1000,
      updatedAt: 1000,
    }
    await phone.answers.put(answer)
    const detected = detectFile(JSON.stringify(await createBackup(phone)))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const plan = await applyImport(detected.raw, newPhone)
    expect(plan.tables.answers).toMatchObject({ added: 1, skipped: 0 })
    expect(await newPhone.answers.get('ans-1')).toEqual(answer)
  })

  it('restores reviews from a format 2 file, which have no "why" yet', async () => {
    const review = JSON.parse(JSON.stringify(newReview('2026-10-12', '2026-10-18', new Date('2026-10-18T19:00:00Z'))))
    delete review.best.why
    delete review.worst.why
    const old = { app: 'life-design', kind: 'backup', schemaVersion: 2, exportedAt: '2026-10-21T12:00:00Z', data: { reviews: [review] } }
    const detected = detectFile(JSON.stringify(old))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const plan = await applyImport(detected.raw, newPhone)
    expect(plan.tables.reviews).toMatchObject({ added: 1, skipped: 0 })
    const restored = await newPhone.reviews.get(review.id)
    expect(restored?.best.why).toBe('')
    expect(restored?.worst.why).toBe('')
  })

  it('restores entries and reviews from before feeling words, filling in the new fields', async () => {
    const oldEntry = JSON.parse(JSON.stringify(entry('a', 1000)))
    delete oldEntry.during
    delete oldEntry.after
    const oldReview = JSON.parse(JSON.stringify(newReview('2026-10-12', '2026-10-18', new Date('2026-10-18T19:00:00Z'))))
    delete oldReview.alive
    delete oldReview.neglected
    delete oldReview.balanceWhy
    const file = { app: 'life-design', kind: 'backup', schemaVersion: 3, exportedAt: '2026-10-21T12:00:00Z', data: { entries: [oldEntry], reviews: [oldReview] } }
    const detected = detectFile(JSON.stringify(file))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const plan = await applyImport(detected.raw, newPhone)
    expect(plan.tables.entries).toMatchObject({ added: 1, skipped: 0 })
    expect(plan.tables.reviews).toMatchObject({ added: 1, skipped: 0 })
    expect(await newPhone.entries.get('a')).toMatchObject({ during: [], after: [] })
    expect(await newPhone.reviews.get(oldReview.id)).toMatchObject({ alive: null, neglected: null, balanceWhy: '' })
  })

  it('backs up and restores Odyssey Plans, their earlier versions, and Workview & Lifeview', async () => {
    const plan = { ...emptyPlan(3, 1000), title: 'Teaching design by the Lisbon sea', feelings: ['Excited', 'Scared'], needs: ['money' as const], writtenAt: 1000 }
    await phone.odysseyPlans.put(plan)
    await phone.planVersions.put({ id: 'v1', planId: 'plan-3', slot: 3, savedAt: 900, plan: { ...plan, title: 'Teaching in Lisbon' }, createdAt: 1000, updatedAt: 1000 })
    await phone.views.put({ id: 'views-1', workview: 'Work is service', lifeview: 'Life is people', coherence: 'They agree', createdAt: 1000, updatedAt: 1000 })
    const detected = detectFile(JSON.stringify(await createBackup(phone)))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    await applyImport(detected.raw, newPhone)
    expect(await newPhone.odysseyPlans.get('plan-3')).toEqual(plan)
    expect(await newPhone.planVersions.get('v1')).toMatchObject({ plan: { title: 'Teaching in Lisbon' } })
    expect(await newPhone.views.get('views-1')).toMatchObject({ workview: 'Work is service' })
  })

  it('restores Odyssey Plans from before Phase 3, filling in the new fields', async () => {
    const old = {
      id: 'plan-1',
      slot: 1,
      title: 'Open a small bakery',
      description: '',
      years: [[], [], [], [], []],
      questions: [],
      gauges: { resources: 6, likability: 8, confidence: 5, coherence: 7 },
      notes: '',
      createdAt: 1000,
      updatedAt: 1000,
    }
    const file = { app: 'life-design', kind: 'backup', schemaVersion: 3, exportedAt: '2026-10-21T12:00:00Z', data: { odysseyPlans: [old] } }
    const detected = detectFile(JSON.stringify(file))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const plan = await applyImport(detected.raw, newPhone)
    expect(plan.tables.odysseyPlans).toMatchObject({ added: 1, skipped: 0 })
    expect(await newPhone.odysseyPlans.get('plan-1')).toMatchObject({ feelings: [], needs: [], needsNote: '', fit: '', writtenAt: 1000 })
  })

  it('backs up and restores purpose journaling: reflections, next steps, things to remember, free writing, drafts and weeks', async () => {
    const reflected = entry('r1', 2000, {
      purpose: 'grow',
      energyEffect: 'used',
      duration: 'hour',
      reflections: [{ question: 'What went well?', text: 'The demo' }],
      intention: { kind: 'remember', text: 'Small steps beat big plans', status: 'open', updatedAt: 2000 },
      take: 'Long meetings drain me',
    })
    const free = entry('f1', 2000, { kind: 'free', activity: '', purpose: 'free', note: "Couldn't sleep, kept thinking about the move", skipped: ['engagement', 'energy'] })
    const draft = entry('d1', 2000, { status: 'draft' })
    const agenda: Step = {
      id: 'st1',
      text: 'A shorter agenda',
      when: 'before meetings',
      kind: 'once',
      status: 'active',
      entryIds: ['r1'],
      activity: 'gardening',
      createdAt: 2000,
      updatedAt: 2000,
      finishedAt: null,
    }
    await phone.entries.bulkPut([reflected, free, draft])
    await phone.steps.put(agenda)
    await phone.weeks.put({ id: '2026-10-19', carry: 'Walk at lunch', createdAt: 2000, updatedAt: 2000 })
    const backup = await createBackup(phone)
    expect(backup.schemaVersion).toBe(7)
    const detected = detectFile(JSON.stringify(backup))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    await applyImport(detected.raw, newPhone)
    expect(await newPhone.entries.get('r1')).toEqual(reflected)
    expect(await newPhone.entries.get('f1')).toEqual(free)
    expect(await newPhone.entries.get('d1')).toMatchObject({ status: 'draft' })
    expect(await newPhone.steps.get('st1')).toEqual(agenda)
    expect(await newPhone.weeks.get('2026-10-19')).toMatchObject({ carry: 'Walk at lunch' })
  })

  it('backs up and restores reviews by AI, and never the AI key', async () => {
    const review: AiReview = {
      id: 'ai1',
      start: '2026-10-19',
      end: '2026-10-25',
      focus: 'Why am I tired on Mondays?',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      text: 'Meetings without an agenda came up three times.',
      createdAt: 4000,
      updatedAt: 4000,
    }
    await phone.aiReviews.put(review)
    await phone.settings.bulkPut([
      { key: 'aiKey', value: 'gsk_test_never_leaves', updatedAt: 4000 },
      { key: 'aiProvider', value: 'groq', updatedAt: 4000 },
    ])
    const backup = await createBackup(phone)
    const text = JSON.stringify(backup)
    expect(text).not.toContain('gsk_test_never_leaves')
    const detected = detectFile(text)
    if (detected.format !== 'backup') throw new Error('expected a backup')
    await applyImport(detected.raw, newPhone)
    expect(await newPhone.aiReviews.get('ai1')).toEqual(review)
    expect(await newPhone.settings.get('aiProvider')).toMatchObject({ value: 'groq' })
    expect(await newPhone.settings.get('aiKey')).toBeUndefined()
  })

  it('turns next steps kept on entries in older files (format 5) into steps, only once however often it is restored', async () => {
    const kept = entry('m', 3000, {
      activity: 'Team meeting',
      intention: { kind: 'differently', text: 'Ask for an agenda first', status: 'open', updatedAt: 3000 },
    })
    const file = { app: 'life-design', kind: 'backup', schemaVersion: 5, exportedAt: '2026-10-22T12:00:00Z', data: { entries: [kept] } }
    for (const round of [1, 2]) {
      const detected = detectFile(JSON.stringify(file))
      if (detected.format !== 'backup') throw new Error('expected a backup')
      const result = await applyImport(detected.raw, newPhone)
      if (round === 2) expect(result.changes).toBe(0)
    }
    expect(await newPhone.steps.toArray()).toEqual([
      {
        id: 'from-m',
        text: 'Ask for an agenda first',
        when: '',
        kind: 'once',
        status: 'active',
        entryIds: ['m'],
        activity: 'team meeting',
        createdAt: 3000,
        updatedAt: 3000,
        finishedAt: null,
      },
    ])
    expect(await newPhone.entries.get('m')).toEqual({ ...kept, intention: null })
  })

  it('restores entries from a format 4 file with the new fields filled in, and skips an activity with no name', async () => {
    const { kind, purpose, energyEffect, duration, reflections, intention, take, status, skipped, ...older } = entry('a', 1000)
    void [kind, purpose, energyEffect, duration, reflections, intention, take, status, skipped]
    const nameless = { ...older, id: 'b', activity: ' ' }
    const file = { app: 'life-design', kind: 'backup', schemaVersion: 4, exportedAt: '2026-10-21T12:00:00Z', data: { entries: [older, nameless] } }
    const detected = detectFile(JSON.stringify(file))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const result = await applyImport(detected.raw, newPhone)
    expect(result.tables.entries).toMatchObject({ added: 1, skipped: 1 })
    expect(await newPhone.entries.get('a')).toEqual(entry('a', 1000))
  })

  it('still restores backups made before reviews existed (format 1)', async () => {
    const old = { app: 'life-design', kind: 'backup', schemaVersion: 1, exportedAt: '2026-10-21T12:00:00Z', data: { entries: [entry('a', 1000)] } }
    const detected = detectFile(JSON.stringify(old))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    expect(detected.raw.reviews).toEqual([])
    await applyImport(detected.raw, newPhone)
    expect(await newPhone.entries.count()).toBe(1)
  })

  it('refuses a backup made by a newer version of the app', () => {
    const text = JSON.stringify({ app: 'life-design', kind: 'backup', schemaVersion: BACKUP_SCHEMA_VERSION + 1, data: {} })
    expect(detectFile(text)).toEqual({ format: 'too-new', schemaVersion: BACKUP_SCHEMA_VERSION + 1 })
  })

  it('recognises locked backups, v1 files and everything else', async () => {
    expect(detectFile(JSON.stringify(await lockText('{}', 'passphrase-1', 100_000))).format).toBe('locked')
    expect(detectFile(JSON.stringify({ gtj: [], iki: [], ody: [] })).format).toBe('v1')
    expect(detectFile('not json').format).toBe('unknown')
    expect(detectFile('{"hello":1}').format).toBe('unknown')
  })

  it('round-trips a passphrase-locked backup', async () => {
    await phone.entries.put(entry('a', 1000))
    const locked = await lockText(JSON.stringify(await createBackup(phone)), 'a long passphrase', 100_000)

    const detected = detectFile(JSON.stringify(locked))
    if (detected.format !== 'locked') throw new Error('expected a locked backup')
    const unlocked = detectFile(await unlockText(detected.envelope, 'a long passphrase'))
    if (unlocked.format !== 'backup') throw new Error('expected a backup inside')

    await applyImport(unlocked.raw, newPhone)
    expect(await newPhone.entries.get('a')).toEqual(entry('a', 1000))
  })
})
