import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The colours are written once as light-dark(light, dark), plus a plain copy for iPhones before iOS 17.5. The copy
// must never drift from the original: a colour changed in one place only would differ by iOS version.

const css = readFileSync('src/styles.css', 'utf8')

/** The text between the braces that follow `start`. */
function block(start: string): string {
  const from = css.indexOf(start)
  if (from < 0) throw new Error(`missing: ${start}`)
  let depth = 0
  for (let i = css.indexOf('{', from); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') depth -= 1
    if (depth === 0) return css.slice(css.indexOf('{', from) + 1, i)
  }
  throw new Error(`unclosed: ${start}`)
}

/** Splits light-dark(a, b) at its own comma, so rgb(… / …) inside stays whole. */
function lightDark(value: string): [string, string] {
  const inner = value.trim().replace(/^light-dark\(/, '').replace(/\)$/, '')
  let depth = 0
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '(') depth += 1
    if (inner[i] === ')') depth -= 1
    if (inner[i] === ',' && depth === 0) return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()]
  }
  throw new Error(`not light-dark(): ${value}`)
}

const tokens = (text: string): Record<string, string> =>
  Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? '', (m[2] ?? '').trim()]))

describe('the colour palette', () => {
  const modern = tokens(block('@supports (color: light-dark('))
  const fallback = block('@supports not (color: light-dark(')
  const fallbackDark = tokens(block('@media (prefers-color-scheme: dark)'))
  const fallbackLight = tokens(fallback.slice(0, fallback.indexOf('@media')))

  it('is written once per colour, light then dark', () => {
    expect(Object.keys(modern).length).toBeGreaterThan(15)
    for (const value of Object.values(modern)) expect(value).toMatch(/^light-dark\(/)
  })

  it('has a copy for older iPhones that matches it exactly', () => {
    expect(Object.keys(fallbackLight).sort()).toEqual(Object.keys(modern).sort())
    expect(Object.keys(fallbackDark).sort()).toEqual(Object.keys(modern).sort())
    for (const [name, value] of Object.entries(modern)) {
      const [light, dark] = lightDark(value)
      expect(fallbackLight[name], `--${name} light`).toBe(light)
      expect(fallbackDark[name], `--${name} dark`).toBe(dark)
    }
  })

  it('can be set to Light or Dark in the app, or follow the iPhone', () => {
    expect(block(":root[data-appearance='light']")).toContain('color-scheme: light')
    expect(block(":root[data-appearance='dark']")).toContain('color-scheme: dark')
    expect(block(':root {')).toContain('color-scheme: light dark')
  })
})
