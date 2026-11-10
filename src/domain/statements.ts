// Bank and card statements (v0.20, owner's choice: statements brought in, read on the phone, never sent anywhere). A
// statement's PDF gives each piece of its text with where it sits (src/lib/pdfText.ts); this turns them into its
// accounts and their lines. The heading row gives the columns (money is aligned right under its heading), each row hangs
// on its date, and long descriptions wrapped round it join it. Every line is checked against the balance printed beside
// it. Tuned on the layouts of the owner's Monzo, Lloyds, Monzo Flex and M&S credit card statements
// (tests/fixtures/statements.ts, made up).
import { dateIn } from './receipts'

/** A piece of text where it sits: its left edge and baseline (up the page), its width, its font size, its page (from 1). */
export interface TextPiece {
  str: string
  x: number
  y: number
  w: number
  size: number
  page: number
}

/** Smaller than this (points) is text nobody sees: Lloyds' labels for screen readers are 0.05 pt. */
const SEEN = 1

export interface StatementLine {
  date: string
  /** In pence; money out is negative. */
  amount: number
  description: string
  /** The bank's own type, when it prints one ("DD", "FPO"); '' otherwise. */
  type: string
  /** The balance printed beside it, in pence; null when there's none. */
  balance: number | null
  /** Whether its balance follows from the line before (the line before's balance, plus its amount). */
  adds: boolean
}

export interface StatementAccount {
  /** As the statement names it: "Lloyds ···4321", "Monzo Savings pot". */
  account: string
  /** The days it covers, as printed, else its first and last line's. */
  from: string
  to: string
  /** Oldest first. */
  lines: StatementLine[]
}

/** Why a PDF gave no statement: no words in it (a scan or a picture), or words but no table of transactions. */
export type StatementProblem = 'no-text' | 'no-table'

/** `posted` is a card's second date, the day it reached the account: the transaction's date is the line's. */
type ColumnKind = 'date' | 'posted' | 'description' | 'type' | 'amount' | 'in' | 'out' | 'balance'
interface Column {
  kind: ColumnKind
  left: number
  right: number
}

/** UK banks, by the names in their small print. First Direct, M&S Bank and Halifax first: their small print can name
 *  the group they're part of. */
const BANKS: [name: string, words: RegExp][] = [
  ['First Direct', /\bfirst ?direct\b/i],
  ['M&S Bank', /\bm&s bank\b|\bmarks (?:&|and) spencer financial/i],
  ['Halifax', /\bhalifax\b/i],
  ['Monzo', /\bmonzo bank\b/i],
  ['Lloyds', /\blloyds bank\b/i],
  ['Barclays', /\bbarclays bank\b/i],
  ['NatWest', /\bnational westminster\b|\bnatwest\b/i],
  ['Santander', /\bsantander uk\b/i],
  ['Nationwide', /\bnationwide building society\b/i],
  ['Starling', /\bstarling bank\b/i],
  ['HSBC', /\bhsbc uk\b/i],
]

/** An amount as statements print it: "1,250.00", "-12.40", "£5.00", "12.00 CR"; balances "45.00 OD". */
const MONEY = /^([-−+])?\s*£?\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?:\s*(CR|DR|OD))?$/i

function pence(text: string): number | null {
  const m = text.trim().match(MONEY)
  if (!m) return null
  const value = Number(m[2]!.replace(/,/g, '')) * 100 + Number(m[3])
  const negative = m[1] === '-' || m[1] === '−' || /^(DR|OD)$/i.test(m[4] ?? '')
  return negative ? -value : value
}

function headingKind(text: string): ColumnKind | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (/\bdate\b/.test(t) && /\b(applied|posted|processed)\b/.test(t)) return 'posted'
  if (/^(date|date of transaction|transaction date)$/.test(t)) return 'date'
  if (/^(description|details|transaction details|transaction|payee)$/.test(t)) return 'description'
  if (t === 'type') return 'type'
  if (/\bbalance\b/.test(t)) return 'balance'
  if (/\b(money in|paid in)\b|^(credits?|deposits?)\b/.test(t)) return 'in'
  if (/\b(money out|paid out)\b|^(debits?|withdrawals?)\b/.test(t)) return 'out'
  if (/\bamount\b/.test(t)) return 'amount'
  return null
}

/** Pieces on one line of a page, left to right. */
interface Line {
  page: number
  y: number
  pieces: TextPiece[]
  text: string
}

function linesOf(pieces: readonly TextPiece[]): Line[] {
  const sorted = [...pieces].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
  const lines: Line[] = []
  for (const piece of sorted) {
    const last = lines.at(-1)
    if (last && last.page === piece.page && Math.abs(last.y - piece.y) <= 2) last.pieces.push(piece)
    else lines.push({ page: piece.page, y: piece.y, pieces: [piece], text: '' })
  }
  for (const line of lines) {
    line.pieces.sort((a, b) => a.x - b.x)
    line.text = line.pieces.map((p) => p.str.trim()).join(' ')
  }
  return lines
}

/** A heading row: a date, a description and money. */
function headingOf(pieces: readonly TextPiece[]): Column[] | null {
  const columns = pieces.flatMap((p) => {
    const kind = headingKind(p.str)
    return kind ? [{ kind, left: p.x, right: p.x + p.w }] : []
  })
  const has = (kind: ColumnKind) => columns.some((c) => c.kind === kind)
  return has('date') && has('description') && (has('amount') || has('in') || has('out')) ? columns.sort((a, b) => a.left - b.left) : null
}

/** How far above a heading line its first half can sit when a heading takes two lines ("Date" over "Applied"). */
const HEADING_LINES_APART = 12

/** A heading on one line, or on two: a word just above joins the word that starts under it (words beside the table can
 *  make a line of their own between the two, so every line close above is looked at). */
function headingsOf(line: Line, lines: readonly Line[]): Column[] | null {
  const alone = headingOf(line.pieces)
  if (alone) return alone
  const over = lines.filter((l) => l.page === line.page && l.y > line.y && l.y - line.y <= HEADING_LINES_APART).flatMap((l) => l.pieces)
  if (over.length === 0) return null
  const joined = line.pieces.map((p) => {
    const above = over.find((o) => Math.abs(o.x - p.x) <= 3)
    return above ? { ...p, str: `${above.str.trim()} ${p.str.trim()}`, w: Math.max(p.w, above.w) } : p
  })
  return headingOf(joined)
}

const MONEY_KINDS: readonly ColumnKind[] = ['amount', 'in', 'out', 'balance']

/** Its column: money by where it ends (it's aligned right), anything else by where it starts. */
function columnOf(piece: TextPiece, columns: readonly Column[]): Column | undefined {
  if (MONEY.test(piece.str.trim())) {
    const end = piece.x + piece.w
    const nearest = columns.filter((c) => MONEY_KINDS.includes(c.kind)).sort((a, b) => Math.abs(a.right - end) - Math.abs(b.right - end))[0]
    if (nearest && Math.abs(nearest.right - end) <= 20) return nearest
  }
  return [...columns].reverse().find((c) => c.left <= piece.x + 2)
}

/** How far from its date a wrapped piece of a row can sit (rows are further apart than this). */
const ROW_REACH = 24

/** Two dates on one line: "01/09/2026 - 30/09/2026", "01 September 2026 to 30 September 2026". */
function periodIn(text: string): { from: string; to: string } | null {
  const halves = text.split(/\s+(?:-|–|to)\s+/)
  if (halves.length !== 2) return null
  const [from, to] = halves.map((half) => dateIn(half, false))
  return from && to ? { from, to } : null
}

interface Section {
  page: number
  y: number
  columns: Column[]
  /** Named on its own page above its headings ("Account number", a pot's name); else it carries on the one before. */
  name: string | null
  period: { from: string; to: string } | null
  /** A card's "Statement date", the last day it covers, when no period is printed. */
  until: string | null
}

/** "Statement date: 08 November 2026", or the date on the line after the label (which can share its line with words
 *  beside it: an address). */
function statementDateIn(lines: readonly Line[]): string | null {
  for (const [i, line] of lines.entries()) {
    const label = line.text.match(/\bstatement date\s*:?\s*(.*)$/i)
    if (!label) continue
    const date = dateIn(label[1]!.trim() || (lines[i + 1]?.text ?? ''), false)
    if (date) return date
  }
  return null
}

/** An account's number (6 to 8 figures) or a card's (16, in fours). */
const ACCOUNT_NUMBER = /\b(\d{6,8}|\d{4}(?: ?\d{4}){3})\b/

/** The account named above a heading row: its number's last four (on the label's line or the next, as a card prints
 *  it), or a pot's name. */
function nameAbove(above: readonly Line[], bank: string): string | null {
  for (const [i, line] of above.entries()) {
    const label = line.text.match(/\baccount (?:number|no\.?)\s*:?\s*(.*)$/i)
    if (!label) continue
    const number = (label[1]!.trim() ? label[1]! : (above[i + 1]?.text ?? '')).match(ACCOUNT_NUMBER)
    if (number) return `${bank} ···${number[1]!.replace(/\s/g, '').slice(-4)}`
  }
  if (above.some((line) => /^flex statement$/i.test(line.text))) return 'Monzo Flex'
  const potName = above.findIndex((line) => /^pot name$/i.test(line.text))
  if (potName > 0) return `${bank} ${above[potName - 1]!.text} pot`
  if (above.some((line) => /\bpot statement\b/i.test(line.text))) return `${bank} pot`
  return null
}

/** Whether a line's printed balance follows from the balance before it (v0.20.28: Money's year of balances uses the same
 *  rule). A card's or Flex's balance is what you owe, so money out raises it. A balance that isn't known follows. */
export function balanceFollows(before: number | null | undefined, line: { amount: number; balance: number | null }, owed: boolean): boolean {
  return before === null || before === undefined || line.balance === null || before + (owed ? -line.amount : line.amount) === line.balance
}

/** Whether an account's balances are what's owed rather than held: whichever way more lines follow, a tie being held. */
export const preferOwed = (heldFollow: number, owedFollow: number): boolean => owedFollow > heldFollow

/** A statement in a PDF's pieces of text: its accounts and their lines, or why there's none. */
export function readStatement(all: readonly TextPiece[]): { accounts: StatementAccount[] } | { problem: StatementProblem } {
  // Text nobody sees (a screen reader's labels) is left out.
  const pieces = all.filter((p) => p.size >= SEEN && p.w > 0 && p.str.trim())
  if (pieces.length === 0) return { problem: 'no-text' }
  const lines = linesOf(pieces)
  const headings = lines.flatMap((line) => {
    const columns = headingsOf(line, lines)
    return columns ? [{ line, columns }] : []
  })
  if (headings.length === 0) return { problem: 'no-table' }

  // Rows first, so the bank is read from everything else (a payee can be another bank).
  const inRows = new Set<TextPiece>()
  /** Lines read from one Amount column, and which of those were marked CR: a card prints no signs (below). */
  const fromAmount = new Set<StatementLine>()
  const credits = new Set<StatementLine>()
  const sectionRows = headings.map(({ line, columns }, i) => {
    const next = headings[i + 1]?.line
    const within = (p: TextPiece) =>
      (p.page > line.page || (p.page === line.page && p.y < line.y - 1)) && (!next || p.page < next.page || (p.page === next.page && p.y > next.y + 1))
    const region = pieces.filter(within)
    const anchors = region.filter((p) => columnOf(p, columns)?.kind === 'date' && dateIn(p.str, false))
    const rows = anchors.map((anchor) => ({ anchor, date: dateIn(anchor.str, false)!, pieces: [] as TextPiece[] }))
    // A line above a row's date can only be its description wrapped: one with money on it is a row of its own, or a
    // summary ("Balance from previous statement £0.00" just above a card's first row).
    const isMoney = (p: TextPiece) => MONEY.test(p.str.trim()) && MONEY_KINDS.includes(columnOf(p, columns)?.kind ?? 'date')
    const moneyLines = new Set(lines.filter((l) => l.pieces.some(isMoney)))
    const lineOf = new Map(lines.flatMap((l) => l.pieces.map((p) => [p, l] as const)))
    for (const piece of region) {
      if (anchors.includes(piece)) continue
      const near = rows
        .filter((r) => r.anchor.page === piece.page)
        .sort((a, b) => Math.abs(a.anchor.y - piece.y) - Math.abs(b.anchor.y - piece.y))[0]
      if (!near || Math.abs(near.anchor.y - piece.y) > ROW_REACH) continue
      if (piece.y > near.anchor.y + 2 && moneyLines.has(lineOf.get(piece)!)) continue
      near.pieces.push(piece)
    }
    const read = rows.flatMap((row): StatementLine[] => {
      const of = (kinds: ColumnKind[]) =>
        row.pieces.filter((p) => kinds.includes(columnOf(p, columns)?.kind ?? 'date')).sort((a, b) => b.y - a.y || a.x - b.x)
      // The column's first figure (words beside the table can fall into the last column by position: a card's "Loyalty
      // points can be viewed…" at the page's right); a "CR" or "DR" printed as its own piece after it, on its line, joins it.
      const moneyText = (kind: ColumnKind) => {
        const column = of([kind])
        const at = column.findIndex((p) => MONEY.test(p.str.trim()))
        if (at === -1) return null
        const [figure, mark] = [column[at]!, column[at + 1]]
        const marked = mark && Math.abs(mark.y - figure.y) <= 2 && /^(CR|DR)$/i.test(mark.str.trim())
        return `${figure.str.trim()}${marked ? ` ${mark.str.trim()}` : ''}`
      }
      const money = (kind: ColumnKind) => {
        const text = moneyText(kind)
        return text ? pence(text) : null
      }
      const [amount, moneyIn, moneyOut] = [money('amount'), money('in'), money('out')]
      // Some statements fill the unused column with 0.00 (Monzo Flex's): in less out, either one missing as nothing.
      const value = amount ?? (moneyIn === null && moneyOut === null ? null : Math.abs(moneyIn ?? 0) - Math.abs(moneyOut ?? 0))
      if (value === null) return []
      inRows.add(row.anchor)
      for (const p of row.pieces) inRows.add(p)
      const words = (kind: ColumnKind) =>
        of([kind])
          .map((p) => p.str.trim())
          .join(' ')
          .replace(/\s+/g, ' ')
      // Contactless marks ")))" aren't part of the payee.
      const description = words('description').replace(/^\)+\s*/, '')
      const line: StatementLine = { date: row.date, amount: value, description, type: words('type'), balance: money('balance'), adds: true }
      if (amount !== null) {
        fromAmount.add(line)
        if (/\bCR$/i.test(moneyText('amount')!)) credits.add(line)
      }
      return [line]
    })
    return { line, columns, read }
  })

  const bankText = pieces
    .filter((p) => !inRows.has(p))
    .map((p) => p.str)
    .join(' ')
  const bank = BANKS.find(([, words]) => words.test(bankText))?.[0] ?? 'Account'

  // A credit card's statement prints no signs: a plain amount is a purchase (money out), one marked CR a payment or
  // refund (money in). A bank's single Amount column carries its own signs and is left alone.
  if (/\bcredit card\b/i.test(bankText)) {
    for (const line of fromAmount) line.amount = credits.has(line) ? Math.abs(line.amount) : -Math.abs(line.amount)
  }

  const sections: (Section & { read: StatementLine[] })[] = sectionRows.map(({ line, columns, read }) => {
    const above = lines.filter((l) => l.page === line.page && l.y > line.y + 1)
    const period = above.map((l) => periodIn(l.text)).find(Boolean) ?? null
    return { page: line.page, y: line.y, columns, name: nameAbove(above, bank), period, until: statementDateIn(above), read }
  })

  // A table can begin on a later page than its statement's title and dates (Monzo Flex's longer one: the summary on page 1,
  // the table alone on page 2). Until a section is named, the pages before it name and date it (v0.20.30: it came in as
  // "Account", dated by its first and last lines). A table already named earlier is left as it was.
  sections.forEach((section, i) => {
    if (sections.slice(0, i).some((earlier) => earlier.name)) return
    const before = lines.filter((l) => l.page < section.page)
    section.name ??= nameAbove(before, bank)
    section.period ??= before.map((l) => periodIn(l.text)).find(Boolean) ?? null
    section.until ??= statementDateIn(before)
  })

  // Sections with no name of their own carry on the account before (a heading row repeated on each page).
  const accounts = new Map<string, { period: Section['period']; until: string | null; lines: StatementLine[] }>()
  let current = sections.find((s) => s.name)?.name ?? bank
  for (const section of sections) {
    if (section.name) current = section.name
    const account = accounts.get(current) ?? { period: null, until: null, lines: [] }
    account.period ??= section.period
    account.until ??= section.until
    account.lines.push(...section.read)
    accounts.set(current, account)
  }

  const read = [...accounts].flatMap(([account, { period, until, lines: printed }]): StatementAccount[] => {
    if (printed.length === 0) return []
    // Oldest first (some banks print newest first; a card prints in the order applied, not the transactions' dates), a
    // day's lines in the order printed, then each balance checked against the line before.
    const lines = (printed[0]!.date > printed.at(-1)!.date ? [...printed].reverse() : [...printed]).sort((a, b) => a.date.localeCompare(b.date))
    // A card's or Flex's balance is what you owe, so money out raises it: whichever way more lines follow.
    const follows = (owed: boolean) => (line: StatementLine, i: number) => i === 0 || balanceFollows(lines[i - 1]?.balance, line, owed)
    const owed = preferOwed(lines.filter(follows(false)).length, lines.filter(follows(true)).length)
    lines.forEach((line, i) => {
      line.adds = follows(owed)(line, i)
    })
    const dates = lines.map((l) => l.date).sort()
    return [{ account, from: period?.from ?? dates[0]!, to: period?.to ?? until ?? dates.at(-1)!, lines }]
  })
  return read.length ? { accounts: read } : { problem: 'no-table' }
}
