import { describe, expect, it } from 'vitest'
import { buildMapPackage, MAX_IDEAS, MAX_LINKS, mapPeriod, normaliseWords, parseIdeaMap, quoteIn, writtenSince } from '../../src/domain/ideaMap'
import { areaEntry } from '../fixtures/areas'

// Fictional writing only: short reflective notes, the kind the map is for.

const written = (id: string, date: string, text: string, extra = {}) => ({ ...areaEntry({ id, text, expect: [] }, date), ...extra })

const JOURNAL = [
  written('w4', '2026-10-07', 'Rushing again today. The tension sat in my shoulders all afternoon.'),
  written('w1', '2026-10-01', 'Rushing the morning makes everything tense. I skip breakfast and snap at people.'),
  written('w2', '2026-10-03', 'A short walk at lunch eases the tension. I come back calmer.'),
  written('w3', '2026-10-05', "Comparing myself to others leaves me feeling behind. Writing it down shrinks the worry, it doesn't vanish."),
  written('draft', '2026-10-06', 'Half a thought about rushing', { status: 'draft' }),
  written('photo', '2026-10-06', '', { photos: [{ id: 'p1', text: 'Rushing tension walk', items: [] }] }),
  written('old', '2026-08-01', 'Rushing the summer away.'),
]
const PERIOD = { start: '2026-09-01', end: '2026-10-31' }
const pack = buildMapPackage(JOURNAL, PERIOD)

const reply = (map: unknown) => JSON.stringify(map)
const idea = (id: string, label: string, entries: unknown[], kind = 'weighs') => ({ id, label, kind, entries })

describe('buildMapPackage', () => {
  it('sends each finished entry in the period as [E1] date: your own words, oldest first; never drafts, photos’ text or other days', () => {
    expect(pack.refs).toEqual({ E1: 'w1', E2: 'w2', E3: 'w3', E4: 'w4' })
    expect(pack.data.split('\n')).toEqual([
      'My journal entries, 1 Sept 2026 to 31 Oct 2026, my own words only:',
      '[E1] 1 Oct 2026: Rushing the morning makes everything tense. I skip breakfast and snap at people.',
      '[E2] 3 Oct 2026: A short walk at lunch eases the tension. I come back calmer.',
      "[E3] 5 Oct 2026: Comparing myself to others leaves me feeling behind. Writing it down shrinks the worry, it doesn't vanish.",
      '[E4] 7 Oct 2026: Rushing again today. The tension sat in my shoulders all afternoon.',
    ])
    expect(pack.text).toBe(`${pack.instructions}\n\n---\n\n${pack.data}`)
  })

  it('counts the entries and words before anything leaves', () => {
    expect(pack.entryCount).toBe(4)
    expect(pack.words).toBe(13 + 12 + 17 + 11)
  })

  it('asks for JSON, and for links only where you joined two ideas yourself, quoted', () => {
    expect(pack.instructions).toContain('JSON')
    expect(pack.instructions).toMatch(/only where I joined two ideas myself/)
    expect(pack.instructions).toMatch(/Never add a link I didn't write/)
  })

  it('all time starts from the first entry; 30 and 90 days end today', () => {
    expect(mapPeriod('all', '2026-11-03', '2026-08-01')).toEqual({ start: '2026-08-01', end: '2026-11-03' })
    expect(mapPeriod('all', '2026-11-03', null)).toEqual({ start: '2026-11-03', end: '2026-11-03' })
    expect(mapPeriod('30', '2026-11-03', null)).toEqual({ start: '2026-10-05', end: '2026-11-03' })
    expect(mapPeriod('90', '2026-11-03', null).start).toBe('2026-08-06')
  })
})

describe('quoteIn', () => {
  const text = "Writing it down shrinks the worry, it doesn't vanish."
  it('matches whatever the case, curly quotes, dashes and spacing', () => {
    expect(normaliseWords('It DOESN’T  vanish—ever')).toBe('it doesnt vanish ever')
    expect(quoteIn('shrinks the worry', text)).toBe(true)
    expect(quoteIn('it doesn’t vanish', text)).toBe(true)
    expect(quoteIn('WRITING it down', text)).toBe(true)
  })
  it('allows … between parts copied in order, never parts out of order or words not there', () => {
    expect(quoteIn('Writing it down … the worry', text)).toBe(true)
    expect(quoteIn('the worry … Writing it down', text)).toBe(false)
    expect(quoteIn('shrinks every worry', text)).toBe(false)
    expect(quoteIn('rink', text)).toBe(false)
  })
})

describe('parseIdeaMap', () => {
  const ideas = [idea('a', 'Rushing', ['E1', 'E4']), idea('b', 'Tension', ['E4']), idea('c', 'A short walk', ['E2'], 'helps')]

  it('keeps ideas and a quoted link, with entry ids for refs, most-written first', () => {
    const map = parseIdeaMap(reply({ ideas, links: [{ from: 'a', to: 'b', words: 'makes', entry: 'E1', quote: 'Rushing the morning makes everything tense' }] }), pack)!
    expect(map.ideas).toEqual([
      { id: 'i1', label: 'Rushing', kind: 'weighs', entryIds: ['w1', 'w4'] },
      // The link's entry counts for Tension too.
      { id: 'i2', label: 'Tension', kind: 'weighs', entryIds: ['w1', 'w4'] },
      { id: 'i3', label: 'A short walk', kind: 'helps', entryIds: ['w2'] },
    ])
    expect(map.links).toEqual([{ from: 'i1', to: 'i2', words: 'makes', entryId: 'w1', quote: 'Rushing the morning makes everything tense' }])
    expect(map.dropped).toEqual({ ideas: 0, links: 0, cut: 0 })
  })

  it('drops a link whose quote isn’t in its entry, and counts it', () => {
    const made = { from: 'c', to: 'b', words: 'eases', entry: 'E2', quote: 'a walk always cures my tension' }
    const map = parseIdeaMap(reply({ ideas, links: [made] }), pack)!
    expect(map.links).toEqual([])
    expect(map.dropped.links).toBe(1)
  })

  it('drops a link quoted from another entry, or whose words aren’t in its quote', () => {
    const elsewhere = { from: 'c', to: 'b', words: 'eases', entry: 'E4', quote: 'A short walk at lunch eases the tension' }
    const wrongWords = { from: 'c', to: 'b', words: 'cures', entry: 'E2', quote: 'A short walk at lunch eases the tension' }
    const tooShort = { from: 'c', to: 'b', words: 'eases', entry: 'E2', quote: 'eases' }
    expect(parseIdeaMap(reply({ ideas, links: [elsewhere, wrongWords, tooShort] }), pack)!.dropped.links).toBe(3)
  })

  it('reads refs written any way, but only ones that were sent; an idea left with none goes, with its links', () => {
    const map = parseIdeaMap(reply({ ideas: [idea('a', 'Rushing', ['[e1]', 4]), idea('x', 'Summer', ['E9', 'old'])], links: [{ from: 'a', to: 'x', words: 'away', entry: 'E1', quote: 'Rushing the morning' }] }), pack)!
    expect(map.ideas.map((i) => [i.label, i.entryIds])).toEqual([['Rushing', ['w1', 'w4']]])
    expect(map.dropped).toEqual({ ideas: 1, links: 1, cut: 0 })
  })

  it('drops an idea whose label isn’t in its entries’ words', () => {
    const map = parseIdeaMap(reply({ ideas: [idea('a', 'Perfectionism', ['E1']), idea('b', 'Worried', ['E3'])] }), pack)!
    // "Worried" starts like "worry", in E3; nothing in E1 starts like "Perfectionism".
    expect(map.ideas.map((i) => i.label)).toEqual(['Worried'])
    expect(map.dropped.ideas).toBe(1)
  })

  it('an unknown kind is "idea", never guessed; a label too long goes', () => {
    const map = parseIdeaMap(reply({ ideas: [idea('a', 'Rushing', ['E1'], 'anxiety'), idea('b', 'Comparing myself to others leaves me', ['E3'])] }), pack)!
    expect(map.ideas).toEqual([{ id: 'i1', label: 'Rushing', kind: 'idea', entryIds: ['w1'] }])
  })

  it('drops a link to itself, and keeps one link for each pair and direction', () => {
    const link = { from: 'a', to: 'b', words: 'makes', entry: 'E1', quote: 'Rushing the morning makes everything tense' }
    const map = parseIdeaMap(reply({ ideas, links: [link, link, { ...link, to: 'a' }] }), pack)!
    expect(map.links).toHaveLength(1)
    expect(map.dropped.links).toBe(1)
  })

  it('joins the same idea given twice', () => {
    const map = parseIdeaMap(reply({ ideas: [idea('a', 'Rushing', ['E1']), idea('b', 'rushing', ['E4'])] }), pack)!
    expect(map.ideas).toEqual([{ id: 'i1', label: 'Rushing', kind: 'weighs', entryIds: ['w1', 'w4'] }])
  })

  it(`keeps at most ${MAX_IDEAS} ideas and ${MAX_LINKS} links, saying how many more were cut`, () => {
    const many = Array.from({ length: MAX_IDEAS + 2 }, (_, i) => idea(`n${i}`, i % 2 ? 'Rushing' : 'Tension', ['E4']))
    // Labels repeat, so make them differ in a way still found in E4.
    const labels = ['Rushing', 'Tension', 'Shoulders', 'Afternoon', 'Today', 'Again', 'Rushing again', 'The tension', 'My shoulders', 'All afternoon', 'Sat', 'Tension sat', 'Again today', 'Shoulders all']
    many.forEach((m, i) => (m.label = labels[i]!))
    const links = Array.from({ length: MAX_LINKS + 3 }, (_, i) => ({ from: `n${i % 7}`, to: `n${(i % 7) + 1 + Math.floor(i / 7)}`, words: 'sat', entry: 'E4', quote: 'The tension sat in my shoulders' }))
    const map = parseIdeaMap(reply({ ideas: many, links }), pack)!
    expect(map.ideas).toHaveLength(MAX_IDEAS)
    expect(map.links.length).toBeLessThanOrEqual(MAX_LINKS)
    expect(map.dropped.cut).toBeGreaterThan(0)
  })

  it('null for a reply that isn’t a map; reads JSON wrapped in words or ```', () => {
    expect(parseIdeaMap('Sorry, I can only answer in words.', pack)).toBeNull()
    expect(parseIdeaMap(reply({ thoughts: [] }), pack)).toBeNull()
    expect(parseIdeaMap('Here it is:\n```json\n' + reply({ ideas: [idea('a', 'Rushing', ['E1'])] }) + '\n```', pack)?.ideas).toHaveLength(1)
  })
})

describe('writtenSince', () => {
  it('counts finished entries of your own words in the map’s period written or changed after it', () => {
    const later = [written('n1', '2026-10-08', 'Rushing less this week.', { updatedAt: 50 }), written('n2', '2026-08-01', 'Before the map’s period.', { updatedAt: 50 }), written('n3', '2026-10-09', 'Not done', { updatedAt: 50, status: 'draft' })]
    expect(writtenSince({ createdAt: 10, start: '2026-09-01' }, [...JOURNAL, ...later])).toBe(1)
  })
})
