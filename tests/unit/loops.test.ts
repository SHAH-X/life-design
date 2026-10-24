import { describe, expect, it } from 'vitest'
import { findLoops, loopKind, sentencesOf } from '../../src/domain/loops'
import { LOOP_JOURNAL, LOOP_JOURNAL_UNSEEN, LOOP_SENTENCES, LOOP_SENTENCES_MORE, LOOP_UNSEEN, journalEntry } from '../fixtures/loops'

describe('loopKind: open loops by their wording', () => {
  it('finds each fictional loop, of the right kind, and none of the look-alikes', () => {
    const wrong = [...LOOP_SENTENCES, ...LOOP_SENTENCES_MORE].filter((s) => loopKind(s.text) !== s.kind).map((s) => `${s.text} → ${loopKind(s.text)} (wanted ${s.kind})`)
    expect(wrong).toEqual([])
  })

  it('does as well on sentences never used to write the rules (19 of 19 loops, none of the 15 others, v0.16)', () => {
    const wrong = LOOP_UNSEEN.filter((s) => loopKind(s.text) !== s.kind).map((s) => `${s.text} → ${loopKind(s.text)} (wanted ${s.kind})`)
    expect(wrong).toEqual([])
  })
})

describe('findLoops', () => {
  it('finds the planted loops in both fictional journals, and nothing else', () => {
    const found = [...LOOP_JOURNAL, ...LOOP_JOURNAL_UNSEEN].flatMap((c) => findLoops(journalEntry(c)).map((l) => ({ id: c.id, text: l.text })))
    const planted = [...LOOP_JOURNAL, ...LOOP_JOURNAL_UNSEEN].flatMap((c) => (c.loops ?? []).map((l) => ({ id: c.id, quote: l.quote })))
    const missed = planted.filter((p) => !found.some((f) => f.id === p.id && f.text.includes(p.quote)))
    const extra = found.filter((f) => !planted.some((p) => p.id === f.id && f.text.includes(p.quote)))
    expect({ missed, extra }).toEqual({ missed: [], extra: [] })
  })

  it('reads no draft', () => {
    expect(findLoops({ ...journalEntry(LOOP_JOURNAL[0]!), status: 'draft' })).toEqual([])
  })

  it('keeps numbers like 4.2% and 49.99 inside their sentence', () => {
    expect(sentencesOf('The rate is 4.2% now. It cost 49.99! Done')).toEqual(['The rate is 4.2% now.', 'It cost 49.99!', 'Done'])
  })
})
