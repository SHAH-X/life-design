import Dexie, { type EntityTable } from 'dexie'
import type { Day, Entry, IkigaiItem, OdysseyPlan, Setting } from './types'

export type LifeDesignDB = Dexie & {
  entries: EntityTable<Entry, 'id'>
  days: EntityTable<Day, 'date'>
  ikigaiItems: EntityTable<IkigaiItem, 'id'>
  odysseyPlans: EntityTable<OdysseyPlan, 'id'>
  settings: EntityTable<Setting, 'key'>
}

export const DB_NAME = 'life-design'

export function openDb(name = DB_NAME): LifeDesignDB {
  const database = new Dexie(name) as LifeDesignDB
  database.version(1).stores({
    entries: 'id, date, createdAt, updatedAt',
    days: 'date, updatedAt',
    ikigaiItems: 'id, updatedAt',
    odysseyPlans: 'id, slot, updatedAt',
    settings: 'key',
  })
  return database
}

/** The app's single on-device database. */
export const db = openDb()
