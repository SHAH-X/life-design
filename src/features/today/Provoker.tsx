import { useEffect, useState } from 'react'
import { doneAlready, markShown, notNow } from '../../db/provoker'
import type { Ask } from '../../prompts/provoke'
import type { Provoker as ProvokerData } from './useProvoker'

/**
 * Today's question from your own writing (v0.16), above the box: a tap answers it in the writer; "Not now" leaves it
 * for the rest of the day; "Done already" closes it for good. It holds still while Today is open: one that comes up
 * meanwhile waits for the next visit, so nothing appears under your finger.
 */
export function Provoker({ today, data, onAnswer }: { today: string; data: ProvokerData; onAnswer: (ask: Ask) => void }) {
  const [ask, setAsk] = useState(data.ask)

  // Marked once, when first shown: held for the day, and not asked again for a while.
  useEffect(() => {
    if (ask && !data.held) void markShown(today, ask).catch(() => undefined)
  }, [])

  if (!ask || data.resting) return null
  const settle = (how: typeof notNow) => {
    setAsk(null)
    void how(today, ask).catch(() => undefined)
  }
  return (
    <section className="provoker" aria-label="A question from your writing">
      <button type="button" className="provoker-ask" onClick={() => onAnswer(ask)}>
        {ask.question}
      </button>
      <p className="provoker-actions">
        <button type="button" className="link" onClick={() => settle(notNow)}>
          Not now
        </button>
        {ask.closable ? (
          <button type="button" className="link" onClick={() => settle(doneAlready)}>
            Done already
          </button>
        ) : null}
      </p>
    </section>
  )
}
