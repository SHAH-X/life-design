import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyImport, BACKUP_SCHEMA_VERSION, createBackup, detectFile, planImport, type RawData } from '../../src/db/backup'
import { lockText, unlockText } from '../../src/db/crypto'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { newReview } from '../../src/db/repo'
import type { Entry } from '../../src/db/types'

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
  note: '',
  source: 'evening',
  createdAt: 1000,
  updatedAt,
  ...over,
})

const emptyRaw = (): RawData => ({ entries: [], days: [], ikigaiItems: [], odysseyPlans: [], reviews: [], settings: [] })

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
