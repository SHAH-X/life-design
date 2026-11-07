import { describe, expect, it } from 'vitest'
import { type FoundText, joinLines } from '../../src/lib/ocrLines'

// Joining the words the model finds into lines (v0.24.2), on made-up boxes: a photo turned a little puts a receipt's
// price, at the far right, higher than its name. The real model on a made-up photo: tests/unit/ocrModel.test.ts.

/** A word at (x, y), its top edge sloping by `slope` (down per across), as the model gives it: its four corners, and
 *  the upright box round them. */
function word(text: string, x: number, y: number, width: number, slope = 0, confidence = 0.99): FoundText {
  const height = 30
  const rise = slope * width
  const points = [
    { x, y },
    { x: x + width, y: y + rise },
    { x: x + width, y: y + rise + height },
    { x, y: y + height },
  ]
  const top = Math.min(...points.map((p) => p.y))
  return { text, confidence, box: { x, y: top, width, height: Math.max(...points.map((p) => p.y)) - top, points } }
}

/** As the model hands them over: top first. */
const found = (...words: FoundText[]) => [...words].sort((a, b) => a.box.y - b.box.y)

describe('joinLines', () => {
  it('reads a turned row as one line, name then price, though its price sits higher and is found first', () => {
    // Turned about 2°: 560 px across, the price sits 17 px higher than its name, rows 36 px apart.
    const turn = -0.03
    const words = found(
      word('No Allergy Declared', 0, 0, 320, turn),
      word('0.00', 560, -17, 70),
      word('Halloumi Wrap', 0, 36, 200, turn),
      word('7.25', 560, 19, 70),
      word('Extra Hot', 30, 72, 150, turn),
      word('Chicken Burger', 0, 108, 230, turn),
      word('10.40', 545, 91, 85),
    )
    expect(joinLines(words)).toBe('No Allergy Declared 0.00\nHalloumi Wrap 7.25\nExtra Hot\nChicken Burger 10.40')
  })

  it('keeps rows apart on a straight photo', () => {
    expect(joinLines(found(word('Oat milk', 0, 0, 150), word('1.45', 500, 0, 70), word('Bananas', 0, 36, 140), word('0.95', 500, 36, 70)))).toBe('Oat milk 1.45\nBananas 0.95')
  })

  it('with no long words to measure the turn by, reads each line left to right all the same', () => {
    const short = (w: FoundText): FoundText => ({ ...w, box: { ...w.box, points: undefined } })
    expect(joinLines([short(word('3.20', 500, 0, 70)), short(word('Bread', 0, 4, 90))])).toBe('Bread 3.20')
  })

  it("leaves out what the model isn't sure of, as paddleocr does", () => {
    expect(joinLines(found(word('TOTAL', 0, 0, 120), word('#@~', 300, 0, 60, 0, 0.3), word('14.20', 500, 0, 85)))).toBe('TOTAL 14.20')
    expect(joinLines([])).toBe('')
  })
})
