// Search by meaning: the model runs here, off the main thread, on the phone. Nothing leaves it: the worker fetches
// only its own files from this site (meaningFiles), keeps them in the phone's cache so it works offline, and sees only
// the texts it's given. A worker loaded from its own file doesn't take the page's <meta> Content-Security-Policy
// (Pages sends none as a header): that is why WebAssembly may run here while the page can't run any
// (DECISIONS.md, "Search by meaning"; tests/unit/meaningWorker.test.ts checks it fetches nothing else).
import { Tokenizer } from '@huggingface/tokenizers'
import * as ort from 'onnxruntime-web/wasm'
import { createEncoder, type Encode, type TextKind } from './encoder'
import { isOldMeaningCache, MEANING_CACHE, MEANING_MODEL, meaningFiles, unzip } from './meaningModel'

export type MeaningProblem = 'download' | 'space' | 'start'
export type WorkerRequest = { id: number; texts: string[]; kind: TextKind }
export type WorkerReply = { id: number; vectors: Float32Array[] } | { id: number; problem: MeaningProblem }

class Problem extends Error {
  constructor(readonly problem: MeaningProblem) {
    super(problem)
  }
}

ort.env.wasm.numThreads = 1 // Pages can't send the headers threads need
ort.env.wasm.proxy = false // already off the main thread

let encoder: Promise<Encode> | null = null

/** One of the worker's files: from the phone's copy, or else from this site (then kept). */
async function file(url: string): Promise<Uint8Array> {
  const cache = 'caches' in self ? await caches.open(MEANING_CACHE) : null
  let response = await cache?.match(url)
  if (!response) {
    response = await fetch(url).catch(() => {
      throw new Problem('download')
    })
    if (!response.ok) throw new Problem('download')
    try {
      await cache?.put(url, response.clone())
    } catch (error) {
      throw new Problem((error as Error).name === 'QuotaExceededError' ? 'space' : 'download')
    }
  }
  return unzip(new Uint8Array(await response.arrayBuffer()))
}

async function load(): Promise<Encode> {
  const urls = meaningFiles(import.meta.env.BASE_URL)
  const [model, tokenizerJson, tokenizerConfig, runtime] = await Promise.all([file(urls.model), file(urls.tokenizer), file(urls.tokenizerConfig), file(urls.runtime)])
  if ('caches' in self) for (const name of await caches.keys()) if (isOldMeaningCache(name)) await caches.delete(name)
  try {
    ort.env.wasm.wasmBinary = runtime
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
    const text = new TextDecoder()
    const tokenizer = new Tokenizer(JSON.parse(text.decode(tokenizerJson)), JSON.parse(text.decode(tokenizerConfig)))
    return createEncoder(ort.Tensor, session, tokenizer, MEANING_MODEL)
  } catch {
    throw new Problem('start')
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, texts, kind } = event.data
  const reply = (message: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(message, transfer)
  try {
    encoder ??= load()
    const encode = await encoder
    const vectors: Float32Array[] = []
    for (const text of texts) vectors.push(await encode(text, kind))
    reply({ id, vectors }, vectors.map((v) => v.buffer))
  } catch (error) {
    if (!(error instanceof Problem) || error.problem !== 'start') encoder = null // a later try may work
    reply({ id, problem: error instanceof Problem ? error.problem : 'start' })
  }
}
