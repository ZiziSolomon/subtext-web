import type { MatchType, Rule } from './types'

/**
 * A contextual rule as stored in the "Subtext rules" Google calendar: one event per rule, this
 * JSON in its description (LAPTOP_PLAN.md, "Rule format v1"). The phone reads and writes the
 * same format (SharedRuleCodec.kt); the conformance fixtures hold the two together.
 *
 * Fields this version doesn't know are kept and written back unchanged, so an older app never
 * erases what a newer one added. A rule from a *newer* format version is still read, but marked
 * read-only, so this app can't damage it.
 */
export interface SharedRule {
  version: number
  uuid: string
  /** ISO instant of the last edit. */
  updated: string
  enabled: boolean
  type: MatchType
  pattern: string
  /** Scoped to one calendar: its Google id, and its name as a hint for people. */
  calendar?: { id: string; name?: string }
  /** For marks: the Google calendar and series (or single) event id, and the title as a hint. */
  event?: { calendarId: string; eventId: string; title?: string }
  keyName?: string
  /** "#rrggbb" in storage; ARGB int in memory, like the rest of the context logic. */
  keyColor?: number
  /** Fields from a newer version of the format, kept as they were. */
  extra: Record<string, unknown>
}

export const FORMAT_VERSION = 1
const MATCH_TYPES: MatchType[] = ['all', 'title_contains', 'title_regex', 'duration_over', 'event']
const KNOWN = new Set(['v', 'uuid', 'updated', 'enabled', 'match', 'calendar', 'event', 'key'])

export function isReadOnly(rule: SharedRule): boolean {
  return rule.version > FORMAT_VERSION
}

export function encodeSharedRule(rule: SharedRule): string {
  const out: Record<string, unknown> = {
    v: Math.max(rule.version, FORMAT_VERSION),
    uuid: rule.uuid,
    updated: rule.updated,
    enabled: rule.enabled,
    match: { type: rule.type, pattern: rule.pattern },
  }
  if (rule.calendar) out.calendar = rule.calendar.name === undefined ? { id: rule.calendar.id } : { id: rule.calendar.id, name: rule.calendar.name }
  if (rule.event) {
    const { calendarId, eventId, title } = rule.event
    out.event = title === undefined ? { calendarId, eventId } : { calendarId, eventId, title }
  }
  if (rule.keyName !== undefined || rule.keyColor !== undefined) {
    const key: Record<string, string> = {}
    if (rule.keyName !== undefined) key.name = rule.keyName
    if (rule.keyColor !== undefined) key.color = argbToHex(rule.keyColor)
    out.key = key
  }
  for (const [name, value] of Object.entries(rule.extra)) if (!(name in out)) out[name] = value
  return JSON.stringify(out)
}

/** Null when the text isn't a usable rule (not JSON, unknown match type, no uuid). */
export function decodeSharedRule(text: string): SharedRule | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(raw)) return null

  const version = typeof raw.v === 'number' && Number.isInteger(raw.v) && raw.v >= 1 ? raw.v : null
  const uuid = typeof raw.uuid === 'string' && raw.uuid.trim() !== '' ? raw.uuid : null
  const match = isObject(raw.match) ? raw.match : null
  const type = match && MATCH_TYPES.includes(match.type as MatchType) ? (match.type as MatchType) : null
  if (version === null || uuid === null || type === null) return null

  const rule: SharedRule = {
    version,
    uuid,
    updated: typeof raw.updated === 'string' ? raw.updated : '1970-01-01T00:00:00Z',
    enabled: raw.enabled !== false,
    type,
    pattern: typeof match!.pattern === 'string' ? match!.pattern : '',
    extra: {},
  }

  if (isObject(raw.calendar) && typeof raw.calendar.id === 'string') {
    rule.calendar = { id: raw.calendar.id, ...(typeof raw.calendar.name === 'string' ? { name: raw.calendar.name } : {}) }
  }
  if (isObject(raw.event) && typeof raw.event.calendarId === 'string' && typeof raw.event.eventId === 'string') {
    rule.event = {
      calendarId: raw.event.calendarId,
      eventId: raw.event.eventId,
      ...(typeof raw.event.title === 'string' ? { title: raw.event.title } : {}),
    }
  }
  // a mark with nothing to point at can't match anything; drop it rather than keep a dead rule
  if (type === 'event' && !rule.event) return null

  if (isObject(raw.key)) {
    if (typeof raw.key.name === 'string') rule.keyName = raw.key.name
    if (typeof raw.key.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.key.color)) rule.keyColor = hexToArgb(raw.key.color)
  }

  for (const [name, value] of Object.entries(raw)) if (!KNOWN.has(name)) rule.extra[name] = value
  return rule
}

/** The rule as the evaluator uses it. */
export function toRule(shared: SharedRule): Rule {
  return {
    type: shared.type,
    pattern: shared.pattern,
    calendarId: shared.calendar?.id ?? (shared.type === 'event' ? shared.event?.calendarId : undefined),
    eventId: shared.event?.eventId,
    enabled: shared.enabled,
    keyName: shared.keyName,
    keyColor: shared.keyColor,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function argbToHex(argb: number): string {
  return `#${((argb >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`
}

function hexToArgb(hex: string): number {
  return (0xff000000 | parseInt(hex.slice(1), 16)) | 0
}
