export function StatTile({ label, value, sub, words = false }: { label: string; value: string; sub?: string; words?: boolean }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className={words ? 'stat-value words' : 'stat-value'}>{value}</span>
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </div>
  )
}
