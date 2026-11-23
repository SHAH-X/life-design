// Pence as money. `money` is for the screen: thousands with a comma ("£5,000.00"). `moneyPlain` has none, for what is sent to
// an AI and checked against the phone's own sums (src/domain/ask.ts).

const sign = (minor: number) => (minor < 0 ? '-' : '')

/** "£3.55", "-£0.50", "£5,000.00". */
export const money = (minor: number, currency: string): string => {
  const pounds = Math.floor(Math.abs(minor) / 100)
  const pence = String(Math.abs(minor) % 100).padStart(2, '0')
  return `${sign(minor)}${currency}${String(pounds).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${pence}`
}

/** What you typed as an amount, in minor units: "3.20", "3,20", "£3.20", "-0.50", "5". Null when it isn't one (words, three
 *  decimals, nothing): the form says so rather than guess. No thousands separators: "1234.50". */
export function parseMoney(text: string): number | null {
  const m = text.trim().match(/^([-−]?)\s*[£$€]?\s*(\d{1,7})(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  const minor = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'))
  return m[1] ? -minor : minor
}

/** An amount as a form field shows it: "3.20", no sign of currency, no separators. */
export const amountField = (minor: number): string => `${minor < 0 ? '-' : ''}${(Math.abs(minor) / 100).toFixed(2)}`

/** The same with no separators: "£5000.00". */
export const moneyPlain = (minor: number, currency: string): string => `${sign(minor)}${currency}${(Math.abs(minor) / 100).toFixed(2)}`
