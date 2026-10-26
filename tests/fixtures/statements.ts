// Fictional bank statements (v0.20), laid out like two real ones the owner brought in (Monzo's and Lloyds' PDFs, read
// with their words and numbers masked): every name, number, payee and amount here is made up. Balances are worked out
// from the amounts, so every line adds up unless a test breaks one on purpose.
import type { Placed } from './pdf'

type Row = { date: string; text: readonly string[]; pence: number; type?: string }

const pounds = (pence: number) => `${pence < 0 ? '-' : ''}${(Math.abs(pence) / 100).toFixed(2).replace(/\B(?=(\d{3})+\.)/g, ',')}`

/** Each row's balance, the rows oldest first. */
function balances(rows: readonly Row[], opening: number): number[] {
  let balance = opening
  return rows.map((row) => (balance += row.pence))
}

// ---------- Like Monzo's: newest first, one signed amount, long descriptions wrapped round the date ----------

const MONZO_COLUMNS = { date: 70, description: 153, amountRight: 440, balanceRight: 524 }

function monzoRows(rows: readonly Row[], all: readonly number[], top: number): Placed[] {
  const placed: Placed[] = []
  let y = top
  for (const [i, row] of rows.entries()) {
    const extra = (row.text.length - 1) * 7
    const at = y - 15 - extra
    placed.push({ text: row.date, x: MONZO_COLUMNS.date, y: at })
    row.text.forEach((line, n) => placed.push({ text: line, x: MONZO_COLUMNS.description, y: at + extra - n * 14 }))
    placed.push({ text: pounds(row.pence), x: MONZO_COLUMNS.amountRight, y: at, right: true })
    placed.push({ text: pounds(all[i]!), x: MONZO_COLUMNS.balanceRight, y: at, right: true })
    y = at - 15 - extra
  }
  return placed
}

const monzoHeading = (y: number): Placed[] => [
  { text: 'Date', x: 70, y },
  { text: 'Description', x: 153, y },
  { text: '(GBP) Amount', x: 440, y, right: true },
  { text: '(GBP) Balance', x: 524, y, right: true },
]

const MONZO_SMALL_PRINT: Placed = { text: 'Monzo Bank Limited is a company registered in England. Monzo Bank Ltd is authorised by the Prudential Regulation Authority.', x: 70, y: 60, size: 7 }

/** The current account, oldest first. */
const MONZO_LINES: Row[] = [
  { date: '01/09/2026', text: ['CORNER SHOP SOMETOWN GBR'], pence: -1240 },
  { date: '02/09/2026', text: ['Flex'], pence: 1240 },
  { date: '05/09/2026', text: ['EXAMPLE SUPERMARKET SOMETOWN', 'GBR'], pence: -2310 },
  { date: '06/09/2026', text: ['EXAMPLE SOFTWARE DUBLIN IRL', 'Amount: USD -5.00. Exchange rate:', '1.250000.'], pence: -400 },
  { date: '08/09/2026', text: ['Transfer from Pot'], pence: 5000 },
  { date: '10/09/2026', text: ['Flex'], pence: -1240 },
  { date: '15/09/2026', text: ['Example Gym (Faster Payments) Reference:', 'GYM00042'], pence: -2500 },
  { date: '20/09/2026', text: ['COFFEE PLACE SOMETOWN GBR'], pence: -300 },
  { date: '20/09/2026', text: ['COFFEE PLACE SOMETOWN GBR'], pence: -300 },
]
const MONZO_BALANCES = balances(MONZO_LINES, 10000)
/** Printed newest first: the last three on page 1, the rest carried on to page 2 with no headings. */
const monzoPrinted = [...MONZO_LINES].reverse()
const monzoBalancesPrinted = [...MONZO_BALANCES].reverse()

const POT_LINES: Row[] = [
  { date: '01/09/2026', text: ['Interest for August 2026'], pence: 125 },
  { date: '08/09/2026', text: ['Withdrawal'], pence: -5000 },
]
const POT_BALANCES = balances(POT_LINES, 49875)

export const MONZO_LIKE: Placed[][] = [
  [
    { text: 'Personal Account statement', x: 281, y: 704, size: 16 },
    { text: '01/09/2026 - 30/09/2026', x: 359, y: 677, size: 12 },
    { text: 'A N Other', x: 63, y: 649 },
    { text: '1 Example Road', x: 63, y: 635 },
    { text: 'Sometown', x: 63, y: 622 },
    { text: 'AB1 2CD', x: 63, y: 608 },
    { text: '£79.50', x: 532, y: 647, size: 11, right: true },
    { text: 'Personal Account balance', x: 415, y: 633 },
    { text: '-£80.90', x: 532, y: 520, size: 11, right: true },
    { text: 'Total outgoings', x: 464, y: 506 },
    { text: 'Sort code: 00-00-00', x: 63, y: 481 },
    { text: 'Account number: 12345678', x: 63, y: 467 },
    ...monzoHeading(390),
    ...monzoRows(monzoPrinted.slice(0, 3), monzoBalancesPrinted.slice(0, 3), 380),
  ],
  [...monzoRows(monzoPrinted.slice(3), monzoBalancesPrinted.slice(3), 806), MONZO_SMALL_PRINT],
  [
    { text: 'Pot statement', x: 330, y: 704, size: 16 },
    { text: '01/09/2026 - 30/09/2026', x: 359, y: 677, size: 12 },
    { text: 'A N Other', x: 63, y: 649 },
    { text: 'Savings', x: 480, y: 586, size: 11 },
    { text: 'Pot name', x: 482, y: 572 },
    ...monzoHeading(360),
    ...monzoRows([...POT_LINES].reverse(), [...POT_BALANCES].reverse(), 350),
    MONZO_SMALL_PRINT,
  ],
]

// ---------- Like Lloyds': oldest first, money in and money out in their own columns, hidden labels ----------

const LLOYDS_COLUMNS = { date: 57, description: 122, type: 271, inRight: 376, outRight: 454, balanceRight: 538 }

/** Lloyds' PDF carries labels for screen readers that nobody sees: 0.05 pt, as in the real one (at 0 a test missed
 *  them, v0.20). */
const hidden = (text: string, x: number, y: number): Placed => ({ text, x, y, size: 0.05 })

const LLOYDS_LINES: Row[] = [
  { date: '02 Sep 26', text: ['EXAMPLE ENERGY'], pence: -4500, type: 'DD' },
  { date: '05 Sep 26', text: ['A N OTHER'], pence: 10000, type: 'FPI' },
  { date: '12 Sep 26', text: ['EXAMPLE STREAMING'], pence: -1099, type: 'DEB' },
  { date: '28 Sep 26', text: ['EXAMPLE EMPLOYER LTD'], pence: 150000, type: 'BGC' },
]
const LLOYDS_BALANCES = balances(LLOYDS_LINES, 20000)

function lloydsRows(): Placed[] {
  return LLOYDS_LINES.flatMap((row, i) => {
    const y = 505 - i * 25
    const money = row.pence > 0 ? { right: LLOYDS_COLUMNS.inRight, empty: LLOYDS_COLUMNS.outRight } : { right: LLOYDS_COLUMNS.outRight, empty: LLOYDS_COLUMNS.inRight }
    return [
      hidden('Date', LLOYDS_COLUMNS.date, y + 9),
      { text: row.date, x: LLOYDS_COLUMNS.date, y },
      hidden('.', 96, y),
      hidden('Description', LLOYDS_COLUMNS.description, y + 9),
      { text: row.text[0]!, x: LLOYDS_COLUMNS.description, y },
      { text: row.type!, x: LLOYDS_COLUMNS.type, y },
      { text: pounds(Math.abs(row.pence)), x: money.right, y, right: true },
      hidden('blank.', money.empty, y + 5),
      { text: pounds(LLOYDS_BALANCES[i]!), x: LLOYDS_COLUMNS.balanceRight, y, right: true },
      hidden('.', 538, y),
    ]
  })
}

export const LLOYDS_LIKE: Placed[][] = [
  [
    { text: '30 September 2026', x: 306, y: 809 },
    { text: 'Document requested by:', x: 57, y: 745 },
    { text: 'Mr A N Other', x: 57, y: 734 },
    { text: '1 EXAMPLE ROAD', x: 57, y: 722 },
    { text: 'Your Account', x: 306, y: 745, size: 11 },
    { text: 'Sort Code', x: 306, y: 722 },
    { text: '00-00-00', x: 393, y: 722 },
    { text: 'Account Number', x: 306, y: 710 },
    { text: '87654321', x: 393, y: 710 },
    { text: 'CLASSIC', x: 57, y: 658, size: 11 },
    { text: '01 September 2026 to 30 September 2026', x: 343, y: 658, size: 11 },
    { text: 'Money In', x: 57, y: 618 },
    { text: '£1,600.00', x: 291, y: 618, right: true },
    { text: 'Balance on 01 September 2026', x: 304, y: 618 },
    { text: 'Your Transactions', x: 57, y: 563, size: 11 },
    hidden('Column', 57, 539),
    { text: 'Date', x: 57, y: 530 },
    { text: 'Description', x: 122, y: 530 },
    { text: 'Type', x: 271, y: 530 },
    { text: 'Money In (£)', x: 376, y: 530, right: true },
    { text: 'Money Out (£)', x: 454, y: 530, right: true },
    { text: 'Balance (£)', x: 538, y: 530, right: true },
    ...lloydsRows(),
    { text: 'Transaction types', x: 57, y: 300, size: 11 },
    { text: 'DD', x: 57, y: 280 },
    { text: 'Direct Debit', x: 80, y: 280 },
    { text: 'FPI', x: 200, y: 280 },
    { text: 'Faster Payment In', x: 224, y: 280 },
    { text: 'Lloyds Bank plc. Registered Office: 25 Example Street, London. Registered in England and Wales.', x: 57, y: 61, size: 6 },
  ],
]

/** What a person reads in each: accounts, and their lines oldest first ([date, description, pence, type, balance]). */
export const MONZO_EXPECT = [
  {
    account: 'Monzo ···5678',
    from: '2026-09-01',
    to: '2026-09-30',
    lines: [
      ['2026-09-01', 'CORNER SHOP SOMETOWN GBR', -1240, '', 8760],
      ['2026-09-02', 'Flex', 1240, '', 10000],
      ['2026-09-05', 'EXAMPLE SUPERMARKET SOMETOWN GBR', -2310, '', 7690],
      ['2026-09-06', 'EXAMPLE SOFTWARE DUBLIN IRL Amount: USD -5.00. Exchange rate: 1.250000.', -400, '', 7290],
      ['2026-09-08', 'Transfer from Pot', 5000, '', 12290],
      ['2026-09-10', 'Flex', -1240, '', 11050],
      ['2026-09-15', 'Example Gym (Faster Payments) Reference: GYM00042', -2500, '', 8550],
      ['2026-09-20', 'COFFEE PLACE SOMETOWN GBR', -300, '', 8250],
      ['2026-09-20', 'COFFEE PLACE SOMETOWN GBR', -300, '', 7950],
    ],
  },
  {
    account: 'Monzo Savings pot',
    from: '2026-09-01',
    to: '2026-09-30',
    lines: [
      ['2026-09-01', 'Interest for August 2026', 125, '', 50000],
      ['2026-09-08', 'Withdrawal', -5000, '', 45000],
    ],
  },
]

export const LLOYDS_EXPECT = [
  {
    account: 'Lloyds ···4321',
    from: '2026-09-01',
    to: '2026-09-30',
    lines: [
      ['2026-09-02', 'EXAMPLE ENERGY', -4500, 'DD', 15500],
      ['2026-09-05', 'A N OTHER', 10000, 'FPI', 25500],
      ['2026-09-12', 'EXAMPLE STREAMING', -1099, 'DEB', 24401],
      ['2026-09-28', 'EXAMPLE EMPLOYER LTD', 150000, 'BGC', 174401],
    ],
  },
]
