import { PART_ORDER, toDateKey } from '../lib/dates'
import type { Entry } from './types'

const HEADER = [
  'date',
  'part_of_day',
  'activity',
  'engagement_1_to_5',
  'energy_minus2_to_plus2',
  'flow',
  'where',
  'with_whom',
  'using',
  'note',
  'source',
  'created_at',
]

function cell(value: string | number, isText = false): string {
  let s = String(value)
  // Stop spreadsheets from running free text as a formula.
  if (isText && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function entriesToCsv(entries: readonly Entry[]): string {
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || PART_ORDER[a.part] - PART_ORDER[b.part] || a.createdAt - b.createdAt)
    .map((e) =>
      [
        cell(e.date),
        cell(e.part),
        cell(e.activity, true),
        cell(e.engagement),
        cell(e.energy),
        cell(e.flow ? 'yes' : 'no'),
        cell(e.where.join('; '), true),
        cell(e.people.join('; '), true),
        cell(e.objects.join('; '), true),
        cell(e.note, true),
        cell(e.source),
        cell(new Date(e.createdAt).toISOString()),
      ].join(','),
    )
  // The byte-order mark lets Excel read the file as UTF-8.
  return `﻿${[HEADER.join(','), ...rows].join('\r\n')}\r\n`
}

export function csvFileName(now: Date): string {
  return `life-design-entries-${toDateKey(now)}.csv`
}
