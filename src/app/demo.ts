import { Temporal } from '@js-temporal/polyfill'
import type { Rule } from '../core/types'
import type { CalendarListEntry } from '../google/calendarApi'
import { hexToArgb, type AppEvent } from '../google/events'
import { startOfWeek, today, zone } from './dates'

/**
 * Made-up calendars, events and rules for ?demo: lets the views be developed, tested and
 * screenshotted without anyone's real calendar. Dates are relative to this week.
 */
export const demoCalendars: CalendarListEntry[] = [
  { id: 'family@demo', summary: 'Family', backgroundColor: '#e53935', accessRole: 'owner', primary: true },
  { id: 'work@demo', summary: 'Work', backgroundColor: '#1e88e5', accessRole: 'owner' },
  { id: 'school@demo', summary: 'School', backgroundColor: '#fb8c00', accessRole: 'reader' },
]

export const demoRules: Rule[] = [
  { type: 'all', pattern: '', calendarId: 'school@demo', enabled: true, keyName: 'School term' },
  { type: 'title_contains', pattern: 'on call', enabled: true },
  { type: 'title_contains', pattern: 'shift', calendarId: 'work@demo', enabled: true, keyName: 'Shifts' },
  { type: 'title_regex', pattern: '^Kids\\b', enabled: true },
]

export function demoEvents(): AppEvent[] {
  const monday = startOfWeek(today())
  const calendar = (id: string) => demoCalendars.find((c) => c.id === id)!
  const at = (day: number, time: string) => monday.add({ days: day }).toPlainDateTime(Temporal.PlainTime.from(time)).toZonedDateTime(zone).toInstant()
  let n = 0

  const timed = (calendarId: string, title: string, day: number, start: string, endDay: number, end: string): AppEvent => {
    const cal = calendar(calendarId)
    return {
      id: `demo-${n++}`, calendarId, title, color: hexToArgb(cal.backgroundColor!), allDay: false,
      start: at(day, start), end: at(endDay, end), calendar: cal, google: { id: `demo-${n}`, summary: title, start: {}, end: {} },
    }
  }
  const allDay = (calendarId: string, title: string, firstDay: number, lastDay: number): AppEvent => {
    const cal = calendar(calendarId)
    return {
      id: `demo-${n++}`, calendarId, title, color: hexToArgb(cal.backgroundColor!), allDay: true,
      startDate: monday.add({ days: firstDay }), endDate: monday.add({ days: lastDay }), calendar: cal,
      google: { id: `demo-${n}`, summary: title, start: {}, end: {} },
    }
  }

  return [
    // contexts
    allDay('school@demo', 'Autumn term', -30, 40),
    timed('work@demo', 'On call', 0, '09:00', 4, '17:00'),
    timed('work@demo', 'Early shift', 1, '06:00', 1, '14:00'),
    timed('work@demo', 'Late shift', 2, '14:00', 2, '22:00'),
    timed('work@demo', 'Night shift', 3, '22:00', 4, '06:00'),
    timed('family@demo', 'Kids weekend', 4, '18:00', 6, '18:00'),
    timed('work@demo', 'Early shift', 8, '06:00', 8, '14:00'),
    timed('work@demo', 'On call', 14, '09:00', 18, '17:00'),
    // commitments
    timed('work@demo', 'Team meeting', 0, '10:00', 0, '11:00'),
    timed('work@demo', '1:1 with Sam', 0, '10:30', 0, '11:00'),
    timed('family@demo', 'Dentist', 2, '09:30', 2, '10:15'),
    timed('family@demo', 'School pickup', 3, '15:15', 3, '15:45'),
    timed('family@demo', 'Dinner with Ada', 4, '19:00', 4, '21:30'),
    timed('family@demo', 'Swimming', 5, '10:00', 5, '11:00'),
    allDay('family@demo', "Grandma's birthday", 6, 6),
    timed('work@demo', 'Planning', 7, '14:00', 7, '15:30'),
    timed('family@demo', 'Parents evening', 9, '18:00', 9, '19:00'),
  ]
}
