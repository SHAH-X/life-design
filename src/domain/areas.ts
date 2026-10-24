import { MIN_COUNT } from '../analysis/stats'
import type { Entry } from '../db/types'

// Life areas (step 2 of the owner's vision, 2026-10-24): what you write sorts itself by what it's about, so you never
// pick a category. The model that searches by meaning reads each area's examples once; an entry goes to the area its
// meaning is clearly closest to, or to none. Seven starter areas can show from the first entry; the possible areas show
// only once 3+ entries fit one (owner: "a wider hidden list"). How close is never shown.
//
// Tuned on a fictional journal (tests/fixtures/areas.ts, 120 entries): 98 right, 15 in no area, 7 elsewhere (some
// fair: soldering in Crafts); of the 34 never used for tuning, 28 right and none elsewhere; 15 of 16 entries on topics
// outside the starters found their area; no one-liner placed. Grouping leftovers into areas named by their words was tried and failed (travel entries share no
// word), as did areas learning from your entries (they swallowed new topics and shifted). Change the examples and the
// tests show what moved: tests/unit/areasModel.test.ts.

export type AreaId =
  | 'money'
  | 'work'
  | 'tech'
  | 'mindset'
  | 'health'
  | 'people'
  | 'home'
  | 'travel'
  | 'cooking'
  | 'music'
  | 'crafts'
  | 'art'
  | 'sport'
  | 'reading'
  | 'faith'
  | 'pets'
  | 'nature'
  | 'games'
  | 'screen'
  | 'community'
  | 'writing'
  | 'style'
  | 'going'

export interface LifeArea {
  id: AreaId
  name: string
  /** Shown from the first entry; the others only once MIN_COUNT entries fit them. */
  starter: boolean
  /** What the model reads to know the area: general sentences, never anyone's writing. */
  examples: readonly string[]
}

export const LIFE_AREAS: readonly LifeArea[] = [
  {
    id: 'money',
    name: 'Money',
    starter: true,
    examples: [
      'Money',
      'Money: spending, bills, rent, prices, a budget, savings, debt, salary and tax.',
      'Trading and investing: stocks, shares, crypto, a trade, the market, profit and loss, my portfolio.',
      'A receipt: what I bought and what it cost.',
      'Paid the bills and checked my bank account.',
      'I need to save more and spend less this month.',
      'Bought shares today and set a stop loss.',
      'Worried about money and how to pay for it.',
      'Got paid: a salary, a bonus, an invoice, a refund.',
    ],
  },
  {
    id: 'work',
    name: 'Work',
    starter: true,
    examples: [
      'Work',
      'Work: my job, my manager, colleagues, meetings, deadlines, a project, clients and my career.',
      'A busy day at work with back-to-back meetings.',
      'My boss gave me feedback on the project.',
      'Applied for a new job and had an interview.',
      'Office politics and a difficult colleague.',
      'Hit the deadline and shipped the release with the team.',
      'Thinking about my career and where it is going.',
    ],
  },
  {
    id: 'tech',
    name: 'Tech & learning',
    starter: true,
    examples: [
      'Tech & learning',
      'Programming notes: code, a bug, an error message, an API, a library, commands to remember.',
      'How this software works: documentation and examples.',
      'Fixed the bug in my code by changing the function.',
      'Studying for a course and taking notes on the chapter.',
      'Learning a new skill, a language or a technology.',
      'A tutorial on databases, servers and deployment.',
      'Something I learned today and want to remember.',
    ],
  },
  {
    id: 'mindset',
    name: 'Mindset',
    starter: true,
    examples: [
      'Mindset',
      'My mindset: thoughts, worries, fears, motivation, confidence, self-talk and what I believe.',
      'Venting about how I feel inside: anxious, stuck, angry, overwhelmed, lost.',
      "I feel like I'm not good enough.",
      'Trying to be kinder to myself and less critical.',
      "Lost my motivation and can't focus on anything.",
      'A realisation about what I really want from life.',
      'Proud that I stuck to my decision.',
    ],
  },
  {
    id: 'health',
    name: 'Health',
    starter: true,
    examples: [
      'Health',
      'Health and body: sleep, exercise, food and diet, illness, pain, a doctor or dentist.',
      'Went for a run and did a workout at the gym.',
      'Slept badly and woke up tired.',
      'Feeling sick with a cold, a headache or a pain.',
      'Eating healthier, cooking vegetables, drinking less.',
      'An appointment with the doctor about my symptoms.',
      'Stretching, yoga and walking to look after my body.',
    ],
  },
  {
    id: 'people',
    name: 'People',
    starter: true,
    examples: [
      'People',
      'People in my life: family, friends, my partner, children, a relationship, someone I miss.',
      'Spent time with friends and family.',
      'A fight with my partner and how we made up.',
      'My parents, my brother or sister, my kids.',
      'Feeling lonely and missing someone.',
      'Met someone new; a date; falling for someone.',
      'A conversation with a friend that meant a lot.',
    ],
  },
  {
    id: 'home',
    name: 'Home & errands',
    starter: true,
    examples: [
      'Home & errands',
      'Home and errands: chores, cleaning, groceries, repairs, the house, the garden, a shopping list, admin and bookings.',
      'To do: errands, appointments to book, things to fix around the house.',
      'Shopping list for the supermarket.',
      'Cleaned the flat and did the laundry.',
      'Something broke at home and needs fixing.',
      'Renewing documents, insurance and paperwork.',
      'Working in the garden and tidying up.',
    ],
  },
  {
    id: 'travel',
    name: 'Travel',
    starter: false,
    examples: ['Travel: trips, holidays, flights, hotels, places I visited or want to visit.', 'Planning a trip abroad.', 'Sightseeing in a new city.'],
  },
  {
    id: 'cooking',
    name: 'Cooking',
    starter: false,
    examples: ['Cooking and baking: recipes, meals I made, ingredients.', 'Tried a new recipe for dinner.', 'Baking bread and cakes.'],
  },
  {
    id: 'music',
    name: 'Music',
    starter: false,
    examples: ['Music: playing an instrument, singing, a band, songs I wrote, practising.', 'Practised the piano.', 'Went to a concert.'],
  },
  {
    id: 'crafts',
    name: 'Crafts',
    starter: false,
    examples: ['Making things by hand: crafts, pottery, knitting, woodwork, sewing.', 'Worked on my craft project in the studio.'],
  },
  { id: 'art', name: 'Art', starter: false, examples: ['Art: drawing, painting, sketching, photography.', 'Painted a picture this afternoon.'] },
  { id: 'sport', name: 'Sport', starter: false, examples: ['Sport: football, tennis, climbing, cycling, a match or a race.', 'Played a match with my team.'] },
  { id: 'reading', name: 'Reading', starter: false, examples: ['Reading: a novel, a book I finished, what I am reading now.', 'Read a few chapters before bed.'] },
  { id: 'faith', name: 'Faith', starter: false, examples: ['Faith and spirituality: prayer, church, mosque, temple, meditation, God.', 'Prayed this morning.'] },
  { id: 'pets', name: 'Pets', starter: false, examples: ['Pets: my dog or cat, walks, the vet.', 'Took the dog for a walk.'] },
  { id: 'nature', name: 'Nature', starter: false, examples: ['Nature and the outdoors: hiking, the countryside, birds, the sea.', 'A walk in the woods.'] },
  { id: 'games', name: 'Games', starter: false, examples: ['Games: video games, board games, chess, puzzles.', 'Played a game online with friends.'] },
  { id: 'screen', name: 'Films & TV', starter: false, examples: ['Films and TV: a series, a film I watched, a show.', 'Watched a film tonight.'] },
  {
    id: 'community',
    name: 'Community',
    starter: false,
    examples: ['Volunteering and community: helping out, a charity, my neighbourhood.', 'Volunteered at the food bank.'],
  },
  { id: 'writing', name: 'Writing', starter: false, examples: ['Writing: a story, a blog, a book I am writing.', 'Wrote a chapter of my story.'] },
  { id: 'style', name: 'Clothes & style', starter: false, examples: ['Clothes and style: an outfit, shopping for clothes, my hair.', 'Bought a new jacket.'] },
  { id: 'going', name: 'Going out', starter: false, examples: ['Going out: parties, events, festivals, nights out.', 'Went to a party last night.'] },
]

const BY_ID = new Map(LIFE_AREAS.map((a) => [a.id, a]))

export const areaName = (id: AreaId): string => BY_ID.get(id)?.name ?? id

/** What an entry is called in lists, labels and its sheet: the activity, or for free writing its life areas ("Money ·
 * Health", v0.16), or "Free writing" while it's in none. Never the writing itself: a long first line once became a
 * whole passage in bold (v0.12.2). Screens use `useEntryTitle`, which knows the areas. */
export function entryTitle(entry: Entry, areas: readonly AreaId[] = []): string {
  if (entry.kind !== 'free') return entry.activity
  return areas.length ? areas.map(areaName).join(' · ') : 'Free writing'
}

export interface AreaLine {
  id: AreaId
  name: string
  /** The entries in it, newest last as given. */
  entryIds: string[]
}

/**
 * Insights' life areas for some entries: those with MIN_COUNT or more, most first (ties by name), and the rest, by
 * name and never ranked. An entry in two areas counts in both.
 */
export function areaLines(entryIds: readonly string[], byEntry: ReadonlyMap<string, readonly AreaId[]>): { ranked: AreaLine[]; also: AreaLine[] } {
  const lines = new Map<AreaId, AreaLine>()
  for (const entryId of entryIds)
    for (const id of byEntry.get(entryId) ?? []) {
      const line = lines.get(id) ?? { id, name: areaName(id), entryIds: [] }
      line.entryIds.push(entryId)
      lines.set(id, line)
    }
  const byName = (a: AreaLine, b: AreaLine) => a.name.localeCompare(b.name)
  const all = [...lines.values()]
  return {
    ranked: all.filter((l) => l.entryIds.length >= MIN_COUNT).sort((a, b) => b.entryIds.length - a.entryIds.length || byName(a, b)),
    also: all.filter((l) => l.entryIds.length < MIN_COUNT).sort(byName),
  }
}

/** Writing shorter than this ("ok day", "Tuesday.") is in no area: one-liners look alike and would form one. */
export const MIN_AREA_WORDS = 4
/** How close an entry must be to an area to go in it (after taking away what all writing shares). */
const PLACE = 0.15
/** How far ahead of the next area it must be: unclear writing goes in no area, as a wrong area is worse than none. */
const CLEAR = 0.05
/** How far a possible area must beat the closest starter area to take an entry from it. */
const AHEAD = 0.06
/** Long writing in pieces can be in two areas, never more. */
const MAX_AREAS = 2

export interface AreaCentres {
  /** What all writing shares (the starter examples' average), taken away before comparing. */
  shared: Float32Array
  centres: ReadonlyMap<AreaId, Float32Array>
}

const unit = (v: Float32Array): Float32Array => {
  const n = Math.hypot(...v) || 1
  return v.map((x) => x / n)
}

const average = (vs: readonly Float32Array[]): Float32Array => {
  const out = new Float32Array(vs[0]!.length)
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i]! += v[i]! / vs.length
  return out
}

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!
  return s
}

const apart = (v: Float32Array, shared: Float32Array) => unit(v.map((x, i) => x - shared[i]!))

/** The areas' centres from the model's numbers for each area's examples (in LIFE_AREAS order). */
export function areaCentres(examples: ReadonlyMap<AreaId, readonly Float32Array[]>): AreaCentres {
  const shared = average(LIFE_AREAS.filter((a) => a.starter).flatMap((a) => examples.get(a.id) ?? []))
  const centres = new Map<AreaId, Float32Array>()
  for (const area of LIFE_AREAS) {
    const own = examples.get(area.id)
    if (own?.length) centres.set(area.id, unit(average(own.map((v) => apart(v, shared)))))
  }
  return { shared, centres }
}

/** The clearly closest area among some, or none. */
function clearest(scores: readonly [AreaId, number][]): { id: AreaId | null; score: number } {
  const [first, second] = [...scores].sort((a, b) => b[1] - a[1])
  if (!first) return { id: null, score: -Infinity }
  const clear = first[1] >= PLACE && first[1] - (second?.[1] ?? -Infinity) >= CLEAR
  return { id: clear ? first[0] : null, score: first[1] }
}

/** One piece of writing: its area, and the starter area it would have if its possible area doesn't show. */
function placePiece(vector: Float32Array, { shared, centres }: AreaCentres): { area: AreaId | null; starter: AreaId | null } {
  const v = apart(vector, shared)
  const starters: [AreaId, number][] = []
  const possibles: [AreaId, number][] = []
  for (const area of LIFE_AREAS) {
    const centre = centres.get(area.id)
    if (centre) (area.starter ? starters : possibles).push([area.id, dot(v, centre)])
  }
  const starter = clearest(starters)
  const possible = clearest(possibles)
  const area = possible.id && possible.score >= starter.score + AHEAD ? possible.id : starter.id
  return { area, starter: starter.id }
}

/** The areas most of an entry's pieces are in, most first, at most MAX_AREAS. */
const mostOf = (ids: readonly (AreaId | null)[]): AreaId[] => {
  const counts = new Map<AreaId, number>()
  for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_AREAS)
    .map(([id]) => id)
}

/**
 * Each entry's areas from the numbers of its pieces (only finished entries long enough to place). A possible area
 * with fewer than MIN_COUNT entries doesn't show: its entries keep their starter area, if they have one clearly.
 */
export function placeEntries(pieces: ReadonlyMap<string, readonly Float32Array[]>, centres: AreaCentres): Map<string, AreaId[]> {
  const placed = new Map<string, { areas: AreaId[]; starters: AreaId[] }>()
  for (const [entryId, vectors] of pieces) {
    const each = vectors.map((v) => placePiece(v, centres))
    placed.set(entryId, { areas: mostOf(each.map((p) => p.area)), starters: mostOf(each.map((p) => p.starter)) })
  }
  const counts = new Map<AreaId, number>()
  for (const { areas } of placed.values()) for (const id of areas) counts.set(id, (counts.get(id) ?? 0) + 1)
  const shows = (id: AreaId) => BY_ID.get(id)!.starter || (counts.get(id) ?? 0) >= MIN_COUNT
  const result = new Map<string, AreaId[]>()
  for (const [entryId, { areas, starters }] of placed) {
    const shown = areas.filter(shows)
    const final = shown.length ? shown : starters
    if (final.length) result.set(entryId, final)
  }
  return result
}
