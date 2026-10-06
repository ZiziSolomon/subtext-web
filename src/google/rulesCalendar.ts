import { decodeSharedRule, encodeSharedRule, type SharedRule } from '../core/sharedRule'
import type { AccessToken } from './auth'
import { listCalendars, type CalendarListEntry } from './calendarApi'
import { SignedOutError } from './events'

/**
 * The "Subtext rules" calendar: where the phone and the laptop share contextual rules
 * (LAPTOP_PLAN.md, decision 1). One event per rule, the rule's JSON in its description, so
 * Google's own sync carries every change and a conflict can only ever lose one rule's edit.
 * One more event holds settings both sides share (the colour slots).
 */
export const RULES_CALENDAR_NAME = 'Subtext rules'
const BASE = 'https://www.googleapis.com/calendar/v3'

// rule events sit on a fixed, long-past day, marked free, with no reminders: invisible in practice
const RULE_DAY = { start: { date: '2000-01-01' }, end: { date: '2000-01-02' } }

export interface StoredRule {
  rule: SharedRule
  /** The Google event holding it, and its version stamp for conflict-safe updates. */
  eventId: string
  etag: string
}

export interface SharedSettings {
  colorSlots: Record<string, number>
}

interface RulesCalendarContents {
  rules: StoredRule[]
  settings: SharedSettings
  settingsEvent?: { eventId: string; etag: string }
  /** Events in the calendar that aren't rules this app can read (hand-made, damaged). */
  unreadable: number
}

/** The rule's version changed on another device since it was loaded; reload before editing. */
export class ConflictError extends Error {
  constructor() {
    super('This rule was changed on another device. It has been reloaded; please make your change again.')
  }
}

async function call<T>(token: AccessToken, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 401) throw new SignedOutError()
  if (response.status === 412) throw new ConflictError()
  if (!response.ok) throw new Error(`Google Calendar ${response.status}: ${await response.text()}`)
  return (response.status === 204 ? undefined : await response.json()) as T
}

/** The account's own rules calendar, if it has one. */
export function findRulesCalendar(calendars: CalendarListEntry[]): CalendarListEntry | undefined {
  return calendars.find((c) => c.summary === RULES_CALENDAR_NAME && c.accessRole === 'owner')
}

export async function createRulesCalendar(token: AccessToken, timeZone: string): Promise<CalendarListEntry> {
  const created = await call<{ id: string; summary: string }>(token, 'POST', '/calendars', {
    summary: RULES_CALENDAR_NAME,
    description: "Subtext's contextual rules, shared by the phone and laptop apps: one event per rule. Please edit them in Subtext rather than here.",
    timeZone,
  })
  // a new calendar can take a moment to appear in the list; return its entry either way
  const listed = findRulesCalendar(await listCalendars(token))
  return listed ?? { id: created.id, summary: created.summary, accessRole: 'owner' }
}

interface GoogleRuleEvent {
  id: string
  etag: string
  summary?: string
  description?: string
  status?: string
}

export async function loadRulesCalendar(token: AccessToken, calendarId: string): Promise<RulesCalendarContents> {
  const items: GoogleRuleEvent[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ maxResults: '2500', fields: 'nextPageToken,items(id,etag,summary,description,status)' })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await call<{ items?: GoogleRuleEvent[]; nextPageToken?: string }>(token, 'GET', `/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
    items.push(...(page.items ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)

  const contents: RulesCalendarContents = { rules: [], settings: { colorSlots: {} }, unreadable: 0 }
  for (const item of items) {
    if (item.status === 'cancelled') continue
    const settings = decodeSettings(item.description ?? '')
    if (settings) {
      contents.settings = settings
      contents.settingsEvent = { eventId: item.id, etag: item.etag }
      continue
    }
    const rule = decodeSharedRule(item.description ?? '')
    if (rule) contents.rules.push({ rule, eventId: item.id, etag: item.etag })
    else contents.unreadable++
  }
  return contents
}

/** Inserts a new rule, or updates one, refusing if it changed elsewhere since it was loaded. */
export async function saveRule(token: AccessToken, calendarId: string, rule: SharedRule, summary: string, existing?: StoredRule): Promise<StoredRule> {
  const body = { summary, description: encodeSharedRule(rule), transparency: 'transparent', reminders: { useDefault: false, overrides: [] }, ...RULE_DAY }
  const path = `/calendars/${encodeURIComponent(calendarId)}/events`
  const saved = existing
    ? await call<GoogleRuleEvent>(token, 'PUT', `${path}/${encodeURIComponent(existing.eventId)}`, body, { 'If-Match': existing.etag })
    : await call<GoogleRuleEvent>(token, 'POST', path, body)
  return { rule, eventId: saved.id, etag: saved.etag }
}

export async function deleteRule(token: AccessToken, calendarId: string, stored: StoredRule): Promise<void> {
  await call<void>(token, 'DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(stored.eventId)}`, undefined, { 'If-Match': stored.etag })
}

export async function saveSettings(token: AccessToken, calendarId: string, settings: SharedSettings, existing?: { eventId: string; etag: string }) {
  const body = { summary: 'Subtext settings', description: encodeSettings(settings), transparency: 'transparent', reminders: { useDefault: false, overrides: [] }, ...RULE_DAY }
  const path = `/calendars/${encodeURIComponent(calendarId)}/events`
  const saved = existing
    ? await call<GoogleRuleEvent>(token, 'PUT', `${path}/${encodeURIComponent(existing.eventId)}`, body)
    : await call<GoogleRuleEvent>(token, 'POST', path, body)
  return { eventId: saved.id, etag: saved.etag }
}

// --- the shared settings event ---

export function encodeSettings(settings: SharedSettings): string {
  return JSON.stringify({ kind: 'settings', v: 1, colorSlots: settings.colorSlots })
}

export function decodeSettings(text: string): SharedSettings | null {
  try {
    const raw = JSON.parse(text)
    if (raw?.kind !== 'settings' || typeof raw.colorSlots !== 'object' || raw.colorSlots === null) return null
    const colorSlots: Record<string, number> = {}
    for (const [name, slot] of Object.entries(raw.colorSlots)) if (Number.isInteger(slot) && (slot as number) >= 0) colorSlots[name] = slot as number
    return { colorSlots }
  } catch {
    return null
  }
}
