import { Temporal } from '@js-temporal/polyfill'
import { useMemo } from 'react'
import { barHasEnded, monthBars } from '../../core/layout'
import type { Stripe } from '../../core/types'
import { argbToCss, type AppEvent } from '../../google/events'
import { formatTime, today, zone, type VisibleRange } from '../dates'
import { textOn } from '../colors'

const MINUTES_PER_ROW = 7 * 1440
const MAX_LANES = 3
const MAX_CHIPS = 4

interface Props {
  range: VisibleRange
  month: number
  commitments: AppEvent[]
  stripes: Stripe[]
  contextById: Map<string, AppEvent>
  onOpen: (event: AppEvent) => void
  onOpenDay: (day: Temporal.PlainDate) => void
}

/**
 * Month view: each week row is a time axis running left to right, so a context is a thin bar
 * just under the date numbers at its true times, and a multi-day context is one bar through the
 * week. Commitments are listed in each day, as usual.
 */
export function MonthGrid({ range, month, commitments, stripes, contextById, onOpen, onOpenDay }: Props) {
  const days = Array.from({ length: range.days }, (_, i) => range.firstDay.add({ days: i }))
  const bars = useMemo(() => monthBars(stripes).filter((b) => b.lane < MAX_LANES), [stripes])
  const now = Temporal.Now.zonedDateTimeISO(zone)
  const todayIndex = range.firstDay.until(today(), { largestUnit: 'days' }).days
  const nowIndex = todayIndex < 0 ? -1 : todayIndex >= range.days ? range.days : todayIndex

  const perDay = useMemo(() => {
    const map = new Map<string, AppEvent[]>()
    for (const event of commitments) {
      const first = event.allDay ? event.startDate : event.start.toZonedDateTimeISO(zone).toPlainDate()
      let last = event.allDay ? event.endDate : event.end.toZonedDateTimeISO(zone).toPlainDate()
      if (!event.allDay) {
        const end = event.end.toZonedDateTimeISO(zone)
        if (end.hour === 0 && end.minute === 0 && Temporal.PlainDate.compare(last, first) > 0) last = last.subtract({ days: 1 })
      }
      for (let d = first; Temporal.PlainDate.compare(d, last) <= 0; d = d.add({ days: 1 })) {
        const key = d.toString()
        map.set(key, [...(map.get(key) ?? []), event])
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.allDay || b.allDay ? 0 : Temporal.Instant.compare(a.start, b.start)))
    }
    return map
  }, [commitments])

  return (
    <div className="month-grid">
      <div className="mg-weekdays">
        {days.slice(0, 7).map((d) => (
          <span key={d.dayOfWeek}>{d.toLocaleString(undefined, { weekday: 'short' })}</span>
        ))}
      </div>
      <div className="mg-rows">
        {Array.from({ length: range.days / 7 }, (_, row) => (
          <div key={row} className="mg-row">
            {days.slice(row * 7, row * 7 + 7).map((day) => {
              const list = perDay.get(day.toString()) ?? []
              const isToday = day.equals(today())
              return (
                <div key={day.toString()} className={`mg-cell${day.month === month ? '' : ' is-other-month'}`}>
                  <button className={`mg-date${isToday ? ' is-today' : ''}`} onClick={() => onOpenDay(day)}>
                    {day.day}
                  </button>
                  <div className="mg-events">
                    {list.slice(0, MAX_CHIPS).map((event) => (
                      <button
                        key={`${event.calendarId}/${event.id}`}
                        className={`mg-chip${event.allDay ? ' is-allday' : ''}`}
                        style={event.allDay ? { background: argbToCss(event.color), color: textOn(event.color) } : { ['--dot' as string]: argbToCss(event.color) }}
                        onClick={() => onOpen(event)}
                        title={event.title}
                      >
                        {!event.allDay && <span className="mg-time">{formatTime(event.start)}</span>}
                        {event.title || '(No title)'}
                      </button>
                    ))}
                    {list.length > MAX_CHIPS && (
                      <button className="mg-more" onClick={() => onOpenDay(day)}>
                        +{list.length - MAX_CHIPS} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* context bars for this week row, positioned along the row's time axis */}
            <div className="mg-context-band">
              {bars
                .filter((bar) => bar.row === row)
                .map((bar, i) => {
                  const context = contextById.get(bar.eventId)
                  const ended = barHasEnded(bar, nowIndex, now.hour * 60 + now.minute)
                  return (
                    <div
                      key={i}
                      className={`mg-context-bar${ended ? ' is-past' : ''}`}
                      title={bar.title}
                      style={{
                        left: `${(bar.start / MINUTES_PER_ROW) * 100}%`,
                        width: `max(4px, ${((bar.end - bar.start) / MINUTES_PER_ROW) * 100}%)`,
                        top: bar.lane * 6,
                        background: argbToCss(bar.color),
                      }}
                      onClick={() => context && onOpen(context)}
                    />
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
