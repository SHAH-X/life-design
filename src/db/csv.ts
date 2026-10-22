import { DURATION_LABELS, ENERGY_OPTIONS } from '../domain/feelings'
import { INTENTION_OPTIONS } from '../domain/intentions'
import { purposeInfo } from '../domain/purposes'
import { PART_ORDER, toDateKey } from '../lib/dates'
import type { Entry } from './types'

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

function nextStep(entry: Entry): string {
  const { intention } = entry
  if (!intention) return ''
  const label = INTENTION_OPTIONS.find((o) => o.value === intention.kind)?.label ?? intention.kind
  return `${label}${intention.text ? `: ${intention.text}` : ''} (${intention.status})`
}

/** Finished entries, oldest first. Drafts are left out. */
export function entriesToCsv(entries: readonly Entry[]): string {
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
        cell(nextStep(e), true),
      ].join(','),
    )
  // The byte-order mark lets Excel read the file as UTF-8.
  return `﻿${[HEADER.join(','), ...rows].join('\r\n')}\r\n`
}

export function csvFileName(now: Date): string {
  return `life-design-entries-${toDateKey(now)}.csv`
}
