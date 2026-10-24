import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Tokenizer } from '@huggingface/tokenizers'
import * as ort from 'onnxruntime-web/wasm'
import { beforeAll, describe, expect, it } from 'vitest'
import { closeness, meaningChunks, meaningText } from '../../src/domain/meaning'
import { createEncoder, type Encode } from '../../src/lib/encoder'
import { MEANING_MODEL } from '../../src/lib/meaningModel'
import { MEANING_ENTRIES, MEANING_QUESTIONS } from '../fixtures/meaning'

// The real model, run by the same runtime and encoder as on the phone (Node instead of the worker), on fictional
// entries. Needs the model files: npm run model (CI runs it first). A missing file fails, never skips.

const file = (path: string) => {
  const full = `public/models/${path}.gz`
  if (!existsSync(full)) throw new Error(`${full} is missing: run npm run model first.`)
  return new Uint8Array(gunzipSync(readFileSync(full)))
}

let encode: Encode
const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i]!, 0)

beforeAll(async () => {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmBinary = file(`ort-${__ORT_VERSION__}/ort.wasm`)
  const session = await ort.InferenceSession.create(file(`${MEANING_MODEL.dir}/model.onnx`))
  const text = new TextDecoder()
  const json = (name: string) => JSON.parse(text.decode(file(`${MEANING_MODEL.dir}/${name}`)))
  encode = createEncoder(ort.Tensor, session, new Tokenizer(json('tokenizer.json'), json('tokenizer_config.json')), MEANING_MODEL)
}, 60_000)

describe('the model on the phone', () => {
  it('gives the same numbers as iPhone Safari did in Phase A (simulator, 2026-10-24)', async () => {
    const [a, b, c] = await Promise.all(['The weather is lovely today.', "It's so sunny outside!", 'He drove to the stadium.'].map((t) => encode(t, 'passage')))
    expect(a).toHaveLength(384)
    expect(Math.hypot(...a!)).toBeCloseTo(1, 5)
    expect(dot(a!, b!)).toBeCloseTo(0.8433, 2)
    expect(dot(a!, c!)).toBeCloseTo(0.5409, 2)
    expect(dot(b!, c!)).toBeCloseTo(0.5657, 2)
  })

  it('reads a question with its search prompt, and cuts a very long text instead of failing', async () => {
    const asPassage = await encode('feeling lonely', 'passage')
    const asQuery = await encode('feeling lonely', 'query')
    expect(dot(asPassage, asQuery)).toBeLessThan(0.99)
    const long = await encode('word '.repeat(3000), 'passage')
    expect(long).toHaveLength(384)
  })

  it('finds by meaning: for each question the closest entry is one a person would expect, never the decoy', async () => {
    const rows = []
    for (const entry of MEANING_ENTRIES)
      for (const piece of meaningChunks(meaningText(entry))) rows.push({ entryId: entry.id, vector: await encode(piece, 'passage') })
    const firsts = []
    for (const q of MEANING_QUESTIONS) {
      const scores = closeness(await encode(q.question, 'query'), rows)
      const first = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      firsts.push({ question: q.question, first, expected: q.expected.includes(first) })
      expect(first).not.toBe(q.decoy)
    }
    expect(firsts.filter((f) => !f.expected)).toEqual([])
  }, 60_000)
})
