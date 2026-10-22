import { type PointerEvent, type ReactNode, type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react'

/** How far the row slides to show Delete. */
const ACTION_WIDTH = 88
/** Movement before a touch counts as a swipe, or as a scroll. */
const SLOP = 8

interface Gesture {
  id: number
  x: number
  y: number
  from: number
  axis: 'x' | 'y' | null
}

/**
 * Swipe left to show Delete, as in iOS Messages (v0.10). Vertical scrolling stays the browser's
 * (`touch-action: pan-y`); a swipe never counts as a tap, and a tap on an open row closes it. One row is open at a
 * time: touching anywhere else closes it. Delete is also in Edit, for VoiceOver.
 */
export function SwipeRow({ children, deleteLabel, onDelete }: { children: ReactNode; deleteLabel: string; onDelete: () => void }) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  const swiped = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const open = offset !== 0

  useEffect(() => {
    if (!open) return
    const outside = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOffset(0)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: offset, axis: null }
    swiped.current = false
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    const dx = event.clientX - g.x
    const dy = event.clientY - g.y
    if (g.axis === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (g.axis === 'x') {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDragging(true)
      }
    }
    if (g.axis !== 'x') return
    swiped.current = true
    setOffset(Math.max(-ACTION_WIDTH * 1.25, Math.min(0, g.from + dx)))
  }

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    gesture.current = null
    if (g.axis !== 'x') return
    setDragging(false)
    setOffset((current) => (current < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0))
  }

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!swiped.current && !open) return
    event.preventDefault()
    event.stopPropagation()
    if (!swiped.current) setOffset(0)
    swiped.current = false
  }

  return (
    <div ref={root} className="swipe-row" data-open={open || undefined}>
      <button
        type="button"
        className="swipe-delete"
        aria-label={deleteLabel}
        aria-hidden={open ? undefined : true}
        tabIndex={open ? 0 : -1}
        onClick={() => {
          setOffset(0)
          onDelete()
        }}
      >
        Delete
      </button>
      <div
        className="swipe-content"
        data-dragging={dragging || undefined}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  )
}
