import { buildInfo, formatBuildInfo } from '../../lib/buildInfo'

export function MoreScreen() {
  return (
    <>
      <h1>More</h1>
      <div className="card">
        <h2>Your data</h2>
        <p>Everything you log stays on this phone. Nothing is sent anywhere unless you choose to share or run an AI review.</p>
      </div>
      <div className="card">
        <h2>Coming next</h2>
        <p className="muted">Reminders, export and import, and AI settings arrive in later phases.</p>
      </div>
      <p className="muted small">{formatBuildInfo(buildInfo)}</p>
    </>
  )
}
