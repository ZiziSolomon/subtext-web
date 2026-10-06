import type { AccessToken } from './auth'

const BASE = 'https://www.googleapis.com/calendar/v3'

export interface CalendarListEntry {
  id: string
  summary: string
  summaryOverride?: string
  backgroundColor?: string
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner'
  primary?: boolean
}

async function get<T>(token: AccessToken, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(BASE + path)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token.token}` } })
  if (!response.ok) {
    throw new Error(`Google Calendar ${response.status}: ${await response.text()}`)
  }
  return response.json() as Promise<T>
}

/** Every calendar in the signed-in account's list, following pagination. */
export async function listCalendars(token: AccessToken): Promise<CalendarListEntry[]> {
  const calendars: CalendarListEntry[] = []
  let pageToken: string | undefined
  do {
    const page = await get<{ items: CalendarListEntry[]; nextPageToken?: string }>(
      token,
      '/users/me/calendarList',
      pageToken ? { pageToken } : {},
    )
    calendars.push(...page.items)
    pageToken = page.nextPageToken
  } while (pageToken)
  return calendars
}
