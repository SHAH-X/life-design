import { useEffect } from 'react'
import { DialogsProvider } from './app/dialogs'
import { TabBar } from './app/TabBar'
import { UpdateBanner } from './app/UpdateBanner'
import { useDatabaseCheck } from './app/useDatabaseCheck'
import { useRoute } from './app/useRoute'
import { EntriesScreen } from './features/entries/EntriesScreen'
import { InsightsScreen } from './features/insights/InsightsScreen'
import { MoreScreen } from './features/more/MoreScreen'
import { TodayScreen } from './features/today/TodayScreen'
import { useWelcome, Welcome } from './features/welcome/Welcome'
import type { Route } from './lib/route'
import { ensurePersistentStorage } from './lib/storage'
import { Loading } from './ui/Loading'

function Screen({ route }: { route: Route }) {
  switch (route.tab) {
    case 'today':
      return <TodayScreen />
    case 'entries':
      return <EntriesScreen />
    case 'insights':
      return <InsightsScreen sub={route.sub} />
    case 'more':
      return <MoreScreen sub={route.sub} />
  }
}

export function App() {
  const route = useRoute()
  const welcome = useWelcome()
  useDatabaseCheck()

  // Ask iOS to keep this app's data even when the phone is short of space (asked on every launch).
  useEffect(() => {
    void ensurePersistentStorage()
  }, [])

  return (
    <DialogsProvider>
      <main className="app">
        {welcome.show === undefined ? (
          <Loading />
        ) : welcome.show ? (
          <Welcome onDone={welcome.done} />
        ) : (
          <Screen route={route} />
        )}
      </main>
      <UpdateBanner />
      {welcome.show === false ? <TabBar current={route.tab} /> : null}
    </DialogsProvider>
  )
}
