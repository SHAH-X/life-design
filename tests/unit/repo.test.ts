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
  hasJournalData,
  hasEnergy,
  hasEngagement,
  isDone,
  latestViews,
  saveAnswer,
  saveEntry,
  savePlan,
  saveViews,
  setSmallJoy,
  addStep,
  linkStep,
  mergeSteps,
  setStepStatus,
  updateStep,
} from '../../src/db/repo'
import { emptyPlan } from '../../src/domain/lifeDesign'
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
  during: ['Curious', ' curious ', 'Absorbed'],
  after: ['Calm'],
  note: ' lovely ',
  ...over,
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('entries', () => {
  it('keeps the feeling words as chosen, tidied', () => {
    const e = buildEntry(draft(), undefined, new Date('2026-10-21T20:00:00'))
    expect(e.during).toEqual(['Curious', 'Absorbed'])
    expect(e.after).toEqual(['Calm'])
  })

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

describe('Odyssey Plans keep earlier versions', () => {
  const T = Date.UTC(2026, 9, 1)
  const DAY = 86_400_000

  it('keeps the old plan only on a change made 7 or more days after the last one', async () => {
    let plan = await savePlan({ ...emptyPlan(1, T), title: 'Leading the analytics team', writtenAt: T }, undefined, T)
    plan = await savePlan({ ...plan, title: 'Leading the data team' }, undefined, T + 3 * DAY)
    expect(await db.planVersions.count()).toBe(0)

    plan = await savePlan({ ...plan, feelings: ['Trapped'] }, undefined, T + 11 * DAY)
    const versions = await db.planVersions.toArray()
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ planId: 'plan-1', slot: 1, savedAt: T + 3 * DAY, plan: { title: 'Leading the data team', feelings: [] } })

    await savePlan({ ...plan, feelings: ['Trapped', 'Unsure'] }, undefined, T + 11 * DAY + 3_600_000)
    expect(await db.planVersions.count()).toBe(1)
    expect((await db.odysseyPlans.get('plan-1'))?.feelings).toEqual(['Trapped', 'Unsure'])
  })

  it('keeps no versions while a plan is first being written, or when nothing changed', async () => {
    let plan = await savePlan({ ...emptyPlan(2, T), description: 'Teaching' }, undefined, T)
    plan = await savePlan({ ...plan, title: 'Teaching design by the Lisbon sea' }, undefined, T + 10 * DAY)
    expect(await db.planVersions.count()).toBe(0)
    plan = await savePlan({ ...plan, writtenAt: T + 10 * DAY }, undefined, T + 10 * DAY)
    await savePlan(plan, undefined, T + 30 * DAY)
    expect(await db.planVersions.count()).toBe(0)
  })
})

describe('Workview and Lifeview keep earlier versions', () => {
  const T = Date.UTC(2026, 9, 1)
  const DAY = 86_400_000

  it('edit in place within a week, and start a new version after', async () => {
    await saveViews({ workview: 'Work is service', lifeview: '', coherence: '' }, undefined, T)
    await saveViews({ workview: 'Work is service', lifeview: 'Life is relationships', coherence: '' }, undefined, T + 2 * DAY)
    expect(await db.views.count()).toBe(1)
    await saveViews({ workview: 'Work is craft and service', lifeview: 'Life is relationships', coherence: '' }, undefined, T + 10 * DAY)
    expect(await db.views.count()).toBe(2)
    expect(await latestViews()).toMatchObject({ workview: 'Work is craft and service', lifeview: 'Life is relationships' })
  })
})

describe('hasJournalData: whether anything has been written yet', () => {
  it('is false on a new phone, even with settings saved', async () => {
    await db.settings.put({ key: 'purposes', value: ['calm'], updatedAt: 1 })
    expect(await hasJournalData()).toBe(false)
  })

  it('is true once there is an entry, a small joy or an evening answer', async () => {
    await saveEntry(draft())
    expect(await hasJournalData()).toBe(true)
    await db.entries.clear()
    await setSmallJoy('2026-10-21', 'Coffee in the sun')
    expect(await hasJournalData()).toBe(true)
  })

  it('is true with only a plan or a Workview', async () => {
    await saveViews({ workview: 'Work is how I serve', lifeview: '', coherence: '' })
    expect(await hasJournalData()).toBe(true)
  })
})

describe('purpose journaling entries', () => {
  it('keep each answered reflection with its question, and drop the empty ones', () => {
    const entry = buildEntry(
      draft({
        purpose: 'grow',
        reflections: [
          { question: 'What went well?', text: '  The demo  ' },
          { question: 'What could you have handled differently?', text: ' ' },
        ],
        intention: { kind: 'differently', text: '  A shorter agenda ', status: 'open', updatedAt: 0 },
        take: ' Long meetings drain me ',
      }),
      undefined,
      new Date(2026, 9, 21, 20),
    )
    expect(entry).toMatchObject({
      kind: 'activity',
      purpose: 'grow',
      reflections: [{ question: 'What went well?', text: 'The demo' }],
      intention: { kind: 'differently', text: 'A shorter agenda', status: 'open' },
      take: 'Long meetings drain me',
      status: 'done',
    })
  })

  it('save free writing without an activity, but never an empty page', async () => {
    const free = await saveEntry(draft({ kind: 'free', activity: '', purpose: 'free', note: 'Kept thinking about the move' }))
    expect(free).toMatchObject({ kind: 'free', activity: '', note: 'Kept thinking about the move' })
    await expect(saveEntry(draft({ kind: 'free', activity: '', note: '  ' }))).rejects.toThrow()
  })

  it('keep a draft as a draft until it is saved', async () => {
    const saved = await saveEntry(draft({ status: 'draft' }))
    expect(saved.status).toBe('draft')
    expect(isDone(saved)).toBe(false)
    const done = await saveEntry(draft({ status: 'done' }), saved)
    expect(done).toMatchObject({ id: saved.id, status: 'done' })
    expect(isDone(done)).toBe(true)
  })

  it('leave skipped questions out of the numbers instead of guessing', () => {
    const now = new Date(2026, 9, 21, 20)
    expect(hasEnergy(buildEntry(draft({ skipped: ['energy'] }), undefined, now))).toBe(false)
    expect(hasEngagement(buildEntry(draft({ skipped: ['engagement'] }), undefined, now))).toBe(false)
    expect(hasEnergy(buildEntry(draft(), undefined, now))).toBe(true)
  })
})

describe('next steps (v0.11)', () => {
  it('starts a step from an entry, with its activity, so it comes back when you write about that again', async () => {
    const step = await addStep({ text: ' Ask for an agenda first ', when: ' before meetings ', kind: 'once', entry: { id: 'e1', activity: ' Team Meeting ' } })
    expect(await db.steps.get(step.id)).toMatchObject({
      text: 'Ask for an agenda first',
      when: 'before meetings',
      kind: 'once',
      status: 'active',
      entryIds: ['e1'],
      activity: 'team meeting',
      finishedAt: null,
    })
    const byHand = await addStep({ text: 'Read before bed', kind: 'ongoing' })
    expect(byHand).toMatchObject({ entryIds: [], activity: '' })
  })

  it('links the same step kept again from another entry, once', async () => {
    const step = await addStep({ text: 'Walk after dinner', kind: 'ongoing', entry: { id: 'e1', activity: 'Evening walk' } })
    await linkStep(step.id, 'e2')
    await linkStep(step.id, 'e2')
    expect((await db.steps.get(step.id))?.entryIds).toEqual(['e1', 'e2'])
  })

  it('is done or stopped with a date, and can be taken up again', async () => {
    const step = await addStep({ text: 'Ask for an agenda first', kind: 'once' })
    await setStepStatus(step.id, 'done')
    expect(await db.steps.get(step.id)).toMatchObject({ status: 'done', finishedAt: expect.any(Number) })
    await setStepStatus(step.id, 'active')
    expect(await db.steps.get(step.id)).toMatchObject({ status: 'active', finishedAt: null })
    await updateStep(step.id, { text: 'Ask for a short agenda', when: 'the day before', kind: 'ongoing' })
    expect(await db.steps.get(step.id)).toMatchObject({ text: 'Ask for a short agenda', when: 'the day before', kind: 'ongoing' })
  })

  it('merges two that say the same: one stays with both sets of entries, the other goes', async () => {
    const a = await addStep({ text: 'Walk 10 minutes every evening', kind: 'ongoing', entry: { id: 'e1', activity: 'Evening walk' } })
    const b = await addStep({ text: 'Walk after dinner', kind: 'ongoing', entry: { id: 'e2', activity: 'Dinner' } })
    await mergeSteps(a.id, b.id)
    expect(await db.steps.count()).toBe(1)
    expect((await db.steps.get(a.id))?.entryIds).toEqual(['e1', 'e2'])
  })

  it('counts towards "back up soon", like everything you write', async () => {
    await addStep({ text: 'Walk after dinner', kind: 'ongoing' })
    expect(await countChangesSince(null)).toBe(1)
  })
})

