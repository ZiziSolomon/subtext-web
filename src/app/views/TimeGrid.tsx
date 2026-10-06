import { Temporal } from '@js-temporal/polyfill'
import { useEffect, useMemo, useRef, useState } from 'react'
import { layoutAllDayBars, layoutTimedBlocks } from '../../core/timeGrid'
import type { Stripe } from '../../core/types'
import { argbToCss, type AppEvent } from '../../google/events'
import { formatTime, minuteLabel, today, zone, type VisibleRange } from '../dates'
import { textOn, tint } from '../colors'

const HOUR_HEIGHT = 48
const MINUTES_PER_DAY = 1440
const px = (minute: number) => (minute / 60) * HOUR_HEIGHT

interface Props {
  range: VisibleRange
  commitments: AppEvent[]
  stripes: Stripe[]
  contextById: Map<string, AppEvent>
  /** While a rule is being edited: the events it would catch, to outline. */
  highlight?: (event: AppEvent) => boolean
  onOpen: (event: AppEvent) => void
}

/** Day and week view: hours down the side, days across, contexts as tinted lanes behind the events. */
export function TimeGrid({ range, commitments, stripes, contextById, highlight, onOpen }: Props) {
  const { firstDay, days } = range
  const blocks = useMemo(() => layoutTimedBlocks(commitments, firstDay, days, zone), [commitments, firstDay, days])
  const bars = useMemo(() => layoutAllDayBars(commitments, firstDay, days, zone), [commitments, firstDay, days])
  const allDayRows = bars.reduce((max, bar) => Math.max(max, bar.row + 1), 0)
  const dayList = Array.from({ length: days }, (_, i) => firstDay.add({ days: i }))
  const todayIndex = dayList.findIndex((d) => d.equals(today()))
  const columnPercent = 100 / days

  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // start the day around 07:00, like the phone's default
    body.current?.scrollTo({ top: px(7 * 60) })
  }, [])

  return (
    <div className="time-grid" style={{ ['--days' as string]: days }}>
      <div className="tg-head">
        <div className="tg-gutter" />
        {dayList.map((day, i) => (
          <div key={day.toString()} className={`tg-day-head${i === todayIndex ? ' is-today' : ''}`}>
            <span className="tg-weekday">{day.toLocaleString(undefined, { weekday: 'short' })}</span>
            <span className="tg-date">{day.day}</span>
          </div>
        ))}
      </div>

      <div className="tg-allday" style={{ height: Math.max(1, allDayRows) * 24 + 6 }}>
        <div className="tg-gutter" />
        <div className="tg-allday-area">
          {bars.map((bar) => (
            <button
              key={`${bar.event.calendarId}/${bar.event.id}`}
              className={`tg-allday-bar event-chip${highlight?.(bar.event as AppEvent) ? ' is-highlighted' : ''}`}
              style={{
                left: `calc(${bar.firstDay * columnPercent}% + 2px)`,
                width: `calc(${(bar.lastDay - bar.firstDay + 1) * columnPercent}% - 4px)`,
                top: bar.row * 24 + 3,
                background: argbToCss(bar.event.color),
                color: textOn(bar.event.color),
              }}
              onClick={() => onOpen(bar.event as AppEvent)}
            >
              {bar.event.title || '(No title)'}
            </button>
          ))}
        </div>
      </div>

      <div className="tg-body" ref={body}>
        <div className="tg-hours" style={{ height: px(MINUTES_PER_DAY) }}>
          {Array.from({ length: 23 }, (_, h) => (
            <span key={h} className="tg-hour" style={{ top: px((h + 1) * 60) }}>
              {minuteLabel((h + 1) * 60)}
            </span>
          ))}
        </div>
        <div className="tg-columns" style={{ height: px(MINUTES_PER_DAY), ['--hour' as string]: `${HOUR_HEIGHT}px` }}>
          {dayList.map((day, i) => (
            <div key={day.toString()} className="tg-column-line" style={{ left: `${i * columnPercent}%` }} />
          ))}

          {/* contexts: untitled background lanes; the name is in the key and on hover */}
          {stripes.map((stripe, i) => {
            const context = contextById.get(stripe.eventId)
            const lanePercent = columnPercent / stripe.laneCount
            return (
              <div
                key={`s${i}`}
                className={`tg-stripe${context && highlight?.(context) ? ' is-highlighted' : ''}`}
                title={`${stripe.title}\n${minuteLabel(stripe.startMinute)} – ${minuteLabel(stripe.endMinute)}`}
                style={{
                  left: `calc(${stripe.dayIndex * columnPercent + stripe.lane * lanePercent}% + 2px)`,
                  width: `calc(${lanePercent}% - 4px)`,
                  top: px(stripe.startMinute),
                  height: px(stripe.endMinute - stripe.startMinute),
                  background: tint(stripe.color),
                  borderColor: argbToCss(stripe.color),
                }}
                onClick={() => context && onOpen(context)}
              />
            )
          })}

          {blocks.map((block) => {
            const lanePercent = columnPercent / block.laneCount
            const event = block.event as AppEvent
            const short = block.endMinute - block.startMinute < 45
            return (
              <button
                key={`${event.calendarId}/${event.id}/${block.dayIndex}`}
                className={`tg-event event-chip${short ? ' is-short' : ''}${highlight?.(event) ? ' is-highlighted' : ''}`}
                style={{
                  left: `calc(${block.dayIndex * columnPercent + block.lane * lanePercent}% + 4px)`,
                  width: `calc(${lanePercent}% - 8px)`,
                  top: px(block.startMinute) + 1,
                  height: px(block.endMinute - block.startMinute) - 2,
                  background: argbToCss(event.color),
                  color: textOn(event.color),
                }}
                onClick={() => onOpen(event)}
              >
                <span className="tg-event-title">{event.title || '(No title)'}</span>
                {!event.allDay && !short && <span className="tg-event-time">{formatTime(event.start)} – {formatTime(event.end)}</span>}
              </button>
            )
          })}

          {todayIndex !== -1 && <NowLine left={todayIndex * columnPercent} width={columnPercent} />}
        </div>
      </div>
    </div>
  )
}

function NowLine({ left, width }: { left: number; width: number }) {
  const [minute, setMinute] = useState(() => Temporal.Now.zonedDateTimeISO(zone).hour * 60 + Temporal.Now.zonedDateTimeISO(zone).minute)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Temporal.Now.zonedDateTimeISO(zone)
      setMinute(now.hour * 60 + now.minute)
    }, 60_000)
    return () => clearInterval(timer)
  }, [])
  return <div className="tg-now" style={{ left: `${left}%`, width: `${width}%`, top: px(minute) }} />
}
