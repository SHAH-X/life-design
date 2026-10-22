// More → Appearance: Automatic (the iPhone's own setting), Light or Dark. A preference of this phone, kept in
// localStorage so public/appearance.js can apply it before the first paint. Not journal data: never backed up.

export type Appearance = 'auto' | 'light' | 'dark'

export const APPEARANCE_KEY = 'life-design:appearance'

/** The status bar's colour for each look (the page background). */
const STATUS_BAR = { light: '#f6f4ef', dark: '#151514' } as const

export function getAppearance(): Appearance {
  try {
    const value = localStorage.getItem(APPEARANCE_KEY)
    return value === 'light' || value === 'dark' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

/** Keeps the choice and applies it at once: the colours and the status bar. */
export function setAppearance(choice: Appearance) {
  try {
    if (choice === 'auto') localStorage.removeItem(APPEARANCE_KEY)
    else localStorage.setItem(APPEARANCE_KEY, choice)
  } catch {
    // Storage refused: the choice lasts until the app is closed.
  }
  const root = document.documentElement
  if (choice === 'auto') root.removeAttribute('data-appearance')
  else root.setAttribute('data-appearance', choice)
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes('dark') ? STATUS_BAR.dark : STATUS_BAR.light
    meta.content = choice === 'auto' ? own : STATUS_BAR[choice]
  }
}

export const APPEARANCE_LABELS: Record<Appearance, string> = { auto: 'Automatic', light: 'Light', dark: 'Dark' }
