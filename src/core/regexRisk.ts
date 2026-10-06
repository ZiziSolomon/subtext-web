/**
 * Port of the phone's RegexRisk: spots regex shapes that can backtrack exponentially, so a rule
 * never runs them. A browser tab can hang just like the phone can. Deliberately conservative
 * (it also flags harmless shapes like (a|b)+). Must give the same answers as the Kotlin
 * version; the conformance test checks it.
 */
export type RegexRiskKind = 'BACKREFERENCE' | 'NESTED_QUANTIFIER' | 'QUANTIFIED_ALTERNATION'

interface Group {
  atomic: boolean
  hasUnboundedQuantifier: boolean
  hasAlternation: boolean
}

export function regexRisk(pattern: string): RegexRiskKind | null {
  const stack: Group[] = []
  let i = 0
  let inClass = false
  // what the previous token was, so a quantifier knows what it applies to
  let lastClosedGroup: Group | null = null

  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '\\') {
      const next = pattern[i + 1]
      if (!inClass && next !== undefined && ((next >= '1' && next <= '9') || next === 'k')) {
        return 'BACKREFERENCE'
      }
      lastClosedGroup = null
      i += 2
      continue
    }

    if (inClass) {
      if (c === ']') inClass = false
    } else if (c === '[') {
      inClass = true
      lastClosedGroup = null
      // a ']' right after '[' or '[^' is a literal, not the end of the class
      if (pattern[i + 1] === '^') i++
      if (pattern[i + 1] === ']') i++
    } else if (c === '(') {
      stack.push({ atomic: pattern.startsWith('(?>', i), hasUnboundedQuantifier: false, hasAlternation: false })
      lastClosedGroup = null
    } else if (c === ')') {
      const closed = stack.pop() ?? { atomic: false, hasUnboundedQuantifier: false, hasAlternation: false }
      // what's inside a group is also inside its parent
      const parent = stack[stack.length - 1]
      if (parent) parent.hasUnboundedQuantifier ||= closed.hasUnboundedQuantifier
      lastClosedGroup = closed
    } else if (c === '|') {
      const top = stack[stack.length - 1]
      if (top) top.hasAlternation = true
      lastClosedGroup = null
    } else if (isUnboundedQuantifier(pattern, i)) {
      const target: Group | null = lastClosedGroup
      if (target && !target.atomic) {
        if (target.hasUnboundedQuantifier) return 'NESTED_QUANTIFIER'
        if (target.hasAlternation) return 'QUANTIFIED_ALTERNATION'
      }
      const top = stack[stack.length - 1]
      if (top) top.hasUnboundedQuantifier = true
      lastClosedGroup = null
      i = endOfQuantifier(pattern, i)
      continue
    } else {
      lastClosedGroup = null
    }
    i++
  }
  return null
}

// + and * always; {n,} with no upper bound. ? and {n,m} are bounded, so they're fine.
function isUnboundedQuantifier(pattern: string, i: number): boolean {
  const c = pattern[i]
  if (c === '+' || c === '*') return true
  if (c === '{') {
    const close = pattern.indexOf('}', i)
    if (close === -1) return false
    return /^\d+,$/.test(pattern.substring(i + 1, close))
  }
  return false
}

function endOfQuantifier(pattern: string, i: number): number {
  let end = pattern[i] === '{' ? pattern.indexOf('}', i) + 1 : i + 1
  // lazy (?) or possessive (+) suffix belongs to the same quantifier
  if (pattern[end] === '?' || pattern[end] === '+') end++
  return end
}
