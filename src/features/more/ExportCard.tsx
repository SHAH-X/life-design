import { useDialogs } from '../../app/dialogs'

export function ExportCard() {
  const { open } = useDialogs()
  return (
    <section className="card">
      <h2>Spreadsheet export</h2>
      <p className="muted">
        Your activities as a table (CSV) to open in Numbers, Excel or Google Sheets. For looking at your data, not a backup.
      </p>
      <button type="button" className="wide" onClick={() => open('csv')}>
        Export activities (CSV)
      </button>
    </section>
  )
}
