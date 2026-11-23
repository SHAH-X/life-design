import { useEffect, useRef, useState } from 'react'
import { fromBase64 } from '../../lib/photo'
import { loadPdfJs } from '../../lib/pdfText'

/** A kept PDF drawn page by page on the screen (step 5): the app never opens a link to a file, so PDF.js draws the pages itself.
 *  Only drawn; nothing is fetched and nothing in the file runs. */
export function PdfView({ data, pages }: { data: string; pages: number | null }) {
  const box = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ drawn: number; total: number } | 'failed'>({ drawn: 0, total: pages ?? 0 })

  useEffect(() => {
    let cancelled = false
    let destroy: (() => Promise<void>) | null = null
    async function draw() {
      try {
        const pdfjs = await loadPdfJs()
        const task = pdfjs.getDocument({ data: fromBase64(data), disableFontFace: true, useSystemFonts: true, verbosity: 0 })
        destroy = () => task.destroy()
        const doc = await task.promise
        const host = box.current
        if (!host || cancelled) return
        host.replaceChildren()
        const width = Math.min(host.clientWidth || 340, 720)
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n)
          if (cancelled) return
          const scale = width / page.getViewport({ scale: 1 }).width
          const viewport = page.getViewport({ scale: scale * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = `${width}px`
          canvas.setAttribute('role', 'img')
          canvas.setAttribute('aria-label', `Page ${n} of ${doc.numPages}`)
          host.append(canvas)
          await page.render({ canvas, viewport }).promise
          if (!cancelled) setState({ drawn: n, total: doc.numPages })
        }
      } catch {
        if (!cancelled) setState('failed')
      }
    }
    void draw()
    return () => {
      cancelled = true
      void destroy?.()
    }
  }, [data])

  return (
    <>
      <div ref={box} className="pdf-pages" />
      {state === 'failed' ? (
        <p className="error small" role="alert">
          This PDF couldn’t be drawn here. You can still send it to another app.
        </p>
      ) : state.drawn < state.total || state.total === 0 ? (
        <p className="muted small" role="status">
          Drawing {state.total ? `page ${state.drawn + 1} of ${state.total}` : 'the pages'}…
        </p>
      ) : null}
    </>
  )
}
