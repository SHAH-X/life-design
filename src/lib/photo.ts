// Photos (v0.16): shrunk on the phone as they're added, so each is about 300 KB: sharp enough to read a receipt,
// light on the phone and in a backup (owner's choice). Kept as base64 JPEG (src/db/types.ts, Photo).

/** The longest side a photo is kept at. */
export const PHOTO_MAX_SIDE = 2000
const JPEG_QUALITY = 0.8

export class PhotoError extends Error {
  constructor() {
    super("This photo couldn't be opened. Try another one, or take it again with the camera.")
  }
}

/** A size that fits within `max` on its longest side, keeping its shape (never larger than it was). */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(data: string): Uint8Array {
  const s = atob(data)
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  return bytes
}

/** A photo as the phone keeps it: a JPEG no larger than PHOTO_MAX_SIDE, base64, turned the right way up. */
export async function shrinkPhoto(file: Blob): Promise<{ data: string; width: number; height: number }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new PhotoError()
  }
  const size = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new PhotoError()
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new PhotoError()
  return { data: toBase64(new Uint8Array(await blob.arrayBuffer())), ...size }
}

/** A kept photo as something an <img> can show (revoke the URL when done). */
export const photoBlob = (data: string) => new Blob([fromBase64(data) as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })
