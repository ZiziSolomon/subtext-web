import type { AccessToken } from '../google/auth'
import type { CalendarListEntry } from '../google/calendarApi'

/** A signed-in Google account. The email is its primary calendar's id. */
export interface Account {
  email: string
  token: AccessToken
}

/** A calendar, with the account whose token reads it. */
export type AccountCalendar = CalendarListEntry & { account: string }

const ROLE_RANK = { owner: 3, writer: 2, reader: 1, freeBusyReader: 0 } as const

/**
 * Merges the accounts' calendar lists. A calendar subscribed from two accounts (a shared family
 * calendar, a holiday calendar) appears once, read through the account with the most access to
 * it, so its events aren't shown twice. Pure, so it's unit tested.
 */
export function mergeCalendars(perAccount: { account: string; calendars: CalendarListEntry[] }[]): AccountCalendar[] {
  const byId = new Map<string, AccountCalendar>()
  for (const { account, calendars } of perAccount) {
    for (const calendar of calendars) {
      const existing = byId.get(calendar.id)
      if (!existing || ROLE_RANK[calendar.accessRole] > ROLE_RANK[existing.accessRole]) {
        byId.set(calendar.id, { ...calendar, account })
      }
    }
  }
  return [...byId.values()]
}

export function primaryEmail(calendars: CalendarListEntry[]): string | undefined {
  return calendars.find((c) => c.primary)?.id
}
