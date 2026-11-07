import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import * as ort from 'onnxruntime-web/wasm'
import { PaddleOcrService } from 'paddleocr'
import { beforeAll, describe, expect, it } from 'vitest'
import { readReceipt } from '../../src/domain/receipts'
import { joinLines } from '../../src/lib/ocrLines'
import { OCR_MODEL, ocrOptions } from '../../src/lib/ocrModel'
import { PHOTO_TRUTH, readPng } from '../fixtures/photos'

// Reading photos with the real model, set up as the worker sets it up (ocrOptions) and its words joined into lines as
// the worker joins them (joinLines), on fictional receipts and notes.
// Needs the model files: npm run model (CI runs it first). A missing file fails, never skips. The bar is what the model
// reached when chosen (v0.16, 2026-10-24: PP-OCRv6 tiny, 173 of 179 words on eight images, 0.5% of characters wrong).

const file = (path: string) => {
  const full = `public/models/${path}.gz`
  if (!existsSync(full)) throw new Error(`${full} is missing: run npm run model first.`)
  return new Uint8Array(gunzipSync(readFileSync(full)))
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9.%]+/g) ?? []
const read = new Map<string, string>()

beforeAll(async () => {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.wasmBinary = file(`ort-${__ORT_VERSION__}/ort.wasm`)
  const ocr = await PaddleOcrService.createInstance(
    ocrOptions(ort, { detection: file(`${OCR_MODEL.dir}/det.onnx`), recognition: file(`${OCR_MODEL.dir}/rec.onnx`), characters: file(`${OCR_MODEL.dir}/dict.json`) }),
  )
  for (const name of Object.keys(PHOTO_TRUTH)) read.set(name, joinLines(await ocr.recognize(readPng(name))))
  await ocr.destroy()
}, 120_000)

describe('reading photos with the model on the phone', () => {
  it('reads nearly every word of fictional receipts and notes, tilted and handwritten ones too', () => {
    let found = 0
    let total = 0
    const missed: string[] = []
    for (const [name, truth] of Object.entries(PHOTO_TRUTH)) {
      const have = new Set(words(read.get(name) ?? ''))
      for (const w of words(truth)) {
        total++
        if (have.has(w)) found++
        else missed.push(`${name}: ${w}`)
      }
    }
    expect(found / total, missed.join(', ')).toBeGreaterThanOrEqual(0.93)
  })

  it('keeps the spaces between words (the space is the last character the model knows)', () => {
    expect(read.get('note-hand')).toMatch(/call the plumber on thursday/i)
  })

  it('reads each row of a turned receipt as one line, its name then its price (v0.24.2)', () => {
    // Turned a little, a receipt's prices sit higher than their names, about as close to the row above: each row is one
    // line, left to right, never a price on a line of its own or before its name, nor two rows as one.
    const turned = read.get('receipt-turned')!
    for (const row of ['No Allergy Declared 0.00', 'Halloumi Wrap 7.25', 'Chicken Burger 10.40', 'Subtotal 14.71', 'Tax 2.94', 'Eat In Total 17.65']) {
      expect(turned.split('\n'), row).toContain(row)
    }
    expect(read.get('receipt-tilted')!.split('\n')).toEqual(expect.arrayContaining(['Ibuprofen 200mg 3.49', 'Plasters 2.25']))
  })

  it('a turned receipt read on the phone is a receipt, its items adding up to its total', () => {
    const receipt = readReceipt(read.get('receipt-turned')!)
    expect(receipt?.items.map((item) => [item.name, item.price])).toEqual([['Halloumi Wrap', 725], ['Chicken Burger', 1040]])
    expect(receipt).toMatchObject({ total: 1765, adds: true, date: '2026-10-14' })
  })
})
