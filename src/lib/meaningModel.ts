import spec from './meaning-model.json'
import type { EncoderSpec } from './encoder'

/** Search by meaning's model: which one, and how it reads text. */
export const MEANING_MODEL: EncoderSpec & { id: string; dir: string } = {
  id: spec.id,
  dir: spec.dir,
  pooling: spec.pooling as EncoderSpec['pooling'],
  maxTokens: spec.maxTokens,
  queryPrefix: spec.queryPrefix,
}

/** The phone's copy of the files (Cache API). A new model or runtime gets a new name; the old copy is removed. */
export const MEANING_CACHE = `meaning-${spec.dir}-ort-${__ORT_VERSION__}`
export const isOldMeaningCache = (name: string) => name.startsWith('meaning-') && name !== MEANING_CACHE

/** The only files the worker may fetch: the model, its tokenizer and the runtime, all from this site. */
export function meaningFiles(base: string) {
  const model = `${base}models/${spec.dir}/`
  return {
    model: `${model}model.onnx.gz`,
    tokenizer: `${model}tokenizer.json.gz`,
    tokenizerConfig: `${model}tokenizer_config.json.gz`,
    runtime: `${base}models/ort-${__ORT_VERSION__}/ort.wasm.gz`,
  }
}

/** The files' contents: unzipped here, unless the server or browser already did it (a gzip file starts 1f 8b). */
export async function unzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
