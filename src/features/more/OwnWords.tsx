import { removeOwnWord } from '../../db/repo'
import { AFTER_QUESTION, DURING_QUESTION, type FeelingKind, type OwnWord } from '../../domain/feelings'
import { PLAN_QUESTION } from '../../domain/lifeDesign'
import { useOwnWords } from '../today/useOwnWords'

/** What you answered when you added the word, in words (words about a future carry no answer). */
function meaning(word: OwnWord): string {
  if (word.kind === 'plan') return ''
  if (word.kind === 'during') return word.weight >= 3 ? 'into it' : 'not into it'
  return word.weight > 0 ? 'gives energy' : word.weight < 0 ? 'takes energy' : 'neither'
}

/** The feeling words you added while logging; removing one keeps it on the entries that used it. */
export function OwnWords() {
  const own = useOwnWords()
  if (own === undefined) return <div className="loading" aria-busy="true" />
  if (own.length === 0) {
    return (
      <section className="card">
        <p className="muted">None yet. Add one with “+ your own word” while logging.</p>
      </section>
    )
  }

  const group = (kind: FeelingKind, title: string) => {
    const words = own.filter((w) => w.kind === kind)
    if (words.length === 0) return null
    return (
      <>
        <h2>{title}</h2>
        <ul className="plain-list">
          {words.map((w) => (
            <li key={w.word} className="row">
              <span className="grow">
                {w.word} {meaning(w) ? <span className="muted small">· {meaning(w)}</span> : null}
              </span>
              <button type="button" className="link danger-text" onClick={() => void removeOwnWord(w)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <section className="card">
      {group('during', DURING_QUESTION)}
      {group('after', AFTER_QUESTION)}
      {group('plan', PLAN_QUESTION)}
    </section>
  )
}
