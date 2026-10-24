import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ocrFiles } from '../../src/lib/ocrModel'

// Reading photos' worker doesn't take the page's Content-Security-Policy (a worker loaded from its own file never does,
// and Pages sends no headers), so connect-src can't stop it reaching other sites. It mustn't need to: it fetches only
// the model's own files from this site. This reads its code to make sure, as meaningWorker.test.ts does.

/** A file's code without its comments (they may well say "fetch"). */
const source = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/ \/\/ .*$/gm, '')
const worker = source('src/lib/ocr.worker.ts')
const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|\bimport\(/g

describe("reading photos' worker", () => {
  it('fetches in one place only, and only the files ocrFiles names', () => {
    expect(worker.match(NETWORK)).toEqual(['fetch'])
    const calls = [...worker.matchAll(/\bfile\(([^)]*)\)/g)].map((m) => m[1])
    expect(calls.length).toBeGreaterThan(0)
    for (const argument of calls) expect(argument).toMatch(/^(url: string|urls\.\w+)$/)
    expect(worker).toContain('const urls = ocrFiles(import.meta.env.BASE_URL)')
  })

  it("names only files under this site's models folder", () => {
    for (const url of Object.values(ocrFiles('/life-design/'))) expect(url).toMatch(/^\/life-design\/models\/[\w.@+-]+\/[\w.]+\.gz$/)
  })

  it('the rest of reading photos reaches no network at all, the library it runs included', () => {
    for (const path of ['src/lib/ocrModel.ts', 'src/lib/reader.ts', 'node_modules/paddleocr/dist/index.mjs']) expect(source(path).match(NETWORK), path).toBeNull()
  })
})
