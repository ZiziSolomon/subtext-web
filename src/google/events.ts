import { Temporal } from '@js-temporal/polyfill'
import type { CalEvent } from '../core/types'
import type { AccessToken } from './auth'
import type { CalendarListEntry } from './calendarApi'

const BASE = 'https://www.googleapis.com/calendar/v3'

/** Google's event colour palette (colorId 1–11), as shown in Google Calendar on the web. */
export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
}

/** "#rrggbb" to a signed 32-bit ARGB int, the colour form the context logic shares with Android. */
export function hexToArgb(hex: string): number {
  return (0xff000000 | parseInt(hex.replace('#', ''), 16)) | 0
}

export function argbToCss(argb: number): string {
  return `#${((argb >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`
}

/** The parts of a Google event resource we read. */
export interface GoogleEvent {
  id: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
  summary?: string
  colorId?: string
  start: { date?: string; dateTime?: string; timeZone?: string }
  end: { date?: string; dateTime?: string; timeZone?: string }
  recurringEventId?: string
  htmlLink?: string
  location?: string
  transparency?: 'opaque' | 'transparent'
}

/** A Google event in the context layer's shape, plus what the views need from Google. */
export type AppEvent = CalEvent & { google: GoogleEvent; calendar: CalendarListEntry }

export function toAppEvent(google: GoogleEvent, calendar: CalendarListEntry): AppEvent | null {
  const color = google.colorId ? GOOGLE_EVENT_COLORS[google.colorId] : calendar.backgroundColor
  const base = {
    id: google.id,
    calendarId: calendar.id,
    title: google.summary ?? '',
    color: color ? hexToArgb(color) : 0,
    seriesId: google.recurringEventId,
    google,
    calendar,
  }

  if (google.start.date && google.end.date) {
    // Google's all-day end date is exclusive; ours is the last day
    const startDate = Temporal.PlainDate.from(google.start.date)
    const lastDay = Temporal.PlainDate.from(google.end.date).subtract({ days: 1 })
    const endDate = Temporal.PlainDate.compare(lastDay, startDate) < 0 ? startDate : lastDay
    return { ...base, allDay: true, startDate, endDate }
  }

  if (google.start.dateTime && google.end.dateTime) {
    return { ...base, allDay: false, start: Temporal.Instant.from(google.start.dateTime), end: Temporal.Instant.from(google.end.dateTime) }
  }
  return null
}

/**
 * Every occurrence (repeating events expanded by Google) in [from, to) for one calendar,
 * following pagination. Cancelled occurrences are left out.
 */
export async function listEvents(token: AccessToken, calendar: CalendarListEntry, from: Temporal.Instant, to: Temporal.Instant): Promise<AppEvent[]> {
  const events: AppEvent[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(`${BASE}/calendars/${encodeURIComponent(calendar.id)}/events`)
    url.searchParams.set('timeMin', from.toString())
    url.searchParams.set('timeMax', to.toString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('maxResults', '2500')
    url.searchParams.set('fields', 'nextPageToken,items(id,status,summary,colorId,start,end,recurringEventId,htmlLink,location,transparency)')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } })
    if (response.status === 401) throw new SignedOutError()
    if (!response.ok) throw new Error(`Google Calendar ${response.status} for ${calendar.summary}: ${await response.text()}`)
    const page = (await response.json()) as { items: GoogleEvent[]; nextPageToken?: string }
    for (const item of page.items ?? []) {
      if (item.status === 'cancelled') continue
      const event = toAppEvent(item, calendar)
      if (event) events.push(event)
    }
    pageToken = page.nextPageToken
  } while (pageToken)
  return events
}

/** The access token expired or was revoked; the user has to sign in again. */
export class SignedOutError extends Error {
  constructor() {
    super('Signed out')
  }
}
