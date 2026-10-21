import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/db'
import {
  buildEntry,
  computeSuggestions,
  countChangesSince,
  deleteEntry,
  type EntryDraft,
  entrySource,
  firstEntryCreatedAt,
  saveAnswer,
  saveEntry,
  setSmallJoy,
} from '../../src/db/repo'
import { onSaveError } from '../../src/db/saveErrors'

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  date: '2026-10-21',
  part: 'evening',
  activity: '  Read   a novel ',
  engagement: 4,
  energy: 1,
  flow: false,
  where: [' Home', 'home ', ''],
  people: [],
  objects: [],
  note: ' lovely ',
  ...over,
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('entries', () => {
  it('tidies text and removes repeated chips', () => {
    const e = buildEntry(draft(), undefined, new Date(2026, 9, 21, 20))
    expect(e.activity).toBe('Read a novel')
    expect(e.where).toEqual(['Home'])
    expect(e.note).toBe('lovely')
  })

  it('marks in-the-moment entries as quick and later ones as evening reconstruction', () => {
    expect(entrySource('2026-10-21', new Date(2026, 9, 21, 16, 59))).toBe('quick')
    expect(entrySource('2026-10-21', new Date(2026, 9, 21, 17, 0))).toBe('evening')
    expect(entrySource('2026-10-20', new Date(2026, 9, 21, 9, 0))).toBe('evening')
  })

  it('saves, edits and deletes', async () => {
    const saved = await saveEntry(draft())
    expect(await db.entries.get(saved.id)).toEqual(saved)

    const edited = await saveEntry(draft({ energy: 2 }), saved)
    expect(edited.id).toBe(saved.id)
    expect(edited.createdAt).toBe(saved.createdAt)
    expect(edited.updatedAt).toBeGreaterThanOrEqual(saved.updatedAt)
    expect((await db.entries.get(saved.id))?.energy).toBe(2)

    await deleteEntry(saved.id)
    expect(await db.entries.count()).toBe(0)
  })

  it('refuses an entry without an activity', async () => {
    await expect(saveEntry(draft({ activity: '   ' }))).rejects.toThrow()
  })

  it('reports a failed save (e.g. a full phone) and still fails the save', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: unknown[] = []
    const stop = onSaveError((error) => seen.push(error))
    const put = vi.spyOn(db.entries, 'put').mockRejectedValueOnce(new DOMException('Disk full', 'QuotaExceededError'))

    await expect(saveEntry(draft())).rejects.toThrow('Disk full')
    expect(seen).toHaveLength(1)

    stop()
    put.mockRestore()
    quiet.mockRestore()
  })
})

describe('small joys', () => {
  it('saves only real changes', async () => {
    await setSmallJoy('2026-10-21', '')
    expect(await db.days.count()).toBe(0)

    await setSmallJoy('2026-10-21', ' Sunlight on the desk ')
    const first = await db.days.get('2026-10-21')
    expect(first?.smallJoy).toBe('Sunlight on the desk')

    await setSmallJoy('2026-10-21', 'Sunlight on the desk')
    expect((await db.days.get('2026-10-21'))?.updatedAt).toBe(first?.updatedAt)
  })
})

describe('evening answers', () => {
  const prompt = { id: 'learn-1', purpose: 'learn' as const, question: 'What did you learn today, and how will you use it?' }

  it('saves only real changes, keeping the question with the answer', async () => {
    expect(await saveAnswer('2026-10-21', prompt, '   ')).toBeNull()
    expect(await db.answers.count()).toBe(0)

    const saved = await saveAnswer('2026-10-21', prompt, ' Pairing beats debugging alone ')
    expect(saved).toMatchObject({ date: '2026-10-21', promptId: 'learn-1', purpose: 'learn', question: prompt.question, text: 'Pairing beats debugging alone' })

    const again = await saveAnswer('2026-10-21', prompt, 'Pairing beats debugging alone', saved ?? undefined)
    expect(again?.updatedAt).toBe(saved?.updatedAt)
    expect(await db.answers.count()).toBe(1)
  })
})

describe('suggestions', () => {
  it('lists recent activities first and frequent places, people and objects', () => {
    const e = (activity: string, updatedAt: number, where: string[]) => ({
      ...buildEntry(draft({ activity, where }), undefined, new Date(updatedAt)),
      updatedAt,
    })
    const s = computeSuggestions([e('Swim', 1, ['Pool']), e('Cook', 3, ['Home']), e('swim', 2, ['Home']), e('Write', 4, ['Café'])])
    expect(s.activities).toEqual(['Write', 'Cook', 'swim'])
    expect(s.where[0]).toBe('Home')
  })
})

describe('backup bookkeeping', () => {
  it('counts what changed since the last backup and finds the first entry', async () => {
    const a = await saveEntry(draft({ activity: 'One' }))
    await saveEntry(draft({ activity: 'Two' }))
    await setSmallJoy('2026-10-21', 'Tea')
    await saveAnswer('2026-10-21', { id: 'know-1', purpose: 'know', question: 'When did you feel most like yourself today?' }, 'On the walk home')
    expect(await countChangesSince(null)).toBe(4)
    expect(await countChangesSince(Date.now() + 1)).toBe(0)
    expect(await firstEntryCreatedAt()).toBe(a.createdAt)
  })
})
