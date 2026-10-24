import { describe, expect, it } from 'vitest'
import { closeness, closest, meaningChunks, meaningHash, meaningText, standOut } from '../../src/domain/meaning'
import { fakeEntry } from '../fixtures/meaning'

// Fictional example data.

describe('meaningText: what search by meaning reads in an entry', () => {
  it('reads what you did and wrote, your answers, take and what to remember, the feeling words and the energy answer', () => {
    const entry = {
      ...fakeEntry('e1', 'Team meeting', 'Went in circles', ['Distracted'], ['Frustrated', 'Tired'], 'used'),
      reflections: [{ question: 'What went well?', text: 'The demo landed' }],
      take: 'Meetings after lunch drag',
      intention: { kind: 'differently' as const, text: 'Ask for an agenda', status: 'open' as const, updatedAt: 1 },
    }
    expect(meaningText(entry)).toBe(
      'Team meeting. Went in circles. The demo landed. Meetings after lunch drag. Ask for an agenda. Felt distracted, frustrated, tired. It used up my energy.',
    )
  })

  it("leaves out the questions, places and people, empty parts and a skipped energy question, and doesn't add a second full stop", () => {
    const entry = { ...fakeEntry('e1', '', 'A long walk!', [], [], null), kind: 'free' as const, where: ['Park'], people: ['Sam'] }
    expect(meaningText({ ...entry, reflections: [{ question: 'What went well?', text: '' }] })).toBe('A long walk!')
  })

  it('reads an entry from before feeling words with the words the app shows for it', () => {
    const old = { ...fakeEntry('old', 'Team meeting', '', [], []), engagement: 2 as const, energy: -1 as const }
    expect(meaningText(old)).toBe('Team meeting. Felt distracted, tired.')
  })

  it("never guesses words: none for a skipped question, and none for free writing that had none", () => {
    const skipped = { ...fakeEntry('s', 'Team meeting', '', [], []), skipped: ['engagement' as const, 'energy' as const] }
    expect(meaningText(skipped)).toBe('Team meeting.')
    expect(meaningText({ ...fakeEntry('f', '', 'Rain all day.', [], []), kind: 'free' })).toBe('Rain all day.')
  })

  it('is empty for an entry with no words at all', () => {
    expect(meaningText({ ...fakeEntry('e1', '', '', [], []), skipped: ['engagement', 'energy'] })).toBe('')
  })
})

describe('meaningChunks: long writing in pieces', () => {
  it('keeps a short text whole', () => {
    expect(meaningChunks('One. Two!')).toEqual(['One. Two!'])
  })

  it('cuts at sentence ends, at most the given number of words per piece', () => {
    const text = 'a b c. d e f. g h i. j k.'
    expect(meaningChunks(text, 6)).toEqual(['a b c. d e f.', 'g h i. j k.'])
  })

  it('keeps a single sentence longer than the limit as one piece', () => {
    expect(meaningChunks('a b c d e f g h', 3)).toEqual(['a b c d e f g h'])
  })
})

describe('meaningHash', () => {
  it('is the same for the same model and text, and changes with either', () => {
    expect(meaningHash('m', 'Hike.')).toBe(meaningHash('m', 'Hike.'))
    expect(meaningHash('m', 'Hike.')).not.toBe(meaningHash('m', 'Hike!'))
    expect(meaningHash('m', 'Hike.')).not.toBe(meaningHash('n', 'Hike.'))
  })
})

describe('closeness and standOut: which entries to show, closest first', () => {
  const v = (...xs: number[]) => Float32Array.from(xs)

  it("scores an entry by its closest piece", () => {
    const scores = closeness(v(1, 0), [
      { entryId: 'a', vector: v(0, 1) },
      { entryId: 'a', vector: v(1, 0) },
      { entryId: 'b', vector: v(0.6, 0.8) },
    ])
    expect(scores.get('a')).toBeCloseTo(1)
    expect(scores.get('b')).toBeCloseTo(0.6)
  })

  it('closest: simply the closest, closest first, at most max', () => {
    const scores = new Map([['a', 0.1], ['b', 0.9], ['c', 0.5], ['d', 0.3]])
    expect(closest(scores, 3)).toEqual(['b', 'c', 'd'])
    expect(closest(scores, 9)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('with few entries, gives the closest three', () => {
    const scores = new Map([['a', 0.1], ['b', 0.9], ['c', 0.5], ['d', 0.3]])
    expect(standOut(scores, 5)).toEqual(['b', 'c', 'd'])
    expect(standOut(scores, 2)).toEqual(['b', 'c'])
    expect(standOut(new Map(), 5)).toEqual([])
  })

  it('with more, gives only those that stand out from the rest, closest first, at most max', () => {
    const scores = new Map<string, number>()
    for (let i = 0; i < 20; i++) scores.set(`n${i}`, 0.5 + (i % 3) * 0.01)
    scores.set('close', 0.8)
    scores.set('closer', 0.9)
    expect(standOut(scores, 5)).toEqual(['closer', 'close'])
    expect(standOut(scores, 1)).toEqual(['closer'])
  })

  it('when half are close and half far, gives the close ones, at most max', () => {
    const scores = new Map<string, number>()
    for (let i = 0; i < 10; i++) scores.set(`far${i}`, 0.2)
    for (let i = 0; i < 10; i++) scores.set(`near${i}`, 0.8)
    expect(standOut(scores, 5)).toHaveLength(5)
    expect(standOut(scores, 20).sort()).toEqual([...Array(10).keys()].map((i) => `near${i}`).sort())
  })

  it('when nothing stands out, gives the closest three and any tied with them, never splitting alike entries', () => {
    const scores = new Map<string, number>([['low', 0]])
    for (let i = 0; i < 11; i++) scores.set(`same${i}`, 0.5)
    expect(standOut(scores, 20)).toHaveLength(11)
    expect(standOut(scores, 4)).toHaveLength(4)
  })
})
