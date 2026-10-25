import { DURATION_LABELS, ENERGY_OPTIONS } from '../domain/feelings'
import { purposeInfo } from '../domain/purposes'
import { itemShown } from '../domain/receipts'
import type { KnownReceipt } from '../domain/shopping'
import { stepLine } from '../domain/steps'
import { PART_ORDER, toDateKey } from '../lib/dates'
import type { Entry, Step, StepStatus } from './types'

const HEADER = [
  'date',
  'part_of_day',
  'activity',
  'what_it_was_like',
  'how_it_left_you',
  'engagement_1_to_5',
  'energy_minus2_to_plus2',
  'flow',
  'where',
  'with_whom',
  'using',
  'note',
  'source',
  'created_at',
  'kind',
  'purpose',
  'energy',
  'how_long',
  'reflections',
  'next_step',
]

function cell(value: string | number, isText = false): string {
  let s = String(value)
  // Stop spreadsheets from running free text as a formula.
  if (isText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const STATUS_WORDS: Record<StepStatus, string> = { active: 'working on it', done: 'done', stopped: 'stopped' }

/** The next steps that came from an entry (v0.11: their own list), then what it keeps to remember. */
function nextSteps(entry: Entry, steps: readonly Step[]): string {
  const parts = steps.filter((s) => s.entryIds.includes(entry.id)).map((s) => `${stepLine(s)} (${STATUS_WORDS[s.status]})`)
  if (entry.intention?.kind === 'remember' && entry.intention.text) parts.push(`To remember: ${entry.intention.text}`)
  return parts.join(' | ')
}

/** Finished entries, oldest first, with the next steps that came from them. Drafts are left out. */
export function entriesToCsv(entries: readonly Entry[], steps: readonly Step[] = []): string {
  const rows = entries
    .filter((e) => e.status !== 'draft')
    .sort((a, b) => a.date.localeCompare(b.date) || PART_ORDER[a.part] - PART_ORDER[b.part] || a.createdAt - b.createdAt)
    .map((e) =>
      [
        cell(e.date),
        cell(e.part),
        cell(e.activity, true),
        cell(e.during.join('; '), true),
        cell(e.after.join('; '), true),
        cell(e.engagement),
        cell(e.energy),
        cell(e.flow ? 'yes' : 'no'),
        cell(e.where.join('; '), true),
        cell(e.people.join('; '), true),
        cell(e.objects.join('; '), true),
        cell(e.note, true),
        cell(e.source),
        cell(new Date(e.createdAt).toISOString()),
        cell(e.kind),
        cell(e.purpose ? purposeInfo(e.purpose).label : '', true),
        cell(ENERGY_OPTIONS.find((o) => o.value === e.energyEffect)?.label ?? '', true),
        cell(e.duration ? DURATION_LABELS[e.duration] : '', true),
        cell(e.reflections.map((r) => `${r.question} ${r.text}`).join(' | '), true),
        cell(nextSteps(e, steps), true),
      ].join(','),
    )
  // The byte-order mark lets Excel read the file as UTF-8.
  return `﻿${[HEADER.join(','), ...rows].join('\r\n')}\r\n`
}

export function csvFileName(now: Date): string {
  return `life-design-entries-${toDateKey(now)}.csv`
}

const RECEIPT_HEADER = ['date', 'shop', 'item', 'as_printed', 'kind', 'quantity', 'price', 'currency', 'receipt_total', 'adds_up', 'date_read', 'read_by']

/** Pence as a plain number a spreadsheet adds up, "1.45" or "-0.50"; the currency has a column of its own. */
const pounds = (minor: number) => `${minor < 0 ? '-' : ''}${(Math.abs(minor) / 100).toFixed(2)}`

/** Every item on your receipts (Shopping, v0.19), a row each, oldest first: what your AI took it for and as printed
 *  (v0.19.3); a receipt's total is the one it printed. */
export function receiptsToCsv(receipts: readonly KnownReceipt[]): string {
  const rows = [...receipts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((r) =>
      r.items.map((item) =>
        [
          cell(r.date),
          cell(r.shop, true),
          cell(itemShown(item), true),
          cell(item.name, true),
          cell(item.kind ?? ''),
          cell(item.quantity),
          cell(pounds(item.price)),
          cell(r.currency),
          cell(r.total === null ? '' : pounds(r.total)),
          cell(r.adds ? 'yes' : 'no'),
          cell(r.dated ? 'yes' : 'no'),
          cell(r.readBy ?? 'the phone', true),
        ].join(','),
      ),
    )
  return `\ufeff${[RECEIPT_HEADER.join(','), ...rows].join('\r\n')}\r\n`
}

export function shoppingCsvFileName(now: Date): string {
  return `life-design-shopping-${toDateKey(now)}.csv`
}
