import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Asks before reloading into a new version, so an entry you are typing is never lost.
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('Service worker registration failed', error)
    },
  })

  // "Ready to work offline" is just information: let it fade by itself.
  useEffect(() => {
    if (!offlineReady) return
    const timer = setTimeout(() => setOfflineReady(false), 5000)
    return () => clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (needRefresh) {
    return (
      <div className="banner" role="status">
        <span>A new version is ready.</span>
        <button type="button" className="primary" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
        <button type="button" className="ghost" onClick={() => setNeedRefresh(false)}>
          Later
        </button>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className="banner" role="status">
        <span>Ready to work offline.</span>
        <button type="button" className="ghost" onClick={() => setOfflineReady(false)}>
          OK
        </button>
      </div>
    )
  }

  return null
}
