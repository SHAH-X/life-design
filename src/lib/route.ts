// Hash-based routes (#/today) keep GitHub Pages happy (no 404 on reload) and work offline.

export const TABS = ['today', 'review', 'insights', 'design', 'more'] as const
export type Tab = (typeof TABS)[number]
export const DEFAULT_TAB: Tab = 'today'

/** Reads the tab from a location hash such as "#/review/2026-10-19"; unknown or empty → today. */
export function parseHash(hash: string): Tab {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? ''
  return (TABS as readonly string[]).includes(name) ? (name as Tab) : DEFAULT_TAB
}

export function hashFor(tab: Tab): string {
  return `#/${tab}`
}
