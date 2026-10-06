/**
 * A rule's regex runs on Java's engine on the phone and on the browser's RegExp here. Most
 * syntax means the same on both, but some is Java-only (or reads differently), and a rule must
 * never match one set of events on the phone and another on the laptop. Patterns using those
 * constructs are refused on **both** sides, with a message saying why. The phone has the same
 * check (RegexPortability.kt), and the conformance fixtures hold the two together.
 *
 * Known gap, documented rather than refused: on Android, \w, \b and \d also count accented
 * letters and non-ASCII digits, while the browser counts only ASCII. That only matters for titles
 * with such characters.
 */
export type PortabilityProblem =
  | 'ATOMIC_GROUP' // (?>…): Java only
  | 'POSSESSIVE_QUANTIFIER' // a*+ a++ a?+ a{2}+: Java only
  | 'INLINE_FLAGS' // (?i) (?x)…: Java only
  | 'CLASS_SET_OPERATION' // [a[b]] or [a&&b]: Java union/intersection; the browser reads it literally
  | 'JAVA_ONLY_ESCAPE' // \Q \E \A \Z \z \G \h \H \R \X \p \P \e \a \v and other letter escapes

// escapes that mean the same thing on both engines
const SHARED_LETTER_ESCAPES = new Set(['d', 'D', 'w', 'W', 's', 'S', 'b', 'B', 'n', 'r', 't', 'f', 'x', 'u', 'c'])

export function regexPortabilityProblem(pattern: string): PortabilityProblem | null {
  let inClass = false
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]

    if (c === '\\') {
      const next = pattern[i + 1]
      if (next !== undefined && /[A-Za-z]/.test(next) && !SHARED_LETTER_ESCAPES.has(next)) return 'JAVA_ONLY_ESCAPE'
      i++ // skip the escaped character
      continue
    }

    if (inClass) {
      if (c === '[') return 'CLASS_SET_OPERATION'
      if (c === '&' && pattern[i + 1] === '&') return 'CLASS_SET_OPERATION'
      if (c === ']') inClass = false
      continue
    }

    if (c === '[') {
      inClass = true
      // a ']' right after '[' or '[^' is a literal, not the end of the class
      if (pattern[i + 1] === '^') i++
      if (pattern[i + 1] === ']') i++
      continue
    }

    if (c === '(' && pattern[i + 1] === '?') {
      const kind = pattern[i + 2]
      if (kind === '>') return 'ATOMIC_GROUP'
      if (kind !== undefined && /[A-Za-z-]/.test(kind)) return 'INLINE_FLAGS'
      continue
    }

    // a quantifier followed by '+' is possessive
    if ((c === '*' || c === '+' || c === '?' || c === '}') && pattern[i + 1] === '+') {
      // but '(?' is a group opener, not a quantifier
      if (c === '?' && pattern[i - 1] === '(') continue
      return 'POSSESSIVE_QUANTIFIER'
    }
  }
  return null
}
