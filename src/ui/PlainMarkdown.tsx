import { Fragment, type ReactNode } from 'react'

// An AI's answer, shown as paragraphs, headings, lists and tables (v0.12; tables v0.18.3). Built as React text, never
// as HTML, so nothing in an answer can run or load anything; markdown it doesn't know stays plain text.

export type Block =
  | { kind: 'heading' | 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  /** `right`: each column's cells lined up on the right (amounts and numbers, or as the table asks with ---:). */
  | { kind: 'table'; header: string[]; rows: string[][]; right: boolean[] }

const HEADING = /^#{1,6}\s+(.*)$/
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
/** A table's separator cell: ---, :---, ---: or :---:. */
const RULE = /^:?-{3,}:?$/
/** A cell that's an amount or a number: £1.45, 1,20 €, -0.50, 2, 15%. */
const NUMBER = /^[-+]?[£$€]?\s?\d[\d.,]*\s?[£$€%]?$/

/** A table row's cells: its pipes, less the outer ones. */
const cellsOf = (line: string) =>
  line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

/** A table starting at `lines[at]`: a row with 2+ cells, then a separator with as many; its rows run while lines
 *  have a pipe. Null when there's none there (then the lines are read as they always were). */
function tableAt(lines: readonly string[], at: number): { block: Extract<Block, { kind: 'table' }>; end: number } | null {
  const first = lines[at]!.trim()
  const rule = lines[at + 1]?.trim() ?? ''
  if (!first.includes('|') || !rule.includes('|')) return null
  const header = cellsOf(first)
  const rules = cellsOf(rule)
  if (header.length < 2 || rules.length !== header.length || !rules.every((r) => RULE.test(r))) return null
  let end = at + 2
  const rows: string[][] = []
  while (end < lines.length && lines[end]!.trim().includes('|')) {
    const cells = cellsOf(lines[end]!.trim())
    rows.push(header.map((_, i) => cells[i] ?? ''))
    end++
  }
  const right = rules.map((r, i) => {
    if (r.startsWith(':') || r.endsWith(':')) return !r.startsWith(':') && r.endsWith(':')
    const filled = rows.map((row) => row[i]!).filter(Boolean)
    return filled.length > 0 && filled.every((cell) => NUMBER.test(cell))
  })
  return { block: { kind: 'table', header, rows, right }, end }
}

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  for (let n = 0; n < lines.length; n++) {
    const table = tableAt(lines, n)
    if (table) {
      flush()
      blocks.push(table.block)
      n = table.end - 1
      continue
    }
    const line = lines[n]!.trim()
    const heading = line.match(HEADING)
    const bullet = line.match(BULLET)
    const numbered = line.match(NUMBERED)
    if (!line || /^(-{3,}|\*{3,})$/.test(line)) {
      flush()
    } else if (heading) {
      flush()
      blocks.push({ kind: 'heading', text: heading[1] ?? '' })
    } else if (bullet || numbered) {
      flush()
      const ordered = !bullet
      const item = (bullet ?? numbered)?.[1] ?? ''
      const last = blocks.at(-1)
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item)
      else blocks.push({ kind: 'list', ordered, items: [item] })
    } else {
      paragraph.push(line)
    }
  }
  flush()
  return blocks
}

/** **bold** as strong; everything else as it is. */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  )
}

export function PlainMarkdown({ text }: { text: string }) {
  return (
    <div className="plain-markdown">
      {parseMarkdown(text).map((block, i) => {
        if (block.kind === 'table') {
          const align = (column: number) => (block.right[column] ? 'num' : undefined)
          // A table wider than the screen scrolls inside its own box, never the page; the box takes the focus so it
          // can be scrolled without touch too.
          return (
            <div key={i} className="md-table" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    {block.header.map((cell, c) => (
                      <th key={c} scope="col" className={align(c)}>
                        {inline(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className={align(c)}>
                          {inline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (block.kind !== 'list') return block.kind === 'heading' ? <h4 key={i}>{inline(block.text)}</h4> : <p key={i}>{inline(block.text)}</p>
        const List = block.ordered ? 'ol' : 'ul'
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
