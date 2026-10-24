// Reading text in photos: PaddleOCR's model runs here, off the main thread, on the phone. Nothing leaves it: the worker
// fetches only its own files from this site (ocrFiles), keeps them in the phone's cache so it works offline, and sees
// only the photo it's given. Like search by meaning's worker, it doesn't take the page's <meta> Content-Security-Policy,
// which is why WebAssembly may run here (tests/unit/ocrWorker.test.ts checks it fetches nothing else).
import * as ort from 'onnxruntime-web/wasm'
import { PaddleOcrService } from 'paddleocr'
import { unzip } from './meaningModel'
import { isOldOcrCache, OCR_CACHE, ocrFiles, ocrOptions } from './ocrModel'

export type OcrProblem = 'download' | 'space' | 'start' | 'photo'
export type OcrRequest = { id: number; jpeg: Uint8Array }
export type OcrReply = { id: number; text: string } | { id: number; problem: OcrProblem }

class Problem extends Error {
  constructor(readonly problem: OcrProblem) {
    super(problem)
  }
}

ort.env.wasm.numThreads = 1 // Pages can't send the headers threads need
ort.env.wasm.proxy = false // already off the main thread

let service: Promise<PaddleOcrService> | null = null

/** One of the worker's files: from the phone's copy, or else from this site (then kept). */
async function file(url: string): Promise<Uint8Array> {
  const cache = 'caches' in self ? await caches.open(OCR_CACHE) : null
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

async function load(): Promise<PaddleOcrService> {
  const urls = ocrFiles(import.meta.env.BASE_URL)
  const [detection, recognition, characters, runtime] = await Promise.all([file(urls.detection), file(urls.recognition), file(urls.characters), file(urls.runtime)])
  if ('caches' in self) for (const name of await caches.keys()) if (isOldOcrCache(name)) await caches.delete(name)
  try {
    ort.env.wasm.wasmBinary = runtime
    return await PaddleOcrService.createInstance(ocrOptions(ort, { detection, recognition, characters }))
  } catch {
    throw new Problem('start')
  }
}

/** A photo's pixels, decoded here (the page never holds them). */
async function pixels(jpeg: Uint8Array): Promise<{ width: number; height: number; data: Uint8Array }> {
  try {
    const bitmap = await createImageBitmap(new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')!
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    return { width: canvas.width, height: canvas.height, data: new Uint8Array(data.buffer) }
  } catch {
    throw new Problem('photo')
  }
}

self.onmessage = async (event: MessageEvent<OcrRequest>) => {
  const { id, jpeg } = event.data
  const reply = (message: OcrReply) => (self as unknown as Worker).postMessage(message)
  try {
    service ??= load()
    const ocr = await service
    const result = ocr.processRecognition(await ocr.recognize(await pixels(jpeg)))
    reply({ id, text: result.text.trim() })
  } catch (error) {
    const problem = error instanceof Problem ? error.problem : 'start'
    // A download or space problem may pass: try again next time. A photo that won't decode leaves the model loaded.
    if (problem === 'download' || problem === 'space') service = null
    reply({ id, problem })
  }
}
