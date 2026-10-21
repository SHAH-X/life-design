import { useEffect } from 'react'
import { ComingSoon } from './app/ComingSoon'
import { DialogsProvider } from './app/dialogs'
import { TabBar } from './app/TabBar'
import { UpdateBanner } from './app/UpdateBanner'
import { useRoute } from './app/useRoute'
import { MoreScreen } from './features/more/MoreScreen'
import { TodayScreen } from './features/today/TodayScreen'
import type { Tab } from './lib/route'
import { ensurePersistentStorage } from './lib/storage'

function Screen({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'today':
      return <TodayScreen />
    case 'review':
      return (
        <ComingSoon title="Review" phase={2}>
          A short review on your schedule: balance gauges, your best and worst moments, and what you learned.
        </ComingSoon>
      )
    case 'insights':
      return (
        <ComingSoon title="Insights" phase={2}>
          Patterns from your entries: what energises you, what drains you, and where you find flow.
        </ComingSoon>
      )
    case 'design':
      return (
        <ComingSoon title="Life Design" phase={3}>
          Odyssey Plans, your Ikigai map, Workview and Lifeview, and small experiments to try.
        </ComingSoon>
      )
    case 'more':
      return <MoreScreen />
  }
}

export function App() {
  const tab = useRoute()

  // Ask iOS to keep this app's data even when the phone is short of space (asked on every launch).
  useEffect(() => {
    void ensurePersistentStorage()
  }, [])

  return (
    <DialogsProvider>
      <main className="app">
        <Screen tab={tab} />
      </main>
      <UpdateBanner />
      <TabBar current={tab} />
    </DialogsProvider>
  )
}
