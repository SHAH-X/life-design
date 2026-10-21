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

export interface BackupData {
  entries: Entry[]
  days: Day[]
  ikigaiItems: IkigaiItem[]
  odysseyPlans: OdysseyPlan[]
  settings: Setting[]
}

export type TableName = keyof BackupData

export const TABLE_NAMES: readonly TableName[] = ['entries', 'days', 'ikigaiItems', 'odysseyPlans', 'settings']

export const TABLE_LABELS: Record<TableName, string> = {
  entries: 'Journal entries',
  days: 'Small joys',
  ikigaiItems: 'Ikigai items',
  odysseyPlans: 'Odyssey Plans',
  settings: 'Settings',
}
