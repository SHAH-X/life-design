import { useEffect } from 'react'
import { checkDatabase, reloadOnce } from '../db/health'

/**
 * When the app comes back from the background, make sure its database still answers: iOS can drop the
 * connection meanwhile, and screens opened afterwards would wait for ever. A lost connection reloads the app once.
 */
export function useDatabaseCheck() {
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return
      void checkDatabase().then((state) => {
        if (state === 'lost') reloadOnce()
      })
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('pageshow', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('pageshow', check)
    }
  }, [])
}
