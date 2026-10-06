import type { Temporal } from '@js-temporal/polyfill'

/**
 * The context layer's own event shape, independent of where events come from (Google's API,
 * or test fixtures). Colours are 32-bit ARGB ints, as on Android, so values compare exactly
 * with the phone's.
 */
export type CalEvent = TimedEvent | AllDayEvent

interface EventBase {
  id: string
  calendarId: string
  title: string
  color: number
  /** The repeating series this is an occurrence of (Google's recurringEventId), if any. */
  seriesId?: string
  /** Where tapping the context opens: this occurrence's start, epoch seconds. */
  occurrenceStart?: number
}

export interface TimedEvent extends EventBase {
  allDay: false
  start: Temporal.Instant
  end: Temporal.Instant
}

export interface AllDayEvent extends EventBase {
  allDay: true
  /** First day. */
  startDate: Temporal.PlainDate
  /** Last day, inclusive (Google's end.date is exclusive; convert before building one). */
  endDate: Temporal.PlainDate
}

export type MatchType = 'all' | 'title_contains' | 'title_regex' | 'duration_over' | 'event'

export interface Rule {
  type: MatchType
  /** Substring, regex, or minimum duration in minutes, depending on type. */
  pattern: string
  /** Google calendar id; undefined = every calendar. */
  calendarId?: string
  /** For type 'event': the Google series (or single) event id. */
  eventId?: string
  enabled: boolean
  keyName?: string
  keyColor?: number
}

/** An event after the rules have run, ready for the views. */
export interface EvaluatedEvent<E extends CalEvent = CalEvent> {
  event: E
  contextual: boolean
  keyName?: string
  keyColor?: number
}

/** One context's slice of one day column; minutes 0..1440 from that day's start. */
export interface Stripe {
  dayIndex: number
  startMinute: number
  endMinute: number
  color: number
  title: string
  eventId: string
  occurrenceStart: number
  lane: number
  laneCount: number
}
