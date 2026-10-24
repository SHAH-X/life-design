import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import { photoBlob } from '../../lib/photo'

/** A photo from its data, in a box of its own shape from the start, so nothing moves when it appears. */
export function PhotoView({ data, width, height, className, alt }: { data: string; width: number; height: number; className: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const made = URL.createObjectURL(photoBlob(data))
    setUrl(made)
    return () => URL.revokeObjectURL(made)
  }, [data])
  return (
    <span className={className} style={{ aspectRatio: `${width} / ${height}` }}>
      {url ? <img src={url} alt={alt} /> : null}
    </span>
  )
}

/** A kept photo, by its id. */
export function StoredPhoto({ id, className, alt }: { id: string; className: string; alt: string }) {
  const photo = useLiveQuery(() => db.photos.get(id).then((p) => p ?? null), [id])
  if (!photo) return <span className={className} />
  return <PhotoView data={photo.data} width={photo.width} height={photo.height} className={className} alt={alt} />
}
