import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { meaningFiles } from '../../src/lib/meaningModel'

// Search by meaning's worker doesn't take the page's Content-Security-Policy (a worker loaded from its own file never
// does, and Pages sends no headers), so connect-src can't stop it reaching other sites. It mustn't need to: it fetches
// only the model's own files from this site. This reads its code to make sure, as csp.test.ts reads the config.

/** A file's code without its comments (they may well say "fetch"). */
const source = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/ \/\/ .*$/gm, '')
const worker = source('src/lib/meaning.worker.ts')
const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b|\bimport\(/g

describe("search by meaning's worker", () => {
  it('fetches in one place only, and only the files meaningFiles names', () => {
    expect(worker.match(NETWORK)).toEqual(['fetch'])
    const calls = [...worker.matchAll(/\bfile\(([^)]*)\)/g)].map((m) => m[1])
    expect(calls.length).toBeGreaterThan(0)
    for (const argument of calls) expect(argument).toMatch(/^(url: string|urls\.\w+)$/)
    expect(worker).toContain('const urls = meaningFiles(import.meta.env.BASE_URL)')
  })

  it("names only files under this site's models folder", () => {
    for (const url of Object.values(meaningFiles('/life-design/'))) expect(url).toMatch(/^\/life-design\/models\/[\w.@-]+\/[\w.]+\.gz$/)
  })

  it('the rest of search by meaning reaches no network at all', () => {
    for (const path of ['src/lib/encoder.ts', 'src/lib/meaningModel.ts', 'src/lib/embedder.ts', 'src/db/vectors.ts', 'src/domain/meaning.ts'])
      expect(source(path).match(NETWORK), path).toBeNull()
  })

  it('the model files are never precached: everyone would download about 28 MB with each update', () => {
    const globs = source('vite.config.ts').match(/globPatterns: \[([^\]]*)\]/)?.[1]
    expect(globs).toBeDefined()
    expect(globs).not.toMatch(/gz|onnx|wasm|\*\*\/\*['"]/)
  })
})
