import { useLiveQuery } from 'dexie-react-hooks'
import { getOwnWords } from '../../db/repo'
import type { OwnWord } from '../../domain/feelings'

/** Your own feeling words; undefined while loading. */
export function useOwnWords(): OwnWord[] | undefined {
  return useLiveQuery(() => getOwnWords(), [])
}
