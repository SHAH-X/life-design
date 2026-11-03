import { type ReactNode, type Ref, useId, useState } from 'react'
import { Icon } from './Icon'

interface Props {
  /** The question, in words that explain themselves. */
  children: ReactNode
  /** A heading for a question with answer buttons; a label for one answered by typing; a page title with an ⓘ. */
  as?: 'h1' | 'h2' | 'label'
  id?: string
  htmlFor?: string
  /** The deeper "why", shown only when the ⓘ button is tapped. */
  info?: string
  infoLabel?: string
  /** Extra controls at the end of the question's line, e.g. a refresh icon; the ⓘ comes right after the words. */
  actions?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  /** A small icon before the words (the evening card's moon). */
  lead?: ReactNode
}

export function Question({ children, as = 'h2', id, htmlFor, info, infoLabel = 'What does this mean?', actions, headingRef, lead }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="question">
      <div className="question-row">
        {lead ? (
          <span className="question-lead" aria-hidden="true">
            {lead}
          </span>
        ) : null}
        {as === 'label' ? (
          <label className="question-text" id={id} htmlFor={htmlFor}>
            {children}
          </label>
        ) : as === 'h1' ? (
          <h1 id={id}>{children}</h1>
        ) : (
          <h2 className="question-text" id={id} ref={headingRef} tabIndex={-1}>
            {children}
          </h2>
        )}
        {info ? (
          <button
            type="button"
            className="info-button"
            aria-label={infoLabel}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name="info" />
          </button>
        ) : null}
        {actions}
      </div>
      {info && open ? (
        <p id={panelId} className="info-panel">
          {info}
        </p>
      ) : null}
    </div>
  )
}
