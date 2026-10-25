import type { AskJournal, FoundEntry } from '../domain/ask'
import { receiptsOf } from '../domain/shopping'
import { matchesSearch, photoTexts, writtenParts } from '../domain/search'
import type { Embed } from '../lib/embedder'
import { db as defaultDb, type LifeDesignDB } from './db'
import type { Entry } from './types'
import { findByMeaning } from './vectors'

// What Ask your journal reads on the phone: every receipt in a photo, and entries found about something. Read when you
// tap Ask, so it's as the journal is then.

/** At most this many entries go to the AI for one request: enough to answer, not the journal. */
const ENTRIES_MAX = 8
/** Each entry as at most this much of its text. */
const TEXT_MAX = 600

const textOf = (entry: Entry) => [...writtenParts(entry), ...photoTexts(entry)].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX)

export async function journalForAsking(title: (entry: Entry) => string, embed: Embed | null, database: LifeDesignDB = defaultDb): Promise<AskJournal> {
  const finished = (await database.entries.toArray()).filter((e) => e.status !== 'draft')
  const byId = new Map(finished.map((e) => [e.id, e]))
  const found = (e: Entry): FoundEntry => ({ id: e.id, date: e.date, title: title(e), text: textOf(e) })
  return {
    receipts: receiptsOf(finished),
    async findEntries(about, from, to) {
      const among = finished.filter((e) => (!from || e.date >= from) && (!to || e.date <= to))
      const byWords = among.filter((e) => matchesSearch(e, about))
      const byMeaning = embed ? await findByMeaning(about, embed, { among: among.map((e) => e.id), max: ENTRIES_MAX, pick: 'closest' }, database) : []
      const ids = [...new Set([...byWords.map((e) => e.id), ...byMeaning])].slice(0, ENTRIES_MAX)
      return ids.flatMap((id) => {
        const entry = byId.get(id)
        return entry ? [found(entry)] : []
      })
    },
  }
}
