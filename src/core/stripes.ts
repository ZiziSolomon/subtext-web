import { Temporal } from '@js-temporal/polyfill'
import type { CalEvent, EvaluatedEvent, Stripe } from './types'

export const MINUTES_PER_DAY = 1440
// a zero-length context would otherwise be invisible
export const MIN_STRIPE_MINUTES = 15

/**
 * Port of the phone's ContextualStripeBuilder: slices contexts into one stripe per visible day.
 * All-day and midnight-spanning contexts stay as full-height stripes; a background context is
 * exactly what a full-height stripe is for.
 */
export function buildStripes(
  contexts: EvaluatedEvent[],
  firstDay: Temporal.PlainDate,
  daysCount: number,
  zone: string,
  fallbackColor: number,
  colorFor?: (context: EvaluatedEvent) => number,
): Stripe[] {
  const lastDay = firstDay.add({ days: daysCount - 1 })
  const stripes: Stripe[] = []

  // longest first, so ties in the stable sort below also favour the nested one
  const ordered = [...contexts].sort((a, b) => phoneSpanSeconds(b.event, zone) - phoneSpanSeconds(a.event, zone))
  for (const context of ordered) {
    const { event } = context
    const color = colorFor?.(context) ?? context.keyColor ?? (event.color === 0 ? fallbackColor : event.color)
    // a rule's key name groups differently titled events under one name
    const title = context.keyName?.trim() ? context.keyName : event.title
    const span = daySpan(event, zone)

    let day = Temporal.PlainDate.compare(span.startDay, firstDay) > 0 ? span.startDay : firstDay
    const until = Temporal.PlainDate.compare(span.endDay, lastDay) < 0 ? span.endDay : lastDay
    while (Temporal.PlainDate.compare(day, until) <= 0) {
      const minutes = slice(event, span, day)
      if (minutes) {
        stripes.push({
          dayIndex: firstDay.until(day, { largestUnit: 'days' }).days,
          startMinute: minutes[0],
          endMinute: minutes[1],
          color,
          title,
          eventId: event.id,
          occurrenceStart: event.occurrenceStart ?? startEpochSeconds(event, zone),
          lane: 0,
          laneCount: 1,
        })
      }
      day = day.add({ days: 1 })
    }
  }

  // drawn longest first, so a short context nested in a long one stays visible on top
  return stripes
    .map((stripe, index) => ({ stripe, index }))
    .sort((a, b) => b.stripe.endMinute - b.stripe.startMinute - (a.stripe.endMinute - a.stripe.startMinute) || a.index - b.index)
    .map(({ stripe }) => stripe)
}

interface DaySpan {
  startDay: Temporal.PlainDate
  endDay: Temporal.PlainDate
  startMinute: number
  endMinute: number
}

function daySpan(event: CalEvent, zone: string): DaySpan {
  if (event.allDay) {
    return { startDay: event.startDate, endDay: event.endDate, startMinute: 0, endMinute: MINUTES_PER_DAY }
  }
  const start = event.start.toZonedDateTimeISO(zone)
  const end = event.end.toZonedDateTimeISO(zone)
  return {
    startDay: start.toPlainDate(),
    endDay: end.toPlainDate(),
    startMinute: start.hour * 60 + start.minute,
    endMinute: end.hour * 60 + end.minute,
  }
}

function slice(event: CalEvent, span: DaySpan, day: Temporal.PlainDate): [number, number] | null {
  if (event.allDay) return [0, MINUTES_PER_DAY]

  const startMinute = day.equals(span.startDay) ? span.startMinute : 0
  const endMinute = day.equals(span.endDay) ? span.endMinute : MINUTES_PER_DAY

  // an event ending exactly at midnight shouldn't leave a sliver on the next day
  if (!day.equals(span.startDay) && endMinute === 0) return null

  if (endMinute - startMinute < MIN_STRIPE_MINUTES) {
    const paddedStart = Math.min(startMinute, MINUTES_PER_DAY - MIN_STRIPE_MINUTES)
    return [paddedStart, paddedStart + MIN_STRIPE_MINUTES]
  }
  return [startMinute, endMinute]
}

// whole epoch seconds, as the phone uses; the Temporal spec dropped epochSeconds
export function seconds(value: { epochMilliseconds: number }): number {
  return Math.floor(value.epochMilliseconds / 1000)
}

export function startEpochSeconds(event: CalEvent, zone: string): number {
  return seconds(event.allDay ? event.startDate.toZonedDateTime({ timeZone: zone }) : event.start)
}

/**
 * The event's length as the phone stores it, used only to order stripes identically. Fossify
 * keeps an all-day event as local midnight to *noon* of its last day.
 */
function phoneSpanSeconds(event: CalEvent, zone: string): number {
  if (!event.allDay) return seconds(event.end) - seconds(event.start)
  const start = event.startDate.toZonedDateTime({ timeZone: zone })
  const lastNoon = event.endDate.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from('12:00') })
  return seconds(lastNoon) - seconds(start)
}
