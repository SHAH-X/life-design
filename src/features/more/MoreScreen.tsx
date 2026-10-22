import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { getOwnWords, getSetting } from '../../db/repo'
import type { Purpose } from '../../db/types'
import { buildInfo, formatBuildInfo } from '../../lib/buildInfo'
import { shortDate, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { isPersisted, isStandalone } from '../../lib/storage'
import { PURPOSE_KEYS, purposeInfo } from '../../domain/purposes'
import { normalizeReminderPlan } from '../../reminders/schedule'
import { Loading } from '../../ui/Loading'
import { BackupCard } from './BackupCard'
import { DeleteAllCard } from './DeleteAllCard'
import { ExportCard } from './ExportCard'
import { DEFAULT_PURPOSE } from '../today/usePurpose'
import { OwnWords } from './OwnWords'
import { PurposeSettings } from './PurposeSettings'
import { RemindersCard } from './RemindersCard'
import { StorageCard } from './StorageCard'
import { useReminderSettings } from './useReminderSettings'

const PAGES = {
  reminders: 'Reminders',
  purpose: 'Your purpose',
  words: 'Your feeling words',
  backup: 'Backup and restore',
  export: 'Spreadsheet export',
  phone: 'This phone',
  delete: 'Delete everything',
} as const

type Page = keyof typeof PAGES

const isPage = (sub: string | null): sub is Page => sub !== null && Object.hasOwn(PAGES, sub)

/** More is a short list; each row opens its own page at #/more/<page>. */
export function MoreScreen({ sub }: { sub: string | null }) {
  return isPage(sub) ? <MorePage page={sub} /> : <MoreList />
}

function MorePage({ page }: { page: Page }) {
  return (
    <>
      <a className="back-link" href={hashFor('more')}>
        ‹ More
      </a>
      <h1>{PAGES[page]}</h1>
      {page === 'reminders' ? <RemindersPage /> : null}
      {page === 'purpose' ? <PurposeSettings /> : null}
      {page === 'words' ? <OwnWords /> : null}
      {page === 'backup' ? <BackupCard /> : null}
      {page === 'export' ? <ExportCard /> : null}
      {page === 'phone' ? <StorageCard /> : null}
      {page === 'delete' ? <DeleteAllCard /> : null}
    </>
  )
}

function RemindersPage() {
  const reminders = useReminderSettings()
  // Render only once the settings have loaded, so nothing below jumps.
  if (reminders === undefined) return <Loading />
  return <RemindersCard settings={reminders} />
}

const REMINDER_NAMES = { daily: 'Daily log', review: 'Review', backup: 'Backup', quarterly: 'Quarterly' } as const

function useListStatus() {
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined)
  useEffect(() => {
    void isPersisted().then(setPersisted)
  }, [])
  const stored = useLiveQuery(async () => {
    const [reminders, primary, lastExportAt, own] = await Promise.all([
      getSetting<unknown>('reminders', null),
      getSetting<unknown>('primaryPurpose', DEFAULT_PURPOSE),
      getSetting<number | null>('lastExportAt', null),
      getOwnWords(),
    ])
    const plan = normalizeReminderPlan(reminders, toDateKey(new Date()))
    const on = (Object.keys(REMINDER_NAMES) as (keyof typeof REMINDER_NAMES)[]).filter((k) => plan[k].on).map((k) => REMINDER_NAMES[k])
    return {
      reminders: on.length ? on.join(' · ') : 'Off',
      purpose: purposeInfo(PURPOSE_KEYS.includes(primary as Purpose) ? (primary as Purpose) : DEFAULT_PURPOSE).label,
      backup: lastExportAt ? `Last: ${shortDate(lastExportAt)}` : 'No backup yet',
      words: own.length ? own.map((w) => w.word).join(' · ') : 'None yet',
    }
  }, [])
  if (stored === undefined || persisted === undefined) return undefined
  const phone = !isStandalone() ? 'Not installed' : persisted === true ? 'Protected' : persisted === false ? 'Not protected' : ''
  return { ...stored, phone }
}

function MoreList() {
  const status = useListStatus()
  // Render only once every status line has loaded, so the rows never jump.
  if (status === undefined) return <Loading />

  const rows: { page: Page; status?: string }[] = [
    { page: 'reminders', status: status.reminders },
    { page: 'purpose', status: status.purpose },
    { page: 'words', status: status.words },
    { page: 'backup', status: status.backup },
    { page: 'export' },
    { page: 'phone', status: status.phone },
    { page: 'delete' },
  ]

  return (
    <>
      <h1>More</h1>
      <nav className="list" aria-label="Settings">
        {rows.map((row) => (
          <a key={row.page} className={`list-row${row.page === 'delete' ? ' danger-text' : ''}`} href={hashFor('more', row.page)}>
            <span className="list-text">
              <span className="list-title">{PAGES[row.page]}</span>
              {row.status ? <span className="list-status">{row.status}</span> : null}
            </span>
            <span className="list-chevron" aria-hidden="true">
              ›
            </span>
          </a>
        ))}
      </nav>
      <p className="muted small top-gap">Your journal stays on this phone.</p>
      <p className="muted small">{formatBuildInfo(buildInfo)}</p>
    </>
  )
}
