import type { ItemKind } from '../domain/receipts'
import type { Energy, Engagement } from '../domain/scales'
import type { DayPart } from '../lib/dates'

export type EntrySource = 'evening' | 'quick' | 'import'

/** An activity you reflect on (Good Time Journal), or free writing with no activity. */
export type EntryKind = 'activity' | 'free'
/** "What did it do to your energy?": worded choices, not a scale. */
export type EnergyEffect = 'gave' | 'used' | 'little' | 'mixed'
/** "How long?", roughly. */
export type Duration = 'minutes' | 'hour' | 'hours' | 'day'
/** A question that was skipped, so its number means nothing and stays out of Insights. */
export type Measure = 'engagement' | 'energy'

/** An answer to a purpose question, kept with its question so it reads right even if the wording changes. */
export interface Reflection {
  question: string
  text: string
}

/** "Anything you'd like to do with this?" */
export type IntentionKind = 'differently' | 'again' | 'time' | 'explore' | 'remember'
/**
 * Kept on the entry: since v0.11 only "Remember this" (What you're learning). Next steps to do or try live in their own
 * table (Step); older ones were moved there by the database upgrade.
 */
export interface Intention {
  kind: IntentionKind
  /** "What exactly?" (optional) */
  text: string
  /** From before v0.11, when next steps were followed up on the entry. */
  status: 'open' | 'done' | 'dropped'
  updatedAt: number
}

/** The AI services you can choose for Review with AI (v0.12), each with your own key. */
export type AiProvider = 'groq' | 'openai' | 'gemini'

/** A period reviewed by AI (v0.12): which period and focus, which service and model, and its answer, kept to read again. */
export interface AiReview {
  id: string
  /** The period reviewed, as date keys (inclusive). */
  start: string
  end: string
  /** "Anything to focus on?" (optional). */
  focus: string
  provider: AiProvider
  model: string
  text: string
  createdAt: number
  updatedAt: number
}

/** Once (e.g. "Ask for an agenda first") or ongoing (e.g. "Walk 10 minutes every evening"). */
export type StepKind = 'once' | 'ongoing'
/** Working on it, done (once), or stopped. */
export type StepStatus = 'active' | 'done' | 'stopped'

/** A next step you decided to do or try (v0.11: a list you can manage, in Insights → Next steps). */
export interface Step {
  id: string
  text: string
  /** When to do it ("after dinner"): optional. A plan tied to a moment is likelier to happen. */
  when: string
  kind: StepKind
  status: StepStatus
  /** The entries it came from: more than one when kept again or merged. Empty when added by hand. */
  entryIds: string[]
  /** The activity it's about (lowercased), so it comes back when you write about that again; '' if none. */
  activity: string
  createdAt: number
  updatedAt: number
  /** When it was finished (done or stopped); null while you're working on it. */
  finishedAt: number | null
}

/** One journal entry: an activity (Good Time Journal) or free writing. */
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
  /** "What was it like?": the engagement words chosen (engagement and flow are worked out from them). */
  during: string[]
  /** "How did you feel?": the feeling words chosen (before v0.8, "How did it leave you?"). */
  after: string[]
  /** "Anything else you'd like to record?", or the whole text of free writing. */
  note: string
  source: EntrySource
  kind: EntryKind
  /** What this entry reflects for: your primary purpose unless changed for it. */
  purpose: Purpose | null
  /** The answer to the energy question; energy above is worked out from it (or from the feelings if skipped). */
  energyEffect: EnergyEffect | null
  duration: Duration | null
  reflections: Reflection[]
  intention: Intention | null
  /** Your own take on it, which replaces the app's possible insight. */
  take: string
  /** "Not quite": the app's possible insight was dismissed for this entry. */
  insightHidden: boolean
  /** A draft stays out of Insights and the weekly review until it's saved. */
  status: 'draft' | 'done'
  skipped: Measure[]
  /** The question from Today's box this writing answers (v0.16), or null. */
  replyTo: ReplyTo | null
  /** Its photos (v0.16), in order: the images are in `photos`; the text read from each is kept here. */
  photos: PhotoRef[]
  createdAt: number
  updatedAt: number
}

/** A question asked of the journal (Ask, v0.18), its answer and everything that was sent for it: yours, so in a backup. */
export interface Question {
  id: string
  question: string
  /** The answer, its [r:…] and [e:…] marks taken out. */
  answer: string
  /** What it named: receipts (by photo id) and entries. */
  cited: { receipts: string[]; entries: string[] }
  /** Every part sent, in order ("What was sent"). */
  sent: { label: string; text: string }[]
  provider: AiProvider
  model: string
  createdAt: number
  updatedAt: number
}

/** A photo of an entry, and the text read from it on the phone: null until read (or while reading is off). */
export interface PhotoRef {
  id: string
  text: string | null
  /** What your AI read in it (v0.18), when it was sent: a receipt's items and total, or what it shows. */
  ai?: AiReading
}

/** A photo as your AI read it (src/domain/aiReading.ts). Prices in minor units; the phone checks they add up. */
export interface AiReading {
  /** The service and model, "Gemini · gemini-2.5-flash". */
  by: string
  at: number
  text: string
  description: string
  receipt: {
    shop: string
    date: string | null
    currency: string
    /** `kind` from ITEM_KINDS, from v0.19; readings before then have none. */
    items: { name: string; price: number; quantity: number; kind?: ItemKind }[]
    total: number | null
  } | null
}

/** A photo (v0.16): shrunk on the phone to a JPEG of about 300 KB, kept as base64 so it backs up like the rest. */
export interface Photo {
  id: string
  entryId: string
  type: 'image/jpeg'
  width: number
  height: number
  /** The JPEG, base64. */
  data: string
  createdAt: number
  updatedAt: number
}

/** A question the app asked from your own writing (src/prompts/provoke.ts), kept with the writing that answers it. */
export interface ReplyTo {
  /** What it asked about: `loop:<loop id>`, `step:<step id>` or `quiet:<area id>`. */
  id: string
  question: string
}

/** The new fields, as entries from before v0.8 (and files that leave them out) get them. */
export function entryDefaults(): Pick<
  Entry,
  'kind' | 'purpose' | 'energyEffect' | 'duration' | 'reflections' | 'intention' | 'take' | 'insightHidden' | 'status' | 'skipped' | 'replyTo' | 'photos'
> {
  return {
    kind: 'activity',
    purpose: null,
    energyEffect: null,
    duration: null,
    reflections: [],
    intention: null,
    take: '',
    insightHidden: false,
    status: 'done',
    skipped: [],
    replyTo: null,
    photos: [],
  }
}

export interface Day {
  date: string
  /** Ikigai in the everyday sense: one small thing that gave the day meaning or joy. */
  smallJoy: string
  createdAt: number
  updatedAt: number
}

/**
 * Why you journal (see domain/purposes.ts for the words): understand myself (know), improve myself (grow), learn
 * something, achieve a goal, make sense of a hard time (calm), reflect on everyday life (joy), write freely.
 */
export type Purpose = 'know' | 'calm' | 'grow' | 'goal' | 'learn' | 'joy' | 'free'

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

/** What a plan would need that's missing (Designing Your Life's "resources"). */
export type Need = 'time' | 'money' | 'skills' | 'people'

export interface OdysseyPlan {
  id: string
  slot: 1 | 2 | 3
  /** The six-word title. */
  title: string
  description: string
  /** Five lists of milestones, one per year. */
  years: string[][]
  /** What living it would help you find out. */
  questions: string[]
  /** "How do you feel about this future?": likeability and confidence, in words. */
  feelings: string[]
  /** "What would it take?": what's missing, and what exactly. */
  needs: Need[]
  needsNote: string
  /** "Does it fit your Workview and Lifeview?" (coherence), in your own words. */
  fit: string
  notes: string
  /** When the guided flow was finished; until then, opening the plan resumes the flow. */
  writtenAt: number | null
  /** 0–10 gauges from the v1 app: kept, never shown (nothing in this app is rated). */
  gauges?: OdysseyGauges
  createdAt: number
  updatedAt: number
}

/** A plan as it was before a later change (kept automatically; see keepsVersion). */
export interface PlanVersion {
  id: string
  planId: string
  slot: 1 | 2 | 3
  /** When this version was last changed. */
  savedAt: number
  plan: OdysseyPlan
  createdAt: number
  updatedAt: number
}

/** Workview and Lifeview, and how they fit together. Each record is one version; the newest is current. */
export interface Views {
  id: string
  workview: string
  lifeview: string
  coherence: string
  createdAt: number
  updatedAt: number
}

/** What you'd like to carry into the next week, kept with the week it was written for (the week's Monday). */
export interface Week {
  id: string
  carry: string
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
  /** One thing to carry forward; collected in Insights → What you're learning. */
  takeaway: string
  /** Null while the review is still a draft. */
  completedAt: number | null
  createdAt: number
  updatedAt: number
}

/** A finished entry's meaning as numbers, worked out on the phone for search by meaning (database version 9). One
 *  row per piece of a long entry. Derived from the entry: never in a backup, and worked out again when missing or
 *  when the entry's words or the model change (src/db/vectors.ts). */
export interface MeaningVector {
  /** `<entry id>#<piece>` */
  id: string
  entryId: string
  model: string
  /** Fingerprint of the model and the text these numbers came from. */
  hash: string
  vector: Float32Array
}

/** An open loop's meaning (v0.16), from a sentence of an entry (src/domain/loops.ts): derived, so never in a backup. */
export interface LoopVector {
  /** The loop's id: `<entry id>#<sentence>`. */
  id: string
  entryId: string
  /** Fingerprint of the model, the sentence and the one before it. */
  hash: string
  sentence: Float32Array
  /** The sentence with the one before it. */
  context: Float32Array
}

/** A life area's centre (v0.16), worked out from its examples (src/domain/areas.ts); `shared` is what all writing
 *  shares. Derived from the app's own words, never from an entry, so never in a backup. */
export interface AreaCentre {
  /** An area's id, or `shared`. */
  id: string
  /** Fingerprint of the model and every area's examples. */
  hash: string
  vector: Float32Array
}

export interface BackupData {
  entries: Entry[]
  days: Day[]
  answers: Answer[]
  ikigaiItems: IkigaiItem[]
  odysseyPlans: OdysseyPlan[]
  planVersions: PlanVersion[]
  views: Views[]
  weeks: Week[]
  steps: Step[]
  aiReviews: AiReview[]
  reviews: Review[]
  settings: Setting[]
  photos: Photo[]
  questions: Question[]
}

export type TableName = keyof BackupData

export const TABLE_NAMES: readonly TableName[] = [
  'entries',
  'days',
  'answers',
  'ikigaiItems',
  'odysseyPlans',
  'planVersions',
  'views',
  'weeks',
  'steps',
  'aiReviews',
  'reviews',
  'settings',
  'photos',
  'questions',
]

export const TABLE_LABELS: Record<TableName, string> = {
  entries: 'Journal entries',
  days: 'Small joys',
  answers: 'Evening answers',
  ikigaiItems: 'Ikigai items',
  odysseyPlans: 'Odyssey Plans',
  planVersions: 'Earlier versions of plans',
  views: 'Workview & Lifeview',
  weeks: 'Weekly notes',
  steps: 'Next steps',
  aiReviews: 'AI reviews',
  reviews: 'Reviews',
  settings: 'Settings',
  photos: 'Photos',
  questions: 'Questions asked',
}
