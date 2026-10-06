import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestAccessToken, type AccessToken } from '../google/auth'
import { listCalendars, type CalendarListEntry } from '../google/calendarApi'
import { listEvents, SignedOutError, type AppEvent } from '../google/events'
import { rangeToInstants, type VisibleRange } from './dates'
import { demoCalendars, demoEvents } from './demo'
import { useStored } from './storage'

export const isDemo = new URLSearchParams(location.search).has('demo')

const TOKEN_KEY = 'subtext.token'

// the token survives a reload for its hour, in this tab only
function storedToken(): AccessToken | null {
  try {
    const token = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as AccessToken | null
    return token && token.expiresAt > Date.now() + 60_000 ? token : null
  } catch {
    return null
  }
}

function storeToken(token: AccessToken | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token))
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage blocked: sign in again after a reload
  }
}

export interface CalendarData {
  signedIn: boolean
  signIn: () => Promise<void>
  signOut: () => void
  calendars: CalendarListEntry[]
  hiddenCalendars: string[]
  toggleCalendar: (id: string) => void
  events: AppEvent[]
  loading: boolean
  error: string | null
}

export function useCalendarData(range: VisibleRange): CalendarData {
  const [token, setToken] = useState<AccessToken | null>(() => (isDemo ? null : storedToken()))
  const [calendars, setCalendars] = useState<CalendarListEntry[]>(isDemo ? demoCalendars : [])
  const [hiddenCalendars, setHiddenCalendars] = useStored<string[]>('subtext.hiddenCalendars', [])
  const [events, setEvents] = useState<AppEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // events per calendar and range, so switching views or weeks back and forth doesn't refetch
  const cache = useRef(new Map<string, AppEvent[]>())

  const signOut = useCallback(() => {
    storeToken(null)
    setToken(null)
    setCalendars([])
    setEvents([])
    cache.current.clear()
  }, [])

  const signIn = useCallback(async () => {
    setError(null)
    try {
      const fresh = await requestAccessToken()
      storeToken(fresh)
      setToken(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (!token) return
    listCalendars(token)
      .then(setCalendars)
      .catch((e) => (e instanceof SignedOutError ? signOut() : setError(String(e))))
  }, [token, signOut])

  const visible = useMemo(() => calendars.filter((c) => !hiddenCalendars.includes(c.id)), [calendars, hiddenCalendars])
  const rangeKey = `${range.firstDay}+${range.days}`

  useEffect(() => {
    if (isDemo) {
      setEvents(demoEvents().filter((e) => visible.some((c) => c.id === e.calendarId)))
      return
    }
    if (!token) return

    let cancelled = false
    const { from, to } = rangeToInstants(range)
    setLoading(true)
    Promise.all(
      visible.map(async (calendar) => {
        const key = `${calendar.id}|${rangeKey}`
        const cached = cache.current.get(key)
        if (cached) return cached
        const fetched = await listEvents(token, calendar, from, to)
        cache.current.set(key, fetched)
        return fetched
      }),
    )
      .then((perCalendar) => {
        if (!cancelled) {
          setEvents(perCalendar.flat())
          setError(null)
        }
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof SignedOutError) signOut()
        else setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // range is captured through rangeKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, visible, rangeKey, signOut])

  const toggleCalendar = useCallback(
    (id: string) => setHiddenCalendars(hiddenCalendars.includes(id) ? hiddenCalendars.filter((h) => h !== id) : [...hiddenCalendars, id]),
    [hiddenCalendars, setHiddenCalendars],
  )

  return { signedIn: isDemo || token !== null, signIn, signOut, calendars, hiddenCalendars, toggleCalendar, events, loading, error }
}
