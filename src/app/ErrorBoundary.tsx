import { Component, type ReactNode } from 'react'
import { isLostConnection, mayReload, reloadOnce } from '../db/health'
import { Loading } from '../ui/Loading'

interface State {
  error: unknown
  /** A lost database connection: the app is reloading itself. */
  reloading: boolean
}

/**
 * Never a blank screen. When a screen fails, React removes the whole page unless something catches the error
 * (v0.8 on the iPhone: blank after switching back to the app, once iOS had dropped the database connection).
 * A lost connection reloads the app once; anything else, or a second failure, says so and offers a reload.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, reloading: false }

  static getDerivedStateFromError(error: unknown): State {
    return { error, reloading: isLostConnection(error) && mayReload() }
  }

  componentDidCatch() {
    if (this.state.reloading && !reloadOnce()) this.setState({ reloading: false })
  }

  render() {
    if (this.state.error === null) return this.props.children
    if (this.state.reloading) return <Loading />
    return <Failure error={this.state.error} />
  }
}

/** The error's name and message, never anything you wrote. */
function describe(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { name, message } = error as { name?: unknown; message?: unknown }
    return `${typeof name === 'string' ? name : 'Error'}: ${String(message)}`.slice(0, 300)
  }
  return String(error).slice(0, 300)
}

function Failure({ error }: { error: unknown }) {
  return (
    <main className="app failure">
      <h1>Something went wrong</h1>
      <p>Your entries are still on this phone.</p>
      <button type="button" className="primary wide" onClick={() => window.location.reload()}>
        Reload
      </button>
      <p className="muted small">If it keeps happening, close the app and open it again.</p>
      <p className="muted small failure-detail">{describe(error)}</p>
    </main>
  )
}
