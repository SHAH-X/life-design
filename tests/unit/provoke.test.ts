import { describe, expect, it } from 'vitest'
import type { Step } from '../../src/db/types'
import type { AreaId } from '../../src/domain/areas'
import type { Loop } from '../../src/domain/loops'
import { addDays, dayNumber } from '../../src/lib/dates'
import {
  ASK_AGAIN_DAYS,
  loopAsk,
  NO_PROVOKER_STATE,
  type ProvokeInput,
  pickAsk,
  quietAreas,
  quote,
  settled,
  shown,
} from '../../src/prompts/provoke'
import { journalEntry } from '../fixtures/loops'

// Fictional example data.

const TODAY = '2026-10-24'
const NOW = Date.parse(`${TODAY}T09:00:00`)
const DAY_MS = 86_400_000

const loop = (id: string, date: string, text: string, kind: Loop['kind'] = 'do'): Loop => ({
  id,
  entryId: id.split('#')[0]!,
  date,
  createdAt: Date.parse(`${date}T20:00:00`),
  kind,
  text,
  context: text,
})

const step = (id: string, text: string, daysUntouched: number, kind: Step['kind'] = 'once'): Step => ({
  id,
  text,
  when: '',
  kind,
  status: 'active',
  entryIds: [],
  activity: '',
  createdAt: NOW - daysUntouched * DAY_MS,
  updatedAt: NOW - daysUntouched * DAY_MS,
  finishedAt: null,
})

const input = (over: Partial<ProvokeInput> = {}): ProvokeInput => ({ today: TODAY, now: NOW, loops: [], steps: [], quiet: [], state: NO_PROVOKER_STATE, ...over })

/** A day on which the kinds start with `kind` (they take turns: loop, step, quiet). */
const dayStarting = (kind: 'loop' | 'step' | 'quiet') => {
  const want = ['loop', 'step', 'quiet'].indexOf(kind)
  for (let i = 0; ; i++) if (dayNumber(addDays(TODAY, i)) % 3 === want) return addDays(TODAY, i)
}

describe('the questions, in plain words from your own writing', () => {
  it("quotes what you wrote, without its full stop, and asks after it in the loop's own way", () => {
    expect(loopAsk(loop('e1#1', '2026-10-12', 'Need to compare tariffs this weekend.')).question).toMatch(/^On .+ you wrote “Need to compare tariffs this weekend”\. Where are you with it\?$/)
    expect(loopAsk(loop('e1#1', '2026-10-12', 'Still waiting for the refund.', 'waiting')).question).toMatch(/you were waiting: “Still waiting for the refund”\. Any news\?$/)
    expect(loopAsk(loop('e1#1', '2026-10-12', 'Should I sell the car?', 'decide')).question).toMatch(/you asked yourself “Should I sell the car\?” Where have you landed\?$/)
  })

  it('cuts a long sentence at a word', () => {
    const long = quote(`${'word '.repeat(30)}end.`)
    expect(long.length).toBeLessThanOrEqual(81)
    expect(long).toMatch(/word…$/)
  })
})

describe('pickAsk: one question a day', () => {
  const tariffs = loop('e1#1', '2026-10-12', 'Need to compare tariffs this weekend.')
  const agenda = step('s1', 'Ask for an agenda first', 35)
  const quiet = [{ area: 'health' as AreaId, days: 21 }]

  it('asks nothing when there is nothing to ask about', () => {
    expect(pickAsk(input())).toBeNull()
  })

  it('lets the kinds take turns by day, and falls back to another kind when one has nothing', () => {
    const all = { loops: [tariffs], steps: [agenda], quiet }
    expect(pickAsk(input({ ...all, today: dayStarting('loop') }))?.kind).toBe('loop')
    expect(pickAsk(input({ ...all, today: dayStarting('step') }))?.kind).toBe('step')
    expect(pickAsk(input({ ...all, today: dayStarting('quiet') }))?.question).toBe("You haven't written about Health for 3 weeks. What's going on there?")
    expect(pickAsk(input({ steps: [agenda], today: dayStarting('loop') }))?.kind).toBe('step')
  })

  it('asks only about next steps not touched for 4 weeks or more', () => {
    expect(pickAsk(input({ steps: [step('s2', 'Walk after dinner', 10)] }))).toBeNull()
    expect(pickAsk(input({ steps: [agenda] }))?.question).toBe('“Ask for an agenda first” hasn\'t come up for 5 weeks. Still want to?')
  })

  it("doesn't ask again within 30 days of asking, nor ever once closed", () => {
    const ask = loopAsk(tariffs)
    const askedLately = { ...NO_PROVOKER_STATE, asked: { [ask.id]: addDays(TODAY, -(ASK_AGAIN_DAYS - 1)) } }
    expect(pickAsk(input({ loops: [tariffs], state: askedLately }))).toBeNull()
    const askedLongAgo = { ...NO_PROVOKER_STATE, asked: { [ask.id]: addDays(TODAY, -ASK_AGAIN_DAYS) } }
    expect(pickAsk(input({ loops: [tariffs], state: askedLongAgo }))?.id).toBe(ask.id)
    expect(pickAsk(input({ loops: [tariffs], state: { ...NO_PROVOKER_STATE, closed: [ask.id] } }))).toBeNull()
  })

  it('holds the question shown today all day, and asks nothing more after "Not now"', () => {
    const ask = loopAsk(tariffs)
    const held = shown(NO_PROVOKER_STATE, TODAY, ask)
    expect(pickAsk(input({ loops: [], state: held }))).toEqual(ask)
    expect(pickAsk(input({ loops: [tariffs], state: settled(held, TODAY, ask, false) }))).toBeNull()
    expect(pickAsk(input({ loops: [tariffs], state: settled(held, TODAY, ask, false), today: addDays(TODAY, 1) }))).toBeNull() // asked yesterday
  })

  it('closes a loop or a step for good with "Done already", while a quiet area only rests', () => {
    const quietAsk = pickAsk(input({ quiet }))!
    expect(settled(NO_PROVOKER_STATE, TODAY, quietAsk, true).closed).toEqual([])
    expect(settled(NO_PROVOKER_STATE, TODAY, loopAsk(tariffs), true).closed).toEqual([loopAsk(tariffs).id])
  })

  it('lets go of dates older than 30 days when it marks one shown', () => {
    const old = { ...NO_PROVOKER_STATE, asked: { 'loop:old#0': addDays(TODAY, -40), 'loop:new#0': addDays(TODAY, -2) } }
    expect(Object.keys(shown(old, TODAY, loopAsk(tariffs)).asked).sort()).toEqual(['loop:e1#1', 'loop:new#0'])
  })
})

describe('quietAreas', () => {
  const entry = (id: string, daysAgo: number) => journalEntry({ id, date: addDays(TODAY, -daysAgo), text: 'Some writing about it.' })
  const byEntry = new Map<string, AreaId[]>()
  const put = (id: string, area: AreaId) => byEntry.set(id, [area])

  it('names an area written about 3+ times in the month before the last 2 weeks, and not since', () => {
    const entries = [entry('h1', 20), entry('h2', 25), entry('h3', 30), entry('w1', 20), entry('w2', 22), entry('w3', 24), entry('w4', 3), entry('m1', 20)]
    for (const id of ['h1', 'h2', 'h3']) put(id, 'health')
    for (const id of ['w1', 'w2', 'w3', 'w4']) put(id, 'work')
    put('m1', 'money')
    expect(quietAreas(TODAY, entries, byEntry)).toEqual([{ area: 'health', days: 20 }])
  })

  it('leaves drafts out', () => {
    const entries = ['d1', 'd2', 'd3'].map((id, i) => ({ ...entry(id, 20 + i), status: 'draft' as const }))
    for (const id of ['d1', 'd2', 'd3']) put(id, 'people')
    expect(quietAreas(TODAY, entries, byEntry)).toEqual([])
  })
})
