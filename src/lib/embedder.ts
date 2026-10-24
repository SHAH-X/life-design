import type { TextKind } from './encoder'
import { isOldMeaningCache, MEANING_CACHE, meaningFiles } from './meaningModel'
import type { MeaningProblem, WorkerReply } from './meaning.worker'

/** What went wrong, in the app's own words: what happened and what to do. */
export const MEANING_PROBLEMS: Record<MeaningProblem, string> = {
  download: "Search by meaning couldn't download its files. Check the connection and try again.",
  space: "There isn't room on this phone for search by meaning (about 30 MB). Free some space, then try again.",
  start: "Search by meaning couldn't start on this phone. Reload the app and try again.",
}

export class MeaningError extends Error {
  constructor(readonly problem: MeaningProblem) {
    super(MEANING_PROBLEMS[problem])
  }
}

/** Texts to their meanings as numbers, in the same order. */
export type Embed = (texts: string[], kind: TextKind) => Promise<Float32Array[]>

/** The worker holds a few hundred MB while it runs, so it stops after a minute with nothing to do. */
const IDLE_MS = 60_000

let worker: Worker | null = null
let idle: ReturnType<typeof setTimeout> | undefined
let nextId = 0
const waiting = new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: MeaningError) => void }>()

function stop(problem: MeaningProblem | null) {
  worker?.terminate()
  worker = null
  for (const [id, w] of waiting) {
    waiting.delete(id)
    w.reject(new MeaningError(problem ?? 'start'))
  }
}

function start(): Worker {
  const w = new Worker(new URL('./meaning.worker.ts', import.meta.url), { type: 'module', name: 'meaning' })
  w.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data
    const pending = waiting.get(reply.id)
    if (!pending) return
    waiting.delete(reply.id)
    if ('vectors' in reply) pending.resolve(reply.vectors)
    else pending.reject(new MeaningError(reply.problem))
    if (waiting.size === 0) idle = setTimeout(() => stop(null), IDLE_MS)
  }
  w.onerror = () => stop('start')
  return w
}

/** The model on this phone, in its worker: started when first needed. */
export const embed: Embed = (texts, kind) => {
  if (texts.length === 0) return Promise.resolve([])
  clearTimeout(idle)
  worker ??= start()
  const id = nextId++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    worker!.postMessage({ id, texts, kind })
  })
}

/** Whether the model's files are on this phone already (so turning it on won't download anything). */
export async function meaningFilesDownloaded(): Promise<boolean> {
  if (!('caches' in window) || !(await caches.has(MEANING_CACHE))) return false
  const cache = await caches.open(MEANING_CACHE)
  const found = await Promise.all(Object.values(meaningFiles(import.meta.env.BASE_URL)).map((url) => cache.match(url)))
  return found.every(Boolean)
}

/** Removes the model's files from this phone (they download again when search by meaning is next used). */
export async function removeMeaningFiles(): Promise<void> {
  stop(null)
  if (!('caches' in window)) return
  for (const name of await caches.keys()) if (name === MEANING_CACHE || isOldMeaningCache(name)) await caches.delete(name)
}
