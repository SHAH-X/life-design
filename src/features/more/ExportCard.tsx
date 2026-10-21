import { useDialogs } from '../../app/dialogs'

export function ExportCard() {
  const { open } = useDialogs()
  return (
    <section className="card">
      <p className="muted">Activities as a table for Numbers or Excel. Not a backup.</p>
      <button type="button" className="wide" onClick={() => open('csv')}>
        Export activities (CSV)
      </button>
    </section>
  )
}
