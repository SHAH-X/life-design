// Pence as money. `money` is for the screen: thousands with a comma ("£5,000.00"). `moneyPlain` has none, for what is sent to
// an AI and checked against the phone's own sums (src/domain/ask.ts).

const sign = (minor: number) => (minor < 0 ? '-' : '')

/** "£3.55", "-£0.50", "£5,000.00". */
export const money = (minor: number, currency: string): string => {
  const pounds = Math.floor(Math.abs(minor) / 100)
  const pence = String(Math.abs(minor) % 100).padStart(2, '0')
  return `${sign(minor)}${currency}${String(pounds).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${pence}`
}

/** The same with no separators: "£5000.00". */
export const moneyPlain = (minor: number, currency: string): string => `${sign(minor)}${currency}${(Math.abs(minor) / 100).toFixed(2)}`
