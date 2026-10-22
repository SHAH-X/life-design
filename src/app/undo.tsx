import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'

/** How long "Undo" stays offered. */
export const UNDO_MS = 6000

type OfferUndo = (message: string, undo: () => unknown) => void

const UndoContext = createContext<OfferUndo>(() => undefined)

/** Offers Undo for a few seconds after something is removed, e.g. "Entry deleted · Undo". */
export const useUndo = () => useContext(UndoContext)

export function UndoProvider({ children }: { children: ReactNode }) {
  const [offer, setOffer] = useState<{ message: string; undo: () => unknown; at: number } | null>(null)
  const show = useCallback<OfferUndo>((message, undo) => setOffer({ message, undo, at: Date.now() }), [])

  useEffect(() => {
    if (!offer) return
    const timer = setTimeout(() => setOffer(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [offer])

  return (
    <UndoContext.Provider value={show}>
      {children}
      {offer ? (
        <div className="banner" role="status">
          <span>{offer.message}</span>
          <button
            type="button"
            onClick={() => {
              setOffer(null)
              void offer.undo()
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </UndoContext.Provider>
  )
}
