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
}

export interface Review {
  id: string
  /** Inclusive date range the review looks back over. */
  periodStart: string
  periodEnd: string
  balance: Balance
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
  ikigaiItems: IkigaiItem[]
  odysseyPlans: OdysseyPlan[]
  reviews: Review[]
  settings: Setting[]
}

export type TableName = keyof BackupData

export const TABLE_NAMES: readonly TableName[] = ['entries', 'days', 'ikigaiItems', 'odysseyPlans', 'reviews', 'settings']

export const TABLE_LABELS: Record<TableName, string> = {
  entries: 'Journal entries',
  days: 'Small joys',
  ikigaiItems: 'Ikigai items',
  odysseyPlans: 'Odyssey Plans',
  reviews: 'Reviews',
  settings: 'Settings',
}
