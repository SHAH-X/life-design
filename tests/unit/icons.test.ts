import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Restyle K6: one icon set (src/ui/Icon.tsx) replaces the font glyphs (×, ›, ‹, ↻, ⌄, ✕, ⌕). A glyph is drawn at the font's
// weight, read aloud by VoiceOver as part of a name, and never lines up with the text beside it.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.tsx') ? [path] : []
  })
}

const GLYPHS = /[‹›✕↻⌄⌕]/

describe('icons', () => {
  it('no screen draws an arrow, cross or refresh as a text glyph', () => {
    const found = files('src')
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .map((line, i) => ({ path, line: i + 1, text: line }))
          .filter(({ text }) => GLYPHS.test(text) && !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(text))
          .map(({ path, line }) => `${path}:${line}`),
      )
    expect(found).toEqual([])
  })

  it('a chevron or tick drawn by CSS is a mask, never a character', () => {
    const css = readFileSync('src/styles.css', 'utf8')
    expect([...css.matchAll(/content:\s*'([^']+)'/g)].map((m) => m[1])).toEqual([])
  })
})
