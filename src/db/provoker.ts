import { type Ask, NO_PROVOKER_STATE, type ProvokerState, settled, shown } from '../prompts/provoke'
import { db as defaultDb, type LifeDesignDB } from './db'
import { getSetting, setSetting, setStepStatus } from './repo'
import type { ReplyTo } from './types'

// What you've told the provoker, in settings: so it's in a backup, and a restore never asks again what you closed.

const KEY = 'provoker'

export async function loadProvokerState(database: LifeDesignDB = defaultDb): Promise<ProvokerState> {
  const saved = await getSetting<Partial<ProvokerState> | null>(KEY, null, database)
  return { ...NO_PROVOKER_STATE, ...saved }
}

const change = async (database: LifeDesignDB, how: (state: ProvokerState) => ProvokerState) =>
  setSetting(KEY, how(await loadProvokerState(database)), database)

/** Shown on Today: held for the day, and not asked again for a while. */
export const markShown = (today: string, ask: Ask, database: LifeDesignDB = defaultDb) => change(database, (s) => shown(s, today, ask))

/** "Not now": nothing more today; it may come back after a while. */
export const notNow = (today: string, ask: Ask, database: LifeDesignDB = defaultDb) => change(database, (s) => settled(s, today, ask, false))

/** "Done already": never asked again; a next step is finished as Insights does it (a one-off done, an ongoing one
 *  stopped). */
export async function doneAlready(today: string, ask: Ask, database: LifeDesignDB = defaultDb): Promise<void> {
  if (ask.kind === 'step') {
    const step = await database.steps.get(ask.id.slice('step:'.length))
    if (step) await setStepStatus(step.id, step.kind === 'once' ? 'done' : 'stopped', database)
  }
  await change(database, (s) => settled(s, today, ask, true))
}

/** Writing that answers the question was finished: like "Done already" for a loop or step, a rest for a quiet area. */
export const answered = (today: string, reply: ReplyTo, database: LifeDesignDB = defaultDb) =>
  change(database, (s) => settled(s, today, { ...reply, kind: kindOf(reply), closable: !reply.id.startsWith('quiet:') }, true))

const kindOf = (reply: ReplyTo): Ask['kind'] => (reply.id.startsWith('step:') ? 'step' : reply.id.startsWith('quiet:') ? 'quiet' : 'loop')
