import { describe, expect, it } from 'vitest'
import { parseMarkdown } from '../../src/ui/PlainMarkdown'

// An AI's answer, read safely (v0.12): headings, lists and paragraphs; anything else stays plain text.
describe('parseMarkdown', () => {
  it('reads headings, numbered and bulleted lists, and paragraphs', () => {
    const text = '## What happened\nA busy week,\nwith long meetings.\n\n1. Meetings drained you\n2. Walks helped\n\n- Try an agenda\n- Walk after lunch\n---\nWhat would you protect?'
    expect(parseMarkdown(text)).toEqual([
      { kind: 'heading', text: 'What happened' },
      { kind: 'paragraph', text: 'A busy week, with long meetings.' },
      { kind: 'list', ordered: true, items: ['Meetings drained you', 'Walks helped'] },
      { kind: 'list', ordered: false, items: ['Try an agenda', 'Walk after lunch'] },
      { kind: 'paragraph', text: 'What would you protect?' },
    ])
  })

  // A table came back joined into one line of pipes (owner, 2026-10-25): its rows were read as one paragraph.
  it('reads a table: its header and rows as cells, a column of amounts or numbers lined up on the right', () => {
    const text = 'Greenleaf Market, 12 Oct:\n| Item | What it is | Price | Qty |\n|------|:-----------|------:|-----|\n| 0at milk | oat milk | £1.45 | 1 |\n| Sourdough loaf | **bread** | £3.20 |\n\nAll from one receipt.'
    expect(parseMarkdown(text)).toEqual([
      { kind: 'paragraph', text: 'Greenleaf Market, 12 Oct:' },
      {
        kind: 'table',
        header: ['Item', 'What it is', 'Price', 'Qty'],
        rows: [
          ['0at milk', 'oat milk', '£1.45', '1'],
          ['Sourdough loaf', '**bread**', '£3.20', ''],
        ],
        right: [false, false, true, true],
      },
      { kind: 'paragraph', text: 'All from one receipt.' },
    ])
  })

  it('reads a table without its outer pipes, and keeps pipes that make no table as plain text', () => {
    expect(parseMarkdown('Item | Price\n--- | ---\nBread | 1.20')).toEqual([{ kind: 'table', header: ['Item', 'Price'], rows: [['Bread', '1.20']], right: [false, true] }])
    expect(parseMarkdown('Either | or\nnot a table')).toEqual([{ kind: 'paragraph', text: 'Either | or not a table' }])
  })

  it('keeps markup it does not know as plain text, never as HTML', () => {
    expect(parseMarkdown('<img src=x onerror=alert(1)> and `code`')).toEqual([{ kind: 'paragraph', text: '<img src=x onerror=alert(1)> and `code`' }])
  })
})
