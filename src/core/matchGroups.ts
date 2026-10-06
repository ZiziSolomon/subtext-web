import type { CalEvent } from './types'

/**
 * The rule editor's "all matching events" list, for a laptop's room: matches grouped by
 * repeating series (a weekly "On call" is one line with a count, not fifty), soonest first.
 * Pure, so it's unit tested.
 */
export interface MatchGroup<E extends CalEvent = CalEvent> {
  key: string
  title: string
  /** The first matching occurrence that hasn't ended yet, else the last one. */
  next: E
  count: number
  calendarId: string
}

export function groupMatches<E extends CalEvent>(matches: E[], nowMs: number, startMs: (e: E) => number, endMs: (e: E) => number): MatchGroup<E>[] {
  const groups = new Map<string, E[]>()
  for (const event of matches) {
    const key = `${event.calendarId}/${event.seriesId ?? event.id}`
    const list = groups.get(key) ?? []
    list.push(event)
    groups.set(key, list)
  }

  const result: MatchGroup<E>[] = []
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => startMs(a) - startMs(b))
    const next = sorted.find((e) => endMs(e) > nowMs) ?? sorted[sorted.length - 1]
    result.push({ key, title: next.title, next, count: list.length, calendarId: next.calendarId })
  }
  // upcoming groups first, soonest first; groups that are all in the past last, most recent first
  return result.sort((a, b) => {
    const aPast = endMs(a.next) <= nowMs
    const bPast = endMs(b.next) <= nowMs
    if (aPast !== bPast) return aPast ? 1 : -1
    return aPast ? startMs(b.next) - startMs(a.next) : startMs(a.next) - startMs(b.next)
  })
}
