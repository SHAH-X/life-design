import { useEffect } from 'react'
import { DialogsProvider } from './app/dialogs'
import { TabBar } from './app/TabBar'
import { UpdateBanner } from './app/UpdateBanner'
import { useRoute } from './app/useRoute'
import { DesignScreen } from './features/design/DesignScreen'
import { InsightsScreen } from './features/insights/InsightsScreen'
import { MoreScreen } from './features/more/MoreScreen'
import { ReviewScreen } from './features/review/ReviewScreen'
import { TodayScreen } from './features/today/TodayScreen'
import type { Route } from './lib/route'
import { ensurePersistentStorage } from './lib/storage'

function Screen({ route }: { route: Route }) {
  switch (route.tab) {
    case 'today':
      return <TodayScreen />
    case 'review':
      return <ReviewScreen sub={route.sub} />
    case 'insights':
      return <InsightsScreen />
    case 'design':
      return <DesignScreen sub={route.sub} />
    case 'more':
      return <MoreScreen sub={route.sub} />
  }
}

export function App() {
  const route = useRoute()

  // Ask iOS to keep this app's data even when the phone is short of space (asked on every launch).
  useEffect(() => {
    void ensurePersistentStorage()
  }, [])

  return (
    <DialogsProvider>
      <main className="app">
        <Screen route={route} />
      </main>
      <UpdateBanner />
      <TabBar current={route.tab} />
    </DialogsProvider>
  )
}
