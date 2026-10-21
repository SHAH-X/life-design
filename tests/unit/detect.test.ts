import { describe, expect, it } from 'vitest'
import { detectFile } from '../../src/db/backup'

const backup = JSON.stringify({ app: 'life-design', kind: 'backup', schemaVersion: 1, exportedAt: '2026-10-21T12:00:00Z', data: {} })

describe('detectFile', () => {
  it('accepts a backup wrapped in a byte-order mark or whitespace (as some apps save files)', () => {
    expect(detectFile(`﻿  ${backup}\n`).format).toBe('backup')
  })

  it('says exactly what is wrong with a file it cannot use', () => {
    expect(detectFile('')).toEqual({ format: 'unknown', problem: 'empty' })
    expect(detectFile('  \n ')).toEqual({ format: 'unknown', problem: 'empty' })
    expect(detectFile('<!DOCTYPE html><html><body>')).toEqual({ format: 'unknown', problem: 'web-page' })
    expect(detectFile('﻿date,part_of_day,activity,engagement_1_to_5\r\n')).toEqual({ format: 'unknown', problem: 'spreadsheet' })
    expect(detectFile('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toEqual({ format: 'unknown', problem: 'calendar' })
    expect(detectFile('Dear diary, today I…')).toEqual({ format: 'unknown', problem: 'not-json' })
    expect(detectFile('{"app":"life-design","kind":"backup","data":{')).toEqual({ format: 'unknown', problem: 'damaged' })
    expect(detectFile('{"hello":1}')).toEqual({ format: 'unknown', problem: 'other-json' })
    expect(detectFile(JSON.stringify({ app: 'life-design', kind: 'backup', schemaVersion: 1 }))).toEqual({ format: 'unknown', problem: 'damaged' })
    expect(detectFile(JSON.stringify({ app: 'life-design', kind: 'locked-backup', v: 1, data: 'abc' }))).toEqual({
      format: 'unknown',
      problem: 'damaged-lock',
    })
  })
})
