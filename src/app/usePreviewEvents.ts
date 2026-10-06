import { Temporal } from '@js-temporal/polyfill'
import { useEffect, useState } from 'react'
import { listEvents, type AppEvent } from '../google/events'
import { today, zone } from './dates'
import { demoEvents } from './demo'
import type { CalendarData } from './useCalendarData'
import { isDemo } from './useCalendarData'

export const PREVIEW_MONTHS_BACK = 1
export const PREVIEW_MONTHS_AHEAD = 12

/**
 * Every event from a month back to a year ahead, in every calendar (hidden ones too: a rule can
 * target a calendar that isn't shown). The rule editor runs a draft rule over these to list all
 * its matches. Loaded once, when the rules panel first opens.
 */
export function usePreviewEvents(data: CalendarData, active: boolean): { events: AppEvent[]; loading: boolean } {
  const [events, setEvents] = useState<AppEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedFor, setLoadedFor] = useState('')
  const accountsKey = data.accounts.map((a) => a.email).join(',')
  const calendarsKey = data.calendars.map((c) => c.id).join(',')

  useEffect(() => {
    if (!active) return
    if (isDemo) {
      setEvents(demoEvents())
      return
    }
    const key = `${accountsKey}|${calendarsKey}`
    if (key === loadedFor) return
    const from = today().subtract({ months: PREVIEW_MONTHS_BACK }).toZonedDateTime({ timeZone: zone }).toInstant()
    const to = today().add({ months: PREVIEW_MONTHS_AHEAD }).toZonedDateTime({ timeZone: zone }).toInstant()
    let cancelled = false
    setLoading(true)
    Promise.all(
      data.calendars.map((calendar) => {
        const token = data.accounts.find((a) => a.email === calendar.account)?.token
        return token ? listEvents(token, calendar, from, to).catch(() => [] as AppEvent[]) : Promise.resolve([] as AppEvent[])
      }),
    )
      .then((perCalendar) => {
        if (cancelled) return
        setEvents(perCalendar.flat().sort((a, b) => startOf(a) - startOf(b)))
        setLoadedFor(key)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // the keys stand in for the lists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, accountsKey, calendarsKey])

  return { events, loading }
}

export function startOf(event: AppEvent): number {
  return event.allDay ? event.startDate.toZonedDateTime({ timeZone: zone }).epochMilliseconds : event.start.epochMilliseconds
}

export { Temporal }
