import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// DECISIONS.md is read like a database (see CLAUDE.md), so its tables must keep their shape. In v0.8 an edit wrote
// new statuses over three rows' reasons and dropped their closing pipes; nothing noticed until a later read.

const STATUS = /\b(ADOPT|TEST|WATCH|REJECT)\b/

interface Table {
  line: number
  header: string[]
  /** Whether a separator row (|---|) follows the header: without it, it's a stray row, not a table. */
  separated: boolean
  rows: { line: number; text: string; cells: string[] }[]
}

function cellsOf(text: string): string[] {
  return text
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim())
}

function tables(markdown: string): Table[] {
  const found: Table[] = []
  let current: Table | null = null
  markdown.split('\n').forEach((text, i) => {
    if (!text.trimStart().startsWith('|')) {
      current = null
      return
    }
    if (current === null) {
      current = { line: i + 1, header: cellsOf(text), separated: false, rows: [] }
      found.push(current)
    } else if (/^\|[\s|:-]+\|$/.test(text.trim())) {
      if (current.rows.length === 0) current.separated = true
    } else {
      current.rows.push({ line: i + 1, text, cells: cellsOf(text) })
    }
  })
  return found
}

describe('DECISIONS.md tables', () => {
  const all = tables(readFileSync('DECISIONS.md', 'utf8'))

  it('are found', () => {
    expect(all.length).toBeGreaterThan(5)
  })

  // v0.13: a new row appended at the end of the file landed after the closing list, a one-row "table" of its own
  // that every other check passed.
  it('start every table with a header and a separator, so no row lands outside its table', () => {
    expect(all.filter((t) => !t.separated).map((t) => `line ${t.line}: ${t.header.join(' | ')}`)).toEqual([])
  })

  it('close every row with a pipe and keep the header’s number of cells', () => {
    const broken = all.flatMap((t) =>
      t.rows.filter((r) => !r.text.trim().endsWith('|') || r.cells.length !== t.header.length).map((r) => `line ${r.line}: ${r.text}`),
    )
    expect(broken).toEqual([])
  })

  it('give every row a status in the Status column, and keep the reason in the Why column', () => {
    const broken = all.flatMap((t) => {
      const status = t.header.indexOf('Status')
      const why = t.header.indexOf('Why')
      return t.rows
        .filter((r) => (status >= 0 && !STATUS.test(r.cells[status] ?? '')) || (why >= 0 && /^(ADOPT|TEST|WATCH|REJECT)\b/.test(r.cells[why] ?? '')))
        .map((r) => `line ${r.line}: ${r.text}`)
    })
    expect(broken).toEqual([])
  })
})
