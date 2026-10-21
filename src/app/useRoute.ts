import { useEffect, useState } from 'react'
import { parseHash, type Tab } from '../lib/route'

export function useRoute(): Tab {
  const [tab, setTab] = useState<Tab>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      setTab(parseHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return tab
}
