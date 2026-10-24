import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The AI key is typed on the phone and kept there. The app may talk only to its own site and the AI services you can
// choose, so not even injected code could send the key (or your journal) anywhere else (v0.12).

const config = readFileSync('vite.config.ts', 'utf8')
const directive = (name: string) => config.match(new RegExp(`"${name} ([^"]+)"`))?.[1]

describe('Content-Security-Policy', () => {
  it('lets the app connect only to itself and the two AI services', () => {
    expect(directive('connect-src')).toBe("'self' https://api.groq.com https://api.openai.com https://generativelanguage.googleapis.com")
  })

  it('runs only the app’s own scripts, and posts no forms anywhere', () => {
    expect(directive('script-src')).toBe("'self'")
    expect(directive('form-action')).toBe("'none'")
  })
})
