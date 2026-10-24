// The provoker (step 3 of the owner's vision, 2026-10-24): one question a day in Today's box, from your own writing,
// worked out on the phone (no AI): something you said you'd do, waited on or hadn't decided and haven't written about
// since; a next step not touched for weeks; a life area gone quiet. A pure function of the day and what's there, so
// it holds still all day. Nothing is asked again within 30 days, and nothing you've closed is asked at all.
import { MIN_COUNT } from '../analysis/stats'
import type { Entry, ReplyTo, Step } from '../db/types'
import { type AreaId, areaName } from '../domain/areas'
import type { Loop } from '../domain/loops'
import { isStale } from '../domain/steps'
import { addDays, dayNumber, shortDayMonth, wholeDaysBetween } from '../lib/dates'

export type AskKind = 'loop' | 'step' | 'quiet'

export interface Ask extends ReplyTo {
  kind: AskKind
  /** "Done already" closes it for good: a loop, or a step (marked done). A quiet area can only wait. */
  closable: boolean
}

/** What you've told the provoker, kept in settings (so in a backup). */
export interface ProvokerState {
  /** When each question was last shown, by its id: not asked again within ASK_AGAIN_DAYS. */
  asked: Record<string, string>
  /** Closed by you ("Done already", or answered): never asked again. */
  closed: string[]
  /** Today's question, held all day once shown. */
  held: { date: string; ask: Ask } | null
  /** "Not now" (or answered): no question for the rest of that day. */
  restDay: string | null
}

export const NO_PROVOKER_STATE: ProvokerState = { asked: {}, closed: [], held: null, restDay: null }

export const ASK_AGAIN_DAYS = 30
/** An area is quiet with nothing written about it for this long… */
export const QUIET_DAYS = 14
/** …after MIN_COUNT entries or more in the month before. */
const QUIET_BEFORE_DAYS = 30
const QUOTE_MAX = 80

/** A sentence to quote: its full stop dropped, cut at a word near QUOTE_MAX. */
export function quote(text: string): string {
  const t = text.trim().replace(/\.+$/, '')
  if (t.length <= QUOTE_MAX) return t
  const cut = t.slice(0, QUOTE_MAX)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), QUOTE_MAX / 2)).trimEnd()}…`
}

const weeks = (days: number) => `${Math.floor(days / 7)} weeks`

export function loopAsk(loop: Loop): Ask {
  const day = shortDayMonth(loop.date)
  const said = quote(loop.text)
  const question =
    loop.kind === 'waiting'
      ? `On ${day} you were waiting: “${said}”. Any news?`
      : loop.kind === 'decide'
        ? `On ${day} you asked yourself “${said}” Where have you landed?`
        : `On ${day} you wrote “${said}”. Where are you with it?`
  return { id: `loop:${loop.id}`, kind: 'loop', question, closable: true }
}

export function stepAsk(step: Step, now: number): Ask {
  return {
    id: `step:${step.id}`,
    kind: 'step',
    question: `“${quote(step.text)}” hasn't come up for ${weeks(wholeDaysBetween(step.updatedAt, now))}. Still want to?`,
    closable: true,
  }
}

/**
 * Areas gone quiet on a day, the busiest before first: MIN_COUNT or more finished entries in the month before the
 * last QUIET_DAYS, and none since. With how long since the last.
 */
export function quietAreas(today: string, entries: readonly Entry[], byEntry: ReadonlyMap<string, readonly AreaId[]>): { area: AreaId; days: number }[] {
  const quietFrom = addDays(today, -(QUIET_DAYS - 1))
  const before = addDays(quietFrom, -QUIET_BEFORE_DAYS)
  const counts = new Map<AreaId, { n: number; last: string }>()
  const recent = new Set<AreaId>()
  for (const e of entries) {
    if (e.status === 'draft' || e.date > today) continue
    for (const area of byEntry.get(e.id) ?? []) {
      if (e.date >= quietFrom) recent.add(area)
      else if (e.date >= before) {
        const c = counts.get(area) ?? { n: 0, last: e.date }
        counts.set(area, { n: c.n + 1, last: e.date > c.last ? e.date : c.last })
      }
    }
  }
  return [...counts.entries()]
    .filter(([area, c]) => c.n >= MIN_COUNT && !recent.has(area))
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .map(([area, c]) => ({ area, days: dayNumber(today) - dayNumber(c.last) }))
}

export function quietAsk(area: AreaId, days: number): Ask {
  return { id: `quiet:${area}`, kind: 'quiet', question: `You haven't written about ${areaName(area)} for ${weeks(days)}. What's going on there?`, closable: false }
}

export interface ProvokeInput {
  today: string
  now: number
  /** Open loops, oldest first (src/db/loops.ts). */
  loops: readonly Loop[]
  steps: readonly Step[]
  quiet: readonly { area: AreaId; days: number }[]
  state: ProvokerState
}

/**
 * Today's question, or null: the kinds take turns by day (loops, then steps, then quiet areas), each offering its
 * first not asked within ASK_AGAIN_DAYS and not closed. Once shown, the held one stays all day.
 */
export function pickAsk(input: ProvokeInput): Ask | null {
  const { today, state } = input
  if (state.restDay === today) return null
  if (state.held?.date === today) return state.held.ask
  const since = addDays(today, -ASK_AGAIN_DAYS)
  const fresh = (ask: Ask) => !state.closed.includes(ask.id) && !((state.asked[ask.id] ?? '') > since)
  const byKind: Record<AskKind, () => Ask | undefined> = {
    loop: () => input.loops.map(loopAsk).find(fresh),
    step: () =>
      input.steps
        .filter((s) => s.status === 'active' && isStale(s, input.now))
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .map((s) => stepAsk(s, input.now))
        .find(fresh),
    quiet: () => input.quiet.map((q) => quietAsk(q.area, q.days)).find(fresh),
  }
  const order: AskKind[] = ['loop', 'step', 'quiet']
  const start = dayNumber(today) % order.length
  for (let i = 0; i < order.length; i++) {
    const ask = byKind[order[(start + i) % order.length]!]()
    if (ask) return ask
  }
  return null
}

/** Shown today: held for the day, and not asked again for ASK_AGAIN_DAYS (old dates let go). */
export function shown(state: ProvokerState, today: string, ask: Ask): ProvokerState {
  const keepFrom = addDays(today, -ASK_AGAIN_DAYS)
  const asked = Object.fromEntries(Object.entries(state.asked).filter(([, date]) => date > keepFrom))
  return { ...state, asked: { ...asked, [ask.id]: today }, held: { date: today, ask } }
}

/** "Not now": nothing more today. "Done already", or answered: closed for good too (a quiet area only rests). */
export function settled(state: ProvokerState, today: string, ask: Ask, close: boolean): ProvokerState {
  const closed = close && ask.closable && !state.closed.includes(ask.id) ? [...state.closed, ask.id] : state.closed
  return { ...state, closed, restDay: today }
}
