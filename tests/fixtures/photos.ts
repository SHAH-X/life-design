import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

// Fictional receipts and notes as photos (step 4, 2026-10-24), rendered in WebKit with their true text: what reading
// photos is tested on (tests/unit/ocrModel.test.ts). Node can't decode images, so this reads the PNGs itself.

export const PHOTO_TRUTH: Record<string, string> = JSON.parse(readFileSync('tests/fixtures/photos/truth.json', 'utf8'))

/** A fixture's pixels: 8-bit RGBA, not interlaced (what WebKit's screenshots are), else it throws. */
export function readPng(name: string): { width: number; height: number; data: Uint8Array } {
  const file = readFileSync(`tests/fixtures/photos/${name}.png`)
  let width = 0
  let height = 0
  const chunks: Buffer[] = []
  for (let at = 8; at < file.length; ) {
    const length = file.readUInt32BE(at)
    const type = file.toString('ascii', at + 4, at + 8)
    const body = file.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error(`${name}.png isn't 8-bit RGBA without interlace`)
    } else if (type === 'IDAT') chunks.push(body)
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * 4
  const data = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? data[y * stride + x - 4]! : 0
      const b = y > 0 ? data[(y - 1) * stride + x]! : 0
      const c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4]! : 0
      const p = a + b - c
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter]
      if (predictor === undefined) throw new Error(`${name}.png has an unknown filter ${filter}`)
      data[y * stride + x] = (line[x]! + predictor) & 0xff
    }
  }
  return { width, height, data }
}
