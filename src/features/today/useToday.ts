import { useEffect, useState } from 'react'
import { toDateKey } from '../../lib/dates'

/** Today's date key, kept current when the app is reopened after midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => toDateKey(new Date()))

  useEffect(() => {
    const refresh = () => setToday(toDateKey(new Date()))
    const timer = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
