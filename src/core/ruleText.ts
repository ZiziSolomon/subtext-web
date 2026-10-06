import type { Rule } from './types'

/** A rule in a few words, as the phone's rules list shows it. */
export function describeRule(rule: Pick<Rule, 'type' | 'pattern'>, eventTitle?: string): string {
  switch (rule.type) {
    case 'all':
      return 'All events'
    case 'title_contains':
      return `Title contains “${rule.pattern}”`
    case 'title_regex':
      return `Title matches /${rule.pattern}/`
    case 'duration_over': {
      const minutes = Number(rule.pattern)
      if (!Number.isFinite(minutes)) return 'Longer than…'
      if (minutes % 1440 === 0) return `Longer than ${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
      return `Longer than ${+(minutes / 60).toFixed(2)} hours`
    }
    case 'event':
      return `Event: ${eventTitle ?? 'one event'}`
  }
}
