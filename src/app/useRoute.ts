import { useEffect, useSyncExternalStore } from 'react'
import { parseRoute, type Route } from '../lib/route'

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const readHash = () => window.location.hash

// useSyncExternalStore re-reads the hash after subscribing, so a route change that lands between
// the first render and the subscription (e.g. right after a reload) is never missed.
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, readHash)
  const route = parseRoute(hash)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route.tab, route.sub])

  return route
}
