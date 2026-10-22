import { Fragment, type ReactNode } from 'react'

// An AI's answer, shown as paragraphs, headings and lists (v0.12). Built as React text, never as HTML, so nothing in an
// answer can run or load anything; markdown it doesn't know stays plain text.

export type Block = { kind: 'heading' | 'paragraph'; text: string } | { kind: 'list'; ordered: boolean; items: string[] }

const HEADING = /^#{1,6}\s+(.*)$/
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
  }
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
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
