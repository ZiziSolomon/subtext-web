import { describe, expect, it } from 'vitest'
import { mergeCalendars, primaryEmail } from './accounts'
import type { CalendarListEntry } from '../google/calendarApi'

const cal = (id: string, accessRole: CalendarListEntry['accessRole'], primary = false): CalendarListEntry => ({ id, summary: id, accessRole, primary })

describe('merging accounts', () => {
  it('keeps every calendar from every account', () => {
    const merged = mergeCalendars([
      { account: 'a@x', calendars: [cal('a@x', 'owner', true)] },
      { account: 'b@x', calendars: [cal('b@x', 'owner', true)] },
    ])
    expect(merged.map((c) => [c.id, c.account])).toEqual([
      ['a@x', 'a@x'],
      ['b@x', 'b@x'],
    ])
  })

  it('shows a calendar subscribed from two accounts once, through the one with more access', () => {
    const merged = mergeCalendars([
      { account: 'a@x', calendars: [cal('family@group', 'reader')] },
      { account: 'b@x', calendars: [cal('family@group', 'writer')] },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].account).toBe('b@x')
  })

  it('keeps the first account on a tie', () => {
    const merged = mergeCalendars([
      { account: 'a@x', calendars: [cal('holidays', 'reader')] },
      { account: 'b@x', calendars: [cal('holidays', 'reader')] },
    ])
    expect(merged[0].account).toBe('a@x')
  })

  it("finds an account's email from its primary calendar", () => {
    expect(primaryEmail([cal('family@group', 'owner'), cal('me@x', 'owner', true)])).toBe('me@x')
  })
})
