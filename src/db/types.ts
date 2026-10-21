import type { Energy, Engagement } from '../domain/scales'
import type { DayPart } from '../lib/dates'

export type EntrySource = 'evening' | 'quick' | 'import'

/** One Good Time Journal activity. */
export interface Entry {
  id: string
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  part: DayPart
  activity: string
  engagement: Engagement
  energy: Energy
  flow: boolean
  /** AEIOU: Environment. */
  where: string[]
  /** AEIOU: Interactions and Users. */
  people: string[]
  /** AEIOU: Objects. */
  objects: string[]
  /** "What was it like?": the feeling words chosen (energy, engagement and flow are worked out from them). */
  during: string[]
  /** "How did it leave you?": the feeling words chosen. */
  after: string[]
  note: string
  source: EntrySource
  createdAt: number
  updatedAt: number
}

export interface Day {
  date: string
  /** Ikigai in the everyday sense: one small thing that gave the day meaning or joy. */
  smallJoy: string
  createdAt: number
  updatedAt: number
}

/** Why you journal. "know" and "joy" are always on; the others are chosen in More → Evening question. */
export type Purpose = 'know' | 'calm' | 'grow' | 'goal' | 'learn' | 'joy'

export const OPTIONAL_PURPOSES = ['calm', 'grow', 'goal', 'learn'] as const
export type OptionalPurpose = (typeof OPTIONAL_PURPOSES)[number]

/** An answer to the evening question. The question is kept with it, so it reads right even if the wording changes later. */
export interface Answer {
  id: string
  date: string
  /** A prompt from the bank (e.g. "calm-2") or a pattern (e.g. "pattern:drain:commute"). */
  promptId: string
  purpose: Purpose | 'pattern'
  question: string
  text: string
  createdAt: number
  updatedAt: number
}

export interface IkigaiItem {
  id: string
  text: string
  love: boolean
  goodAt: boolean
  worldNeeds: boolean
  paidFor: boolean
  linkedActivities: string[]
  notes: string
  createdAt: number
  updatedAt: number
}

export interface OdysseyGauges {
  resources: number
  likability: number
  confidence: number
  coherence: number
}

export interface OdysseyPlan {
  id: string
  slot: 1 | 2 | 3
  title: string
  description: string
  /** Five lists of milestones, one per year. */
  years: string[][]
  questions: string[]
  gauges: OdysseyGauges
  notes: string
  createdAt: number
  updatedAt: number
}

export interface Setting {
  key: string
  value: unknown
  updatedAt: number
}

/** Designing Your Life's dashboard: Health, Work, Play, Love. */
export type BalanceArea = 'health' | 'work' | 'play' | 'love'

export const BALANCE_AREAS: readonly BalanceArea[] = ['health', 'work', 'play', 'love']

/** 0 (empty) to 10 (full); null until rated. */
export type Balance = Record<BalanceArea, number | null>

/** AEIOU: what made a moment energising or draining. */
export interface AeiouNote {
  entryId: string | null
  activities: string
  environments: string
  interactions: string
  objects: string
  users: string
  /** The one question asked first: what made the moment so good, or so draining. */
  why: string
}

export interface Review {
  id: string
  /** Inclusive date range the review looks back over. */
  periodStart: string
  periodEnd: string
  /** 0–10 ratings from reviews before Phase 2.6; new reviews leave them empty and use alive / neglected. */
  balance: Balance
  /** "Which part of life feels most alive right now?" */
  alive: BalanceArea | null
  /** "Which feels most neglected?" */
  neglected: BalanceArea | null
  balanceWhy: string
  best: AeiouNote
  worst: AeiouNote
  reflection: string
  /** One thing to carry forward; collected in Insights → What I'm learning. */
  takeaway: string
  /** Null while the review is still a draft. */
  completedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface BackupData {
  entries: Entry[]
  days: Day[]
  answers: Answer[]
  ikigaiItems: IkigaiItem[]
  odysseyPlans: OdysseyPlan[]
  reviews: Review[]
  settings: Setting[]
}

export type TableName = keyof BackupData

export const TABLE_NAMES: readonly TableName[] = ['entries', 'days', 'answers', 'ikigaiItems', 'odysseyPlans', 'reviews', 'settings']

export const TABLE_LABELS: Record<TableName, string> = {
  entries: 'Journal entries',
  days: 'Small joys',
  answers: 'Evening answers',
  ikigaiItems: 'Ikigai items',
  odysseyPlans: 'Odyssey Plans',
  reviews: 'Reviews',
  settings: 'Settings',
}
