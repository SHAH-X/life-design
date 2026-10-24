import 'fake-indexeddb/auto'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Tokenizer } from '@huggingface/tokenizers'
import * as ort from 'onnxruntime-web/wasm'
import { beforeAll, describe, expect, it } from 'vitest'
import { openDb } from '../../src/db/db'
import { ensureLoopVectors, openLoops } from '../../src/db/loops'
import { ensureVectors } from '../../src/db/vectors'
import type { Embed } from '../../src/lib/embedder'
import { createEncoder } from '../../src/lib/encoder'
import { MEANING_MODEL } from '../../src/lib/meaningModel'
import { type JournalCase, LOOP_JOURNAL, LOOP_JOURNAL_UNSEEN, journalEntry } from '../fixtures/loops'

// Open loops with the real model, through the app's own code (ensureVectors, ensureLoopVectors, openLoops), on two
// fictional journals. Needs the model files: npm run model (CI runs it first). A missing file fails, never skips. The
// bars are what the rules reached when tuned (v0.16, 2026-10-24): of 11 loops written about again, 9 let go; all 14
// left open still asked about. Wrong the other way (asking about one written about) is the safe way: "Done already".

const file = (path: string) => {
  const full = `public/models/${path}.gz`
  if (!existsSync(full)) throw new Error(`${full} is missing: run npm run model first.`)
  return new Uint8Array(gunzipSync(readFileSync(full)))
}

const TODAY = '2026-10-24'
let embed: Embed
const outcome = { writtenAgain: 0, letGo: 0, leftOpen: 0, stillAsked: 0, misses: [] as string[] }

beforeAll(async () => {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmBinary = file(`ort-${__ORT_VERSION__}/ort.wasm`)
  const session = await ort.InferenceSession.create(file(`${MEANING_MODEL.dir}/model.onnx`))
  const text = new TextDecoder()
  const json = (name: string) => JSON.parse(text.decode(file(`${MEANING_MODEL.dir}/${name}`)))
  const encode = createEncoder(ort.Tensor, session, new Tokenizer(json('tokenizer.json'), json('tokenizer_config.json')), MEANING_MODEL)
  embed = async (texts, kind) => {
    const out = []
    for (const t of texts) out.push(await encode(t, kind))
    return out
  }
  for (const journal of [LOOP_JOURNAL, LOOP_JOURNAL_UNSEEN]) await tally(journal)
}, 300_000)

async function tally(journal: readonly JournalCase[]) {
  const phone = openDb(`loops-model-${crypto.randomUUID()}`)
  await phone.entries.bulkPut(journal.map(journalEntry))
  await ensureVectors(embed, phone)
  await ensureLoopVectors(embed, phone)
  const open = await openLoops(TODAY, phone)
  for (const c of journal)
    for (const planted of c.loops ?? []) {
      const asked = open.some((l) => l.entryId === c.id && l.text.includes(planted.quote))
      if (planted.closedBy) {
        outcome.writtenAgain++
        if (!asked) outcome.letGo++
        else outcome.misses.push(`${c.id} still asked though written about in ${planted.closedBy}`)
      } else {
        outcome.leftOpen++
        if (asked) outcome.stillAsked++
        else outcome.misses.push(`${c.id} let go though never written about again`)
      }
    }
  await phone.delete()
}

describe('open loops with the model on the phone', () => {
  it('still asks about every loop never written about again', () => {
    expect(outcome.leftOpen).toBe(14)
    expect(outcome.stillAsked, outcome.misses.join('; ')).toBe(14)
  })

  it('lets go of most loops written about again', () => {
    expect(outcome.writtenAgain).toBe(11)
    expect(outcome.letGo, outcome.misses.join('; ')).toBeGreaterThanOrEqual(9)
  })
})
