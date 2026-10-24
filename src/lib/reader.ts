import type { OcrProblem, OcrReply } from './ocr.worker'
import { isOldOcrCache, OCR_CACHE, ocrFiles } from './ocrModel'

/** What went wrong, in the app's own words: what happened and what to do. */
export const OCR_PROBLEMS: Record<OcrProblem, string> = {
  download: "Reading photos couldn't download its files. Check the connection; it tries again next time.",
  space: "There isn't room on this phone to read photos (about 6 MB). Free some space; it tries again next time.",
  start: "Reading photos couldn't start on this phone. Reload the app to try again.",
  photo: "This photo couldn't be opened to read it. It's kept as it is.",
}

export class OcrError extends Error {
  constructor(readonly problem: OcrProblem) {
    super(OCR_PROBLEMS[problem])
  }
}

/** A photo (JPEG) to the text in it. */
export type ReadPhoto = (jpeg: Uint8Array) => Promise<string>

/** The worker holds a few hundred MB while it runs, so it stops soon after its last photo. */
const IDLE_MS = 30_000

let worker: Worker | null = null
let idle: ReturnType<typeof setTimeout> | undefined
let nextId = 0
const waiting = new Map<number, { resolve: (text: string) => void; reject: (e: OcrError) => void }>()

function stop(problem: OcrProblem | null) {
  worker?.terminate()
  worker = null
  for (const [id, w] of waiting) {
    waiting.delete(id)
    w.reject(new OcrError(problem ?? 'start'))
  }
}

function start(): Worker {
  const w = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module', name: 'ocr' })
  w.onmessage = (event: MessageEvent<OcrReply>) => {
    const reply = event.data
    const pending = waiting.get(reply.id)
    if (!pending) return
    waiting.delete(reply.id)
    if ('text' in reply) pending.resolve(reply.text)
    else pending.reject(new OcrError(reply.problem))
    if (waiting.size === 0) idle = setTimeout(() => stop(null), IDLE_MS)
  }
  w.onerror = () => stop('start')
  return w
}

/** The model on this phone, in its worker: started when first needed. */
export const readPhoto: ReadPhoto = (jpeg) => {
  clearTimeout(idle)
  worker ??= start()
  const id = nextId++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    worker!.postMessage({ id, jpeg })
  })
}

/** Whether the model's files are on this phone already (so turning it on won't download anything). */
export async function ocrFilesDownloaded(): Promise<boolean> {
  if (!('caches' in window) || !(await caches.has(OCR_CACHE))) return false
  const cache = await caches.open(OCR_CACHE)
  const found = await Promise.all(Object.values(ocrFiles(import.meta.env.BASE_URL)).map((url) => cache.match(url)))
  return found.every(Boolean)
}

/** Removes the model's files from this phone (they download again when reading photos is next turned on). */
export async function removeOcrFiles(): Promise<void> {
  stop(null)
  if (!('caches' in window)) return
  for (const name of await caches.keys()) if (name === OCR_CACHE || isOldOcrCache(name)) await caches.delete(name)
}
