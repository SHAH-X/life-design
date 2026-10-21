export function ComingSoon({ title, phase, children }: { title: string; phase: number; children: string }) {
  return (
    <>
      <h1>{title}</h1>
      <div className="card">
        <p>{children}</p>
        <p className="muted">Arrives in phase {phase}.</p>
      </div>
    </>
  )
}
