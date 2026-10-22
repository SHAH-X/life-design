import { useEffect, useState } from 'react'

/** After this long without data, a screen says it's still opening and offers a reload. */
export const SLOW_MS = 4000

/**
 * Space for a screen whose data is on its way. If the database doesn't answer, it says so instead of staying
 * blank (v0.8 on the iPhone: a blank screen after switching back to the app).
 */
export function Loading() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="loading" aria-busy={!slow}>
      {slow ? (
        <div className="slow" role="status">
          <p className="muted">Opening your journal…</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      ) : null}
    </div>
  )
}
