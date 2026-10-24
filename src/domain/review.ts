// Review a period (v0.12): one package, in words, for the two ways the owner chose. Copy it (or share it as a
// file) to any AI chat yourself, or send it with "Review with AI". The same instructions open both, so a chat
// and the app answer the same request. Only finished entries; never the AI key or any setting but your purpose;
// never the internal numbers (energy says "it used up my energy", never −2).
import { weekStart } from '../analysis/week'
import type { Answer, Day, Entry, Purpose, Step, Week } from '../db/types'
import { addDays, dayMonthLong, fromDateKey, loggedAt, longDate, PART_ORDER, toDateKey } from '../lib/dates'
import { DURATION_LABELS, ENERGY_OPTIONS, wordsFor } from './feelings'
import { focusFor, purposeInfo } from './purposes'
import { photoTexts } from './search'
import { stepLine } from './steps'

export type PeriodPreset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'all-time'

export interface Period {
  start: string
  end: string
}

/** This or last week (Monday to Sunday), this or last month, or all time: from `first`, the first day anything was
 *  written (v0.14, for "Only entries about this"). */
export function periodFor(preset: PeriodPreset, today: string, first: string = today): Period {
  if (preset === 'all-time') return { start: first < today ? first : today, end: today }
  if (preset === 'this-week' || preset === 'last-week') {
    const start = addDays(weekStart(today), preset === 'last-week' ? -7 : 0)
    return { start, end: addDays(start, 6) }
  }
  const now = fromDateKey(today)
  const month = now.getMonth() + (preset === 'last-month' ? -1 : 0)
  return { start: toDateKey(new Date(now.getFullYear(), month, 1, 12)), end: toDateKey(new Date(now.getFullYear(), month + 1, 0, 12)) }
}

/** The package reads the same in any phone language: an AI is asked in English. */
const LOCALE = 'en-GB'

export const REVIEW_INSTRUCTIONS = `You're helping me reflect on my own journal. Please read it below and reply in plain words, with these parts:

1. What happened: a few sentences about the period.
2. What you notice: patterns, each with the dates it comes from. Say "in what you wrote"; don't claim causes.
3. Possible insights: one to three, said tentatively, each with its evidence. Where I've written my own take, start from it.
4. To try: one or two small, specific experiments for the days ahead.
5. A question for me to think about.

Please don't give scores, ratings or numbers out of ten, and don't diagnose. Keep it short and kind.
If anything I wrote suggests I'm in crisis or might harm myself, say so gently, and suggest talking to someone I trust or a helpline (findahelpline.com).`

export interface ReviewData {
  entries: readonly Entry[]
  days: readonly Day[]
  answers: readonly Answer[]
  weeks: readonly Week[]
  steps: readonly Step[]
  purpose: { primary: Purpose; focus: Partial<Record<Purpose, string>>; goal: string }
}

export interface ReviewPackage {
  /** The instructions, with what to focus on (the in-app review sends them as the system message). */
  instructions: string
  /** Instructions, then the data: what's copied, shared or sent. */
  text: string
  /** The data on its own (the in-app review sends the instructions separately). */
  data: string
  counts: { entries: number; days: number; smallJoys: number; answers: number; steps: number }
  words: number
}

const within = (date: string, period: Period) => date >= period.start && date <= period.end
const lower = (words: readonly string[]) => words.map((w) => w.toLowerCase()).join(', ')

/** One entry, as you gave it, in words. */
function entryLines(entry: Entry, steps: readonly Step[]): string[] {
  const at = loggedAt(entry.createdAt, entry.date, LOCALE)
  if (entry.kind === 'free') {
    const asked = entry.replyTo ? `, answering "${entry.replyTo.question}"` : ''
    // A photo goes as the text read from it, never the image (v0.16).
    const photos = photoTexts(entry).map((t) => `  - Text in a photo: ${t.replace(/\s*\n+\s*/g, ' / ')}`)
    const words = entry.note.trim() ? entry.note.trim().replace(/\n+/g, ' / ') : entry.photos.length ? '(a photo)' : ''
    return [`- Free writing (logged ${at}${asked}): ${words}`, ...photos]
  }
  const lines = [`- ${entry.part.charAt(0).toUpperCase()}${entry.part.slice(1)}: ${entry.activity} (logged ${at})`]
  const add = (label: string, value: string) => {
    if (value.trim()) lines.push(`  - ${label}: ${value.trim()}`)
  }
  const { during, after } = wordsFor(entry)
  add('What it was like', lower(during))
  const energy = ENERGY_OPTIONS.find((o) => o.value === entry.energyEffect)?.label
  add('Energy', energy ? energy.charAt(0).toLowerCase() + energy.slice(1) : '')
  add('Feelings', lower(after))
  add('Where', entry.where.join(', '))
  add('With', entry.people.join(', '))
  add('Using', entry.objects.join(', '))
  add('How long', entry.duration ? DURATION_LABELS[entry.duration] : '')
  for (const r of entry.reflections) add(r.question, r.text.replace(/\n+/g, ' / '))
  add('Writing', entry.note.replace(/\n+/g, ' / '))
  add('My take', entry.take)
  for (const s of steps.filter((s) => s.entryIds.includes(entry.id))) add('Next step', stepLine(s))
  if (entry.intention?.kind === 'remember') add('To remember', entry.intention.text)
  return lines
}

/** The first day anything was written (an entry, a small joy, an evening answer), or null. */
export function firstWrittenDate(data: Pick<ReviewData, 'entries' | 'days' | 'answers'>): string | null {
  const dates = [...data.entries.filter((e) => e.status !== 'draft').map((e) => e.date), ...data.days.filter((d) => d.smallJoy.trim()).map((d) => d.date), ...data.answers.map((a) => a.date)]
  return dates.length ? dates.reduce((a, b) => (b < a ? b : a)) : null
}

/**
 * The period, in words: what an AI is given, and what you see under "See what's sent". `only` (v0.14, "Only entries
 * about this"): just those entries, with the small joys, evening answers and week notes from their days and the next
 * steps that came from them; the package says the rest was left out.
 */
export function buildReviewPackage(data: ReviewData, period: Period, focus: string, only?: ReadonlySet<string>): ReviewPackage {
  const entries = data.entries
    .filter((e) => e.status !== 'draft' && within(e.date, period) && (!only || only.has(e.id)))
    .sort((a, b) => a.date.localeCompare(b.date) || PART_ORDER[a.part] - PART_ORDER[b.part] || a.createdAt - b.createdAt)
  const entryDates = new Set(entries.map((e) => e.date))
  const entryIds = new Set(entries.map((e) => e.id))
  const onTheirDays = (date: string) => !only || entryDates.has(date)
  const joys = data.days.filter((d) => d.smallJoy.trim() && within(d.date, period) && onTheirDays(d.date))
  const answers = data.answers.filter((a) => a.text.trim() && within(a.date, period) && onTheirDays(a.date))
  const steps = data.steps.filter(
    (s) =>
      (s.status === 'active' || (s.finishedAt !== null && within(toDateKey(new Date(s.finishedAt)), period))) &&
      (!only || s.entryIds.some((id) => entryIds.has(id))),
  )
  const carry = data.weeks.filter(
    (w) => w.carry.trim() && w.id >= weekStart(period.start) && w.id <= period.end && (!only || [...entryDates].some((d) => weekStart(d) === w.id)),
  )

  const range = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }).formatRange(fromDateKey(period.start), fromDateKey(period.end))
  const purpose = purposeInfo(data.purpose.primary).label
  const own = data.purpose.primary === 'goal' ? data.purpose.goal.trim() : focusFor(data.purpose.primary, data.purpose.focus)
  const out: string[] = [`# My journal, ${range}`, '', `What I journal for: ${purpose}${own ? ` (${own.charAt(0).toLowerCase()}${own.slice(1)})` : ''}`]
  if (only)
    out.push(
      '',
      `Only the entries about "${focus.trim()}" are here, chosen by the app, with the small joys and answers from their days. The rest of the period is left out.`,
    )

  const dates = [...new Set([...entries.map((e) => e.date), ...joys.map((d) => d.date), ...answers.map((a) => a.date)])].sort()
  for (const date of dates) {
    out.push('', `## ${longDate(date, LOCALE)}`)
    for (const e of entries.filter((e) => e.date === date)) out.push(...entryLines(e, data.steps))
    for (const d of joys.filter((d) => d.date === date)) out.push(`- Small joy: ${d.smallJoy.trim()}`)
    for (const a of answers.filter((a) => a.date === date)) out.push(`- ${a.question} ${a.text.trim().replace(/\n+/g, ' / ')}`)
  }
  if (steps.length) {
    out.push('', '## Next steps')
    for (const s of steps) {
      const how = s.kind === 'once' ? 'once' : 'ongoing'
      out.push(s.status === 'active' ? `- Working on: ${stepLine(s)} (${how})` : `- ${s.status === 'done' ? 'Done' : 'Stopped'}: ${stepLine(s)} (${how})`)
    }
  }
  for (const w of carry) out.push('', `To carry into the week of ${dayMonthLong(w.id, LOCALE)}: ${w.carry.trim()}`)

  const text = out.join('\n')
  const instructions = focus.trim() ? `${REVIEW_INSTRUCTIONS}\n\nPlease look especially at: ${focus.trim()}` : REVIEW_INSTRUCTIONS
  return {
    instructions,
    text: `${instructions}\n\n---\n\n${text}`,
    data: text,
    counts: { entries: entries.length, days: new Set(entries.map((e) => e.date)).size, smallJoys: joys.length, answers: answers.length, steps: steps.length },
    words: text.split(/\s+/).filter(Boolean).length,
  }
}
