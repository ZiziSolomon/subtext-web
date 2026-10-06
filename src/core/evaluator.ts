import { Temporal } from '@js-temporal/polyfill'
import { regexRisk } from './regexRisk'
import { seconds } from './stripes'
import { regexPortabilityProblem } from './regexPortability'
import { containsIgnoreCase } from './text'
import type { CalEvent, EvaluatedEvent, Rule } from './types'

const MINUTES_PER_DAY = 1440

/**
 * Port of the phone's ContextualRuleEvaluator + ContextualDisplay: decides which events are
 * contextual, and the key name and colour each one shows with. The conformance test holds it to
 * the phone's answers.
 */
export class RuleEvaluator {
  private readonly enabled: Rule[]
  private readonly regexes = new Map<Rule, RegExp | null>()
  private readonly hasDisplayOverrides: boolean

  constructor(rules: Rule[]) {
    this.enabled = rules.filter((rule) => rule.enabled)
    for (const rule of this.enabled) {
      if (rule.type === 'title_regex') this.regexes.set(rule, compileOrNull(rule.pattern))
    }
    this.hasDisplayOverrides = this.enabled.some((rule) => (rule.keyName?.trim() ?? '') !== '' || rule.keyColor !== undefined)
  }

  get isEmpty() {
    return this.enabled.length === 0
  }

  isContextual(event: CalEvent): boolean {
    return this.enabled.some((rule) => this.matches(rule, event))
  }

  /** Every enabled rule that makes [event] contextual, in rule order. */
  matchingRules(event: CalEvent): Rule[] {
    return this.enabled.filter((rule) => this.matches(rule, event))
  }

  evaluate<E extends CalEvent>(event: E): EvaluatedEvent<E> {
    const matching = this.matchingRules(event)
    if (matching.length === 0) return { event, contextual: false }
    const display = this.hasDisplayOverrides ? resolveDisplay(matching) : {}
    return { event, contextual: true, ...display }
  }

  private matches(rule: Rule, event: CalEvent): boolean {
    if (rule.calendarId !== undefined && rule.calendarId !== event.calendarId) return false

    switch (rule.type) {
      case 'all':
        return true
      case 'title_contains':
        // a blank pattern would match everything; a half-typed rule shouldn't do that
        return rule.pattern.trim() !== '' && containsIgnoreCase(event.title, rule.pattern)
      case 'title_regex':
        return this.regexes.get(rule)?.test(event.title) ?? false
      case 'duration_over': {
        // same acceptance as Kotlin's toLongOrNull(): optional sign, digits only
        const text = rule.pattern.trim()
        if (!/^[+-]?\d+$/.test(text)) return false
        const threshold = Number(text)
        return threshold >= 0 && durationMinutes(event) > threshold
      }
      case 'event':
        return matchesEvent(rule, event)
    }
  }
}

/**
 * A mark names a Google event id: a one-off event, or a repeating series. It also covers the
 * parts of a series Google split off with "this and following", whose ids are
 * `<id>_R<date>` (LAPTOP_PLAN.md, decision 2).
 */
function matchesEvent(rule: Rule, event: CalEvent): boolean {
  const key = rule.eventId
  if (!key) return false
  const ids = [event.id, event.seriesId].filter((id): id is string => !!id)
  return ids.some((id) => id === key || id.startsWith(`${key}_R`))
}

/**
 * All-day events count as whole days (a one-day event is exactly 24h and doesn't pass a
 * "longer than a day" rule; Fri–Sun is 72h). Timed events use their real length, whole
 * minutes, rounded down.
 */
export function durationMinutes(event: CalEvent): number {
  if (event.allDay) {
    return (event.startDate.until(event.endDate, { largestUnit: 'days' }).days + 1) * MINUTES_PER_DAY
  }
  return Math.trunc((seconds(event.end) - seconds(event.start)) / 60)
}

function compileOrNull(pattern: string): RegExp | null {
  // risky patterns never run (they can hang the tab), and patterns the phone and laptop would
  // read differently are refused on both, so a rule always means the same thing everywhere
  if (pattern.trim() === '' || regexRisk(pattern) !== null || regexPortabilityProblem(pattern) !== null) return null
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return null
  }
}

/** For the editor: a syntax error message, or null if the pattern compiles. */
export function regexError(pattern: string): string | null {
  try {
    new RegExp(pattern)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

// --- display precedence (ContextualDisplay on the phone) ---

/** Lower is more specific. A calendar-scoped rule beats the same kind of rule on every calendar. */
export function specificity(rule: Rule): number {
  const kind = rule.type === 'event' ? 0 : rule.type === 'title_contains' || rule.type === 'title_regex' ? 1 : rule.type === 'duration_over' ? 2 : 3
  return kind * 2 + (rule.calendarId === undefined ? 1 : 0)
}

/** Name and colour from the most specific matching rule that sets each; ties go to rule order. */
export function resolveDisplay(matching: Rule[]): { keyName?: string; keyColor?: number } {
  const ranked = matching
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => specificity(a.rule) - specificity(b.rule) || a.index - b.index)
    .map(({ rule }) => rule)
  const keyName = ranked.map((rule) => rule.keyName?.trim()).find((name) => !!name)
  const keyColor = ranked.find((rule) => rule.keyColor !== undefined)?.keyColor
  return { ...(keyName ? { keyName } : {}), ...(keyColor !== undefined ? { keyColor } : {}) }
}

// re-exported so callers needn't know the polyfill
export { Temporal }
