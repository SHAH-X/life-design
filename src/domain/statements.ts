// Bank and card statements (v0.20, owner's choice: statements brought in, read on the phone, never sent anywhere). A
// statement's PDF gives each piece of its text with where it sits (src/lib/pdfText.ts); this turns them into its
// accounts and their lines. The heading row gives the columns (money is aligned right under its heading), each row hangs
// on its date, and long descriptions wrapped round it join it. Every line is checked against the balance printed beside
// it. Tuned on the layouts of the owner's Monzo and Lloyds statements (tests/fixtures/statements.ts, made up).
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

type ColumnKind = 'date' | 'description' | 'type' | 'amount' | 'in' | 'out' | 'balance'
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
  const t = text.trim().toLowerCase()
  if (t === 'date') return 'date'
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
function headingOf(line: Line): Column[] | null {
  const columns = line.pieces.flatMap((p) => {
    const kind = headingKind(p.str)
    return kind ? [{ kind, left: p.x, right: p.x + p.w }] : []
  })
  const has = (kind: ColumnKind) => columns.some((c) => c.kind === kind)
  return has('date') && has('description') && (has('amount') || has('in') || has('out')) ? columns.sort((a, b) => a.left - b.left) : null
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
}

/** The account named above a heading row: its number's last four, or a pot's name. */
function nameAbove(above: readonly Line[], bank: string): string | null {
  for (const line of above) {
    const number = line.text.match(/\baccount (?:number|no\.?)\s*:?\s*(\d{6,8})\b/i)
    if (number) return `${bank} ···${number[1]!.slice(-4)}`
  }
  const potName = above.findIndex((line) => /^pot name$/i.test(line.text))
  if (potName > 0) return `${bank} ${above[potName - 1]!.text} pot`
  if (above.some((line) => /\bpot statement\b/i.test(line.text))) return `${bank} pot`
  return null
}

/** A statement in a PDF's pieces of text: its accounts and their lines, or why there's none. */
export function readStatement(all: readonly TextPiece[]): { accounts: StatementAccount[] } | { problem: StatementProblem } {
  // Text nobody sees (a screen reader's labels) is left out.
  const pieces = all.filter((p) => p.size >= SEEN && p.w > 0 && p.str.trim())
  if (pieces.length === 0) return { problem: 'no-text' }
  const lines = linesOf(pieces)
  const headings = lines.flatMap((line) => {
    const columns = headingOf(line)
    return columns ? [{ line, columns }] : []
  })
  if (headings.length === 0) return { problem: 'no-table' }

  // Rows first, so the bank is read from everything else (a payee can be another bank).
  const inRows = new Set<TextPiece>()
  const sectionRows = headings.map(({ line, columns }, i) => {
    const next = headings[i + 1]?.line
    const within = (p: TextPiece) =>
      (p.page > line.page || (p.page === line.page && p.y < line.y - 1)) && (!next || p.page < next.page || (p.page === next.page && p.y > next.y + 1))
    const region = pieces.filter(within)
    const anchors = region.filter((p) => columnOf(p, columns)?.kind === 'date' && dateIn(p.str, false))
    const rows = anchors.map((anchor) => ({ anchor, date: dateIn(anchor.str, false)!, pieces: [] as TextPiece[] }))
    for (const piece of region) {
      if (anchors.includes(piece)) continue
      const near = rows
        .filter((r) => r.anchor.page === piece.page)
        .sort((a, b) => Math.abs(a.anchor.y - piece.y) - Math.abs(b.anchor.y - piece.y))[0]
      if (near && Math.abs(near.anchor.y - piece.y) <= ROW_REACH) near.pieces.push(piece)
    }
    const read = rows.flatMap((row): StatementLine[] => {
      const of = (kinds: ColumnKind[]) =>
        row.pieces.filter((p) => kinds.includes(columnOf(p, columns)?.kind ?? 'date')).sort((a, b) => b.y - a.y || a.x - b.x)
      const money = (kind: ColumnKind) => {
        const found = of([kind])[0]
        return found ? pence(found.str) : null
      }
      const [amount, moneyIn, moneyOut] = [money('amount'), money('in'), money('out')]
      const value = amount ?? (moneyIn !== null ? Math.abs(moneyIn) : moneyOut !== null ? -Math.abs(moneyOut) : null)
      if (value === null) return []
      inRows.add(row.anchor)
      for (const p of row.pieces) inRows.add(p)
      const words = (kind: ColumnKind) =>
        of([kind])
          .map((p) => p.str.trim())
          .join(' ')
          .replace(/\s+/g, ' ')
      return [{ date: row.date, amount: value, description: words('description'), type: words('type'), balance: money('balance'), adds: true }]
    })
    return { line, columns, read }
  })

  const bankText = pieces
    .filter((p) => !inRows.has(p))
    .map((p) => p.str)
    .join(' ')
  const bank = BANKS.find(([, words]) => words.test(bankText))?.[0] ?? 'Account'

  const sections: (Section & { read: StatementLine[] })[] = sectionRows.map(({ line, columns, read }) => {
    const above = lines.filter((l) => l.page === line.page && l.y > line.y + 1)
    const period = above.map((l) => periodIn(l.text)).find(Boolean) ?? null
    return { page: line.page, y: line.y, columns, name: nameAbove(above, bank), period, read }
  })

  // Sections with no name of their own carry on the account before (a heading row repeated on each page).
  const accounts = new Map<string, { period: Section['period']; lines: StatementLine[] }>()
  let current = sections.find((s) => s.name)?.name ?? bank
  for (const section of sections) {
    if (section.name) current = section.name
    const account = accounts.get(current) ?? { period: null, lines: [] }
    account.period ??= section.period
    account.lines.push(...section.read)
    accounts.set(current, account)
  }

  const read = [...accounts].flatMap(([account, { period, lines: printed }]): StatementAccount[] => {
    if (printed.length === 0) return []
    // Oldest first (some banks print newest first), then each balance checked against the line before.
    const lines = printed[0]!.date > printed.at(-1)!.date ? [...printed].reverse() : [...printed]
    lines.forEach((line, i) => {
      const before = lines[i - 1]?.balance
      line.adds = i === 0 || before === null || before === undefined || line.balance === null || before + line.amount === line.balance
    })
    const dates = lines.map((l) => l.date).sort()
    return [{ account, from: period?.from ?? dates[0]!, to: period?.to ?? dates.at(-1)!, lines }]
  })
  return read.length ? { accounts: read } : { problem: 'no-table' }
}
