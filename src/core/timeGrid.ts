import { Temporal } from '@js-temporal/polyfill'
import { assignLanes } from './layout'
import { MINUTES_PER_DAY } from './stripes'
import type { CalEvent } from './types'

/**
 * Lays out the commitments (non-contextual events) for the day/week time grid. Pure, so it's
 * unit tested.
 *
 * As on the phone, events that are all-day, or that run 24 hours or more, go in the all-day row
 * at the top. Shorter timed events become one block per day they touch (an event crossing
 * midnight is two blocks). Overlapping blocks in a day share its width side by side, with the
 * same lane rule the contexts use.
 */
export interface TimedBlock {
  event: CalEvent
  dayIndex: number
  startMinute: number
  endMinute: number
  lane: number
  laneCount: number
}

export interface AllDayBar {
  event: CalEvent
  /** First and last visible column it covers, inclusive. */
  firstDay: number
  lastDay: number
  /** Row within the all-day area, so overlapping bars stack. */
  row: number
}

// a very short event still needs to be tappable
export const MIN_BLOCK_MINUTES = 20

export function isAllDayRowEvent(event: CalEvent): boolean {
  return event.allDay || event.end.epochMilliseconds - event.start.epochMilliseconds >= MINUTES_PER_DAY * 60_000
}

export function layoutTimedBlocks(events: CalEvent[], firstDay: Temporal.PlainDate, daysCount: number, zone: string): TimedBlock[] {
  const lastDay = firstDay.add({ days: daysCount - 1 })
  const blocks: Omit<TimedBlock, 'lane' | 'laneCount'>[] = []

  for (const event of events) {
    if (isAllDayRowEvent(event) || event.allDay) continue
    const start = event.start.toZonedDateTimeISO(zone)
    const end = event.end.toZonedDateTimeISO(zone)
    const startDay = start.toPlainDate()
    const endDay = end.toPlainDate()

    let day = Temporal.PlainDate.compare(startDay, firstDay) > 0 ? startDay : firstDay
    const until = Temporal.PlainDate.compare(endDay, lastDay) < 0 ? endDay : lastDay
    while (Temporal.PlainDate.compare(day, until) <= 0) {
      const startMinute = day.equals(startDay) ? start.hour * 60 + start.minute : 0
      const endMinute = day.equals(endDay) ? end.hour * 60 + end.minute : MINUTES_PER_DAY
      // ending exactly at midnight leaves nothing on the next day
      if (!(endMinute === 0 && !day.equals(startDay))) {
        const paddedEnd = Math.min(MINUTES_PER_DAY, Math.max(endMinute, startMinute + MIN_BLOCK_MINUTES))
        blocks.push({
          event,
          dayIndex: firstDay.until(day, { largestUnit: 'days' }).days,
          startMinute: Math.min(startMinute, MINUTES_PER_DAY - MIN_BLOCK_MINUTES),
          endMinute: paddedEnd,
        })
      }
      day = day.add({ days: 1 })
    }
  }

  const placements = assignLanes(blocks.map((b) => ({ group: b.dayIndex, start: b.startMinute, end: b.endMinute })))
  return blocks.map((block, i) => ({ ...block, ...placements[i] }))
}

export function layoutAllDayBars(events: CalEvent[], firstDay: Temporal.PlainDate, daysCount: number, zone: string): AllDayBar[] {
  const lastIndex = daysCount - 1
  const spans: { event: CalEvent; firstDay: number; lastDay: number }[] = []

  for (const event of events) {
    if (!isAllDayRowEvent(event)) continue
    let startDate: Temporal.PlainDate
    let endDate: Temporal.PlainDate
    if (event.allDay) {
      startDate = event.startDate
      endDate = event.endDate
    } else {
      startDate = event.start.toZonedDateTimeISO(zone).toPlainDate()
      const end = event.end.toZonedDateTimeISO(zone)
      // a timed event ending at midnight doesn't cover that last day
      endDate = end.hour === 0 && end.minute === 0 ? end.toPlainDate().subtract({ days: 1 }) : end.toPlainDate()
    }
    const first = Math.max(0, firstDay.until(startDate, { largestUnit: 'days' }).days)
    const last = Math.min(lastIndex, firstDay.until(endDate, { largestUnit: 'days' }).days)
    if (first > lastIndex || last < 0 || last < first) continue
    spans.push({ event, firstDay: first, lastDay: last })
  }

  // longest first, then earliest, so long bars sit on top and rows pack tightly
  spans.sort((a, b) => b.lastDay - b.firstDay - (a.lastDay - a.firstDay) || a.firstDay - b.firstDay)
  const rowEnds: number[] = []
  return spans.map((span) => {
    let row = rowEnds.findIndex((end) => end < span.firstDay)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(span.lastDay)
    } else {
      rowEnds[row] = span.lastDay
    }
    return { ...span, row }
  })
}
