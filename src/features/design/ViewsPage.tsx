import { useLiveQuery } from 'dexie-react-hooks'
import { useId } from 'react'
import { db } from '../../db/db'
import { saveViews, type ViewsText } from '../../db/repo'
import type { Views } from '../../db/types'
import { COHERENCE_QUESTION, LIFEVIEW_INFO, LIFEVIEW_QUESTION, WORKVIEW_INFO, WORKVIEW_QUESTION } from '../../domain/lifeDesign'
import { hashFor } from '../../lib/route'
import { Question } from '../../ui/Question'
import { useSavedValue } from '../../ui/useSavedValue'
import { ViewsVersionList } from './EarlierVersions'

/** Workview, Lifeview, and how they fit: saved as you type; an edit a week or more later starts a new version. */
export function ViewsPage() {
  const all = useLiveQuery(() => db.views.orderBy('updatedAt').toArray(), [])
  // Render only once loaded, so nothing jumps under your finger.
  if (all === undefined) return <div className="loading" aria-busy="true" />
  return <ViewsForm initial={all.at(-1) ?? null} all={all} />
}

function ViewsForm({ initial, all }: { initial: Views | null; all: readonly Views[] }) {
  const ids = { work: useId(), life: useId(), fit: useId() }
  // The form keeps its own copy while you're on the page: a new version being saved never resets what you're typing.
  const { value, update } = useSavedValue<ViewsText>(
    { workview: initial?.workview ?? '', lifeview: initial?.lifeview ?? '', coherence: initial?.coherence ?? '' },
    (text) => saveViews(text),
  )
  const current = all.at(-1)
  const earlier = all.filter((v) => v.id !== current?.id).reverse()

  return (
    <>
      <a className="back-link" href={hashFor('design')}>
        ‹ Life Design
      </a>
      <h1>Workview & Lifeview</h1>
      <section className="card">
        <Question as="label" htmlFor={ids.work} info={WORKVIEW_INFO} infoLabel="What could the Workview cover?">
          {WORKVIEW_QUESTION}
        </Question>
        <textarea
          id={ids.work}
          rows={8}
          maxLength={6000}
          placeholder="About 250 words is plenty"
          value={value.workview}
          onChange={(e) => {
            const workview = e.target.value
            update((v) => ({ ...v, workview }))
          }}
        />
        <Question as="label" htmlFor={ids.life} info={LIFEVIEW_INFO} infoLabel="What could the Lifeview cover?">
          {LIFEVIEW_QUESTION}
        </Question>
        <textarea
          id={ids.life}
          rows={8}
          maxLength={6000}
          placeholder="About 250 words is plenty"
          value={value.lifeview}
          onChange={(e) => {
            const lifeview = e.target.value
            update((v) => ({ ...v, lifeview }))
          }}
        />
        <label className="question-text" htmlFor={ids.fit}>
          {COHERENCE_QUESTION}
        </label>
        <textarea
          id={ids.fit}
          rows={5}
          maxLength={4000}
          placeholder="Optional"
          value={value.coherence}
          onChange={(e) => {
            const coherence = e.target.value
            update((v) => ({ ...v, coherence }))
          }}
        />
      </section>
      <ViewsVersionList versions={earlier} />
    </>
  )
}
