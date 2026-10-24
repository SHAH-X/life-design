import type { PaddleOptions } from 'paddleocr'
import spec from './ocr-model.json'

/** Reading text in photos' model (PaddleOCR's PP-OCRv6 tiny): which one. */
export const OCR_MODEL = { id: spec.id, dir: spec.dir, preset: spec.preset as 'PP-OCRv6_tiny' }

/** The phone's copy of the files (Cache API). A new model or runtime gets a new name; the old copy is removed. */
export const OCR_CACHE = `ocr-${spec.dir}-ort-${__ORT_VERSION__}`
export const isOldOcrCache = (name: string) => name.startsWith('ocr-') && name !== OCR_CACHE

/** The only files the worker may fetch: the two models, their characters and the runtime, all from this site. */
export function ocrFiles(base: string) {
  const model = `${base}models/${spec.dir}/`
  return {
    detection: `${model}det.onnx.gz`,
    recognition: `${model}rec.onnx.gz`,
    characters: `${model}dict.json.gz`,
    runtime: `${base}models/ort-${__ORT_VERSION__}/ort.wasm.gz`,
  }
}

const buffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

/** How the model is set up, the same in the worker and in tests: its preset, both models, and its characters (the
 *  space last: dict.json, made by npm run model). */
export function ocrOptions(ort: unknown, files: { detection: Uint8Array; recognition: Uint8Array; characters: Uint8Array }): PaddleOptions {
  return {
    ort: ort as PaddleOptions['ort'],
    modelPreset: OCR_MODEL.preset,
    detection: { modelBuffer: buffer(files.detection) },
    recognition: { modelBuffer: buffer(files.recognition), charactersDictionary: JSON.parse(new TextDecoder().decode(files.characters)) as string[] },
  }
}
