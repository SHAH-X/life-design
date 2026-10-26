import { useEffect } from 'react'
import { DialogsProvider } from './app/dialogs'
import { TabBar } from './app/TabBar'
import { UndoProvider } from './app/undo'
import { UpdateBanner } from './app/UpdateBanner'
import { useDatabaseCheck } from './app/useDatabaseCheck'
import { useRoute } from './app/useRoute'
import { AskScreen } from './features/ask/AskScreen'
import { EntriesScreen } from './features/entries/EntriesScreen'
import { InsightsScreen } from './features/insights/InsightsScreen'
import { MoneyScreen } from './features/money/MoneyScreen'
import { MoreScreen } from './features/more/MoreScreen'
import { TodayScreen } from './features/today/TodayScreen'
import { AreasProvider } from './features/areas/AreasProvider'
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
    case 'ask':
      return <AskScreen />
    case 'money':
      return <MoneyScreen sub={route.sub} />
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
      <UndoProvider>
        <AreasProvider>
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
        </AreasProvider>
      </UndoProvider>
    </DialogsProvider>
  )
}
