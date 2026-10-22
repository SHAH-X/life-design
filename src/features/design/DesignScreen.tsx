import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { latestViews } from '../../db/repo'
import type { PlanSlot } from '../../domain/lifeDesign'
import { shortDate } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { PlanVersionPage, ViewsVersionPage } from './EarlierVersions'
import { IkigaiPage } from './IkigaiPage'
import { OdysseyPage } from './OdysseyPage'
import { PlanPage } from './PlanPage'
import { PrototypesPage } from './PrototypesPage'
import { ViewsPage } from './ViewsPage'

/** The Life Design tab: a short list; each tool opens as its own page at #/design/<page>. */
export function DesignScreen({ sub }: { sub: string | null }) {
  if (sub === 'odyssey') return <OdysseyPage />
  if (sub === 'views') return <ViewsPage />
  if (sub === 'ikigai') return <IkigaiPage />
  if (sub === 'prototypes') return <PrototypesPage />
  const plan = sub?.match(/^plan-([123])$/)
  if (plan) return <PlanPage slot={Number(plan[1]) as PlanSlot} />
  const planVersion = sub?.match(/^plan-version-(.+)$/)
  if (planVersion?.[1]) return <PlanVersionPage id={planVersion[1]} />
  const viewsVersion = sub?.match(/^views-version-(.+)$/)
  if (viewsVersion?.[1]) return <ViewsVersionPage id={viewsVersion[1]} />
  return <DesignList />
}

function DesignList() {
  const status = useLiveQuery(async () => {
    const [plans, views, things, prototypes] = await Promise.all([db.odysseyPlans.toArray(), latestViews(), db.ikigaiItems.count(), db.prototypes.toArray()])
    const planned = prototypes.filter((p) => p.doneAt === null).length
    return { written: plans.filter((p) => p.writtenAt !== null).length, viewsAt: views?.updatedAt ?? null, things, planned, done: prototypes.length - planned }
  }, [])
  // Render only once every status line has loaded, so the rows never jump.
  if (status === undefined) return <div className="loading" aria-busy="true" />

  const rows = [
    { page: 'odyssey', title: 'Odyssey Plans', status: `${status.written} of 3 written` },
    { page: 'views', title: 'Workview & Lifeview', status: status.viewsAt ? `Written ${shortDate(status.viewsAt)}` : 'Not yet' },
    { page: 'ikigai', title: 'Ikigai map', status: status.things ? `${status.things} ${status.things === 1 ? 'thing' : 'things'}` : 'Not yet' },
    {
      page: 'prototypes',
      title: 'Prototypes',
      status:
        [status.planned ? `${status.planned} planned` : null, status.done ? `${status.done} done` : null].filter(Boolean).join(' · ') || 'Not yet',
    },
  ]
  return (
    <>
      <h1>Life Design</h1>
      <nav className="list" aria-label="Life Design">
        {rows.map((row) => (
          <a key={row.page} className="list-row" href={hashFor('design', row.page)}>
            <span className="list-text">
              <span className="list-title">{row.title}</span>
              <span className="list-status">{row.status}</span>
            </span>
            <span className="list-chevron" aria-hidden="true">
              ›
            </span>
          </a>
        ))}
      </nav>
    </>
  )
}
