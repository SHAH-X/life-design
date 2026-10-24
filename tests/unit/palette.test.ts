import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Light only (owner, 2026-10-24: "I do not want [dark mode], remove the appearance option as well"). Every colour is
// written once, in :root. This keeps a dark look from creeping back in by one colour or one media query.

const css = readFileSync('src/styles.css', 'utf8')
const html = readFileSync('index.html', 'utf8')

/** The text between the braces of the first `:root {`. */
function rootBlock(): string {
  const from = css.indexOf(':root {')
  if (from < 0) throw new Error('missing :root')
  return css.slice(from + ':root {'.length, css.indexOf('\n}', from))
}

describe('the colour palette', () => {
  it('is light only: no dark colours, no dark media query, no Appearance switch', () => {
    expect(css).not.toMatch(/light-dark\(|prefers-color-scheme|data-appearance/)
    expect(rootBlock()).toContain('color-scheme: light;')
    expect(html).not.toMatch(/prefers-color-scheme|appearance\.js/)
    expect(html.match(/name="theme-color"/g)).toHaveLength(1)
  })

  it('uses only names that are defined: a missing one quietly draws nothing (v0.16 used --line, which never was)', () => {
    // Defined in the stylesheet, or set by the code while the keyboard is up.
    const keyboard = readFileSync('src/ui/useKeyboardInset.ts', 'utf8')
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g), ...keyboard.matchAll(/setProperty\('(--[\w-]+)'/g)].map((m) => m[1]))
    const used = [...new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))]
    expect(used.filter((name) => !defined.has(name))).toEqual([])
  })

  it('writes every colour once, in :root', () => {
    const colours = [...rootBlock().matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,8}|rgb\([^)]*\))\s*;/gi)].map((m) => m[1])
    expect(colours.length).toBeGreaterThan(20)
    for (const name of colours) expect(css.match(new RegExp(`--${name}:`, 'g')), `--${name}`).toHaveLength(1)
  })
})
