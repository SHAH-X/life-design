// Reading photos (v0.16): the words the model finds, joined into lines. paddleocr's own join (processRecognition)
// takes them in the order found, top first, and starts a line when a word sits more than half a line higher than the
// one before. On a photo turned a little, a receipt's price, at the far right, sits higher than its name, about as
// close to the row above: it was read on a line of its own, or before its name ("7.25" over its dish, "10.40 Chicken
// Burger" on the made-up photo laid out like the owner's, 2026-11-07), and the receipt wasn't taken for one. Here the turn is measured from the long words'
// slant and taken out first, then each line is read left to right, as PaddleOCR's own pipeline sorts its boxes (v0.24.2).

/** How the phone joins a photo's words into lines: 2 takes the photo's turn out (v0.24.2). A photo read before has
 *  none kept, and is read again once (src/db/photoText.ts). */
export const PHOTO_TEXT_VERSION = 2

/** What the model found: a word or a run of words, how sure it is, and where it sits (its four corners, clockwise from
 *  the top left, when known). paddleocr's RecognitionResult. */
export interface FoundText {
  text: string
  confidence: number
  box: { x: number; y: number; width: number; height: number; points?: readonly Point[] }
}
type Point = { x: number; y: number }

/** Below this the model isn't sure of a word: left out, as paddleocr does by default. */
const MIN_CONFIDENCE = 0.5
/** A word this many times as wide as it is tall has a slant worth measuring; a short one's corners come out square. */
const LONG = 3
/** Words whose middles, the turn taken out, are within this share of a line's height are on that line (paddleocr's). */
const SAME_LINE = 0.5

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length

/** The photo's text: a line for each row, its words left to right. */
export function joinLines(found: readonly FoundText[]): string {
  const words = found.filter((w) => w.confidence >= MIN_CONFIDENCE && w.text.trim())
  const turn = slant(words)
  // Where each word's middle would sit with the photo straightened: a word further right on a row turned up sits higher.
  const placed = words
    .map((w) => ({ w, level: w.box.y + w.box.height / 2 - turn * (w.box.x + w.box.width / 2) }))
    .sort((a, b) => a.level - b.level)
  const lines: (typeof placed)[] = []
  for (const p of placed) {
    const line = lines.at(-1)
    const near = line && Math.abs(p.level - mean(line.map((q) => q.level))) <= SAME_LINE * mean(line.map((q) => q.w.box.height))
    if (near) line.push(p)
    else lines.push([p])
  }
  return lines.map((line) => line.sort((a, b) => a.w.box.x - b.w.box.x).map((p) => p.w.text).join(' ')).join('\n')
}

/** The photo's turn, as a slope (down per across): the long words' slant, the middle one by width, so a curled corner
 *  or a stamp at an angle doesn't sway it; 0 with no long words. */
function slant(words: readonly FoundText[]): number {
  const slopes = words
    .flatMap((w) => {
      const p = w.box.points
      if (p?.length !== 4 || w.box.width < LONG * w.box.height) return []
      const [topLeft, topRight, bottomRight, bottomLeft] = p as readonly [Point, Point, Point, Point]
      const across = topRight.x - topLeft.x + (bottomRight.x - bottomLeft.x)
      return across > 0 ? [{ slope: (topRight.y - topLeft.y + (bottomRight.y - bottomLeft.y)) / across, weight: w.box.width }] : []
    })
    .sort((a, b) => a.slope - b.slope)
  let left = slopes.reduce((sum, s) => sum + s.weight, 0) / 2
  for (const s of slopes) if ((left -= s.weight) <= 0) return s.slope
  return 0
}
