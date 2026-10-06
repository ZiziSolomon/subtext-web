import { Temporal } from '@js-temporal/polyfill'
import { describe, expect, it } from 'vitest'
import { groupMatches } from './matchGroups'
import type { CalEvent, TimedEvent } from './types'

const at = (iso: string) => Temporal.Instant.from(iso)
const event = (id: string, start: string, end: string, seriesId?: string, title = id, calendarId = 'c'): TimedEvent => ({
  id, calendarId, title, color: 0, allDay: false, start: at(start), end: at(end), seriesId,
})
const startMs = (e: CalEvent) => (e.allDay ? 0 : e.start.epochMilliseconds)
const endMs = (e: CalEvent) => (e.allDay ? 0 : e.end.epochMilliseconds)
const now = at('2026-10-06T12:00:00Z').epochMilliseconds

describe('grouping a rule\'s matches', () => {
  it('folds a repeating series into one line with a count, showing its next occurrence', () => {
    const groups = groupMatches(
      [
        event('s_1', '2026-09-29T09:00:00Z', '2026-09-29T17:00:00Z', 's', 'On call'),
        event('s_2', '2026-10-06T09:00:00Z', '2026-10-06T17:00:00Z', 's', 'On call'),
        event('s_3', '2026-10-13T09:00:00Z', '2026-10-13T17:00:00Z', 's', 'On call'),
      ],
      now, startMs, endMs,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(3)
    expect(groups[0].next.id).toBe('s_2') // still running at noon
  })

  it('lists upcoming groups soonest first, then past ones most recent first', () => {
    const groups = groupMatches(
      [
        event('later', '2026-11-01T09:00:00Z', '2026-11-01T10:00:00Z'),
        event('old', '2026-09-01T09:00:00Z', '2026-09-01T10:00:00Z'),
        event('soon', '2026-10-07T09:00:00Z', '2026-10-07T10:00:00Z'),
        event('recent', '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z'),
      ],
      now, startMs, endMs,
    )
    expect(groups.map((g) => g.key)).toEqual(['c/soon', 'c/later', 'c/recent', 'c/old'])
  })

  it('keeps the same series id in two calendars apart', () => {
    const groups = groupMatches(
      [event('x', '2026-10-07T09:00:00Z', '2026-10-07T10:00:00Z', 's', 'A', 'cal1'), event('y', '2026-10-08T09:00:00Z', '2026-10-08T10:00:00Z', 's', 'A', 'cal2')],
      now, startMs, endMs,
    )
    expect(groups).toHaveLength(2)
  })
})
