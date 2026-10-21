import { ComingSoon } from './app/ComingSoon'
import { TabBar } from './app/TabBar'
import { UpdateBanner } from './app/UpdateBanner'
import { useRoute } from './app/useRoute'
import { MoreScreen } from './features/more/MoreScreen'
import type { Tab } from './lib/route'

function Screen({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'today':
      return (
        <ComingSoon title="Today" phase={1}>
          Log your day in two minutes: what you did, how engaged you were, and whether it gave or drained energy.
        </ComingSoon>
      )
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
  return (
    <>
      <main className="app">
        <Screen tab={tab} />
      </main>
      <UpdateBanner />
      <TabBar current={tab} />
    </>
  )
}
