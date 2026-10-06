import { describe, expect, it } from 'vitest'
import type { CalendarListEntry } from './calendarApi'
import { argbToCss, hexToArgb, toAppEvent } from './events'

const calendar: CalendarListEntry = { id: 'cal@example.com', summary: 'Family', backgroundColor: '#e53935', accessRole: 'owner' }

describe('Google events', () => {
  it('turns an all-day event with an exclusive end date into an inclusive last day', () => {
    const event = toAppEvent({ id: 'a', summary: 'Half term', start: { date: '2026-10-26' }, end: { date: '2026-10-31' } }, calendar)
    expect(event?.allDay).toBe(true)
    if (event?.allDay) {
      expect(event.startDate.toString()).toBe('2026-10-26')
      expect(event.endDate.toString()).toBe('2026-10-30')
    }
  })

  it('reads timed events as instants, whatever the offset', () => {
    const event = toAppEvent({ id: 'a', start: { dateTime: '2026-10-25T01:30:00+01:00' }, end: { dateTime: '2026-10-25T01:30:00Z' } }, calendar)
    if (event && !event.allDay) {
      // across the clock change: 00:30Z to 01:30Z is one real hour
      expect(event.end.epochMilliseconds - event.start.epochMilliseconds).toBe(3_600_000)
    } else {
      throw new Error('expected a timed event')
    }
  })

  it('uses the event colour, else the calendar colour', () => {
    expect(argbToCss(toAppEvent({ id: 'a', colorId: '11', start: { date: '2026-10-26' }, end: { date: '2026-10-27' } }, calendar)!.color)).toBe('#d50000')
    expect(argbToCss(toAppEvent({ id: 'b', start: { date: '2026-10-26' }, end: { date: '2026-10-27' } }, calendar)!.color)).toBe('#e53935')
  })

  it('keeps the series id, which marks key on', () => {
    expect(toAppEvent({ id: 's_20261005T090000Z', recurringEventId: 's', start: { date: '2026-10-05' }, end: { date: '2026-10-06' } }, calendar)?.seriesId).toBe('s')
  })

  it('round-trips colours as signed ARGB ints, like Android', () => {
    expect(hexToArgb('#e53935')).toBe(0xffe53935 | 0)
    expect(argbToCss(hexToArgb('#0b8043'))).toBe('#0b8043')
  })

  it('skips events with no usable times', () => {
    expect(toAppEvent({ id: 'a', start: {}, end: {} }, calendar)).toBeNull()
  })
})
