import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting, setSetting } from '../../db/repo'

/** Reading the text in photos on this phone (v0.16): on, off, or not asked yet (the writer offers it with the first
 *  photo). The setting stays on this phone, like its download. */
export type PhotoText = 'on' | 'off' | 'unasked'

export function usePhotoText(): PhotoText | undefined {
  return useLiveQuery(async () => {
    const value = await getSetting<unknown>('photoText', null)
    return value === true ? 'on' : value === false ? 'off' : 'unasked'
  }, [])
}

export const setPhotoText = (on: boolean) => setSetting('photoText', on)
