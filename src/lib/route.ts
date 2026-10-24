// Hash-based routes (#/today, #/review/<id>) keep GitHub Pages happy (no 404 on reload) and work offline.

export const TABS = ['today', 'entries', 'ask', 'insights', 'more'] as const
export type Tab = (typeof TABS)[number]
export const DEFAULT_TAB: Tab = 'today'

export interface Route {
  tab: Tab
  /** Optional second part, e.g. a review id in #/review/<id>. */
  sub: string | null
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? ''
  const [name = '', second] = path.split('/')
  if (!(TABS as readonly string[]).includes(name)) return { tab: DEFAULT_TAB, sub: null }
  return { tab: name as Tab, sub: second ? decodeURIComponent(second) : null }
}

/** Reads the tab from a location hash such as "#/review/2026-10-19"; unknown or empty → today. */
export function parseHash(hash: string): Tab {
  return parseRoute(hash).tab
}

export function hashFor(tab: Tab, sub?: string | null): string {
  return sub ? `#/${tab}/${encodeURIComponent(sub)}` : `#/${tab}`
}

export function navigate(tab: Tab, sub?: string | null): void {
  window.location.hash = hashFor(tab, sub)
}
