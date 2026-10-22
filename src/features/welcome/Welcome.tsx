import { useEffect, useId, useState } from 'react'
import { shouldWelcome } from '../../app/welcome'
import { getSetting, hasJournalData, setSetting } from '../../db/repo'
import { type Entry, entryDefaults } from '../../db/types'
import { navigate } from '../../lib/route'
import { PurposeSettings } from '../more/PurposeSettings'
import { EntryRow } from '../today/EntryRow'

const STEPS = ['Life Design', 'What would you like it to help with?', 'A nudge each evening?'] as const

// Fictional examples: what an entry looks like, and that a few words is enough.
const example = (
  activity: string,
  during: string[],
  energyEffect: Entry['energyEffect'],
  after: string[],
  energy: Entry['energy'],
  note = '',
): Entry => ({
  ...entryDefaults(),
  energyEffect,
  id: activity,
  date: '2026-01-01',
  part: 'evening',
  activity,
  engagement: 4,
  energy,
  flow: false,
  where: [],
  people: [],
  objects: [],
  during,
  after,
  note,
  source: 'evening',
  createdAt: 0,
  updatedAt: 0,
})
const EXAMPLES = [
  example('Evening run', ['Focused'], 'gave', ['Happy'], 2),
  example('Team meeting', ['Distracted'], 'used', ['Tired'], -2, 'Went in circles. Next time: an agenda.'),
]

/** Where the welcome hands over: Today, or straight to restoring a backup or setting a reminder. */
type Exit = { tab: 'today' } | { tab: 'more'; sub: 'backup' | 'reminders' }

/**
 * Whether to show the welcome, decided once when the app opens (undefined while it looks). It never appears in
 * the middle of using the app, e.g. after "Delete everything".
 */
export function useWelcome(): { show: boolean | undefined; done: (exit: Exit) => void } {
  const [hash] = useState(() => window.location.hash)
  const atStart = shouldWelcome({ hash, welcomed: false, hasData: false })
  const [show, setShow] = useState<boolean | undefined>(atStart ? undefined : false)

  useEffect(() => {
    if (!atStart) return
    Promise.all([getSetting<boolean>('welcomed', false), hasJournalData()])
      .then(([welcomed, hasData]) => setShow(shouldWelcome({ hash, welcomed, hasData })))
      .catch(() => setShow(false))
  }, [atStart, hash])

  const done = (exit: Exit) => {
    void setSetting('welcomed', true)
    setShow(false)
    navigate(exit.tab, exit.tab === 'more' ? exit.sub : null)
  }
  return { show, done }
}

/** The short welcome on a first open: what the app is for, what you'd like help with, and a reminder if you want one. */
export function Welcome({ onDone }: { onDone: (exit: Exit) => void }) {
  const headingId = useId()
  const [step, setStep] = useState(0)
  const last = STEPS.length - 1
  const go = (to: number) => {
    setStep(to)
    window.scrollTo(0, 0)
  }

  return (
    <>
      <div className="wizard-head">
        <div className="welcome-top">
          <p className="muted wizard-step">
            {step + 1} of {STEPS.length}
          </p>
          {step < last ? (
            <button type="button" className="link" onClick={() => onDone({ tab: 'today' })}>
              Skip
            </button>
          ) : null}
        </div>
        <h1 id={headingId}>{STEPS[step]}</h1>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      {step === 0 ? (
        <>
          <p className="welcome-lead">Notice what gives you energy and what takes it, then design more of what fits.</p>
          <ul className="entry-list" aria-label="Examples">
            {EXAMPLES.map((entry) => (
              <li key={entry.id}>
                <EntryRow entry={entry} />
              </li>
            ))}
          </ul>
          <p>A few words is enough. Everything stays on this phone.</p>
        </>
      ) : step === 1 ? (
        <PurposeSettings labelledBy={headingId} />
      ) : (
        <section className="card">
          <p>Your Calendar can remind you.</p>
          <button type="button" onClick={() => onDone({ tab: 'more', sub: 'reminders' })}>
            Set a reminder
          </button>
        </section>
      )}

      <div className="wizard-nav">
        <button type="button" disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </button>
        {step < last ? (
          <button type="button" className="primary" onClick={() => go(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => onDone({ tab: 'today' })}>
            Start
          </button>
        )}
      </div>
      {step === 0 ? (
        <p className="muted center top-gap">
          Have a backup?{' '}
          <button type="button" className="link" onClick={() => onDone({ tab: 'more', sub: 'backup' })}>
            Restore it
          </button>
        </p>
      ) : null}
    </>
  )
}
