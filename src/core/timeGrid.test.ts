import { Temporal } from '@js-temporal/polyfill'
import { describe, expect, it } from 'vitest'
import { layoutAllDayBars, layoutTimedBlocks } from './timeGrid'
import type { CalEvent } from './types'

const zone = 'Europe/London'
const monday = Temporal.PlainDate.from('2026-10-05')

function timed(id: string, start: string, end: string): CalEvent {
  const at = (s: string) => Temporal.PlainDateTime.from(s).toZonedDateTime(zone).toInstant()
  return { id, calendarId: 'c', title: id, color: 0, allDay: false, start: at(start), end: at(end) }
}

function allDay(id: string, first: string, last: string): CalEvent {
  return { id, calendarId: 'c', title: id, color: 0, allDay: true, startDate: Temporal.PlainDate.from(first), endDate: Temporal.PlainDate.from(last) }
}

const blocksOf = (events: CalEvent[]) =>
  layoutTimedBlocks(events, monday, 7, zone).map((b) => [b.event.id, b.dayIndex, b.startMinute, b.endMinute, b.lane, b.laneCount])

describe('timed blocks', () => {
  it('places an event in its day at its times', () => {
    expect(blocksOf([timed('a', '2026-10-06T09:00', '2026-10-06T10:30')])).toEqual([['a', 1, 540, 630, 0, 1]])
  })

  it('splits an event crossing midnight into two blocks', () => {
    expect(blocksOf([timed('a', '2026-10-06T22:00', '2026-10-07T02:00')])).toEqual([
      ['a', 1, 1320, 1440, 0, 1],
      ['a', 2, 0, 120, 0, 1],
    ])
  })

  it('leaves no sliver for an event ending exactly at midnight', () => {
    expect(blocksOf([timed('a', '2026-10-06T22:00', '2026-10-07T00:00')])).toEqual([['a', 1, 1320, 1440, 0, 1]])
  })

  it('puts overlapping events side by side', () => {
    expect(blocksOf([timed('a', '2026-10-06T09:00', '2026-10-06T11:00'), timed('b', '2026-10-06T10:00', '2026-10-06T12:00')])).toEqual([
      ['a', 1, 540, 660, 0, 2],
      ['b', 1, 600, 720, 1, 2],
    ])
  })

  it('gives a zero-length event a tappable minimum height', () => {
    expect(blocksOf([timed('a', '2026-10-06T09:00', '2026-10-06T09:00')])).toEqual([['a', 1, 540, 560, 0, 1]])
  })

  it('keeps all-day and 24h+ events out of the grid', () => {
    expect(blocksOf([allDay('a', '2026-10-06', '2026-10-06'), timed('b', '2026-10-06T09:00', '2026-10-07T09:00')])).toEqual([])
  })

  it('drops days outside the visible week', () => {
    expect(blocksOf([timed('a', '2026-10-11T23:00', '2026-10-12T01:00')])).toEqual([['a', 6, 1380, 1440, 0, 1]])
  })
})

describe('all-day bars', () => {
  const barsOf = (events: CalEvent[]) => layoutAllDayBars(events, monday, 7, zone).map((b) => [b.event.id, b.firstDay, b.lastDay, b.row])

  it('covers inclusive days and clips to the week', () => {
    expect(barsOf([allDay('a', '2026-10-01', '2026-10-06')])).toEqual([['a', 0, 1, 0]])
  })

  it('stacks overlapping bars in rows, longest first', () => {
    expect(barsOf([allDay('short', '2026-10-06', '2026-10-06'), allDay('long', '2026-10-05', '2026-10-09')])).toEqual([
      ['long', 0, 4, 0],
      ['short', 1, 1, 1],
    ])
  })

  it('reuses a row once the bar in it has ended', () => {
    expect(barsOf([allDay('a', '2026-10-05', '2026-10-06'), allDay('b', '2026-10-08', '2026-10-09')])).toEqual([
      ['a', 0, 1, 0],
      ['b', 3, 4, 0],
    ])
  })

  it('shows a 24h+ timed event across the days it covers, not the day it ends at midnight', () => {
    expect(barsOf([timed('a', '2026-10-06T00:00', '2026-10-08T00:00')])).toEqual([['a', 1, 2, 0]])
  })
})
