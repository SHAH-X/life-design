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
  it('has no colour written outside :root (restyle, 2026-11-02: four hard-coded hexes had crept in)', () => {
    const outside = css.replace(rootBlock(), '')
    const hexes = [...outside.matchAll(/(?<=[:\s(,])#[0-9a-f]{3,8}\b(?=[\s;,)])/gi)].map((m) => m[0])
    expect(hexes).toEqual([])
  })

  it('uses only the type scale and three weights (400 body, 500 labels, 600 titles)', () => {
    const outside = css.replace(rootBlock(), '')
    const sizes = [...outside.matchAll(/font-size:\s*([^;]+);/g)].map((m) => (m[1] ?? '').replace(/\/\*.*\*\//, '').trim())
    // var(--fs-*) is the scale; em is relative to its parent; 16px keeps iOS from zooming on focus; 9.5px is inside an SVG chart.
    const allowed = (v: string) => /^var\(--fs-(xs|sm|md|lg|xl|2xl|3xl|money)\)$/.test(v) || /^[0-9.]+em$/.test(v) || v === 'inherit' || v === 'max(16px, 1rem)' || v === '9.5px'
    expect(sizes.filter((v) => !allowed(v))).toEqual([])
    const scale = [...rootBlock().matchAll(/--fs-[\w]+:\s*([0-9.]+)rem/g)].map((m) => m[1])
    expect(scale).toEqual(['0.75', '0.85', '1', '1.125', '1.25', '1.5', '2', '2.75'])
    const weights = [...outside.matchAll(/font-weight:\s*([^;]+);/g)].map((m) => (m[1] ?? '').trim())
    expect(weights.filter((v) => !['400', '500', '600', 'inherit', 'normal'].includes(v))).toEqual([])
  })

  it('styles a bare link with the accent, 1px underline (the Ask link was the browser default blue)', () => {
    expect(css).toMatch(/\na \{[^}]*color: var\(--accent\);[^}]*text-decoration-color: var\(--accent-line\);[^}]*text-underline-offset: 3px;/)
  })
  it('keeps glass to its four places, with a solid fallback and a reduced-transparency choice (restyle G3, G5)', () => {
    const users = css.match(/^(?:[^{}\n]*backdrop-filter:[^;]*;)/gm) ?? []
    expect(users.length).toBeGreaterThan(0)
    // The backdrop-filter rules sit in the glass block (dock, banner, sheet header and footer) and the sheet's scrim.
    const glass = css.slice(css.indexOf('/* ---------- Glass: the one recipe'))
    expect(glass).toContain('@supports not ((backdrop-filter: blur(1px))')
    expect(glass).toContain('@media (prefers-reduced-transparency: reduce)')
    // One recipe, written once (with -webkit-): the dock, banner, Today's notice strip, a full-screen sheet's header and footer, and the one stuck day header.
    expect(css.match(/blur\(24px\)/g)).toHaveLength(2)
    expect(glass).toContain('.notice.strip,')
    expect(glass).toContain('.logs-screen .list-section h2[data-stuck]')
    expect(glass).not.toMatch(/\n\.sheet-header,/) // a sheet that has a scrim blurring the page behind it has a solid header and footer
    expect(css).toContain('body::before')
    expect(css).not.toMatch(/animation:[^;]*(wash|ambient)/)
  })
  it('draws a select\'s arrow in --muted (its stroke is a data URI, so the colour is written twice)', () => {
    const muted = /--muted:\s*#([0-9a-f]{6})/i.exec(rootBlock())?.[1]
    const arrow = /--icon-chevron-down:[^;]*stroke='%23([0-9a-f]{6})'/i.exec(rootBlock())?.[1]
    expect(muted).toBeDefined()
    expect(arrow).toBe(muted)
  })
  it('is written once: one .notice rule, one textarea-only rule (the shared input rule is the other), one "Need a start?" rule, no hard-coded transition times', () => {
    expect(css.match(/^\.notice \{/gm)).toHaveLength(1)
    // The shared rule (`input…, select, textarea {`) is one; what only a textarea has (52px, no grip, growing) is the one standalone rule.
    expect(css.match(/\*\/\ntextarea \{|\n\ntextarea \{/g)).toHaveLength(1)
    expect(css.match(/\nselect,\ntextarea \{/g)).toHaveLength(1)
    expect(css.match(/^\.field-foot button\.link \{/gm)).toHaveLength(1)
    expect(css).not.toMatch(/transition:[^;]*\b0\.\d+s\b(?!\s*;?\s*\/\/)/)
    expect(css).not.toMatch(/animation:[^;]*\b0\.\d+s\b/)
    expect(css).not.toMatch(/\.notice\.warn \{[^}]*evening-border/)
    expect(css.replace(rootBlock(), '')).not.toMatch(/rgb\(0 0 0/) // the thumb's shadow is a token
  })

  it('draws a placeholder in solid --muted (opacity 0.8 made it 4.0:1, under AA)', () => {
    const rule = /input::placeholder,\s*textarea::placeholder \{([^}]*)\}/.exec(css)![1]!
    expect(rule).toContain('color: var(--muted)')
    expect(rule).not.toContain('opacity')
  })

  it('gives a control an edge of 3:1, where the hairline --border is 1.2:1', () => {
    const hex = (name: string) => /#[0-9a-f]{6}/i.exec(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(rootBlock())![0])![0]
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
    for (const on of ['surface', 'bg', 'field']) expect(ratio(hex('control-border'), hex(on)), `on --${on}`).toBeGreaterThanOrEqual(3)
    expect(ratio(hex('border'), hex('surface'))).toBeLessThan(1.5)
    for (const selector of ['.chip {', '.segmented {', '.purpose-option {']) {
      const rule = css.slice(css.indexOf(`\n${selector}`), css.indexOf('}', css.indexOf(`\n${selector}`)))
      expect(rule, selector).toContain('var(--control-border)')
    }
  })

  it('draws every button as a pill, and an input at the small radius token', () => {
    expect(/\nbutton,\n\.button \{[^}]*border-radius: var\(--radius-pill\)/.test(css)).toBe(true)
    expect(/\ninput:not\([^{]*\{[^}]*border-radius: var\(--radius-sm\)/.test(css)).toBe(true)
    expect(css).not.toMatch(/border-radius: 16px/)
  })

  it('lets the wash show: the body paints no background over it', () => {
    const body = /\nbody \{([^}]*)\}/.exec(css)![1]!.replace(/\/\*[^]*?\*\//g, '')
    expect(body).not.toMatch(/background/)
    expect(/\nhtml \{[^}]*background: var\(--bg\)/.test(css)).toBe(true)
  })
})
