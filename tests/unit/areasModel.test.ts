import 'fake-indexeddb/auto'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Tokenizer } from '@huggingface/tokenizers'
import * as ort from 'onnxruntime-web/wasm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureAreas, lifeAreas } from '../../src/db/areas'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { type AreaId, LIFE_AREAS } from '../../src/domain/areas'
import type { Embed } from '../../src/lib/embedder'
import { createEncoder } from '../../src/lib/encoder'
import { MEANING_MODEL } from '../../src/lib/meaningModel'
import { AREA_CASES, AREA_HOLDOUT, type AreaCase, areaEntry, LONG_TWO_AREAS } from '../fixtures/areas'

// Life areas with the real model, run by the same runtime and encoder as on the phone, through the app's own code
// (ensureAreas, lifeAreas) on a fictional journal. Needs the model files: npm run model (CI runs it first). A missing
// file fails, never skips. The bars sit just under what the rules reached when tuned (v0.16, 2026-10-24: 98 of 120
// right, 7 elsewhere; unseen 28 of 34, none elsewhere; 15 of 16 outside topics found): if a change to the examples or
// the rules lowers them, this says which entries moved.

const file = (path: string) => {
  const full = `public/models/${path}.gz`
  if (!existsSync(full)) throw new Error(`${full} is missing: run npm run model first.`)
  return new Uint8Array(gunzipSync(readFileSync(full)))
}

let phone: LifeDesignDB
let placed: Map<string, AreaId[]>
const STARTERS = new Set(LIFE_AREAS.filter((a) => a.starter).map((a) => a.id as string))

beforeAll(async () => {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmBinary = file(`ort-${__ORT_VERSION__}/ort.wasm`)
  const session = await ort.InferenceSession.create(file(`${MEANING_MODEL.dir}/model.onnx`))
  const text = new TextDecoder()
  const json = (name: string) => JSON.parse(text.decode(file(`${MEANING_MODEL.dir}/${name}`)))
  const encode = createEncoder(ort.Tensor, session, new Tokenizer(json('tokenizer.json'), json('tokenizer_config.json')), MEANING_MODEL)
  const embed: Embed = async (texts, kind) => {
    const out = []
    for (const t of texts) out.push(await encode(t, kind))
    return out
  }
  phone = openDb(`areas-model-${crypto.randomUUID()}`)
  await phone.entries.bulkPut([...AREA_CASES, ...AREA_HOLDOUT, LONG_TWO_AREAS].map((c) => areaEntry(c)))
  await ensureAreas(embed, phone)
  placed = (await lifeAreas(phone)) ?? new Map()
}, 300_000)

afterAll(async () => {
  await phone.delete()
})

/** How a set of cases came out: in an expected starter area, in none, elsewhere; and the misses, for the message. */
function tally(cases: readonly AreaCase[]) {
  const result = { right: 0, none: 0, elsewhere: 0, misses: [] as string[] }
  for (const c of cases.filter((c) => c.expect.some((x) => STARTERS.has(x)))) {
    const first = placed.get(c.id)?.[0]
    if (!first) result.none++
    else if (c.expect.includes(first)) result.right++
    else {
      result.elsewhere++
      result.misses.push(`${c.id} in ${first}`)
    }
  }
  return result
}

const found = (c: AreaCase) => (c.expect[0] === 'found:pottery' ? 'crafts' : c.expect[0]!.slice('found:'.length))

describe('life areas with the model on the phone', () => {
  it('puts most writing in the area a person would expect, and little in a wrong one', () => {
    const all = tally([...AREA_CASES, ...AREA_HOLDOUT])
    expect(all.right, all.misses.join(', ')).toBeGreaterThanOrEqual(96)
    expect(all.elsewhere, all.misses.join(', ')).toBeLessThanOrEqual(8)
  })

  it('does as well on writing it was never tuned on', () => {
    const unseen = tally(AREA_HOLDOUT)
    expect(unseen.right, unseen.misses.join(', ')).toBeGreaterThanOrEqual(27)
    expect(unseen.elsewhere, unseen.misses.join(', ')).toBeLessThanOrEqual(1)
  })

  it('finds an area of its own for topics outside the starter areas, once 3+ entries are about one', () => {
    const outside = [...AREA_CASES, ...AREA_HOLDOUT].filter((c) => c.expect[0]!.startsWith('found:'))
    const misses = outside.filter((c) => placed.get(c.id)?.[0] !== found(c)).map((c) => `${c.id} in ${placed.get(c.id)?.[0] ?? 'none'}`)
    expect(outside.length - misses.length, misses.join(', ')).toBeGreaterThanOrEqual(14)
  })

  it('places no one-liner', () => {
    const slight = AREA_CASES.filter((c) => c.expect[0] === 'none')
    expect(slight.filter((c) => placed.has(c.id)).map((c) => c.id)).toEqual([])
  })

  it('puts long writing about two things in both areas', () => {
    expect([...(placed.get(LONG_TWO_AREAS.id) ?? [])].sort()).toEqual([...LONG_TWO_AREAS.expect].sort())
  })
})
