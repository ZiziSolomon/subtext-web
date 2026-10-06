/**
 * Case-insensitive "contains", matching Kotlin's String.contains(other, ignoreCase = true) on the
 * phone: characters are compared one UTF-16 unit at a time, equal if identical, or equal after
 * upper-casing, or after lower-casing. JavaScript's own case mapping can turn one character
 * into two ("ß" → "SS", "İ" → "i̇"), which Kotlin's per-character mapping never does, so
 * those cases fall back to the single-character mapping Java uses.
 */
export function containsIgnoreCase(text: string, needle: string): boolean {
  if (needle.length === 0) return true
  outer: for (let start = 0; start + needle.length <= text.length; start++) {
    for (let j = 0; j < needle.length; j++) {
      if (!charsEqualIgnoreCase(text[start + j], needle[j])) continue outer
    }
    return true
  }
  return false
}

function charsEqualIgnoreCase(a: string, b: string): boolean {
  if (a === b) return true
  const upperA = upperChar(a)
  const upperB = upperChar(b)
  if (upperA === upperB) return true
  return lowerChar(upperA) === lowerChar(upperB)
}

// Java has single-character mappings where JavaScript only exposes the full (multi-character) one
const SIMPLE_LOWER: Record<string, string> = { 'İ': 'i' }

function upperChar(c: string): string {
  const upper = c.toUpperCase()
  return upper.length === 1 ? upper : c
}

function lowerChar(c: string): string {
  const simple = SIMPLE_LOWER[c]
  if (simple) return simple
  const lower = c.toLowerCase()
  return lower.length === 1 ? lower : c
}
