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

  it('keeps markup it does not know as plain text, never as HTML', () => {
    expect(parseMarkdown('<img src=x onerror=alert(1)> and `code`')).toEqual([{ kind: 'paragraph', text: '<img src=x onerror=alert(1)> and `code`' }])
  })
})
