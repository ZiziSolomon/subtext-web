import { Temporal } from '@js-temporal/polyfill'

export type ViewKind = 'day' | 'week' | 'month'

export const zone = Temporal.Now.timeZoneId()

export function today(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(zone)
}

/** Monday on or before [date]. (A week-start setting can come later; the UK default is Monday.) */
export function startOfWeek(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.subtract({ days: date.dayOfWeek - 1 })
}

/** The six-week month grid: Monday on or before the 1st, 42 days. */
export function monthGridStart(date: Temporal.PlainDate): Temporal.PlainDate {
  return startOfWeek(date.with({ day: 1 }))
}

export interface VisibleRange {
  firstDay: Temporal.PlainDate
  days: number
}

export function visibleRange(view: ViewKind, anchor: Temporal.PlainDate, weekDays: number): VisibleRange {
  switch (view) {
    case 'day':
      return { firstDay: anchor, days: 1 }
    case 'week':
      // a 7-day week starts on Monday; other lengths start on the anchor, like the phone's slider
      return { firstDay: weekDays === 7 ? startOfWeek(anchor) : anchor, days: weekDays }
    case 'month':
      return { firstDay: monthGridStart(anchor), days: 42 }
  }
}

export function step(view: ViewKind, anchor: Temporal.PlainDate, direction: 1 | -1, weekDays: number): Temporal.PlainDate {
  switch (view) {
    case 'day':
      return anchor.add({ days: direction })
    case 'week':
      return anchor.add({ days: direction * weekDays })
    case 'month':
      return anchor.with({ day: 1 }).add({ months: direction })
  }
}

export function rangeToInstants(range: VisibleRange): { from: Temporal.Instant; to: Temporal.Instant } {
  return {
    from: range.firstDay.toZonedDateTime({ timeZone: zone }).toInstant(),
    to: range.firstDay.add({ days: range.days }).toZonedDateTime({ timeZone: zone }).toInstant(),
  }
}

const locale = undefined // the browser's own

export function formatTitle(view: ViewKind, anchor: Temporal.PlainDate, range: VisibleRange): string {
  if (view === 'month') return anchor.toLocaleString(locale, { month: 'long', year: 'numeric' })
  if (view === 'day') return anchor.toLocaleString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const last = range.firstDay.add({ days: range.days - 1 })
  const sameMonth = last.month === range.firstDay.month
  const first = range.firstDay.toLocaleString(locale, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  return `${first} – ${last.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

export function formatTime(instant: Temporal.Instant): string {
  return instant.toZonedDateTimeISO(zone).toPlainTime().toLocaleString(locale, { hour: 'numeric', minute: '2-digit' })
}

export function minuteLabel(minute: number): string {
  return Temporal.PlainTime.from({ hour: Math.floor(minute / 60) % 24, minute: minute % 60 }).toLocaleString(locale, { hour: 'numeric', minute: '2-digit' })
}
