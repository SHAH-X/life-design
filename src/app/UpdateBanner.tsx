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

  if (needRefresh) {
    return (
      <div className="banner" role="status">
        <span>A new version is ready.</span>
        <button type="button" onClick={() => void updateServiceWorker(true)}>
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
